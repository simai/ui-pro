import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compositionTypeFromSmartManifest } from '../src/core/js/composition/index.mjs';

// Split from the ui-source test of the same stem when the package components left
// ui-source; it runs in the overlay (ui-source at the pinned revision with this
// repository laid over it), so paths are the ones ui-source uses.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('a declared smart type carries its data, intents and settings key', async () => {
  const smart = JSON.parse(await readFile(resolve(root, 'src/smart/table/smart.manifest.json'), 'utf8'));
  const type = compositionTypeFromSmartManifest(smart);
  assert.equal(type.type, 'smart.data-view');
  // Structure and request-bound data are separate channels, both closed.
  assert.deepEqual(Object.keys(type.data_schema.properties).sort(), ['columns', 'rows']);
  assert.equal(type.data_schema.additionalProperties, false);
  assert.equal(type.data_schema.properties.rows.items.required[0], 'id');
  assert.equal(type.props_schema.properties.rows, undefined);
  // The intents a host must answer are declared, not discovered from the code.
  assert.ok(type.events['sf-table-query-intent'].summary.length > 0);
  assert.ok(type.events['sf-table-template-delete'].payload.required.includes('key'));
  assert.equal(type.events['sf-after-render'], undefined);
  // Settings survive the projection: mode, owner and where the key lives.
  assert.deepEqual(type.persistence, {
    mode: 'external-host', source_of_truth: 'host', network_owner: 'host',
    settings_key_prop: 'table-settings-key', revision_prop: null,
  });
});
