// Decision C22 in sf-view-properties (pro patch 2026-11-10, ahead of simai/ui-view):
// the controls the panel draws carry the host's own size when it has one and
// none when it has not, so page density moves them -- under compact density a
// panel with no size draws its buttons at 32, and size 1 keeps them at 40.
// The panel's own type steps still follow `size` (1/2 or 1).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the panel writes a size on its controls only when the host has one', async () => {
  const element = await read('src/smart/view-properties/index.js');
  const getter = element.match(/\n    get controlSize\(\) \{([\s\S]*?)\n    \}\n/u)?.[1] ?? '';
  assert.match(getter, /const size = this\.getAttribute\("size"\);/u);
  assert.match(getter, /return size === "1\/2" \|\| size === "1" \? size : null;/u);
  assert.match(element, /\n            controlSize: this\.controlSize,\n/u, 'the template context carries it');
  const template = await read('src/smart/view-properties/js/templates/default.js');
  assert.doesNotMatch(template, /\ssize=\$\{context\.size\}/u, 'no control takes the panel size, which is 1 when the host has none');
  assert.equal(template.match(/size=\$\{context\.controlSize \?\? nothing\}/gu)?.length, 22);
});
