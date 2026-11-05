#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Larena's sites list (2026-11-05): an sf-view-table written
// selectable="false" settings="false" actions="false" row-actions="false"
// inside an sf-view came back selectable="true" with a box in every row and a
// «≡» column, because the view wrote its own chrome over the host's word. At
// 1280 px the list draws its five columns and nothing else, and nothing runs
// past the page. Beside it, the settings column of a view whose host keeps no
// column settings and offers no row actions is not drawn either (it would
// open nothing), and comes back for a host whose records offer actions.
// Measured on the built bytes.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'component/component/badges/css/badges.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/button-icon/js/button-icon.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/tabs/js/tabs.js',
  'smart/smart/tag/js/tag.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/view-table/js/view-table.js',
  'smart/smart/view/js/view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  // Scripts added by path have no address for webpack's automatic publicPath;
  // that page error is the harness's, every other one is the component's.
  page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) note(`page error: ${error.message}`); });
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><body style="margin:0;padding:24px">
    <sf-view id="sites" aria-label="Сайты">
      <sf-view-table slot="content" selectable="false" settings="false" actions="false" row-actions="false"></sf-view-table>
    </sf-view>
    <sf-view id="plain" aria-label="Без действий"><sf-view-table slot="content"></sf-view-table></sf-view>
    <sf-view id="acting" aria-label="С действиями"><sf-view-table slot="content"></sf-view-table></sf-view>
  </body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-view') && customElements.get('sf-view-table')));

  await page.evaluate(async () => {
    const columns = [
      {key: 'name', label: 'Название', role: 'title', property_type: 'string'},
      {key: 'domain', label: 'Домен', property_type: 'string'},
      {key: 'lang', label: 'Язык', property_type: 'string'},
      {key: 'status', label: 'Состояние', property_type: 'choice', options: [
        {value: 'active', label: 'Работает', scheme: 'success'}, {value: 'draft', label: 'Черновик', scheme: 'neutral'}]},
      {key: 'created', label: 'Создан', property_type: 'date'},
    ];
    const rows = (actions) => Array.from({length: 6}, (_, i) => ({id: `s${i}`, name: `Сайт ${i + 1}`, domain: `site${i + 1}.example.ru`,
      lang: 'ru', status: i % 2 ? 'active' : 'draft', created: `2026-11-0${i + 1}`, revision: '1', ...(actions ? {actions} : {})}));
    const port = (capabilities, actions) => ({version: '1.12.0', capabilities, async raise(intent, payload) {
      if (intent !== 'query.change') return {answer: 'unavailable', reason: 'capability-not-provided'};
      const q = payload.query;
      return {answer: 'applied', sequence: payload.sequence, data: {columns, records: rows(actions), total: 6,
        ...(actions ? {row_actions: [{id: 'archive', label: 'В архив'}, {id: 'delete', label: 'Удалить', danger: true}]} : {}),
        echo: {filters_chosen: q.filters, filters: q.filters, filters_rejected: [], search: q.search, sort: q.sort, page: q.page, per_page: q.per_page}}};
    }});
    document.getElementById('sites').setHostPort(port([], null));
    document.getElementById('plain').setHostPort(port([], null));
    document.getElementById('acting').setHostPort(port(['row-actions'], ['archive', 'delete']));
  });
  await page.waitForFunction(() => ['sites', 'plain', 'acting'].every((id) => document.querySelectorAll(`#${id} sf-view-table tbody tr[data-row-id]`).length === 6));
  await page.waitForTimeout(400);

  const read = await page.evaluate(() => Object.fromEntries(['sites', 'plain', 'acting'].map((id) => {
    const table = document.querySelector(`#${id} sf-view-table`);
    const scroller = [...table.querySelectorAll('*')].find((node) => node.scrollWidth > 0 && /auto|scroll/u.test(getComputedStyle(node).overflowX)) ?? table;
    return [id, {
      selectable: table.selectable, selectableAttribute: table.getAttribute('selectable'), settingsAttribute: table.getAttribute('settings'),
      head: [...table.querySelectorAll('thead th')].map((th) => th.dataset.key ?? th.textContent.trim()),
      boxes: table.querySelectorAll('tbody tr sf-checkbox, tbody tr input[type="checkbox"]').length,
      menus: table.querySelectorAll('tbody td[data-key="settings"]').length,
      overflow: scroller.scrollWidth - scroller.clientWidth,
      right: Math.round(table.getBoundingClientRect().right),
    }];
  })));
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);

  const sites = read.sites;
  if (sites.selectable !== false || sites.selectableAttribute !== 'false') note(`the sites list is selectable: property ${sites.selectable}, attribute ${sites.selectableAttribute}`);
  if (sites.settingsAttribute !== 'false') note(`the sites list has settings="${sites.settingsAttribute}"`);
  if (JSON.stringify(sites.head) !== JSON.stringify(['name', 'domain', 'lang', 'status', 'created'])) note(`the sites list draws columns ${JSON.stringify(sites.head)}`);
  if (sites.boxes) note(`the sites list draws ${sites.boxes} row boxes`);
  if (sites.menus) note(`the sites list draws ${sites.menus} row menus`);
  if (sites.overflow > 1) note(`the sites list scrolls sideways by ${sites.overflow}px`);
  if (sites.right > 1280 - 24 + 1) note(`the sites list ends at ${sites.right}px, past the page's padding`);
  if (pageWidth > 1280) note(`the page is ${pageWidth}px wide at 1280`);

  // The view's own chrome still draws the boxes; the settings column has nothing to open.
  if (!read.plain.head.includes('select')) note(`a list the host left alone lost its boxes: ${JSON.stringify(read.plain.head)}`);
  if (read.plain.head.includes('settings') || read.plain.menus) note(`a list with no column settings and no row actions draws the settings column: ${JSON.stringify(read.plain.head)}`);
  // Records with actions are a row menu, and the column carries it.
  if (!read.acting.head.includes('settings') || read.acting.menus !== 6) note(`a list whose records offer actions has no row menus: ${JSON.stringify(read.acting.head)}, ${read.acting.menus}`);

  console.log(JSON.stringify({read, pageWidth}, null, 1));
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
