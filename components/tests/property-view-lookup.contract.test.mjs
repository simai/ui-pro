import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

// A lookup field (port 1.14.0): chosen from a reference list the host keeps.
// Drawn by the renderer set; the component pages its candidates by source and
// limit, and never asks for a list that arrived inline.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const view = read('src/smart/property-view/index.js');

// 1.15.0 (group.load), 1.16.0 (mask, buttons) and 1.17.0 (html) are declared since; 1.14.0 stays accepted.
test('the component accepts port 1.14.0 and declares it', () => {
  assert.match(view, /const SUPPORTED_PORT_VERSIONS = \[[^\]]*"1\.13\.0", "1\.14\.0", "1\.15\.0", "1\.16\.0", "1\.17\.0"\];/u);
  const port = JSON.parse(read('src/smart/property-view/smart.manifest.json')).composition.declarative.host_port;
  assert.equal(port.version, '1.17.0');
  assert.ok(port.supported_versions.includes('1.14.0'));
  for (const version of port.supported_versions) assert.ok(view.includes(`"${version}"`), `${version} is accepted`);
});

test('the candidates are asked for by source and limit, of a host that reads them', () => {
  assert.match(view, /\.\.\.\(versionAtLeast\(this\.hostPort\?\.version, "1\.14\.0"\)\n\s+\? \{\.\.\.\(field\.source \? \{source: String\(field\.source\)\} : \{\}\), limit: OPTIONS_PAGE_LIMIT\}\n\s+: \{\}\),/u);
  assert.match(view, /const OPTIONS_PAGE_LIMIT = 20;/u);
});

test('a lookup is paged unless its list came inline', () => {
  assert.match(view, /const PAGED_TYPES = \["record", "relation", "user", "lookup"\];/u);
  const referenced = view.slice(view.indexOf('    _referenceFields(section, group) {'), view.indexOf('    editGroup(section, group) {'));
  assert.match(referenced, /\.filter\(\(field\) => !\(\(field\.propertyType \|\| field\.type\) === "lookup"\n\s+&& Array\.isArray\(field\.options\) && field\.options\.length > 0\)\);/u);
});

test('a lookup opens nothing in view: it is not a reference to a record', () => {
  const template = read('src/smart/property-view/js/templates/default.js');
  assert.match(template, /const reference = \['record', 'relation', 'user'\]\.includes\(field\.propertyType \|\| field\.type\)/u);
});
