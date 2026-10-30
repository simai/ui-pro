// sf-chat-window 1.3.0 and sf-chat-message 1.2.0: the window between people
// (capabilities people, edit, delete, read on simai.chat-port 1.0). The
// behaviour in the browser (runs, own and others', edit applied and in
// conflict, the tombstone, «Новые», reads at most once in 2 s, the assistant's
// window unchanged, the preview's passage by #fragment) is held by each
// component's probe.json; this is the half that needs none: the pure readings
// of js/people.js and what the manifests and words declare.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {RUN_GAP_MS, compareRevisions, keyOf, runsOf, toPersonView, unreadKeyOf} from '../src/smart/chat-window/js/people.js';

const root = resolve(import.meta.dirname, '..');
const read = (component, path) => readFileSync(join(root, 'src', 'smart', component, path), 'utf8');
const json = (component, path) => JSON.parse(read(component, path));
const local = (...parts) => new Date(...parts).toISOString();
const ivan = {id: 102, name: 'Иван Петров'};
const me = {id: 101, name: 'Анна', own: true};
const person = (id, author, at, more = {}) => ({id, kind: 'person', author, body: `m${id}`, created_at: at, revision: 1, ...more});

test('a run is one author, one day, no pause over five minutes and no assistant between', () => {
  assert.equal(RUN_GAP_MS, 5 * 60 * 1000);
  const messages = [
    person(1, ivan, local(2026, 9, 30, 9, 0)),
    person(2, ivan, local(2026, 9, 30, 9, 4)),
    person(3, ivan, local(2026, 9, 30, 9, 10)),           // a pause of six minutes
    {id: 4, kind: 'assistant', author: {id: 'helper'}, status: 'completed', body: 'a'},
    person(5, ivan, local(2026, 9, 30, 9, 11)),
    person(6, me, local(2026, 9, 30, 9, 12)),
    person(7, me, local(2026, 9, 30, 23, 58)),           // over five minutes anyway
    person(8, me, local(2026, 9, 30, 23, 59)),
    person(9, me, local(2026, 9, 31, 0, 1)),             // two minutes later, the next day
    person(10, ivan, null),
    person(11, ivan, null),                              // no times: the author alone
  ];
  const runs = runsOf(messages, {type: 'group'});
  const flags = (id) => {
    const one = runs.get(String(id));
    return `${one.first ? 'F' : '-'}${one.last ? 'L' : '-'}${one.showName ? 'N' : '-'}`;
  };
  assert.deepEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 11].map(flags), ['F-N', '-LN', 'FLN', 'FLN', 'FL-', 'F--', '-L-', 'FL-', 'F-N', '-LN']);
  assert.equal(runs.has('4'), false, 'an assistant\'s message is not a person\'s run');
  assert.equal(runsOf(messages, {type: 'private'}).get('1').showName, false, 'no names in a private conversation');
});

test('a port message becomes the template person\'s message, with rights from the host\'s flags and the window\'s capabilities', () => {
  const message = person(22, {id: 101, name: 'Анна', avatar_url: '/a.png', own: true}, '2026-10-30T09:06:00Z', {
    revision: 2, is_edited: true, can_edit: true, can_delete: true, files: [{id: 9, name: 'a.docx', size: 2048, download_url: '/f/9'}],
  });
  const view = toPersonView(message, {edit: true, remove: false});
  assert.equal(view.template, 'person');
  assert.equal(view.id, '22');
  assert.equal(view.own, true);
  assert.equal(view.authorName, 'Анна');
  assert.equal(view.authorAvatar, '/a.png');
  assert.equal(view.createdAt, '2026-10-30T09:06:00Z');
  assert.equal(view.isEdited, true);
  assert.equal(view.canEdit, true);
  assert.equal(view.canDelete, false, 'delete not offered without the capability');
  assert.deepEqual(view.files, [{id: 9, key: undefined, name: 'a.docx', size: 2048, state: 'ready', downloadUrl: '/f/9'}]);
  // Never from who wrote it: another's message with can_edit false offers none.
  assert.equal(toPersonView({...message, author: ivan, can_edit: false}, {edit: true}).canEdit, false);
  const tomb = toPersonView({...message, is_deleted: true, body: '', files: []}, {edit: true, remove: true});
  assert.deepEqual([tomb.isDeleted, tomb.canEdit, tomb.canDelete, tomb.text, tomb.files.length], [true, false, false, '', 0]);
  const saving = toPersonView(message, {edit: true, remove: true, acting: {action: 'edit', state: 'pending', clientKey: 'k', body: 'new'}});
  assert.deepEqual([saving.canEdit, saving.local.state, saving.local.body], [false, 'pending', 'new']);
  const unsent = toPersonView({id: null, kind: 'person', author: me, body: 'x', local: {client_key: 'c1', action: 'send', state: 'failed'}});
  assert.equal(keyOf({id: null, local: {client_key: 'c1'}}), 'c1');
  assert.deepEqual([unsent.id, unsent.local.clientKey, unsent.local.state], ['c1', 'c1', 'failed']);
});

test('«Новые» is counted back from the end over others\' messages; a newer revision wins', () => {
  const messages = [person(1, ivan), person(2, me), person(3, ivan), person(4, me), person(5, ivan)];
  assert.equal(unreadKeyOf(messages, 0), null);
  assert.equal(unreadKeyOf(messages, 1), '5');
  assert.equal(unreadKeyOf(messages, 2), '3');
  assert.equal(unreadKeyOf(messages, 9), '1', 'more than loaded: the first loaded of others');
  // A host counts what the reader could read: not their own, not a tombstone.
  const withTomb = [person(1, ivan), person(3, ivan), {...person(4, ivan), is_deleted: true}, person(5, ivan)];
  assert.equal(unreadKeyOf(withTomb, 2), '3', 'a deleted message is none of the unread');
  assert.equal(compareRevisions(2, 3), -1);
  assert.equal(compareRevisions('10', 9), 1);
  assert.equal(compareRevisions(4, '4'), 0);
  assert.equal(compareRevisions(null, 1), -1);
});

test('the manifests and words declare the people mode, and the port is not extended', () => {
  const window = json('chat-window', 'component.json');
  const message = json('chat-message', 'component.json');
  assert.equal(window.version, '1.6.0');
  assert.equal(message.version, '1.4.0');
  assert.deepEqual(window['x-port'].supports, ['1.0.0']);
  assert.ok(window['x-registry'].compatibility.migrations.some((one) => one.from === '1.2.0' && one.to === '1.3.0'));
  assert.match(message.settings.display.summary, /conflict/u);
  assert.match(message.settings.display.summary, /divider/u);
  // author.kind is not the port's: since 1.6.0 the window reads it in one place,
  // speakerOf (js/people.js), and only between people (tests/chat-universal).
  assert.ok(!/author\??\.kind/u.test(read('chat-window', 'index.js')));
  const words = {
    'chat-window': ['people-conflict', 'people-conflict-deleted', 'people-placeholder'],
    'chat-message': ['divider-unread', 'people-conflict', 'people-conflict-deleted', 'people-keep-theirs', 'people-replace-mine', 'people-close'],
  };
  for (const [component, names] of Object.entries(words)) {
    for (const locale of ['ru', 'en']) {
      const runtime = json(component, `lang/${locale}.json`).runtime;
      for (const name of names) assert.ok(runtime[name], `${component} ${locale}: ${name}`);
    }
  }
  const ru = json('chat-message', 'lang/ru.json').runtime;
  assert.deepEqual([ru['divider-unread'], ru['people-conflict'], ru['people-keep-theirs'], ru['people-replace-mine']],
    ['Новые', 'Сообщение уже изменили', 'Оставить их', 'Заменить своим']);
  assert.match(read('chat-window', 'js/preview-view.js'), /export function withSentinels/u, 'the preview finds a passage by the address\'s fragment');
});
