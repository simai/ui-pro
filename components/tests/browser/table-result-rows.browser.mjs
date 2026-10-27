#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// A new result set moves no row it keeps (stand 25 D12: CLS 0.17 per search).
// Keyed by id alone, a row the search kept was moved to its new place, and the
// browser counted every kept row as a layout shift. Measured on the built
// bytes, with sf-table's setRows:
//   - reason "result" with a kept row at another index: the rows are drawn new
//     (no node of the old set stays), and no layout shift is recorded;
//   - reason "result" with the kept rows where they were (another page's
//     tail, a re-read): the rows are kept;
//   - any other reason keeps rows by id, as before (a patch, a continuation).
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css',
  'core/core/css/utility.full.css',
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
  'smart/smart/tag/js/tag.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
].map((p) => join(out, p));

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1000, height: 800}});
await page.setContent(`<!doctype html><html class="theme-light"><body style="margin:0">
  <sf-table id="t" aria-label="Список" toolbar="false" selectable="false" settings="false" layout="table"></sf-table>
</body></html>`);
for (const path of styles) await page.addStyleTag({path}).catch(() => {});
for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
await page.waitForTimeout(700);

try {
  const result = await page.evaluate(async () => {
    if (!customElements.get('sf-table')) return {error: 'sf-table is not defined'};
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const table = document.getElementById('t');
    const row = (id) => ({id, title: `Запись ${id}`});
    const node = (id) => table.querySelector(`tr[data-row-id="${id}"]`) ?? table.shadowRoot?.querySelector(`tr[data-row-id="${id}"]`);
    const shifts = [];
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) shifts.push(entry.value); })
      .observe({type: 'layout-shift', buffered: false});
    table.setColumns([{key: 'title', label: 'Название', role: 'title'}]);
    table.setRows(['a', 'b', 'c', 'd', 'e'].map(row));
    await frame();
    const before = {d: node('d'), e: node('e')};
    if (!before.d) return {error: 'no row d drawn'};
    // A search keeps d and e and puts them first: drawn new, nothing shifted.
    shifts.length = 0;
    table.setRows(['d', 'e', 'x'].map(row), 'result');
    await frame();
    await new Promise((done) => setTimeout(done, 100));
    const searched = {sameD: node('d') === before.d, sameE: node('e') === before.e, shift: shifts.reduce((a, b) => a + b, 0)};
    // A re-read of the same set keeps its rows.
    const kept = node('d');
    table.setRows(['d', 'e', 'x', 'y'].map(row), 'result');
    await frame();
    const reread = {sameD: node('d') === kept};
    // Any other reason keys by id, as before.
    const held = node('x');
    table.setRows(['x', 'd'].map(row));
    await frame();
    const plain = {sameX: node('x') === held};
    return {searched, reread, plain};
  });
  if (result.error) throw new Error(result.error);
  if (result.searched.sameD || result.searched.sameE) failures.push(`a new result set moved the rows it kept: ${JSON.stringify(result.searched)}`);
  if (result.searched.shift > 0.001) failures.push(`a new result set shifted the layout by ${result.searched.shift}`);
  if (!result.reread.sameD) failures.push('a result set that keeps its rows in place redrew them');
  if (!result.plain.sameX) failures.push('rows set for another reason are no longer kept by id');
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('table result rows: a new result set is drawn new where a kept row would move; other updates keep rows by id');
