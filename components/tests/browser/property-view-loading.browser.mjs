#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// A record on its way and a record that did not come (owner, 2026-10-14),
// measured on the built bytes with a stub host:
// - a view with no record named yet says nothing went wrong: it is loading;
// - while the record loads, the shape of its fields stands in the Framework's
//   skeleton, and the fields replace it;
// - refused is sf-empty-state «Нет доступа»; unavailable is «Не удалось
//   загрузить» with «Повторить», which asks again.
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
  'smart/smart/copy-button/js/copy-button.js',
  'smart/smart/empty-state/js/empty-state.js',
  'smart/smart/property-view/js/property-view.js',
].map((p) => join(out, p));


const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const RECORD = {record_id: 'r-1', collection: 'demo', revision: 1, label: 'Запись',
  sections: [{key: 'main', label: 'Общее', groups: [{key: 'main', label: 'Основное', fields: [
    {key: 'title', label: 'Название', propertyType: 'string', value: 'Раз'}]}]}]};

const open = async () => {
  const page = await browser.newPage({viewport: {width: 1200, height: 800}});
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><body style="margin:0"><sf-property-view id="v" collection="demo"></sf-property-view></body></html>');
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-property-view'), null, {timeout: 8000});
  await page.evaluate((record) => {
    window.asked = [];
    window.mode = 'slow';
    document.getElementById('v').setHostPort({
      version: '1.12.0', capabilities: [],
      async raise(intent, payload) {
        window.asked.push({intent, record: payload?.record_id ?? null});
        if (intent !== 'record.load') return {answer: 'applied'};
        if (!payload?.record_id) return {answer: 'unavailable', reason: 'no-record'};
        if (window.mode === 'refused') return {answer: 'refused', reason: 'forbidden'};
        if (window.mode === 'unavailable') return {answer: 'unavailable', reason: 'down'};
        await new Promise((done) => setTimeout(done, 700));
        return {answer: 'applied', record: structuredClone(record)};
      },
    });
  }, RECORD);
  await page.waitForTimeout(300);
  return page;
};
const look = (page) => page.evaluate(() => {
  const view = document.getElementById('v');
  const brick = view.querySelector('sf-empty-state');
  return {asked: window.asked.length, state: view.getAttribute('data-state'),
    skeleton: Boolean(view.querySelector('.sf-property-view-loading .sf-skeleton')),
    fields: view.querySelectorAll('.sf-property-view-field').length,
    brick: brick ? {kind: brick.getAttribute('kind'), actions: [...brick.querySelectorAll('sf-button')].map((one) => one.getAttribute('text'))} : null,
    status: view.querySelector('.sf-property-view-status:not([hidden])')?.textContent.trim() ?? null};
});

try {
  const page = await open();
  const unnamed = await look(page);
  if (unnamed.brick || !unnamed.skeleton) note({case: 'no record named: still loading, nothing wrong', got: unnamed});
  await page.evaluate(() => document.getElementById('v').setAttribute('record-id', 'r-1'));
  await page.waitForTimeout(250);
  const waiting = await look(page);
  if (!waiting.skeleton || waiting.fields || waiting.brick) note({case: 'the skeleton while the record loads', got: waiting});
  await page.waitForTimeout(900);
  const loaded = await look(page);
  if (loaded.skeleton || !loaded.fields) note({case: 'the fields replace the skeleton', got: loaded});

  await page.evaluate(() => { window.mode = 'refused'; return document.getElementById('v').load('probe'); });
  await page.waitForTimeout(200);
  // A loaded record stays on screen when a reload is refused; a fresh panel says why.
  const fresh = await open();
  await fresh.evaluate(() => { window.mode = 'refused'; document.getElementById('v').setAttribute('record-id', 'r-1'); });
  await fresh.waitForTimeout(400);
  const denied = await look(fresh);
  if (denied.brick?.kind !== 'no-access' || denied.brick.actions.length) note({case: 'refused is no access', got: denied});
  await fresh.evaluate(() => { window.mode = 'unavailable'; return document.getElementById('v').load('probe'); });
  await fresh.waitForTimeout(400);
  const failed = await look(fresh);
  if (failed.brick?.kind !== 'error' || failed.brick.actions.join() !== 'Повторить') note({case: 'could not load, with «Повторить»', got: failed});
  const before = await fresh.evaluate(() => window.asked.length);
  await fresh.evaluate(() => { window.mode = 'slow'; document.querySelector('#v sf-empty-state sf-button button')?.click(); });
  await fresh.waitForTimeout(1200);
  const retried = await look(fresh);
  if (retried.asked !== before + 1 || !retried.fields) note({case: '«Повторить» asks again', got: {before, retried}});
  // A panel opened fresh (rules of the road, 2026-10-15): its first frame is
  // the skeleton, never the empty body, and opening a record costs two renders
  // -- the skeleton and the record -- not one more for every state it passes.
  const opened = await fresh.evaluate(async (record) => {
    const Ctor = customElements.get('sf-property-view');
    const renders = [];
    const own = Ctor.prototype.template;
    Ctor.prototype.template = function (...args) {
      if (this.id === 'w') renders.push({state: this.getAttribute('data-state'), record: Boolean(this.record)});
      return own.apply(this, args);
    };
    const view = document.createElement('sf-property-view');
    view.id = 'w';
    view.setAttribute('collection', 'demo');
    view.setAttribute('record-id', 'r-1');
    document.body.append(view);
    view.setHostPort({version: '1.12.0', capabilities: [],
      async raise(intent) { return intent === 'record.load' ? {answer: 'applied', record: structuredClone(record)} : {answer: 'applied'}; }});
    await new Promise((done) => setTimeout(done, 600));
    Ctor.prototype.template = own;
    return {renders, fields: view.querySelectorAll('.sf-property-view-field').length};
  }, RECORD);
  const blank = opened.renders.filter((one) => !one.record && one.state !== 'loading');
  if (blank.length || opened.renders.length > 2 || !opened.fields) note({case: 'a fresh panel: skeleton first, two renders', got: opened});
  console.log(JSON.stringify({unnamed, waiting, loaded, denied, failed, retried, opened}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('PROPERTY_VIEW_LOADING_OK');
