import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { BUILTIN_PORT_MANIFESTS } from '../src/core/js/composition/builtins.mjs';

// Split from the ui-source test of the same stem when the package components left
// ui-source; it runs in the overlay (ui-source at the pinned revision with this
// repository laid over it), so paths are the ones ui-source uses. The published
// sf-view-table port lives in Core (a public contract); the element that answers it
// is here.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('sf-view-table source declares exactly the published port manifest', async () => {
  const source = await readFile(resolve(root, 'src/smart/view-table/index.js'), 'utf8');
  const declared = /const SF_TABLE_PORTS = Object\.freeze\(\{\s*outputs: Object\.freeze\(\{selection: "([a-z0-9.-]+)"\}\),\s*inputs: Object\.freeze\(\{context: "([a-z0-9.-]+)"\}\),\s*\}\);/u.exec(source);
  assert.ok(declared, 'SF_TABLE_PORTS declaration not found');
  // The routing contract 1.0.0 is published and frozen: it names the element by
  // its former tag, a dated alias of sf-view-table until 2027-01-01 (rename plan R2).
  const published = BUILTIN_PORT_MANIFESTS.find(({ element }) => ['sf-view-table', 'sf-table'].includes(element));
  assert.deepEqual(Object.keys(published.outputs), ['selection']);
  assert.deepEqual(Object.keys(published.inputs), ['context']);
  assert.equal(declared[1], published.outputs.selection.value);
  assert.equal(declared[2], published.inputs.context.value);
  assert.match(source, /static get sfPorts\(\) \{\s*return SF_TABLE_PORTS;/u);
  assert.doesNotMatch(source.split('sfPortInput(port, value, meta = {}) {')[1].split('\n    applyQueryResult(')[0], /fetch\(|XMLHttpRequest|location\.|eval\(/u);
});
