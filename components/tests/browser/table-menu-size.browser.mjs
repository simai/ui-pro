#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output [--json /absolute/path/to/report.json]
//
// The table's menus are on the table's step (owner remark 2026-11-15,
// recipe-list-toolbar: sf-view-table size="1" had rows 48 and text 16, its row
// menu rows 32 and text 14). The row menu lives on <body>, outside the table,
// and had no size. Measured here on the released pair the set is built
// against, in an area of normal and of compact density (data-sf-density on a
// section, the menu on <body>), light and dark, 1440 and 390:
// - a view of size 1, 1/2 and of no size (the table's default, 1): the row
//   «≡» menu (data-sf-table-menu="row") carries the table's resolved size and
//   the area's density, and its rows and text equal those of a menu the page
//   sized itself (size="1" or "1/2") opened in the same area;
// - at 1440 they are the ladder: 1 is 40/16 (32/14 compact), 1/2 is 32/14
//   (28/12 compact);
// - the list layout's sort menu, which the table draws itself, carries the
//   same size;
// - a second opening follows the table as it stands then.
// Console errors fail the probe.
import {resolve, join} from 'node:path';
import {existsSync, writeFileSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const jsonAt = process.argv.indexOf('--json');
const reportPath = jsonAt === -1 ? '' : resolve(process.argv[jsonAt + 1]);
const loads = Number(process.env.MENU_SIZE_LOADS || 1);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/buttons/css/buttons.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'component/component/context-menu/css/context-menu.css', 'component/component/pagination/css/pagination.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js', 'smart/smart/button-icon/js/button-icon.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js', 'smart/smart/segmented/js/segmented.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/view-table/js/view-table.js', 'smart/smart/view/js/view.js',
].map((p) => join(out, p));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.slice(0, 3).join(', ')}`);

const LADDER = {normal: {'1': [40, 16], '1/2': [32, 14]}, compact: {'1': [32, 14], '1/2': [28, 12]}};
const VIEWS = [{id: 'one', size: '1', want: '1'}, {id: 'half', size: '1/2', want: '1/2'}, {id: 'none', size: '', want: '1'}];
const ENTRIES = [{id: 'open', text: 'Открыть', icon: 'open_in_new'}, {id: 'rename', text: 'Переименовать', icon: 'edit'}];

const failures = [];
const rows = [];
const check = (name, pass, detail = {}) => { if (!pass) failures.push({name, ...detail}); };
const browser = await chromium.launch();

async function stand(width, theme, density, run) {
  const name = `${width} ${theme} ${density}${loads > 1 ? ` #${run}` : ''}`;
  const context = await browser.newContext(width === 390
    ? {viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, deviceScaleFactor: 2}
    : {viewport: {width: 1440, height: 1100}});
  const page = await context.newPage();
  await page.emulateMedia({colorScheme: theme});
  const errors = [];
  page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(error.message); });
  page.on('console', (message) => { if (message.type() === 'error' && !/publicPath/u.test(message.text())) errors.push(message.text()); });
  const views = VIEWS.map(({id, size}) => `<sf-view id="v-${id}"${size ? ` size="${size}"` : ''} aria-label="Вид ${id}">
      <sf-view-table slot="content" aria-label="Страницы ${id}"></sf-view-table></sf-view>
    <sf-view-table id="l-${id}"${size ? ` size="${size}"` : ''} layout="list" aria-label="Список ${id}"></sf-view-table>`).join('');
  await page.setContent(`<!doctype html><html class="theme-${theme}" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:var(--sf-surface-page)">
    <section id="area" data-sf-density="${density}" style="display:grid;gap:16px">
      <button id="plain" type="button">Обычная кнопка</button>
      ${views}
    </section>
    ${['normal', 'compact'].map((step) => `<div data-sf-density="${step}">
      <button id="plain-${step}" type="button">Образец ${step}</button>
      <sf-menu-context id="ref-1-${step}" popup size="1" aria-label="Образец 1"></sf-menu-context>
      <sf-menu-context id="ref-h-${step}" popup size="1/2" aria-label="Образец 1/2"></sf-menu-context>
      <sf-menu-context id="ref-1-${step}-r" popup size="1" data-sf-size-relative aria-label="Образец 1, от хозяина"></sf-menu-context>
      <sf-menu-context id="ref-h-${step}-r" popup size="1/2" data-sf-size-relative aria-label="Образец 1/2, от хозяина"></sf-menu-context>
    </div>`).join('')}
  </body></html>`);
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-view') && customElements.get('sf-view-table') && customElements.get('sf-menu-context')));
  await page.evaluate((entries) => {
    for (const menu of document.querySelectorAll('sf-menu-context[id^="ref-"]')) menu.entries = entries;
    for (const view of document.querySelectorAll('sf-view')) {
      view.setHostPort({
        version: '1.8.0',
        capabilities: ['row-actions'],
        async raise(intent, payload) {
          if (intent !== 'query.change') return {answer: 'applied'};
          return {answer: 'applied', sequence: payload.sequence, data: {
            columns: [{key: 'title', label: 'Страница'}],
            row_actions: [{id: 'rename', label: 'Переименовать', icon: 'edit'}, {id: 'archive', label: 'В архив', icon: 'archive', danger: true}],
            records: [{id: 'home', title: 'Главная', revision: 'r1', actions: ['rename', 'archive']}],
            total: 1,
          }};
        },
      });
    }
    for (const table of document.querySelectorAll('sf-view-table[layout="list"]')) {
      table.setColumns([{key: 'title', label: 'Страница', sortable: true}, {key: 'kind', label: 'Тип', sortable: true}]);
      table.setRows([{id: 'a', title: 'Главная', kind: 'Страница'}, {id: 'b', title: 'Блог', kind: 'Раздел'}]);
    }
  }, ENTRIES);
  await page.waitForFunction(() => document.querySelectorAll('sf-view tbody tr td button[data-sf-row-menu]').length >= 3, null, {timeout: 10000}).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  // The open menu (a menu the table draws itself is found by its host), and
  // the density the table stands in: the menu is measured against a page menu
  // of the same size in that density.
  const measure = (host) => page.evaluate((at) => {
    const owner = at ? document.querySelector(at) : null;
    const menu = owner ? owner.querySelector('sf-menu-context[data-context-main-menu]')
      : [...document.querySelectorAll('sf-menu-context')].find((one) => one.isOpen);
    const table = owner ?? (menu?.dataset.sfTableMenu ? document.querySelector('sf-view-table[data-sf-row-menu-open]') : null);
    const densityOf = (node) => node?.closest?.('[data-sf-density]')?.getAttribute('data-sf-density') ?? 'normal';
    const surface = menu?.querySelector(':scope > .sf-context-menu');
    const item = surface?.querySelector('.sf-context-menu-item');
    const label = item?.querySelector('.sf-context-menu-item-label') ?? item;
    return menu ? {
      menu: menu.id || menu.dataset.sfTableMenu || 'table',
      size: menu.getAttribute('size'),
      menuDensity: menu.getAttribute('data-sf-density'),
      density: surface?.getAttribute('data-sf-density') ?? densityOf(menu),
      tableDensity: table ? densityOf(table) : null,
      tableSized: Boolean(table?.hasAttribute('size')),
      tableRow: table ? Math.round((table.querySelector('tbody tr, .sf-table-list-row, [role="row"]:not(:first-child)')?.getBoundingClientRect().height ?? 0) * 100) / 100 : null,
      row: item ? Math.round(item.getBoundingClientRect().height * 100) / 100 : null,
      text: label ? parseFloat(getComputedStyle(label).fontSize) : null,
    } : null;
  }, host ?? null);
  const closeAll = () => page.evaluate(() => {
    for (const menu of document.querySelectorAll('sf-menu-context')) if (menu.isOpen) menu.close({restoreFocus: false, reason: 'api'});
    document.body.click();
  });
  const cases = [];
  const take = async (label, want, open, host = null, table = null) => {
    await closeAll();
    await page.waitForTimeout(100);
    if (table) await page.evaluate((at) => document.querySelector(at)?.setAttribute('data-sf-row-menu-open', ''), table);
    const opened = await open();
    await page.waitForTimeout(400);
    cases.push({name: label, want, skipped: opened === false, ...(opened === false ? {} : await measure(host))});
    if (table) await page.evaluate((at) => document.querySelector(at)?.removeAttribute('data-sf-row-menu-open'), table);
    await closeAll();
    await page.waitForTimeout(100);
  };
  const toggle = (id, step) => page.evaluate(([menu, at]) => { document.getElementById(menu).toggleFor(document.getElementById(at)); }, [id, `plain-${step}`]);
  // A page menu of each size in each density, its size written by the page
  // and, as a host writes it for a part it sizes, marked relative: on a pair
  // before C79 a written size kept the normal ladder in a compact area and a
  // relative one followed it; from C79 both follow it.
  const reference = {};
  for (const step of ['normal', 'compact']) for (const kind of ['', '-r']) for (const [size, key] of [['1', '1'], ['1/2', 'h']]) {
    await take(`reference ${size} (${step}${kind ? ', relative' : ''})`, size, () => toggle(`ref-${key}-${step}${kind}`, step));
    reference[`${step}${kind} ${size}`] = cases.at(-1);
  }
  for (const {id, want} of VIEWS) {
    await take(`view ${id}: row menu`, want, () => page.locator(`#v-${id} tbody tr td button[data-sf-row-menu]`).first().click(), null, `#v-${id} sf-view-table`);
  }
  // The same row menu again after the first view's size changed.
  await page.evaluate(() => document.getElementById('v-one').setAttribute('size', '1/2'));
  await page.waitForTimeout(400);
  await take('view one, now 1/2: row menu again', '1/2', () => page.locator('#v-one tbody tr td button[data-sf-row-menu]').first().click(), null, '#v-one sf-view-table');
  for (const {id, want} of VIEWS) {
    await take(`list ${id}: sort menu`, want, async () => {
      // sf-button-icon draws no box of its own (display: contents): its button is pressed.
      const button = page.locator(`#l-${id} sf-button-icon[icon="swap_vert"] button`).first();
      if (!await button.count()) return false;
      await button.scrollIntoViewIfNeeded();
      await button.click();
      return true;
    }, `#l-${id}`);
  }

  // A pair before C79 keeps a written size on the normal ladder in a compact
  // area (its density helper answers "normal" for it); from C79 it follows.
  const c79 = reference['compact 1']?.row === reference['compact-r 1']?.row && reference['compact 1']?.text === reference['compact-r 1']?.text;
  for (const one of cases) {
    // The density the menu should be in: the table's (a sized table may hold
    // its own), the reference's own area for a reference.
    const own = one.name.startsWith('reference');
    const step = own ? (one.name.includes('compact') ? 'compact' : 'normal') : (one.tableDensity ?? density);
    // A table without a size of its own gives its menus a size relative to it.
    const relative = own ? one.name.includes('relative') : !one.tableSized;
    const ref = reference[`${step}${relative ? '-r' : ''} ${one.want}`];
    // A menu the table draws inside itself stands in the table's area; the row
    // menu on <body> carries the table's density (core followDensity).
    const carried = own || one.menu !== 'row' ? step : (one.tableSized && !c79 ? 'normal' : step);
    const row = {stand: name, ...one, expectedDensity: carried, c79, refRow: ref?.row, refText: ref?.text};
    rows.push(row);
    if (one.skipped) continue;
    check(`${name}: ${one.name}: the menu opened`, typeof one.row === 'number', {got: one});
    check(`${name}: ${one.name}: rows and text as a page menu of size ${one.want} in ${step}`, one.row === ref?.row && one.text === ref?.text, {got: row});
    check(`${name}: ${one.name}: the density of the table's area`, one.density === carried, {got: row});
    if (!one.name.startsWith('reference')) check(`${name}: ${one.name}: size ${one.want} written on the menu`, one.size === one.want, {got: one.size});
    if (width === 1440 && step === 'normal') {
      const [height, text] = LADDER[step][one.want];
      check(`${name}: ${one.name}: the ladder value ${height}/${text}`, one.row === height && one.text === text, {got: row});
    }
  }
  check(`${name}: the sort menu was measured`, cases.some((one) => one.name.includes('sort menu') && !one.skipped), {});
  check(`${name}: the console is clean`, errors.length === 0, {errors});
  await context.close();
}

try {
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) for (const density of ['normal', 'compact']) {
    for (let run = 1; run <= loads; run += 1) await stand(width, theme, density, run);
  }
} finally {
  await browser.close();
}
const result = {probe: 'table-menu-size', result: failures.length ? 'TABLE_MENU_SIZE_FAIL' : 'TABLE_MENU_SIZE_OK', failures, rows};
if (reportPath) writeFileSync(reportPath, `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify({probe: result.probe, result: result.result, failures, cases: rows.length}, null, 1));
if (failures.length) process.exitCode = 1;
