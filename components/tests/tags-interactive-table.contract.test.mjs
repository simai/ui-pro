import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Split from the ui-source test of the same stem when the package components left
// ui-source; it runs in the overlay (ui-source at the pinned revision with this
// repository laid over it), so paths are the ones ui-source uses.
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const table = read('src/smart/table/js/templates/default.js');
const tableSource = read('src/smart/table/index.js');

test('table filter chips are interactive and anchor their menu to the whole chip', () => {
    assert.match(table, /text='\$\{tag\.label\}'\s+interactive\s+closable/);
    assert.match(table, /menu: 'tag-settings',\s+fieldKey: k,\s+anchorSelector: '\.sf-tag',/);
    assert.match(tableSource, /let anchor = \(opts\.anchorSelector && this\.contextTarget\.closest\?\.\(opts\.anchorSelector\)\) \|\| this\.contextTarget;/);
});
