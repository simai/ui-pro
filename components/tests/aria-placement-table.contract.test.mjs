import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

/* The table's part of the accessibility sweep in ui-source
   tests/aria-placement.contract.test.mjs, which kept the base components when
   the package components moved here. Runs in the overlay (ui-source at the pinned
   revision with this repository's src and tests laid over it). */
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('table: select boxes have names, through a checkbox that can carry one', async () => {
  const checkbox = await read('smart/checkbox/js/templates/default.js');
  assert.match(checkbox, /aria-label=\$\{!label && [^}]*ariaLabel/);
  const table = await read('smart/table/index.js');
  // The word itself lives in the table's dictionary now, in both languages;
  // what this contract is about is that the box carries a name at all.
  assert.match(table, /ariaLabel: this\.text\("selectAllLabel"\)/);
  assert.match(table, /ariaLabel: this\.getRowSelectLabel\(row\)/);
});

