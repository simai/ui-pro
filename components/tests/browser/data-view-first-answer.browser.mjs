#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// What a page that knows its list gives the view before the port (stand 25 D1,
// D8), measured on the built bytes:
//   - the skeleton draws the page the list asks for: the page row's printed
//     page-size (20), not a constant 10, and the first query asks for it too;
//   - a first answer printed in the view's data-sf-settings island is drawn at
//     once, without a skeleton and without a port; the port's answer to the
//     same query comes in the background, without a loading state, and
//     replaces it.
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

const records = (title) => [1, 2, 3].map((n) => ({id: String(n), revision: `r${n}`, title: `${title} ${n}`}));
const answer = (title) => ({records: records(title), total: 3, echo: {page: 1, per_page: 20, search: '', filters: {}, sort: []},
  columns: [{key: 'title', label: 'Название'}]});

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<!doctype html><html class="theme-light"><body style="margin:0">
     <div style="width:900px">
       <sf-data-view id="asks-twenty" aria-label="Список">
         <sf-table slot="content" aria-label="Список"></sf-table>
         <sf-pagination slot="pagination" page-size="20" current="1" total="0"></sf-pagination>
       </sf-data-view>
       <sf-data-view id="printed" aria-label="Каталог">
         <script type="application/json" data-sf-settings>${JSON.stringify({'first-answer': answer('Напечатанная')})}</script>
         <sf-table slot="content" aria-label="Каталог"></sf-table>
         <sf-pagination slot="pagination" page-size="20" current="1" total="0"></sf-pagination>
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

  // The skeleton: the head and a row per row of the page the list asks for.
  const skeleton = await page.evaluate(() => {
    const view = document.getElementById('asks-twenty');
    return {
      awaiting: view.hasAttribute('data-sf-awaiting'),
      lines: view.querySelectorAll(':scope > .sf-data-view-skeleton .sf-data-view-skeleton-table > div').length,
      perPage: view.query.per_page,
    };
  });
  if (!skeleton.awaiting) failures.push('the view without a port is not awaiting its first answer');
  if (skeleton.lines !== 21) failures.push(`the skeleton draws ${skeleton.lines - 1} rows for a page of 20`);
  if (skeleton.perPage !== 20) failures.push(`the first query asks for ${skeleton.perPage} rows, not the printed 20`);

  // The printed first answer: drawn at once, no skeleton, no port.
  const printed = await page.evaluate(() => {
    const view = document.getElementById('printed');
    return {
      awaiting: view.hasAttribute('data-sf-awaiting'),
      skeleton: view.querySelectorAll(':scope > [slot="first-paint"]').length,
      island: view.querySelectorAll(':scope > script[data-sf-settings]').length,
      state: view.getAttribute('data-state'),
      busy: view.getAttribute('aria-busy'),
      rows: view.table?.getTableData?.()?.rows?.length ?? 0,
      total: view.total,
    };
  });
  if (printed.awaiting || printed.skeleton) failures.push(`the printed answer left the skeleton up: ${JSON.stringify(printed)}`);
  if (printed.island) failures.push('the island stayed in the view');
  if (printed.state !== 'populated' || printed.rows !== 3 || printed.total !== 3) failures.push(`the printed answer is not drawn: ${JSON.stringify(printed)}`);
  if (printed.busy === 'true') failures.push('the printed answer is drawn busy');

  // The port connects: it is asked the same query, the rows stay usable (no
  // loading state) while it answers, and its answer replaces the printed one.
  const revalidation = await page.evaluate(async () => {
    const view = document.getElementById('printed');
    const asked = [];
    let release;
    const answered = new Promise((done) => { release = done; });
    view.setHostPort({
      version: '1.12.0', capabilities: [],
      raise(intent, payload) {
        asked.push({intent, query: payload.query, reason: payload.reason});
        return answered.then(() => ({answer: 'applied', sequence: payload.sequence, data: {
          records: [1, 2, 3].map((n) => ({id: String(n), revision: `r${n}b`, title: `Из порта ${n}`})),
          total: 3, echo: {page: 1, per_page: 20, search: '', filters: {}, sort: []}, columns: [{key: 'title', label: 'Название'}],
        }}));
      },
    });
    await new Promise((done) => setTimeout(done, 150));
    const pending = {state: view.getAttribute('data-state'), busy: view.getAttribute('aria-busy'),
      table: view.table?.getAttribute('data-state'), rows: view.table?.getTableData?.()?.rows?.length ?? 0};
    release();
    await new Promise((done) => setTimeout(done, 300));
    return {asked, pending, title: view.records[0]?.title, state: view.getAttribute('data-state')};
  });
  if (revalidation.asked.length !== 1 || revalidation.asked[0].intent !== 'query.change') {
    failures.push(`the port was asked ${JSON.stringify(revalidation.asked)}`);
  } else if (revalidation.asked[0].query.per_page !== 20) {
    failures.push(`the revalidation asked for ${revalidation.asked[0].query.per_page} rows, not the answer's 20`);
  }
  if (revalidation.pending.state === 'loading' || revalidation.pending.busy === 'true' || revalidation.pending.table === 'loading' || revalidation.pending.rows !== 3) {
    failures.push(`the printed rows went busy while the port revalidated: ${JSON.stringify(revalidation.pending)}`);
  }
  if (revalidation.title !== 'Из порта 1' || revalidation.state !== 'populated') failures.push(`the port's answer did not replace the printed one: ${JSON.stringify(revalidation)}`);
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('data-view first answer: the skeleton draws the asked page, a printed answer is drawn at once and revalidated in the background');
