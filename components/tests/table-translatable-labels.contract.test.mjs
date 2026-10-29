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
  const component = JSON.parse(readFileSync(join(root, 'table/component.json'), 'utf8'));
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
    // A word read from the page language names no fixed default in the
    // registry (standard 1.4): its default is the page language's word, which
    // component.json names (default-from) and lang/ holds.
    const setting = component.settings[input];
    assert.ok(typeof described[input].default === 'string' || typeof setting?.['default-from'] === 'string',
      `${input} needs a default a host can read`);
  }
});
