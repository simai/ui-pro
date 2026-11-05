// sf-chat-window 1.11.0 and sf-chat-message 1.6.0: an answer's cards
// (x-blocks; Mirai24 API v1.4, BLOCKS.md §2). The browser half (the card
// drawn, saved, refused) is held by the window's probe.json; this is the half
// that needs none: the port table, the card's record and answers, and what
// the manifests and the words declare.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {EXTENSION_CAPABILITIES, EXTENSION_INTENTS, INTENTS, kindOf, verbOf} from '../src/smart/chat-window/js/port.js';
import {actionLabel, answerOf, modeOf, recordOf, valuesOut} from '../src/smart/chat-message/js/blocks.js';

const root = resolve(import.meta.dirname, '..');
const read = (component, path) => readFileSync(join(root, 'src', 'smart', component, path), 'utf8');
const json = (component, path) => JSON.parse(read(component, path));

const card = (over = {}) => ({
  id: 'blk_7f3a', kind: 'card', mode: 'edit', title: 'ООО «Ромашка»', subtitle: 'Контрагент', state: 'open',
  record: {
    source: 'companies', record_id: 'cmp_42', revision: 'r3',
    sections: [{key: 'requisites', label: 'Реквизиты', groups: [{key: 'main', label: null, fields: [
      {key: 'inn', label: 'ИНН', propertyType: 'string', value: '7707083893', mask: '0000000000'},
      {key: 'staff', label: 'Сотрудников', propertyType: 'integer', value: '12'},
    ]}]}],
  },
  actions: [{id: 'save', label: 'Сохранить'}, {id: 'cancel', label: 'Не сейчас'}],
  ...over,
});
const words = (key) => `«${key}»`;

test('block.submit is the window\'s own, under submit, kind block, and the port does not change', () => {
  assert.equal(INTENTS['block.submit'], undefined);
  assert.deepEqual(EXTENSION_INTENTS['block.submit'], {verb: 'submit', kind: 'block', capability: 'x-blocks', former: null});
  assert.equal(verbOf('block.submit'), 'submit');
  assert.equal(kindOf('block.submit'), 'block');
  assert.ok(EXTENSION_CAPABILITIES.includes('x-blocks'));
});

test('a card is edited only while open; view takes «Изменить» when the host offers it', () => {
  assert.equal(modeOf(card()), 'edit');
  assert.equal(modeOf(card(), {closed: true}), 'view');
  assert.equal(modeOf(card({state: 'applied'})), 'view');
  assert.equal(modeOf(card({mode: 'view', actions: []})), 'view');
  assert.equal(modeOf(card({mode: 'view', actions: [{id: 'edit', label: 'Изменить'}]})), 'auto');
  assert.equal(actionLabel(card(), 'cancel'), 'Не сейчас');
  assert.equal(actionLabel(card(), 'edit'), null);
});

test('the record is the block\'s: its id, the edit right while live, numbers read as numbers and sent as strings', () => {
  const record = recordOf(card());
  assert.equal(record.record_id, 'blk_7f3a');
  assert.equal(record.collection, 'companies');
  assert.equal(record.revision, 'r3');
  assert.deepEqual(record.actions, ['record.edit']);
  const fields = record.sections[0].groups[0].fields;
  assert.equal(fields[0].value, '7707083893', 'a string stays a string');
  assert.equal(fields[0].mask, '0000000000');
  assert.equal(fields[1].value, 12);
  assert.deepEqual(recordOf(card({state: 'applied'})).actions, []);
  assert.deepEqual(valuesOut(card(), {staff: 15, inn: '7707083893'}), {staff: '15', inn: '7707083893'});
});

test('the host\'s answers become the card\'s: applied, conflict, errors, closed, refused', () => {
  const applied = answerOf({answer: 'applied', block: card({state: 'applied', mode: 'view'})}, card(), words);
  assert.equal(applied.answer, 'applied');
  assert.deepEqual(applied.record.actions, []);
  assert.deepEqual(answerOf({answer: 'conflict', block: card()}, card(), words), {answer: 'conflict', message: '«block.conflict»'});
  assert.deepEqual(answerOf({answer: 'refused', reason: 'invalid', errors: {inn: 'Неверное контрольное число'}}, card(), words),
    {answer: 'refused', errors: {inn: 'Неверное контрольное число'}});
  assert.deepEqual(answerOf({answer: 'refused', reason: 'closed'}, card(), words), {answer: 'refused', message: '«block.closed»'});
  assert.deepEqual(answerOf({answer: 'refused', reason: 'refused', message: 'Менять может владелец.'}, card(), words),
    {answer: 'refused', message: 'Менять может владелец.'});
  assert.deepEqual(answerOf({answer: 'unavailable'}, card(), words), {answer: 'refused', message: '«block.failed»'});
});

test('the manifests and the words declare it', () => {
  const window = json('chat-window', 'component.json');
  const message = json('chat-message', 'component.json');
  assert.equal(window.port.version, '1.0.0', 'the port is not extended');
  assert.ok(window['x-registry'].compatibility.migrations.some((one) => one.from === '1.10.5' && one.to === '1.11.0'));
  assert.ok(message['x-registry'].compatibility.migrations.some((one) => one.from === '1.5.5' && one.to === '1.6.0'));
  assert.ok(message.relations.some((one) => one.name === 'cl-view-properties' && one.lazy === true));
  assert.ok(message['x-registry'].methods.settleBlock);
  for (const lang of ['ru', 'en']) {
    const own = json('chat-message', `lang/${lang}.json`).runtime;
    for (const key of ['block-applied', 'block-cancelled', 'block-stale', 'block-closed', 'block-conflict', 'block-failed', 'block-busy']) {
      assert.ok(typeof own[key] === 'string' && own[key].length, `${lang}: ${key}`);
    }
  }
  assert.match(read('chat-window', 'docs.md'), /x-blocks/u);
  assert.match(read('chat-message', 'docs.md'), /settleBlock/u);
});
