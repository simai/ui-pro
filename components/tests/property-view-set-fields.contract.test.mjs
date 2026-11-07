import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {add, compare, decimalString, editableDecimal, formatDecimal, fractionDigits, readDecimal, round, toDecimal} from '../src/smart/view-properties/js/decimal.js';
import {currencyOf, formatMoney, moneyParts, percentText} from '../src/smart/view-properties/js/money.js';
import {columnsOf, computeRow, rowTotals} from '../src/smart/view-properties/js/rows.js';
import {innValid, ogrnValid, requisiteErrors} from '../src/smart/view-properties/js/requisites.js';

// The property types the set draws itself (Larena addendum of 2026-11-03,
// msg-bf1ad4f3ae00420bb752; Larena property types standard, notes of
// 2026-11-03): money, percent, rows (items), a compound and ru.requisites.
// The arithmetic and the checks are pure and read here; the controls are
// measured on the built bytes by tests/browser/property-view-set-fields.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const source = read('src/smart/view-properties/js/set-fields.js');
const value = read('src/smart/view-properties/js/field-value.js');

test('a typed decimal is read as digits, never as a float', () => {
  assert.deepEqual(readDecimal('1 500,50'), {ok: true, value: '1500.50'});
  assert.deepEqual(readDecimal('1 500.5'), {ok: true, value: '1500.5'});
  assert.deepEqual(readDecimal('007'), {ok: true, value: '7'});
  assert.deepEqual(readDecimal(',5'), {ok: true, value: '0.5'});
  assert.deepEqual(readDecimal('-0,00'), {ok: true, value: '0.00'});
  assert.deepEqual(readDecimal(''), {ok: true, value: null});
  assert.deepEqual(readDecimal(12), {ok: true, value: '12'}, 'a JSON integer is taken as its digits');
  assert.equal(readDecimal(12.5).ok, false, 'a JSON float is refused');
  for (const wrong of ['abc', '1.2.3', '1e5', '-', '.']) assert.equal(readDecimal(wrong).ok, false, wrong);
  assert.equal(fractionDigits('12.500'), 3);
  assert.equal(editableDecimal('1500.5', 'ru'), '1500,5');
});

test('arithmetic is on units: no float drift, rounding half away from zero', () => {
  assert.equal(decimalString(add(toDecimal('0.1'), toDecimal('0.2'))), '0.3');
  assert.equal(decimalString(round(toDecimal('2.345'), 2)), '2.35');
  assert.equal(decimalString(round(toDecimal('-2.345'), 2)), '-2.35');
  assert.equal(decimalString(round(toDecimal('2.344'), 2)), '2.34');
  assert.equal(decimalString(round(toDecimal('5'), 2)), '5.00');
  assert.equal(compare(toDecimal('100'), toDecimal('100.00')), 0);
  assert.equal(compare(toDecimal('99.99'), toDecimal('100')), -1);
});

test('an amount reads with its currency\'s minor units and sign', () => {
  assert.equal(currencyOf('RUB', 'ru').minor, 2);
  assert.equal(currencyOf('JPY', 'ru').minor, 0);
  assert.equal(currencyOf('KWD', 'ru').minor, 3);
  assert.equal(formatMoney('1500.5', 'RUB', 'ru'), '1 500,50 ₽', 'the standard reads «1 500,50 ₽»');
  assert.equal(formatMoney('1500.5', 'USD', 'en'), '$1,500.50');
  assert.equal(formatMoney('1500', 'JPY', 'ru'), '1 500 ¥');
  assert.equal(formatMoney('12345678901234567.89', 'RUB', 'ru'), '12 345 678 901 234 567,89 ₽', 'past a float\'s digits');
  assert.equal(formatDecimal('-1500', 'ru'), '−1 500');
  assert.deepEqual(moneyParts({amount: '10', currency: 'EUR'}), {amount: '10', currency: 'EUR'});
  assert.deepEqual(moneyParts('10', 'RUB'), {amount: '10', currency: 'RUB'}, 'a field that fixes the currency takes a bare amount');
  assert.equal(percentText('12.5', 'ru'), '12,5 %');
  assert.equal(percentText('12.5', 'en'), '12.5%');
});

const columns = columnsOf({columns: [
  {key: 'name', label: 'Наименование', type: 'string', required: true},
  {key: 'qty', label: 'Кол-во', type: 'number', settings: {scale: 3}},
  {key: 'price', label: 'Цена', type: 'money', settings: {currency: 'RUB'}},
  {key: 'discount', label: 'Скидка', type: 'percent'},
  {key: 'sum', label: 'Сумма', type: 'money', compute: {op: 'multiply', of: ['qty', 'price']}, total: 'sum'},
  {key: 'net', label: 'Без скидки', type: 'number', compute: {op: 'multiply', of: ['qty', 'discount']}},
]});

test('a column reads its settings beside its own keys, under propertyType', () => {
  assert.equal(columns[1].propertyType, 'number');
  assert.equal(columns[1].scale, 3);
  assert.equal(columns[2].currency, 'RUB');
});

test('a computed cell is worked out in its row, rounded to the currency, written last', () => {
  const row = computeRow({sum: {amount: '1', currency: 'RUB'}, price: {amount: '33.33', currency: 'RUB'}, qty: '3', name: 'Ручка'}, columns, 'ru');
  assert.deepEqual(Object.keys(row), ['name', 'qty', 'price', 'sum'], 'typed cells in column order, computed last; a stale computed cell is replaced');
  assert.deepEqual(row.sum, {amount: '99.99', currency: 'RUB'});
  const half = computeRow({qty: '0.5', price: {amount: '0.01', currency: 'RUB'}}, columns, 'ru');
  assert.deepEqual(half.sum, {amount: '0.01', currency: 'RUB'}, '0.005 rounds half away from zero');
  const share = computeRow({qty: '200', discount: '12.5'}, columns, 'ru');
  assert.equal(share.net, '25.00', 'a percent operand counts as its share (12.5 % of 200)');
  assert.equal(Object.hasOwn(computeRow({qty: '2'}, columns, 'ru'), 'sum'), false, 'a missing operand leaves no cell');
});

test('a summed column adds up its rows on decimals', () => {
  const rows = [{qty: '1', price: {amount: '0.10', currency: 'RUB'}}, {qty: '1', price: {amount: '0.20', currency: 'RUB'}}]
    .map((row) => computeRow(row, columns, 'ru'));
  const totals = rowTotals(rows, columns);
  assert.deepEqual(Object.keys(totals), ['sum']);
  assert.equal(decimalString(totals.sum), '0.30');
});

test('requisites are checked part by part and together', () => {
  assert.equal(innValid('7707083893'), true);
  assert.equal(innValid('7707083894'), false);
  assert.equal(innValid('500100732259'), true, 'a person\'s twelve digits');
  assert.equal(ogrnValid('1027700132195'), true);
  assert.equal(ogrnValid('1027700132196'), false);
  const sber = {inn: '7707083893', kpp: '773601001', ogrn: '1027700132195', bik: '044525225',
    account: '40702810638000000000', corr_account: '30101810400000000225'};
  assert.deepEqual(requisiteErrors(sber), {});
  assert.deepEqual(requisiteErrors({...sber, account: '40702810938000000000'}), {account: 'accountKey'});
  assert.deepEqual(requisiteErrors({...sber, corr_account: '40101810400000000225'}), {corr_account: 'corrStart'});
  assert.deepEqual(requisiteErrors({...sber, bik: '123456789'}), {bik: 'bikWrong'});
  assert.deepEqual(requisiteErrors({inn: '500100732259', kpp: '773601001'}), {kpp: 'kppPerson'});
  assert.deepEqual(requisiteErrors({inn: '7707083893', ogrn: '304500116000157'}), {ogrn: 'ogrnOrganization'});
  assert.deepEqual(requisiteErrors({}), {inn: 'innRequired'});
  assert.deepEqual(requisiteErrors({inn: '7707083893', kpp: 'x'}, ['inn']), {}, 'a part the field does not hold is not checked');
});

test('the set draws its own types before the Framework renderers are asked', () => {
  assert.match(value, /import \{renderSetField\} from '\.\/set-fields\.js';/u);
  assert.ok(value.indexOf('renderSetField(field') < value.indexOf('renderEditField('), 'the set is asked first');
  for (const type of ['money', 'percent', 'items', 'compound', 'ru.requisites']) {
    assert.match(source, new RegExp(`['"]?${type.replace('.', '\\.')}['"]?: \\{edit: render\\w+Edit, view: render\\w+View\\}`, 'u'), type);
  }
  // A locked field is shown, as the Framework renderers show one.
  assert.match(source, /if \(editing && field\.readonly !== true && ctx\.disabled !== true && host\?\.setFieldValue\) \{/u);
  // An entry that is not a value yet holds the save through setFieldError.
  assert.ok((source.match(/host\.setFieldError\?\.\(field,/gu) ?? []).length >= 5);
});

test('no float reaches the wire: no Number() or parseFloat over a value', () => {
  for (const path of ['set-fields.js', 'money.js', 'rows.js', 'decimal.js']) {
    const text = read(`src/smart/view-properties/js/${path}`);
    assert.doesNotMatch(text, /parseFloat\(|Number\((?:raw|text|value|next|amount|cell)\)/u, path);
  }
});

test('every word is offered in both languages', () => {
  const at = source.indexOf('const TEXT = {');
  const body = source.slice(at, source.indexOf('\n};\n', at));
  const keys = (language) => {
    const start = body.indexOf(`    ${language}: {`);
    const end = body.indexOf('\n    },', start);
    return [...body.slice(start, end).matchAll(/^\s{8}(\w+):/gmu)].map(([, key]) => key).sort();
  };
  assert.ok(keys('en').length > 30);
  assert.deepEqual(keys('ru'), keys('en'));
});
