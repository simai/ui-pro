import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Smart Table names every owned action and contextual surface', async () => {
  const [table, template] = await Promise.all([
    read('src/smart/table/index.js'),
    read('src/smart/table/js/templates/default.js'),
  ]);

  // Eight since round three: the toolbar's control opens the view's actions.
  // Nine since the compact list, whose sort is a menu (it has no column heads).
  assert.equal((table.match(/<sf-context-menu/g) || []).length, 9);
  assert.equal((table.match(/<sf-context-menu[\s\S]*?aria-label=/g) || []).length, 9);
  assert.match(table, /getContextMenuLabel\(data = \{\}\)/);
  assert.match(template, /aria-label="Сохранить шаблон фильтра"/);
  assert.match(template, /aria-label=\$\{value\.length \? 'Очистить поиск' : 'Поиск'\}/);
  assert.match(template, /aria-label="Дополнительные действия создания"/);
  // The gear in the toolbar became the view's actions; column settings keep
  // their own gear in the table's head, labelled there.
  assert.match(template, /aria-label="Действия с представлением"/);
  assert.match(table, /ariaLabel: this\.text\("settingsColumnLabel"\)/);
  assert.match(template, /context\.actions[\s\S]*Дополнительные действия создания/);
  assert.match(template, /context\.settings && state\.toolbarActions\?\.length[\s\S]*Действия с представлением/);
  assert.match(template, /<table[\s\S]*aria-label=\$\{context\.ariaLabel \|\| nothing\}/);
  assert.doesNotMatch(template, /Resize sidebar/);
  assert.doesNotMatch(template, /Math\.random\(\)/);
});

test('Smart Table owns one disposable portal and viewport-aware overlays', async () => {
  const table = await read('src/smart/table/index.js');

  assert.match(table, /this\._portalContainer = portal/);
  assert.match(table, /portal\.className = "sf-table-portal"/);
  assert.doesNotMatch(table, /getElementById\("sf-table-portal"\)/);
  assert.match(table, /this\._portalContainer\.remove\(\)/);
  assert.match(table, /window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(table, /clampContextMenusToViewport\(\)/);
  assert.match(table, /contextKeyEvent\(event\)[\s\S]*event\.key !== 'Escape'/);
  assert.match(table, /closeContextMenu\(restoreFocus = true\)/);
  assert.match(table, /trigger\?\.isConnected[\s\S]*trigger\.focus\(\)/);
});

test('Smart Table exposes keyboard column resizing without literal design dimensions', async () => {
  const [table, template, styles] = await Promise.all([
    read('src/smart/table/index.js'),
    read('src/smart/table/js/templates/default.js'),
    read('src/smart/table/js/templates/default.css'),
  ]);

  // The column edges are the Framework's resize gesture since 2026-10-14
  // (SF.Resizer.attach): arrows, Home and End, Enter to reset, and a double
  // click; the edge is a focusable separator.
  assert.match(template, /aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter"/);
  assert.match(template, /role="separator"/);
  assert.match(table, /this\._columnResizeDetach = attach\(table, \{\s*handles: '\.sf-table-column-resizer',/u);
  assert.match(table, /import \{ref\} from "lit\/directives\/ref\.js"/);
  assert.match(template, /import \{ref\} from "lit\/directives\/ref\.js"/);
  assert.doesNotMatch(`${table}\n${template}`, /:ref=/);
  // Round three took the handle away: the width is taken by the line itself,
  // through an invisible strip that is still a button for the keyboard.
  assert.doesNotMatch(styles, /sidebar-resizer-button/);
  assert.match(styles, /\.sf-table-column-resizer \{[\s\S]*?cursor: col-resize/u);
  assert.match(
    styles,
    /\.sf-table-column-resizer:focus-visible \{\s*outline: var\(--sf-focus--width\) var\(--sf-focus--style\) var\(--sf-focus--color\)/u,
  );
  assert.match(table, /getPropertyValue\('--sf-space-1'\)/);
  assert.doesNotMatch(table, /\b(?:1rem|2px)\b/);
  assert.doesNotMatch(styles, /max-width:\s*400px/);
  assert.doesNotMatch(table, /z-index:\s*999[89]/);
});

test('Smart Table Loader rule declares every rendered Smart dependency', async () => {
  const rule = await read('src/smart/table/rule.js');

  for (const dependency of [
    'cl-checkbox', 'cl-buttons', 'cl-icon-buttons', 'cl-inputs', 'cl-tags',
    'cl-pagination', 'cl-spinner', 'cl-datepicker', 'cl-dropdown', 'cl-tabs', 'cl-context-menu',
  ]) {
    assert.match(rule, new RegExp(`name: ["']${dependency}["']`));
  }
});

test('Smart Table implements its declared loading, empty, error and retry states', async () => {
  const [table, template, manifestSource] = await Promise.all([
    read('src/smart/table/index.js'),
    read('src/smart/table/js/templates/default.js'),
    read('src/smart/table/smart.manifest.json'),
  ]);
  const manifest = JSON.parse(manifestSource);

  assert.match(table, /attribute: "data-state"/);
  assert.match(table, /values: \["auto", "loading", "populated", "empty", "error"\]/);
  for (const eventName of [
    'sf-table-search-change',
    'sf-table-filter-change',
    'sf-table-template-save',
    'sf-table-column-settings-change',
    'sf-table-retry',
  ]) {
    assert.match(table, new RegExp(`dispatchTableEvent\\('${eventName}'`));
    assert.ok(manifest.events[eventName]);
  }
  assert.equal(manifest.inputs.properties['data-state'].default, 'auto');
  assert.ok(manifest.methods.setDataState);
  assert.ok(manifest.methods.requestRetry);
  assert.match(template, /data-state=\$\{resolvedDataState\(context\)\}/);
  assert.match(template, /aria-busy=\$\{resolvedDataState\(context\) === 'loading'/);
  assert.match(template, /role="status"/);
  // Empty and failed are one sf-empty-state (owner, 2026-10-14): its error
  // offers «Повторить», which the table turns into the retry event, and a
  // failure the person caused is an alert.
  assert.match(template, /<sf-empty-state kind=\$\{brick\.kind\}/);
  assert.match(table, /id === "retry"\) \{ event\.stopPropagation\(\); this\.requestRetry\(\); \}/);
  assert.match(table, /live: context\.caused \? "alert" : "auto"/);
});
