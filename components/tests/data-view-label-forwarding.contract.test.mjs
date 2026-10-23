import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

// A host that lets the view draw its own table and pagination words them on the
// view; each word the view takes is declared and passed on (Larena, 2026-10-13).
test('the data view declares and passes on the words of the parts it draws', async () => {
  const source = await readFile(new URL('../src/smart/data-view/index.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../src/smart/data-view/smart.manifest.json', import.meta.url), 'utf8'));
  const list = (name) => JSON.parse(source.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`, 'u'))[1].replace(/\s+/gu, ' '));
  const names = [...list('TABLE_LABELS'), ...list('PAGINATION_LABELS'), 'pagination-aria-label'];
  assert.equal(names.length, 20);
  for (const name of names) assert.ok(manifest.inputs.properties[name], `${name} is declared`);
  assert.match(source, /observedAttributes\(\) \{\s*return \["chrome", "row-cap", "aria-label", "size", "preferences-key", \.\.\.LABEL_ATTRIBUTES\];/u);
  assert.match(source, /pass\(this\.pagination, "pagination-aria-label", "aria-label"\);/u);
  assert.match(source, /this\.pagination\?\.setAttribute\?\.\("size", this\.size\);\n\s*this\._forwardLabels\(\);/u);
});
