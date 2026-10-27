import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {composeDateTime, normalizeTime, splitDateTime} from '../src/smart/property-view/js/datetime-value.js';

// Larena acceptance, 2026-10-22: a «Дата и время» field edited only the day,
// so a new record could not get a time and «15.11.2026 10:30» was saved as
// «15.11.2026». The view edits a datetime as a day and a time, and the round
// trip is lossless.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('a stored datetime is split into its day, its time, the rest of its clock and its zone', () => {
  assert.deepEqual(splitDateTime('2026-11-15T10:30:15.250+03:00'),
    {raw: '2026-11-15T10:30:15.250+03:00', known: true, date: '2026-11-15', time: '10:30', rest: ':15.250', zone: '+03:00'});
  assert.deepEqual(splitDateTime('2026-11-15 10:30'), {raw: '2026-11-15 10:30', known: true, date: '2026-11-15', time: '10:30', rest: '', zone: ''});
  assert.deepEqual(splitDateTime({value: '2026-11-15T10:30:00Z', text: '15.11.2026 13:30'}).zone, 'Z');
  assert.equal(splitDateTime('2026-11-15').time, '');
  assert.equal(splitDateTime(null).known, true);
  assert.equal(splitDateTime('завтра').known, false);
});

test('a time is read as hh:mm, from the mask or typed without it', () => {
  assert.equal(normalizeTime('10:30'), '10:30');
  assert.equal(normalizeTime('9:30'), '09:30');
  assert.equal(normalizeTime('0930'), '09:30');
  assert.equal(normalizeTime('23:59'), '23:59');
  assert.equal(normalizeTime(''), '');
  assert.equal(normalizeTime('__:__'), '');
  for (const wrong of ['24:00', '10:60', '1', '10:3', 'ab:cd']) assert.equal(normalizeTime(wrong), null, wrong);
});

test('an untouched value writes back the very text it read', () => {
  for (const raw of ['2026-11-15T10:30:15.250+03:00', '2026-11-15 10:30', '2026-11-15T10:30:00Z']) {
    const before = splitDateTime(raw);
    assert.deepEqual(composeDateTime(before, {date: before.date, time: before.time}), {value: raw});
  }
});

test('a new value is ISO 8601 with a time and no zone: the site\'s time, as the host reads it', () => {
  assert.deepEqual(composeDateTime(splitDateTime(null), {date: '2026-11-15', time: '10:30'}), {value: '2026-11-15T10:30:00'});
  assert.deepEqual(composeDateTime(splitDateTime('2026-11-15'), {date: '2026-11-15', time: '10:30'}), {value: '2026-11-15T10:30:00'});
});

test('a changed day keeps the record\'s clock and zone; a changed time keeps the zone', () => {
  const before = splitDateTime('2026-11-15T10:30:15+03:00');
  assert.deepEqual(composeDateTime(before, {date: '2026-11-16', time: '10:30'}), {value: '2026-11-16T10:30:15+03:00'});
  assert.deepEqual(composeDateTime(before, {date: '2026-11-15', time: '18:05'}), {value: '2026-11-15T18:05:00+03:00'});
});

test('clearing both clears the value; a partial entry is an error, never a guessed value', () => {
  const before = splitDateTime('2026-11-15T10:30:00');
  assert.deepEqual(composeDateTime(before, {date: '', time: ''}), {value: null});
  assert.deepEqual(composeDateTime(before, {date: '2026-11-15', time: ''}), {error: 'timeMissing'});
  assert.deepEqual(composeDateTime(before, {date: '', time: '10:30'}), {error: 'dateMissing'});
  assert.deepEqual(composeDateTime(before, {date: '2026-11-15', time: '25:00'}), {error: 'timeInvalid'});
  assert.deepEqual(composeDateTime(before, {date: '15.11.2026', time: '10:30'}), {error: 'dateInvalid'});
});

test('the template edits a datetime with the pair and leaves every other type to the shared set', () => {
  const template = read('src/smart/property-view/js/templates/default.js');
  assert.match(template, /editing && type === 'datetime' && field\.readonly !== true\n\s+\? renderDateTimeEdit\(/u);
  const editor = read('src/smart/property-view/js/datetime-edit.js');
  assert.match(editor, /<sf-datepicker[\s\S]*size=\$\{size\}[\s\S]*aria-label=\$\{words\.dateLabel/u);
  // A value attribute is read back after the field is emptied: the day is a property.
  assert.match(editor, /\n\s+\.value=\$\{draft\.date\}\n/u);
  assert.match(editor, /<sf-input[\s\S]*size=\$\{size\}[\s\S]*mask-pattern="00:00"[\s\S]*aria-label=\$\{words\.timeLabel/u);
  assert.doesNotMatch(editor.replace(/^\s*\/\/.*$/gmu, ''), /<input\b/u, 'the Framework\'s own control, not a raw input');
});

test('an entry that is not a value yet stops both saves and is said under the field', () => {
  const view = read('src/smart/property-view/index.js');
  assert.match(view, /if \(this\.editing && this\.inputErrors\.size\) return this\._inputsInvalid\(\);/u);
  assert.match(view, /async saveAll\(\{confirm = null\} = \{\}\) \{\n\s+if \(this\.inputErrors\.size\) return this\._inputsInvalid\(\);/u);
  assert.match(view, /errors: this\.inputErrors\.size \? new Map\(\[\.\.\.this\.errors, \.\.\.this\.inputErrors\]\) : this\.errors/u);
  // Every place a change is dropped drops the drafts with it.
  assert.equal((view.match(/this\.changed\.clear\(\);\n\s+this\._clearInputs\(\);/gu) ?? []).length,
    (view.match(/this\.changed\.clear\(\);/gu) ?? []).length);
  // The words are the language files' since standard 1.3.8 §11 (lang/<locale>.json).
  for (const language of ['en', 'ru']) {
    const words = JSON.parse(read(`src/smart/property-view/lang/${language}.json`)).runtime;
    for (const key of ['date-time-date-label', 'date-time-time-label', 'time-placeholder-text', 'date-missing-text', 'date-invalid-text', 'time-missing-text', 'time-invalid-text']) {
      assert.ok(words[key], `${language} ${key}`);
    }
  }
});
