// sf-chat-window's port table (src/smart/chat-window/js/port.js) against the
// port contract it declares (component.json port, the copy of
// simai.chat-port 1.0.0 in its contracts/ folder) and against its dated
// aliases: what simai/ui-chat's tests/chat-window.test.mjs held for the
// window's port.js, moved with it (D31 step 6). The window's behaviour is
// held by its probe.json in the browser; this is the half that needs none.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname, '..');
const folder = join(root, 'src', 'smart', 'chat-window');
const json = (path) => JSON.parse(readFileSync(join(folder, path), 'utf8'));
const port = await import(pathToFileURL(join(folder, 'js', 'port.js')).href);
const manifest = json('component.json');
const contract = json(manifest.port.contract);
const aliases = json('aliases.json').aliases;

test('the window declares the chat port and the contract it names is that port', () => {
  assert.equal(manifest.port.id, 'simai.chat-port');
  assert.equal(contract.port, manifest.port.id);
  assert.ok(contract.version.startsWith(`${manifest.port.version}.`) || contract.version === manifest.port.version);
  assert.equal(contract.element, manifest.tag);
});

test('every intent of the port is in the table under its capability and its 0.3 event, and nothing else is', () => {
  assert.deepEqual(Object.keys(port.INTENTS).sort(), Object.keys(contract.intents).sort());
  for (const [intent, spec] of Object.entries(contract.intents)) {
    assert.equal(port.INTENTS[intent].capability, spec.capability ?? null, intent);
    assert.equal(port.INTENTS[intent].former, spec.event, intent);
  }
  assert.deepEqual([...port.CAPABILITIES].sort(), Object.keys(contract.capabilities).sort());
  assert.deepEqual([...port.DATA].sort(), Object.keys(contract.data).sort());
});

test('the window\'s own capabilities never take the port\'s names', () => {
  for (const [intent, spec] of Object.entries(port.EXTENSION_INTENTS)) {
    assert.ok(!(intent in contract.intents), intent);
    assert.match(spec.capability, /^x-/u, intent);
    assert.match(spec.former, /^chat-window:/u, intent);
  }
  for (const capability of port.EXTENSION_CAPABILITIES) assert.ok(!(capability in contract.capabilities), capability);
});

test('every intent goes out under a declared event, and its 0.3 name follows it until 2026-12-01', () => {
  for (const [intent, spec] of Object.entries({...port.INTENTS, ...port.EXTENSION_INTENTS})) {
    const verbs = intent === 'conversation.archive' ? ['archive', 'restore'] : [spec.verb];
    for (const verb of verbs) {
      assert.ok(manifest.events[verb], `${intent}: ${verb} is not an event of the window`);
      const row = aliases.find((one) => one.from === spec.former && one.to === `sf-chat-window-${verb}`);
      assert.ok(row, `${intent}: no alias ${spec.former} → sf-chat-window-${verb}`);
      assert.equal(row.mode, 'split');
      assert.deepEqual(row.when, {intent});
      assert.equal(row.remove_after, '2026-12-01');
    }
  }
  assert.ok(aliases.some((one) => one.from === 'sf-chat-window-answer' && one.to === 'sf-chat-window-settled'));
});
