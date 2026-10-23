import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin menu overflow measurement tolerates an empty item ref map', async () => {
  const source = await read('src/smart/admin-menu/index.js');

  assert.match(source, /const parentSpace = setParentSpace\(this\.refs\.items\);/);
  assert.match(source, /this\.parentGap = parentSpace\?\.gap \?\? 0;/);
  assert.doesNotMatch(source, /setParentSpace\(this\.refs\.items\)\.gap/);
});

test('Admin menu does not drop a resize measurement while a render measurement is active', async () => {
  const source = await read('src/smart/admin-menu/index.js');

  assert.match(source, /if \(this\.isMeasuring\) \{\s*this\.overflowUpdatePending = true;/s);
  assert.match(source, /if \(this\.overflowUpdatePending\) \{\s*this\.overflowUpdatePending = false;\s*this\.scheduleOverflowUpdate\(\);/s);
  assert.match(source, /this\.observeMainResize\(\);\s*this\.scheduleOverflowUpdate\(\);/s);
});

test('Admin menu resolves rendered DOM when compiled template refs have no value', async () => {
  const source = await read('src/smart/admin-menu/index.js');

  assert.match(source, /getMenuPanelElement\(\)/);
  assert.match(source, /this\.refs\.menuPanel\?\.value \|\|/);
  assert.match(source, /querySelector\("\.sf-admin-menu-main"\)/);
  assert.match(source, /getMenuItemElement\(panelId, refValue = null\)/);
  assert.match(source, /element\.dataset\.panelId === String\(panelId\)/);
  assert.match(source, /this\.getMenuItemElement\(id, refValue\)/);
  assert.match(source, /visibleItemElement\?\.offsetHeight/);
  assert.match(source, /this\._itemHeightCache = new Map\(\)/);
  assert.match(source, /this\._itemHeightCache\.get\(id\)/);
});

test('Admin menu panels fill a narrow mobile host without a blank strip', async () => {
  const styles = await read('src/component/admin-menu/scss/_css__admin_menu.scss');

  assert.match(styles, /@media \(max-width: map\.get\(bp\.\$breakpoint-array, sm\)\)/);
  assert.match(styles, /\.sf-admin-menu-panel:not\(\.small\) \{\s*inline-size: 100%;/s);
  assert.match(styles, /\.sf-admin-menu-panel\.small \{\s*inline-size: var\(--sf-admin-menu-panel-compact--inline-size, var\(--sf-e1\)\);/s);
});
