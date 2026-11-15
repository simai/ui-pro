#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// view 1.6.1: the head row is on the ladder, and the published box agrees with
// the drawn tables under page density (C22, C27). Measured on the built bytes,
// light and dark, at 1280 and 390, on a normal and a compact page:
//   - every head -- with the box and sortable column controls or with names
//     only -- is a one-line row of its own table: 40 at 1/2 and 48 at 1 with
//     the box and controls, on a desktop names only too (they were 45/57
//     with controls, 37/41 without; published 33/41);
//   - --sf-table-head-block-size-* is the head drawn;
//   - the -1/2 names are the size="1/2" table on every page (a written size
//     is stronger than density): on a compact page too (they gave 36 there
//     beside the 40 drawn);
//   - the -1 names are the table without a size in the density they are read
//     in: on a compact page the compact table, in a data-sf-density="normal"
//     region the size="1" table.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css', 'component/component/icons/css/icons.css',
  'component/component/pagination/css/pagination.css',
  'component/component/inputs/css/inputs.css', 'component/component/buttons/css/buttons.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'smart/smart/input/css/input.css', 'smart/smart/button/css/button.css',
  'smart/smart/button-icon/css/button-icon.css', 'smart/smart/checkbox/css/checkbox.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/button-icon/js/button-icon.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/tag/js/tag.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js',
  'smart/smart/view-table/js/view-table.js',
].map((p) => join(out, p));

const COLUMNS = [{key: 'title', label: 'Название', role: 'title', sortable: true}, {key: 'status', label: 'Статус', sortable: true}, {key: 'owner', label: 'Владелец'}];
const ROWS = [1, 2, 3].map((n) => ({id: String(n), title: `Запись ${n}`, status: 'active', owner: 'Сотрудник', revision: 'r', actions: ['view']}));
const table = (id, attrs) => `<sf-view-table id="${id}" ${attrs} toolbar="false" aria-label="${id}"></sf-view-table>`;
const page = (density) => `<!doctype html><html lang="ru"${density === 'compact' ? ' data-sf-density="compact"' : ''}><head><meta charset="utf-8"></head><body style="margin:0;padding:16px">
  ${table('half', 'size="1/2"')}${table('one', 'size="1"')}${table('none', '')}
  ${table('half-plain', 'size="1/2" selectable="false" settings="false"')}${table('one-plain', 'size="1" selectable="false" settings="false"')}
  <div id="normal" data-sf-density="normal">${table('region-one', 'size="1"')}${table('region-none', '')}</div></body></html>`;

const failures = [];
const browser = await chromium.launch();
try {
  for (const scheme of ['light', 'dark']) for (const width of [1280, 390]) for (const density of ['normal', 'compact']) {
    const where = `${scheme} ${width} ${density}`;
    const context = await browser.newContext({viewport: {width, height: 1400}, colorScheme: scheme});
    const tab = await context.newPage();
    const errors = [];
    tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    tab.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(error.message); });
    await tab.setContent(page(density).replace('<html', `<html class="theme-${scheme}"`));
    for (const path of styles) await tab.addStyleTag({path}).catch(() => {});
    for (const path of modules) await tab.addScriptTag({path, type: 'module'}).catch(() => {});
    await tab.waitForFunction(() => customElements.get('sf-view-table'), null, {timeout: 15000});
    await tab.evaluate(({COLUMNS, ROWS}) => { for (const one of document.querySelectorAll('sf-view-table')) { one.setColumns(COLUMNS); one.setRows(ROWS); } }, {COLUMNS, ROWS});
    await tab.waitForTimeout(900);
    const read = await tab.evaluate(() => {
      const height = (element) => (element ? Math.round(element.getBoundingClientRect().height * 100) / 100 : null);
      const px = (name, host = document.body) => {
        const probe = document.createElement('div');
        probe.style.blockSize = `var(${name})`;
        host.append(probe);
        const value = probe.getBoundingClientRect().height;
        probe.remove();
        return value;
      };
      const drawn = Object.fromEntries([...document.querySelectorAll('sf-view-table')].map((one) => [one.id, {
        head: height(one.querySelector('thead tr')), row: height(one.querySelector('tbody tr[data-row-id]')),
        controls: one.querySelectorAll('thead input, thead button, thead [data-sort], thead .sf-table-sort').length}]));
      const published = (host) => ({
        row12: px('--sf-table-row-block-size-1\\/2', host), head12: px('--sf-table-head-block-size-1\\/2', host),
        row1: px('--sf-table-row-block-size-1', host), head1: px('--sf-table-head-block-size-1', host)});
      return {drawn, page: published(document.body), region: published(document.getElementById('normal')),
        ladder: {one: px('--sf-ui-1--control-height', document.getElementById('normal')), two: px('--sf-ui-2--control-height', document.getElementById('normal'))}};
    });
    const {drawn} = read;
    const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 0.5;
    // Every head is a one-line row of its own table.
    for (const [id, one] of Object.entries(drawn)) {
      if (!near(one.head, one.row)) failures.push(`${where}: ${id} head ${one.head} beside rows of ${one.row}`);
    }
    // On the ladder: 40 at 1/2 and 48 at 1 with the box and controls, on a
    // desktop and on a phone; the heads of names only on a desktop (on a
    // phone they stand on the phone's rung, 36 and 44, as their rows do).
    if (!near(drawn.half.head, 40) || !near(drawn.one.head, 48)) failures.push(`${where}: the heads with controls are ${drawn.half.head}/${drawn.one.head}, not 40/48`);
    if (width >= 1000 && (!near(drawn['half-plain'].head, 40) || !near(drawn['one-plain'].head, 48))) failures.push(`${where}: the heads of names are ${drawn['half-plain'].head}/${drawn['one-plain'].head}, not 40/48`);
    // The -1/2 names are the size="1/2" table; the -1 names the table without a size; a normal region reads size 1.
    const checks = [['row12', drawn.half.row], ['head12', drawn.half.head], ['row1', drawn.none.row], ['head1', drawn.none.head]];
    for (const [key, value] of checks) if (!near(read.page[key], value)) failures.push(`${where}: --${key} reads ${read.page[key]} on the page, the table draws ${value}`);
    for (const [key, value] of [['row1', drawn['region-one'].row], ['head1', drawn['region-one'].head], ['row12', drawn.half.row]]) {
      if (!near(read.region[key], value)) failures.push(`${where}: --${key} reads ${read.region[key]} in a normal region, the table draws ${value}`);
    }
    if (drawn.half.controls < 1) failures.push(`${where}: the 1/2 head draws no controls (${JSON.stringify(drawn.half)})`);
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
console.log('table head ladder: heads are one-line rows (40/48), the published box is the drawn one on normal and compact pages, light and dark, 1280 and 390');
