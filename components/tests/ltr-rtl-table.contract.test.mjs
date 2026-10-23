import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

// Split from the ui-source test of the same stem when the package components left
// ui-source; it runs in the overlay (ui-source at the pinned revision with this
// repository laid over it), so paths are the ones ui-source uses.
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('table template places no modal on a physical side', async () => {
  // The table's own demo panel was removed in round three; what is left to
  // check there is that no physical side came back with something else.
  const tableTemplate = await read('src/smart/table/js/templates/default.js');
  assert.doesNotMatch(tableTemplate, /position="(left|right)"/u);
});
