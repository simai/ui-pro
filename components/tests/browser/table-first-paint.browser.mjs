#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// A table's first paint, frame by frame (owner, 2026-10-15, from a screen
// recording): before any answer it is its skeleton, never «Пока ничего нет»;
// and when its code and data come before its own stylesheet -- the Loader
// brings that separately -- no frame shows a data column squeezed to a
// letter's width, and the columns take their content widths once the sheet
// has come.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/featured-icon/css/featured-icon.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/empty-state/css/empty-state.css',
  'component/component/badges/css/badges.css', 'component/component/tags/css/tags.css', 'component/component/avatars/css/avatars.css',
  'component/component/tabs/css/tabs.css', 'smart/smart/tabs/css/tabs.css', 'component/component/context-menu/css/context-menu.css',
  'component/component/checkbox/css/checkbox.css', 'component/component/radio/css/radio.css', 'component/component/buttons/css/buttons.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js', 'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/input/js/input.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/tag/js/tag.js', 'smart/smart/radio/js/radio.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/badge/js/badge.js', 'smart/smart/avatar/js/avatar.js', 'smart/smart/empty-state/js/empty-state.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const tableSheet = styles.find((path) => path.endsWith('smart/smart/table/css/table.css'));

try {
  const page = await browser.newPage({viewport: {width: 1200, height: 800}});
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><body style="margin:0"><div style="width:1000px"><sf-table id="t" size="1/2"></sf-table></div></body></html>');
  // Everything but the table's own sheet.
  for (const path of styles.filter((one) => one !== tableSheet)) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-table'), null, {timeout: 8000});
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => ({
    empty: Boolean(document.querySelector('#t sf-empty-state')),
    state: document.querySelector('#t [data-state]')?.getAttribute('data-state') ?? null,
  }));
  if (before.empty || before.state !== 'loading') note({case: 'before any answer the table is loading, not empty', got: before});
  // Data, still without the table's sheet; every frame watched.
  await page.evaluate(() => {
    window.narrowest = Infinity;
    const watch = () => {
      for (const th of document.querySelectorAll('#t thead th[data-key]')) {
        if (['select', 'settings', 'actions'].includes(th.dataset.key)) continue;
        window.narrowest = Math.min(window.narrowest, th.getBoundingClientRect().width);
      }
      if (!window.stopWatch) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    const table = document.getElementById('t');
    table.setColumns(['Название', 'Код решения', 'Раздел', 'Связанное решение', 'Ответственный', 'Приоритет', 'Бюджет, ₽', 'Выпущено']
      .map((label, at) => ({key: `c${at}`, label, ...(at === 0 ? {role: 'title'} : {})})));
    table.setRows(Array.from({length: 10}, (_, row) => Object.fromEntries([['id', String(row)], ...Array.from({length: 8}, (_, at) => [`c${at}`, `Значение ${row}-${at}`])])));
  });
  await page.waitForTimeout(600);
  await page.addStyleTag({path: tableSheet});
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => {
    window.stopWatch = true;
    const widths = [...document.querySelectorAll('#t thead th[data-key]')].filter((th) => !['select', 'settings', 'actions'].includes(th.dataset.key))
      .map((th) => Math.round(th.getBoundingClientRect().width));
    return {narrowest: Math.round(window.narrowest), widths};
  });
  if (after.narrowest < 40) note({case: 'no frame squeezes a column to a letter', got: after});
  if (after.widths.some((width) => width < 80)) note({case: 'the columns take their content widths once the sheet has come', got: after});
  console.log(JSON.stringify({before, after}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('TABLE_FIRST_PAINT_OK');
