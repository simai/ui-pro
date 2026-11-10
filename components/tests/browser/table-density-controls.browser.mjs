#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Build output root is required: the free output with the set laid into
// smart/smart (scripts/run-browser-probes.mjs makes it).
//
// The controls inside sf-view-table and sf-view are relative (C22, a Larena
// report 2026-11-10): a host without a size writes no size on its toolbar
// buttons, row menus and row actions, so compact page density
// (data-sf-density="compact", desktop) moves them a rung down with the page
// -- --sf-ui-1--control-height reads 32 there -- and normal density keeps
// 40. A host with a size still hands it down: it keeps the rung it set,
// size="1" 40 and size="1/2" 32 under either density. Light and dark, 1280, clean
// console; every height is compared with the page's own ladder token.
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

const TABLE_COLUMNS = [{key: 'name', label: 'Сайт', renderer: 'link'}, {key: 'kind', label: 'Тип'}];
const TABLE_ROWS = [
  {id: 'a', name: {text: 'Интернет-магазин', href: '#a'}, kind: 'Laravel', actions: ['view', 'delete']},
  {id: 'b', name: {text: 'Блог', href: '#b'}, kind: 'Static', actions: ['view', 'delete']},
];
// The stands: a host and its size; what each control should measure is the
// ladder rung it reads on that page.
const HOSTS = [{id: 'none', size: ''}, {id: 'one', size: '1'}, {id: 'half', size: '1/2'}];

const failures = [];
const report = {};
const browser = await chromium.launch();
try {
  const normal = {};
  for (const theme of ['light', 'dark']) for (const density of ['normal', 'compact']) {
    const key = `${theme}-${density}`;
    const note = (detail) => failures.push({stand: key, ...detail});
    const page = await browser.newPage({viewport: {width: 1280, height: 1400}});
    await page.emulateMedia({colorScheme: theme});
    const errors = [];
    page.on('console', (message) => { if (message.type() === 'error' && !/publicPath/u.test(message.text())) errors.push(message.text()); });
    page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(error.message); });
    const stands = HOSTS.map(({id, size}) => {
      const sized = size ? ` size="${size}"` : '';
      return `<section data-host="${id}" style="margin-block-end:24px">
        <sf-view-table id="t-${id}"${sized} layout="table" aria-label="Таблица ${id}"></sf-view-table>
        <sf-view-table id="l-${id}"${sized} layout="list" layout-switch selectable="false" quick-actions="visit,restart" aria-label="Список ${id}"></sf-view-table>
        <sf-view id="v-${id}"${sized} chrome="toolbar" aria-label="Вид ${id}"><sf-view-table slot="content" id="vt-${id}"></sf-view-table></sf-view>
      </section>`;
    }).join('');
    await page.setContent(`<!doctype html><html class="theme-${theme}" lang="ru"${density === 'compact' ? ' data-sf-density="compact"' : ''}><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:var(--sf-surface-page)">${stands}</body></html>`);
    for (const path of styles) await page.addStyleTag({path});
    for (const path of modules) await page.addScriptTag({path, type: 'module'});
    await page.waitForFunction(() => Boolean(customElements.get('sf-view-table') && customElements.get('sf-view') && customElements.get('sf-segmented')), null, {timeout: 10000});
    await page.evaluate(({columns, rows, actions, tableColumns, tableRows}) => {
      for (const table of document.querySelectorAll('sf-view-table:not([slot])')) {
        table.ACTIONS_SETTINGS_ROW = actions;
        if (table.id.startsWith('t-')) { table.setColumns(tableColumns); table.setRows(tableRows); }
        else { table.setColumns(columns); table.setRows(rows); }
      }
      for (const view of document.querySelectorAll('sf-view')) {
        const records = tableRows.map(({actions: _, name, ...row}) => ({...row, name: name.text}));
        const hostColumns = tableColumns.map(({renderer, ...column}) => column);
        view.setHostPort({
          version: '1.14.0',
          async raise(intent, payload) {
            if (intent !== 'query.change') return {answer: 'applied'};
            return {answer: 'applied', sequence: payload.sequence, data: {records, total: records.length, columns: hostColumns,
              echo: {search: '', filters: {}, sort: [], page: 1, per_page: 25}}};
          },
        });
      }
    }, {columns: COLUMNS, rows: ROWS, actions: ACTIONS, tableColumns: TABLE_COLUMNS, tableRows: TABLE_ROWS});
    await page.waitForFunction(() => document.querySelectorAll('sf-view-table:not([slot]) tbody tr[data-row-id]').length >= 6, null, {timeout: 8000}).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    const drawn = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    if (drawn !== theme) errors.push(`the page is drawn in ${drawn}, not ${theme}`);
    const m = await page.evaluate((hosts) => {
      const probe = document.createElement('div');
      document.body.append(probe);
      const length = (name) => { probe.style.blockSize = `var(${name})`; return probe.getBoundingClientRect().height; };
      const height = (element) => Math.round(element.getBoundingClientRect().height * 100) / 100;
      const shown = (element) => element.getBoundingClientRect().width > 0 && !element.closest('.sf-input-field, sf-segmented');
      const result = {ladder: {one: length('--sf-ui-1--control-height'), half: length('--sf-ui-1\\/2--control-height')}, hosts: {}};
      for (const {id} of hosts) {
        const section = document.querySelector(`[data-host="${id}"]`);
        const buttons = (root, selector) => [...(root?.querySelectorAll(selector) ?? [])].filter(shown).map((element) => ({
          what: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 20) || element.className.slice(0, 40), height: height(element),
          size: element.closest('[size]:is(sf-button, sf-button-icon, sf-segmented)')?.getAttribute('size') ?? null}));
        result.hosts[id] = {
          toolbar: buttons(section.querySelector(`#t-${id} .sf-table-toolbar`), 'button'),
          rowMenus: buttons(section.querySelector(`#t-${id} tbody`), 'button'),
          headControls: buttons(section.querySelector(`#t-${id} thead`), 'button'),
          listActions: buttons(section.querySelector(`#l-${id} .sf-table-list`), 'button'),
          listToolbar: buttons(section.querySelector(`#l-${id} .sf-table-toolbar`), 'button'),
          viewToolbar: buttons(section.querySelector(`#v-${id}`), '.sf-table-toolbar button'),
          // The layout switch: the group is the button of its size (its segments sit a rung inside).
          switches: [...section.querySelectorAll(`#l-${id} .sf-table-layout-switch [role="radiogroup"]`)].filter((element) => element.getBoundingClientRect().width > 0).map((element) => ({what: 'layout switch', height: height(element), size: element.closest('sf-segmented').getAttribute('size')})),
          tableSize: section.querySelector(`#vt-${id}`)?.getAttribute('size') ?? null,
        };
      }
      probe.remove();
      return result;
    }, HOSTS);
    m.errors = errors;
    report[key] = m;
    if (density === 'normal') normal[theme] = m.ladder;
    for (const {id} of HOSTS) {
      // A host with a size keeps the rung it set, the normal ladder's; a host
      // without one takes the rung of the page's density.
      const want = id === 'none' ? m.ladder.one : (id === 'half' ? normal[theme].half : normal[theme].one);
      const host = m.hosts[id];
      for (const group of ['toolbar', 'rowMenus', 'listActions', 'listToolbar', 'viewToolbar', 'switches']) {
        if (!host[group].length) { note({host: id, group, said: 'no control found'}); continue; }
        for (const control of host[group]) {
          if (control.height !== want) note({host: id, group, said: 'a control is not its rung', control, want, ladder: m.ladder});
        }
      }
      if (id === 'none' && host.tableSize !== null) note({host: id, said: 'sf-view without a size writes a size on its table', got: host.tableSize});
      if (id !== 'none' && host.tableSize !== HOSTS.find((item) => item.id === id).size) note({host: id, said: 'sf-view does not hand its size to the table', got: host.tableSize});
    }
    if (density === 'compact' && m.ladder.one !== 32) note({said: 'compact density does not move --sf-ui-1--control-height to 32 at 1280', ladder: m.ladder});
    if (density === 'normal' && m.ladder.one !== 40) note({said: 'normal density is not 40 at 1280', ladder: m.ladder});
    if (errors.length) note({said: 'the console is not clean', errors});
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({probe: 'table-density-controls', result: failures.length ? 'TABLE_DENSITY_CONTROLS_FAIL' : 'TABLE_DENSITY_CONTROLS_OK', failures, report}, null, 1));
if (failures.length) process.exitCode = 1;
