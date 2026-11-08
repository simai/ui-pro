#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// A datetime field is edited as a day and a time (Larena acceptance on
// larena.test, 2026-10-22: «Дата и время» edited only the day, so a new record
// could not get a time and «15.11.2026 10:30» was saved as «15.11.2026»).
// Since 1.10.0 the editor is the renderer set's sf-input-date in mode datetime
// (and mode time for a time of day): one control, the calendar with the time
// row under it, typed as «15.11.2026 10:30». Measured on the built bytes with
// a host port that answers 1.12.0, a record open all at once (mode edit), at
// both sizes of the view and at 360px:
// - one sf-input-date per field, in its mode, named by the field's label, and
//   no pair of the view's own;
// - the stored value shows: «15.11.2026 10:30», and «09:30» for a time;
// - an untouched datetime is not written;
// - a new value typed whole is ISO 8601 with the time; a text that is not a
//   whole value writes nothing;
// - a changed time keeps the record's zone; a time of day brought back to
//   what it held writes nothing; clearing writes null; a time of day is written as hh:mm.
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
  'smart/smart/view-properties/css/view-properties.css',
  'smart/smart/sortable/css/sortable.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/input/js/input.js', 'smart/smart/tree/js/tree.js',
  'smart/smart/tree-item/js/tree-item.js', 'smart/smart/button-icon/js/button-icon.js',
  'smart/smart/button/js/button.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js',
  'smart/smart/tag/js/tag.js',
  'smart/smart/input-date/js/input-date.js', 'smart/smart/input-textarea/js/input-textarea.js',
  'smart/smart/switch/js/switch.js', 'smart/smart/segmented/js/segmented.js',
  'smart/smart/field-renderers/js/field-renderers.js',
  'smart/smart/sortable/js/sortable.js',
  'smart/smart/menu-context/js/menu-context.js',
  'smart/smart/popover/js/popover.js',
  'smart/smart/view-properties/js/view-properties.js',
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
  await page.waitForFunction(() => Boolean(customElements.get('sf-view-properties')));

  const make = (size) => page.evaluate(async (size) => {
    document.body.replaceChildren();
    window.raised = [];
    const view = document.createElement('sf-view-properties');
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
          {key: 'remind', label: 'Напоминание', propertyType: 'time', value: '09:30'},
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

  const field = (key) => `sf-view-properties [data-field="${key}"]`;
  const input = (key) => `${field(key)} sf-input-date input`;
  const look = (key) => page.evaluate(({key}) => {
    const root = document.querySelector(`sf-view-properties [data-field="${key}"]`);
    const controls = [...root.querySelectorAll('sf-input-date')];
    const frame = root.querySelector('sf-input-date .sf-input')?.getBoundingClientRect();
    return {
      modes: controls.map((control) => control.getAttribute('mode')),
      label: controls[0]?.getAttribute('aria-label') ?? null,
      value: root.querySelector('sf-input-date input')?.value ?? null,
      pair: root.querySelectorAll('.sf-property-view-datetime, .sf-property-view-datetime-time').length,
      rawInputs: root.querySelectorAll('input[type="time"], input[type="datetime-local"]').length,
      height: frame ? Math.round(frame.height) : null,
    };
  }, {key});
  const saves = () => page.evaluate(async () => {
    const answer = await document.getElementById('view').saveAll();
    await new Promise((done) => setTimeout(done, 200));
    return {answer: answer?.answer ?? null, reason: answer?.reason ?? null,
      values: window.raised.filter((one) => one.intent === 'record.save').map((one) => one.payload.values)};
  });
  // Focused, not clicked: a click opens the calendar and the keys would go to
  // its grid. The text is replaced, typed key by key (the mask reads keys),
  // and Tab leaves the field, which is when it says it changed.
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
    const time = await look('remind');
    const title = await page.evaluate(() => Math.round(document.querySelector('sf-view-properties [data-field="title"] .sf-input')?.getBoundingClientRect().height ?? 0));
    results[`shown ${size}`] = {shown, time, title};
    if (JSON.stringify(shown.modes) !== '["datetime"]' || shown.pair || shown.rawInputs) note({case: `one control (size ${size})`, got: shown});
    if (JSON.stringify(time.modes) !== '["time"]') note({case: `a time of day is sf-input-date in time mode (size ${size})`, got: time});
    if (shown.label !== 'Начало') note({case: `named by its label (size ${size})`, got: shown});
    if (shown.value !== '15.11.2026 10:30' || time.value !== '09:30') note({case: `the stored value shows (size ${size})`, got: {shown, time}});
    if (shown.height !== title) note({case: `one height with the other fields (size ${size})`, got: {shown, title}});
  }

  // Narrow: the control stays inside its field.
  await page.setViewportSize({width: 360, height: 800});
  await make('1');
  const narrow = await page.evaluate(() => {
    const field = document.querySelector('sf-view-properties [data-field="starts"]').getBoundingClientRect();
    const control = document.querySelector('sf-view-properties [data-field="starts"] sf-input-date .sf-input').getBoundingClientRect();
    return {fieldRight: Math.round(field.right), controlRight: Math.round(control.right)};
  });
  results.narrow = narrow;
  if (narrow.controlRight > narrow.fieldRight) note({case: 'narrow', got: narrow});
  await page.setViewportSize({width: 1100, height: 900});

  // Untouched: only the field the person changed is written.
  await make('1');
  await page.evaluate(() => document.getElementById('view').changeField({key: 'title'}, 'Совещание'));
  const untouched = await saves();
  results.untouched = untouched;
  if (untouched.values.length !== 1 || 'starts' in untouched.values[0] || 'ends' in untouched.values[0] || 'remind' in untouched.values[0]) {
    note({case: 'an untouched datetime is not written', got: untouched});
  }

  // A new value typed whole.
  await make('1');
  await typeInto(input('ends'), '20.11.2026 09:30');
  const written = await saves();
  results.written = written;
  if (written.values.length !== 1 || written.values[0].ends !== '2026-11-20T09:30:00' || 'starts' in written.values[0]) note({case: 'a new day and time', got: written});

  // A day alone is not a whole value: nothing is written for it.
  await make('1');
  await typeInto(input('ends'), '20.11.2026');
  await page.evaluate(() => document.getElementById('view').changeField({key: 'title'}, 'Совещание'));
  const partial = await saves();
  results.partial = partial;
  if (partial.values.length !== 1 || 'ends' in partial.values[0]) note({case: 'a day without a time writes nothing', got: partial});

  // A changed time keeps the record's zone.
  await make('1');
  await typeInto(input('starts'), '15.11.2026 18:05');
  const retimed = await saves();
  results.retimed = retimed;
  if (retimed.values[0]?.starts !== '2026-11-15T18:05:00+03:00') note({case: 'a changed time', got: retimed});

  // Back to what it was writes nothing (a time of day stored to the minute;
  // a datetime stored with seconds is written to the minute once its time is
  // typed, which is the renderer set's round trip).
  await make('1');
  await typeInto(input('remind'), '10:15');
  await typeInto(input('remind'), '09:30');
  await page.evaluate(() => document.getElementById('view').changeField({key: 'title'}, 'Совещание'));
  const restored = await saves();
  results.restored = restored;
  if ('remind' in (restored.values[0] ?? {})) note({case: 'back to the stored time', got: restored});

  // Clearing.
  await make('1');
  await typeInto(input('starts'), '');
  const cleared = await saves();
  results.cleared = cleared;
  if (cleared.values[0]?.starts !== null) note({case: 'clearing', got: cleared});

  // A time of day.
  await make('1');
  await typeInto(input('remind'), '10:15');
  const timed = await saves();
  results.timed = timed;
  if (timed.values[0]?.remind !== '10:15') note({case: 'a time of day', got: timed});

  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('PROPERTY_VIEW_DATETIME_OK');
