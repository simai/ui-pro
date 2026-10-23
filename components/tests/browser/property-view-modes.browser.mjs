#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
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
  'component/component/context-menu/css/context-menu.css',
  'smart/smart/property-view/css/property-view.css',
  'smart/smart/sortable/css/sortable.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
  'component/component/pagination/css/pagination.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js', 'smart/smart/badges/js/badges.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/inputs/js/inputs.js', 'smart/smart/tree/js/tree.js',
  'smart/smart/tree-item/js/tree-item.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/buttons/js/buttons.js',
  'smart/smart/progress-scale/js/progress-scale.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js',
  'smart/smart/tags/js/tags.js',
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
  'smart/smart/property-view/js/property-view.js',
].map((p) => join(out, p));

const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) {
  console.error(JSON.stringify({missingAssets: absent, root: out}, null, 2));
  throw new Error(`${absent.length} build asset(s) not found under ${out}`);
}

// sf-property-view by mode and by right (owner, 2026-10-14). Measured with a
// host port that answers 1.12.0:
// - a reader (no record.edit, no lifecycle act) sees values and nothing to
//   change them with: no «изменить», no value buttons, no footer, no delete;
// - an editor gets «изменить» and a footer only while a group is open;
// - mode view offers nothing, whatever the person may do;
// - mode edit opens every group and saves the whole object with record.save;
// - mode create reads an empty object with mode create, makes it with
//   record.create and then shows it in auto;
// - a host on port 1.11.0 keeps the old reading: groups are editable.
const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1100, height: 900}});
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><body style="margin:0"></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-property-view')));

  const make = (setup) => page.evaluate(async ({mode, actions, version, capabilities}) => {
    document.body.replaceChildren();
    window.raised = [];
    const view = document.createElement('sf-property-view');
    view.id = 'view';
    view.setAttribute('record-id', 'r1');
    view.setAttribute('collection', 'pages');
    if (mode) view.setAttribute('mode', mode);
    document.body.append(view);
    const record = (empty = false) => ({
      record_id: empty ? null : 'r1', revision: empty ? null : '7', actions,
      sections: [{key: 'main', label: 'Основное', groups: [
        {key: 'about', label: 'О странице', columns: 1, fields: [
          {key: 'title', label: 'Название', propertyType: 'string', value: empty ? null : 'Главная', required: true}]},
        {key: 'seo', label: 'SEO', columns: 1, fields: [
          {key: 'slug', label: 'Адрес', propertyType: 'string', value: empty ? null : 'main'}]},
      ]}],
      view: {target: 'package', editable: ['personal', 'shared'], layers: {personal: {revision: 'p1', view: {schema_version: 1, sections: {}, groups: {}, fields: {}}}, shared: {revision: 's1', view: {schema_version: 1, sections: {}, groups: {}, fields: {}}}}},
    });
    view.setHostPort({
      version, capabilities,
      async raise(intent, payload) {
        window.raised.push({intent, payload: JSON.parse(JSON.stringify(payload ?? {}))});
        if (intent === 'record.load') return {answer: 'applied', record: record(payload?.mode === 'create')};
        if (intent === 'record.create') return {answer: 'applied', record_id: 'new-1'};
        if (intent === 'record.save') return {answer: 'applied', record: record()};
        return {answer: 'applied'};
      },
    });
    for (let tries = 0; tries < 80 && !view.sections?.length; tries += 1) await new Promise((done) => setTimeout(done, 50));
    await new Promise((done) => setTimeout(done, 300));
    const root = view;
    return {
      edit: root.querySelectorAll('[data-action="edit"]').length,
      valueButtons: root.querySelectorAll('.sf-property-view-field-open').length,
      footer: Boolean(root.querySelector('.sf-property-view-actions')),
      trash: Boolean(root.querySelector('[data-action="delete"]')),
      inputs: root.querySelectorAll('sf-input').length,
      save: root.querySelector('[data-action="save"], [data-action="create"]')?.getAttribute('data-action') ?? null,
      configure: view.canConfigureView,
      loads: window.raised.filter((one) => one.intent === 'record.load').map((one) => one.payload),
    };
  }, setup);

  const reader = await make({mode: null, actions: [], version: '1.12.0', capabilities: ['view-settings']});
  if (reader.edit || reader.valueButtons || reader.footer || reader.trash) note({case: 'a reader', got: reader, expected: 'values only'});

  const editor = await make({mode: null, actions: ['record.edit'], version: '1.12.0', capabilities: ['view-settings']});
  if (editor.edit !== 2 || editor.valueButtons !== 2 || editor.footer || editor.trash) note({case: 'an editor, closed', got: editor});
  const opened = await page.evaluate(async () => {
    const view = document.getElementById('view');
    view.querySelector('[data-action="edit"]').querySelector('button')?.click() ?? view.querySelector('[data-action="edit"]').click();
    await new Promise((done) => setTimeout(done, 200));
    return {footer: Boolean(view.querySelector('.sf-property-view-actions')), save: Boolean(view.querySelector('[data-action="save"]'))};
  });
  if (!opened.footer || !opened.save) note({case: 'an editor, a group open', got: opened, expected: 'a footer with save'});

  const lifecycle = await make({mode: null, actions: ['record.edit', 'record.delete'], version: '1.12.0', capabilities: []});
  if (!lifecycle.trash || !lifecycle.footer) note({case: 'an editor who may delete', got: lifecycle, expected: 'the trash in a footer'});

  const viewOnly = await make({mode: 'view', actions: ['record.edit', 'record.delete'], version: '1.12.0', capabilities: ['view-settings']});
  if (viewOnly.edit || viewOnly.valueButtons || viewOnly.footer || viewOnly.trash || viewOnly.configure) note({case: 'mode view', got: viewOnly, expected: 'nothing to change, whatever the rights'});

  const full = await make({mode: 'edit', actions: ['record.edit'], version: '1.12.0', capabilities: []});
  if (full.inputs !== 2 || full.save !== 'save' || full.edit) note({case: 'mode edit', got: full, expected: 'every group open, one save'});
  const saved = await page.evaluate(async () => {
    const view = document.getElementById('view');
    view.changeField({key: 'slug'}, 'home');
    view.changeField({key: 'title'}, 'Домой');
    await new Promise((done) => setTimeout(done, 100));
    await view.saveAll();
    return window.raised.filter((one) => one.intent === 'record.save').map((one) => one.payload);
  });
  if (saved.length !== 1 || saved[0].revision !== '7' || saved[0].values.slug !== 'home' || saved[0].values.title !== 'Домой') {
    note({case: 'mode edit saves the whole object', got: saved});
  }
  const fullReader = await make({mode: 'edit', actions: [], version: '1.12.0', capabilities: []});
  if (fullReader.inputs || fullReader.save) note({case: 'mode edit for a reader', got: fullReader, expected: 'read-only'});

  const create = await make({mode: 'create', actions: [], version: '1.12.0', capabilities: ['view-settings']});
  // The form is arranged where it is filled in (owner, 2026-10-16): with the
  // host's view-settings and a layer this person may write, create offers it.
  if (create.loads[0]?.mode !== 'create' || create.loads[0]?.record_id !== null || create.inputs !== 2 || create.save !== 'create' || !create.configure) {
    note({case: 'mode create', got: create, expected: 'an empty object read for a create, every field open, a create button, the form arrangeable'});
  }
  const made = await page.evaluate(async () => {
    const view = document.getElementById('view');
    let created = null;
    view.addEventListener('sf-property-view-created', (event) => { created = event.detail; });
    view.changeField({key: 'title'}, 'Новая');
    await view.saveAll();
    await new Promise((done) => setTimeout(done, 400));
    return {created, raised: window.raised.filter((one) => one.intent === 'record.create').map((one) => one.payload),
      id: view.getAttribute('record-id'), mode: view.getAttribute('mode')};
  });
  if (made.raised.length !== 1 || made.raised[0].values.title !== 'Новая' || made.created?.record_id !== 'new-1' || made.id !== 'new-1' || made.mode !== 'auto') {
    note({case: 'a create', got: made});
  }

  const legacy = await make({mode: null, actions: [], version: '1.11.0', capabilities: []});
  if (legacy.edit !== 2) note({case: 'a host on 1.11.0', got: legacy, expected: 'groups editable as before'});

  console.log(JSON.stringify({reader, editor, opened, lifecycle, viewOnly, full, saved, fullReader, create, made, legacy}, null, 1));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('PROPERTY_VIEW_MODES_OK');
