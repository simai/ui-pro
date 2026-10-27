import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {describe, exampleFiles, givesLateData, sizeProblem} from '../scripts/first-paint-lib.mjs';
import {fillSkeleton} from '../scripts/first-paint-skeleton.mjs';

// The first paint of the package components (standard simai.smart-component
// 1.3.8 §5.4, gate 24): each example has its committed static markup, written
// by scripts/run-first-paint.mjs snapshot from the built bytes and checked by
// its `check` and `gate` modes. This holds what needs no browser: the files
// are there, and a skeleton.html is the element's own loading render.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const smart = join(root, 'src', 'smart');
const PACKAGE = ['admin-menu', 'change-confirm', 'data-view', 'message-log', 'property-view', 'table', 'thread-list'];
const inner = (html, tag) => html.replace(/<!--[\s\S]*?-->\n?/gu, '').trim()
  .replace(new RegExp(`^<${tag}[^>]*>`, 'u'), '').replace(new RegExp(`</${tag}>$`, 'u'), '')
  .replace(/>\s+</gu, '><').trim();

test('every example of every package component has its static markup and sheets', () => {
  for (const folder of PACKAGE) {
    const component = describe(smart, folder);
    assert.ok(existsSync(join(component.dir, 'static', 'sheets.json')), `${folder}: static/sheets.json`);
    for (const example of component.examples) {
      const files = exampleFiles(component, example);
      assert.ok(existsSync(files.html), `${folder}/${example.name}: ${files.html}`);
      // An explicitly empty list is data, the empty state: no skeleton for it.
      const late = givesLateData(component, example);
      assert.equal(existsSync(files.skeleton), late, `${folder}/${example.name}: a skeleton exactly when the example gives late data`);
      // The size gate of ui-source's snapshot tool, held here without a browser.
      for (const file of [files.html, files.skeleton].filter((one) => existsSync(one))) {
        assert.equal(sizeProblem(example, readFileSync(file).length), null, file);
      }
    }
  }
});

test('sf-property-view: skeleton.html is the loading render the element draws', () => {
  const component = describe(smart, 'property-view');
  const printed = readFileSync(exampleFiles(component, {name: 'reference'}).html, 'utf8');
  const example = component.examples.find((one) => one.name === 'reference');
  const filled = fillSkeleton(component, example.settings, readFileSync(component.skeletonFile, 'utf8'));
  assert.equal(inner(`<sf-property-view>${filled}</sf-property-view>`, 'sf-property-view'), inner(printed, 'sf-property-view'));
});

test('sf-data-view: its static markup is its skeleton, slotted as the first paint', () => {
  const component = describe(smart, 'data-view');
  for (const example of component.examples) {
    const printed = readFileSync(exampleFiles(component, example).html, 'utf8');
    assert.match(printed, /<div slot="first-paint"[^>]*class="sf-data-view-skeleton[^"]*"[^>]*data-sf-static>/u, `${example.name}: the printed skeleton`);
    const rows = Number(example.settings?.['row-cap']) || 10;
    const bars = (printed.match(/class="sf-skeleton-text /gu) ?? []).length;
    const chrome = example.settings?.chrome ?? 'toolbar pagination';
    const extra = ['toolbar', 'pagination'].filter((part) => chrome.split(/\s+/u).includes(part)).length;
    assert.equal(bars, rows + extra, `${example.name}: a bar per row and per chrome part`);
  }
});

test('the port-fed components give gate 24 a fake port, so phase 3 checks their data', async () => {
  const {portOf} = await import('../scripts/first-paint-lib.mjs');
  for (const folder of ['data-view', 'property-view']) {
    const component = describe(smart, folder);
    for (const example of component.examples) {
      const port = portOf(component, example);
      assert.ok(port, `${folder}/${example.name}: a port`);
      assert.equal(port.id, component.manifest.port.id);
      assert.ok(Object.keys(port.answers).length, `${folder}/${example.name}: answers`);
    }
  }
});

test('sf-table brings the cells it draws with other Smart elements with it, not after the rows', () => {
  const rule = readFileSync(join(smart, 'table', 'rule.js'), 'utf8');
  for (const name of ['cl-reference-link', 'cl-file-preview', 'cl-color']) {
    assert.match(rule, new RegExp(`\\{ name: "${name}" \\}`, 'u'), `${name} eager`);
  }
  const table = describe(smart, 'table');
  assert.ok(table.examples.some((one) => one.name === 'typed-cells'), 'an example with those cells');
});

test('a port-fed component holds its box: it fills its region and its data scrolls inside', () => {
  const css = (path) => readFileSync(join(smart, path), 'utf8');
  assert.match(css('table/js/templates/default.css'), /sf-data-view \{\s*display: block;\s*block-size: 100%;\s*overflow: auto;/u, 'sf-data-view, before its code');
  assert.match(readFileSync(join(smart, 'data-view', 'index.js'), 'utf8'), /:host \{ display: block; block-size: 100%; overflow: auto;/u, 'sf-data-view, its shadow layout');
  assert.match(css('property-view/js/templates/default.css'), /sf-property-view:not\(\[panel\]\),\s*sf-property-view\[full\] \{\s*\/\*[^*]*\*\/\s*display: block !important;\s*block-size: 100%;\s*overflow: auto;/u);
  assert.match(css('admin-menu/js/navigation/navigation.css'), /\.sf-admin-nav--skeleton \.sf-admin-nav-second \{\s*display: none;/u, 'the skeleton keeps one column on a phone');
  // Each such example puts the component in a region, as a page does.
  for (const [folder, names] of [['data-view', ['reference', 'open-record', 'embedded']], ['property-view', ['reference', 'full']], ['admin-menu', ['navigation-port']]]) {
    const component = describe(smart, folder);
    for (const name of names) assert.match(component.examples.find((one) => one.name === name).parent ?? '', /block-size: \d+rem/u, `${folder}/${name}`);
  }
});

test('sf-admin-menu over a navigation port prints its skeleton, never the empty items menu', () => {
  const admin = describe(smart, 'admin-menu');
  assert.deepEqual(admin.manifest.settings.source.values, ['items', 'port']);
  const example = admin.examples.find((one) => one.name === 'navigation-port');
  assert.equal(example.settings.source, 'port');
  const html = readFileSync(exampleFiles(admin, example).html, 'utf8');
  assert.match(html, /class="sf-admin-nav sf-admin-nav--skeleton" aria-busy="true"/u);
  assert.equal((html.match(/class="sf-admin-nav-item"/gu) ?? []).length, 12, 'six rows in each column');
});
