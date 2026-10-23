import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

// sf-table names the row actions it draws itself -- the eye for «view», the
// pencil for «edit» -- in its constructor, and the view reads that catalogue to
// turn a record's action ids into controls. The read was
// `this._knownRowActions ??= table.ACTIONS_SETTINGS_ROW ?? []`.
//
// The view's own fallback table stands in its shadow template, so it is in the
// tree before sf-table is defined, and an element that has not upgraded carries
// no ACTIONS_SETTINGS_ROW: `[]` was cached, and `??=` never looked again,
// because `[]` is not nullish. From then on every id was unknown -- the warning
// fired and «view» came out as a generic word instead of the eye, on every list
// (Larena storage QA, 2026-10-22, finding 7).
//
// Looking again is not enough by itself: the projection writes its own narrowed
// list onto the same property, so a second read could take that list for the
// catalogue. Both halves are checked here.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const source = read('src/smart/data-view/index.js');

const method = (signature, next) => {
  const [, rest] = source.split(`    ${signature} {`);
  assert.ok(rest, `${signature}: without it the catalogue is still read once and never again`);
  return rest.split(`\n    ${next}`)[0].trim().replace(/\}\s*$/u, '');
};

const captureRowActions = new Function('table', method('_captureRowActions(table)', '// Waited for once'));

// What sf-table's constructor names, as the view sees it.
const catalogue = [
  {id: 'edit', name: 'Edit', component: {type: 'icon-button', props: {icon: 'edit'}}},
  {id: 'view', name: 'View', component: {type: 'icon-button', props: {icon: 'visibility'}}},
];

const view = () => ({
  awaited: 0,
  _awaitRowActions() { this.awaited += 1; },
  _captureRowActions: captureRowActions,
});

test('a list in the tree before sf-table is defined still gets the eye and the pencil', () => {
  const owner = view();
  // The fallback table from the shadow template: present, not upgraded, so it
  // carries nothing to read.
  const table = {};
  assert.deepEqual(owner._captureRowActions(table), [], 'there is nothing to capture yet');
  assert.equal(owner.awaited, 1, 'and the definition is waited for, so the view draws again');

  // The projection writes its own narrowed list on the same property.
  const narrowed = [{id: 'record.view', name: 'View'}];
  table.ACTIONS_SETTINGS_ROW = narrowed;
  owner._projectedRowActions = narrowed;
  assert.deepEqual(owner._captureRowActions(table), [], 'the view’s own list is not the catalogue');

  // sf-table upgrades: its constructor names the catalogue, and the capture
  // that used to be stuck on `[]` for ever finds it.
  table.ACTIONS_SETTINGS_ROW = catalogue;
  assert.deepEqual(owner._captureRowActions(table), catalogue, 'the catalogue is captured once it exists');
});

test('a later narrowed list never overwrites the catalogue', () => {
  const owner = view();
  const table = {ACTIONS_SETTINGS_ROW: catalogue};
  assert.deepEqual(owner._captureRowActions(table), catalogue);
  assert.equal(owner.awaited, 0, 'an upgraded element is read straight away');

  // One record may allow one action, which is all the projection writes back.
  const narrowed = [catalogue[1]];
  table.ACTIONS_SETTINGS_ROW = narrowed;
  owner._projectedRowActions = narrowed;
  assert.deepEqual(owner._captureRowActions(table), catalogue, 'the catalogue outlives a narrowed projection');
  assert.equal(owner.awaited, 0);
});

test('the capture is written where the projection can reach it, and the old shape is gone', () => {
  assert.doesNotMatch(source, /_knownRowActions\s*\?\?=/u, 'the once-and-never-again read is gone');
  assert.match(source, /const known = this\._captureRowActions\(table\);/u);
  // The guard is the identity of the list this view wrote, so it has to be
  // remembered where it is written.
  assert.match(
    source,
    /table\.ACTIONS_SETTINGS_ROW = listed;[\s\S]{0,200}?this\._projectedRowActions = listed;/u,
    'the projected list is remembered beside the write',
  );
  assert.match(source, /customElements\?\.whenDefined\?\.\("sf-table"\)/u, 'the definition is what is waited for');
});

test('an id the host never named is still reported and still gets a word', () => {
  // Only the empty-cache case changes. A host whose record actions are
  // namespaced (record.view, record.edit) names them in its own catalogue, and
  // an id named by neither the host nor the table stays a warning and a
  // fallback -- it is not silently drawn as something it is not.
  assert.match(
    source,
    /const found = known\.find\(\(action\) => action\.id === id\);\s*if \(found\) return found;\s*console\.warn\(/u,
    'the table catalogue is consulted first, and an unknown id is still reported',
  );
  assert.match(source, /row action «\$\{id\}» has no row_actions entry/u);
  assert.match(
    source,
    /const label = pageText\(DATA_VIEW_TEXT, "unnamedAction", this\);/u,
    'and the fallback is still a word rather than a raw id',
  );
});
