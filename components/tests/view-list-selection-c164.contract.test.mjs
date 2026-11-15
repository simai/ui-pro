import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

// One context-menu rule for the table and the list (C164 (3)): a right click,
// the context-menu key or Shift+F10 on a selected row acts on the whole
// selection («Выбрано N»); on a row outside it, that row becomes the
// selection first. Both layouts go through openRowContextMenu, which asks
// rowMenuTargets; the browser checks are in the evidence probe.
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('src/smart/view-table/index.js', root), 'utf8');
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));

test('sf-view-table: table and list rows share one context-menu path with the selection rule', () => {
  const table = between('    openRowMenuOf(rowElement, from, pointer = null) {', '    openListRowMenu(item, pointer = null) {');
  const list = between('    openListRowMenu(item, pointer = null) {', '    openRowContextMenu(rowElement, row, rowSelector, place, pointer = null) {');
  const shared = between('    openRowContextMenu(rowElement, row, rowSelector, place, pointer = null) {', '    handleGridKeydown(event, table) {');
  assert.match(table, /return this\.openRowContextMenu\(rowElement, row, "tbody > tr\[data-row-id\]"/);
  assert.match(list, /return this\.openRowContextMenu\(item, row, "li\.sf-table-list-item\[data-row-id\]"/);
  for (const one of [table, list]) {
    assert.doesNotMatch(one, /this\.rowMenuTargets\(|this\.openRowMenu\(/, 'only the shared path opens the menu');
  }
  assert.equal((source.match(/this\.rowMenuTargets\(/g) ?? []).length, 1);
  assert.match(shared, /const \{ids, reselected\} = this\.rowMenuTargets\(row\);/);
  assert.match(shared, /\{ids, at: pointer \? menuPointAt\(pointer\) : null\}/);
  assert.match(shared, /if \(reselected\) \{\n\s*this\._rowMenuPending = key;\n\s*requestAnimationFrame\(open\);/);
});

test('sf-view-table: over several selected list rows the menu holds every common action', () => {
  const list = between('    openListRowMenu(item, pointer = null) {', '    openRowContextMenu(rowElement, row, rowSelector, place, pointer = null) {');
  assert.match(list, /only: ids\?\.length > 1 \? null : only,/);
  const open = between('    async openRowMenu(', '    rowMenu() {');
  assert.match(open, /if \(many\) entries\.unshift\(\{type: "heading", text: `\$\{this\.text\("selectedRowsHeading"\)\} \$\{ids\.length\}`\}\);/);
});
