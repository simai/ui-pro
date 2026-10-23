#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// A table without rows says why (owner, 2026-10-14), measured on the built
// bytes with a stub host behind a data view. One sf-empty-state at the
// table's size, its reason taken from what the view knows:
// - refused → no access, no action;
// - unavailable → could not load, «Повторить» re-runs the load;
// - no rows with a search → nothing found, «Очистить поиск» empties it;
// - no rows otherwise → no data, «Создать» when the table may create, and the
//   create intent is the toolbar's;
// - a standalone table knows only no data and could not load.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/featured-icon/css/featured-icon.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/empty-state/css/empty-state.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/inputs/js/inputs.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/tags/js/tags.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/empty-state/js/empty-state.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1100, height: 900}});
page.on('pageerror', (error) => console.error('pageerror', error.message));
await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
  <div style="width:900px"><sf-data-view id="v" size="1/2"><sf-table slot="content" id="t"></sf-table></sf-data-view></div>
  <div style="width:900px"><sf-table id="alone" data-state="empty"></sf-table></div>
</body></html>`);
for (const path of styles) await page.addStyleTag({path}).catch(() => {});
for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
await page.waitForTimeout(900);

// The host's answer to the next query: refused, unavailable or rows.
const answerWith = (mode) => page.evaluate((next) => { window.mode = next; }, mode);
const brick = (id) => page.evaluate((host) => {
  const element = document.querySelector(`#${host} sf-empty-state`);
  if (!element) return null;
  return {kind: element.getAttribute('kind'), size: element.getAttribute('size'),
    title: element.querySelector('.sf-empty-state-title')?.textContent.trim(),
    actions: [...element.querySelectorAll('sf-button')].map((button) => button.getAttribute('text'))};
}, id);
const settle = () => page.waitForTimeout(500);

try {
  await page.evaluate(() => {
    window.raised = [];
    window.mode = 'empty';
    document.addEventListener('sf-table-create-intent', () => window.raised.push({intent: 'create-event'}));
    document.getElementById('v').setHostPort({
      version: '1.10.0', capabilities: ['create-record'],
      async raise(intent, payload) {
        window.raised.push({intent, search: payload?.query?.search ?? null});
        if (intent !== 'query.change') return {answer: 'applied'};
        if (window.mode === 'refused') return {answer: 'refused', reason: 'forbidden', sequence: payload.sequence};
        if (window.mode === 'unavailable') return {answer: 'unavailable', reason: 'down', sequence: payload.sequence};
        return {answer: 'applied', sequence: payload.sequence, data: {
          records: [], total: 0, columns: [{key: 'name', label: 'Название', role: 'title'}],
          echo: {search: payload.query.search ?? '', filters: {}, sort: [], page: 1, per_page: 25},
        }};
      },
    });
  });
  await settle();

  const none = await brick('t');
  if (!none || none.kind !== 'no-data' || none.size !== '1/2' || none.actions.join() !== 'Создать') note({case: 'no data', got: none});
  await page.evaluate(() => document.querySelector('#t sf-empty-state sf-button button')?.click());
  await page.waitForTimeout(200);
  const created = await page.evaluate(() => window.raised.some((one) => one.intent === 'create-event' || one.intent === 'view.create_record'));
  if (!created) note({case: '«Создать» is the toolbar create intent'});

  await page.evaluate(() => document.getElementById('v').changeQuery({search: 'zz'}, 'search'));
  await settle();
  const found = await brick('t');
  if (!found || found.kind !== 'nothing-found' || found.actions.join() !== 'Очистить поиск') note({case: 'nothing found', got: found});
  await page.evaluate(() => document.querySelector('#t sf-empty-state sf-button button')?.click());
  await page.waitForTimeout(900);
  const cleared = await page.evaluate(() => ({search: document.getElementById('v').query.search, last: window.raised.filter((one) => one.intent === 'query.change').pop()?.search}));
  const afterReset = await brick('t');
  if (cleared.search !== '' || cleared.last !== '' || afterReset?.kind !== 'no-data') note({case: 'the reset empties the search', got: {cleared, afterReset}});

  await answerWith('unavailable');
  await page.evaluate(() => document.getElementById('v').refresh('probe'));
  await settle();
  const failed = await brick('t');
  if (!failed || failed.kind !== 'error' || failed.actions.join() !== 'Повторить') note({case: 'could not load', got: failed});
  const before = await page.evaluate(() => window.raised.filter((one) => one.intent === 'query.change').length);
  await answerWith('refused');
  await page.evaluate(() => document.querySelector('#t sf-empty-state sf-button button')?.click());
  await settle();
  const retried = await page.evaluate(() => window.raised.filter((one) => one.intent === 'query.change').length);
  if (retried !== before + 1) note({case: '«Повторить» re-runs the load', got: {before, retried}});
  const denied = await brick('t');
  if (!denied || denied.kind !== 'no-access' || denied.actions.length) note({case: 'no access', got: denied});

  const alone = await brick('alone');
  if (!alone || alone.kind !== 'no-data' || alone.size !== '1') note({case: 'a standalone table', got: alone});
  console.log(JSON.stringify({none, found, afterReset, failed, denied, alone}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('TABLE_EMPTY_STATES_OK');
