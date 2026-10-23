#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// A panel asks to close with everything that would be lost, on every way out
// (Larena acceptance of larena-9f3e80fb16e3 on larena.test, 2026-10-22):
// - «Отменить» on a changed form announces the close with the changed fields
//   counted, as the cross and Esc do, and the entries stay until the host
//   closes the panel -- it discarded them first and then reported nothing;
// - a day picked in the calendar for a datetime whose time is still empty is
//   counted, so Esc after the calendar closed does not lose it silently;
// - a time typed and left focused is counted when Esc is pressed in it;
// - an untouched form still reports nothing unsaved.
// Measured on the built bytes, a record open in a panel (mode edit, port 1.12.0).
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/avatars/css/avatars.css',
  'component/component/reference-link/css/reference-link.css',
  'component/component/inputs/css/inputs.css', 'component/component/tree/css/tree.css',
  'component/component/buttons/css/buttons.css',
  'component/component/dropdown/css/dropdown.css',
  'smart/smart/drawer/css/drawer.css',
  'component/component/datepicker/css/datepicker.css',
  'component/component/tags/css/tags.css',
  'component/component/textarea/css/textarea.css',
  'smart/smart/popover/css/popover.css',
  'component/component/context-menu/css/context-menu.css',
  'smart/smart/property-view/css/property-view.css',
  'smart/smart/sortable/css/sortable.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js', 'smart/smart/badges/js/badges.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/inputs/js/inputs.js', 'smart/smart/tree/js/tree.js',
  'smart/smart/tree-item/js/tree-item.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/buttons/js/buttons.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js',
  'smart/smart/tags/js/tags.js',
  'smart/smart/datepicker/js/datepicker.js', 'smart/smart/textarea/js/textarea.js',
  'smart/smart/switch/js/switch.js', 'smart/smart/button-group/js/button-group.js',
  'smart/smart/field-renderers/js/field-renderers.js',
  'smart/smart/sortable/js/sortable.js',
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/popover/js/popover.js',
  'smart/smart/property-view/js/property-view.js',
].map((p) => join(out, p));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.join(', ')}`);

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1200, height: 900}});
  page.on('pageerror', (error) => console.error('pageerror', error.message));
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-property-view')));

  // The host keeps the panel: it only writes down what was announced, so what
  // happens after a «no» to its question can be read.
  const make = () => page.evaluate(async () => {
    document.querySelectorAll('sf-property-view').forEach((one) => one.remove());
    document.querySelectorAll('[data-sf-drawer-root]').forEach((one) => one.remove());
    window.announced = [];
    const view = document.createElement('sf-property-view');
    view.id = 'view';
    view.setAttribute('record-id', 'r1');
    view.setAttribute('collection', 'events');
    view.setAttribute('mode', 'edit');
    view.setAttribute('panel', '');
    for (const name of ['sf-property-view-close', 'sf-property-view-cancel']) {
      view.addEventListener(name, (event) => window.announced.push({name, reason: event.detail?.reason ?? null,
        unsaved: event.detail?.unsaved_fields ?? null}));
    }
    document.body.append(view);
    const record = {
      record_id: 'r1', revision: '7', actions: ['record.edit'],
      sections: [{key: 'main', label: 'Основное', groups: [
        {key: 'when', label: 'Когда', columns: 1, fields: [
          {key: 'title', label: 'Название', propertyType: 'string', value: 'Встреча'},
          {key: 'starts', label: 'Начало', propertyType: 'datetime', value: '2026-11-15T10:30:15+03:00'},
          {key: 'ends', label: 'Окончание', propertyType: 'datetime', value: null},
        ]},
      ]}],
    };
    view.setHostPort({
      version: '1.12.0', capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') return {answer: 'applied', record};
        return {answer: 'applied'};
      },
    });
    for (let tries = 0; tries < 80 && !view.sections?.length; tries += 1) await new Promise((done) => setTimeout(done, 50));
    await new Promise((done) => setTimeout(done, 600));
  });
  const closes = () => page.evaluate(() => window.announced.filter((one) => one.name === 'sf-property-view-close'));
  const field = (key) => `.sf-property-view-panel [data-field="${key}"]`;
  const cancel = () => page.click('.sf-property-view-panel .sf-property-view-actions [data-action="cancel"]');

  const results = {};

  // Untouched: «Отменить» reports nothing unsaved.
  await make();
  await cancel();
  await page.waitForTimeout(200);
  results.cleanCancel = await closes();
  if (results.cleanCancel.length !== 1 || results.cleanCancel[0].reason !== 'cancelled' || results.cleanCancel[0].unsaved !== 0) {
    note({case: 'an untouched form: «Отменить» closes with nothing unsaved', got: results.cleanCancel});
  }

  // Changed: «Отменить» counts the change, and the change survives a «no».
  await make();
  await page.evaluate(() => document.getElementById('view').changeField({key: 'title'}, 'Совещание'));
  await cancel();
  await page.waitForTimeout(200);
  results.dirtyCancel = {closes: await closes(), kept: await page.evaluate(() => document.getElementById('view').changed.get('title') ?? null)};
  if (results.dirtyCancel.closes.length !== 1 || results.dirtyCancel.closes[0].reason !== 'cancelled' || results.dirtyCancel.closes[0].unsaved !== 1
      || results.dirtyCancel.kept !== 'Совещание') {
    note({case: '«Отменить» on a changed form asks like the cross and Esc, and keeps the entry', got: results.dirtyCancel});
  }

  // A day picked in the calendar, the calendar closed with Esc, then Esc again.
  await make();
  await page.click(`${field('ends')} sf-datepicker input`);
  await page.waitForSelector('.sf-datepicker-day:not(.sf-datepicker-another-month):not([disabled])', {timeout: 3000});
  await page.click('.sf-datepicker-day:not(.sf-datepicker-another-month):not([disabled])');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  results.pickedDay = await closes();
  const lastDay = results.pickedDay.at(-1);
  if (!lastDay || lastDay.reason !== 'escape' || lastDay.unsaved < 1) {
    note({case: 'a day picked in the calendar is counted when Esc closes', got: results.pickedDay});
  }

  // A time typed and left focused, then Esc in the field.
  await make();
  await page.focus(`${field('starts')} .sf-property-view-datetime-time input`);
  await page.fill(`${field('starts')} .sf-property-view-datetime-time input`, '');
  await page.keyboard.type('1805', {delay: 10});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  results.focusedTime = await closes();
  const lastTime = results.focusedTime.at(-1);
  if (!lastTime || lastTime.reason !== 'escape' || lastTime.unsaved !== 1) {
    note({case: 'a time typed and still focused is counted when Esc closes', got: results.focusedTime});
  }

  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('PROPERTY_VIEW_CLOSE_OK');
