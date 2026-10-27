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
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
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
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const listing = (payload) => ({answer: 'applied', sequence: payload.sequence, data: {
  records: [{id: 'one', revision: 'r1'}], columns: [{key: 'name'}], total: 1,
  echo: {filters: {}, search: '', sort: [], page: 1, per_page: 25},
}});
const toastOf = (view) => view.querySelector('[slot="notice"]')?.children?.[0] ?? null;
const PREPARING = 'Список готовится. Хранилище большое, список строится в фоне — обновите страницу через несколько минут';

// Larena storage lists answer only from a read model; while a large storage's
// is built the host answers query.change {answer: 'unavailable', reason:
// 'storage_view_not_ready', message} (2026-10-21). The host's sentence is the
// state: the error brick's title and the live region; no error notice over it.
async function viewAnswering(first) {
  const view = new DataView(); connect(view);
  let answer = first;
  view.setHostPort({version: '1.12.0', capabilities: [], raise: (_intent, payload) => answer(payload)});
  await tick();
  return {view, set: (next) => { answer = next; }};
}

test('unavailable with a message: the message is the state, and no error notice', async () => {
  const {view} = await viewAnswering((payload) => ({answer: 'unavailable', reason: 'storage_view_not_ready', message: `  ${PREPARING} `, sequence: payload.sequence}));
  assert.equal(view.getAttribute('data-state'), 'error');
  assert.equal(view.shadowRoot.status.textContent, PREPARING);
  assert.equal(view.shadowRoot.status.hidden, false);
  assert.equal(view.table.getAttribute('data-state'), 'error');
  assert.equal(view.table.emptyContext.message, PREPARING);
  assert.equal(toastOf(view), null, 'no error toast');
});

test('unavailable without a message keeps the general words and the notice', async () => {
  for (const message of [undefined, '', '   ', 42, {text: 'x'}]) {
    const {view} = await viewAnswering((payload) => ({answer: 'unavailable', reason: 'down', message, sequence: payload.sequence}));
    assert.equal(view.getAttribute('data-state'), 'error');
    assert.equal(view.shadowRoot.status.textContent, 'The data is temporarily unavailable');
    assert.equal(view.table.emptyContext.message, undefined);
    const toast = toastOf(view);
    assert.ok(toast, `a notice for message ${JSON.stringify(message)}`);
    assert.equal(toast.getAttribute('status'), 'error');
    assert.equal(toast.getAttribute('title'), 'The data could not be fetched. Try again.');
    assert.equal(toast.getAttribute('data-sf-code'), 'down');
  }
});

test('refused with a message: the no-access state and the live region say it', async () => {
  const {view} = await viewAnswering((payload) => ({answer: 'refused', reason: 'forbidden', message: 'Нет доступа к хранилищу «Файлы»', sequence: payload.sequence}));
  assert.equal(view.getAttribute('data-state'), 'empty');
  assert.equal(view.shadowRoot.status.textContent, 'Нет доступа к хранилищу «Файлы»');
  assert.deepEqual({...view.table.emptyContext}, {kind: 'no-access', message: 'Нет доступа к хранилищу «Файлы»'});
});

test('refused without a message is no access in the view\'s own words', async () => {
  const {view} = await viewAnswering((payload) => ({answer: 'refused', reason: 'forbidden', sequence: payload.sequence}));
  assert.deepEqual({...view.table.emptyContext}, {kind: 'no-access'});
  assert.notEqual(view.shadowRoot.status.textContent, '');
});

test('the message goes with the next answer that does not carry one', async () => {
  const {view, set} = await viewAnswering((payload) => ({answer: 'unavailable', reason: 'storage_view_not_ready', message: PREPARING, sequence: payload.sequence}));
  set((payload) => listing(payload));
  await view.refresh('later');
  assert.equal(view.getAttribute('data-state'), 'populated');
  set((payload) => ({answer: 'unavailable', reason: 'down', sequence: payload.sequence}));
  await view.refresh('again');
  assert.equal(view.shadowRoot.status.textContent, 'The data is temporarily unavailable');
  assert.equal(view.table.emptyContext.message, undefined);
  set(() => { throw new Error('boom'); });
  await view.refresh('thrown');
  assert.equal(view.table.emptyContext.message, undefined);
});

test('markup in the message is text: the view sets textContent, the brick a title attribute', () => {
  const view = readFileSync(resolve(root, 'src/smart/data-view/index.js'), 'utf8');
  assert.match(view, /status\.textContent = message;/u);
  assert.doesNotMatch(view, /status\.innerHTML/u);
  const table = readFileSync(resolve(root, 'src/smart/table/index.js'), 'utf8');
  assert.match(table, /title: message \|\| this\.getAttribute\("error-text"\)/u);
  assert.match(table, /kind === "no-access"\) return \{kind, size, headingLevel, title: message,/u);
  const template = readFileSync(resolve(root, 'src/smart/table/js/templates/default.js'), 'utf8');
  assert.match(template, /title=\$\{brick\.title \|\| nothing\}/u);
});

test('the manifest declares the answer message and treats it as untrusted', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'src/smart/data-view/smart.manifest.json'), 'utf8'));
  const message = manifest.events['sf-data-view-answer'].payload.properties.message;
  assert.equal(message.type, 'string');
  assert.match(message.description, /query\.change/u);
  assert.ok(manifest.security.untrusted_inputs.includes('answer messages'));
});

// Larena acceptance, 2026-10-22: a search longer than the host takes is refused
// as query_invalid with a sentence. That is a query to correct, not an access
// refusal: the toolbar, the search and the rest of the query stay, and the
// error state says the host's sentence. Only access reasons are «no access».
const LONG_SEARCH = 'я'.repeat(300);
const TOO_LONG = 'Строка поиска длиннее 255 символов';
const toolbarShown = (view) => view.shadowRoot.toolbar.hidden === false && view.table.getAttribute('toolbar') !== 'false';

test('refused for the query: an error state with the host sentence, the toolbar and the query stay', async () => {
  const {view, set} = await viewAnswering((payload) => listing(payload));
  assert.equal(view.getAttribute('data-state'), 'populated');
  set((payload) => ({answer: 'refused', reason: 'query_invalid', message: `<b>${TOO_LONG}</b>`, sequence: payload.sequence}));
  await view.changeQuery({search: LONG_SEARCH}, 'search');
  assert.equal(view.getAttribute('data-state'), 'error');
  assert.equal(view.shadowRoot.status.textContent, `<b>${TOO_LONG}</b>`, 'the sentence is text, as the host sent it');
  assert.equal(view.table.emptyContext.message, `<b>${TOO_LONG}</b>`);
  assert.equal(view.table.emptyContext.kind, undefined, 'not the no-access brick');
  assert.equal(view.table.getAttribute('data-state'), 'error');
  assert.ok(toolbarShown(view), 'the toolbar stays');
  assert.equal(view.query.search, LONG_SEARCH, 'the search the person typed is kept');
  assert.equal(view.records.length, 0, 'the last answer\'s rows do not answer this query');
  assert.equal(toastOf(view), null, 'no notice over the state');
  // Shortened, the query is answered again.
  set((payload) => listing(payload));
  await view.changeQuery({search: 'я'}, 'search');
  assert.equal(view.getAttribute('data-state'), 'populated');
  assert.ok(toolbarShown(view));
});

test('refused for the query without a sentence: the view\'s own words', async () => {
  for (const reason of ['query_invalid', 'minimal_cms_dataview_filter_denied', 'search_too_long']) {
    const {view} = await viewAnswering((payload) => ({answer: 'refused', reason, sequence: payload.sequence}));
    assert.equal(view.getAttribute('data-state'), 'error', reason);
    assert.equal(view.shadowRoot.status.textContent, 'The request could not be completed', reason);
    assert.equal(view.table.emptyContext.message, 'The request could not be completed', reason);
    assert.ok(toolbarShown(view), reason);
    assert.equal(toastOf(view), null, reason);
  }
});

test('refused for access: no access, the toolbar withdrawn, for every access reason', async () => {
  for (const reason of [undefined, '', 'forbidden', 'access_denied', 'scope_denied', 'storage_page_scope_denied', 'registered_list_access_denied']) {
    const {view} = await viewAnswering((payload) => ({answer: 'refused', reason, sequence: payload.sequence}));
    assert.equal(view.getAttribute('data-state'), 'empty', String(reason));
    assert.equal(view.table.emptyContext.kind, 'no-access', String(reason));
    assert.equal(view.shadowRoot.toolbar.hidden, true, String(reason));
    assert.equal(view.table.getAttribute('toolbar'), 'false', String(reason));
  }
});

test('a query error after no access gives the toolbar back', async () => {
  const {view, set} = await viewAnswering((payload) => ({answer: 'refused', reason: 'access_denied', sequence: payload.sequence}));
  assert.equal(view.table.getAttribute('toolbar'), 'false');
  set((payload) => ({answer: 'refused', reason: 'query_invalid', sequence: payload.sequence}));
  await view.refresh('search');
  assert.equal(view.getAttribute('data-state'), 'error');
  assert.ok(toolbarShown(view));
});
