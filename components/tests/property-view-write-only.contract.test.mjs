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
const source = readFileSync(resolve(root, 'src/smart/view-properties/index.js'), 'utf8');

test('changeField takes a change back on undefined', () => {
  const start = source.indexOf('    changeField(field, value) {');
  assert.ok(start >= 0);
  const body = source.slice(start, source.indexOf('\n    }\n', start));
  assert.match(body, /if \(value === undefined \|\| stored\) this\.changed\.delete\(key\);\n\s+else this\.changed\.set\(key, value\);/u);
});

// A control is drawn with the change it made, so it compares a later entry
// with that: a time put back to the one the record holds was written as a
// change (1.10.0). Back to the stored value is no change.
test('changeField takes a change back when the value is the stored one again', () => {
  const start = source.indexOf('    changeField(field, value) {');
  const body = source.slice(start + '    changeField(field, value) {'.length, source.indexOf('\n    }\n', start));
  const changeField = new Function('field', 'value', body);
  const view = {changed: new Map(), errors: new Map(), requestComponentUpdate() {}, changeField};
  const time = {key: 'remind', value: '09:30'};
  view.changeField(time, '10:15');
  assert.equal(view.changed.get('remind'), '10:15');
  view.changeField(time, '09:30');
  assert.equal(view.changed.has('remind'), false);
  // An empty field cleared again is no change; one with a value cleared is.
  view.changeField({key: 'ends', value: null}, null);
  assert.equal(view.changed.has('ends'), false);
  view.changeField(time, null);
  assert.equal(view.changed.get('remind'), null);
  // A field described without its value (a test, a host call) records as before.
  view.changeField({key: 'title'}, 'Совещание');
  assert.equal(view.changed.get('title'), 'Совещание');
  // A write-only field: what was typed is never its stored state.
  view.changeField({key: 'secret', value: {set: true}}, 'новый');
  assert.equal(view.changed.get('secret'), 'новый');
});

test('a save sends only the recorded changes', () => {
  // Every save takes its values from one place, and that place reads the
  // recorded changes alone -- less the fields a condition hides (port 1.14.0).
  assert.match(source, /_savedValues\(\) \{[\s\S]*?return Object\.fromEntries\(\[\.\.\.this\.changed\]\.filter\(/u);
  assert.equal((source.match(/const values = this\._savedValues\(\);/gu) ?? []).length, 2);
  assert.equal((source.match(/\n\s+values,\n/gu) ?? []).length, 3);
  assert.doesNotMatch(source, /values: Object\.fromEntries/u);
});
