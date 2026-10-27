#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// A refused list is «no access» only when it was refused for access (Larena
// acceptance on larena.test, 2026-10-22: a search longer than the host takes
// came back refused as query_invalid, the view drew «Нет доступа» and took the
// toolbar away, so the search could not be shortened without reloading).
// Measured on the built bytes with a stub host behind a data view whose
// slotted table draws its own toolbar:
// - the person types a search the host refuses as query_invalid with a
//   sentence → the error brick says the sentence as text, the toolbar and the
//   search field stay with what was typed, no no-access brick, no error notice;
// - the person shortens the search in the same field → the list comes back;
// - query_invalid without a sentence → «Запрос не выполнен», toolbar kept;
// - access_denied → the no-access brick and no toolbar, as before.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/featured-icon/css/featured-icon.css',
  'component/component/inputs/css/inputs.css',
  'component/component/buttons/css/buttons.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/empty-state/css/empty-state.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js', 'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/input/js/input.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/tag/js/tag.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/empty-state/js/empty-state.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const LIMIT = 40;
const TOO_LONG = `Строка поиска длиннее ${LIMIT} символов <b>сократите</b>`;
const LONG = 'длинный поиск '.repeat(5).trim();
const SHORT = 'длинный';
const search = 'sf-table#t sf-input[name=sf_table_search] input';

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1100, height: 900}});
page.on('pageerror', (error) => console.error('pageerror', error.message));
await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0">
  <div style="width:900px"><sf-data-view id="v" size="1/2"><sf-table slot="content" id="t"></sf-table></sf-data-view></div>
</body></html>`);
for (const path of styles) await page.addStyleTag({path}).catch(() => {});
for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
await page.waitForTimeout(900);

const settle = () => page.waitForTimeout(700);
const look = () => page.evaluate((selector) => {
  const view = document.getElementById('v');
  const table = document.getElementById('t');
  const element = table.querySelector('sf-empty-state');
  const title = element?.querySelector('.sf-empty-state-title');
  const input = document.querySelector(selector);
  const band = [...view.querySelectorAll(':scope > [slot="notice"] sf-toast')]
    .map((toast) => ({status: toast.getAttribute('status'), title: toast.getAttribute('heading')}));
  const notified = window.notified.splice(0);
  return {
    state: view.getAttribute('data-state'),
    kind: element?.getAttribute('kind') ?? null,
    title: title?.textContent.trim() ?? null,
    titleElements: title ? title.children.length : null,
    status: view.shadowRoot.querySelector('[part="status"]').textContent,
    tableToolbar: table.getAttribute('toolbar'),
    search: input ? {value: input.value, shown: input.getBoundingClientRect().width > 0} : null,
    rows: table.querySelectorAll('[data-row-id], tbody tr[data-id]').length,
    querySearch: view.query.search,
    errors: [...notified, ...band].filter((one) => one.status === 'error'),
  };
}, search);
const answerWith = (next) => page.evaluate((one) => { window.next = one; }, next);
const type = async (text) => {
  await page.fill(search, '');
  await page.click(search);
  await page.keyboard.type(text, {delay: 5});
  await settle();
};

try {
  await page.evaluate(() => {
    window.notified = [];
    if (typeof globalThis.SF?.notify === 'function') {
      const original = globalThis.SF.notify.bind(globalThis.SF);
      globalThis.SF.notify = (options) => { window.notified.push({status: options?.status, title: options?.title}); return original(options); };
    }
    window.next = null;
    document.getElementById('v').setHostPort({
      version: '1.12.0', capabilities: [],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        const search = String(payload.query?.search ?? '');
        if (window.next) return {...window.next, sequence: payload.sequence};
        if (search.length > 40) {
          return {answer: 'refused', reason: 'query_invalid', message: window.tooLong, sequence: payload.sequence};
        }
        return {answer: 'applied', sequence: payload.sequence, data: {
          records: [{id: 'a', name: 'Первая'}, {id: 'b', name: 'Вторая'}],
          columns: [{key: 'name', label: 'Название'}], total: 2,
          echo: {filters: {}, search, sort: [], page: 1, per_page: 25},
        }};
      },
    });
  });
  await page.evaluate((text) => { window.tooLong = text; }, TOO_LONG);
  await settle();
  await page.waitForSelector(search);

  await type(LONG);
  const refused = await look();
  if (refused.state !== 'error' || refused.kind !== 'error' || refused.title !== TOO_LONG || refused.titleElements !== 0
      || refused.status !== TOO_LONG || refused.tableToolbar === 'false' || !refused.search?.shown
      || refused.search.value !== LONG || refused.querySearch !== LONG || refused.errors.length) {
    note({case: 'refused for the query, with a sentence', got: refused});
  }

  // Shortened in the same field, without reloading.
  await page.fill(search, SHORT);
  await page.dispatchEvent(search, 'input');
  await settle();
  const shortened = await look();
  if (shortened.state !== 'populated' || shortened.kind !== null || shortened.tableToolbar === 'false' || shortened.querySearch !== SHORT) {
    note({case: 'the shortened search is answered', got: shortened});
  }

  await answerWith({answer: 'refused', reason: 'query_invalid'});
  await type(`${SHORT} ещё`);
  const plain = await look();
  if (plain.state !== 'error' || plain.title !== 'Запрос не выполнен' || plain.tableToolbar === 'false'
      || !plain.search?.shown || plain.errors.length) {
    note({case: 'refused for the query, without a sentence', got: plain});
  }

  await answerWith({answer: 'refused', reason: 'access_denied'});
  await page.evaluate(() => document.getElementById('v').refresh('probe'));
  await settle();
  const denied = await look();
  if (denied.kind !== 'no-access' || denied.tableToolbar !== 'false' || denied.search?.shown) {
    note({case: 'refused for access', got: denied});
  }

  console.log(JSON.stringify({refused, shortened, plain, denied}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('DATA_VIEW_QUERY_REFUSAL_OK');
