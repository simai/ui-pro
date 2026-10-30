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
const PACKAGE = ['admin-menu', 'change-confirm', 'chat-composer', 'chat-interlocutor', 'chat-message', 'chat-window', 'data-view', 'mail-inspector', 'mail-letters', 'mail-structure', 'mail-library', 'message-log', 'property-view', 'table', 'thread-list'];
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

test('sf-data-view: its static markup is its skeleton, slotted as the first paint, in the shape of the data', () => {
  const component = describe(smart, 'data-view');
  assert.equal(component.manifest.settings['expected-columns']?.default, 4, 'expected-columns, the skeleton\'s shape');
  for (const example of component.examples) {
    const printed = readFileSync(exampleFiles(component, example).html, 'utf8');
    assert.match(printed, /<div slot="first-paint"[^>]*class="sf-data-view-skeleton[^"]*"[^>]*data-sf-static>/u, `${example.name}: the printed skeleton`);
    const rows = Number(example.settings?.['row-cap']) || 10;
    const columns = Number(example.settings?.['expected-columns']) || 4;
    const table = printed.match(/<div class="sf-data-view-skeleton-table">([\s\S]*?)<\/div><div class="sf-data-view-skeleton-list">/u)?.[1] ?? '';
    // The head and a row per row, a cell per expected column beside the chrome ones.
    const lines = table.split(/(?=<div>)/u).filter(Boolean);
    assert.equal(lines.length, rows + 1, `${example.name}: the head and ${rows} rows`);
    for (const line of lines) assert.equal((line.match(/<span>/gu) ?? []).length, columns, `${example.name}: ${columns} cells a row`);
    // The fake port answers that shape, so phase 3 checks the skeleton.
    const data = example.port.answers['query.change'].data;
    assert.equal(data.records.length, rows, `${example.name}: the port answers ${rows} rows`);
    assert.equal(data.columns.length, columns, `${example.name}: the port answers ${columns} columns`);
  }
  // Until the answer only the skeleton shows, before the code too.
  assert.match(readFileSync(join(smart, 'data-view', 'js', 'first-paint.css'), 'utf8'), /sf-data-view\[data-sf-awaiting\] > :not\(\[slot="first-paint"\]\) \{[^}]*display: none !important;/u);
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
  // sf-data-view is no scroll container: the page is its one scroll (owner,
  // 2026-10-15, table-one-scroll); its rows are what must hold.
  assert.doesNotMatch(readFileSync(join(smart, 'data-view', 'index.js'), 'utf8'), /:host \{[^}]*overflow/u);
  assert.match(css('property-view/js/templates/default.css'), /sf-property-view:not\(\[panel\]\),\s*sf-property-view\[full\] \{\s*\/\*[^*]*\*\/\s*display: block !important;\s*block-size: 100%;\s*overflow: auto;/u);
  assert.match(css('admin-menu/js/navigation/navigation.css'), /\.sf-admin-nav--skeleton \.sf-admin-nav-second \{\s*display: none;/u, 'the skeleton keeps one column on a phone');
  // Each such example puts the component in a region, as a page does.
  for (const [folder, names] of [['property-view', ['reference', 'full']], ['admin-menu', ['navigation-port']]]) {
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
