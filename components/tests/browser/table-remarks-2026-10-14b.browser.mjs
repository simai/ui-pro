#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The owner's second round of 2026-10-14 (larena.test/admin/cms), measured on
// the built bytes:
// - one link in a table: the title, a link cell and a related record are the
//   link colour with no underline at rest, underlined on hover;
// - a column being moved shows the line it will stand at, not an outline of
//   the place it would take.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'component/component/inputs/css/inputs.css',
  'component/component/context-menu/css/context-menu.css',
  'component/component/checkbox/css/checkbox.css',
  'component/component/skeleton/css/skeleton.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
  'smart/smart/sortable/css/sortable.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js', 'smart/smart/sortable/js/sortable.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

const open = async () => {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
    <div style="width:1200px"><sf-table id="t" size="1/2"></sf-table></div></body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(1100);
  await page.evaluate(() => {
    const table = document.getElementById('t');
    table.setColumns([{key: 'name', label: 'Название'}, {key: 'city', label: 'Город'}, {key: 'code', label: 'Код'}]);
    table.setRows([{id: '1', name: 'Строка', city: 'Город', code: 'A1'}, {id: '2', name: 'Вторая', city: 'Другой', code: 'B2'}]);
  });
  await page.waitForTimeout(700);
  return page;
};

try {
  const page = await open();
  // The three kinds of link, drawn in a cell as the table draws them.
  const links = await page.evaluate(() => {
    const cell = document.querySelector('#t tbody td[data-key="city"]');
    cell.insertAdjacentHTML('beforeend', `<a class="sf-table-title-link" id="l-title" href="#a">Название</a>
      <a class="sf-table-link-cell" href="#b"><span class="sf-table-link-cell-text" id="l-cell">Ссылка</span></a>
      <sf-reference-link><div class="sf-reference-link"><div class="sf-reference-link-left"><a id="l-ref" href="#c">Раздел</a></div></div></sf-reference-link>`);
    const look = (id) => { const style = getComputedStyle(document.getElementById(id)); return {color: style.color, line: style.textDecorationLine}; };
    return {title: look('l-title'), cell: look('l-cell'), ref: look('l-ref')};
  });
  const colours = new Set(Object.values(links).map((one) => one.color));
  if (colours.size !== 1 || Object.values(links).some((one) => one.line !== 'none')) {
    note({case: 'one link style at rest', got: links, expected: 'one colour, no underline'});
  }
  await page.hover('#l-ref');
  const hovered = await page.evaluate(() => getComputedStyle(document.getElementById('l-ref')).textDecorationLine);
  if (hovered !== 'underline') note({case: 'a link is underlined on hover', got: hovered});

  // A heading dragged: the insertion line, two pixels, the height of the table.
  const head = await page.evaluate(() => {
    const box = document.querySelector('#t thead th[data-key="name"]').getBoundingClientRect();
    const target = document.querySelector('#t thead th[data-key="code"]').getBoundingClientRect();
    return {x: box.left + 20, y: box.top + box.height / 2, to: target.left + target.width * 0.75};
  });
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  await page.mouse.move(head.to, head.y, {steps: 10});
  const shown = await page.evaluate(() => ({
    line: (() => { const line = document.querySelector('.sf-sortable-indicator'); return line ? Math.round(line.getBoundingClientRect().width) : null; })(),
    outline: Boolean(document.querySelector('.sf-sortable-column-outline')),
  }));
  await page.mouse.up();
  if (shown.line !== 2 || shown.outline) note({case: 'a moving column shows its insertion line', got: shown});
  console.log(JSON.stringify({links, hovered, shown}));
  await page.close();
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('TABLE_REMARKS_2026_10_14B_OK');
