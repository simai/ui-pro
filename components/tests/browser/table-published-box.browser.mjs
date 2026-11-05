#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-view-table publishes its box on :root (docs/docs.md, «Коробка списка»), so a
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
  'smart/smart/button-icon/css/button-icon.css', 'smart/smart/checkbox/css/checkbox.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/resizer/css/resizer.css',
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

const TWO = 'Длинное название записи, которое занимает две строки';
// The records offer an action, so each row has a menu and the list draws its
// whole chrome: since sf-view-table 1.15.0 a settings column with nothing to
// open (no column settings, no row actions) is not drawn, and the published
// box is the box of a list with its chrome.
const answer = {
  records: [1, 2, 3, 4].map((n) => ({id: String(n), revision: 'r', title: n === 3 ? TWO : `Запись ${n}`, state: 'Опубликована', actions: ['archive']})),
  row_actions: [{id: 'archive', label: 'В архив'}],
  total: 4, echo: {page: 1, per_page: 20}, columns: [{key: 'title', label: 'Название', width: 180}, {key: 'state', label: 'Состояние'}],
};
const view = (size) => `<div style="width:1000px;margin-block-end:40px"><sf-view id="v${size === '1/2' ? 'half' : 'one'}" aria-label="Список" size="${size}" chrome="toolbar select settings">
  <script type="application/json" data-sf-settings>${JSON.stringify({'first-answer': answer})}</script>
  <sf-view-table slot="content" aria-label="Список"></sf-view-table></sf-view></div>`;

const failures = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  await page.setContent(`<!doctype html><html class="theme-light"><head><style>sf-view-table { --sf-table-cell--line-clamp: 2; }</style></head>
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
      const table = document.querySelector(`#v${id} sf-view-table`);
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
  // Only the sheet linked, no table on the page: the values are on :root,
  // read from script by their CSSOM names (unescaped), in px, and they are
  // the drawn ones (Larena read them empty after load, 2026-10-28).
  const bare = await browser.newPage();
  await bare.setContent('<!doctype html><html class="theme-light"><body></body></html>');
  for (const path of ['core/core/css/core.css', 'smart/smart/view-table/css/view-table.css']) await bare.addStyleTag({path: join(out, path)});
  const sheetOnly = await bare.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['1/2', '1'].flatMap((step) => [
      [`row ${step}`, style.getPropertyValue(`--sf-table-row-block-size-${step}`)],
      [`twoLines ${step}`, style.getPropertyValue(`--sf-table-row-2-lines-block-size-${step}`)],
      [`head ${step}`, style.getPropertyValue(`--sf-table-head-block-size-${step}`)],
      [`toolbar ${step}`, style.getPropertyValue(`--sf-table-toolbar-block-size-${step}`)],
    ]).concat([['gap', style.getPropertyValue('--sf-table-toolbar-gap')]]));
  });
  for (const one of read) {
    const step = one.step.replace('\\', '');
    for (const key of ['row', 'twoLines', 'head', 'toolbar']) {
      const text = sheetOnly[`${key} ${step}`];
      if (!/^\d+(\.\d+)?px$/u.test(text) || Math.abs(Number.parseFloat(text) - one.drawn[key]) > 0.5) {
        failures.push(`with only the sheet linked, ${key} ${step} reads «${text}» on :root, drawn ${one.drawn[key]} px`);
      }
    }
  }
  if (sheetOnly.gap !== '8px') failures.push(`with only the sheet linked, the toolbar gap reads «${sheetOnly.gap}»`);
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
