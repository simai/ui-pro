import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

// Split from the ui-source test of the same stem when the package components left
// ui-source; it runs in the overlay (ui-source at the pinned revision with this
// repository laid over it), so paths are the ones ui-source uses.
const menu = readFileSync(new URL('../src/smart/admin-menu/index.js', import.meta.url), 'utf8');

test('admin menu keeps base lifecycle cleanup when extending native callbacks', () => {
    assert.match(menu, /connectedCallback\(\)[\s\S]*super\.connectedCallback\(\);/);
    assert.match(menu, /disconnectedCallback\(\)[\s\S]*super\.disconnectedCallback\(\);/);
});
