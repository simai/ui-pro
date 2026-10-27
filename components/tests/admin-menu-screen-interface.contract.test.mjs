import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

// Stand 24 A1: the interface an admin screen binds on sf-admin-menu (the
// screen manifest's role `menu`): settings current and open, value favourite,
// action toggle {id, on}. Behaviour: tests/browser/admin-menu-screen-interface.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'src/smart/admin-menu/component.json'), 'utf8'));

test('sf-admin-menu declares what the admin screen binds, and keeps what it had', () => {
  assert.equal(manifest.settings.current?.type, 'string');
  assert.equal(manifest.settings.current.default, '', 'empty: the row of the address, as before');
  assert.equal(manifest.settings.open?.type, 'boolean');
  assert.equal(manifest.settings.open.optional, true, 'not written: no change for a page that never writes it');
  assert.equal(manifest.values.favourite?.type, 'boolean');
  assert.equal('default' in manifest.values.favourite, false, 'a value the menu reports, not a setting');
  assert.deepEqual(manifest.actions.toggle?.with, {id: 'id', on: 'boolean'});
  assert.ok(manifest.events.toggle, 'the event toggle stays');
  assert.ok(manifest.actions.refresh && manifest.values.compact, 'the earlier interface stays');
});
