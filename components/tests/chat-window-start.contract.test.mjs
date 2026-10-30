// sf-chat-window 1.4.0 and sf-thread-list 1.5.0: a new conversation or group
// (x-conversation-start) and a group's members, read only (x-members). The
// behaviour in the browser (no commands without the capability, the stale
// answer, refused against no results, the form kept with what was entered, the
// key across a retry, the focus coming back, 500 rows) is held by the window's
// probe.json, p24-p29, and the list's p-create-commands; this is the half that
// needs none: the pure readings of js/start-model.js and what the manifests and
// words declare.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {
  GROUP_LIMITS, GroupKey, checkGroup, groupLimits, hasMembers, initialsOf, memberRow, personItem, roleWord, searchOutcome, startOutcome,
} from '../src/smart/chat-window/js/start-model.js';
import {EXTENSION_CAPABILITIES, EXTENSION_INTENTS, kindOf} from '../src/smart/chat-window/js/port.js';

const root = resolve(import.meta.dirname, '..');
const json = (component, path) => JSON.parse(readFileSync(join(root, 'src', 'smart', component, path), 'utf8'));

test('the limits are the host\'s, with the window\'s defaults for what it does not give', () => {
  assert.deepEqual(groupLimits(undefined), {title_chars: 120, members_max: 49, search_min: 2, search_max: 20, query_chars: 80});
  assert.deepEqual(groupLimits({title_chars: 10, members_max: '3', search_min: 0, search_max: 'x'}), {...GROUP_LIMITS, title_chars: 10, members_max: 3});
});

test('a found person is an id and a name, nothing else is read', () => {
  assert.deepEqual(personItem({id: 5, name: 'Иван Петров', email: 'i@example.com', login: 'ivan'}), {value: 5, label: 'Иван Петров', avatar: {initials: 'ИП'}});
  assert.deepEqual(personItem({id: 5, name: ''}), {value: 5, label: ''});
  assert.equal(initialsOf('  анна  мария соколова '), 'АМ');
});

test('refused access-denied is not no results; 20 results are as many as may come; anything else failed', () => {
  assert.deepEqual(searchOutcome({answer: 'refused', reason: 'access-denied', text: 'причина'}), {state: 'denied'});
  assert.deepEqual(searchOutcome({answer: 'applied', data: {items: []}}), {state: 'items', items: [], truncated: false});
  assert.equal(searchOutcome({answer: 'refused', reason: 'busy'}).state, 'failed');
  assert.equal(searchOutcome({answer: 'unavailable', reason: 'port-failed'}).state, 'failed');
  const items = Array.from({length: 20}, (_, at) => ({id: at, name: `n${at}`}));
  assert.equal(searchOutcome({answer: 'applied', data: {items}}, {search_max: 20}).truncated, true);
  assert.equal(searchOutcome({answer: 'applied', data: {items: items.slice(1)}}, {search_max: 20}).truncated, false);
  assert.deepEqual(searchOutcome({answer: 'applied', data: {items: [{name: 'без id'}, {id: 0, name: 'ноль'}]}}).items.map((one) => one.value), [0]);
});

test('conversation.start: each answer is its line', () => {
  const said = (answer, reason) => startOutcome({answer, reason});
  assert.equal(said('applied'), 'opened');
  assert.equal(said('refused', 'access-denied'), 'denied');
  assert.equal(said('refused', 'invalid-recipient'), 'recipient');
  assert.equal(said('refused', 'invalid-group'), 'group');
  assert.equal(said('refused', 'conflict'), 'conflict');
  assert.equal(said('conflict', null), 'conflict');
  assert.equal(said('refused', 'busy'), 'retry');
  assert.equal(said('unavailable', 'no-answer'), 'retry');
  assert.equal(said('unavailable', 'port-failed'), 'retry');
  assert.equal(said('refused', 'prevented'), 'silent');
});

test('a group\'s key stays with the same form across a retry, a change takes a new one, and so does the press after a conflict', () => {
  let minted = 0;
  const key = new GroupKey(() => `k${++minted}`);
  const first = key.take('Отдел', [1, 2]);
  assert.equal(first, 'k1');
  assert.equal(key.take('Отдел', [1, 2]), first, 'a retry after a lost answer');
  assert.equal(key.take('Отдел продаж', [1, 2]), 'k2', 'the title changed');
  assert.equal(key.take('Отдел продаж', [1, 2, 3]), 'k3', 'the members changed');
  assert.equal(key.take('Отдел', [1, 2]), 'k4', 'back to an earlier form is not the earlier key');
  key.reset();
  assert.equal(key.take('Отдел', [1, 2]), 'k5', 'the host said conflict');
});

test('an incomplete form names what is missing', () => {
  assert.deepEqual(checkGroup({title: '   ', members: []}), {title: 'required', members: 'required'});
  assert.deepEqual(checkGroup({title: ' Отдел ', members: [{}]}), {title: '', members: ''});
  assert.equal(checkGroup({title: 'x'.repeat(121), members: [{}]}).title, 'long');
  assert.equal(checkGroup({title: ' xx ', members: [{}]}, {...GROUP_LIMITS, title_chars: 2}).title, '');
});

test('roles have words, an unknown one none; only groups and channels have members', () => {
  assert.equal(roleWord('owner'), 'members.role.owner');
  assert.equal(roleWord('superuser'), '');
  assert.deepEqual(memberRow({id: 1, name: 'А', role: 'observer', email: 'x'}), {id: 1, name: 'А', role: 'members.role.observer'});
  assert.deepEqual(['group', 'channel', 'private', 'assistant', undefined].map(hasMembers), [true, true, false, false, false]);
});

test('the intents are the window\'s own and the port does not change', () => {
  const window = json('chat-window', 'component.json');
  assert.equal(window.version, '1.6.0');
  assert.deepEqual(window['x-port'].supports, ['1.0.0']);
  for (const [intent, capability] of [['recipients.search', 'x-conversation-start'], ['conversation.start', 'x-conversation-start'], ['members.list', 'x-members']]) {
    assert.equal(EXTENSION_INTENTS[intent].capability, capability);
    assert.equal(EXTENSION_INTENTS[intent].former, null, `${intent} was born after 0.3`);
  }
  assert.deepEqual(['x-conversation-start', 'x-members'].filter((one) => !EXTENSION_CAPABILITIES.includes(one) || !window['x-port']['own-capabilities'].includes(one)), []);
  assert.equal(kindOf('recipients.search', {query: 'ив'}), 'recipients');
  assert.equal(kindOf('conversation.start', {kind: 'group'}), 'group');
  assert.equal(kindOf('conversation.start', {kind: 'private'}), 'private');
  assert.equal(kindOf('members.list', {}), 'members');
  assert.ok(window['x-registry'].compatibility.migrations.some((one) => one.from === '1.3.0' && one.to === '1.4.0'));
  for (const name of ['open-start', 'close-start', 'open-members', 'close-members']) assert.ok(window.actions[name], name);
  assert.ok(window.relations.some((one) => one.name === 'cl-lookup'), 'the picker is the Framework\'s');
});

test('the window itself hides the conversation under the form and the members, over a page\'s unlayered layout', () => {
  const css = readFileSync(join(root, 'src', 'smart', 'chat-window', 'js', 'templates', 'default.css'), 'utf8');
  for (const view of ['start', 'members']) {
    for (const part of ['.chat-shell__list > .sf-message-log', '.chat-shell__composer', '.chat-shell__find', '.chat-shell__header .sf-chat-interlocutor', '.chat-shell__thread-title']) {
      assert.ok(css.includes(`.chat-shell--${view} ${part}`), `${view}: ${part}`);
    }
  }
  assert.match(css, /\.chat-shell--members \.chat-shell__thread-title \{ display: none !important; \}/u);
  assert.match(css, /\.chat-shell--files \.chat-shell__thread-title \{ display: none; \}/u, 'the files view keeps its rule');
});

test('the list declares its commands additively', () => {
  const list = json('thread-list', 'component.json');
  assert.equal(list.version, '1.6.0');
  assert.deepEqual(list.settings['create-commands'].default, []);
  assert.equal(list.events.create.carries.kind.optional, true);
  assert.ok(json('thread-list', 'smart.manifest.json').compatibility.migrations.some((one) => one.from === '1.4.0' && one.to === '1.5.0'));
});

test('the words are there in both languages, with plurals where a number is said', () => {
  const needed = [
    'start-private', 'start-group', 'start-back', 'start-person', 'start-members', 'start-name', 'start-placeholder', 'start-create', 'start-opening',
    'start-denied', 'start-private-failed', 'start-group-failed', 'start-recipient', 'start-recipient-group', 'start-group-invalid', 'start-conflict',
    'start-name-required', 'start-name-long', 'start-members-required', 'start-truncated',
    'members-open', 'members-back', 'members-loading', 'members-denied', 'members-failed', 'members-count',
    'members-role-owner', 'members-role-manager', 'members-role-member', 'members-role-observer',
  ];
  for (const locale of ['ru', 'en']) {
    const {runtime} = json('chat-window', `lang/${locale}.json`);
    for (const name of needed) assert.ok(runtime[name], `${locale}: ${name}`);
  }
  const ru = json('chat-window', 'lang/ru.json').runtime;
  const en = json('chat-window', 'lang/en.json').runtime;
  const select = (word, locale, count) => word[new Intl.PluralRules(locale).select(count)].replace('{n}', String(count));
  assert.deepEqual([1, 2, 5, 21].map((count) => select(ru['members-count'], 'ru', count)), ['1 участник', '2 участника', '5 участников', '21 участник']);
  assert.deepEqual([1, 2, 5].map((count) => select(en['members-count'], 'en', count)), ['1 member', '2 members', '5 members']);
  assert.equal(ru['start-denied'], 'Создание недоступно');
  assert.equal(ru['members-denied'], 'Состав недоступен');
  assert.equal(ru['start-truncated'], 'Показаны первые {n}. Уточните запрос.');
  assert.deepEqual([ru['members-role-owner'], ru['members-role-manager'], ru['members-role-member'], ru['members-role-observer']], ['Владелец', 'Руководитель', 'Участник', 'Наблюдатель']);
});
