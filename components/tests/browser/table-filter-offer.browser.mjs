#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// The table offers «Фильтр» only when there is something to filter by: fields
// the host gave, saved templates, or a filter already on. Without them the
// button opened a panel of templates and fields with no value to set
// (documentation trial 6; owner and Larena, 2026-10-18).
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
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/close/js/close.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/tag/js/tag.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

// Twenty-two fields, which is what makes the windows taller than the screen.
const page = await browser.newPage({viewport: {width: 1280, height: 700}});
try {
  await page.setContent(
    `<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
       <div style="width:1200px"><sf-table id="t"></sf-table></div></body></html>`,
  );
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(1100);
  const offered = () => page.evaluate(() => Boolean(
    [...document.querySelectorAll('#t .sf-table-toolbar sf-button, #t .sf-table-list-filter')]
      .some((node) => node.matches('.sf-table-list-filter') || node.getAttribute('icon-start') === 'filter_list')));
  await page.evaluate(() => {
    const table = document.getElementById('t');
    table.setColumns([{key: 'name', label: 'Название'}, {key: 'status', label: 'Статус'}]);
    table.setRows([{id: '1', name: 'a', status: 'b'}]);
  });
  await page.waitForTimeout(500);
  const without = await offered();
  await page.evaluate(() => document.getElementById('t').setFilterFields([
    {key: 'status', label: 'Статус', filter: {enabled: true, control: 'text', defaultOperator: 'contains', operators: ['contains']}},
  ]));
  await page.waitForTimeout(500);
  const withFields = await offered();
  await page.evaluate(() => document.getElementById('t').setFilterFields([]));
  await page.waitForTimeout(500);
  const withoutAgain = await offered();
  if (without || withoutAgain) note({case: 'no filter fields, no templates: no «Фильтр»', got: {without, withoutAgain}});
  if (!withFields) note({case: 'filter fields given: «Фильтр» is offered', got: {withFields}});
  console.log(JSON.stringify({without, withFields, withoutAgain}));
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('TABLE_FILTER_OFFER_OK');
