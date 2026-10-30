// sf-chat-window 1.5.0 and sf-chat-message 1.3.0, between people: arrow up edits
// the last own message, the editor's limit and day dividers. What a browser must
// show (the focus, the refusal, the dividers and the reading position under
// them) is held by probes p31-p38 of the window's probe.json; this is the half
// that needs none: the pure readings of js/people.js and what the manifests and
// words declare.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {MESSAGE_CHARS, dayDividersOf, dayWord, lastOwnEditableKey, messageCharsOf, runsOf} from '../src/smart/chat-window/js/people.js';

const root = resolve(import.meta.dirname, '..');
const read = (component, path) => readFileSync(join(root, 'src', 'smart', component, path), 'utf8');
const json = (component, path) => JSON.parse(read(component, path));
const local = (...parts) => new Date(...parts).toISOString();
const ivan = {id: 102, name: 'Иван'};
const me = {id: 101, name: 'Анна', own: true};
const person = (id, author, created_at, more = {}) => ({id, kind: 'person', author, body: `m${id}`, ...(created_at ? {created_at} : {}), ...more});
const now = new Date(2026, 9, 30, 12, 0);
const words = {now, locale: 'ru', today: 'Сегодня', yesterday: 'Вчера'};

test('the newest own message the host lets the reader edit', () => {
  assert.equal(lastOwnEditableKey([]), null);
  assert.equal(lastOwnEditableKey(), null);
  const mine = (id, more) => person(id, me, null, {can_edit: true, ...more});
  assert.equal(lastOwnEditableKey([mine(1), mine(2), person(3, ivan, null, {can_edit: true})]), '2');
  assert.equal(lastOwnEditableKey([mine(1), mine(2, {is_deleted: true}), mine(3, {can_edit: false})]), '1');
  assert.equal(lastOwnEditableKey([mine(1, {can_edit: undefined})]), null, 'only the host\'s own true');
  assert.equal(lastOwnEditableKey([mine(1), {...mine(null), id: undefined, local: {client_key: 'k', state: 'pending'}}]), '1', 'a send on its way has no id');
  assert.equal(lastOwnEditableKey([mine(1), mine(2, {local: {state: 'pending', client_key: 'k'}})]), '1');
  assert.equal(lastOwnEditableKey([mine(1), {id: 2, kind: 'assistant', author: {own: true}, can_edit: true}]), '1');
});

test('the limit: message_chars only between people, then body_chars, then the field\'s default', () => {
  assert.equal(MESSAGE_CHARS, 4000);
  assert.equal(messageCharsOf({message_chars: 10000, body_chars: 300}, {people: true}), 10000);
  assert.equal(messageCharsOf({body_chars: 300}, {people: true}), 300);
  assert.equal(messageCharsOf({}, {people: true}), 4000);
  assert.equal(messageCharsOf(undefined, {people: true}), 4000);
  assert.equal(messageCharsOf({message_chars: 0, body_chars: 0}, {people: true}), 4000);
  assert.equal(messageCharsOf({message_chars: 'много'}, {people: true}), 4000);
  // A window without people keeps the limit it has.
  assert.equal(messageCharsOf({message_chars: 10000}), 4000);
  assert.equal(messageCharsOf({message_chars: 10000, body_chars: 300}), 300);
});

test('a day\'s words: today, yesterday, a date, the year only when not this one', () => {
  assert.equal(dayWord(new Date(2026, 9, 30, 0, 0), words), 'Сегодня');
  assert.equal(dayWord(new Date(2026, 9, 30, 23, 59), words), 'Сегодня');
  assert.equal(dayWord(new Date(2026, 9, 29, 23, 59), words), 'Вчера');
  assert.equal(dayWord(new Date(2026, 9, 28, 12), words), '28 октября');
  assert.match(dayWord(new Date(2025, 9, 30, 12), words), /^30 октября 2025/u);
  assert.equal(dayWord(new Date(2026, 9, 28, 12), {...words, locale: 'en'}), 'October 28');
  assert.match(dayWord(new Date(2025, 9, 28, 12), {...words, locale: 'en'}), /October 28, 2025/u);
  // Yesterday across a month and a year, by the calendar, not by 24 hours.
  assert.equal(dayWord(new Date(2026, 11, 31, 1), {...words, now: new Date(2027, 0, 1, 23)}), 'Вчера');
  assert.match(dayWord(new Date(2026, 11, 30, 1), {...words, now: new Date(2027, 0, 1, 23)}), /2026/u);
});

test('a divider stands before the first message of a day, only from a real created_at', () => {
  const map = dayDividersOf([
    person(1, ivan, local(2026, 9, 28, 23, 59)),
    person(2, ivan, null),                         // no time: no divider, the day goes on
    person(3, ivan, local(2026, 9, 28, 23, 59)),
    person(4, me, local(2026, 9, 29, 0, 0)),
    {id: 5, kind: 'assistant', author: {id: 'h'}, created_at: local(2026, 9, 30, 8)},
    person(6, ivan, 'когда-то'),                   // not a time
    person(7, ivan, local(2026, 9, 30, 9)),
  ], words);
  assert.deepEqual([...map], [['1', '28 октября'], ['4', 'Вчера'], ['5', 'Сегодня']]);
});

test('no created_at, no dividers and no change to the runs: the Bitrix module\'s feed', () => {
  const feed = [person(1, ivan, null), person(2, ivan, null), person(3, me, null), person(4, ivan, null)];
  const days = dayDividersOf(feed, words);
  assert.equal(days.size, 0);
  assert.deepEqual([...runsOf(feed, {type: 'group', breaks: days})], [...runsOf(feed, {type: 'group'})]);
});

test('a run restarts after a divider, also beside a message with no time', () => {
  const feed = [person(1, ivan, null), person(2, ivan, local(2026, 9, 30, 9)), person(3, ivan, null), person(4, ivan, local(2026, 9, 30, 9, 1))];
  const breaks = dayDividersOf(feed, words);
  assert.deepEqual([...breaks.keys()], ['2']);
  const runs = runsOf(feed, {type: 'group', breaks});
  const flags = (id) => `${runs.get(id).first ? 'F' : '-'}${runs.get(id).last ? 'L' : '-'}`;
  assert.deepEqual(['1', '2', '3', '4'].map(flags), ['FL', 'F-', '--', '-L']);
});

test('the manifests, the words and the sources declare it, and the port is not extended', () => {
  const window = json('chat-window', 'component.json');
  const message = json('chat-message', 'component.json');
  assert.equal(window.version, '1.6.1');
  assert.equal(message.version, '1.4.1');
  assert.deepEqual(window['x-port'].supports, ['1.0.0']);
  assert.ok(window['x-registry'].compatibility.migrations.some((one) => one.from === '1.4.0' && one.to === '1.5.0'));
  assert.ok(message['x-registry'].compatibility.migrations.some((one) => one.from === '1.2.0' && one.to === '1.3.0'));
  assert.match(message.settings.display.summary, /day/u);
  assert.match(message.settings.display.summary, /editLimit/u);
  assert.match(window.settings.limits.summary, /message_chars/u);
  assert.equal(window.keyboard.host.ArrowUp, 'edit');
  assert.equal(window.port.version, '1.0.0');
  const asked = {
    'chat-window': ['people-today', 'people-yesterday'],
    'chat-message': ['people-edit-count', 'people-edit-too-long', 'people-edit-refused'],
  };
  for (const [component, names] of Object.entries(asked)) {
    for (const locale of ['ru', 'en']) {
      const said = json(component, `lang/${locale}.json`).runtime;
      for (const name of names) assert.ok(said[name], `${component} ${locale} ${name}`);
    }
  }
  // Never cut: the editor has no maxlength, the refusal is the form's.
  const person_ = read('chat-message', 'js/view/person.js');
  assert.ok(!/maxlength/iu.test(person_));
  // The separators, one markup, the day first.
  const divider = read('chat-message', 'js/templates/default.js');
  assert.match(divider, /role="separator"/u);
  assert.ok(divider.indexOf('context.day ? line') < divider.indexOf('context.divider ? line'));
  // «Новые» is found by its own class now that a day's divider shares the look.
  assert.match(read('chat-window', 'index.js'), /\.sf-chat-divider--unread/u);
});
