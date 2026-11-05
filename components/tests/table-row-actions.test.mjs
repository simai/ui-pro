import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// row-actions hides the row action column alone; actions still owns the create button.
const source = fs.readFileSync(new URL('../src/smart/view-table/index.js', import.meta.url), 'utf8');
const template = fs.readFileSync(new URL('../src/smart/view-table/js/templates/default.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../src/smart/view-table/smart.manifest.json', import.meta.url), 'utf8'));
const body = source.split('    getSystemColumns() {')[1].split('\n    setTemplates(')[0].trim().replace(/\}\s*$/, '');
const systemColumns = new Function(body);
const useBody = source.split('    settingsColumnHasUse(props = this.getPropsContext()) {')[1].split('\n    getSystemColumns() {')[0].trim().replace(/\}\s*$/, '');
const settingsColumnHasUse = new Function('props = this.getPropsContext()', useBody);

function table(props, actionActive = true, rowMenu = [{id: 'delete'}]) {
    return {
        getPropsContext: () => ({selectable: false, settings: true, actions: true, rowActions: true, ...props}),
        settingsColumnHasUse,
        ACTIONS_SETTINGS_ROW: rowMenu,
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
    // row-actions arrived in 1.9.0; later patches keep it.
    const arrived = manifest.compatibility.migrations.find((migration) => migration.to === '1.9.0');
    assert.ok(arrived.changes.some((change) => change.includes('row-actions')));
});

// The settings column is the gear in its head and the ≡ of each row's menu.
// A table with neither -- no column settings, no row actions, no reordering --
// draws no column of buttons that open nothing (Larena, the sites list,
// 2026-11-05).
test('the settings column goes when it has nothing to open', () => {
    assert.deepEqual(keys(table({settingsMenu: false}, true, [])), ['actions']);
    assert.deepEqual(keys(table({settingsMenu: false, actions: false}, true, [])), []);
});

test('the settings column stays for the gear, a row menu or reordering', () => {
    assert.deepEqual(keys(table({settingsMenu: true}, true, [])), ['settings', 'actions']);
    assert.deepEqual(keys(table({settingsMenu: false})), ['settings', 'actions']);
    assert.deepEqual(keys(table({settingsMenu: false, rowReorder: true}, true, [])), ['settings', 'actions']);
    // A host whose actions live in the row menu alone (row-actions="false") keeps the ≡.
    assert.deepEqual(keys(table({settingsMenu: false, rowActions: false})), ['settings']);
});

test('settings false is the word of the host, whatever the table could offer', () => {
    assert.deepEqual(keys(table({settings: false, settingsMenu: true, rowReorder: true})), ['actions']);
});
