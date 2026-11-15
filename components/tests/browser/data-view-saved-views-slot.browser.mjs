#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-view 1.11.1 (DEV decision msg-e39bb812, 2026-11-09): when the page
// declares saved views before the first answer (a data-sf-port that lists
// saved-views), the first paint holds the saved-views control's place in the
// toolbar -- a square of the step's control, joined to the filter button --
// so the toolbar does not move when the answer draws it. Measured on the
// built bytes, light and dark, at 1440 and 390, without a size and at 1/2:
//   - with saved-views declared, the skeleton's toolbar holds the slot, as
//     tall and as wide as the control the table then draws (the C27 height of
//     the step);
//   - the search field moves from the first paint to the drawn toolbar by
//     the same length with saved views declared as without them: the control
//     takes exactly the place held for it (on 1.11.0 it moved 54px further);
//   - the skeleton's toolbar is the drawn one (view161 acceptance O1, O2):
//     the search field starts and ends at the first paint where the table
//     draws it, on a desktop and on a phone, with saved views or without;
//   - once drawn, the port's answer moves nothing in the toolbar (CLS 0);
//   - without saved-views declared nothing is held; on a phone the compact
//     list's toolbar has no such control, and no slot is held;
//   - a clean console.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css', 'component/component/icons/css/icons.css',
  'component/component/pagination/css/pagination.css', 'component/component/inputs/css/inputs.css',
  'component/component/buttons/css/buttons.css', 'component/component/icon-buttons/css/icon-buttons.css',
  'component/component/skeleton/css/skeleton.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/view/css/view.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/button-icon/js/button-icon.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/tabs/js/tabs.js',
  'smart/smart/tag/js/tag.js', 'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/view-table/js/view-table.js',
  'smart/smart/view/js/view.js',
].map((p) => join(out, p));

const BASE = ['row-actions', 'personal-column-settings', 'create-record'];
const QUERY = {filters: {}, search: '', sort: [], page: 1, per_page: 20};
const records = [1, 2, 3, 4].map((n) => ({id: String(n), revision: `r${n}`, title: `Запись ${n}`, state: 'Опубликована', actions: ['open']}));
const answer = {records, total: 4, revision: 'list-1', columns: [{key: 'title', label: 'Название'}, {key: 'state', label: 'Состояние'}],
  row_actions: [{id: 'open', label: 'Открыть'}]};
const view = (id, capabilities, size) => `<div style="margin-block-end:24px"><sf-view id="${id}" aria-label="Каталог"${size ? ` size="${size}"` : ''}>
  <script type="application/json" data-sf-port>${JSON.stringify({port: 'simai.dataview-port', version: '1.12.0', url: '/port', capabilities, first: {intent: 'query.change', payload: {query: QUERY}}})}</script>
  <sf-view-table slot="content" aria-label="Каталог"></sf-view-table>
  <sf-pagination slot="pagination" page-size="20" current="1" total="0"></sf-pagination></sf-view></div>`;

const failures = [];
const browser = await chromium.launch();
try {
  for (const scheme of ['light', 'dark']) for (const width of [1440, 390]) for (const size of ['', '1/2']) {
    const where = `${scheme} ${width} size ${size || 'none'}`;
    const context = await browser.newContext({viewport: {width, height: 1000}, colorScheme: scheme});
    const tab = await context.newPage();
    const errors = [];
    tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    tab.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(error.message); });
    await tab.setContent(`<!doctype html><html class="theme-${scheme}" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px">
      ${view('views', [...BASE, 'saved-views'], size)}${view('plain', BASE, size)}</body></html>`);
    for (const path of styles) await tab.addStyleTag({path}).catch(() => {});
    for (const path of modules) await tab.addScriptTag({path, type: 'module'}).catch(() => {});
    await tab.waitForFunction(() => customElements.get('sf-view') && customElements.get('sf-view-table'), null, {timeout: 15000});
    await tab.waitForTimeout(600);
    const box = (element) => { if (!element) return null; const r = element.getBoundingClientRect(); return {left: r.left, top: r.top, width: r.width, height: r.height}; };
    const first = await tab.evaluate((source) => {
      const box = new Function(`return ${source}`)();
      return Object.fromEntries(['views', 'plain'].map((id) => {
        const toolbar = document.querySelector(`#${id} .sf-data-view-skeleton-toolbar`);
        const shown = (element) => element && getComputedStyle(element).display !== 'none' ? element : null;
        return [id, {awaiting: document.getElementById(id).hasAttribute('data-sf-awaiting'),
          field: box(toolbar?.querySelector('[data-control="field"]')), slot: box(shown(toolbar?.querySelector('[data-control="segment"]')))}];
      }));
    }, box.toString());
    const drawn = await tab.evaluate(async ({answer, BASE}) => {
      const shifts = [];
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) shifts.push(entry.value); }).observe({type: 'layout-shift'});
      const connect = (id, capabilities) => document.getElementById(id).setHostPort({version: '1.12.0', capabilities,
        raise: (intent, payload) => new Promise((done) => setTimeout(() => done({answer: 'applied', sequence: payload.sequence, data: JSON.parse(JSON.stringify(answer))}), 120))});
      connect('views', [...BASE, 'saved-views']);
      connect('plain', BASE);
      await new Promise((done) => setTimeout(done, 900));
      const read = (id) => {
        const bar = document.querySelector(`#${id} sf-view-table .sf-table-toolbar`);
        const r = (element) => { if (!element) return null; const b = element.getBoundingClientRect(); return {left: b.left, width: b.width, height: b.height}; };
        const field = bar?.querySelector('sf-input, sf-search');
        const views = bar?.querySelector('sf-button-icon[icon="bookmark_add"]');
        return {awaiting: document.getElementById(id).hasAttribute('data-sf-awaiting'), field: r(field?.firstElementChild ?? field), views: r(views?.querySelector('button') ?? views)};
      };
      const before = {views: read('views'), plain: read('plain')};
      // The answer again, the port confirming: the drawn toolbar holds still.
      const settled = shifts.length;
      document.getElementById('views').refresh?.('again');
      await new Promise((done) => setTimeout(done, 700));
      return {...before, later: shifts.slice(settled).reduce((a, b) => a + b, 0), afterRefresh: read('views')};
    }, {answer, BASE});
    const near = (a, b, tolerance = 0.5) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerance;
    const phone = width < 600;
    if (!first.views.awaiting || !first.plain.awaiting) failures.push(`${where}: the first paint is not the skeleton (${JSON.stringify(first)})`);
    if (drawn.views.awaiting || drawn.plain.awaiting) failures.push(`${where}: the answer did not draw`);
    if (first.plain.slot) failures.push(`${where}: a slot is held without saved views declared`);
    if (phone) {
      if (first.views.slot) failures.push(`${where}: the compact list's toolbar holds a saved-views slot`);
    } else {
      if (!drawn.views.views) failures.push(`${where}: the table drew no saved-views control (${JSON.stringify(drawn.views)})`);
      if (!first.views.slot) failures.push(`${where}: the first paint holds no saved-views slot`);
      else if (drawn.views.views && (!near(first.views.slot.height, drawn.views.views.height) || !near(first.views.slot.width, drawn.views.views.width))) {
        failures.push(`${where}: the slot is ${first.views.slot.width}x${first.views.slot.height}, the control ${drawn.views.views.width}x${drawn.views.views.height}`);
      }
      const moved = (id) => drawn[id].field && first[id].field ? drawn[id].field.left - first[id].field.left : null;
      if (!near(moved('views'), moved('plain'))) failures.push(`${where}: the search field moves ${moved('views')}px with saved views declared, ${moved('plain')}px without: the toolbar shifts by ${moved('views') - moved('plain')}px`);
    }
    // The skeleton's toolbar is the drawn one (view161 acceptance O1, O2): the
    // search field starts and ends where the table then draws it, with saved
    // views declared or not, on a desktop and on a phone.
    for (const id of ['views', 'plain']) {
      const before = first[id].field;
      const after = drawn[id].field;
      if (!before || !after) failures.push(`${where} ${id}: no search field to compare (${JSON.stringify({before, after})})`);
      else if (!near(before.left, after.left) || !near(before.left + before.width, after.left + after.width)) {
        failures.push(`${where} ${id}: the search field moves from ${before.left}..${before.left + before.width} at the first paint to ${after.left}..${after.left + after.width} drawn`);
      }
    }
    if (drawn.later > 0) failures.push(`${where}: the drawn toolbar shifted by ${drawn.later} on the port's answer`);
    if (drawn.views.field && drawn.afterRefresh.field && !near(drawn.views.field.left, drawn.afterRefresh.field.left)) failures.push(`${where}: the field moved on a refresh`);
    if (errors.length) failures.push(`${where}: console ${errors.slice(0, 3).join(' | ')}`);
    await context.close();
  }
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('data-view saved-views slot: a declared saved-views control has its place from the first paint, the toolbar does not move, light and dark, 1440 and 390');
