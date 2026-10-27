#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// The data-view and table defects the Framework documentation's fourth trial
// found (2026-10-16), measured on the built bytes:
//   1. the view's name is the author's aria-label, not the generic one;
//   2. a slotted table that draws its own toolbar gets no second one;
//   3. the page size in force is one of the sizes the pager offers;
//   4. no «Всего» before the first answer, nor over a failed list;
//   5. a row action the host's catalogue does not name gets a word, not its id;
//   6. SF.Preferences.remove() puts the host's columns back at once;
//   7. a refused list keeps none of the rows it had.
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
  'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js',
  'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js',
  'smart/smart/tag/js/tag.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const page = await browser.newPage();
const warnings = [];
page.on('console', (message) => { if (message.type() === 'warning') warnings.push(message.text()); });
await page.setContent(
  `<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
     <div style="width:900px">
       <sf-data-view id="named" aria-label="Статьи блога">
         <sf-table slot="content" id="named-table" preferences-key="trial-4"></sf-table>
         <sf-pagination slot="pagination" id="named-pages"></sf-pagination>
       </sf-data-view>
       <sf-data-view id="failing">
         <sf-table slot="content" toolbar="false"></sf-table>
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
    const named = document.getElementById('named');
    const pageRow = (view) => view.shadowRoot.querySelector('slot[name="pagination"]');
    // Before any port: nothing answered, nothing to count.
    const pagesBeforeAnswer = pageRow(named)?.hidden ?? null;
    let release;
    const held = new Promise((done) => { release = done; });
    named.setHostPort({
      version: '1.11.0', capabilities: [],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        await held;
        return {
          answer: 'applied', sequence: payload.sequence,
          data: {
            records: Array.from({length: 3}, (_, index) => ({
              id: String(index), name: `Статья ${index}`, email: `a${index}@x.ru`, revision: 'r1', actions: ['publish-later'],
            })),
            total: 3,
            columns: [{key: 'name', label: 'Название', role: 'title', width: 200}, {key: 'email', label: 'Почта', width: 200}],
            row_actions: [],
            echo: {search: '', filters: {}, sort: [], page: 1, per_page: 25},
          },
        };
      },
    });
    await wait(200);
    const pagesWhileLoading = pageRow(named)?.hidden ?? null;
    release();
    await wait(700);
    const pagesAfterAnswer = pageRow(named)?.hidden ?? null;
    const layoutLabel = named.shadowRoot.querySelector('[part="layout"]')?.getAttribute('aria-label') ?? null;
    const toolbar = named.shadowRoot.querySelector('[part="toolbar"]');
    const viewToolbarDrawn = toolbar ? !toolbar.hidden && getComputedStyle(toolbar).display !== 'none' : null;
    const pages = document.getElementById('named-pages');
    const pageSizes = pages.getAttribute('page-sizes');
    const rowText = document.querySelector('#named-table tbody tr')?.textContent ?? '';

    // 6. A person's arrangement, then removed from page code.
    const table = document.getElementById('named-table');
    const emailShown = () => [...table.querySelectorAll('thead th')].some((cell) => cell.textContent.includes('Почта'));
    const shownAtFirst = emailShown();
    table.setColumnSettings({email: {visible: false}}, 'column-settings');
    await wait(300);
    const shownWhileHidden = emailShown();
    window.SF.Preferences.remove('sf-table/trial-4');
    await wait(300);
    const shownAfterRemove = emailShown();

    // 7. Access withdrawn: the same list, refused.
    const rowsBeforeRefusal = document.querySelectorAll('#named-table tbody tr[data-row-id]').length;
    named.setHostPort({
      version: '1.11.0', capabilities: [],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {answer: 'refused', reason: 'forbidden', sequence: payload.sequence};
      },
    });
    await wait(700);
    const rowsAfterRefusal = document.querySelectorAll('#named-table tbody tr[data-row-id]').length;
    const pagesAfterRefusal = pageRow(named)?.hidden ?? null;

    // 4b. A failed list.
    const failing = document.getElementById('failing');
    failing.setHostPort({
      version: '1.11.0', capabilities: [],
      async raise(intent) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {answer: 'unavailable', reason: 'host-down'};
      },
    });
    await wait(700);
    return {
      pagesBeforeAnswer, pagesWhileLoading, pagesAfterAnswer,
      failingState: failing.getAttribute('data-state'), pagesOnError: pageRow(failing)?.hidden ?? null,
      layoutLabel, viewToolbarDrawn,
      tableToolbar: Boolean(table.querySelector('.sf-table-toolbar, [data-table-toolbar]')) || Boolean(table.shadowRoot?.querySelector?.('.sf-table-toolbar')),
      pageSizes, rowHasRawId: rowText.includes('publish-later'),
      shownAtFirst, shownWhileHidden, shownAfterRemove,
      rowsBeforeRefusal, rowsAfterRefusal, pagesAfterRefusal,
    };
  });

  if (m.layoutLabel !== 'Статьи блога') note({case: "the view's name is the author's aria-label", got: m.layoutLabel});
  if (m.viewToolbarDrawn !== false) note({case: 'a slotted table with its own toolbar gets no second one', got: m.viewToolbarDrawn});
  const sizes = String(m.pageSizes ?? '').split(',').map(Number);
  if (!sizes.includes(25)) note({case: 'the page size in force is offered by the pager', got: m.pageSizes, expected: 'page-sizes holding 25'});
  if (m.pagesBeforeAnswer !== true || m.pagesWhileLoading !== true || m.pagesAfterAnswer !== false) {
    note({case: 'no page row before the first answer, one after it', got: {before: m.pagesBeforeAnswer, loading: m.pagesWhileLoading, after: m.pagesAfterAnswer}});
  }
  if (m.failingState !== 'error' || m.pagesOnError !== true) note({case: 'no page row over a failed list', got: {state: m.failingState, hidden: m.pagesOnError}});
  if (m.rowHasRawId) note({case: 'an unnamed row action shows a word, not its id', got: 'publish-later in the row'});
  if (!warnings.some((text) => text.includes('publish-later'))) note({case: 'the host is told an action has no catalogue entry', got: warnings});
  if (m.shownAtFirst !== true || m.shownWhileHidden !== false || m.shownAfterRemove !== true) {
    note({case: "SF.Preferences.remove() puts the host's columns back at once", got: {first: m.shownAtFirst, hidden: m.shownWhileHidden, removed: m.shownAfterRemove}});
  }
  if (m.rowsBeforeRefusal !== 3 || m.rowsAfterRefusal !== 0 || m.pagesAfterRefusal !== true) {
    note({case: 'a refused list keeps none of its rows and no page row', got: {before: m.rowsBeforeRefusal, after: m.rowsAfterRefusal, pages: m.pagesAfterRefusal}});
  }
  console.log(JSON.stringify(m));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify({failures}, null, 1)); process.exit(1); }
console.log('DATA_VIEW_TRIAL_4_OK');
