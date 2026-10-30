// sf-chat-window 1.1.0 and sf-chat-composer 1.1.0: the queue of questions
// asked while an answer is awaited, and the search within the open
// conversation, as their manifests and words declare them. The behaviour (the
// order after a successful answer, no sending after an error, «Изменить»,
// «Убрать», stop keeping the queue; the count, Enter and Shift+Enter, the two
// Escapes) is held by each component's probe.json in the browser; this is the
// half that needs none.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (component, path) => readFileSync(join(root, 'src', 'smart', component, path), 'utf8');
const json = (component, path) => JSON.parse(read(component, path));

test('the window declares the search as actions, an event and a host state, and the queue as a setting', () => {
  const manifest = json('chat-window', 'component.json');
  assert.ok(manifest.actions['open-find'] && manifest.actions['close-find']);
  assert.deepEqual(Object.keys(manifest.actions['open-find'].with), ['query']);
  assert.deepEqual(Object.keys(manifest.actions['close-find'].with), ['focus']);
  // 1.2.0 adds the source preview's toggle beside the search's.
  assert.ok(manifest.events.toggle.carries.kind.values.includes('find'));
  assert.ok(!manifest.events.toggle.cancelable, 'toggle says what happened, it is not a request');
  assert.equal(manifest['host-states']['data-find-open'], 'boolean');
  assert.equal(manifest.keyboard.host['Mod+F'], 'open');
  assert.equal(manifest.settings['no-queue'].default, false);
  // No new intent: a queued question goes out as an ordinary message.send.
  assert.ok(!/queue/u.test(read('chat-window', 'js/port.js')));
});

test('the composer lets a message of text out while busy only with queue, off by default', () => {
  const manifest = json('chat-composer', 'component.json');
  assert.equal(manifest.settings.queue.type, 'boolean');
  assert.equal(manifest.settings.queue.default, false);
  const source = read('chat-composer', 'index.js');
  assert.match(source, /return this\.busy && this\.queue && this\.chips\.length === 0;/u, 'a message with files is not queued');
});

test('every reason a queue is held for has its line, in both languages', () => {
  const source = read('chat-window', 'index.js');
  const table = source.match(/const HELD_REASON = \{([\s\S]*?)\};/u)?.[1];
  assert.ok(table, 'HELD_REASON');
  const reasons = new Set([...table.matchAll(/:\s*"([a-z]+)"/gu)].map((one) => one[1]));
  assert.ok(reasons.size >= 6);
  for (const locale of ['ru', 'en']) {
    const words = json('chat-window', `lang/${locale}.json`).runtime;
    for (const reason of reasons) assert.ok(words[`queue-held-${reason}`], `${locale}: queue-held-${reason}`);
    for (const word of ['queue-label', 'queue-unsent', 'queue-added', 'queue-send', 'queue-edit', 'queue-remove',
      'find-label', 'find-placeholder', 'find-count', 'find-none', 'find-previous', 'find-next', 'find-close']) {
      assert.ok(words[word], `${locale}: ${word}`);
    }
  }
  const ru = json('chat-window', 'lang/ru.json').runtime;
  assert.equal(ru['queue-label'], 'Отправлю после ответа');
  assert.equal(ru['queue-held-failed'], 'Не отправлено: ответ завершился ошибкой');
  assert.equal(ru['find-none'], 'Ничего не найдено');
});

test('the marks are the CSS Custom Highlight API the sheet paints, with forced colours', () => {
  const css = read('chat-window', 'js/templates/default.css');
  const source = read('chat-window', 'index.js');
  for (const name of ['sf-chat-window-found', 'sf-chat-window-found-current']) {
    assert.ok(source.includes(`"${name}"`), name);
    assert.ok(css.includes(`::highlight(${name})`), name);
  }
  assert.match(css, /forced-colors: active\)[\s\S]*?::highlight\(sf-chat-window-found\) \{ background-color: Mark;/u);
});
