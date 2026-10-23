#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// View preferences (owner, 2026-10-14; SF.Preferences), measured on the built
// bytes in a browser that keeps them between pages:
// - a sort the person chose is the first query's sort on the next page;
// - a column the person moved and a column they hid are so before the host
//   answers -- the first paint is the person's arrangement;
// - a host's value for the person wins over this browser's copy;
// - the gear's «Вид» tab sets the rows' density and alternate rows, kept for
//   this table, or for all the person's tables with «Для всех моих таблиц».
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
const context = await browser.newContext({viewport: {width: 1100, height: 800}});
await context.route('http://probe.test/**', (route) => route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body></body></html>'}));
const COLUMNS = [{key: 'name', label: 'Название', role: 'title'}, {key: 'city', label: 'Город'}, {key: 'code', label: 'Код'}];

const open = async ({preload = null} = {}) => {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('pageerror', error.message));
  await page.goto('http://probe.test/');
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
    ${preload ? `<script type="application/json" id="larena-view-preferences" data-sf-preferences>${JSON.stringify(preload)}</script>` : ''}
    <div style="width:1000px"><sf-data-view id="v" preferences-key="demo.list"><sf-table slot="content" id="t"></sf-table></sf-data-view></div></body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-data-view') && customElements.get('sf-table'), null, {timeout: 8000});
  // The page's own columns before any answer, as a host draws them.
  await page.evaluate((columns) => document.getElementById('t').setColumns(columns), COLUMNS);
  await page.waitForTimeout(300);
  return page;
};
const heads = (page) => page.evaluate(() => [...document.querySelectorAll('#t thead th[data-key]')].map((th) => th.dataset.key).filter((key) => ['name', 'city', 'code'].includes(key)));
const connect = (page) => page.evaluate((columns) => {
  window.queries = [];
  document.getElementById('v').setHostPort({
    version: '1.10.0', capabilities: [],
    async raise(intent, payload) {
      if (intent !== 'query.change') return {answer: 'applied'};
      window.queries.push(structuredClone(payload.query));
      return {answer: 'applied', sequence: payload.sequence, data: {records: [{id: '1', name: 'A', city: 'B', code: 'C'}], total: 1, columns,
        echo: {search: '', filters: {}, sort: payload.query.sort ?? [], page: 1, per_page: payload.query.per_page ?? 25}}};
    },
  });
}, COLUMNS);

try {
  // The first visit: the person sorts by code, moves «Код» first and hides «Город».
  const first = await open();
  await connect(first);
  await first.waitForTimeout(500);
  await first.evaluate(() => {
    const table = document.getElementById('t');
    table.dispatchEvent(new CustomEvent('sf-table-sort-change', {bubbles: true, composed: true, detail: {key: 'code', direction: 'desc'}}));
    table.patchColumnSettingsBatch({code: {order: -1}, city: {visible: false}}, 'column-settings');
  });
  await first.waitForTimeout(600);
  const arranged = await heads(first);
  const kept = await first.evaluate(() => JSON.parse(localStorage.getItem('sf-pref:sf-table/demo.list') ?? 'null'));
  await first.close();

  // The next page: before the host answers, the arrangement is already the person's.
  const next = await open();
  const painted = await heads(next);
  await connect(next);
  await next.waitForTimeout(500);
  const firstQuery = await next.evaluate(() => window.queries[0]);
  if (JSON.stringify(painted) !== JSON.stringify(arranged) || painted.includes('city')) {
    note({case: 'the first paint is the person\'s arrangement', got: {painted, arranged, kept}});
  }
  if (firstQuery?.sort?.[0]?.key !== 'code' || firstQuery.sort[0].direction !== 'desc') note({case: 'the first query has the person\'s sort', got: firstQuery});
  await next.close();

  // The host's value for this person wins over this browser's.
  const hosted = await open({preload: {'sf-table/demo.list': {v: 1, columnSettings: {city: {visible: true, order: -2}}, sort: [{key: 'name', direction: 'asc'}]}}});
  const hostedHeads = await heads(hosted);
  await connect(hosted);
  await hosted.waitForTimeout(500);
  const hostedQuery = await hosted.evaluate(() => window.queries[0]);
  // This browser hid «Город» and sorted by code; the host shows it and sorts by name.
  if (!hostedHeads.includes('city') || hostedQuery?.sort?.[0]?.key !== 'name') note({case: "the host's value wins", got: {hostedHeads, hostedQuery}});
  await hosted.close();
  // The gear's «Вид».
  const viewed = await open();
  await connect(viewed);
  await viewed.waitForTimeout(500);
  await viewed.evaluate(() => {
    const table = document.getElementById('t');
    const anchor = table.querySelector('thead th') ?? table;
    table.openContextMenu({currentTarget: anchor, target: anchor, preventDefault() {}, stopPropagation() {}}, {menu: 'table-settings'});
  });
  await viewed.waitForTimeout(600);
  const tabs = await viewed.evaluate(() => [...document.querySelectorAll('sf-context-menu .sf-context-menu-tabs [role="tab"]')].map((tab) => tab.textContent.trim()));
  await viewed.evaluate(() => [...document.querySelectorAll('sf-context-menu .sf-context-menu-tabs [role="tab"]')][1]?.click());
  await viewed.waitForTimeout(500);
  const pick = (selector) => viewed.evaluate((query) => {
    const host = document.querySelector(query);
    (host?.querySelector('input') ?? host?.querySelector('button') ?? host)?.click();
    return Boolean(host);
  }, selector);
  const panel = await viewed.evaluate(() => Boolean(document.querySelector('[data-table-view-settings]')));
  await pick('[data-view-density="compact"] sf-radio');
  await viewed.waitForTimeout(300);
  await pick('[data-view-option="stripes"] sf-checkbox');
  await viewed.waitForTimeout(300);
  const own = await viewed.evaluate(() => ({
    density: document.getElementById('t').getAttribute('data-sf-view-density'),
    stripes: document.getElementById('t').hasAttribute('data-sf-view-stripes'),
    kept: JSON.parse(localStorage.getItem('sf-pref:sf-table/demo.list') ?? 'null')?.view ?? null,
    padding: getComputedStyle(document.querySelector('#t tbody td')).paddingTop,
  }));
  await pick('[data-view-everywhere]');
  await viewed.waitForTimeout(200);
  await pick('[data-view-option="lines"] sf-checkbox');
  await viewed.waitForTimeout(300);
  const everywhere = await viewed.evaluate(() => ({
    general: JSON.parse(localStorage.getItem('sf-pref:sf-table/*') ?? 'null')?.view ?? null,
    lines: document.getElementById('t').hasAttribute('data-sf-view-lines'),
  }));
  if (tabs.join() !== 'Поля,Вид' || !panel) note({case: 'the gear has «Поля» and «Вид»', got: {tabs, panel}});
  // No hole under the tabs, and a way out on their row (owner, 2026-10-15).
  const head = await viewed.evaluate(() => {
    const menu = document.querySelector('sf-context-menu');
    const tabs = menu?.querySelector('.sf-context-menu-head');
    const first = menu?.querySelector('[data-table-view-settings] > *');
    return {gap: tabs && first ? Math.round(first.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom) : null,
      panels: menu?.querySelector('.sf-context-menu-head .sf-tabs-main-container')?.getBoundingClientRect().height ?? null,
      close: Boolean(menu?.querySelector('.sf-context-menu-close button'))};
  });
  if (head.gap === null || head.gap < 0 || head.gap > 16 || head.panels || !head.close) note({case: 'the tab row: no hole, no overlap, a close button', got: head});
  if (own.density !== 'compact' || !own.stripes || own.kept?.density !== 'compact' || own.kept?.stripes !== true) note({case: 'the view is set and kept for this table', got: own});
  if (everywhere.general?.lines !== true || !everywhere.lines) note({case: '«Для всех моих таблиц» keeps it for every table', got: everywhere});
  await viewed.evaluate(() => document.querySelector('sf-context-menu .sf-context-menu-close button')?.click());
  await viewed.waitForTimeout(300);
  const closed = await viewed.evaluate(() => !document.querySelector('sf-context-menu .sf-context-menu-head'));
  if (!closed) note({case: 'the close button closes the window'});
  await viewed.close();
  console.log(JSON.stringify({arranged, kept, painted, firstQuery, hostedHeads, hostedQuery, tabs, own, everywhere, head}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('VIEW_PREFERENCES_OK');
