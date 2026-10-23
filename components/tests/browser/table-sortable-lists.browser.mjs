#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The table's lists are reordered with sf-sortable (owner, 2026-10-13): in the
// column settings a loose column dragged by its handle shows the silhouette
// where it will land, stays among the loose ones, and the new order applies and
// reaches the host.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'component/component/inputs/css/inputs.css',
  'component/component/context-menu/css/context-menu.css',
  'component/component/checkbox/css/checkbox.css',
  'component/component/tabs/css/tabs.css',
  'component/component/buttons/css/buttons.css', 'component/component/icon-buttons/css/icon-buttons.css',
  'component/component/icons/css/icons.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css', 'smart/smart/sortable/css/sortable.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js', 'smart/smart/buttons/js/buttons.js',
  'smart/smart/icon-buttons/js/icon-buttons.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/inputs/js/inputs.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/close/js/close.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/tags/js/tags.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/sortable/js/sortable.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

// Twenty-two fields, which is what makes the windows taller than the screen.
const FIELDS = Array.from({length: 22}, (_, index) => ({
  key: `f${index}`,
  label: `Поле ${index}`,
  filter: {enabled: true, control: 'text', defaultOperator: 'contains', operators: ['contains']},
}));

const open = async (height = 700) => {
  const page = await browser.newPage({viewport: {width: 1280, height}});
  await page.setContent(
    `<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
       <div style="width:1200px"><sf-table id="t"></sf-table></div></body></html>`,
  );
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(1100);
  await page.evaluate((fields) => {
    const table = document.getElementById('t');
    window.saved = [];
    table.addEventListener('sf-table-column-settings-change', (event) => {
      window.saved.push(JSON.parse(JSON.stringify(event.detail ?? {})));
    });
    table.setColumns(fields.map((field) => ({key: field.key, label: field.label})));
    table.setRows([{id: '1', f0: 'a', f1: 'b'}]);
    table.setFilterFields(fields);
  }, FIELDS);
  await page.waitForTimeout(500);
  return page;
};

const openWindow = async (page, label) => {
  // The control's host is display: contents, so the click goes to the real
  // button inside it; matching by aria-label on the host finds the control
  // whatever element the template wraps it in.
  const opened = await page.evaluate((name) => {
    // A control with visible text carries it in `text` and has no aria-label;
    // an icon-only one carries the name in aria-label. Match either.
    const host = [...document.querySelectorAll('#t sf-button, #t sf-icon-button')]
      .find((node) => node.getAttribute('aria-label') === name || node.getAttribute('text') === name);
    const control = host?.querySelector('button') ?? host;
    control?.click();
    return Boolean(control);
  }, label);
  if (!opened) throw new Error(`no control labelled ${label}`);
  await page.waitForTimeout(700);
  const surface = await page.evaluate(() => Boolean(document.querySelector('sf-context-menu .sf-table-context-menu')));
  if (!surface) throw new Error(`the window ${label} did not open`);
};

try {
  const page = await open(900);
  await openWindow(page, 'Настройки');
  await page.waitForTimeout(300);
  const lists = await page.evaluate(() => [...document.querySelectorAll('sf-context-menu sf-sortable')]
    .map((list) => ({group: list.getAttribute('group'), rows: list.querySelectorAll('[data-sf-sortable-item]').length})));
  const handle = page.locator('sf-context-menu [data-column-key="f2"] [data-sf-sortable-handle]').first();
  const target = page.locator('sf-context-menu [data-column-key="f5"]').first();
  const from = await handle.boundingBox();
  const onto = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + 20, {steps: 4});
  await page.mouse.move(from.x + from.width / 2, onto.y + onto.height * 0.75, {steps: 10});
  const during = await page.evaluate(() => {
    const holder = document.querySelector('sf-context-menu .sf-sortable-placeholder');
    const list = holder?.closest('sf-sortable');
    const order = list ? [...list.children].map((node) => (node === holder ? 'outline' : node.dataset.columnKey)).filter(Boolean) : [];
    return {silhouette: Boolean(holder), group: list?.getAttribute('group') ?? null, order};
  });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => {
    const table = document.getElementById('t');
    const loose = table.getColumns().filter((column) => !column.system).map((column) => column.key);
    return {order: loose.slice(0, 8), saved: window.saved.length};
  });
  console.log(JSON.stringify({lists, during, after}, null, 1));
  if (lists.length < 1 || !lists.every((list) => /^table-columns-(pinned|loose)$/u.test(list.group))) {
    note({case: 'lists', got: lists, expected: 'the column settings drawn as sf-sortable lists, pinned and loose'});
  }
  if (!during.silhouette || during.group !== 'table-columns-loose' || during.order.indexOf('outline') !== during.order.indexOf('f5') + 1) {
    note({case: 'silhouette', got: during, expected: 'an outline right after f5 in the loose list while dragging'});
  }
  const at = (key) => after.order.indexOf(key);
  if (!(at('f2') > at('f5')) || after.saved < 1) {
    note({case: 'order', got: after, expected: 'f2 after f5, and the change sent to the host'});
  }
  await page.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 1));
  process.exitCode = 1;
} else {
  console.log('TABLE_SORTABLE_LISTS_OK');
}
