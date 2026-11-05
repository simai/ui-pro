// What a cell and a card show for four kinds of value the renderer set left
// as they came (the Fields page and Larena, 2026-11-05):
// - a date, a date and time and a time of day the host did not format read in
//   the page's language through the SIMAI Framework's format-date, and the
//   host's formatFieldValue still wins;
// - formatted text (html) is its text in a row, never its markup;
// - several files are each a name with its kind's icon, folded into «+N»
//   when they do not fit, where a column of documents drew nothing.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';
import {DATE_TYPES, formatDateValue} from '../src/smart/view-table/js/format-value.js';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const table = read('src/smart/view-table/index.js');
const template = read('src/smart/view-table/js/templates/default.js');
const card = read('src/smart/view-properties/index.js');
const cardTemplate = read('src/smart/view-properties/js/templates/default.js');
const en = (options) => new Intl.DateTimeFormat('en', options);

test('a day is that day on the reader\'s calendar, not UTC midnight', () => {
  assert.equal(formatDateValue('date', '2026-11-02'), en({dateStyle: 'medium'}).format(new Date(2026, 10, 2)));
  // A date field holding a stamp shows its day and its time.
  assert.equal(formatDateValue('date', '2026-11-02T00:00:00'), en({dateStyle: 'medium'}).format(new Date(2026, 10, 2)));
});

test('a date and time without a zone is the wall clock as written; with one, the moment', () => {
  const wall = new Date(2026, 10, 15, 10, 30);
  assert.equal(formatDateValue('datetime', '2026-11-15T10:30:00'), en({dateStyle: 'medium', timeStyle: 'short'}).format(wall));
  assert.equal(formatDateValue('datetime', '2026-11-15 10:30'), en({dateStyle: 'medium', timeStyle: 'short'}).format(wall));
  const moment = new Date('2026-11-15T10:30:00Z');
  assert.equal(formatDateValue('datetime', '2026-11-15T10:30:00Z'), en({dateStyle: 'medium', timeStyle: 'short'}).format(moment));
  // A datetime holding a day alone shows the day.
  assert.equal(formatDateValue('datetime', '2026-11-15'), en({dateStyle: 'medium'}).format(new Date(2026, 10, 15)));
});

test('a time of day is a time', () => {
  assert.equal(formatDateValue('time', '09:30'), en({timeStyle: 'short'}).format(new Date(2000, 0, 1, 9, 30)));
  assert.equal(formatDateValue('time', '09:30:15'), en({timeStyle: 'short'}).format(new Date(2000, 0, 1, 9, 30, 15)));
});

test('what is not a date of the type is left to be printed as it came', () => {
  assert.deepEqual([...DATE_TYPES], ['date', 'datetime', 'time']);
  for (const [type, value] of [['date', 'завтра'], ['date', ''], ['date', null], ['date', 20261102], ['string', '2026-11-02'],
    ['date', '09:30'], ['time', '2026-13-45T99'], ['date', {value: '2026-11-02', text: '2 ноября'}]]) {
    assert.equal(formatDateValue(type, value), '', `${type} ${JSON.stringify(value)}`);
  }
});

test('the table asks the host first and formats a date it left alone', () => {
  const method = table.split('    getTypedCellValue(column = {}, value) {')[1].split('\n    }\n')[0];
  assert.match(method, /const rendered = renderCellField\(column, value, host\);\n\s+if \(rendered !== null && rendered !== undefined\) return rendered;/u);
  assert.match(method, /if \(DATE_TYPES\.has\(type\)\) return formatDateValue\(type, value, this\) \|\| null;/u);
  assert.ok(method.indexOf('renderCellField(column, value, host)') < method.indexOf('formatDateValue('), 'the host formats first');
});

test('the card reads a field shown through its host first, then format-date', () => {
  assert.match(card, /import \{formatDateValue\} from "\.\.\/view-table\/js\/format-value\.js";/u);
  const getter = card.split('    get viewHost() {')[1].split('\n    }\n')[0];
  assert.match(getter, /const own = host\?\.formatFieldValue\?\.\(field, value\);\n\s+if \(typeof own === "string"\) return own;/u);
  assert.match(getter, /return formatDateValue\(type, value, this\) \|\| undefined;/u);
  assert.match(getter, /Object\.create\(host && typeof host === "object" \? host : null\)/u, 'the rest of the host is reached unchanged');
  assert.equal((cardTemplate.match(/renderViewField\(field, field\.value, context\.viewHost, \{size: context\.size\}\)/gu) ?? []).length, 2);
  assert.doesNotMatch(cardTemplate, /context\.hostPort/u);
});

test('formatted text in a row is its text, on both of the table\'s paths', () => {
  assert.match(table, /import \{htmlText\} from "\.\.\/field-renderers\/html\.js";/u);
  assert.match(table, /return type === "html" \? htmlText\(value\) : String\(value\);/u);
  // The markup path (rowMarkupCell) and the full renderer both ask cellText.
  assert.match(table, /LONG_TEXT_CELL_TYPES\.has\([^\n]+\n\s+const text = this\.cellText\(column, value\);/u);
  assert.match(template, /const text = context\.component\?\.cellText\?\.\(column, value\) \?\? String\(value\);/u);
});

test('several files are a value each, so they wrap and fold as several tags do', () => {
  const method = table.split('    getTypedCellValue(column = {}, value) {')[1].split('\n    }\n')[0];
  assert.match(method, /if \(type === "file" && Array\.isArray\(value\)\) \{\n\s+const files = value\.map\(\(file\) => renderCellField\(column, file, host\)\)/u);
  assert.match(method, /return files\.length \? files : null;/u);
});
