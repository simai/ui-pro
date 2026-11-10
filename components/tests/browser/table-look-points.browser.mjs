#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Build output root is required: the free output with the set laid into
// smart/smart (scripts/run-browser-probes.mjs makes it).
//
// The look points of the list of resources the owner accepted on 2026-11-09
// (C31, «Дополнено»), on the built bytes, light and dark, 1280 and 390, with
// a clean console. Every height is read from the ladder tokens of the page
// it is measured on, never a number typed here:
// 1. the record's title is the surface's text colour, medium weight, no
//    underline at rest and an underline while the row is pointed at;
// 2. one row model for the table: at size 1/2 a row with a supporting line
//    and a row whose text wraps to two lines are --sf-ui-2--control-height
//    (48), a one-line row with its box and menu --sf-ui-1--control-height
//    (40), three lines a text line more; the published boxes say the same;
// 3. the open record (current) carries aria-current and the primary
//    container fill (alpha 12 light, 24 dark); the arrows move the person's
//    row (data-current), which shows the focus ring and no fill;
// 4. on a phone «more» is the mobile --sf-ui-1--control-height (36) at size
//    1/2 and 1; on the desktop it stays its step's button;
// 5. the quick actions fold below a 37.5rem container (640 shows them, 560
//    folds them), as built;
// 6. the search field's left edge, «Создать»'s right edge and the rows' fill
//    are on one line (R077);
// 7. size 1 follows the same model: a row with the reorder/menu control is
//    --sf-ui-2--control-height (48, it was 73), two lines
//    --sf-ui-3--control-height (56).
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
  'component/component/button-group/css/button-group.css', 'component/component/buttons/css/buttons.css',
  'component/component/context-menu/css/context-menu.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/resizer/css/resizer.css',
].map((path) => join(out, path));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'component/component/tooltip/js/tooltip.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js', 'smart/smart/button-icon/js/button-icon.js',
  'smart/smart/badge/js/badge.js', 'smart/smart/segmented/js/segmented.js', 'smart/smart/input/js/input.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/view-table/js/view-table.js',
].map((path) => join(out, path));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.slice(0, 3).join(', ')}`);

// The table of point 2: a link with its line, one line, a text wrapped to two
// and to three lines (the prototype's own rows).
const TABLE_COLUMNS = [{key: 'name', label: 'Сайт', renderer: 'link', width: 200}, {key: 'note', label: 'Заметка', width: 220}, {key: 'kind', label: 'Тип'}];
const TABLE_ROWS = [
  {id: 'a', name: {text: 'Интернет-магазин', subtext: 'shop.simai.ru', href: '#a'}, note: 'Laravel 11', kind: 'Laravel'},
  {id: 'b', name: {text: 'Блог команды', href: '#b'}, note: 'Всё в порядке', kind: 'Статический'},
  {id: 'c', name: {text: 'Клиника «Здоровье»', href: '#c'}, note: 'Сертификат истёк, нужен перевыпуск сегодня', kind: 'Bitrix'},
  {id: 'd', name: {text: 'Демо Larena', href: '#d'}, note: 'Остановлен владельцем на время переезда на новый сервер, копии старше недели', kind: 'Laravel'},
].map((row) => ({...row, actions: ['view', 'delete']}));

const failures = [];
const report = {};
const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
    const key = `${theme}-${width}`;
    const note = (detail) => failures.push({stand: key, ...detail});
    const desktop = width >= 1000;
    const page = await browser.newPage({viewport: {width, height: 1400}});
    await page.emulateMedia({colorScheme: theme});
    const errors = [];
    // Scripts added by path have no address for webpack's automatic publicPath
    // (the same allowance as table-field-cells); every other error counts.
    page.on('console', (message) => { if (message.type() === 'error' && !/publicPath/u.test(message.text())) errors.push(message.text()); });
    page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(error.message); });
    await page.setContent(`<!doctype html><html class="theme-${theme}" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:var(--sf-surface-page)">
      <sf-view-table id="l" size="1/2" layout="list" layout-switch selectable="false" row-open="row" quick-actions="visit,restart" current="shop" aria-label="Сайты"></sf-view-table>
      <div style="block-size:16px"></div>
      <sf-view-table id="l1" layout="list" layout-switch selectable="false" row-open="row" quick-actions="visit,restart" aria-label="Сайты, размер 1"></sf-view-table>
      ${desktop ? `<div style="display:flex;gap:16px;margin-block:16px"><div style="inline-size:640px"><sf-view-table id="f640" size="1/2" layout="list" toolbar="false" selectable="false" quick-actions="visit,restart" aria-label="640"></sf-view-table></div><div style="inline-size:560px"><sf-view-table id="f560" size="1/2" layout="list" toolbar="false" selectable="false" quick-actions="visit,restart" aria-label="560"></sf-view-table></div></div>` : ''}
      <div style="block-size:16px"></div>
      <sf-view-table id="t12" size="1/2" layout="table" toolbar="false" aria-label="Таблица 1/2"></sf-view-table>
      <div style="block-size:16px"></div>
      <sf-view-table id="t1" layout="table" toolbar="false" aria-label="Таблица 1"></sf-view-table></body></html>`);
    for (const path of styles) await page.addStyleTag({path});
    for (const path of modules) await page.addScriptTag({path, type: 'module'});
    await page.waitForFunction(() => Boolean(customElements.get('sf-view-table') && customElements.get('sf-segmented')), null, {timeout: 10000});
    await page.evaluate(({columns, rows, actions, tableColumns, tableRows}) => {
      for (const table of document.querySelectorAll('sf-view-table')) {
        table.ACTIONS_SETTINGS_ROW = actions;
        if (table.id.startsWith('t')) { table.setColumns(tableColumns); table.setRows(tableRows); }
        else { table.setColumns(columns); table.setRows(rows); }
      }
    }, {columns: COLUMNS, rows: ROWS, actions: ACTIONS, tableColumns: TABLE_COLUMNS, tableRows: TABLE_ROWS});
    await page.waitForFunction(() => document.querySelectorAll('#t1 tbody tr[data-row-id]').length === 4
      && document.querySelectorAll('#l .sf-table-resource').length > 0, null, {timeout: 8000}).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const drawn = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    if (drawn !== theme) errors.push(`the page is drawn in ${drawn}, not ${theme}`);

    const m = await page.evaluate(() => {
      const probe = document.createElement('div');
      document.body.append(probe);
      const length = (name) => { probe.style.blockSize = `var(${name})`; return probe.getBoundingClientRect().height; };
      const colour = (name) => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color; };
      const round = (value) => Math.round(value * 100) / 100;
      const height = (element) => (element ? round(element.getBoundingClientRect().height) : null);
      const shown = (element) => Boolean(element) && element.getBoundingClientRect().width > 0;
      const $ = (selector) => document.querySelector(selector);
      const title = $('#l .sf-table-resource[data-row-id="simai"] .sf-table-title-link');
      const titleStyle = getComputedStyle(title);
      const rows = (id) => [...document.querySelectorAll(`#${id} tbody tr[data-row-id]`)].map(height);
      const edges = (id) => {
        const bar = $(`#${id} .sf-table-toolbar`);
        const field = bar.querySelector('.sf-input-field');
        const create = [...bar.querySelectorAll('button')].find((button) => shown(button) && !button.closest('.sf-input-field')
          && /Создать/u.test(`${button.textContent} ${button.getAttribute('aria-label') ?? ''}`));
        const row = $(`#${id} .sf-table-resource`);
        return {fieldLeft: round(field.getBoundingClientRect().left - row.getBoundingClientRect().left),
          createRight: create ? round(row.getBoundingClientRect().right - create.getBoundingClientRect().right) : null};
      };
      const more = (id) => height($(`#${id} .sf-table-resource[data-row-id="simai"] .sf-table-resource-more`));
      const quick = (id) => { const box = $(`#${id} .sf-table-resource-quick`); return box ? getComputedStyle(box).display !== 'none' : null; };
      const shop = $('#l .sf-table-resource[data-row-id="shop"]');
      const result = {
        ladder: {
          control12: length('--sf-ui-1\\/2--control-height'), control1: length('--sf-ui-1--control-height'),
          control2: length('--sf-ui-2--control-height'), control3: length('--sf-ui-3--control-height'),
          text12: length('--sf-text-height-1\\/2'), text1: length('--sf-text-height-1'),
        },
        published: {
          row12: length('--sf-table-row-block-size-1\\/2'), twoLines12: length('--sf-table-row-2-lines-block-size-1\\/2'),
          row1: length('--sf-table-row-block-size-1'), twoLines1: length('--sf-table-row-2-lines-block-size-1'),
        },
        title: {colour: titleStyle.color, onSurface: colour('--sf-on-surface'), link: colour('--sf-link'),
          weight: titleStyle.fontWeight, medium: (() => { probe.style.fontWeight = 'var(--sf-font-weight-medium)'; return getComputedStyle(probe).fontWeight; })(),
          rest: titleStyle.textDecorationLine},
        rows: {t12: rows('t12'), t1: rows('t1')},
        open: {ariaCurrent: shop.getAttribute('aria-current'), fill: getComputedStyle(shop).backgroundImage,
          container: colour('--sf-primary-container'), alpha12: colour('--sf-primary-50--alfa-12'), alpha24: colour('--sf-primary-50--alfa-24')},
        more: {half: more('l'), one: more('l1')},
        fold: {wide: quick('l'), at640: quick('f640'), at560: quick('f560')},
        edges: {half: edges('l'), one: edges('l1')},
      };
      probe.remove();
      return result;
    });
    await page.hover('#l .sf-table-resource[data-row-id="simai"] .sf-table-resource-supporting');
    await page.waitForTimeout(150);
    m.title.hover = await page.evaluate(() => getComputedStyle(document.querySelector('#l .sf-table-resource[data-row-id="simai"] .sf-table-title-link')).textDecorationLine);
    await page.mouse.move(0, 0);
    await page.focus('#l .sf-table-resource[data-row-id="simai"] .sf-table-title-link');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    m.keys = await page.evaluate(() => {
      const row = document.querySelector('#l .sf-table-resource[data-current]');
      const style = row ? getComputedStyle(row) : null;
      const shop = document.querySelector('#l .sf-table-resource[data-row-id="shop"]');
      const link = row?.querySelector('.sf-table-title-link');
      return {cursor: row?.getAttribute('data-row-id') ?? null, fill: style?.backgroundImage ?? null,
        ring: style ? `${style.outlineStyle} ${style.outlineWidth}` : null,
        linkRing: link ? getComputedStyle(link).outlineStyle : null,
        open: document.querySelector('#l .sf-table-resource[aria-current="true"]')?.getAttribute('data-row-id') ?? null,
        openFill: getComputedStyle(shop).backgroundImage};
    });
    m.errors = errors;
    report[key] = m;

    const {ladder, published, rows} = m;
    // 1. The title.
    if (m.title.colour !== m.title.onSurface || m.title.colour === m.title.link) note({point: 1, said: 'the title is not the surface\'s text colour', got: m.title});
    if (m.title.weight !== m.title.medium) note({point: 1, said: 'the title is not medium weight', got: m.title});
    if (m.title.rest !== 'none' || m.title.hover !== 'underline') note({point: 1, said: 'the title is not underlined on hover only', got: m.title});
    // 2 and 7. The row model: two-line rows on the rung above the one-line row.
    const [link12, one12, wrapped12, three12] = rows.t12;
    const [link1, one1, wrapped1, three1] = rows.t1;
    if (link12 !== ladder.control2 || wrapped12 !== ladder.control2) note({point: 2, said: 'a two-line row at size 1/2 is not --sf-ui-2--control-height', got: rows.t12, ladder});
    if (three12 !== ladder.control2 + ladder.text12) note({point: 2, said: 'a three-line row at size 1/2 is not the two-line rung and a line', got: rows.t12, ladder});
    if (link1 !== ladder.control3 || wrapped1 !== ladder.control3) note({point: 7, said: 'a two-line row at size 1 is not --sf-ui-3--control-height', got: rows.t1, ladder});
    if (three1 !== ladder.control3 + ladder.text1) note({point: 7, said: 'a three-line row at size 1 is not the two-line rung and a line', got: rows.t1, ladder});
    if (desktop) {
      if (one12 !== ladder.control1) note({point: 2, said: 'a one-line row with its box and menu at size 1/2 is not --sf-ui-1--control-height', got: rows.t12, ladder});
      if (one1 !== ladder.control2) note({point: 7, said: 'a one-line row with its box and menu at size 1 is not --sf-ui-2--control-height (it was 73)', got: rows.t1, ladder});
      if (published.row12 !== one12 || published.twoLines12 !== link12 || published.row1 !== one1 || published.twoLines1 !== link1) {
        note({point: 2, said: 'the published row boxes are not the rows drawn', got: {published, rows}});
      }
    }
    // 3. The open record and the person's row.
    const want = theme === 'dark' ? m.open.alpha24 : m.open.alpha12;
    if (m.open.ariaCurrent !== 'true' || m.open.container !== want || !m.open.fill.includes(want)) note({point: 3, said: 'the open record has no aria-current or not the primary fill of its theme', got: m.open});
    if (m.keys.open !== 'shop' || !m.keys.openFill.includes(want)) note({point: 3, said: 'the keys moved the open record or its fill', got: m.keys});
    if (!m.keys.cursor || m.keys.cursor === 'shop' || m.keys.fill !== 'none' || !/^solid [1-9]/u.test(m.keys.ring ?? '') || m.keys.linkRing !== 'none') {
      note({point: 3, said: 'the person\'s row is filled, or shows no single ring', got: m.keys});
    }
    // 4. «more».
    if (desktop ? (m.more.half !== ladder.control12 || m.more.one !== ladder.control1) : (m.more.half !== ladder.control1 || m.more.one !== ladder.control1)) {
      note({point: 4, said: desktop ? '«more» is not its step\'s button on the desktop' : '«more» on a phone is not --sf-ui-1--control-height', got: m.more, ladder});
    }
    // 5. The fold, as built.
    if (desktop ? !(m.fold.wide && m.fold.at640 && m.fold.at560 === false) : m.fold.wide !== false) note({point: 5, said: 'the quick actions do not fold at 37.5rem', got: m.fold});
    // 6. One line (R077).
    for (const [name, edge] of Object.entries(m.edges)) {
      if (Math.abs(edge.fieldLeft) > 0.5 || edge.createRight === null || Math.abs(edge.createRight) > 0.5) note({point: 6, said: 'the field, «Создать» and the rows are not on one line', list: name, got: edge});
    }
    if (errors.length) note({said: 'the console is not clean', errors});
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({probe: 'table-look-points', result: failures.length ? 'TABLE_LOOK_POINTS_FAIL' : 'TABLE_LOOK_POINTS_OK', failures, report}, null, 1));
if (failures.length) process.exitCode = 1;
