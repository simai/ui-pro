#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// One scroll on a list page (owner, 2026-10-15, from the approved prototype),
// measured on the built bytes with a data view on a long page:
// - the page is the only thing that scrolls up and down; the table has no
//   vertical scroll of its own;
// - scrolled, the toolbar holds the top and the head sits right under it;
// - a table wider than its box scrolls sideways inside itself, and the rail
//   at the bottom of the window follows it and moves it;
// - «Закреплять фильтр и шапку» off: both leave with the page.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/featured-icon/css/featured-icon.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/empty-state/css/empty-state.css',
  'component/component/tabs/css/tabs.css', 'smart/smart/tabs/css/tabs.css', 'component/component/context-menu/css/context-menu.css',
  'component/component/checkbox/css/checkbox.css', 'component/component/radio/css/radio.css', 'component/component/buttons/css/buttons.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/inputs/js/inputs.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/tags/js/tags.js', 'smart/smart/radio/js/radio.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/empty-state/js/empty-state.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1100, height: 700}});
await context.route('http://probe.test/**', (route) => route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body></body></html>'}));
const COLUMNS = Array.from({length: 12}, (_, at) => ({key: `c${at}`, label: `Колонка ${at}`, width: 180, ...(at === 0 ? {role: 'title'} : {})}));
// Values long enough that the columns' own widths add up to far more than the box.
const ROWS = Array.from({length: 60}, (_, row) => Object.fromEntries([['id', String(row)], ...COLUMNS.map((column) => [column.key, `${column.label} · строка ${row} · довольно длинное значение`])]));

try {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('pageerror', error.message));
  await page.goto('http://probe.test/');
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
    <div style="padding:20px;width:900px"><h1 style="margin:0 0 200px">Каталог</h1>
    <sf-data-view id="v"><sf-table slot="content" id="t"></sf-table></sf-data-view></div></body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-data-view') && customElements.get('sf-table'), null, {timeout: 8000});
  await page.evaluate(({columns, rows}) => {
    document.getElementById('v').setHostPort({
      version: '1.10.0', capabilities: [],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {answer: 'applied', sequence: payload.sequence, data: {records: rows, total: rows.length, columns,
          echo: {search: '', filters: {}, sort: [], page: 1, per_page: 100}}};
      },
    });
  }, {columns: COLUMNS, rows: ROWS});
  await page.waitForTimeout(1200);
  const look = () => page.evaluate(() => {
    const table = document.getElementById('t');
    const area = table.querySelector('.sf-table-scroll');
    const toolbar = table.querySelector('.sf-table-toolbar');
    const head = table.querySelector('thead');
    const rail = table.querySelector('.sf-table-rail');
    return {
      mode: area?.getAttribute('data-sf-vertical-scroll'),
      areaScrollsDown: area ? area.scrollHeight > area.clientHeight + 1 : null,
      pageScrolls: document.documentElement.scrollHeight > innerHeight,
      toolbar: toolbar ? Math.round(toolbar.getBoundingClientRect().top) : null,
      toolbarBottom: toolbar ? Math.round(toolbar.getBoundingClientRect().bottom) : null,
      head: head ? Math.round(head.getBoundingClientRect().top) : null,
      rail: rail ? {hidden: rail.hidden, bottom: Math.round(rail.getBoundingClientRect().bottom), left: rail.scrollLeft} : null,
      areaLeft: area?.scrollLeft ?? null,
    };
  });
  const before = await look();
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(200);
  const scrolled = await look();
  if (before.mode !== 'page' || before.areaScrollsDown || !before.pageScrolls) note({case: 'one scroll: the page', got: before});
  if (scrolled.toolbar !== 0 || Math.abs(scrolled.head - scrolled.toolbarBottom) > 1) note({case: 'the toolbar holds the top and the head sits under it', got: scrolled});
  if (!scrolled.rail || scrolled.rail.hidden || scrolled.rail.bottom !== 700) note({case: 'the sideways rail holds the bottom of the window', got: scrolled.rail});
  // The rail moves the table sideways, and the table moves the rail.
  const room = await page.evaluate(() => { const area = document.querySelector('#t .sf-table-scroll'); return area.scrollWidth - area.clientWidth; });
  if (room < 300) note({case: 'the table is wider than its box', got: room});
  await page.evaluate(() => { document.querySelector('#t .sf-table-rail').scrollLeft = 300; });
  await page.waitForTimeout(150);
  const moved = await look();
  await page.evaluate(() => { document.querySelector('#t .sf-table-scroll').scrollLeft = 120; });
  await page.waitForTimeout(150);
  const back = await look();
  if (moved.areaLeft !== 300 || back.rail?.left !== 120) note({case: 'the rail and the table scroll together', got: {moved, back}});
  // Off: they leave with the page.
  await page.evaluate(() => document.getElementById('t').setTableView({stickyHead: false}));
  await page.waitForTimeout(300);
  const off = await look();
  if (off.toolbar >= 0 || off.head >= 0) note({case: 'unpinned, the toolbar and the head leave with the page', got: off});
  console.log(JSON.stringify({before, scrolled, moved, back, off}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('TABLE_ONE_SCROLL_OK');
