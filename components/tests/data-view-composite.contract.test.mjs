import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import * as treeModel from '../src/smart/data-view/js/tree.js';
import {answerActions, settingSetters} from '../src/smart/table/js/manifest-actions.js';

// What index.js imports since it is made from its component.json (standard
// 1.3.8): the manifest, its aliases and words, and a stand-in for the core's
// elementFromManifest that keeps only what this wiring test needs -- sfEmit,
// the DOM name <tag>-<verb>.
const json = (path) => JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', path), 'utf8'));
const manifestImports = {
  manifest: json('src/smart/data-view/component.json'),
  aliases: json('src/smart/data-view/aliases.json'),
  en: json('src/smart/data-view/lang/en.json'),
  ru: json('src/smart/data-view/lang/ru.json'),
  answerActions,
  settingSetters,
  installAliases: () => ({uninstall() {}}),
  elementFromManifest: (manifest, {base}) => class extends base {
    sfEmit(verb, detail = {}, {cancelable = false} = {}) {
      const event = new CustomEvent(`${manifest.tag}-${verb}`, {detail, cancelable});
      return this.dispatchEvent(event) !== false && !event.defaultPrevented;
    }
  },
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/smart/data-view/index.js'), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export default SfDataView;\s*$/m, '');

class EventNode {
  constructor() { this.listeners = new Map(); this.attributes = new Map(); this.isConnected = false; }
  addEventListener(name, fn) { const set = this.listeners.get(name) ?? new Set(); set.add(fn); this.listeners.set(name, set); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) ?? []) fn(event); return true; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

class FakeTable extends EventNode {
  constructor() { super(); this.ACTIONS_SETTINGS_ROW = []; }
  matches(name) { return name === 'sf-table'; }
  setDataState(value) { this.setAttribute('data-state', value); }
  setColumns(value) { this.columns = value; }
  setRows(value) { this.rows = value; }
  setSort() {}
  setTemplates() {}
}

class FakePagination extends EventNode {
  matches(name) { return name === 'sf-pagination'; }
  setState(value) { this.state = value; }
}

class FakeShadow extends EventNode {
  constructor() {
    super();
    this.table = new FakeTable(); this.pagination = new FakePagination();
    this.status = {hidden: true, textContent: ''};
    this.search = {value: '', addEventListener() {}, removeEventListener() {}};
    this.select = {value: '', replaceChildren() {}, addEventListener() {}, removeEventListener() {}};
    this.save = {addEventListener() {}, removeEventListener() {}};
    this.delete = {addEventListener() {}, removeEventListener() {}};
    // The show-all row a row cap puts under a capped list, and the parts the
    // `chrome` list can leave out. The fake has to know every node the element
    // reaches for, or a selector it does not know reads as a missing element.
    // The show-all row left the shadow tree for the light DOM, so the fake no
    // longer answers for it here: the element creates and appends it itself.
    this.toolbar = {hidden: false};
  }
  querySelector(selector) {
    const slot = (child) => ({assignedElements: () => [], querySelector: () => child, hidden: false});
    return ({'slot[name="content"]': slot(this.table), 'slot[name="pagination"]': slot(this.pagination),
      '[part="status"]': this.status, '[data-search]': this.search, '[data-view]': this.select,
      '[data-save]': this.save, '[data-delete]': this.delete,
      '[part="toolbar"]': this.toolbar})[selector];
  }
  contains() { return false; }
}

// The light DOM the view writes into: the bulk band and the notice live there,
// because the Framework's styles do not cross a shadow boundary.
class FakeChild extends EventNode {
  constructor(tag = 'div') { super(); this.tagName = tag.toUpperCase(); this.children = []; this.classList = {add() {}, contains: () => false}; }
  append(...nodes) { for (const node of nodes) { node.isConnected = true; node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() {
    this.isConnected = false;
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
  matches() { return false; }
  closest() { return null; }
  querySelector() { return null; }
}

class FakeElement extends EventNode {
  constructor() { super(); this.children = []; }
  attachShadow() { this.shadowRoot = new FakeShadow(); return this.shadowRoot; }
  append(...nodes) { for (const node of nodes) { node.isConnected = true; node.parent = this; this.children.push(node); } }
  querySelector(selector) {
    return this.children.find((child) => child.getAttribute?.('slot') === selector.match(/slot="(\w+)"/u)?.[1]) ?? null;
  }
}

const elements = new Map();
vm.runInNewContext(source, {
  HTMLElement: FakeElement,
  customElements: {get: (name) => elements.get(name), define: (name, value) => elements.set(name, value)},
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  Option: class { constructor(label, value) { this.label = label; this.value = value; } },
  AbortController, WeakSet, Promise, Set, Map,
  // The import lines are stripped above, so anything the element imports has to
  // be supplied here. `pageText` resolves a word against the page language; the
  // English table is what this fake answers with, which is enough for a test
  // about wiring rather than about wording.
  pageText: (table, key) => table.en?.[key] ?? key,
  ...manifestImports,
  // The tree model is a module of plain functions, supplied the same way.
  ...treeModel,
  document: {createElement: (tag) => new FakeChild(tag)},
});
const DataView = elements.get('sf-data-view');
const connect = (view) => { view.isConnected = true; view.connectedCallback(); };
const disconnect = (view) => { view.isConnected = false; view.disconnectedCallback(); };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const applied = (id, payload) => ({answer: 'applied', sequence: payload.sequence, data: {
  records: [{id, revision: 'r1', actions: ['view']}], columns: [{key: 'name'}], total: 1,
  echo: {filters_chosen: {}, filters: {}, filters_rejected: [], search: payload.query.search,
    sort: [], page: 1, per_page: 25},
}});

test('two instances reject stale answers and reconnect without duplicate handlers', async () => {
  const first = new DataView(); const second = new DataView();
  assert.notEqual(first.instanceId, second.instanceId);
  connect(first); connect(second);
  let oldResolve;
  let calls = 0;
  first.setHostPort({version: '1.1.0', capabilities: [], raise: (_intent, payload) => {
    calls += 1;
    return payload.sequence === 1 ? new Promise((resolve) => { oldResolve = resolve; }) : applied('new', payload);
  }});
  second.setHostPort({version: '1.1.0', capabilities: [], raise: (_intent, payload) => applied('other', payload)});
  await first.changeQuery({search: 'latest'});
  oldResolve(applied('old', {sequence: 1, query: {search: ''}}));
  await tick();
  assert.equal(first.records[0].id, 'new');
  assert.equal(second.records[0].id, 'other');
  const before = calls;
  disconnect(first); connect(first);
  await tick();
  assert.equal(calls, before + 1, 'reconnect requests once');
  assert.equal(first.listeners.get('sf-table-search-change').size, 1, 'one listener after reconnect');
  assert.equal(first.shadowRoot.listeners.get('sf-table-search-change').size, 1);
  assert.equal(second.records[0].id, 'other');
});

test('loading, populated, empty and error are declared; error preserves prior records', async () => {
  const view = new DataView(); connect(view);
  let answer = (payload) => applied('kept', payload);
  view.setHostPort({version: '1.1.0', capabilities: [], raise: (_intent, payload) => answer(payload)});
  await tick();
  assert.equal(view.getAttribute('data-state'), 'populated');
  answer = () => ({answer: 'unavailable', reason: 'store-down'});
  await view.refresh('failure');
  assert.equal(view.getAttribute('data-state'), 'error');
  assert.equal(view.getAttribute('aria-busy'), 'false');
  assert.equal(view.records[0].id, 'kept');
  assert.equal(view.table.getAttribute('data-state'), 'error');
  answer = (payload) => ({...applied('unused', payload), data: {...applied('unused', payload).data, records: [], total: 0}});
  await view.refresh('empty');
  assert.equal(view.getAttribute('data-state'), 'empty');
  assert.equal(view.records.length, 0);
});

// Round three. An empty result is the table's own body to show; a failure is a
// notice over the card. Neither is a line above the table that moves it down.
test('nothing found says so in the table, and a refusal says so in a notice', async () => {
  const view = new DataView(); connect(view);
  let answer = (payload) => ({...applied('one', payload), data: {...applied('one', payload).data, records: [], total: 0}});
  view.setHostPort({version: '1.1.0', capabilities: ['row-actions'], raise: (_intent, payload) => answer(payload)});
  await tick();
  assert.equal(view.getAttribute('data-state'), 'empty');
  // The status is announced, not laid out, and no notice stands over the card.
  // The words follow the page: English is the Framework's default language and
  // this document names none, so «No data» here is the rule working, not a
  // translation that was missed.
  assert.equal(view.shadowRoot.status.textContent, 'No data');
  assert.equal(view.querySelector('[slot="notice"]'), null);

  answer = (payload) => applied('one', payload);
  await view.refresh('filled');
  await view._action({record_ids: ['one'], action_id: 'publish'});
  const notice = view.querySelector('[slot="notice"]');
  assert.ok(notice, 'a refusal is shown');
  const toast = notice.children[0];
  // Round four: a toast in the corner of the window rather than a panel over
  // the card. The panel covered the search, the create button and the filters,
  // which is worse than the shifted table it was avoiding.
  assert.equal(toast.tagName, 'SF-TOAST');
  // A sentence, not a reason code -- the code is kept for the inspector and
  // is not shown.
  assert.equal(toast.getAttribute('heading'), 'That action is not available for the chosen record.');
  assert.equal(toast.getAttribute('supporting-text'), null);
  assert.equal(toast.getAttribute('data-sf-code'), 'action-not-allowed');
  assert.equal(toast.getAttribute('closable'), 'true');
  // It goes away by itself as well as by its close button.
  assert.equal(toast.getAttribute('duration'), '7000');
  // A host that sends its own words is believed.
  assert.equal(
    view._noticeText({answer: 'refused', reason: 'minimal_cms_action_rejected', message: 'Раздел занят'}),
    'Раздел занят',
  );
  assert.equal(
    view._noticeText({answer: 'refused', reason: 'minimal_cms_action_rejected'}),
    'The action was refused.',
  );
  // The next good answer takes the notice away.
  await view.refresh('again');
  assert.equal(view.querySelector('[slot="notice"]'), null);
});

test('an opened saved view puts its filter fields back', async () => {
  const view = new DataView(); connect(view);
  const fields = [];
  view.table.setActiveFilterFields = (keys) => fields.push(keys);
  view.setHostPort({
    version: '1.1.0', capabilities: ['saved-views'],
    raise: (intent, payload) => (intent === 'query.change'
      ? {...applied('one', payload), data: {...applied('one', payload).data,
          saved_views: [{key: 'mine', label: 'Mine', settings: {filter_fields: ['city', 'name']}}]}}
      : {answer: 'applied'}),
  });
  await tick();
  assert.deepEqual(fields, [], 'nothing is restored before a view is opened');
  await view.openView('mine');
  await tick();
  // The arrays come from the sandbox, so they are compared by their contents.
  assert.deepEqual(fields.map((keys) => [...keys]), [['city', 'name']]);
  // Only once: the person may change the fields afterwards.
  await view.refresh('later');
  assert.equal(fields.length, 1);
});

test('selected bulk reaches the host with revisions even when its action differs from row actions', async () => {
  const view = new DataView();
  view.isConnected = true;
  view.records = [
    {id: 'one', revision: 3, actions: ['view', 'delete']},
    {id: 'two', revision: 5, actions: ['view', 'delete']},
  ];
  const calls = [];
  view.hostPort = {version: '1.1.0', capabilities: ['row-actions'], raise: (intent, payload) => {
    calls.push({intent, payload});
    return {answer: 'refused', reason: 'host-decides-bulk-permission'};
  }};
  const target = {closest: () => view};

  view.table.getSelectedRecordIds = () => ['one', 'two'];
  const result = await view._onEvent({type: 'sf-pagination-apply', target, detail: {action: 'bulk_delete', scope: 'selection'}});
  assert.equal(result.answer, 'refused');
  assert.equal(result.reason, 'host-decides-bulk-permission');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].intent, 'bulk.apply_selected');
  assert.equal(calls[0].payload.action_id, 'bulk_delete');
  assert.equal(JSON.stringify(calls[0].payload.revisions), JSON.stringify({one: 3, two: 5}));

  view.table.getSelectedRecordIds = () => ['one'];
  await view._onEvent({type: 'sf-pagination-apply', target, detail: {action: 'bulk_delete', scope: 'selection'}});
  assert.equal(calls.length, 2, 'one selected row still uses the bulk host intent');
  assert.equal(calls[1].intent, 'bulk.apply_selected');
  assert.equal(JSON.stringify(calls[1].payload.revisions), JSON.stringify({one: 3}));

  // A row's own action (scope entry, standard 1.3.8 §18.3) the row does not offer.
  await view._onEvent({type: 'sf-table-apply', target,
    detail: {action: 'bulk_delete', scope: 'entry', ids: ['one']}});
  view.table.getSelectedRecordIds = () => ['one', 'missing'];
  await view._onEvent({type: 'sf-pagination-apply', target, detail: {action: 'bulk_delete', scope: 'selection'}});
  assert.equal(calls.length, 2, 'row action denial and missing selected records remain local');
});

// Stand 24 S15 (P1): an action under the filter on an estimated total counts,
// shows the exact number and waits. The person confirmed «~N», not the
// counted number, so nothing is written until that number is confirmed.
test('a filter-wide action on an estimate shows the exact count and waits for a new confirmation', async () => {
  const view = new DataView(); connect(view);
  const raised = [];
  view.setHostPort({version: '1.12.0', capabilities: ['bulk-under-filter', 'count-on-request'], raise: (intent, payload) => {
    raised.push({intent, payload});
    if (intent === 'query.count') return {answer: 'applied', data: {total: 19, total_exact: true}};
    if (intent === 'bulk.apply_under_filter') return {answer: 'applied'};
    return {...applied('one', payload), data: {...applied('one', payload).data, total: 1000, total_exact: false}};
  }});
  await tick();
  assert.equal(view.totalExact, false, 'the host answered an estimate');
  const first = await view.applyUnderFilter('archive', 1000);
  assert.deepEqual(raised.map((one) => one.intent).filter((one) => one !== 'query.change'), ['query.count'], 'counted, nothing written');
  assert.equal(first.answer, 'conflict');
  assert.equal(first.current_total, 19, 'the exact number to confirm');
  assert.equal(view.total, 19);
  assert.equal(view.totalExact, true);
  assert.throws(() => view.applyUnderFilter('archive', 1000), /Confirm the current total/u, 'the estimate confirmed earlier writes nothing');
  const second = await view.applyUnderFilter('archive', 19);
  assert.equal(second.answer, 'applied');
  const write = raised.find((one) => one.intent === 'bulk.apply_under_filter');
  assert.equal(write.payload.confirmed_total, 19, 'the number the person confirmed goes to the host');
});

// Stand 24 P2: «Для всех (N)» shows when the host can act on all.
test('the page row offers the filter-wide action when the host can act on all', async () => {
  const view = new DataView(); connect(view);
  const pagination = view.pagination;
  pagination.removeAttribute ??= function (name) { this.attributes.delete(name); };
  view.setHostPort({version: '1.12.0', capabilities: ['bulk-under-filter'], raise: (_intent, payload) => applied('one', payload)});
  await tick();
  assert.equal(pagination.getAttribute('show-action-for-all'), 'true');
  view.setHostPort({version: '1.12.0', capabilities: [], raise: (_intent, payload) => applied('one', payload)});
  await tick();
  assert.equal(pagination.getAttribute('show-action-for-all'), null, 'taken back when the host stops offering it');

  const given = new DataView(); connect(given);
  given.pagination.setAttribute('show-action-for-all', 'false');
  given.setHostPort({version: '1.12.0', capabilities: ['bulk-under-filter'], raise: (_intent, payload) => applied('one', payload)});
  await tick();
  assert.equal(given.pagination.getAttribute('show-action-for-all'), 'false', 'a page that wrote it decides');
});
