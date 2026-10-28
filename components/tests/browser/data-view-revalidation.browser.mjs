#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The port's answer to the query a printed first answer already answered
// (stand 25, Larena's storage page: the printed list was drawn, then drawn
// again when the port answered, CLS 0.13 -> 0.23-0.32). Measured on the built
// bytes:
//   - the same answer (the same revision) touches nothing in the row block:
//     no mutation under the table's rows, and no layout shift;
//   - a changed answer is taken in place: only the changed row's nodes are
//     touched, the other rows keep theirs, no skeleton or loader between.
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

const COLUMNS = [{key: 'title', label: 'Название'}, {key: 'state', label: 'Состояние'}];
const records = (changed = false) => [1, 2, 3, 4].map((n) => ({
  id: String(n), revision: changed && n === 2 ? 'r2b' : `r${n}`,
  // The changed row keeps its length: a longer value would widen its column
  // and move the others by right.
  title: `Запись ${n}`, state: changed && n === 2 ? 'Снята' : 'Опубликована',
}));
const answer = (changed = false) => ({records: records(changed), total: 4, revision: changed ? 'list-2' : 'list-1',
  echo: {page: 1, per_page: 20, search: '', filters: {}, sort: []}, columns: COLUMNS});

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1000, height: 800}});
await page.setContent(
  `<!doctype html><html class="theme-light"><body style="margin:0">
     <div style="width:900px">
       <sf-data-view id="same" aria-label="Каталог">
         <script type="application/json" data-sf-settings>${JSON.stringify({'first-answer': answer(false)})}</script>
         <sf-table slot="content" aria-label="Каталог"></sf-table>
         <sf-pagination slot="pagination" page-size="20" current="1" total="0"></sf-pagination>
       </sf-data-view>
       <sf-data-view id="changed" aria-label="Каталог">
         <script type="application/json" data-sf-settings>${JSON.stringify({'first-answer': answer(false)})}</script>
         <sf-table slot="content" aria-label="Каталог"></sf-table>
         <sf-pagination slot="pagination" page-size="20" current="1" total="0"></sf-pagination>
       </sf-data-view>
     </div>
   </body></html>`,
);
for (const path of styles) await page.addStyleTag({path}).catch(() => {});
for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
await page.waitForTimeout(1200);

try {
  const unupgraded = await page.evaluate(() => ['sf-data-view', 'sf-table', 'sf-pagination'].filter((tag) => !customElements.get(tag)));
  if (unupgraded.length) throw new Error(`not defined on the page: ${unupgraded.join(', ')}`);

  const revalidate = (id, next) => page.evaluate(async ({id, next}) => {
    const view = document.getElementById(id);
    const rows = view.querySelector('sf-table tbody');
    if (!rows) return {error: 'no row block drawn from the printed answer'};
    const before = new Map([...rows.querySelectorAll('tr[data-row-id]')].map((row) => [row.dataset.rowId, row]));
    const mutations = [];
    const observer = new MutationObserver((list) => mutations.push(...list));
    observer.observe(view.querySelector('sf-table'), {subtree: true, childList: true, attributes: true, characterData: true});
    let shift = 0;
    const shifts = new PerformanceObserver((list) => { for (const entry of list.getEntries()) shift += entry.value; });
    shifts.observe({type: 'layout-shift', buffered: false});
    const states = [];
    view.addEventListener('sf-data-view-state', (event) => states.push(event.detail.state));
    view.setHostPort({version: '1.12.0', capabilities: [], raise: (intent, payload) => new Promise((done) => setTimeout(() => done({
      answer: 'applied', sequence: payload.sequence, data: next,
    }), 150))});
    await new Promise((done) => setTimeout(done, 600));
    observer.disconnect();
    shifts.disconnect();
    const rowOf = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest?.('tr[data-row-id]')?.dataset.rowId ?? null;
    // Mutations in the row block, by the row they fall in.
    const inRows = mutations.filter((record) => rows.contains(record.target) || record.target === rows);
    const after = new Map([...view.querySelectorAll('sf-table tbody tr[data-row-id]')].map((row) => [row.dataset.rowId, row]));
    return {
      rowMutations: inRows.length,
      touched: [...new Set(inRows.map((record) => rowOf(record.target) ?? '(block)'))],
      kept: [...before].filter(([key, row]) => after.get(key) === row).map(([key]) => key),
      sameBlock: view.querySelector('sf-table tbody') === rows,
      shift,
      states,
      state: view.records.find((record) => record.id === '2')?.state,
    };
  }, {id, next});

  const same = await revalidate('same', answer(false));
  if (same.error) throw new Error(same.error);
  if (same.rowMutations || !same.sameBlock || same.shift > 0) failures.push(`the same answer touched the rows: ${JSON.stringify(same)}`);
  if (same.states.includes('loading')) failures.push(`the same answer went through loading: ${JSON.stringify(same.states)}`);

  const changed = await revalidate('changed', answer(true));
  if (changed.error) throw new Error(changed.error);
  if (changed.state !== 'Снята') failures.push(`the changed answer was not taken: ${JSON.stringify(changed)}`);
  if (changed.touched.some((row) => row !== '2')) failures.push(`rows other than the changed one were touched: ${JSON.stringify(changed.touched)}`);
  if (['1', '3', '4'].some((key) => !changed.kept.includes(key)) || !changed.sameBlock) failures.push(`the unchanged rows were redrawn: ${JSON.stringify(changed)}`);
  if (changed.states.includes('loading') || changed.shift > 0) failures.push(`the changed answer showed a loader or shifted: ${JSON.stringify(changed)}`);
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('data-view revalidation: the same answer touches nothing, a changed one only its rows');
