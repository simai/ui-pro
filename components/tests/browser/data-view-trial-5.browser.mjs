#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// The data-view and table defects the Framework documentation's fifth trial
// found (2026-10-16), measured on the built bytes:
//   9.  after a settings conflict the next save goes against the layer's new
//       revision, not the stale one;
//   10. a preference that no longer names a column returns it to the host's
//       settings at once;
//   11. changeQuery({search}) from page code shows the search in the box;
//   12. a refused list offers no toolbar, selection or «Создать», and they
//       come back with the access;
//   13. the column search speaks the page's language;
//   and, found while describing the events: the port's sf-data-view-saved-view-intent
//   saves a shared view, and several templates saved at once are each saved.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css',
  'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js',
  'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/inputs/js/inputs.js',
  'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js',
  'smart/smart/tags/js/tags.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
     <div style="width:900px">
       <sf-data-view id="view">
         <sf-table slot="content" id="table" preferences-key="trial-5"></sf-table>
         <sf-pagination slot="pagination"></sf-pagination>
       </sf-data-view>
     </div>
   </body></html>`,
);
for (const path of styles) await page.addStyleTag({path}).catch(() => {});
for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
await page.waitForTimeout(900);

try {
  const unupgraded = await page.evaluate(() => ['sf-data-view', 'sf-table', 'sf-pagination']
    .filter((tag) => !customElements.get(tag)));
  if (unupgraded.length) throw new Error(`not defined on the page: ${unupgraded.join(', ')}`);

  const m = await page.evaluate(async () => {
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    const view = document.getElementById('view');
    const table = document.getElementById('table');
    const host = {revision: 1, refuse: false, saves: [], queries: 0};
    const rows = (search) => Array.from({length: 3}, (_, index) => ({id: String(index), name: `Статья ${index}`, email: `a${index}@x.ru`, revision: 'r1', actions: []}))
      .filter((row) => !search || row.name.includes(search));
    view.setHostPort({
      version: '1.11.0', capabilities: ['personal-column-settings', 'create-record', 'saved-views', 'shared-saved-views'],
      async raise(intent, payload) {
        if (intent === 'query.change') {
          host.queries += 1;
          if (host.refuse) return {answer: 'refused', reason: 'forbidden', sequence: payload.sequence};
          const search = payload.query?.search ?? '';
          const records = rows(search);
          return {
            answer: 'applied', sequence: payload.sequence,
            data: {
              records, total: records.length,
              columns: [{key: 'name', label: 'Название', role: 'title', width: 200}, {key: 'email', label: 'Почта', width: 200}],
              row_actions: [],
              column_settings: {layers: {personal: {revision: `p${host.revision}`, columns: {}}}, target: {kind: 'personal', revision: `p${host.revision}`}},
              echo: {search, filters: {}, sort: [], page: 1, per_page: 25},
            },
          };
        }
        if (intent === 'view.save' || intent === 'view.save_shared') {
          host.views = [...(host.views ?? []), [intent, payload.key]];
          return {answer: 'applied'};
        }
        if (intent === 'settings.save_personal') {
          host.saves.push(payload.base_revision);
          if (payload.base_revision !== `p${host.revision}`) return {answer: 'conflict', reason: 'stale-revision', current_revision: `p${host.revision}`, columns: {}};
          return {answer: 'applied'};
        }
        return {answer: 'applied'};
      },
    });
    await wait(800);

    // 9. Someone else saved: the layer is at p2 now, the view holds p1.
    host.revision = 2;
    const first = await view.saveColumnSettings({email: {width: 240}});
    await wait(700);
    const second = await view.saveColumnSettings({email: {width: 260}});
    const conflict = {first: first?.answer, second: second?.answer, saves: [...host.saves]};

    // 10. A preference names a column, then no longer does.
    const shown = () => [...table.querySelectorAll('thead th')].some((cell) => cell.textContent.includes('Почта'));
    window.SF.Preferences.preload({'sf-table/trial-5': {v: 1, columnSettings: {email: {visible: false}}}});
    await wait(300);
    const hiddenByPreference = !shown();
    window.SF.Preferences.preload({'sf-table/trial-5': {v: 1, columnSettings: {}}});
    await wait(300);
    const backWithoutIt = shown();

    // 11. Search set from page code.
    view.changeQuery({search: 'Статья 1'});
    await wait(700);
    const box = table.querySelector('sf-input[name="sf_table_search"]');
    const searchBox = box?.querySelector('input')?.value ?? box?.getAttribute('value') ?? null;
    const searchedRows = table.querySelectorAll('tbody tr[data-row-id]').length;

    // Shared view from page code; several templates at once.
    view.dispatchEvent(new CustomEvent('sf-data-view-saved-view-intent', {detail: {key: 'team', label: 'Команда'}}));
    table.dispatchEvent(new CustomEvent('sf-table-template-save', {bubbles: true, composed: true, detail: [{key: 'a', label: 'A'}, {key: 'b', label: 'B'}]}));
    await wait(400);
    const views = (host.views ?? []).map((entry) => entry.join(':'));

    // 12. Access withdrawn, then given back.
    const offered = () => ({
      toolbar: table.getAttribute('toolbar'), selectable: table.getAttribute('selectable'), creatable: table.getAttribute('creatable'),
      viewToolbar: (() => { const bar = view.shadowRoot.querySelector('[part="toolbar"]'); return bar ? !bar.hidden : null; })(),
      searchDrawn: Boolean(table.querySelector('sf-input[name="sf_table_search"]')),
    });
    host.refuse = true;
    view.refresh('access');
    await wait(700);
    const refused = offered();
    host.refuse = false;
    view.refresh('access');
    await wait(700);
    const restored = offered();

    // Every reason simai.dataview-port 1.12.0 lists has words of its own.
    const reasons = ['capability-not-provided', 'confirm_required', 'not-confirmed', 'port-not-connected', 'no-base-revision', 'record_invalid', 'forbidden', 'stale-revision'];
    const general = view._noticeText({answer: 'refused', reason: 'something-else'});
    const worded = reasons.map((reason) => [reason, view._noticeText({answer: 'refused', reason})]);

    // 13. The page's language.
    const columnSearch = table.text('columnSearchPlaceholder', 'column-search-placeholder');
    return {general, worded, views, conflict, hiddenByPreference, backWithoutIt, searchBox, searchedRows, refused, restored, columnSearch};
  });

  if (m.conflict.first !== 'conflict' || m.conflict.second !== 'applied' || m.conflict.saves.join() !== 'p1,p2') {
    note({case: 'after a conflict the next save goes against the new revision', got: m.conflict, expected: {first: 'conflict', second: 'applied', saves: 'p1,p2'}});
  }
  if (!m.hiddenByPreference || !m.backWithoutIt) note({case: "a column a preference no longer names returns to the host's settings", got: {hidden: m.hiddenByPreference, back: m.backWithoutIt}});
  if (m.searchBox !== 'Статья 1' || m.searchedRows !== 1) note({case: 'changeQuery({search}) shows the search in the box', got: {box: m.searchBox, rows: m.searchedRows}});
  if (m.refused.toolbar !== 'false' || m.refused.selectable !== 'false' || m.refused.creatable !== 'false' || m.refused.viewToolbar !== false || m.refused.searchDrawn) {
    note({case: 'a refused list offers no toolbar, selection or create', got: m.refused});
  }
  if (m.restored.toolbar === 'false' || m.restored.selectable !== 'true' || m.restored.creatable !== 'true' || !m.restored.searchDrawn) {
    note({case: 'they come back with the access', got: m.restored});
  }
  if (m.views.join() !== 'view.save_shared:team,view.save:a,view.save:b') note({case: 'a shared view from page code, and several templates at once', got: m.views});
  const unworded = m.worded.filter(([, text]) => !text || text === m.general || !/[а-я]/u.test(text)).map(([reason]) => reason);
  if (unworded.length || new Set(m.worded.map(([, text]) => text)).size !== m.worded.length) note({case: 'every reason the port lists has its own words', got: m.worded});
  if (m.columnSearch !== 'Поиск по полям') note({case: "the column search speaks the page's language", got: m.columnSearch});
  console.log(JSON.stringify(m));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify({failures}, null, 1)); process.exit(1); }
console.log('DATA_VIEW_TRIAL_5_OK');
