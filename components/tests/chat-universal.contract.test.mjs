// sf-chat-window 1.6.0, sf-chat-message 1.4.0, sf-thread-list 1.6.0 and
// sf-chat-composer 1.2.0: the first real step of the one window for every
// conversation (ui-chat docs/design/UNIVERSAL-CHAT.md; owner decision
// q-0c04e83775: simai.chat-port 1.0 does not change). The behaviour in the browser
// is held by each component's probe.json; this is the half that needs none: the
// pure readings and what the manifests, the words and the port's schema declare.
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {runsOf, speakerOf, toPersonView, lastOwnEditableKey} from '../src/smart/chat-window/js/people.js';
import {EXTENSION_CAPABILITIES, EXTENSION_INTENTS, INTENTS, kindOf, verbOf} from '../src/smart/chat-window/js/port.js';

const root = resolve(import.meta.dirname, '..');
const read = (component, path) => readFileSync(join(root, 'src', 'smart', component, path), 'utf8');
const json = (component, path) => JSON.parse(read(component, path));

test('who speaks: author.kind wins, a port message without it is what its kind says', () => {
  assert.equal(speakerOf({kind: 'person', author: {id: 1}}), 'person');
  assert.equal(speakerOf({kind: 'assistant', author: {id: 'a'}}), 'assistant');
  assert.equal(speakerOf({kind: 'person', author: {kind: 'bot'}}), 'bot');
  assert.equal(speakerOf({kind: 'assistant', author: {kind: 'agent'}}), 'agent');
  assert.equal(speakerOf({kind: 'person', author: {kind: 'person'}}), 'person');
  assert.equal(speakerOf({kind: 'person', author: {kind: 'alien'}}), 'person', 'an unknown word is not a new kind');
});

test('a bot among people breaks a run and is nobody\'s to edit; a person\'s run is as it was', () => {
  const ivan = {id: 2, name: 'Иван'};
  const messages = [
    {id: 1, kind: 'person', author: ivan, body: 'a'},
    {id: 2, kind: 'person', author: {id: 'b', kind: 'bot', name: 'Бот', own: true}, body: 'b', can_edit: true},
    {id: 3, kind: 'person', author: ivan, body: 'c'},
  ];
  const runs = runsOf(messages, {type: 'group'});
  assert.equal(runs.has('2'), false);
  assert.equal(runs.get('1').last, true);
  assert.equal(runs.get('3').first, true);
  assert.equal(lastOwnEditableKey(messages), null);
});

test('without its capability a person\'s message has no reactions and no quote', () => {
  const message = {id: 5, kind: 'person', author: {id: 1, name: 'А'}, body: 'x', reactions: [{emoji: '👍', count: 1}], reply_to: {id: 1, text: 'y'}};
  const plain = toPersonView(message);
  assert.equal('reactions' in plain, false);
  assert.equal('reply_to' in plain, false);
  const offered = toPersonView(message, {reactions: true, reply: true});
  assert.deepEqual(offered.reactions, message.reactions);
  assert.deepEqual(offered.reply_to, message.reply_to);
  const tomb = toPersonView({...message, is_deleted: true}, {reactions: true, reply: true});
  assert.equal('reactions' in tomb, false, 'not on a deleted message');
  assert.equal('reply_to' in tomb, false);
  assert.equal(toPersonView({...message, author: {id: 1, avatar: '/a.png'}}).authorAvatar, '/a.png');
  assert.equal(toPersonView({...message, author: {id: 1, avatar_url: '/b.png', avatar: '/a.png'}}).authorAvatar, '/b.png');
});

test('the intents are the window\'s own; the port\'s message.send is not widened', () => {
  assert.deepEqual([EXTENSION_INTENTS['message.react'].capability, EXTENSION_INTENTS['message.reply'].capability], ['x-reactions', 'x-reply']);
  assert.equal(verbOf('message.react'), 'react');
  assert.equal(verbOf('message.reply'), 'submit');
  assert.equal(kindOf('message.reply'), 'reply');
  assert.equal(kindOf('message.send'), null);
  assert.ok(EXTENSION_CAPABILITIES.includes('x-reactions') && EXTENSION_CAPABILITIES.includes('x-reply'));
  assert.equal(INTENTS['message.send'].capability, null);
  assert.equal('message.react' in INTENTS, false);
  const overlaid = join(root, '.overlay', 'src', 'core', 'contracts', 'ports', 'simai.chat-port', '1.0.0', 'port.json');
  if (existsSync(overlaid)) {
    const port = JSON.parse(readFileSync(overlaid, 'utf8'));
    const send = port.intents['message.send'].payload;
    assert.equal(send.additionalProperties, false, 'why a reply is an intent of its own');
    assert.equal('reply_to_id' in send.properties, false);
    assert.equal('message.react' in port.intents, false);
  }
  assert.deepEqual(json('chat-window', 'component.json')['x-port'].supports, ['1.0.0']);
});

test('the window keeps people\'s behaviour behind people: the field, the strip, the view', () => {
  const source = read('chat-window', 'index.js');
  assert.match(source, /const waiting = !this\.has\("people"\) && /u, 'an answer holds no field between people');
  assert.match(source, /composer\.toggleAttribute\("no-stop", this\.has\("people"\)\)/u);
  assert.match(source, /if \(!this\.has\("people"\)\) return toView\(message\);/u, 'without people every message is what it was');
  assert.match(source, /if \(!strip\) \{\s+if \(!reply\) return;/u, 'no strip node until there is something to answer');
  assert.doesNotMatch(source, /"reply_to_id"|message\.send", \{[^}]*reply_to_id/u);
});

test('the versions, the events and the words are declared', () => {
  const window = json('chat-window', 'component.json');
  const message = json('chat-message', 'component.json');
  const list = json('thread-list', 'component.json');
  const composer = json('chat-composer', 'component.json');
  assert.deepEqual([window.version, message.version, list.version, composer.version], ['1.7.0', '1.4.1', '1.6.1', '1.2.0']);
  for (const [manifest, from, to] of [[window, '1.5.1', '1.6.0'], [message, '1.3.0', '1.4.0'], [list, '1.5.1', '1.6.0'], [composer, '1.1.0', '1.2.0']]) {
    assert.ok(manifest['x-registry'].compatibility.migrations.some((one) => one.from === from && one.to === to), `${manifest.tag} ${to}`);
  }
  assert.ok(window.events.react && message.events.react && message.events.reply && message.events.stop);
  assert.ok(message.events.open.carries.kind.values.includes('quote'));
  assert.ok(window['x-port']['own-capabilities'].includes('x-reactions') && window['x-port']['own-capabilities'].includes('x-reply'));
  assert.equal(composer.settings['no-stop'].default, false);
  const ru = json('chat-message', 'lang/ru.json').runtime;
  assert.deepEqual([ru['speaker-assistant'], ru['speaker-agent'], ru['speaker-bot']], ['ИИ', 'Агент', 'Бот'], 'the word, so colour is not alone');
  const en = json('chat-message', 'lang/en.json').runtime;
  assert.deepEqual([en['speaker-assistant'], en['speaker-agent'], en['speaker-bot']], ['AI', 'Agent', 'Bot']);
  assert.equal(ru['reactions-pill-mine'], 'Реакция {emoji}, {count}, ваша');
  assert.equal(ru['fold-more'], 'Показать полностью');
  for (const locale of ['ru', 'en']) {
    const runtime = json('chat-window', `lang/${locale}.json`).runtime;
    for (const name of ['reactions-refused', 'reply-cancel', 'reply-label', 'reply-say', 'reply-you']) assert.ok(runtime[name], `${locale}: ${name}`);
  }
  assert.match(read('thread-list', 'js/templates/default.js'), /SHAPES = new Set\(\["circle", "square"\]\)/u);
  assert.doesNotMatch(read('thread-list', 'js/templates/default.css'), /#[0-9a-f]{3,8}\b/iu, 'no hardcoded colours');
});
