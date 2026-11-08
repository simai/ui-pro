#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Four things the record card got wrong (the Fields page and the home page of
// the set's site, 2026-11-05), measured on the built bytes at 1280 px:
// - a closed panel draws nothing: its round close button stood over the page
//   (sf-drawer leaves its edge strip in place when the panel slides out), and
//   it comes back when the panel opens;
// - a date the host did not format reads in the page's language, and a host
//   that formats it still wins;
// - a colour with a palette in a half-width field wraps inside its field and
//   does not run over the field beside it;
// - a datetime and a time are one sf-input-date each (mode datetime, time),
//   and an edited datetime is written back as ISO 8601.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/avatars/css/avatars.css',
  'component/component/reference-link/css/reference-link.css',
  'component/component/inputs/css/inputs.css', 'component/component/buttons/css/buttons.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'component/component/dropdown/css/dropdown.css', 'component/component/datepicker/css/datepicker.css',
  'component/component/tags/css/tags.css', 'component/component/textarea/css/textarea.css',
  'smart/smart/drawer/css/drawer.css', 'smart/smart/popover/css/popover.css',
  'smart/smart/input-color/css/input-color.css',
  'component/component/context-menu/css/context-menu.css',
  'smart/smart/view-properties/css/view-properties.css', 'smart/smart/sortable/css/sortable.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/input/js/input.js', 'smart/smart/button-icon/js/button-icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/button-copy/js/button-copy.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js', 'smart/smart/tag/js/tag.js',
  'smart/smart/input-date/js/input-date.js', 'smart/smart/input-color/js/input-color.js',
  'smart/smart/input-textarea/js/input-textarea.js',
  'smart/smart/switch/js/switch.js', 'smart/smart/segmented/js/segmented.js',
  'smart/smart/field-renderers/js/field-renderers.js', 'smart/smart/sortable/js/sortable.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/popover/js/popover.js',
  'smart/smart/view-properties/js/view-properties.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  // Scripts added by path have no address for webpack's automatic publicPath;
  // that page error is the harness's, every other one is the component's.
  page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) note(`page error: ${error.message}`); });
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0;padding:24px">
    <div style="display:grid;grid-template-columns:600px 600px;gap:24px">
      <div><sf-view-properties id="read" aria-label="Чтение" record-id="r1" mode="view"></sf-view-properties></div>
      <div><sf-view-properties id="edit" aria-label="Правка" record-id="r1" mode="edit"></sf-view-properties></div>
      <div><sf-view-properties id="formatted" aria-label="Свой формат" record-id="r1" mode="view"></sf-view-properties></div>
    </div>
    <sf-view-properties id="panel" aria-label="Панель" record-id="r1" panel open="false"></sf-view-properties>
  </body></html>`);
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-view-properties')));

  await page.evaluate(async () => {
    const SWATCHES = ['#1d4ed8', '#0f766e', '#b45309', '#be123c', '#6d28d9', '#334155'];
    const fields = [
      {key: 'birthday', label: 'Дата рождения', propertyType: 'date', value: '1990-04-12'},
      {key: 'meeting', label: 'Начало встречи', propertyType: 'datetime', value: '2026-11-15T10:30:00'},
      {key: 'workday', label: 'Начало дня', propertyType: 'time', value: '09:00'},
      {key: 'tag', label: 'Цвет метки', propertyType: 'color', swatches: SWATCHES, value: '#0f766e'},
      {key: 'brand', label: 'Цвет бренда', propertyType: 'color', value: '#1d4ed8'},
    ];
    const card = () => ({record_id: 'r1', collection: 'demo', revision: '1', label: 'Первая запись', actions: ['record.edit'],
      sections: [{key: 'main', label: 'Поля', groups: [{key: 'g', label: 'Поля', columns: 2, fields: fields.map((field) => ({width: 'half', ...field}))}]}]});
    const host = (format) => ({version: '1.17.0', capabilities: [], async raise(intent) {
      if (intent === 'record.load') return {answer: 'applied', record: card()};
      return {answer: 'unavailable', reason: 'capability-not-provided'};
    }, ...(format ? {formatFieldValue: (field) => (field.propertyType === 'date' ? 'по-своему' : undefined)} : {})});
    for (const id of ['read', 'edit', 'panel']) document.getElementById(id).setHostPort(host(false));
    document.getElementById('formatted').setHostPort(host(true));
  });
  await page.waitForFunction(() => ['read', 'edit', 'formatted'].every((id) => document.querySelector(`#${id} [data-field="workday"]`)));
  await page.waitForTimeout(800);

  // The closed panel: nothing of it is drawn, and nothing of it takes a press.
  const closedPanel = () => page.evaluate(() => {
    const edge = document.querySelector('.sf-property-view-edge');
    const close = edge?.querySelector('[data-action="close"] button') ?? edge?.querySelector('[data-action="close"]');
    const box = close?.getBoundingClientRect();
    const hit = box && box.width ? document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) : null;
    const panel = document.querySelector('.sf-property-view-panel')?.closest('.sf-drawer-panel');
    return {
      edge: Boolean(edge), edgeVisibility: edge ? getComputedStyle(edge).visibility : null,
      closeHit: Boolean(hit && close && (hit === close || close.contains(hit))),
      hit: hit ? `${hit.localName}.${[...hit.classList].join('.')}` : null, box: box ? [box.x, box.y, box.width, box.height] : null,
      count: document.querySelectorAll('.sf-property-view-edge').length, closeTag: close?.localName ?? null,
      panelVisibility: panel ? getComputedStyle(panel).visibility : null,
    };
  });
  const closed = await closedPanel();
  if (closed.edgeVisibility === 'visible' || closed.closeHit) note(`a closed panel draws its close button: ${JSON.stringify(closed)}`);
  if (closed.panelVisibility === 'visible') note(`a closed panel is visible past the window's edge: ${JSON.stringify(closed)}`);
  await page.evaluate(() => document.getElementById('panel').setAttribute('open', 'true'));
  await page.waitForTimeout(700);
  const open = await closedPanel();
  if (!open.edge || open.edgeVisibility !== 'visible' || !open.closeHit || open.panelVisibility !== 'visible') note(`an open panel has no close button to press: ${JSON.stringify(open)}`);
  await page.evaluate(() => document.getElementById('panel').setAttribute('open', 'false'));
  await page.waitForTimeout(700);
  const closedAgain = await closedPanel();
  if (closedAgain.edgeVisibility === 'visible' || closedAgain.closeHit || closedAgain.panelVisibility === 'visible') note(`a panel closed again still draws: ${JSON.stringify(closedAgain)}`);

  // Dates read in the page's language; the host's own text wins.
  const shown = await page.evaluate(() => Object.fromEntries(['birthday', 'meeting', 'workday'].map((key) => [key,
    document.querySelector(`#read [data-field="${key}"] .sf-field-view`)?.textContent.trim() ?? null])));
  const ru = (options, at) => new Intl.DateTimeFormat('ru', options).format(at);
  const expected = {
    birthday: ru({dateStyle: 'medium'}, new Date(1990, 3, 12)),
    meeting: ru({dateStyle: 'medium', timeStyle: 'short'}, new Date(2026, 10, 15, 10, 30)),
    workday: ru({timeStyle: 'short'}, new Date(2000, 0, 1, 9, 0)),
  };
  for (const [key, text] of Object.entries(expected)) {
    if (shown[key] !== text) note(`${key} reads «${shown[key]}», not «${text}»`);
  }
  const own = await page.evaluate(() => document.querySelector('#formatted [data-field="birthday"] .sf-field-view')?.textContent.trim());
  if (own !== 'по-своему') note(`the host's formatFieldValue lost to the set: «${own}»`);

  // The palette stays inside its half of the row.
  const colour = await page.evaluate(() => {
    const field = document.querySelector('#edit [data-field="tag"]');
    const beside = document.querySelector('#edit [data-field="workday"]') ?? document.querySelector('#edit [data-field="brand"]');
    const box = field.getBoundingClientRect();
    const presets = [...field.querySelectorAll('.sf-color-preset')].map((preset) => preset.getBoundingClientRect());
    return {right: box.right, presets: presets.length, furthest: Math.max(...presets.map((one) => one.right)),
      besideLeft: beside.getBoundingClientRect().left, fieldLeft: box.left};
  });
  if (colour.presets !== 6) note(`the palette draws ${colour.presets} swatches`);
  if (colour.furthest > colour.right + 1) note(`a swatch ends at ${colour.furthest}px, past its field at ${colour.right}px`);

  // One control for a datetime and one for a time.
  const editors = await page.evaluate(() => ({
    meeting: [...document.querySelectorAll('#edit [data-field="meeting"] sf-input-date')].map((one) => one.getAttribute('mode')),
    workday: [...document.querySelectorAll('#edit [data-field="workday"] sf-input-date')].map((one) => one.getAttribute('mode')),
    pair: document.querySelectorAll('#edit .sf-property-view-datetime, #edit .sf-property-view-datetime-time').length,
    shownDay: document.querySelector('#edit [data-field="meeting"] sf-input-date input')?.value ?? null,
  }));
  if (JSON.stringify(editors.meeting) !== '["datetime"]') note(`a datetime is edited with ${JSON.stringify(editors.meeting)}`);
  if (JSON.stringify(editors.workday) !== '["time"]') note(`a time is edited with ${JSON.stringify(editors.workday)}`);
  if (editors.pair) note('the view still draws its own day-and-time pair');
  if (editors.shownDay !== '15.11.2026 10:30') note(`the datetime control shows «${editors.shownDay}»`);

  // A datetime typed in whole is written back as ISO 8601.
  const input = '#edit [data-field="meeting"] sf-input-date input';
  await page.click(input);
  await page.fill(input, '');
  await page.keyboard.type('16.11.2026 11:45', {delay: 10});
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  const written = await page.evaluate(() => document.getElementById('edit').changed.get('meeting') ?? null);
  if (written !== '2026-11-16T11:45:00') note(`a datetime typed as «16.11.2026 11:45» is written as ${JSON.stringify(written)}`);

  console.log(JSON.stringify({closed, open, closedAgain, shown, own, colour, editors, written}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('PROPERTY_VIEW_FIELDS_OK');
