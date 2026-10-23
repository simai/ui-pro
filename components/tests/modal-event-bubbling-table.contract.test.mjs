import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Split from the ui-source test of the same stem when the package components left
// ui-source; it runs in the overlay (ui-source at the pinned revision with this
// repository laid over it), so paths are the ones ui-source uses.
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const table = read('src/smart/table/js/templates/default.js');

test('Table renders no modal of its own to guard against nested modal events', () => {
    // The table rendered a demo modal and guarded its close; round three removed
    // the panel, so there is nothing of the kind left to guard there.
    assert.doesNotMatch(table, /<sf-modal/u);
});
