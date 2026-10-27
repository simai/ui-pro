#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// simai.property-view-port 1.15.0 (standard simai.smart-component 1.3.8 §4.9,
// §7.2.1), measured on the built bytes with the model host of ui-source's
// property-view-port-group-load contract test, both ways:
// - with group-load the first read is group.load {group: null}; a section that
//   starts reads each of its groups not read at the record's revision, and a
//   group on its way is drawn as field_count skeleton lines; a save answered at
//   a newer revision leaves the other groups to be read when next shown; a
//   conflict keeps what was typed and reads the shown group again, so the next
//   save goes at the current revision; unknown-group reads the arrangement;
// - without it record.load is asked once and every section is served from it.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/avatars/css/avatars.css',
  'component/component/reference-link/css/reference-link.css',
  'component/component/inputs/css/inputs.css', 'component/component/tree/css/tree.css',
  'component/component/progress-scale/css/progress-scale.css',
  'component/component/buttons/css/buttons.css',
  'component/component/dropdown/css/dropdown.css',
  'smart/smart/drawer/css/drawer.css',
  'component/component/datepicker/css/datepicker.css',
  'component/component/tags/css/tags.css',
  'component/component/textarea/css/textarea.css',
  'component/component/file-upload/css/file-upload.css',
  'component/component/file-preview/css/file-preview.css',
  'component/component/progress-bar/css/progress-bar.css',
  // The composite's own stylesheet, which it did not have at all in the first
  // pair -- the reason a consumer saw plain stacked text.
  'smart/smart/popover/css/popover.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'smart/smart/copy-button/css/copy-button.css',
  'smart/smart/empty-state/css/empty-state.css', 'component/component/featured-icon/css/featured-icon.css',
  'component/component/skeleton/css/skeleton.css',
  'smart/smart/property-view/css/property-view.css',
  'smart/smart/sortable/css/sortable.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
  'component/component/pagination/css/pagination.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/input/js/input.js', 'smart/smart/tree/js/tree.js',
  'smart/smart/tree-item/js/tree-item.js', 'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/button/js/button.js',
  'smart/smart/progress-scale/js/progress-scale.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js',
  'smart/smart/tag/js/tag.js',
  'smart/smart/datepicker/js/datepicker.js', 'smart/smart/textarea/js/textarea.js',
  'smart/smart/switch/js/switch.js', 'smart/smart/button-group/js/button-group.js',
  'smart/smart/file-upload/js/file-upload.js', 'smart/smart/file-preview/js/file-preview.js',
  'smart/smart/progress-bar/js/progress-bar.js',
  'smart/smart/field-renderers/js/field-renderers.js',
  'smart/smart/sortable/js/sortable.js',
  // A related group composes a data view, which brings a table and a page row.
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
  'smart/smart/popover/js/popover.js',
  'smart/smart/copy-button/js/copy-button.js',
  'smart/smart/empty-state/js/empty-state.js',
  'smart/smart/property-view/js/property-view.js',
].map((p) => join(out, p));



const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

const open = async (capabilities) => {
  const page = await browser.newPage({viewport: {width: 1200, height: 800}});
  // core.js loaded as an inline module cannot find its own URL for lazy chunks
  // (a probe's way of loading, not the package's); anything else is a failure.
  page.on('pageerror', (error) => {
    if (!/Automatic publicPath/u.test(error.message)) note({case: 'page error', message: error.message});
  });
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"><sf-property-view id="v" collection="pages" mode="auto" full></sf-property-view></body></html>');
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-property-view'), null, {timeout: 8000});
  await page.evaluate((capabilities) => {
    const SECTIONS = [
      {key: 'main', label: 'Основное', groups: [{key: 'about', label: 'О странице', fields: [{key: 'title', label: 'Название', propertyType: 'string', value: 'A'}]}]},
      {key: 'contacts', label: 'Контакты', groups: [{key: 'phones', label: 'Телефоны', fields: [
        {key: 'phone', label: 'Телефон', propertyType: 'string', value: '1'},
        {key: 'fax', label: 'Факс', propertyType: 'string', value: '2'}]}]},
    ];
    const record = (revision, only) => ({record_id: 'record-1', collection: 'pages', revision, label: 'Запись',
      actions: ['record.edit'],
      sections: SECTIONS.map((section) => ({...section, groups: section.groups.map((group) => (only && group.key !== only
        ? {key: group.key, label: group.label, fields: [], field_count: group.fields.length}
        : group))}))});
    window.asked = [];
    window.state = {revision: '7', slow: 0, gone: null};
    window.host = {
      version: '1.15.0', capabilities,
      async raise(intent, payload) {
        window.asked.push({intent, group: payload?.group, reason: payload?.reason, revision: payload?.revision});
        const state = window.state;
        if (state.slow) await new Promise((done) => setTimeout(done, state.slow));
        if (intent === 'record.load') return {answer: 'applied', record: record(state.revision)};
        if (intent === 'group.load') {
          if (!capabilities.includes('group-load')) return {answer: 'unavailable', reason: 'no-capability'};
          const group = payload.group ?? 'about';
          if (group === state.gone || !['about', 'phones'].includes(group)) return {answer: 'refused', reason: 'unknown-group'};
          return {answer: 'applied', record: record(state.revision, group), group, revision: state.revision};
        }
        if (intent === 'group.save') {
          if (payload.revision !== state.revision) return {answer: 'conflict', reason: 'revision', revision: state.revision};
          state.revision = String(Number(state.revision) + 1);
          // The saved group only: the other groups were not read at the new revision.
          const answer = record(state.revision, capabilities.includes('group-load') ? payload.group : null);
          return {answer: 'applied', record: answer, revision: state.revision};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    };
    const view = document.getElementById('v');
    view.setHostPort(window.host);
    view.setAttribute('record-id', 'record-1');
  }, capabilities);
  await page.waitForTimeout(700);
  return page;
};
const look = (page) => page.evaluate(() => {
  const view = document.getElementById('v');
  const asked = window.asked.splice(0);
  return {
    asked: asked.map((one) => `${one.intent}${one.group !== undefined ? `:${one.group}` : ''}${one.reason ? `/${one.reason}` : ''}${one.revision !== undefined ? `@${one.revision}` : ''}`),
    state: view.getAttribute('data-state'),
    section: view.selectedSection,
    revision: view.revision,
    fields: [...view.querySelectorAll('.sf-property-view-field')].map((node) => node.dataset.field),
    skeletons: view.querySelectorAll('.sf-property-view-group[aria-busy="true"] .sf-skeleton').length,
  };
});
// The act's own result is dropped: selectSection answers the element, which
// is not a value to send back to node.
const step = async (page, act, wait = 500) => {
  await page.evaluate(`(async () => { await (${act.toString()})(); })()`);
  await page.waitForTimeout(wait);
  return look(page);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  // With group-load.
  const page = await open(['group-load']);
  const first = await look(page);
  if (!same(first.asked, ['group.load:null/record-id-changed']) || !same(first.fields, ['title']) || first.revision !== '7') {
    note({case: 'group-load: the first read is group null and draws its group', got: first});
  }
  await page.evaluate(() => { window.state.slow = 400; });
  const waiting = await step(page, () => document.getElementById('v').selectSection('contacts'), 150);
  if (waiting.skeletons !== 2) note({case: 'group-load: a group on its way is field_count skeleton lines', got: waiting});
  await page.waitForTimeout(600);
  const contacts = await look(page);
  if (!same(waiting.asked, ['group.load:phones/started']) || !same(contacts.fields, ['phone', 'fax'])) {
    note({case: 'group-load: a section that starts reads its group', got: {waiting, contacts}});
  }
  await page.evaluate(() => { window.state.slow = 0; });
  const back = await step(page, () => document.getElementById('v').selectSection('main'));
  if (back.asked.length) note({case: 'group-load: a group read at this revision is not read again', got: back});

  // A save answered at a newer revision carries the saved group only.
  const saved = await step(page, async () => {
    const view = document.getElementById('v');
    view.editGroup('main', 'about');
    view.changeField({key: 'title', propertyType: 'string', value: 'A'}, 'B');
    await view.saveGroup();
  });
  if (!same(saved.asked, ['group.save:about@7']) || saved.revision !== '8') {
    note({case: 'group-load: group.save sends the record\'s one revision', got: saved});
  }
  const reread = await step(page, () => document.getElementById('v').selectSection('contacts'));
  if (!same(reread.asked, ['group.load:phones/started']) || !same(reread.fields, ['phone', 'fax'])) {
    note({case: 'group-load: a group read at an older revision is read again when shown', got: reread});
  }

  // Another window saves; this save is a conflict, the input is kept and the
  // group read again, and the next save goes at the current revision.
  const conflict = await step(page, async () => {
    window.state.revision = '9';
    const view = document.getElementById('v');
    view.selectSection('main');
    await new Promise((done) => setTimeout(done, 300));
    window.asked.length = 0;
    view.editGroup('main', 'about');
    view.changeField({key: 'title', propertyType: 'string', value: 'B'}, 'C');
    await view.saveGroup();
  }, 600);
  const kept = await page.evaluate(() => {
    const view = document.getElementById('v');
    return {changed: view.changed.get('title') ?? null, editing: view.editing, conflict: Boolean(view.conflict)};
  });
  if (!same(conflict.asked, ['group.save:about@8', 'group.load:about/requested']) || conflict.revision !== '9'
      || kept.changed !== 'C' || !kept.editing || !kept.conflict) {
    note({case: 'group-load: a conflict keeps the input and reads the group again at the answer\'s revision', got: {conflict, kept}});
  }
  const again = await step(page, () => document.getElementById('v').saveGroup());
  if (!same(again.asked, ['group.save:about@9'])) note({case: 'group-load: the next save goes at the current revision', got: again});

  // A group the record no longer holds reads the arrangement again.
  const gone = await step(page, async () => {
    window.state.revision = '11';
    window.state.gone = 'phones';
    document.getElementById('v').selectSection('contacts');
    await new Promise((done) => setTimeout(done, 300));
    window.state.gone = null;
  }, 700);
  if (gone.asked[0] !== 'group.load:phones/started' || gone.asked[1] !== 'group.load:null/requested') {
    note({case: 'group-load: unknown-group reads the arrangement again', got: gone});
  }
  await page.close();

  // Without group-load.
  const plain = await open([]);
  const read = await look(plain);
  if (!same(read.asked, ['record.load/record-id-changed']) || !same(read.fields, ['title'])) {
    note({case: 'no group-load: record.load once', got: read});
  }
  const served = await step(plain, () => document.getElementById('v').selectSection('contacts'));
  if (served.asked.length || !same(served.fields, ['phone', 'fax'])) {
    note({case: 'no group-load: every section is served from the one answer', got: served});
  }
  const plainSave = await step(plain, async () => {
    const view = document.getElementById('v');
    view.selectSection('main');
    view.editGroup('main', 'about');
    view.changeField({key: 'title', propertyType: 'string', value: 'A'}, 'B');
    await view.saveGroup();
    view.selectSection('contacts');
  });
  if (!same(plainSave.asked, ['group.save:about@7']) || plainSave.asked.some((one) => one.startsWith('group.load'))) {
    note({case: 'no group-load: a save asks for no group', got: plainSave});
  }
  await plain.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('PROPERTY_VIEW_GROUP_LOAD_OK');
