#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// The compact list (owner, 2026-10-12): below list-below the table draws its
// records as a list -- each its box, its title, the fields the columns'
// priority puts first, and its row menu -- under a toolbar of one line, and its
// filter opens as a sheet over the whole screen. Above it, the same table is a
// table.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = ['core/core/css/core.css', 'core/core/css/utility.full.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css'].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
].map((p) => join(out, p));

const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) {
  console.error(JSON.stringify({missingAssets: absent, root: out}, null, 2));
  throw new Error(`${absent.length} build asset(s) not found under ${out}`);
}

const failures = [];
const browser = await chromium.launch();
let report = {};
try {
  const page = await browser.newPage({viewport: {width: 375, height: 800}});
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<div id="box" style="inline-size:360px"><sf-table id="t" layout="auto" aria-label="Проба"></sf-table></div></body></html>');
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-table')));
  await page.evaluate(() => {
    const table = document.getElementById('t');
    table.setColumns([
      {key: 'title', label: 'Название', role: 'title'},
      {key: 'code', label: 'Код', priority: 2},
      {key: 'status', label: 'Статус', priority: 1},
      {key: 'owner', label: 'Ответственный', priority: 3},
      {key: 'updated', label: 'Обновлено', priority: 4, sortable: true},
    ]);
    table.setRows([
      {id: '1', title: 'Раз', code: 'one', status: 'В работе', owner: 'Анна', updated: '2026-10-01'},
      {id: '2', title: 'Два', code: 'two', status: 'Готово', owner: '', updated: '2026-10-02'},
    ]);
  });
  await page.waitForFunction(() => document.querySelectorAll('#t .sf-table-list-item').length === 2, null, {timeout: 8000}).catch(() => {});
  report = await page.evaluate(() => {
    const table = document.getElementById('t');
    const items = [...table.querySelectorAll('.sf-table-list-item')];
    const labels = items.map((item) => [...item.querySelectorAll('.sf-table-list-label')].map((label) => label.textContent.trim()));
    const toolbar = table.querySelector('.sf-table-toolbar--list');
    const row = toolbar?.firstElementChild;
    const tops = row ? [...row.children].map((child) => Math.round((child.firstElementChild ?? child).getBoundingClientRect().top)) : [];
    const box = toolbar?.getBoundingClientRect();
    const field = row?.querySelector('label.sf-search-input')?.getBoundingClientRect();
    return {
      isList: table.isList,
      listFields: table.getProp?.('listFields'),
      columns: table.getColumns().map((column) => `${column.key}:${column.visible}`),
      hasTable: Boolean(table.querySelector('table')),
      items: items.length,
      labels,
      select: items.every((item) => item.querySelector('.sf-table-list-select')),
      menu: items.every((item) => item.querySelector('.sf-table-list-menu')),
      oneLine: new Set(tops).size === 1,
      // The row of the toolbar stays inside the table: it overran it to the
      // left once, under the toolbar's wrap-reverse.
      inside: Boolean(box && row && row.getBoundingClientRect().left >= box.left - 1
        && row.getBoundingClientRect().right <= box.right + 1
        && [...row.children].every((child) => {
          const rect = (child.firstElementChild ?? child).getBoundingClientRect();
          return rect.width === 0 || (rect.left >= box.left - 1 && rect.right <= box.right + 1);
        })),
      boxes: {toolbar: box && [box.left, box.right], field: field && [field.left, field.right], row: row && [row.getBoundingClientRect().left, row.getBoundingClientRect().right]},
    };
  });
  // The same table above the threshold is a table again.
  report.wide = await page.evaluate(async () => {
    document.getElementById('box').style.inlineSize = '900px';
    await new Promise((settle) => setTimeout(settle, 400));
    const table = document.getElementById('t');
    return {isList: table.isList, hasTable: Boolean(table.querySelector('table'))};
  });
} finally {
  await browser.close();
}
if (!report.isList || report.hasTable) failures.push({said: 'a narrow table is not a list', report});
if (report.items !== 2) failures.push({said: 'the list does not hold every record', report});
if (JSON.stringify(report.labels) !== JSON.stringify([['Статус', 'Код', 'Ответственный'], ['Статус', 'Код']])) {
  failures.push({said: 'the fields are not the first by priority, or an empty one is shown', labels: report.labels});
}
if (!report.select || !report.menu) failures.push({said: 'a record has lost its box or its row menu', report});
if (!report.oneLine || !report.inside) failures.push({said: 'the toolbar is not one line inside the table', report});
if (report.wide?.isList || !report.wide?.hasTable) failures.push({said: 'a wide container still draws the list', wide: report.wide});
console.log(JSON.stringify({probe: 'table-list-layout', report, result: failures.length ? 'TABLE_LIST_FAIL' : 'TABLE_LIST_OK', failures}, null, 2));
if (failures.length) process.exit(1);
