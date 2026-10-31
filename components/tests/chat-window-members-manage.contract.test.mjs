// sf-chat-window 1.9.0: managing a group's members (x-members-manage). The
// browser half (no buttons without the capability or the flag, a row dropped
// without a second request, the last owner's line, a press that sends once) is
// held by the window's probe.json; this is the half that needs none: the pure
// readings of js/members-model.js and what the manifests and words declare.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {
  ASSIGNABLE_ROLES, CONFIRMED, MEMBER_INTENTS, excludeOf, headActions, memberOutcome, rowActions,
} from '../src/smart/chat-window/js/members-model.js';
import {EXTENSION_CAPABILITIES, EXTENSION_INTENTS, INTENTS, kindOf, verbOf} from '../src/smart/chat-window/js/port.js';

const root = resolve(import.meta.dirname, '..');
const json = (component, path) => JSON.parse(readFileSync(join(root, 'src', 'smart', component, path), 'utf8'));

test('a button comes from its flag and only from it', () => {
  assert.deepEqual(rowActions({role: 'member', canChangeRole: true, canRemove: true, canTransfer: true}), ['role', 'remove', 'transfer']);
  assert.deepEqual(rowActions({role: 'owner', canRemove: false, canChangeRole: false, canTransfer: false}), []);
  assert.deepEqual(rowActions({role: 'member', canRemove: true}), ['remove'], 'a manager removes, nothing more');
  // A role the window would allow by its own reckoning still shows nothing without the flag.
  assert.deepEqual(rowActions({role: 'observer'}), []);
  assert.deepEqual(rowActions({role: 'member', canRemove: 'yes'}), [], 'only true counts');
  assert.deepEqual(headActions({can_manage: true, can_leave: true}), ['add', 'leave']);
  assert.deepEqual(headActions({can_manage: false, can_leave: false}), []);
  assert.deepEqual(headActions(null), []);
});

test('what cannot be taken back is asked first; a role is not', () => {
  assert.deepEqual([...CONFIRMED].sort(), ['leave', 'remove', 'transfer']);
  assert.deepEqual(ASSIGNABLE_ROLES, ['manager', 'member', 'observer'], 'the owner is made by handing over');
});

test('an answer is read as the module gives it', () => {
  const roster = [{id: 1, name: 'А', role: 'owner'}];
  assert.deepEqual(memberOutcome('member.add', {answer: 'applied', data: {participants: roster}}), {state: 'roster', participants: roster});
  assert.deepEqual(memberOutcome('member.role', {answer: 'applied', data: {participants: roster}}), {state: 'roster', participants: roster});
  assert.deepEqual(memberOutcome('member.transfer', {answer: 'applied', data: {}}), {state: 'roster', participants: null});
  assert.deepEqual(memberOutcome('member.remove', {answer: 'applied', data: {removed_user_id: 7}}), {state: 'removed', id: 7}, 'no roster asked for');
  assert.deepEqual(memberOutcome('member.leave', {answer: 'applied'}), {state: 'left'});
  assert.deepEqual(memberOutcome('member.leave', {answer: 'refused', reason: 'owner-transfer-required'}),
    {state: 'line', word: 'members.leave-owner', retry: false, reload: false});
  assert.equal(memberOutcome('member.add', {answer: 'refused', reason: 'group-full'}).word, 'members.full');
  assert.equal(memberOutcome('member.add', {answer: 'refused', reason: 'invalid-recipient'}).word, 'members.add-invalid');
  const stale = memberOutcome('member.remove', {answer: 'refused', reason: 'access-denied'});
  assert.deepEqual([stale.word, stale.reload, stale.retry], ['members.denied-action', true, false], 'stale flags: say it and ask again');
  const lost = memberOutcome('member.role', {answer: 'unavailable', reason: 'busy'});
  assert.deepEqual([lost.word, lost.retry], ['members.failed-action', true]);
  assert.equal(memberOutcome('member.add', {answer: 'refused', reason: 'prevented'}).word, '', 'a page that cancelled is not told off');
});

test('adding offers nobody already in, and never the reader', () => {
  assert.deepEqual(excludeOf([{id: 1}, {id: 2}], 9), [1, 2, 9]);
  assert.deepEqual(excludeOf([], null), []);
  assert.deepEqual(excludeOf(undefined, 9), [9]);
});

test('the intents are the window\'s own, one verb, and the port does not change', () => {
  for (const intent of MEMBER_INTENTS) {
    assert.equal(INTENTS[intent], undefined, `${intent} is not the port's`);
    assert.equal(EXTENSION_INTENTS[intent].capability, 'x-members-manage');
    assert.equal(verbOf(intent), 'apply');
    assert.equal(kindOf(intent), 'member');
    assert.equal(EXTENSION_INTENTS[intent].former, null);
  }
  assert.ok(EXTENSION_CAPABILITIES.includes('x-members-manage'));
});

test('the manifest, the words and the docs declare it', () => {
  const window = json('chat-window', 'component.json');
  assert.equal(window.version, '1.9.0');
  assert.equal(window.port.version, '1.0.0', 'the port is not extended');
  assert.ok(window.events.apply, 'the apply event');
  assert.ok(window['x-registry'].compatibility.migrations.some((one) => one.from === '1.8.0' && one.to === '1.9.0'));
  for (const lang of ['ru', 'en']) {
    const words = json('chat-window', `lang/${lang}.json`).runtime;
    for (const key of ['members-add', 'members-leave', 'members-remove', 'members-transfer', 'members-leave-owner', 'members-full',
      'members-ask-remove', 'members-then-remove', 'members-ask-transfer', 'members-then-transfer', 'members-ask-leave',
      'members-then-leave', 'members-add-warning', 'members-cancel', 'members-denied-action', 'members-failed-action']) {
      assert.ok(typeof words[key] === 'string' && words[key].length, `${lang}: ${key}`);
    }
  }
  const docs = readFileSync(join(root, 'src', 'smart', 'chat-window', 'docs.md'), 'utf8');
  assert.match(docs, /x-members-manage/);
});
