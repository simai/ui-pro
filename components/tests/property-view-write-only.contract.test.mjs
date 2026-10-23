import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

// A write-only field (string:password, Framework field renderers) writes
// `undefined` when the person erases what they typed. The change is taken back,
// so a save carries nothing for the field: an empty value would clear the
// password the host keeps. changeField is the one place a change is recorded.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/smart/property-view/index.js'), 'utf8');

test('changeField takes a change back on undefined', () => {
  const start = source.indexOf('    changeField(field, value) {');
  assert.ok(start >= 0);
  const body = source.slice(start, source.indexOf('\n    }\n', start));
  assert.match(body, /if \(value === undefined\) this\.changed\.delete\(key\);\n\s+else this\.changed\.set\(key, value\);/u);
});

test('a save sends only the recorded changes', () => {
  assert.equal((source.match(/values: Object\.fromEntries\(this\.changed\)/gu) ?? []).length, 3);
});
