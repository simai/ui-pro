// The package half of ui-source's "change journal: every declared alias table
// is recorded" (tests/change-lifecycle.contract.test.mjs).
//
// A former event name a component still answers to is kept for compatibility,
// and nothing is kept without a date to leave by. In the free Framework that
// date is a record of contracts/changes/journal.json. The package components
// keep their former names in aliases.json, dated per row; since standard
// simai.smart-component 1.4 their smart.manifest.json is generated from
// component.json, so every one of those names is listed with alias_of (the
// hand-written manifests listed none, which is why the free test passed over
// the package until now).
//
// The journal is ui-source's file and a package file may not replace it (the
// overlay refuses), so the records are ui-source's to add. Until they are,
// each name is listed below as pending: it must have a dated row in its
// component's aliases.json, and the list only shrinks -- a name the journal
// records is removed from it in the same commit that moves the pin.
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const journal = read('contracts/changes/journal.json');
const recorded = new Set(journal.records.flatMap((record) => record.items.map((item) => `${item.component || ''}|${item.from}`)));
const known = (component, from) => recorded.has(`${component}|${from}`) || recorded.has(`|${from}`);

// Former event names of package components the journal does not record yet,
// by component. Each has a dated row in its aliases.json.
const PENDING = {
  'sf-admin-menu': ['sf-admin-menu-search', 'sf-admin-menu-settings-reset', 'sf-admin-menu-intent'],
  'sf-change-confirm': ['sf-change-confirm-accept', 'sf-change-confirm-decline', 'sf-change-confirm-expire'],
  'sf-chat-composer': ['sf-chat-send', 'sf-chat-stop', 'sf-chat-files', 'sf-chat-action'],
  'sf-chat-interlocutor': ['sf-chat-interlocutor'],
  'sf-chat-message': ['sf-chat-action'],
  'sf-message-log': ['sf-message-log-load-earlier'],
  'sf-property-view': ['sf-property-view-open-record', 'sf-property-view-delete-record'],
  'sf-table': [
    'sf-port-output', 'sf-table-action-intent', 'sf-table-column-settings-change', 'sf-table-create-intent',
    'sf-table-query-intent', 'sf-table-retry', 'sf-table-tree-toggle', 'sf-table-tree-more', 'sf-table-rows-reorder',
    'sf-table:column-settings-change', 'onColumnSettingsChange', 'onSearchEnd', 'onTemplateSave', 'onFilterUpdate',
  ],
  'sf-thread-list': ['sf-thread-list-select', 'sf-thread-list-unarchive', 'sf-thread-list-action', 'sf-thread-list-view'],
  'sf-chat-window': [
    'chat-port:open', 'chat-port:older', 'chat-port:send', 'chat-port:retry', 'chat-port:edit', 'chat-port:delete',
    'chat-port:read', 'chat-port:rate', 'chat-port:file-retry', 'chat-port:decide', 'chat-port:check', 'chat-port:stop',
    'chat-port:create', 'chat-port:rename', 'chat-port:archive', 'chat-port:interlocutor', 'chat-window:view',
    'chat-window:more', 'chat-window:search', 'chat-window:pin', 'chat-window:attach', 'chat-window:detach',
    'chat-window:files', 'chat-window:file-remove',
  ],
};

// The package's folders (scripts/overlay.mjs PACKAGE_COMPONENTS; the overlay
// holds src/, tests/ and docs/ of this repository, not its scripts).
const packageFolders = ['admin-menu', 'change-confirm', 'chat-composer', 'chat-interlocutor', 'chat-message', 'chat-window',
  'data-view', 'message-log', 'property-view', 'table', 'thread-list'];

const DATE = /^\d{4}-\d{2}-\d{2}$/u;

test('every former event name of a package component is recorded in the journal, or pending with a dated row', () => {
  const problems = [];
  const seen = new Set();
  for (const name of packageFolders) {
    const manifest = read(`src/smart/${name}/smart.manifest.json`);
    const tag = manifest.custom_element?.tag || manifest.custom_element;
    const rows = existsSync(resolve(root, `src/smart/${name}/aliases.json`)) ? read(`src/smart/${name}/aliases.json`).aliases ?? [] : [];
    for (const [event, spec] of Object.entries(manifest.events || {})) {
      if (!spec.alias_of || known(tag, event)) continue;
      seen.add(`${tag}|${event}`);
      if (!(PENDING[tag] ?? []).includes(event)) {
        problems.push(`${tag} event ${event}: not in contracts/changes/journal.json and not pending here`);
        continue;
      }
      const row = rows.find((one) => one.kind === 'event' && one.from === event);
      if (!row || !DATE.test(row.since ?? '') || !DATE.test(row.remove_after ?? '')) {
        problems.push(`${tag} event ${event}: pending, but aliases.json has no dated row for it`);
      }
    }
  }
  for (const [tag, events] of Object.entries(PENDING)) {
    for (const event of events) {
      if (!seen.has(`${tag}|${event}`)) problems.push(`${tag} event ${event}: pending here, but recorded or gone: remove it from PENDING`);
    }
  }
  assert.deepEqual(problems, []);
});
