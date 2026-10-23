import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-13: the admin's working area stood a step above its menu --
// 40px controls and 16/24 text beside 32px rows and 14/20. A data view takes
// size (1/2 or 1) and hands it to its table, page row and selection band; the
// table draws its own controls and rows at that step.

const table = readFileSync(new URL('../src/smart/table/index.js', import.meta.url), 'utf8');
const template = readFileSync(new URL('../src/smart/table/js/templates/default.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/smart/table/js/templates/default.css', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/smart/data-view/index.js', import.meta.url), 'utf8');

const override = table.slice(table.indexOf('    renderSmartElement(type, props = {}) {'), table.indexOf('    get size() {'));
const context = vm.createContext({});
vm.runInContext(`class Base { renderSmartElement(type, props) { return props; } }
class Table extends Base { ${override} }
this.Table = Table;`, context);
const drawn = (step, props) => {
  const element = new context.Table();
  Object.defineProperty(element, 'size', {value: step});
  return element.renderSmartElement('button', props);
};

test('a size of 1 becomes the table step; a size of its own or none is kept', () => {
  assert.equal(drawn('1/2', {size: '1'}).size, '1/2');
  assert.equal(drawn('1/2', {size: 1}).size, '1/2', 'a number counts');
  assert.equal(drawn('1/2', {size: '1/3'}).size, '1/3');
  assert.equal(drawn('1/2', {}).size, undefined, 'a badge keeps its own default');
  assert.equal(drawn('1', {size: '1'}).size, '1');
});

test('the table writes its step on what it draws and its rows follow', () => {
  assert.doesNotMatch(template, /\bsize="1"/u, 'no control in the template is fixed at 1');
  assert.doesNotMatch(table, /\bsize="1"/u, 'no control in the menus is fixed at 1');
  assert.match(css, /sf-table\[size="1\/2"\][^{]*\{\s*padding-block: var\(--sf-ui-1\\\/2--space-y\);/u);
});

test('the data view hands its step to the table, the page row and the band', () => {
  assert.match(view, /table\.setAttribute\("size", this\.size\)/u);
  assert.match(view, /this\.pagination\?\.setAttribute\?\.\("size", this\.size\)/u);
  assert.match(view, /if \(node\.localName\.startsWith\("sf-"\)\) chosen\(node, "size", this\.size\)/u);
  assert.match(view, /"chrome", "row-cap", "aria-label", "size"/u);
});
