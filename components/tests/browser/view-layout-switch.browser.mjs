#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Build output root is required: the free output with the set laid into
// smart/smart (scripts/run-browser-probes.mjs makes it).
//
// The list or the table, the person's choice (owner decision C31,
// 2026-11-09), on the built bytes in a browser that keeps it between pages,
// in the light and the dark theme, with a clean console:
// - sf-view passes its layout on (layout="list" is a list, not auto) and its
//   list-roles reach the table's columns;
// - layout-switch draws the list/table segmented in the toolbar; a press
//   draws the other layout, says layout-change and is kept per person
//   (SF.Preferences, preferences-key), so the next page paints it first;
// - a saved view carries the layout in its settings, beside the filters and
//   columns, and opening it puts the layout back;
// - below list-below there is no switch: a narrow container is a list.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {COLUMNS, ROWS} from '../fixtures/resource-list-fixture.mjs';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/dot/css/dot.css', 'component/component/tooltip/css/tooltip.css',
  'component/component/icon-buttons/css/icon-buttons.css', 'component/component/badges/css/badges.css',
  'component/component/button-group/css/button-group.css', 'component/component/buttons/css/buttons.css',
  'component/component/context-menu/css/context-menu.css', 'component/component/pagination/css/pagination.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/resizer/css/resizer.css',
].map((path) => join(out, path));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'component/component/tooltip/js/tooltip.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js', 'smart/smart/button-icon/js/button-icon.js',
  'smart/smart/badge/js/badge.js', 'smart/smart/segmented/js/segmented.js', 'smart/smart/input/js/input.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js',
  'smart/smart/view-table/js/view-table.js', 'smart/smart/view/js/view.js',
].map((path) => join(out, path));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.slice(0, 3).join(', ')}`);

// The host's columns carry no list roles (the port has no field for them);
// the view's list-roles gives them.
const HOST_COLUMNS = COLUMNS.map(({list, ...column}) => column);
const ROLES = COLUMNS.filter((column) => column.list).map((column) => `${column.key}:${column.list}`).join(',');
const RECORDS = ROWS.map(({actions, ...row}) => row);
const failures = [];
const note = (theme, detail) => failures.push({theme, ...detail});
const browser = await chromium.launch();
const report = {};

const open = async (context, {theme, width, attributes, views = [], port = '1.14.0', columns = HOST_COLUMNS}) => {
  const page = await context.newPage();
  // The theme the class names and the one the browser asks for agree.
  await page.emulateMedia({colorScheme: theme});
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error' && !/publicPath/u.test(message.text())) errors.push(message.text()); });
  page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(error.message); });
  await page.goto('http://probe.test/');
  await page.setContent(`<!doctype html><html class="theme-${theme}" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0;background:var(--sf-surface-page)">
    <div style="inline-size:${width}px"><sf-view id="v" chrome="toolbar" ${attributes} aria-label="Сайты"><sf-view-table slot="content" id="t"></sf-view-table></sf-view></div></body></html>`);
  for (const path of styles) await page.addStyleTag({path});
  // The first paint is the view's skeleton, before the table is defined.
  for (const path of modules.slice(0, -2)) await page.addScriptTag({path, type: 'module'});
  await page.addScriptTag({path: modules.at(-1), type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-view')), null, {timeout: 8000});
  const skeleton = await page.evaluate(() => document.querySelector('#v .sf-data-view-skeleton')?.getAttribute('data-layout') ?? null);
  await page.addScriptTag({path: modules.at(-2), type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-view-table') && customElements.get('sf-segmented')), null, {timeout: 8000});
  // The host keeps the person's saved views between pages.
  await page.evaluate(({columns, records, kept, port}) => {
    window.raised = [];
    window.changes = [];
    let views = kept;
    const view = document.getElementById('v');
    view.addEventListener('sf-view-table-layout-change', (event) => window.changes.push(event.detail.layout));
    view.setHostPort({
      version: port, capabilities: ['saved-views'],
      async raise(intent, payload) {
        window.raised.push({intent, payload: structuredClone(payload)});
        const data = () => ({records, total: records.length, columns, saved_views: views,
          echo: {search: '', filters: {}, sort: [], page: 1, per_page: 25}});
        if (intent === 'view.save') {
          views = [{key: payload.key, label: payload.label, level: 'personal', query: payload.query, layout: payload.layout, settings: payload.settings}];
          return {answer: 'applied'};
        }
        if (intent === 'view.open') return {answer: 'applied', data: data()};
        if (intent !== 'query.change') return {answer: 'applied'};
        return {answer: 'applied', sequence: payload.sequence, data: data()};
      },
    });
  }, {columns, records: RECORDS, kept: views, port});
  // The page is drawn in the theme it was asked for.
  const drawn = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  if (drawn !== theme) errors.push(`the page is drawn in ${drawn}, not ${theme}`);
  await page.waitForTimeout(900);
  const deprecated = await page.evaluate(() => (globalThis.SF?.deprecations?.list?.() ?? [])
    .filter((entry) => entry.from === 'list-roles').map((entry) => ({from: entry.from, to: entry.to, remove_after: entry.remove_after})));
  return {page, errors, skeleton, deprecated};
};
const state = (page) => page.evaluate(() => {
  const table = document.getElementById('t');
  const control = table.querySelector('.sf-table-layout-switch');
  return {
    layout: table.getAttribute('layout'),
    list: table.querySelectorAll('.sf-table-resource').length,
    listDots: table.querySelectorAll('.sf-table-resource .sf-dot').length,
    rows: table.querySelectorAll('tbody tr[data-row-id]').length,
    // The list roles drawn in table cells too (C31 acceptance 1).
    cells: {dots: table.querySelectorAll('tbody td[data-key="state"] .sf-dot').length,
      words: [...table.querySelectorAll('tbody td[data-key="state"]')].map((cell) => cell.textContent.trim()),
      badges: [...table.querySelectorAll('tbody td[data-key="ssl"] sf-badge, tbody td[data-key="backup"] sf-badge')].map((badge) => badge.getAttribute('text'))},
    // sf-segmented draws its radio group; the host itself has no box.
    switch: control ? {value: control.getAttribute('value'),
      shown: (control.querySelector('[role="radiogroup"]')?.getBoundingClientRect().width ?? 0) > 0,
      height: Math.round(control.querySelector('[role="radiogroup"]')?.getBoundingClientRect().height ?? 0),
      radios: [...control.querySelectorAll('[role="radio"]')].map((radio) => radio.getAttribute('aria-label') || radio.querySelector('.sf-button-group-label--hidden')?.textContent.trim())} : null,
    // A grouped control is the button of its size (the ladder's height).
    field: (() => {
      const probe = document.createElement('div');
      probe.style.blockSize = `var(--sf-ui-${table.getAttribute('size') ?? '1'}--control-height)`;
      document.body.append(probe);
      const height = Math.round(probe.getBoundingClientRect().height);
      probe.remove();
      return height;
    })(),
    size: table.getAttribute('size') ?? '1',
    kept: JSON.parse(localStorage.getItem('sf-pref:sf-table/c31.sites') ?? 'null')?.layout ?? null,
    changes: window.changes,
  };
});

try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}});
    await context.route('http://probe.test/**', (route) => route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body></body></html>'}));
    const attributes = `preferences-key="c31.sites" layout-switch list-roles="${ROLES}" quick-actions="visit"`;
    const errors = [];

    // The view's own layout is passed on: layout="list" is a list.
    const passed = await open(context, {theme, width: 1200, attributes: `layout="list" list-roles="${ROLES}"`});
    const passedState = await state(passed.page);
    errors.push(...passed.errors);
    await passed.page.close();
    if (passedState.layout !== 'list' || passedState.list !== ROWS.length || passedState.switch) note(theme, {said: 'sf-view does not pass layout="list" on, or draws a switch it was not asked for', got: passedState});
    // list-roles is a dated alias of the port's columns[].list: noted once.
    if (JSON.stringify(passed.deprecated) !== '[{"from":"list-roles","to":"columns[].list","remove_after":"2027-01-01"}]') note(theme, {said: 'list-roles is not noted in SF.deprecations as a dated alias', got: passed.deprecated});

    // simai.dataview-port 1.15.0: the host sends columns[].list, no list-roles.
    const ported = await open(context, {theme, width: 1200, attributes: 'layout="list"', port: '1.15.0', columns: COLUMNS});
    const portedState = await state(ported.page);
    errors.push(...ported.errors);
    await ported.page.close();
    if (portedState.list !== ROWS.length || ported.deprecated.length) note(theme, {said: 'the port\'s columns[].list does not draw the list, or notes a deprecation', got: {portedState, deprecated: ported.deprecated}});
    const portedDots = portedState.listDots;
    if (portedDots !== ROWS.length) note(theme, {said: 'the port\'s list roles do not reach the rows (status dots)', got: portedDots});

    // The switch: a table at first, the list on a press, kept.
    const first = await open(context, {theme, width: 1200, attributes});
    const before = await state(first.page);
    await first.page.getByRole('radio', {name: 'Список'}).click();
    await first.page.waitForTimeout(500);
    const after = await state(first.page);
    // A saved view carries the layout beside the query and the columns.
    await first.page.evaluate(() => document.getElementById('v').saveView({key: 'mine', label: 'Мои сайты'}));
    await first.page.waitForTimeout(300);
    const saved = await first.page.evaluate(() => window.raised.find((item) => item.intent === 'view.save')?.payload ?? null);
    errors.push(...first.errors);
    await first.page.close();
    if (before.rows !== ROWS.length || before.list || before.switch?.value !== 'table' || !before.switch?.shown) note(theme, {said: 'a wide view with the switch does not start as a table with the switch on «table»', got: before});
    if (JSON.stringify(before.switch?.radios) !== JSON.stringify(['Список', 'Таблица']) || !before.field || before.switch?.height !== before.field) note(theme, {said: 'the switch is not the list/table segmented of its size\'s button height', got: before});
    if (after.list !== ROWS.length || after.rows || after.switch?.value !== 'list' || after.kept !== 'list' || JSON.stringify(after.changes) !== '["list"]') {
      note(theme, {said: 'a press on «Список» does not draw the list, say layout-change and keep it', got: after});
    }
    if (saved?.settings?.layout !== 'list' || !Array.isArray(saved?.layout?.columns) || !saved?.query) note(theme, {said: 'a saved view does not carry the layout with its query and columns', got: saved});

    // The next page paints the person's list first, then the switch says so.
    const next = await open(context, {theme, width: 1200, attributes,
      views: saved ? [{key: saved.key, label: saved.label, level: 'personal', query: saved.query, layout: saved.layout, settings: saved.settings}] : []});
    const nextState = await state(next.page);
    if (next.skeleton !== 'list') note(theme, {said: 'the next page\'s first paint is not the person\'s list', got: next.skeleton});
    if (nextState.list !== ROWS.length || nextState.switch?.value !== 'list') note(theme, {said: 'the kept choice is not the next page\'s layout', got: nextState});
    // Back to the table, then the saved view puts the list back.
    await next.page.getByRole('radio', {name: 'Таблица'}).click();
    await next.page.waitForTimeout(400);
    const table = await state(next.page);
    await next.page.evaluate(() => document.getElementById('v').openView('mine'));
    await next.page.waitForTimeout(800);
    const reopened = await state(next.page);
    errors.push(...next.errors);
    await next.page.close();
    if (table.rows !== ROWS.length || table.kept !== 'table') note(theme, {said: 'a press on «Таблица» does not draw and keep the table', got: table});
    const facts = ROWS.flatMap((row) => [row.ssl.text, row.backup.text]);
    if (table.cells.dots !== ROWS.length || JSON.stringify(table.cells.words) !== JSON.stringify(['Работает', 'Есть замечания', 'Остановлен', 'Есть замечания'])
        || JSON.stringify(table.cells.badges) !== JSON.stringify(facts)) {
      note(theme, {said: 'the table of sf-view with list-roles loses the status words or the facts', got: table.cells, want: facts});
    }
    if (reopened.list !== ROWS.length || reopened.switch?.value !== 'list' || reopened.kept !== 'list') note(theme, {said: 'opening the saved view does not put its list back', got: reopened});

    // Narrow: no switch, a list.
    const narrow = await open(context, {theme, width: 520, attributes});
    await narrow.page.evaluate(() => localStorage.removeItem('sf-pref:sf-table/c31.sites'));
    const narrowState = await state(narrow.page);
    errors.push(...narrow.errors);
    await narrow.page.close();
    if (narrowState.switch || !narrowState.list) note(theme, {said: 'a narrow view draws the switch, or not the list', got: narrowState});
    if (errors.length) note(theme, {said: 'the console is not clean', errors});
    report[theme] = {passedState, portedState, before, after, saved: saved?.settings, skeleton: next.skeleton, nextState, table, reopened, narrowState};
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({probe: 'view-layout-switch', result: failures.length ? 'VIEW_LAYOUT_SWITCH_FAIL' : 'VIEW_LAYOUT_SWITCH_OK', failures, report}, null, 1));
if (failures.length) process.exit(1);
