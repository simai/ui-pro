// sf-chat-message 1.1.0 and sf-chat-window 1.2.0: an answer's steps, a
// source's preview and an answer's files, the fields proposed to Mirai24 as
// API.md v1.3. Their reading is one module (chat-message js/view/proposed.js),
// so a renamed field changes one place; the behaviour (the step line folded
// and open, the clock, the preview beside the log and as a sheet, the focus
// coming back, the file cards) is held by each component's probe.json in the
// browser. This is the half that needs none.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {deliverablesOf, previewOf, sameOriginHref, stepsOf} from '../src/smart/chat-message/js/view/proposed.js';

const root = resolve(import.meta.dirname, '..');
const read = (component, path) => readFileSync(join(root, 'src', 'smart', component, path), 'utf8');
const json = (component, path) => JSON.parse(read(component, path));
const page = {baseURI: 'https://chat.example/staff/', defaultView: {location: {origin: 'https://chat.example', href: 'https://chat.example/staff/'}}};

test('only an address of the page\'s own origin is ever taken', () => {
  assert.equal(sameOriginHref('/kb/1/preview', page), '/kb/1/preview');
  assert.equal(sameOriginHref('https://chat.example/kb/1', page), 'https://chat.example/kb/1');
  for (const other of ['//elsewhere.example/x', '/\\elsewhere.example', 'https://elsewhere.example/kb/1', 'javascript:alert(1)', 'data:text/html,x', '', null, 42]) {
    assert.equal(sameOriginHref(other, page), null, String(other));
  }
});

test('the readers answer nothing for a message without the fields, and clean what they read', () => {
  assert.deepEqual(stepsOf({}), []);
  assert.deepEqual(deliverablesOf({attachments: []}, page), []);
  assert.equal(previewOf({n: 1, kind: 'base', title: 'x'}, page), null);
  const steps = stepsOf({steps: [{label: ' Ищу ', state: 'running', started_at: '2026-10-30T10:00:00Z'}, {label: ''}, {label: 'Пишу', state: 'odd'}]});
  assert.deepEqual(steps.map((one) => [one.label, one.state]), [['Ищу', 'running'], ['Пишу', 'done']]);
  assert.equal(steps[1].started, null);
  assert.deepEqual(previewOf({preview_url: '/kb/1', locator: {from: 4, to: 2}}, page).locator, null);
  assert.deepEqual(previewOf({preview_url: '/kb/1', locator: {from: 2, to: 9}, mime: 'Text/HTML'}, page), {url: '/kb/1', locator: {from: 2, to: 9}, mime: 'text/html'});
  const [file] = deliverablesOf({attachments: [{id: 'f', name: 'a.pdf', href: 'https://elsewhere.example/a.pdf', preview_url: '/p'}]}, page);
  assert.equal(file.href, null);
  assert.equal(file.preview.kind, 'file');
});

test('the fields are read in proposed.js only', () => {
  const view = read('chat-message', 'js/view/message.js');
  const window = read('chat-window', 'index.js');
  for (const [name, source] of [['message.js', view], ['chat-window index.js', window]]) {
    assert.ok(!/message\.steps\b/u.test(source), `${name} reads steps raw`);
    assert.ok(!/source\.(preview_url|locator|mime)\b/u.test(source), `${name} reads a source's preview raw`);
  }
  assert.match(window, /PROPOSED_MESSAGE_FIELDS/u, 'the window passes the proposed fields through by the shared list');
});

test('the message declares open {kind: preview} and the steps toggle; the window the preview actions, event and state', () => {
  const message = json('chat-message', 'component.json');
  // Since 1.1.0 (message) and 1.2.0 (window); later versions keep it.
  const atLeast = (version, least) => version.split('.').map(Number).reduce((order, part, at) => order || Math.sign(part - least.split('.').map(Number)[at]), 0) >= 0;
  assert.ok(atLeast(message.version, '1.1.0'), message.version);
  assert.ok(message.events.open.cancelable, 'a host that shows the preview cancels it');
  assert.ok(message.events.open.carries.kind.values.includes('preview'));
  assert.match(message.events.toggle.summary, /kind: steps/u);
  const window = json('chat-window', 'component.json');
  assert.ok(atLeast(window.version, '1.2.0'), window.version);
  assert.deepEqual(Object.keys(window.actions['open-preview'].with), ['source']);
  assert.deepEqual(Object.keys(window.actions['close-preview'].with), ['focus']);
  assert.deepEqual(window.events.toggle.carries.kind.values, ['find', 'preview', 'start', 'members']);
  assert.equal(window['host-states']['data-preview-open'], 'boolean');
});

test('every new word is there in both languages, and a missing file is «Файл недоступен»', () => {
  const messageWords = ['steps-label', 'steps-running', 'steps-done', 'steps-done-in', 'steps-stopped', 'steps-stopped-in',
    'steps-count-one', 'steps-count-few', 'steps-count-many', 'steps-count-other', 'steps-state-running', 'steps-state-done',
    'steps-state-failed', 'steps-say', 'steps-say-failed', 'time-seconds', 'time-minutes', 'time-minutes-seconds', 'time-hours',
    'time-hours-minutes', 'files-ready', 'files-preview', 'files-download', 'sources-preview'];
  const windowWords = ['preview-back', 'preview-close', 'preview-new-tab', 'preview-loading', 'preview-error', 'preview-retry',
    'preview-unsupported', 'preview-opened', 'preview-marked', 'preview-number', 'preview-kind-base', 'preview-kind-my-base',
    'preview-kind-web', 'preview-kind-file', 'preview-untitled', 'steps-say', 'steps-say-failed'];
  for (const locale of ['ru', 'en']) {
    const message = json('chat-message', `lang/${locale}.json`).runtime;
    const window = json('chat-window', `lang/${locale}.json`).runtime;
    for (const word of messageWords) assert.ok(message[word], `chat-message ${locale}: ${word}`);
    for (const word of windowWords) assert.ok(window[word], `chat-window ${locale}: ${word}`);
  }
  assert.equal(json('chat-message', 'lang/ru.json').runtime['attachment-deleted'], 'Файл недоступен');
  assert.equal(json('chat-message', 'lang/ru.json').runtime['steps-done-in'], 'Сделано за {time}');
});
