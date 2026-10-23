import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// row-actions hides the row action column alone; actions still owns the create button.
const source = fs.readFileSync(new URL('../src/smart/table/index.js', import.meta.url), 'utf8');
const template = fs.readFileSync(new URL('../src/smart/table/js/templates/default.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../src/smart/table/smart.manifest.json', import.meta.url), 'utf8'));
const body = source.split('    getSystemColumns() {')[1].split('\n    setTemplates(')[0].trim().replace(/\}\s*$/, '');
const systemColumns = new Function(body);

function table(props, actionActive = true) {
    return {
        getPropsContext: () => ({selectable: false, settings: true, actions: true, rowActions: true, ...props}),
        getSelectColumn: () => ({key: 'select'}),
        state: {actionActive},
        TABLE_SETTINGS_COLUMN: {key: 'settings'},
        TABLE_ACTIONS_COLUMN: {key: 'actions'},
        systemColumns,
    };
}
const keys = (owner) => owner.systemColumns().map((column) => column.key);

test('the row action column shows by default', () => {
    assert.deepEqual(keys(table({})), ['settings', 'actions']);
});

test('row-actions false hides only the row action column', () => {
    assert.deepEqual(keys(table({rowActions: false})), ['settings']);
    assert.match(source, /rowActions: \{attribute: "row-actions", type: Boolean, default: true\}/);
    // The create button stays behind actions, and behind creatable, which a
    // data view turns off for a host that does not announce create-record.
    assert.match(template, /\$\{context\.actions && context\.creatable\s*\?/, 'the create button follows actions');
    assert.ok(!template.includes('rowActions'), 'the create button does not follow row-actions');
});

test('actions false and a hidden column in the table settings still hide it', () => {
    assert.deepEqual(keys(table({actions: false})), ['settings']);
    assert.deepEqual(keys(table({}, false)), ['settings']);
});

test('the manifest declares row-actions with its default', () => {
    assert.deepEqual(manifest.inputs.properties['row-actions'], {type: 'boolean', default: true});
    assert.ok(manifest.composition.declarative.props.includes('row-actions'));
    assert.equal(manifest.version, '1.9.0');
});
