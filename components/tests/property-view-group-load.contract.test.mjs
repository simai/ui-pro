import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

// sf-property-view on simai.property-view-port 1.15.0 (standard
// simai.smart-component 1.3.8 §4.9, §7.2.1): group.load behind the capability
// group-load, record.load once per revision without it. The behaviour both ways
// is measured on the built bytes by tests/browser/property-view-group-load;
// this holds the declarations and the payloads to the port.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const view = read('src/smart/property-view/index.js');
const port = JSON.parse(read('src/core/contracts/ports/simai.property-view-port/1.15.0/port.json'));
const body = (start) => {
  const at = view.indexOf(start);
  assert.ok(at >= 0, start);
  return view.slice(at, view.indexOf('\n    }\n', at));
};

// 1.16.0 (mask, buttons) is declared since; 1.15.0 and 1.14.0 stay accepted.
test('the view takes port 1.15.0 and 1.14.0', () => {
  const manifest = JSON.parse(read('src/smart/property-view/smart.manifest.json')).composition.declarative.host_port;
  assert.equal(manifest.version, '1.16.0');
  assert.ok(manifest.supported_versions.includes('1.14.0'));
  assert.ok(manifest.supported_versions.includes('1.15.0'));
  const component = JSON.parse(read('src/smart/property-view/component.json')).port;
  assert.equal(component.version, '1.16.0');
  assert.equal(component.contract, 'src/core/contracts/ports/simai.property-view-port/1.16.0/port.json');
});

test('group.load is asked only of a host that announces group-load', () => {
  assert.deepEqual(port.capabilities['group-load'].intents, ['group.load']);
  assert.match(body('    get readsByGroup() {'), /capabilities\?\.includes\("group-load"\)\) && this\.mode !== "create"/u);
  const load = body('    async load(reason = "requested") {');
  assert.match(load, /const answer = byGroup \? await this\._raise\("group\.load", \{/u);
  assert.match(load, /: await this\._raise\("record\.load", \{/u);
});

test('every group.load the view raises carries only what the port declares', () => {
  const declared = port.intents['group.load'].payload;
  const raised = [...view.matchAll(/this\._raise\("group\.load", \{([\s\S]*?)\}, \{stale/gu)].map((match) => match[1]);
  assert.equal(raised.length, 2, 'the first read and a section\'s group');
  for (const payload of raised) {
    const keys = [...payload.matchAll(/^\s+([a-z_]+)(?::|,)/gmu)].map((match) => match[1]);
    for (const key of declared.required) assert.ok(keys.includes(key), `group.load carries ${key}`);
    for (const key of keys) assert.ok(key in declared.properties, `group.load declares ${key}`);
  }
  assert.match(body('    async load(reason = "requested") {'), /group: null,\n\s+reason,/u);
  assert.match(body('    async _readGroup(section, group, reason) {'), /section,\n\s+group,\n\s+reason,/u);
});

test('one revision per record: group.save sends it, a conflict reads the shown groups again', () => {
  assert.match(body('    async saveGroup({confirm = null} = {}) {'), /revision: this\.record\?\.revision \?\? null,/u);
  assert.match(body('    async saveGroup({confirm = null} = {}) {'), /await this\._rereadAfterConflict\(answer\);/u);
  const reread = body('    async _rereadAfterConflict(answer) {');
  assert.match(reread, /this\._readShownGroups\("requested", \{force: true\}\)/u);
  assert.doesNotMatch(reread, /changed\.clear|editing = null/u, 'the input is kept');
  // A group read at another revision than the record's is read again when shown.
  assert.match(body('    _readShownGroups(reason = "started", {force = false} = {}) {'),
    /if \(!force && this\.groupReads\.get\(group\) === current\) continue;/u);
});

test('unknown-group reads the arrangement again, once per group and revision', () => {
  const read = body('    async _readGroup(section, group, reason) {');
  assert.match(read, /answer\.reason === "unknown-group"[\s\S]*?if \(this\.groupsRefused\.get\(group\) === refusedAt\) return answer;[\s\S]*?await this\.load\("requested"\);/u);
});
