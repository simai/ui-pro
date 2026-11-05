import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Two findings from Larena's stand at 1296x714 (2026-10-12), against mockup v5.

test('the profile menu and the site switcher open as wide as their button', async () => {
  // Since 2026-10-14 (owner): the two menus that open from a full-width button
  // of the first column are exactly that wide, a long line ending in an
  // ellipsis; in the narrow rail, where the button is a picture, they are as
  // wide as their lines. The f8 floor every menu here had is gone.
  const account = await read('src/smart/admin-menu/js/navigation/account.js');
  assert.match(account, /width: controller\.compact \? "content" : "trigger",/u);
  const controller = await read('src/smart/admin-menu/js/navigation/controller.js');
  assert.match(controller, /width: this\.compact \? "content" : "trigger",/u);
  const menu = await read('src/smart/admin-menu/js/navigation/menu.js');
  // At least the button's width, wider when a line needs it (2026-10-14).
  assert.match(menu, /menu\.style\.setProperty\("--sf-context-menu--min-inline-size", `\$\{Math\.round\(anchor\.getBoundingClientRect\(\)\.width\)\}px`\)/u);
  assert.match(menu, /menu\.openFor\(anchor, \{side, align, width: "content"\}\)/u);
  const styles = await read('src/smart/admin-menu/js/navigation/navigation.css');
  assert.doesNotMatch(styles, /--sf-context-menu--min-inline-size: var\(--sf-f8\)/u);
});

test('the second column follows the page, and whether it is open is the person\'s one choice', async () => {
  // Owner, 2026-11-05 (Larena Panel audit): the second column is about where
  // the person is -- the page's object menu, else the root that holds the
  // page, else nothing; never the root left open on another page. Whether it
  // is open is kept once for the person (2026-10-13: the menu must not jump).
  const controller = await read('src/smart/admin-menu/js/navigation/controller.js');
  const shown = controller.match(/\n    shownColumn\(\) \{([\s\S]*?)\n    \}\n/u)?.[1] ?? '';
  assert.match(shown, /if \(this\.wide && \(this\.compact \|\| !this\.columnOpen\)\) return null;/u, 'a closed column stays closed on every page');
  assert.match(shown, /if \(this\.objectMenu\(\)\) return OBJECT_MENU;/u, 'the object menu comes before the root');
  assert.match(shown, /return this\.pageRoot\(\)\?\.key \?\? null;/u, 'no page root: no column, never a foreign one');
  const pageRoot = controller.match(/\n    pageRoot\(\) \{([\s\S]*?)\n    \}\n/u)?.[1] ?? '';
  assert.match(pageRoot, /this\.holdsCurrent\(root\)/u);
  assert.match(pageRoot, /root\.key !== current/u, 'a root that is itself the page has no column to open');
  assert.match(pageRoot, /\(root\.children \?\? \[\]\)\.length > 0/u);
  assert.doesNotMatch(controller, /rememberRoot|rememberedRoot|followCurrentRoot/u, 'no per-site memory of an open root');
  assert.match(controller, /this\.keepPreference\(\{second: this\.columnOpen\}\)/u);
});

test('the theme is a row with a submenu, and the columns are widened by their edges', async () => {
  // Owner, 2026-10-14: the theme is chosen as the language and the menu
  // profile are, and the two columns take an sf-resizer within limits.
  const account = await read('src/smart/admin-menu/js/navigation/account.js');
  assert.match(account, /id: "theme", text: text\("theme"\),[\s\S]*?submenu: THEMES\.map/u);
  assert.doesNotMatch(account, /type: "choice", id: "theme"/u);
  const template = await read('src/smart/admin-menu/js/navigation/template.js');
  assert.match(template, /<sf-resizer min=\$\{limits\.min\} max=\$\{limits\.max\}/u);
  assert.match(template, /property=\$\{`--sf-admin-nav-\$\{column\}--inline-size`\}/u);
  const rule = await read('src/smart/admin-menu/rule.js');
  assert.match(rule, /\{ name: (['"])cl-resizer\1 \}/u);
});
