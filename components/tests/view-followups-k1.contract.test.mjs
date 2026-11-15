import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

// The view set's follow-ups of the ui-pro admin set K-1 (2026-11-15): the
// bulk band's Apply speaks danger (C116 (4), C13), the view's menus draw ⋯
// (C155 (2), TL-1), a right click opens a row's menu at the pointer and a
// list row has the same menu gestures as a table row (C164 (1)(2)). The
// browser checks are in the evidence probe; these keep the shape of the source.
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('sf-view: Apply over a deleting action is status danger, never the former error', async () => {
  const source = await read('src/smart/view/index.js');
  const band = source.slice(source.indexOf('    _renderBulkBand() {'), source.indexOf('    applyBulkAction() {'));
  assert.match(band, /if \(danger\) apply\.setAttribute\("status", "danger"\);/);
  assert.doesNotMatch(band, /setAttribute\("status", "error"\)/);
  // The same rule as SIMAI Framework sf-pagination 1.6.0 (isDestructiveAction).
  assert.match(band, /_bulkDestructive\(item\) \{\n\s*return Boolean\(item\) && \(item\.danger === true \|\| \/\^\(delete\|remove\|destroy\|trash\)\\b\/iu\.test\(String\(item\.value \?\? item\.id \?\? ""\)\)\);/);
});

test('sf-view-table: no ⋮ (more_vert) is left; the view and template actions draw more_horiz', async () => {
  for (const path of ['src/smart/view-table/index.js', 'src/smart/view-table/js/templates/default.js']) {
    assert.doesNotMatch(await read(path), /more_vert/u, path);
  }
  const template = await read('src/smart/view-table/js/templates/default.js');
  assert.match(template, /icon="more_horiz"\n\s*aria-label="Действия с представлением"/);
});

test('sf-view-table: a right click opens the row menu at the pointer, the keys at the button', async () => {
  const source = await read('src/smart/view-table/index.js');
  assert.match(source, /function menuPointAt\(\{x, y\}\) \{[\s\S]*position: fixed; left: \$\{x\}px; top: \$\{y\}px; inline-size: 0; block-size: 0/);
  const grid = source.slice(source.indexOf('    bindGridKeys(table) {'), source.indexOf('    rowOfElement(element) {'));
  assert.match(grid, /this\.openRowMenuOf\(row, target, \{x: event\.clientX, y: event\.clientY\}\)/);
  const keys = source.slice(source.indexOf('    handleGridKeydown(event, table) {'), source.indexOf('    handleGridKeydown(event, table) {') + 1500);
  assert.match(keys, /if \(isMenuKey\(event\) && row\.parentElement\?\.tagName === "TBODY"\) \{\n\s*if \(this\.openRowMenuOf\(row, target\)\)/);
  const open = source.slice(source.indexOf('    async openRowMenu('), source.indexOf('    rowMenu() {'));
  // The point leaves when the menu closes, bound only once this opening is open.
  assert.match(open, /const opened = await menu\.toggleFor\(at\);\n\s*if \(menu\.isOpen\) menu\.addEventListener\("sf-menu-context-closed", \(\) => at\.remove\(\), \{once: true\}\);\n\s*else at\.remove\(\);/);
  // A host's own handler still gets the row's button as its anchor.
  assert.match(open, /this\._rowMenuContext = \{row, items, anchor, ids:/);
});

test('sf-view-table: a list row opens its menu on a right click, the context-menu key and Shift+F10', async () => {
  const source = await read('src/smart/view-table/index.js');
  const keydown = source.slice(source.indexOf('    handleRowKeydown(event, row) {'), source.indexOf('    handleRowKeydown(event, row) {') + 900);
  assert.match(keydown, /this\.isList && isMenuKey\(event\) && !keepsBrowserMenu\(event\?\.target\)/);
  assert.match(source, /this\.addEventListener\("contextmenu", this\._listContextMenu\);/);
  const list = source.slice(source.indexOf('    openListRowMenu(item, pointer = null) {'), source.indexOf('    handleGridKeydown(event, table) {'));
  assert.match(source, /const LIST_ROW_MENU_BUTTON = "\[data-sf-row-menu\], \.sf-table-list-menu button";/);
  assert.match(list, /item\.querySelector\(LIST_ROW_MENU_BUTTON\)/);
  assert.match(list, /only = folded \? \[\.\.\.quick, \.\.\.rest\] : rest;/);
  assert.match(source, /const keepsBrowserMenu = \(target\) => Boolean\(target\?\.closest\?\.\("a\[href\], input, textarea, select, \[contenteditable\]"\)\);/);
});
