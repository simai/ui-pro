import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

// Split from the ui-source test of the same stem when the package components left
// ui-source; it runs in the overlay (ui-source at the pinned revision with this
// repository laid over it), so paths are the ones ui-source uses.
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('page language: no package component falls back to Russian', async () => {
  const sources = {
    // admin-menu had its own reading of the rule -- the document's lang and
    // nothing else -- which is one rule too many and missed a region that names
    // its own language. It asks the shared helper now, like the rest.
    'src/smart/admin-menu/index.js': [/pageText\(MENU_TRANSLATIONS, key, node/],
    // The list spoke only Russian until 2026-10-10, so an English page came out
    // a patchwork: a record panel that had switched above a toolbar that had not.
    'src/smart/table/index.js': [/const TABLE_TEXT = \{\n    en: camelWords\(en\.runtime\),/, /pageText\(TABLE_TEXT, key, this\)/],
    'src/smart/data-view/index.js': [/pageText\(DATA_VIEW_TEXT, "\w+", this\)/],
    'src/smart/admin-menu/js/templates/default.js': [/documentElement\?\.lang \|\| "en"/],
  };
  for (const [path, patterns] of Object.entries(sources)) {
    const source = await read(path);
    for (const pattern of patterns) assert.match(source, pattern, path);
    assert.doesNotMatch(source, /\|\| ['"]ru['"]\)/, `${path}: falls back to Russian`);
  }
});
