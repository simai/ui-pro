#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// What the person saved in this browser wins over what the page printed
// (standard §4.9: the page must not guess; Larena on ui-519fa0814a02,
// 2026-10-29). The page cannot know a page size kept only in localStorage, so
// a declared port's `first` query and a printed answer's query are defaults,
// never the view's state. Measured on the built bytes, on a served page (the
// browser's storage needs an origin):
//   - saved page size 50, island first per_page 25: the view asks per_page 50
//     (one query, its own), and draws 50 rows -- never 25 first;
//   - saved page size 50 and a printed first answer of 25 rows: the printed
//     answer is not drawn (no flash of 25), the view asks 50 and draws 50;
//   - nothing saved: the view's first query is the declared one (an early call
//     the page started is then the view's own: one request), and a printed
//     answer is drawn and revalidated with the printed query.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
  'smart/smart/data-view/css/data-view.css',
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

const DEFAULTS = {filters: {}, search: '', sort: [], page: 1, per_page: 25};
const declared = {port: 'simai.dataview-port', version: '1.12.0', url: '/port', capabilities: [],
  first: {intent: 'query.change', payload: {query: DEFAULTS}}};
const columns = [{key: 'title', label: 'Название'}];
const rows = (count) => Array.from({length: count}, (_, at) => ({id: String(at + 1), revision: 'r', title: `Запись ${at + 1}`}));
const printed = {records: rows(25), total: 400, query: DEFAULTS, columns,
  echo: {page: 1, per_page: 25, search: '', filters: {}, sort: []}};
const view = (id, {island = true, answer = false} = {}) => `<sf-data-view id="${id}" aria-label="Каталог" preferences-key="probe.${id}">
  ${island ? `<script type="application/json" data-sf-port>${JSON.stringify(declared)}</script>` : ''}
  ${answer ? `<script type="application/json" data-sf-settings>${JSON.stringify({'first-answer': printed})}</script>` : ''}
  <sf-table slot="content" aria-label="Каталог"></sf-table>
  <sf-pagination slot="pagination" page-size="25" current="1" total="0"></sf-pagination></sf-data-view>`;

const failures = [];
const browser = await chromium.launch();
const load = async (saved) => {
  const page = await browser.newPage({viewport: {width: 1200, height: 900}});
  const html = `<!doctype html><html class="theme-light"><body style="margin:0"><div style="width:1100px">
    ${view('declared')}${view('printed', {island: false, answer: true})}</div></body></html>`;
  await page.route('https://probe.test/**', (route) => route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: html}));
  await page.addInitScript((saved) => {
    try {
      localStorage.clear();
      if (saved) for (const id of ['declared', 'printed']) localStorage.setItem(`sf-pref:sf-table/probe.${id}`, JSON.stringify({v: 1, pageSize: saved}));
    } catch {}
    // Every row count each view's table ever drew, by id.
    window.__drawn = {declared: [], printed: []};
    new MutationObserver(() => {
      for (const id of ['declared', 'printed']) {
        const count = document.querySelectorAll(`#${id} sf-table tbody tr[data-row-id]`).length;
        const seen = window.__drawn[id];
        if (count && seen.at(-1) !== count) seen.push(count);
      }
    }).observe(document, {subtree: true, childList: true});
  }, saved);
  await page.goto('https://probe.test/');
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-data-view') && customElements.get('sf-table')));
  await page.waitForTimeout(400);
  const result = await page.evaluate(async () => {
    const asked = {};
    for (const id of ['declared', 'printed']) {
      const view = document.getElementById(id);
      asked[id] = [];
      view.setHostPort({version: '1.12.0', capabilities: [], raise: (intent, payload) => {
        asked[id].push({intent, query: payload.query});
        const size = payload.query?.per_page ?? 25;
        return new Promise((done) => setTimeout(() => done({answer: 'applied', sequence: payload.sequence, data: {
          records: Array.from({length: size}, (_, at) => ({id: String(at + 1), revision: 'r', title: `Запись ${at + 1}`})),
          total: 400, columns: [{key: 'title', label: 'Название'}],
          echo: {page: 1, per_page: size, search: '', filters: {}, sort: []},
        }}), 150));
      }});
    }
    await new Promise((done) => setTimeout(done, 900));
    return {asked, drawn: window.__drawn};
  });
  await page.close();
  return result;
};

try {
  const saved = await load(50);
  for (const id of ['declared', 'printed']) {
    const queries = saved.asked[id].filter((one) => one.intent === 'query.change');
    if (queries.length !== 1 || queries[0].query.per_page !== 50) failures.push(`${id}, page size 50 saved: asked ${JSON.stringify(queries.map((one) => one.query))}`);
    if (saved.drawn[id].includes(25) || saved.drawn[id].at(-1) !== 50) failures.push(`${id}, page size 50 saved: rows drawn ${JSON.stringify(saved.drawn[id])}, not 50 alone`);
  }
  const fresh = await load(null);
  const declaredQueries = fresh.asked.declared.filter((one) => one.intent === 'query.change');
  if (declaredQueries.length !== 1 || JSON.stringify(declaredQueries[0].query) !== JSON.stringify(DEFAULTS)) {
    failures.push(`nothing saved: the declared view asked ${JSON.stringify(declaredQueries.map((one) => one.query))}, not the declared first query`);
  }
  const printedQueries = fresh.asked.printed.filter((one) => one.intent === 'query.change');
  if (printedQueries.length !== 1 || printedQueries[0].query.per_page !== 25) failures.push(`nothing saved: the printed view revalidated with ${JSON.stringify(printedQueries.map((one) => one.query))}`);
  if (fresh.drawn.printed[0] !== 25) failures.push(`nothing saved: the printed answer was not drawn first: ${JSON.stringify(fresh.drawn.printed)}`);
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('data-view saved state: the person\'s saved page size wins over a declared first query and a printed answer');
