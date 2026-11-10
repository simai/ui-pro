#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Build output root is required: the free output with the set laid into
// smart/smart (scripts/run-browser-probes.mjs makes it).
//
// The actions of a list of resources (owner decision C31, 2026-11-09), on the
// built bytes, in the light and the dark theme, with a clean console:
// - up to three quick actions stand in the row, always shown, and «more»
//   (more_horiz) holds the rest; on a narrow container (below 37.5rem) the
//   quick ones fold into «more», measured at four container widths;
// - a quick action does its work without opening the record;
// - row-open="row": a press anywhere on the row opens the record once (the
//   existing view intent), its buttons keep their own work;
// - the keys: ↑/↓, Home and End move between the rows' titles, Enter opens.
import {join, resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {COLUMNS, ROWS, ACTIONS} from '../fixtures/resource-list-fixture.mjs';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/dot/css/dot.css', 'component/component/tooltip/css/tooltip.css',
  'component/component/icon-buttons/css/icon-buttons.css', 'component/component/badges/css/badges.css',
  'component/component/context-menu/css/context-menu.css', 'component/component/buttons/css/buttons.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/resizer/css/resizer.css',
].map((path) => join(out, path));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'component/component/tooltip/js/tooltip.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js', 'smart/smart/button-icon/js/button-icon.js',
  'smart/smart/badge/js/badge.js', 'smart/smart/input/js/input.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/view-table/js/view-table.js',
].map((path) => join(out, path));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.slice(0, 3).join(', ')}`);

const WIDTHS = [1000, 700, 560, 400];
const failures = [];
const note = (theme, detail) => failures.push({theme, ...detail});
const browser = await chromium.launch();
const report = {};

try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({viewport: {width: 1280, height: 1400}});
    // The theme the class names and the one the browser asks for agree.
    await page.emulateMedia({colorScheme: theme});
    const errors = [];
    // Scripts added by path have no address for webpack's automatic publicPath
    // (the same allowance as table-field-cells); every other error counts.
    page.on('console', (message) => { if (message.type() === 'error' && !/publicPath/u.test(message.text())) errors.push(message.text()); });
    page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(error.message); });
    await page.setContent(`<!doctype html><html class="theme-${theme}" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0;background:var(--sf-surface-page)">${
      WIDTHS.map((width) => `<div style="inline-size:${width}px"><sf-view-table id="w${width}" size="1/2" layout="list" toolbar="false" selectable="false" row-open="row" quick-actions="visit,restart" aria-label="Сайты ${width}"></sf-view-table></div>`).join('')
    }<div style="inline-size:1000px"><sf-view-table id="tab" size="1/2" layout="table" toolbar="false" selectable="false" current="demo" aria-label="Сайты таблицей"></sf-view-table></div></body></html>`);
    for (const path of styles) await page.addStyleTag({path});
    for (const path of modules) await page.addScriptTag({path, type: 'module'});
    await page.waitForFunction(() => Boolean(customElements.get('sf-view-table') && customElements.get('sf-menu-context')), null, {timeout: 10000});
    await page.evaluate(({columns, rows, actions}) => {
      window.applied = [];
      for (const table of document.querySelectorAll('sf-view-table')) {
        table.ACTIONS_SETTINGS_ROW = actions;
        table.setColumns(columns);
        table.setRows(rows);
        table.addEventListener('sf-view-table-apply', (event) => window.applied.push({table: table.id, action: event.detail.action, ids: [...event.detail.ids]}));
      }
    }, {columns: COLUMNS, rows: ROWS, actions: ACTIONS});
    await page.waitForFunction((count) => document.querySelectorAll('.sf-table-resource').length === count, WIDTHS.length * ROWS.length, {timeout: 8000});
    // The page is drawn in the theme it was asked for.
    const drawn = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    if (drawn !== theme) errors.push(`the page is drawn in ${drawn}, not ${theme}`);
    await page.waitForTimeout(500);

    // The fold, at each container width.
    const fold = {};
    for (const width of WIDTHS) {
      const shown = await page.evaluate((id) => {
        const item = document.querySelector(`#${id} .sf-table-resource`);
        const quick = [...item.querySelectorAll('[data-quick-action]')].filter((node) => node.getBoundingClientRect().width > 0);
        const more = item.querySelector('.sf-table-resource-more');
        return {
          list: Math.round(item.closest('.sf-table-list').getBoundingClientRect().width),
          quick: quick.map((node) => node.dataset.quickAction),
          quickHeight: Math.round(quick[0]?.getBoundingClientRect().height ?? 0),
          more: more?.getBoundingClientRect().width > 0 ? more.querySelector('.sf-icon').textContent.trim() : null,
          moreHeight: Math.round(more?.getBoundingClientRect().height ?? 0),
          menuLegacy: Boolean(item.querySelector('.sf-table-list-menu')),
        };
      }, `w${width}`);
      await page.click(`#w${width} .sf-table-resource[data-row-id="shop"] .sf-table-resource-more`);
      await page.waitForFunction(() => [...document.querySelectorAll('sf-menu-context[data-sf-table-menu="row"]')].some((menu) => menu.querySelector('[role="menuitem"]')
        && menu.querySelector('[role="menuitem"]').getBoundingClientRect().width > 0), null, {timeout: 4000}).catch(() => {});
      shown.menu = await page.evaluate(() => [...document.querySelectorAll('sf-menu-context[data-sf-table-menu="row"] [role="menuitem"]')]
        .filter((node) => node.getBoundingClientRect().width > 0).map((node) => node.textContent.replace(/\s+/gu, ' ').trim()));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      fold[width] = shown;
      const narrow = width * 1 < 600;
      const quick = narrow ? [] : ['visit', 'restart'];
      const menu = narrow ? ['Открыть сайт', 'Перезапустить', 'Открыть карточку', 'Сделать копию', 'Удалить сайт'] : ['Открыть карточку', 'Сделать копию', 'Удалить сайт'];
      if (JSON.stringify(shown.quick) !== JSON.stringify(quick)) note(theme, {said: 'the quick actions are not shown when wide, folded when narrow', width, got: shown.quick});
      if (shown.more !== 'more_horiz' || shown.menuLegacy) note(theme, {said: '«more» is not more_horiz in place of ≡', width, got: shown});
      if (!menu.every((text) => shown.menu.some((item) => item.includes(text))) || shown.menu.length !== menu.length) {
        note(theme, {said: '«more» does not hold the rest (and the folded quick ones when narrow)', width, got: shown.menu, want: menu});
      }
      if (shown.moreHeight !== 32 || (!narrow && shown.quickHeight !== 32)) note(theme, {said: 'the row\'s buttons are not the size 1/2 icon button (32)', width, got: shown});
    }
    report[theme] = {fold};

    // A quick action does its work and does not open the record.
    await page.evaluate(() => { window.applied = []; });
    await page.click('#w1000 .sf-table-resource[data-row-id="shop"] [data-quick-action="restart"]');
    await page.waitForTimeout(200);
    const quickApplied = await page.evaluate(() => window.applied);
    if (JSON.stringify(quickApplied) !== JSON.stringify([{table: 'w1000', action: 'restart', ids: ['shop']}])) note(theme, {said: 'a quick action does not do only its own work', got: quickApplied});

    // A menu item does its work, and the row does not open under it.
    await page.evaluate(() => { window.applied = []; });
    await page.click('#w1000 .sf-table-resource[data-row-id="demo"] .sf-table-resource-more');
    await page.getByRole('menuitem', {name: 'Сделать копию'}).click({timeout: 4000}).catch((error) => note(theme, {said: 'the «more» item cannot be pressed', error: error.message}));
    await page.waitForTimeout(250);
    const menuApplied = await page.evaluate(() => window.applied);
    if (JSON.stringify(menuApplied) !== JSON.stringify([{table: 'w1000', action: 'backup', ids: ['demo']}])) note(theme, {said: 'a «more» item does not do only its own work', got: menuApplied});

    // row-open="row": the whole row opens the record, once.
    await page.evaluate(() => { window.applied = []; });
    await page.click('#w1000 .sf-table-resource[data-row-id="clinic"] .sf-table-resource-supporting');
    await page.waitForTimeout(150);
    await page.dblclick('#w1000 .sf-table-resource[data-row-id="simai"] .sf-table-resource-facts');
    await page.waitForTimeout(200);
    const opened = await page.evaluate(() => window.applied);
    const wantOpened = [{table: 'w1000', action: 'view', ids: ['clinic']}, {table: 'w1000', action: 'view', ids: ['simai']}];
    if (JSON.stringify(opened) !== JSON.stringify(wantOpened)) note(theme, {said: 'a press on the row does not open its record once', got: opened});
    const rowCursor = await page.evaluate(() => getComputedStyle(document.querySelector('#w1000 .sf-table-resource[data-open="row"]')).cursor);
    if (rowCursor !== 'pointer') note(theme, {said: 'a row that opens does not show the pointer', got: rowCursor});

    // The keys: ↓ ↑ Home End between the titles, Enter opens. The page has
    // «shop» open: the keys move the person's row, never the open record,
    // and the list row of the open record says aria-current.
    await page.evaluate(() => { window.applied = []; document.getElementById('w700').setAttribute('current', 'shop'); });
    await page.waitForTimeout(150);
    await page.focus('#w700 .sf-table-resource[data-row-id="simai"] .sf-table-title-link');
    const where = () => page.evaluate(() => document.activeElement?.closest('.sf-table-resource')?.dataset.rowId ?? document.activeElement?.tagName);
    const steps = [];
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(80);
      steps.push(await where());
    }
    const current = await page.evaluate(() => [...document.querySelectorAll('#w700 .sf-table-resource[data-current]')].map((item) => item.dataset.rowId));
    const open = await page.evaluate(() => ({
      aria: [...document.querySelectorAll('#w700 .sf-table-resource[aria-current="true"]')].map((item) => item.dataset.rowId),
      property: document.getElementById('w700').current,
    }));
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const keyed = await page.evaluate(() => window.applied);
    report[theme].keys = {steps, current, open, keyed};
    if (JSON.stringify(open) !== JSON.stringify({aria: ['shop'], property: 'shop'})) note(theme, {said: 'the keys moved the open record, or the list row of it has no aria-current', got: open});

    // The same in a table: ↓ from the open record moves the person's row only.
    await page.focus('#tab tbody tr[data-row-id="demo"]');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(120);
    const table = await page.evaluate(() => ({
      on: [...document.querySelectorAll('#tab tbody tr[data-current]')].map((tr) => tr.dataset.rowId),
      aria: [...document.querySelectorAll('#tab tbody tr[aria-current="true"]')].map((tr) => tr.dataset.rowId),
      property: document.getElementById('tab').current,
    }));
    report[theme].table = table;
    if (JSON.stringify(table) !== JSON.stringify({on: ['clinic'], aria: ['demo'], property: 'demo'})) note(theme, {said: 'in a table the keys moved the open record', got: table});
    if (JSON.stringify(steps) !== JSON.stringify(['shop', 'demo', 'shop', 'clinic', 'simai'])) note(theme, {said: 'the keys do not move between the rows', got: steps});
    if (JSON.stringify(current) !== JSON.stringify(['simai'])) note(theme, {said: 'the current row is not marked as the keys move', got: current});
    if (JSON.stringify(keyed) !== JSON.stringify([{table: 'w700', action: 'view', ids: ['clinic']}])) note(theme, {said: 'Enter does not open the record', got: keyed});
    if (errors.length) note(theme, {said: 'the console is not clean', errors});
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({probe: 'table-resource-actions', result: failures.length ? 'TABLE_RESOURCE_ACTIONS_FAIL' : 'TABLE_RESOURCE_ACTIONS_OK', failures, report}, null, 1));
if (failures.length) process.exit(1);
