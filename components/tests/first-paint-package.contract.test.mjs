import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {describe, exampleFiles} from '../scripts/first-paint-lib.mjs';
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
      const late = component.late.some((name) => name in (example.settings ?? {}));
      assert.equal(existsSync(files.skeleton), late, `${folder}/${example.name}: a skeleton exactly when the example gives late data`);
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
