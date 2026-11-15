import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-13: the admin's working area stood a step above its menu --
// 40px controls and 16/24 text beside 32px rows and 14/20. A data view takes
// size (1/2 or 1) and hands it to its table, page row and selection band; the
// table draws its own controls and rows at that step.

const table = readFileSync(new URL('../src/smart/view-table/index.js', import.meta.url), 'utf8');
const template = readFileSync(new URL('../src/smart/view-table/js/templates/default.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/smart/view-table/js/templates/default.css', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/smart/view/index.js', import.meta.url), 'utf8');

// The override and the two members it reads (controlSize, relativeSize):
// the slice runs from renderSmartElement to the end of relativeSize.
const from = table.indexOf('    renderSmartElement(type, props = {}) {');
const to = table.indexOf('\n    }\n', table.indexOf('    relativeSize(props) {')) + 7;
const override = table.slice(from, to).replace(/\n    get size\(\) \{[\s\S]*?\n    \}\n/u, '\n');
// The override names a former tag by its current one (canonicalTag of the
// Smart base); here every tag is current.
const context = vm.createContext({canonicalTag: (tag) => tag});
vm.runInContext(`class Base { renderSmartElement(type, props) { return props; } }
class Table extends Base { ${override} }
this.Table = Table;`, context);
const drawn = (attribute, props) => {
  const element = new context.Table();
  element.getAttribute = (name) => (name === 'size' ? attribute : null);
  return element.renderSmartElement('button', props);
};

test('a size of 1 becomes the host\'s size, or none without one; a size of its own is kept', () => {
  assert.equal(drawn('1/2', {size: '1'}).size, '1/2');
  assert.equal(drawn('1/2', {size: 1}).size, '1/2', 'a number counts');
  assert.equal(drawn('1/2', {size: '1/3'}).size, '1/3');
  assert.equal(drawn('1/2', {}).size, undefined, 'a badge keeps its own default');
  assert.equal(drawn('1', {size: '1'}).size, '1');
  // C22 (Larena, 2026-11-10): a host without a size leaves its controls
  // relative, so page density moves them.
  assert.equal('size' in drawn(null, {size: '1'}), false, 'no size without a host size');
  assert.equal(drawn(null, {size: '1/3'}).size, '1/3');
});

test('the table writes its step on what it draws and its rows follow', () => {
  assert.doesNotMatch(template, /\bsize="1"/u, 'no control in the template is fixed at 1');
  assert.doesNotMatch(table, /\bsize="1"/u, 'no control in the menus is fixed at 1');
  // A row is a control of its step (owner decision C146 (1)): 40 at 1, 32 at
  // 1/2, the head as tall as the rows.
  assert.match(css, /:is\(sf-view-table, sf-table\)\[size="1\/2"\] > \* \.table > :is\(thead, tbody\) > tr \{\s*block-size: var\(--sf-ui-1\\\/2--control-height\);/u);
});

test('the data view hands its own size to the table, the page row and the band, and none without one', () => {
  assert.match(view, /if \(this\.controlSize\) table\.setAttribute\("size", this\.controlSize\);\s*else table\.removeAttribute\?\.\("size"\);/u);
  assert.match(view, /if \(this\.controlSize\) this\.pagination\?\.setAttribute\?\.\("size", this\.controlSize\);\s*else this\.pagination\?\.removeAttribute\?\.\("size"\);/u);
  assert.match(view, /if \(node\.localName\.startsWith\("sf-"\)\) chosen\(node, "size", this\.controlSize\)/u);
  assert.doesNotMatch(view, /\bsize="1"/u, 'no control the view makes is fixed at 1');
  assert.match(view, /"chrome", "row-cap", "aria-label", "size"/u);
});
