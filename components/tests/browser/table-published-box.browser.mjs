#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-table publishes its box on :root (docs/docs.md, «Коробка списка»), so a
// page can hold a list's room before it draws without typing pixels in
// (Larena, 2026-10-28). Measured on the built bytes, at size 1/2 and 1: each
// published length is what the table draws -- a one-line row, a two-line row,
// the head, the toolbar and its gap -- and the formula of the docs gives the
// height of the drawn section.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'component/component/inputs/css/inputs.css', 'component/component/buttons/css/buttons.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'smart/smart/input/css/input.css', 'smart/smart/button/css/button.css',
  'smart/smart/icon-button/css/icon-button.css', 'smart/smart/checkbox/css/checkbox.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js', 'smart/smart/tabs/js/tabs.js',
  'smart/smart/tag/js/tag.js', 'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const TWO = 'Длинное название записи, которое занимает две строки';
const answer = {
  records: [1, 2, 3, 4].map((n) => ({id: String(n), revision: 'r', title: n === 3 ? TWO : `Запись ${n}`, state: 'Опубликована'})),
  total: 4, echo: {page: 1, per_page: 20}, columns: [{key: 'title', label: 'Название', width: 180}, {key: 'state', label: 'Состояние'}],
};
const view = (size) => `<div style="width:1000px;margin-block-end:40px"><sf-data-view id="v${size === '1/2' ? 'half' : 'one'}" aria-label="Список" size="${size}" chrome="toolbar select settings">
  <script type="application/json" data-sf-settings>${JSON.stringify({'first-answer': answer})}</script>
  <sf-table slot="content" aria-label="Список"></sf-table></sf-data-view></div>`;

const failures = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  await page.setContent(`<!doctype html><html class="theme-light"><head><style>sf-table { --sf-table-cell--line-clamp: 2; }</style></head>
    <body style="margin:0">${view('1/2')}${view('1')}</body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(1500);
  const read = await page.evaluate(() => {
    const px = (name) => {
      const probe = document.createElement('div');
      probe.style.blockSize = `var(${name})`;
      document.body.append(probe);
      const value = probe.getBoundingClientRect().height;
      probe.remove();
      return value;
    };
    const height = (element) => (element ? Math.round(element.getBoundingClientRect().height * 100) / 100 : null);
    return [['half', '1\\/2'], ['one', '1']].map(([id, step]) => {
      const table = document.querySelector(`#v${id} sf-table`);
      const rows = [...table.querySelectorAll('tbody tr[data-row-id]')].map(height);
      return {
        step,
        size: table.getAttribute('size'),
        drawn: {row: rows[0], twoLines: rows[2], head: height(table.querySelector('thead tr')),
          toolbar: height(table.querySelector('.sf-table-toolbar')), section: height(table.querySelector('.sf-table')), rows},
        published: {row: px(`--sf-table-row-block-size-${step}`), twoLines: px(`--sf-table-row-2-lines-block-size-${step}`),
          head: px(`--sf-table-head-block-size-${step}`), toolbar: px(`--sf-table-toolbar-block-size-${step}`), gap: px('--sf-table-toolbar-gap')},
      };
    });
  });
  for (const one of read) {
    const {drawn, published} = one;
    for (const key of ['row', 'twoLines', 'head', 'toolbar']) {
      if (!(published[key] > 0) || Math.abs(published[key] - drawn[key]) > 0.5) failures.push(`size ${one.step}: ${key} published ${published[key]} px, drawn ${drawn[key]} px`);
    }
    const formula = published.toolbar + published.gap + published.head + 3 * published.row + published.twoLines;
    if (Math.abs(formula - drawn.section) > 1) failures.push(`size ${one.step}: the docs' formula gives ${formula} px, the section is ${drawn.section} px (${JSON.stringify(one)})`);
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
console.log('table published box: row, two-line row, head, toolbar and gap are what the table draws at 1/2 and 1');
