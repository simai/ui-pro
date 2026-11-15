import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

// The table's menus are on the table's step (owner remark 2026-11-15). The
// sizes are measured in a browser by tests/browser/table-menu-size.browser.mjs;
// these keep the shape of the source.
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('sf-view-table: the row menu takes the resolved size and the density on every opening', async () => {
  const source = await read('src/smart/view-table/index.js');
  assert.match(source, /import \{followDensity\} from "\.\.\/\.\.\/core\/js\/density\.js";/);
  assert.match(source, /get menuSize\(\) \{\n\s*return this\.size === "1\/2" \? "1\/2" : "1";\n\s*\}/);
  const open = source.slice(source.indexOf('    async openRowMenu('), source.indexOf('    rowMenu() {'));
  assert.match(open, /const menu = this\.rowMenu\(\);[\s\S]*menu\.setAttribute\("size", this\.menuSize\);\n\s*followDensity\(menu, this\);[\s\S]*return menu\.toggleFor\(anchor\);/);
  // Not at creation alone: rowMenu() writes neither.
  const create = source.slice(source.indexOf('    rowMenu() {'), source.indexOf('    rowMenu() {') + 1500);
  assert.doesNotMatch(create, /setAttribute\("size"/);
  // The menus the table draws take the resolved size, not the written attribute alone.
  assert.equal((source.match(/size=\$\{this\.menuSize\}/g) ?? []).length, 9);
  assert.doesNotMatch(source, /<sf-menu-context\s+size=\$\{this\.controlSize/);
});

test('sf-view-properties: its standard menu takes the panel size and density on every opening', async () => {
  const source = await read('src/smart/view-properties/index.js');
  assert.match(source, /import \{followDensity\} from "\.\.\/\.\.\/core\/js\/density\.js";/);
  const open = source.slice(source.indexOf('    async openStandardMenu('), source.indexOf('    viewProfileEntries()'));
  assert.match(open, /menu\.setAttribute\("size", this\.size\);\n\s*followDensity\(menu, this\);[\s\S]*return menu\.openFor\(anchor, \{align\}\);/);
});
