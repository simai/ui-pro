import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/smart/table/index.js', import.meta.url), 'utf8');
const intent = source.split('    requestActionIntent(actionId, recordIds, options = {}) {')[1]
    .split('\n    getSelectedRecordIds(')[0].trim().replace(/\}\s*$/, '');
const rows = source.split('    getActionRowItems(row = {}, actions = this.ACTIONS_SETTINGS_ROW) {')[1]
    .split('\n    getDefaultRowCell(')[0].trim().replace(/\}\s*$/, '');
const request = new Function('actionId', 'recordIds', 'options = {}', intent);
const rowActions = new Function('row', 'actions', rows);
const selectedBody = source.split('    getSelectedRecordIds() {')[1]
    .split('\n    setBulkActions(')[0].trim().replace(/\}\s*$/, '');
const selected = new Function(selectedBody);
const bulkBody = source.split('    setBulkActions(actions = []) {')[1]
    .split('\n    renderBulkActions(')[0].trim().replace(/\}\s*$/, '');
const setBulk = new Function('actions', bulkBody);

function instance() {
    return {
        events: [],
        requestActionIntent: request,
        rows: [],
        getTableData() { return {rows: this.rows}; },
        emitTableEvent(name, detail) { this.events.push({name, detail}); return true; },
        openContextMenu(event, data) { this.menu = data; },
    };
}

test('row and bulk intents preserve complete typed IDs and immutable snapshots', () => {
    const owner = instance();
    const ids = ['товар_α_01', 0, 42, '0'];
    owner.rows = [{id: 42, revision: 'r7'}];
    // Vocabulary §5 apply (standard 1.3.8 §18.3); the action answers an outcome.
    assert.deepEqual(owner.requestActionIntent('view', ids), {outcome: 'applied'});
    ids[0] = 'changed';
    assert.deepEqual(owner.events, [{name: 'apply',
        detail: {action: 'view', scope: 'selection', ids: ['товар_α_01', 0, 42, '0'], revisions: {42: 'r7'}}}]);
    assert.ok(Object.isFrozen(owner.events[0].detail));
    assert.ok(Object.isFrozen(owner.events[0].detail.ids));
    owner.requestActionIntent('view', ['товар_α_01']);
    assert.equal(owner.events[1].detail.scope, 'entry', 'one row\'s own action is scope entry');
});

test('invalid requests emit nothing, including sparse and unsafe integer IDs', () => {
    const owner = instance();
    for (const [action, ids] of [
        ['', [1]], [' ', [1]], [null, [1]], [{endpoint: '/delete'}, [1]],
        ['delete', []], ['delete', null], ['delete', ['']], ['delete', [null]],
        ['delete', [true]], ['delete', [{}]], ['delete', [1.2]],
        ['delete', [Number.MAX_SAFE_INTEGER + 1]], ['delete', Array(1)],
    ]) assert.throws(() => owner.requestActionIntent(action, ids), TypeError);
    assert.deepEqual(owner.events, []);
});

test('row activation captures data identity and emits once without target scraping', () => {
    const a = instance();
    const b = instance();
    const definition = {id: 'view', component: {type: 'icon-button', props: {icon: 'visibility'}}};
    const actionA = rowActions.call(a, {id: 'row_Русский_1'}, [definition])[0];
    const actionB = rowActions.call(b, {id: 0}, [definition])[0];
    actionA.component.props['@click']({target: {dataset: {item: 'wrong_split'}}});
    assert.deepEqual(a.events[0].detail.ids, ['row_Русский_1']);
    assert.equal(a.events.length, 1);
    assert.equal(b.events.length, 0);
    actionB.component.props['@click']({});
    assert.deepEqual(b.events[0].detail.ids, [0]);
    assert.equal(definition.component.props['@click'], undefined);
});

test('context trigger and trusted legacy callbacks do not implicitly emit an operation', () => {
    const owner = instance();
    let legacy = 0;
    const actions = rowActions.call(owner, {id: 'row_with_underscores'}, [
        {id: 'menu', menu: 'row-settings', component: {type: 'icon-button'}},
        {id: 'legacy', component: {type: 'icon-button', props: {'@click': () => legacy++}}},
    ]);
    actions[0].component.props['@click']({});
    actions[1].component.props['@click']({});
    assert.equal(owner.menu.row.id, 'row_with_underscores');
    assert.equal(legacy, 1);
    assert.deepEqual(owner.events, []);
});

test('public manifest declares the same additive command and closed payload', () => {
    const manifest = JSON.parse(fs.readFileSync(new URL('../src/smart/table/smart.manifest.json', import.meta.url)));
    assert.ok(manifest.methods.requestActionIntent);
    assert.deepEqual(manifest.events['sf-table-action-intent'].payload, manifest.contracts.action_intent);
    assert.equal(manifest.contracts.action_intent.additionalProperties, false);
    assert.equal(manifest.contracts.action_intent.properties.record_ids.minItems, 1);
});

test('bulk selection reads typed identities from instance data, never DOM strings', () => {
    const rows = [
        {id: 'товар_01', select: {component: {props: {checked: true}}}},
        {id: 0, select: {component: {props: {checked: true}}}},
        {id: 'not-selected', select: {component: {props: {checked: false}}}},
    ];
    const a = instance();
    a.getTableData = () => ({rows});
    assert.deepEqual(selected.call(a), ['товар_01', 0]);
    a.requestActionIntent('delete', selected.call(a));
    assert.deepEqual(a.events[0].detail.ids, ['товар_01', 0]);
    const b = {getTableData: () => ({rows: []})};
    assert.deepEqual(selected.call(b), []);
});

test('bulk definitions reject executable fields and copy caller inputs', () => {
    const owner = {state: {}, set(patch) {Object.assign(this.state, patch);return this;}};
    const actions = [{id: 'delete', name: 'Delete selected'}];
    assert.equal(setBulk.call(owner, actions), owner);
    actions[0].name = 'changed';
    assert.deepEqual(owner.state.bulkActions, [{id: 'delete', name: 'Delete selected'}]);
    for (const invalid of [null, Array(1), [{id: '', name: 'x'}],
        [{id: 'delete', name: 'x', endpoint: '/delete'}],
        [{id: 'delete', name: 'x', callback() {}}]]) {
        assert.throws(() => setBulk.call(owner, invalid), TypeError);
    }
});
