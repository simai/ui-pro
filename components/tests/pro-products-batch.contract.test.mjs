// The Pro products batch of 2026-11-17 (dispatcher handoffs after Pro over
// group build 9): what the package components write must follow the owner
// decisions the Framework already carries.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the person menu: the language row is SIMAI Framework\'s, «Выйти» is plain (C142 (7), C163 (6), C176; SM-4, SM-5, PP-10)', async () => {
  const account = await read('src/smart/admin-menu/js/navigation/account.js');
  // The rows come from sf-language's own module, as SfLanguage.menuEntry
  // builds them; the element itself is not imported.
  assert.match(account, /import \{languageRows, matchLanguage, normalizeLanguages, useNames\} from "\.\.\/\.\.\/\.\.\/language\/js\/languages"/u);
  assert.doesNotMatch(account, /language\/index/u, 'the sf-language element is not bundled into the menu');
  assert.match(account, /languageRows\(list, current, \{page, prefix: "language:"\}\)/u);
  assert.match(account, /width: "panel"/u);
  assert.match(account, /list\.length >= 8/u, 'a search from eight languages on, as the Framework');
  assert.doesNotMatch(account, /caption: entry\.english/u, 'no own language rows');
  const signOut = account.match(/\{id: "sign-out"[^}]*\}/u)?.[0] ?? '';
  assert.ok(signOut, 'the sign-out row');
  assert.doesNotMatch(signOut, /danger/u, 'signing out destroys nothing');
});

test('the edit mode\'s profile picker takes the page density (C22; PP-2)', async () => {
  const edit = await read('src/smart/admin-menu/js/navigation/edit.js');
  assert.match(edit, /<sf-profile-picker label=/u);
  assert.doesNotMatch(edit, /<sf-profile-picker size=/u);
});

test('a person\'s avatar asks for hue, not the former name tone (C17)', async () => {
  for (const path of ['src/smart/chat-message/index.js', 'src/smart/chat-window/index.js']) {
    const source = await read(path);
    assert.doesNotMatch(source, /setAttribute\("tone"/u, path);
    assert.match(source, /setAttribute\("hue", "auto"\)/u, path);
  }
});

test('the package\'s own card surfaces read the surface role (the card\'s unit), not a scale step', async () => {
  for (const path of [
    'src/smart/chat-interlocutor/js/templates/default.css',
    'src/smart/chat-threads/js/templates/default.css',
    'src/smart/editor-content/js/templates/default.css',
  ]) {
    const source = await read(path);
    assert.doesNotMatch(source, /var\(--sf-radius-1\)/u, path);
    assert.match(source, /var\(--sf-radius--surface\)/u, path);
  }
});
