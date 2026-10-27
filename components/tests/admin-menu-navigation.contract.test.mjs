import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin Menu inactive navigation layers are inert and hidden from accessibility APIs', async () => {
  const template = await read('src/smart/admin-menu/js/templates/default.js');

  assert.match(template, /aria-hidden=\$\{isInteractive \? nothing : "true"\}/);
  assert.match(template, /\?inert=\$\{!isInteractive\}/);
  assert.match(template, /\?inert=\$\{hasOpenNestedPanel\}/);
  assert.match(template, /data-panel="search_panel"[\s\S]*?\?inert=\$\{!panels\["search_panel"\]\?\.open\}/);
});

test('Admin Menu drill-down restores a meaningful trigger and localizes Back', async () => {
  const source = await read('src/smart/admin-menu/index.js');
  const template = await read('src/smart/admin-menu/js/templates/default.js');

  assert.match(source, /this\._panelReturnFocus = new Map\(\)/);
  assert.match(source, /scheduleNavigationFocus\(resolveTarget\)/);
  assert.match(source, /this\.getPanelBackButton\(panelId\)/);
  assert.match(source, /panelId === "search_panel"[\s\S]*?this\.getSearchInput\(\)/);
  // The name says where the arrow goes, which is what the consumer's owner asked
  // for on 2026-10-03: a submenu header reads «‹ Раздел», and «Назад» alone left
  // a reader guessing what it goes back to.
  assert.match(template, /back: "menu-translations-back"/);
  assert.equal(JSON.parse(readFileSync(new URL("../src/smart/admin-menu/lang/ru.json", import.meta.url), "utf8")).runtime["menu-translations-back"], "Назад к меню");
  assert.match(template, /aria-label=\$\{menuText\("back"\)\}/);
});

test('Admin Menu search and directional panels reuse logical navigation behavior', async () => {
  const source = await read('src/smart/admin-menu/index.js');
  const template = await read('src/smart/admin-menu/js/templates/default.js');
  const styles = await read('src/component/admin-menu/scss/_css__admin_menu.scss');

  assert.match(source, /filter\(\(item\) => item\.score > 0 && !item\.disabled\)/);
  assert.match(template, /component\.setCompact\(false, "search"\);[\s\S]*?component\.focusSearchInput\(\);/);
  assert.match(template, /aria-label=\$\{context\.searchPlaceholder \|\| menuText\("search"\)\}/);
  // This used to pin the defect it should have caught: it asserted that the open
  // search panel is translateX(-100%) in RTL and that a narrow-screen block
  // corrects it to zero. The panel was therefore a menu width to the side of the
  // menu on every wider screen, clipped away by the menu's own overflow, and the
  // contract said that was correct. Open is translateX(0), in both directions,
  // and no breakpoint has anything to correct.
  assert.match(
    styles,
    /\.sf-admin-menu-panel-search\.open,\s*\.sf-admin-menu-panel-search\.open:dir\(rtl\) \{\s*transform: translateX\(0\);/u,
  );
  assert.match(styles, /\.sf-admin-menu-panel-sub\.open \{\s*transform: translateX\(0\);/u, 'the same as a submenu');
  assert.doesNotMatch(styles, /\.sf-admin-menu-panel-search\.open[^{]*\{\s*transform: translateX\(-?100%\)/u);
  assert.match(styles, /\.sf-admin-menu-direction-icon:dir\(rtl\)/);
});
