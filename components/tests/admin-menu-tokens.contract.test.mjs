import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin Menu sources geometry from Framework size and breakpoint contracts', async () => {
  const styles = await read('src/component/admin-menu/scss/_css__admin_menu.scss');

  assert.match(styles, /--sf-admin-menu-panel--inline-size, var\(--sf-g0\)/);
  assert.match(styles, /--sf-admin-menu-panel-compact--inline-size, var\(--sf-e1\)/);
  assert.match(styles, /@use '\.\.\/\.\.\/\.\.\/core\/scss\/vars\/sf_var__breakpoint' as bp;/);
  assert.match(styles, /@media \(max-width: map\.get\(bp\.\$breakpoint-array, sm\)\)/);
  assert.doesNotMatch(styles, /(?<![\w-])\d+(?:\.\d+)?(?:px|rem|em)\b/);
});

test('Admin Menu uses hairline and semantic radius tokens by element role', async () => {
  const styles = await read('src/component/admin-menu/scss/_css__admin_menu.scss');

  // The counts are a ledger, not a limit: a new hairline or a new rounded
  // corner has to be a decision someone made. The search panel of 2026-10-03
  // added two hairlines — the line under the key hints and the border of the Esc
  // key — and three rounded things: that key, the mark on a matched word, and the
  // rows of nothing shown while the host is answering.
  assert.equal((styles.match(/var\(--sf-px\)/g) || []).length, 8);
  assert.equal((styles.match(/var\(--sf-radius--ui\)/g) || []).length, 11);
  assert.equal((styles.match(/var\(--sf-radius--surface\)/g) || []).length, 2);
  assert.match(styles, /\.sf-admin-menu-bottom[\s\S]*?var\(--sf-radius--surface\)/);
});
