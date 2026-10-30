import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';

// The elevation rule of ui-source (contracts/elevation-shadow.json,
// tests/elevation-shadow.contract.test.mjs) over the package stylesheets: whatever
// floats takes its step's surface and shadow together, and a step shadow used
// alone is an exemption with a reason. The package exemption left the free contract
// with the component, so it is written here.
const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const PACKAGE = ['table', 'data-view', 'property-view', 'admin-menu', 'message-log', 'thread-list', 'change-confirm', 'chat-interlocutor', 'chat-composer', 'chat-message', 'chat-window', 'mail-library', 'mail-letters', 'mail-inspector'];
const exemptions = [
];

const files = (directory, pattern) => {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(resolve(root, dir), {withFileTypes: true})) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (pattern.test(entry.name)) found.push(path);
    }
  };
  walk(directory);
  return found;
};

test('elevation: a package component does not float on a step shadow alone', () => {
  const allowed = new Set(exemptions.map(({file, token}) => `${file} ${token}`));
  const used = new Set();
  const offenders = [];
  for (const path of PACKAGE.flatMap((name) => files(`src/smart/${name}`, /\.s?css$/u))) {
    const source = read(path);
    for (const [token] of source.matchAll(/--sf-ui-shadow-[1-5]\b/gu)) {
      const id = `${path} ${token}`;
      if (allowed.has(id)) used.add(id);
      else offenders.push(id);
    }
    for (const [, step] of source.matchAll(/--sf-elevation-([1-5])--shadow\b/gu)) {
      if (!source.includes(`--sf-elevation-${step}--surface`)) offenders.push(`${path}: step ${step} shadow without its surface`);
    }
  }
  assert.deepEqual(offenders, [], 'take --sf-elevation-N--shadow with --sf-elevation-N--surface, or exempt with a reason');
  for (const id of allowed) assert.ok(used.has(id), `${id}: exempt but no longer used; remove the exemption`);
  for (const {reason} of exemptions) assert.ok(reason.length > 40);
});
