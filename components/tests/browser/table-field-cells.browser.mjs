#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Cells that showed what a value is made of rather than what it says (the
// Fields page, 2026-11-05), measured on the built bytes: formatted text is its
// text, not its markup; a column of several documents shows each file's name
// with its icon (it drew nothing); one document is its name; and a date, a date
// and time and a time the host did not format read in the page's language,
// while a host's formatFieldValue still wins.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/reference-link/css/reference-link.css',
  'component/component/tags/css/tags.css', 'component/component/inputs/css/inputs.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/button-icon/js/button-icon.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/badge/js/badge.js', 'smart/smart/reference-link/js/reference-link.js', 'smart/smart/tag/js/tag.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/view-table/js/view-table.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  // Scripts added by path have no address for webpack's automatic publicPath;
  // that page error is the harness's, every other one is the component's.
  page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) note(`page error: ${error.message}`); });
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0">'
    + '<div style="width:1240px"><sf-view-table id="t" selectable="false"></sf-view-table></div>'
    + '<div style="width:600px"><sf-view-table id="host" selectable="false"></sf-view-table></div></body></html>');
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-view-table')));

  await page.evaluate(() => {
    const pdf = (label) => ({label, mime: 'application/pdf', href: '#file'});
    const columns = [
      {key: 'name', label: 'Запись'},
      {key: 'notes', label: 'Описание', propertyType: 'html'},
      {key: 'docs', label: 'Документы', propertyType: 'file', multiple: true},
      {key: 'one', label: 'Счёт', propertyType: 'file'},
      {key: 'day', label: 'Дата', propertyType: 'date'},
      {key: 'at', label: 'Начало', propertyType: 'datetime'},
      {key: 'time', label: 'Время', propertyType: 'time'},
    ];
    const row = {id: 'r1', name: 'Первая', notes: '<p>Этапы: <strong>дизайн</strong>, разработка.</p><ul><li>Запуск</li></ul>',
      docs: [pdf('Договор.pdf'), pdf('Акт.pdf')], one: pdf('Счёт № 45.pdf'), day: '2026-11-02', at: '2026-11-15T10:30:00', time: '09:30'};
    const table = document.getElementById('t');
    table.setColumns(columns);
    table.setRows([row]);
    const host = document.getElementById('host');
    host.cellHost = {formatFieldValue: (field) => (field.propertyType === 'date' ? 'по-своему' : undefined)};
    host.setColumns(columns.filter((column) => ['name', 'day'].includes(column.key)));
    host.setRows([row]);
  });
  await page.waitForTimeout(1200);

  const cells = await page.evaluate(() => {
    const cell = (id, key) => document.querySelector(`#${id} tbody td[data-key="${key}"]`);
    return {
      notes: cell('t', 'notes')?.textContent.trim().replace(/\s+/gu, ' '),
      notesMarkup: cell('t', 'notes')?.innerHTML.includes('&lt;') ?? null,
      docs: [...(cell('t', 'docs')?.querySelectorAll('sf-reference-link') ?? [])].map((link) => ({label: link.getAttribute('label') ?? link.label, icon: link.getAttribute('icon') ?? link.icon})),
      one: [...(cell('t', 'one')?.querySelectorAll('sf-reference-link') ?? [])].map((link) => link.getAttribute('label') ?? link.label),
      day: cell('t', 'day')?.textContent.trim(),
      at: cell('t', 'at')?.textContent.trim(),
      time: cell('t', 'time')?.textContent.trim(),
      own: cell('host', 'day')?.textContent.trim(),
    };
  });
  if (cells.notes !== 'Этапы: дизайн, разработка. Запуск' || cells.notesMarkup) note(`formatted text reads «${cells.notes}» (markup escaped: ${cells.notesMarkup})`);
  if (JSON.stringify(cells.docs.map((one) => one.label)) !== '["Договор.pdf","Акт.pdf"]') note(`several documents draw ${JSON.stringify(cells.docs)}`);
  if (!cells.docs.every((one) => one.icon === 'picture_as_pdf')) note(`a document is drawn without its icon: ${JSON.stringify(cells.docs)}`);
  if (JSON.stringify(cells.one) !== '["Счёт № 45.pdf"]') note(`one document draws ${JSON.stringify(cells.one)}`);
  const ru = (options, at) => new Intl.DateTimeFormat('ru', options).format(at);
  const expected = {
    day: ru({dateStyle: 'medium'}, new Date(2026, 10, 2)),
    at: ru({dateStyle: 'medium', timeStyle: 'short'}, new Date(2026, 10, 15, 10, 30)),
    time: ru({timeStyle: 'short'}, new Date(2000, 0, 1, 9, 30)),
  };
  for (const [key, text] of Object.entries(expected)) if (cells[key] !== text) note(`${key} reads «${cells[key]}», not «${text}»`);
  if (cells.own !== 'по-своему') note(`the host's formatFieldValue lost to the set: «${cells.own}»`);
  console.log(JSON.stringify(cells));
} finally {
  await browser.close();
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('TABLE_FIELD_CELLS_OK');
