import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {optionBadgeProps} from '../src/smart/helpers/option-badge.js';

const source = fs.readFileSync(new URL('../src/smart/table/index.js', import.meta.url), 'utf8');
const template = fs.readFileSync(new URL('../src/smart/table/js/templates/default.js', import.meta.url), 'utf8');
const drawer = fs.readFileSync(new URL('../src/smart/drawer/index.js', import.meta.url), 'utf8');
const elementManifest = fs.readFileSync(new URL('../src/core/js/element-manifest.js', import.meta.url), 'utf8');

function method(text, signature, next) {
    return text.split(`    ${signature} {`)[1].split(`\n    ${next}`)[0].trim().replace(/\}\s*$/, '');
}

const setCreateItems = new Function('items', method(source, 'setCreateItems(items = [])', 'requestCreateIntent('));
const requestCreateIntent = new Function('itemId = null', method(source, 'requestCreateIntent(itemId = null)', '// The actions of the view itself'));
const setToolbarActions = new Function('items = []', method(source, 'setToolbarActions(items = [])', 'getToolbarActions('));
const getToolbarActions = new Function(method(source, 'getToolbarActions()', '// A link out of the table'));
const isSameSiteHref = new Function('href = ""', method(source, 'isSameSiteHref(href = "")', '// The event carries the id'));
const getSort = new Function(method(source, 'getSort()', 'setSort('));
const setSort = new Function('key = null', 'direction = null', method(source, 'setSort(key = null, direction = null)', 'toggleSort('));
const toggleSort = new Function('key', method(source, 'toggleSort(key)', '// Pointer capture sends'));
const headerClick = new Function('event', 'column = {}', method(source, 'handleHeaderSortClick(event, column = {})', '// Emits the selection output'));

function table() {
    return {
        events: [],
        state: {createItems: [], toolbarActions: [], sort: {key: null, direction: null}},
        set(patch) { Object.assign(this.state, patch); return this; },
        dispatchTableEvent(name, detail) { this.events.push({name, detail}); return this; },
        setCreateItems, requestCreateIntent, getSort, setSort, toggleSort,
        setToolbarActions, getToolbarActions, isSameSiteHref,
    };
}

test('create button and menu items emit a create intent with the chosen item', () => {
    const owner = table();
    owner.requestCreateIntent(null);
    owner.setCreateItems([{id: 'page', name: 'Страница'}, {id: 'folder', name: 'Раздел'}]);
    owner.requestCreateIntent('folder');
    assert.deepEqual(owner.events, [
        {name: 'sf-table-create-intent', detail: {item: null}},
        {name: 'sf-table-create-intent', detail: {item: 'folder'}},
    ]);
    assert.ok(Object.isFrozen(owner.events[1].detail));
    assert.throws(() => owner.requestCreateIntent('unknown'), TypeError);
    for (const items of [null, [{id: '', name: 'x'}], [{id: 'a'}], [{id: 'a', name: 'b', url: '/x'}]]) {
        assert.throws(() => owner.setCreateItems(items), TypeError);
    }
    assert.equal(owner.events.length, 2);
});

test('toolbar wires the create button and renders the arrow only with items', () => {
    assert.match(template, /@click=\$\{\(\) => context\.component\.requestCreateIntent\(null\)\}/);
    assert.match(template, /state\.createItems\?\.length \? html`\s*<sf-icon-button/);
    assert.match(template, /menu: 'create'/);
});

test('header sort cycles asc, desc, none and reports intent only', () => {
    const owner = table();
    owner.toggleSort('name');
    owner.toggleSort('name');
    owner.toggleSort('name');
    owner.toggleSort('name');
    owner.toggleSort('date');
    assert.deepEqual(owner.events.map((event) => event.detail), [
        {key: 'name', direction: 'asc'},
        {key: 'name', direction: 'desc'},
        {key: 'name', direction: null},
        {key: 'name', direction: 'asc'},
        {key: 'date', direction: 'asc'},
    ]);
    assert.ok(owner.events.every((event) => event.name === 'sf-table-sort-change' && Object.isFrozen(event.detail)));
    assert.deepEqual(owner.getSort(), {key: 'date', direction: 'asc'});
});

test('setSort mirrors host state without an event and validates input', () => {
    const owner = table();
    owner.setSort('name', 'desc');
    assert.deepEqual(owner.getSort(), {key: 'name', direction: 'desc'});
    owner.setSort(null, null);
    assert.deepEqual(owner.getSort(), {key: null, direction: null});
    assert.throws(() => owner.setSort('name', 'up'), TypeError);
    assert.throws(() => owner.setSort('', 'asc'), TypeError);
    assert.equal(owner.events.length, 0);
});

test('header clicks sort only sortable data columns and never right after a drag', () => {
    globalThis.Element ??= class Element {};
    const owner = table();
    const click = (column, target = null, suppressed = false) => {
        owner._suppressHeaderClick = suppressed;
        headerClick.call(owner, {composedPath: () => [target || {}]}, column);
    };
    click({key: 'name'});
    click({key: 'actions', sortable: true, system: true});
    click({key: 'name', sortable: true}, null, true);
    click({key: 'name', sortable: true});
    assert.equal(owner.events.length, 1);
});

test('headers expose aria-sort and a native button for sortable columns', () => {
    assert.match(template, /aria-sort=\$\{ariaSort\(context, column\)\}/);
    assert.match(template, /<button type="button" class="sf-table-sort-button/);
    assert.match(template, /return sort\.direction === 'asc' \? 'ascending' : 'descending';/);
});

test('template Apply emits template-select only when the selected template changes', () => {
    assert.match(source, /selectedKey = selectedTemplate\?\.key && selectedTemplate\.key !== previousKey/);
    assert.match(source, /this\.dispatchTableEvent\('sf-table-template-select',\s*Object\.freeze\(\{key: selectedKey\}\)\)/);
});

// A heading is dragged with SF.Sortable.attach (owner, 2026-10-13), which
// swallows the click a drop ends with (probe sortable-columns in the
// Framework); a pointer resize still suppresses the header click itself.
test('ending a column drag or pointer resize suppresses the header click', () => {
    assert.match(source, /this\._headerSortableDetach = attach\(row, \{/);
    assert.match(source, /setLoaderDragState\(false\);\s*this\.suppressNextHeaderClick\(\);/);
});

// No cell is moved by hand any more: the drag only outlines the place, and the
// order is applied through the settings, so there is no DOM to restore.
test('a column drag moves no cell by hand and applies the order through the settings', () => {
    assert.doesNotMatch(source, /snapshotColumnDom|restoreColumnDom|setColumnDragPlaceholderClass/u);
    assert.match(source, /onHeaderColumnIntent\(\{item, index, group\}\) \{[\s\S]*?return this\.applyColumnOrder\(rest, \{\}\);/u);
});

test('actions column is a system column', () => {
    assert.match(source, /key: "actions",\s*label: this\.text\("actionsColumnLabel"\),\s*system: true,/);
});

test('badge option colours accept badge schemes and hex colours only', () => {
    assert.deepEqual(optionBadgeProps({color: 'success'}), {scheme: 'success', rootStyle: ''});
    // danger is the former name of the badge scheme error (SIMAI Framework display group A).
    assert.deepEqual(optionBadgeProps({color: ' Danger '}), {scheme: 'error', rootStyle: ''});
    assert.deepEqual(optionBadgeProps({color: 'error'}), {scheme: 'error', rootStyle: ''});
    const hex = optionBadgeProps({color: '#16a34a'});
    assert.equal(hex.scheme, 'neutral');
    assert.match(hex.rootStyle, /color-mix\(in srgb, #16a34a 24%, transparent\)/);
    for (const color of ['red', '#12', 'url(x)', '#fff;background:red', 'var(--x)', null, 7]) {
        assert.deepEqual(optionBadgeProps({color}), {scheme: 'neutral', rootStyle: ''});
    }
    assert.deepEqual(optionBadgeProps(), {scheme: 'neutral', rootStyle: ''});
});

// The drawer sends its events by verb through the Framework's sfEmit
// (standard 1.3.8 §8: sf-drawer-open, sf-drawer-opened, ...), which bubbles and
// crosses shadow roots; the on* helpers listen to the new names.
test('drawer events bubble, and on* helpers keep only their own drawer events', () => {
    assert.match(drawer, /emitDrawerEvent\(verb, cancelable = false, extra = \{\}\) \{\s*return this\.sfEmit\(verb,/);
    assert.match(elementManifest, /sfEmit\(verb, detail = \{\}, \{cancelable\} = \{\}\) \{[\s\S]*?bubbles: true,\s*composed: true,/);
    const own = new Function('handler', method(drawer.replace(/^  /gm, '    '), 'ownDrawerHandler(handler)', 'onDrawerEvent('));
    const self = {};
    const calls = [];
    // A drawer's own event is the one it is the target of: a nested drawer's
    // event bubbling through it is not.
    const wrapped = own.call(self, function (event) { calls.push([this, event.target]); });
    wrapped({target: {}});
    wrapped({target: self});
    assert.deepEqual(calls, [[self, self]]);
    assert.match(drawer, /addEventListener\(this\.sfEventName\(verb\), this\.ownDrawerHandler\(handler\), options\)/);
    for (const [helper, verb] of [['onBeforeOpen', 'open'], ['onAfterOpen', 'opened'], ['onBeforeClose', 'close'], ['onAfterClose', 'closed']]) {
        assert.match(drawer, new RegExp(`${helper}\\(handler, options\\) \\{ return this\\.onDrawerEvent\\('${verb}', handler, options\\); \\}`));
    }
});

test('deleting saved templates on Apply raises one delete intent per template', () => {
    assert.match(source, /deletedKeys = filter\.templates\s*\n\s*\.filter\(\(template\) => template\.deleted && template\.key\)/);
    assert.match(source, /for \(const key of deletedKeys\) \{\s*this\.dispatchTableEvent\('sf-table-template-delete', Object\.freeze\(\{key\}\)\);/);
});

test('two tables on one page share no id, no settings key and no portal', () => {
    assert.match(source, /let tableInstances = 0;/);
    assert.match(source, /this\._instanceId = `sf-table-\$\{\+\+tableInstances\}`;/);
    const instance = new Function(method(source, 'getInstanceId()', 'getColumnResizerId('));
    assert.equal(instance.call({id: 'records', _instanceId: 'sf-table-2'}), 'records');
    assert.equal(instance.call({id: '', _instanceId: 'sf-table-2'}), 'sf-table-2');
    const resizer = new Function('columnKey', method(source, 'getColumnResizerId(columnKey)', 'getTableSettingsKey('));
    assert.equal(resizer.call({getInstanceId: () => 'sf-table-2'}, 'title'), 'sf-table-2--column-resizer--title');
    const settingsKey = new Function(method(source, 'getTableSettingsKey()', 'normalizeTableSettings('));
    assert.equal(settingsKey.call({getAttribute: () => null, id: '', getInstanceId: () => 'sf-table-3'}), 'sf-table-3');
    assert.doesNotMatch(source, /\|\|\s*\n\s*"users"\s*\n\s*\);/);
    assert.match(source, /portal\.dataset\.sfInstance = this\.getInstanceId\(\);/);
    assert.match(template, /id=\$\{context\.component\.getColumnResizerId\(column\.key\)\}/);
    assert.doesNotMatch(source, /querySelector\(`#column_resizer_/);
});

test('the region declares the data state it is in', () => {
    assert.match(template, /export function resolvedDataState\(context\)/);
    assert.match(template, /data-state=\$\{resolvedDataState\(context\)\}/);
    assert.match(template, /aria-busy=\$\{resolvedDataState\(context\) === 'loading' \? 'true' : nothing\}/);
    const resolved = new Function('context', template.split('export function resolvedDataState(context) {')[1].split('\n}')[0]);
    assert.equal(resolved({dataState: 'error'}), 'error');
    assert.equal(resolved({dataState: 'auto', component: {getTableData: () => ({rows: [{id: 1}]})}}), 'populated');
    // Columns and no rows is an answer with nothing in it; neither is a table
    // still waiting for its first answer (owner, 2026-10-15).
    assert.equal(resolved({dataState: 'auto', component: {getTableData: () => ({rows: [], columns: [{key: 'name'}]})}}), 'empty');
    assert.equal(resolved({dataState: 'auto', component: {getTableData: () => ({rows: []})}}), 'loading');
});

test('ids inside the filter template list also carry their instance', () => {
    assert.match(source, /id="\$\{this\.getInstanceId\(\)\}--template-move--\$\{col\.key\}"/);
    assert.doesNotMatch(source, /id="\$\{col\.label\}_move"/);
});

// Round three. The control beside Create is the view's own actions, from the
// host; column settings stay on the gear in the head, where they already were.
test('the toolbar actions are the host list, and nothing without one', () => {
    const instance = table();
    assert.throws(() => instance.setToolbarActions([{label: 'No id'}]), TypeError);
    assert.throws(() => instance.setToolbarActions([{id: 'a', label: 'A', extra: 1}]), TypeError);
    assert.throws(() => instance.setToolbarActions('settings'), TypeError);
    instance.setToolbarActions([
        {id: 'list-settings', label: 'Настройки списка', icon: 'tune'},
        {id: 'removed', label: 'Удалённые элементы'},
    ]);
    assert.deepEqual(instance.getToolbarActions().map((action) => action.id), ['list-settings', 'removed']);
    assert.equal(instance.getToolbarActions()[0].icon, 'tune');
    // The control is rendered from the list, so an empty list is no control.
    assert.match(template, /context\.settings && state\.toolbarActions\?\.length/u);
    assert.match(template, /menu: 'toolbar-actions'/u);
    assert.doesNotMatch(template, /menu: 'table-settings'/u);
    // The event names the action, and an href item goes there unless the host
    // takes the navigation over.
    assert.match(source, /new CustomEvent\('sf-table-toolbar-action', \{[\s\S]*?cancelable: true/u);
    assert.match(source, /if \(allowed && action\.href && this\.isSameSiteHref\(action\.href\)\)/u);
    assert.match(source, /case 'toolbar-actions':\s*\n\s*return this\.renderToolbarActionsContextMenu\(data\)/u);
});

test('an href on a toolbar action may only name this same site', () => {
    // The helper reads the page's own base, so the check needs a page.
    globalThis.document = {baseURI: 'http://admin.test/'};
    const instance = table();
    assert.equal(instance.isSameSiteHref('/admin/settings'), true);
    assert.equal(instance.isSameSiteHref('https://example.test/evil'), false);
    assert.equal(instance.isSameSiteHref('//example.test/evil'), false);
    assert.equal(instance.isSameSiteHref(''), false);
    assert.throws(
        () => instance.setToolbarActions([{id: 'a', label: 'A', href: 'https://example.test/evil'}]),
        TypeError,
    );
    instance.setToolbarActions([{id: 'a', label: 'A', href: '/admin/settings'}]);
    assert.equal(instance.getToolbarActions()[0].href, '/admin/settings');
    delete globalThis.document;
});

// The fields a person chose under "Поля" are part of the view: they go with the
// save and come back when it is opened.
test('a saved filter view carries the fields it was showing', () => {
    const active = new Function(
        'filter = this.state?.filter || {}',
        method(source, 'getActiveFilterFieldKeys(filter = this.state?.filter || {})', '// Puts those fields back'),
    );
    const host = {
        state: {filter: {}},
        getCurrentFilterTags: () => ({city: {active: true}, name: {active: true}, tail: {active: false}}),
        getFilterFields: () => [{key: 'name'}, {key: 'city'}, {key: 'tail'}],
    };
    assert.deepEqual(active.call(host), ['name', 'city']);

    const withSettings = new Function(
        'detail', 'filter = this.state?.filter || {}',
        method(source, 'withFilterFieldSettings(detail, filter = this.state?.filter || {})', 'dispatchFilterTemplateSave('),
    );
    const carrier = {...host, withFilterFieldSettings: withSettings, getActiveFilterFieldKeys: active};
    const saved = withSettings.call(carrier, {key: 'k', data: {tags: {city: {active: true}, name: {active: false}}}});
    assert.deepEqual(saved.settings.filter_fields, ['city']);
    // Every save path goes through it, the filter form's own Save included.
    assert.equal((source.match(/this\.withFilterFieldSettings\(/gu) || []).length >= 4, true);
    assert.match(source, /setActiveFilterFields\(keys = \[\], filter = this\.state\?\.filter \|\| \{\}\)/u);
});
