// Every label a host has to translate is described in the table's manifest. Split
// from ui-source tests/component-inputs.contract.test.mjs (whose general rule --
// every property a component accepts is described -- runs over this repository in
// the overlay too).
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../src/smart/', import.meta.url).pathname;

test('the dataview table describes the labels a host has to translate', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'table/smart.manifest.json'), 'utf8'));
  const described = manifest.inputs?.properties ?? {};
  for (const input of [
    'column-move-label',
    'column-search-placeholder',
    'column-search-empty-text',
    'pin-column-label',
    'unpin-column-label',
    'empty-text',
  ]) {
    assert.ok(input in described, `${input} is missing from the table manifest`);
    assert.equal(typeof described[input].default, 'string', `${input} needs a default a host can read`);
  }
});
