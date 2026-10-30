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

test('on a wide screen the first answer opens the root that holds the current row', async () => {
  const controller = await read('src/smart/admin-menu/js/navigation/controller.js');
  const accept = controller.match(/\n    accept\(answer, sequence\) \{([\s\S]*?)\n    \}\n/u)?.[1] ?? '';
  assert.match(accept, /if \(first && this\.wide && !this\.openRoot && !answer\.person\?\.compact\)/u,
    'only on the first answer, so a root the person closed stays closed on a re-read');
  assert.match(accept, /this\.holdsCurrent\(root\)/u);
  assert.match(accept, /root\.key !== answer\.current/u, 'a root that is itself the page has no column to open');
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
