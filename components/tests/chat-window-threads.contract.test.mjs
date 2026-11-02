// sf-chat-window 1.10.0 and sf-chat-message 1.5.0: a message's discussion
// (x-threads). The browser half (the line, «Обсудить», the bar, «В чат») is
// held by the window's probe.json; this is the half that needs none: the port
// table, and what the manifests, the words and the docs declare.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {EXTENSION_CAPABILITIES, EXTENSION_INTENTS, INTENTS, kindOf, verbOf} from '../src/smart/chat-window/js/port.js';

const root = resolve(import.meta.dirname, '..');
const read = (component, path) => readFileSync(join(root, 'src', 'smart', component, path), 'utf8');
const json = (component, path) => JSON.parse(read(component, path));

test('thread.open is the window\'s own, under open, kind thread, and the port does not change', () => {
  assert.equal(INTENTS['thread.open'], undefined);
  assert.deepEqual(EXTENSION_INTENTS['thread.open'], {verb: 'open', kind: 'thread', capability: 'x-threads', former: null});
  assert.equal(verbOf('thread.open'), 'open');
  assert.equal(kindOf('thread.open'), 'thread');
  assert.ok(EXTENSION_CAPABILITIES.includes('x-threads'));
});

test('the manifests, the words and the docs declare it', () => {
  const window = json('chat-window', 'component.json');
  const message = json('chat-message', 'component.json');
  assert.equal(window.port.version, '1.0.0', 'the port is not extended');
  assert.ok(window['x-registry'].compatibility.migrations.some((one) => one.from === '1.9.1' && one.to === '1.10.0'));
  assert.ok(message['x-registry'].compatibility.migrations.some((one) => one.from === '1.4.2' && one.to === '1.5.0'));
  assert.ok(message.events.open.carries.kind.values.includes('thread'));
  for (const lang of ['ru', 'en']) {
    const own = json('chat-window', `lang/${lang}.json`).runtime;
    for (const key of ['thread-title', 'thread-back', 'thread-root-deleted']) assert.ok(typeof own[key] === 'string' && own[key].length, `${lang}: ${key}`);
    const words = json('chat-message', `lang/${lang}.json`).runtime;
    assert.ok(typeof words['thread-discuss'] === 'string' && words['thread-discuss'].length, `${lang}: thread-discuss`);
    assert.equal(typeof words['thread-replies'], 'object', `${lang}: thread-replies has number forms`);
    assert.match(words['thread-replies'].other, /\{n\}/u);
  }
  assert.deepEqual(Object.keys(json('chat-message', 'lang/ru.json').runtime['thread-replies']).sort(), ['few', 'many', 'one', 'other']);
  assert.match(read('chat-window', 'docs.md'), /x-threads/u);
  assert.match(read('chat-message', 'docs.md'), /canDiscuss/u);
});

test('a discussion offers nothing of its own inside it: no «Обсудить», no members', () => {
  const source = read('chat-window', 'index.js');
  // The window reads the open conversation's type; the members test is hasMembers (group, channel).
  assert.match(source, /get inThread\(\)[\s\S]*?type === "thread"/u);
  assert.match(source, /if \(threads && !this\.inThread\)/u);
  const model = read('chat-window', 'js/start-model.js');
  assert.match(model, /hasMembers = \(type\) => type === 'group' \|\| type === 'channel'/u);
});
