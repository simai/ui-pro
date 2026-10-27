#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// A datetime field is edited as a day and a time (Larena acceptance on
// larena.test, 2026-10-22: «Дата и время» edited only the day, so a new record
// could not get a time and «15.11.2026 10:30» was saved as «15.11.2026»).
// Measured on the built bytes with a host port that answers 1.12.0, a record
// open all at once (mode edit), at both sizes of the view and at 360px:
// - the day (sf-datepicker) and the time (sf-input, hh:mm) stand on one row,
//   at one height, each with its own accessible name;
// - the stored value shows: 15.11.2026 and 10:30;
// - an untouched datetime is not written;
// - a day without a time is said under the field and stops the save; the time
//   typed as 0930 makes 09:30 and the value is ISO 8601 with the time;
// - a changed time keeps the record's zone; clearing both writes null;
// - a time that is not one (25:00) is said under the field.
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
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/input/js/input.js', 'smart/smart/tree/js/tree.js',
  'smart/smart/tree-item/js/tree-item.js', 'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/button/js/button.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js',
  'smart/smart/tag/js/tag.js',
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
  const page = await browser.newPage({viewport: {width: 1100, height: 900}});
  page.on('pageerror', (error) => console.error('pageerror', error.message));
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-property-view')));

  const make = (size) => page.evaluate(async (size) => {
    document.body.replaceChildren();
    window.raised = [];
    const view = document.createElement('sf-property-view');
    view.id = 'view';
    view.setAttribute('record-id', 'r1');
    view.setAttribute('collection', 'events');
    view.setAttribute('mode', 'edit');
    if (size) view.setAttribute('size', size);
    view.style.cssText = 'display:block;width:640px';
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
      async raise(intent, payload) {
        window.raised.push({intent, payload: JSON.parse(JSON.stringify(payload ?? {}))});
        if (intent === 'record.load') return {answer: 'applied', record};
        if (intent === 'record.save') return {answer: 'applied', record};
        return {answer: 'applied'};
      },
    });
    for (let tries = 0; tries < 80 && !view.sections?.length; tries += 1) await new Promise((done) => setTimeout(done, 50));
    await new Promise((done) => setTimeout(done, 500));
  }, size);

  const field = (key) => `sf-property-view [data-field="${key}"]`;
  const dateInput = (key) => `${field(key)} sf-datepicker input`;
  const timeInput = (key) => `${field(key)} .sf-property-view-datetime-time input`;
  const look = (key) => page.evaluate(({key}) => {
    const root = document.querySelector(`sf-property-view [data-field="${key}"]`);
    const row = root.querySelector('.sf-property-view-datetime');
    const box = (element) => {
      const frame = element?.querySelector('.sf-input') ?? element;
      const rect = frame?.getBoundingClientRect();
      return rect ? {top: Math.round(rect.top), height: Math.round(rect.height), width: Math.round(rect.width)} : null;
    };
    const date = root.querySelector('sf-datepicker');
    const time = root.querySelector('.sf-property-view-datetime-time');
    return {
      row: Boolean(row),
      date: box(date), time: box(time),
      dateLabel: date?.querySelector('input')?.getAttribute('aria-label') ?? null,
      timeLabel: time?.querySelector('input')?.getAttribute('aria-label') ?? null,
      dateValue: date?.querySelector('input')?.value ?? null,
      timeValue: time?.querySelector('input')?.value ?? null,
      error: root.querySelector('.sf-property-view-field-error')?.textContent.trim() ?? null,
      rawInputs: root.querySelectorAll('input[type="time"]').length,
    };
  }, {key});
  const saves = () => page.evaluate(async () => {
    const answer = await document.getElementById('view').saveAll();
    await new Promise((done) => setTimeout(done, 200));
    return {answer: answer?.answer ?? null, reason: answer?.reason ?? null,
      values: window.raised.filter((one) => one.intent === 'record.save').map((one) => one.payload.values)};
  });
  // Focused, not clicked: a click on the day opens the calendar and the keys
  // would go to its grid. The text is replaced, typed key by key (the mask
  // reads keys), and Tab leaves the field, which is when it says it changed.
  const typeInto = async (selector, text) => {
    await page.focus(selector);
    await page.fill(selector, '');
    if (text) await page.keyboard.type(text, {delay: 10});
    await page.keyboard.press('Tab');
    await page.waitForTimeout(250);
  };

  const results = {};
  for (const size of ['1', '1/2']) {
    await make(size);
    const shown = await look('starts');
    results[`shown ${size}`] = shown;
    if (!shown.row || !shown.date || !shown.time || shown.date.top !== shown.time.top || shown.date.height !== shown.time.height
        || shown.time.width >= shown.date.width || shown.rawInputs) {
      note({case: `one row, one height (size ${size})`, got: shown});
    }
    if (shown.dateLabel !== 'Начало: дата' || shown.timeLabel !== 'Начало: время') note({case: `accessible names (size ${size})`, got: shown});
    if (shown.dateValue !== '15.11.2026' || shown.timeValue !== '10:30') note({case: `the stored value shows (size ${size})`, got: shown});
  }

  // Narrow: the row stays inside its field, the time keeps its width.
  await page.setViewportSize({width: 360, height: 800});
  await make('1');
  const narrow = await page.evaluate(() => {
    const field = document.querySelector('sf-property-view [data-field="starts"]').getBoundingClientRect();
    const time = document.querySelector('sf-property-view [data-field="starts"] .sf-property-view-datetime-time-field').getBoundingClientRect();
    const date = document.querySelector('sf-property-view [data-field="starts"] sf-datepicker .sf-input').getBoundingClientRect();
    return {fieldRight: Math.round(field.right), timeRight: Math.round(time.right), timeTop: Math.round(time.top), dateTop: Math.round(date.top),
      timeWidth: Math.round(time.width),
      // The footer bleeds into the gutter on purpose; what is measured is the row.
      rowRight: Math.round(Math.max(...[...document.querySelectorAll('sf-property-view [data-field="starts"] .sf-property-view-datetime *')]
        .map((element) => element.getBoundingClientRect().right)))};
  });
  results.narrow = narrow;
  if (narrow.timeRight > narrow.fieldRight || narrow.timeTop !== narrow.dateTop || narrow.rowRight > narrow.fieldRight) note({case: 'narrow', got: narrow});
  await page.setViewportSize({width: 1100, height: 900});

  // Untouched: only the field the person changed is written.
  await make('1');
  await page.evaluate(() => document.getElementById('view').changeField({key: 'title'}, 'Совещание'));
  const untouched = await saves();
  results.untouched = untouched;
  if (untouched.values.length !== 1 || 'starts' in untouched.values[0] || 'ends' in untouched.values[0]) note({case: 'an untouched datetime is not written', got: untouched});

  // A new value: a day, then the time.
  await make('1');
  await typeInto(dateInput('ends'), '20.11.2026');
  const dayOnly = await look('ends');
  const blocked = await saves();
  results.dayOnly = {dayOnly, blocked};
  if (dayOnly.error !== 'Укажите время' || blocked.answer !== 'refused' || blocked.values.length) note({case: 'a day without a time', got: {dayOnly, blocked}});
  await typeInto(timeInput('ends'), '0930');
  const both = await look('ends');
  const written = await saves();
  results.both = {both, written};
  if (both.error !== null || both.timeValue !== '09:30' || written.values.length !== 1 || written.values[0].ends !== '2026-11-20T09:30:00' || 'starts' in written.values[0]) {
    note({case: 'a new day and time', got: {both, written}});
  }

  // A changed time keeps the record's zone.
  await make('1');
  await typeInto(timeInput('starts'), '18:05');
  const retimed = await saves();
  results.retimed = retimed;
  if (retimed.values[0]?.starts !== '2026-11-15T18:05:00+03:00') note({case: 'a changed time', got: retimed});

  // Back to what it was writes nothing.
  await make('1');
  await typeInto(timeInput('starts'), '18:05');
  await typeInto(timeInput('starts'), '10:30');
  await page.evaluate(() => document.getElementById('view').changeField({key: 'title'}, 'Совещание'));
  const restored = await saves();
  results.restored = restored;
  if ('starts' in (restored.values[0] ?? {})) note({case: 'back to the stored time', got: restored});

  // Clearing both.
  await make('1');
  await typeInto(dateInput('starts'), '');
  await typeInto(timeInput('starts'), '');
  const cleared = await saves();
  results.cleared = cleared;
  if (cleared.values[0]?.starts !== null) note({case: 'clearing both', got: cleared});

  // A time that is not one.
  await make('1');
  await typeInto(timeInput('starts'), '25:00');
  const wrong = await look('starts');
  const wrongSave = await saves();
  results.wrong = {wrong, wrongSave};
  if (!wrong.error?.startsWith('Укажите время в виде чч:мм') || wrongSave.answer !== 'refused' || wrongSave.values.length) note({case: 'a time that is not one', got: {wrong, wrongSave}});

  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('PROPERTY_VIEW_DATETIME_OK');
