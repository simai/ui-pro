#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// sf-view 1.12.0 first paint (msg-8c5606e7): the optional toolbar controls
// known before the answer -- the layout switch, and the create kinds' arrow
// and the toolbar actions' button the page gave its table -- have their
// place from the first paint: each held block is the control the table then
// draws, and the search field does not move (1440 normal and compact, 390,
// light and dark; at 390 the compact list's toolbar holds none of them). The
// list's sort button is not held (its column is the port's answer): the
// probe records how far the field moves for it and does not fail on it.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const label = 'probe';
const shots = null;
const STYLES = ['core/core/css/core.css', 'core/core/css/utility.full.css', 'component/component/icons/css/icons.css', 'component/component/dot/css/dot.css', 'component/component/tooltip/css/tooltip.css', 'component/component/icon-buttons/css/icon-buttons.css', 'component/component/badges/css/badges.css', 'component/component/button-group/css/button-group.css', 'component/component/buttons/css/buttons.css', 'component/component/inputs/css/inputs.css', 'component/component/context-menu/css/context-menu.css', 'component/component/pagination/css/pagination.css', 'component/component/skeleton/css/skeleton.css', 'component/component/segmented/css/segmented.css', 'smart/smart/view-table/css/view-table.css', 'smart/smart/view/css/view.css', 'smart/smart/resizer/css/resizer.css'];
const MODULES = ['core/core/js/core.js', 'core/core/js/smart-base.js', 'component/component/tooltip/js/tooltip.js', 'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js', 'smart/smart/button-icon/js/button-icon.js', 'smart/smart/badge/js/badge.js', 'smart/smart/segmented/js/segmented.js', 'smart/smart/input/js/input.js', 'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js', 'smart/smart/menu-context/js/menu-context.js', 'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js', 'smart/smart/tag/js/tag.js', 'smart/smart/tabs/js/tabs.js', 'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/view-table/js/view-table.js', 'smart/smart/view/js/view.js'];
const BASE = ['row-actions', 'personal-column-settings', 'create-record'];
const QUERY = {filters: {}, search: '', sort: [], page: 1, per_page: 20};
const COLUMNS = [{key: 'title', label: 'Название', sortable: true}, {key: 'state', label: 'Состояние', sortable: true}];
const records = [1, 2, 3, 4].map((n) => ({id: String(n), revision: `r${n}`, title: `Запись ${n}`, state: 'Опубликована', actions: ['open']}));
const answer = {records, total: 4, revision: 'list-1', columns: COLUMNS, row_actions: [{id: 'open', label: 'Открыть'}]};
const CASES = {
  switch: {attrs: ' layout-switch', table: ''},
  kinds: {attrs: '', table: '', pre: {createItems: [{id: 'page', name: 'Страница'}, {id: 'folder', name: 'Папка'}], toolbarActions: [{id: 'export', label: 'Выгрузить'}]}},
  switch12: {attrs: ' layout-switch size="1/2"', table: ''},
  kinds12: {attrs: ' size="1/2"', table: '', pre: {createItems: [{id: 'page', name: 'Страница'}, {id: 'folder', name: 'Папка'}], toolbarActions: [{id: 'export', label: 'Выгрузить'}]}},
  list: {attrs: '', table: ' layout="list"'},
  all: {attrs: ' layout-switch', table: '', pre: {createItems: [{id: 'page', name: 'Страница'}, {id: 'folder', name: 'Папка'}], toolbarActions: [{id: 'export', label: 'Выгрузить'}]}},
};
const view = (id, c) => `<div style="margin-block-end:24px"><sf-view id="${id}" aria-label="Каталог"${c.attrs}>
  <script type="application/json" data-sf-port>${JSON.stringify({port: 'simai.dataview-port', version: '1.12.0', url: '/port', capabilities: BASE, first: {intent: 'query.change', payload: {query: QUERY}}})}</script>
  <sf-view-table slot="content" aria-label="Каталог"${c.table}></sf-view-table>
  <sf-pagination slot="pagination" page-size="20" current="1" total="0"></sf-pagination></sf-view></div>`;
const pre = Object.fromEntries(Object.entries(CASES).map(([id, c]) => [id, c.pre ?? null]));
const browser = await chromium.launch();
const rows = [];
const failures = [];
try {
  for (const load of [1]) for (const scheme of ['light', 'dark']) for (const [width, density] of [[1440, 'normal'], [1440, 'compact'], [390, 'normal']]) {
    const where = `${scheme} ${width} ${density}`;
    const context = await browser.newContext({viewport: {width, height: 1400}, colorScheme: scheme});
    const tab = await context.newPage();
    const errors = [];
    tab.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    tab.on('pageerror', (e) => { if (!/publicPath/u.test(e.message)) errors.push(`pageerror: ${e.message}`); });
    await tab.setContent(`<!doctype html><html class="theme-${scheme}" lang="ru" data-sf-density="${density}"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px">
      ${Object.entries(CASES).map(([id, c]) => view(id, c)).join('')}</body></html>`);
    // The page gives its tables what it knows before the components load.
    await tab.evaluate((pre) => { for (const [id, given] of Object.entries(pre)) if (given) Object.assign(document.querySelector(`#${id} sf-view-table`), given); }, pre);
    for (const s of STYLES) { const f = join(out, s); if (existsSync(f)) await tab.addStyleTag({path: f}); }
    for (const m of MODULES) { const f = join(out, m); if (existsSync(f)) await tab.addScriptTag({path: f, type: 'module'}); }
    await tab.waitForFunction(() => customElements.get('sf-view') && customElements.get('sf-view-table'), null, {timeout: 20000});
    await tab.waitForTimeout(700);
    const first = await tab.evaluate((ids) => Object.fromEntries(ids.map((id) => {
      const bar = document.querySelector(`#${id} .sf-data-view-skeleton-toolbar`);
      const box = (e) => { if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return r.width ? [Math.round(r.left * 100) / 100, Math.round(r.right * 100) / 100, Math.round(r.height * 100) / 100] : null; };
      const blocks = {};
      for (const kind of ['filter', 'field', 'sort', 'switch', 'create', 'split', 'actions']) blocks[kind] = box(bar?.querySelector(`[data-control="${kind}"]`));
      return [id, {awaiting: document.getElementById(id).hasAttribute('data-sf-awaiting'), blocks}];
    })), Object.keys(CASES));
    if (shots && load === 1) await tab.screenshot({path: join(shots, `${label}-skeleton-${width}-${density}-${scheme}.png`), fullPage: true});
    const drawn = await tab.evaluate(async ({answer, BASE, ids}) => {
      for (const id of ids) document.getElementById(id).setHostPort({version: '1.12.0', capabilities: BASE,
        raise: (intent, payload) => new Promise((done) => setTimeout(() => done({answer: 'applied', sequence: payload.sequence, data: JSON.parse(JSON.stringify(answer))}), 120))});
      await new Promise((done) => setTimeout(done, 1200));
      return Object.fromEntries(ids.map((id) => {
        const table = document.querySelector(`#${id} sf-view-table`);
        const bar = table.querySelector('.sf-table-toolbar');
        const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [Math.round(r.left * 100) / 100, Math.round(r.right * 100) / 100, Math.round(r.height * 100) / 100] : null; };
        const field = bar?.querySelector('sf-input');
        const native = (sel) => { const e = bar?.querySelector(sel); return box(e?.querySelector('button, .sf-segmented, [role="radiogroup"]') ?? e?.firstElementChild ?? e); };
        return [id, {awaiting: document.getElementById(id).hasAttribute('data-sf-awaiting'), list: bar?.classList.contains('sf-table-toolbar--list') ?? null, blocks: {
          field: box(field?.firstElementChild ?? field),
          sort: native('sf-button-icon[icon="swap_vert"]'),
          switch: box(bar?.querySelector('sf-segmented')?.firstElementChild ?? bar?.querySelector('sf-segmented')),
          split: native('sf-button-icon[icon="keyboard_arrow_down"]'),
          actions: native('sf-button-icon[icon="more_vert"]'),
        }}];
      }));
    }, {answer, BASE, ids: Object.keys(CASES)});
    if (shots && load === 1) await tab.screenshot({path: join(shots, `${label}-drawn-${width}-${density}-${scheme}.png`), fullPage: true});
    for (const id of Object.keys(CASES)) {
      const f = first[id].blocks.field, d = drawn[id].blocks.field;
      const move = f && d ? [Math.round((d[0] - f[0]) * 100) / 100, Math.round((d[1] - f[1]) * 100) / 100] : null;
      const held = Object.fromEntries(['sort', 'switch', 'split', 'actions'].map((k) => [k, {first: first[id].blocks[k], drawn: drawn[id].blocks[k]}]));
      rows.push({load, where, case: id, awaiting: first[id].awaiting, list: drawn[id].list, fieldMove: move, held, errors: errors.length});
    }
    if (errors.length) failures.push(`${where}: ${errors.slice(0, 2).join(' | ')}`);
    await context.close();
  }
} finally { await browser.close(); }
const near = (a, b) => Math.abs(a - b) <= 0.5;
for (const r of rows) {
  if (!r.awaiting) failures.push(`${r.where} ${r.case}: the first paint is not the skeleton`);
  for (const [kind, {first, drawn}] of Object.entries(r.held)) {
    if (kind === 'sort') continue;
    if (Boolean(first) !== Boolean(drawn)) failures.push(`${r.where} ${r.case}: ${kind} held ${JSON.stringify(first)}, drawn ${JSON.stringify(drawn)}`);
    else if (first && !(near(first[0], drawn[0]) && near(first[1], drawn[1]) && near(first[2], drawn[2]))) failures.push(`${r.where} ${r.case}: ${kind} held ${first}, drawn ${drawn}`);
  }
  const sorted = Boolean(r.held.sort?.drawn);
  if (!sorted && !(r.fieldMove && near(r.fieldMove[0], 0) && near(r.fieldMove[1], 0))) failures.push(`${r.where} ${r.case}: the search field moves ${JSON.stringify(r.fieldMove)}`);
}
console.log(JSON.stringify(rows));
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('DATA_VIEW_SKELETON_OPTIONAL_CONTROLS_OK');
