#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// A quiet revalidation (standard §18.4, stand 27 D2): the view knows its
// port's capabilities before the port -- from the port the page declared in
// the element (data-sf-port, §4.9) or printed beside its first answer -- so
// its first draw is final. Measured on the built bytes:
//   - declared port, printed answer, the port connects with the declared
//     capabilities and answers the same: no mutation in the toolbar or the row
//     block, no layout shift, one query.change, and it asks the printed query
//     (not the answer's echo, whose default sort differs);
//   - capabilities printed beside first-answer work the same way;
//   - a port that brings a capability more redraws the controls it affects,
//     never a row;
//   - a declared port without a printed answer: the view's first query is the
//     declared one.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js', 'smart/smart/tabs/js/tabs.js',
  'smart/smart/tag/js/tag.js', 'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const CAPS = ['row-actions', 'personal-column-settings', 'create-record'];
const QUERY = {filters: {}, search: '', sort: [], page: 1, per_page: 20};
const records = [1, 2, 3, 4].map((n) => ({id: String(n), revision: `r${n}`, title: `Запись ${n}`, state: 'Опубликована', actions: ['open']}));
const answer = {records, total: 4, revision: 'list-1', columns: [{key: 'title', label: 'Название'}, {key: 'state', label: 'Состояние'}],
  row_actions: [{id: 'open', label: 'Открыть'}],
  // The host's default sort, echoed: not the query the page printed.
  echo: {page: 1, per_page: 20, search: '', filters: {}, sort: [{key: 'title', direction: 'desc'}]}};
const declared = {port: 'simai.dataview-port', version: '1.12.0', url: '/port', capabilities: CAPS,
  first: {intent: 'query.change', payload: {query: QUERY}}};
const view = (id, {island = true, port = true, printed = true} = {}) => `<sf-data-view id="${id}" aria-label="Каталог">
  ${port ? `<script type="application/json" data-sf-port>${JSON.stringify(declared)}</script>` : ''}
  ${printed ? `<script type="application/json" data-sf-settings>${JSON.stringify({'first-answer': island ? answer : {...answer, capabilities: CAPS, query: QUERY}})}</script>` : ''}
  <sf-table slot="content" aria-label="Каталог"></sf-table>
  <sf-pagination slot="pagination" page-size="20" current="1" total="0"></sf-pagination></sf-data-view>`;

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1200, height: 900}});
await page.setContent(`<!doctype html><html class="theme-light"><body style="margin:0"><div style="width:1100px">
  ${view('declared')}${view('beside', {port: false, island: false})}${view('more')}${view('bare', {printed: false})}
</div></body></html>`);
for (const path of styles) await page.addStyleTag({path}).catch(() => {});
for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
await page.waitForTimeout(1500);

const connect = (id, capabilities) => page.evaluate(async ({id, capabilities, answer}) => {
  const view = document.getElementById(id);
  const table = view.querySelector('sf-table');
  const rows = table.querySelector('tbody');
  const toolbar = table.querySelector('.sf-table-toolbar');
  const mutations = {rows: 0, toolbar: 0, rowNodes: []};
  const observer = new MutationObserver((list) => {
    for (const record of list) {
      if (rows && (rows === record.target || rows.contains(record.target))) {
        mutations.rows += 1;
        mutations.rowNodes.push(`${record.type}:${record.attributeName ?? ''}:${record.target.nodeName}`);
      }
      if (toolbar && (toolbar === record.target || toolbar.contains(record.target))) mutations.toolbar += 1;
    }
  });
  observer.observe(table, {subtree: true, childList: true, attributes: true, characterData: true});
  let shift = 0;
  const shifts = new PerformanceObserver((list) => { for (const entry of list.getEntries()) shift += entry.value; });
  shifts.observe({type: 'layout-shift', buffered: false});
  const asked = [];
  view.setHostPort({version: '1.12.0', capabilities, raise: (intent, payload) => {
    asked.push({intent, query: payload.query});
    return new Promise((done) => setTimeout(() => done({answer: 'applied', sequence: payload.sequence, data: JSON.parse(JSON.stringify(answer))}), 120));
  }});
  await new Promise((done) => setTimeout(done, 700));
  observer.disconnect();
  shifts.disconnect();
  return {mutations, shift, asked, rowsDrawn: table.querySelectorAll('tbody tr[data-row-id]').length,
    rowActions: table.getAttribute('row-actions'), settingsMenu: table.getAttribute('settings-menu')};
}, {id, capabilities, answer});

try {
  const defined = await page.evaluate(() => ['sf-data-view', 'sf-table'].every((tag) => customElements.get(tag)));
  if (!defined) throw new Error('the list is not defined');
  // Before any port: the declared capabilities are drawn.
  const before = await page.evaluate(() => {
    const table = document.querySelector('#declared sf-table');
    return {rowActions: table.getAttribute('row-actions'), settingsMenu: table.getAttribute('settings-menu'), creatable: table.getAttribute('creatable')};
  });
  if (before.settingsMenu !== 'true' || before.creatable !== 'true') failures.push(`the declared capabilities are not drawn before the port: ${JSON.stringify(before)}`);

  for (const id of ['declared', 'beside']) {
    const quiet = await connect(id, CAPS);
    if (quiet.mutations.rows || quiet.mutations.toolbar || quiet.shift > 0) failures.push(`${id}: the revalidation is not quiet: ${JSON.stringify(quiet)}`);
    if (quiet.asked.length !== 1) failures.push(`${id}: ${quiet.asked.length} queries, not one`);
    else if (JSON.stringify(quiet.asked[0].query.sort) !== '[]' || quiet.asked[0].query.per_page !== 20) failures.push(`${id}: the revalidation asked ${JSON.stringify(quiet.asked[0].query)}, not the printed query`);
  }
  const more = await connect('more', [...CAPS, 'saved-views']);
  if (more.mutations.rows) failures.push(`a capability more touched the rows: ${JSON.stringify(more.mutations)}`);
  if (more.shift > 0) failures.push(`a capability more shifted the layout by ${more.shift}`);

  const bare = await connect('bare', CAPS);
  if (bare.asked.length !== 1 || JSON.stringify(bare.asked[0].query) !== JSON.stringify(QUERY)) failures.push(`without a printed answer the first query is not the declared one: ${JSON.stringify(bare.asked)}`);
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('data-view declared port: capabilities known before the port, a quiet revalidation of the printed query');
