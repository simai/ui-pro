import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const menuModule = () => import(new URL('../src/smart/admin-menu/js/navigation/menu.js', import.meta.url).href);

// sf-menu-context's openFor answered true or false up to 1.12.1 and answers an
// outcome object from 1.12.2 (SIMAI Framework fix/action-call-defects):
// {outcome: 'applied' | 'refused' | 'unavailable', ...}. A refused open is an
// object, so `if (!opened)` read it as open and the site switcher stayed
// "open" with no menu on screen. The navigation reads both answers.

test('menuOpened reads the boolean answer and the outcome answer', async () => {
  const {menuOpened} = await menuModule();
  assert.equal(menuOpened(true), true);
  assert.equal(menuOpened(false), false);
  assert.equal(menuOpened({outcome: 'applied', value: true}), true);
  assert.equal(menuOpened({outcome: 'refused', value: false}), false);
  assert.equal(menuOpened({outcome: 'unavailable', value: false}), false);
  for (const nothing of [null, undefined, {}, 1, 'applied']) assert.equal(menuOpened(nothing), false);
});

test('openMenu answers a boolean whichever answer the menu gives', async () => {
  const {openMenu} = await menuModule();
  class FakeElement {
    getBoundingClientRect() { return {width: 120}; }
  }
  const saved = {Element: globalThis.Element, SF: globalThis.SF, customElements: globalThis.customElements};
  globalThis.Element = FakeElement;
  globalThis.SF = {Loader: {ensure: async () => {}}};
  globalThis.customElements = {get: name => (name === 'sf-menu-context' ? class {} : undefined)};
  try {
    const anchor = new FakeElement();
    for (const [answer, expected] of [
      [true, true],
      [false, false],
      [{outcome: 'applied', value: true}, true],
      [{outcome: 'refused', value: false}, false],
      [{outcome: 'unavailable', value: false}, false],
    ]) {
      const menu = {
        isConnected: true,
        isOpen: false,
        style: {setProperty() {}, removeProperty() {}},
        setAttribute() {},
        openFor: async () => answer,
      };
      const controller = {_menu: menu};
      const opened = await openMenu(controller, anchor, {label: 'Sites', entries: [], select: () => null, width: 'trigger'});
      assert.equal(opened, expected, `answer ${JSON.stringify(answer)}`);
    }
  } finally {
    Object.assign(globalThis, saved);
  }
});

test('the site switcher closes again when the menu did not open', async () => {
  const controller = await read('src/smart/admin-menu/js/navigation/controller.js');
  const sites = controller.match(/\n    async openSites\(anchor\) \{([\s\S]*?)\n    \}\n/u)?.[1] ?? '';
  assert.match(sites, /const opened = await openMenu\(this, anchor, \{/u);
  assert.match(sites, /if \(opened !== true\) \{\n\s+this\.sites = \{\.\.\.this\.sites, open: false\};/u);
  const menu = await read('src/smart/admin-menu/js/navigation/menu.js');
  assert.match(menu, /return menuOpened\(await menu\.openFor\(anchor, \{side, align, width: width === "trigger" \? "list" : "content"\}\)\);/u);
  assert.match(menu, /answer === true \|\| answer\?\.outcome === "applied"/u);
});
