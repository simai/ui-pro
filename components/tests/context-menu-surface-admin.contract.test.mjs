import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

// Split from the ui-source test of the same stem when the package components left
// ui-source; it runs in the overlay (ui-source at the pinned revision with this
// repository laid over it), so paths are the ones ui-source uses.
const admin=readFileSync(new URL('../src/smart/admin-menu/index.js',import.meta.url),'utf8');

test('Admin menu lets the context menu content own bounded scrolling',()=>{
  assert.match(admin,/--sf-context-menu-available-block-size/);
  assert.match(admin,/surface\.style\.overflow = "visible"/);
  assert.doesNotMatch(admin,/surface\.style\.overflow = "auto"/);
});
