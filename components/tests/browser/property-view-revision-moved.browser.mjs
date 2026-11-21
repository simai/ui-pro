#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// simai.property-view-port 1.21.0 / 1.22.1, measured on the built bytes by real
// clicks and typing: a save over a revision that moved is answered refused or
// conflict, both with reason revision_moved and the current revision, nothing
// written. Either way the card says the record changed, keeps what the person
// typed and reads the record again, so the next save goes at the current
// revision -- on a group save (with and without group-load) and on a
// whole-record save (mode edit, every group open).
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/inputs/css/inputs.css',
  'component/component/buttons/css/buttons.css', 'component/component/dropdown/css/dropdown.css',
  'smart/smart/drawer/css/drawer.css', 'component/component/textarea/css/textarea.css',
  'smart/smart/popover/css/popover.css', 'component/component/icon-buttons/css/icon-buttons.css',
  'smart/smart/button-copy/css/button-copy.css', 'smart/smart/empty-state/css/empty-state.css',
  'component/component/featured-icon/css/featured-icon.css', 'component/component/skeleton/css/skeleton.css',
  'smart/smart/view-properties/css/view-properties.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/button-icon/js/button-icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js', 'smart/smart/input-textarea/js/input-textarea.js',
  'smart/smart/field-renderers/js/field-renderers.js', 'smart/smart/menu-context/js/menu-context.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/popover/js/popover.js', 'smart/smart/button-copy/js/button-copy.js',
  'smart/smart/empty-state/js/empty-state.js', 'smart/smart/view-properties/js/view-properties.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch({headless: true});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// The host's edition; PROBE_PORT_VERSION replays the probe against a copy that accepts an older one.
const version = process.env.PROBE_PORT_VERSION || '1.22.1';

// moved: how the host answers a save over a moved revision -- 'refused' (1.21.0) or 'conflict' (1.22.1).
const open = async ({capabilities, mode, moved}) => {
  const page = await browser.newPage({viewport: {width: 1200, height: 800}});
  const errors = [];
  page.on('pageerror', (error) => {
    if (!/Automatic publicPath/u.test(error.message)) errors.push(error.message);
  });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"><sf-view-properties id="v" collection="pages" mode="${mode}" full></sf-view-properties></body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-view-properties'), null, {timeout: 8000});
  await page.evaluate(({capabilities, moved, version}) => {
    const record = (revision, title, only) => ({record_id: 'record-1', collection: 'pages', revision, label: 'Запись',
      actions: ['record.edit'],
      sections: [{key: 'main', label: 'Основное', groups: [{key: 'about', label: 'О странице', fields: [
        {key: 'title', label: 'Название', propertyType: 'string', value: title}]}].map((group) => (only && group.key !== only
        ? {key: group.key, label: group.label, fields: [], field_count: 1} : group))}]});
    window.asked = [];
    // Another window saved: the record is at revision 9 and its title is «Другое».
    window.state = {revision: '8', title: 'A'};
    window.host = {
      version, capabilities,
      async raise(intent, payload) {
        window.asked.push(`${intent}${payload?.reason ? `/${payload.reason}` : ''}${payload?.revision !== undefined ? `@${payload.revision}` : ''}`);
        const state = window.state;
        if (intent === 'record.load') return {answer: 'applied', record: record(state.revision, state.title)};
        if (intent === 'group.load') {
          return {answer: 'applied', record: record(state.revision, state.title, payload.group ?? 'about'), group: payload.group ?? 'about', revision: state.revision};
        }
        if (intent === 'group.save' || intent === 'record.save') {
          if (payload.revision !== state.revision) {
            return {answer: moved, reason: 'revision_moved', revision: state.revision, message: 'Запись изменили в другом окне'};
          }
          state.revision = String(Number(state.revision) + 1);
          state.title = payload.values.title ?? state.title;
          return {answer: 'applied', record: record(state.revision, state.title), revision: state.revision};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    };
    const view = document.getElementById('v');
    view.setHostPort(window.host);
    view.setAttribute('record-id', 'record-1');
  }, {capabilities, moved, version});
  await page.waitForTimeout(700);
  return {page, errors};
};

const look = (page) => page.evaluate(() => {
  const view = document.getElementById('v');
  const input = view.querySelector('.sf-property-view-field[data-field="title"] input');
  return {
    asked: window.asked.splice(0),
    revision: view.record?.revision ?? null,
    input: input ? input.value : null,
    alert: [...view.querySelectorAll('.sf-property-view-conflict[role="alert"]')].map((node) => node.textContent.trim()),
    stored: window.state.title,
  };
});

const run = async ({capabilities, mode, moved, label}) => {
  const {page, errors} = await open({capabilities, mode, moved});
  await page.evaluate(() => { window.asked.length = 0; window.state.revision = '9'; window.state.title = 'Другое'; });
  if (mode !== 'edit') await page.locator('#v [data-action="edit"]').first().click();
  const input = page.locator('#v .sf-property-view-field[data-field="title"] input');
  await input.click();
  await input.fill('');
  await page.keyboard.type('Моё');
  await page.locator('#v [data-action="save"]').first().click();
  await page.waitForTimeout(700);
  const first = await look(page);
  const reread = capabilities.includes('group-load') ? 'group.load/requested' : 'record.load/requested';
  const save = mode === 'edit' ? 'record.save' : 'group.save';
  if (!same(first.asked, [`${save}@8`, reread]) || first.revision !== '9' || first.input !== 'Моё'
      || first.alert.length !== 1 || first.stored !== 'Другое') {
    note({case: `${label}: a save over a moved revision (${moved} revision_moved) says so, keeps the typed value and reads the record again`, got: first});
  }
  await page.locator('#v [data-action="save"]').first().click();
  await page.waitForTimeout(700);
  const second = await look(page);
  if (second.asked[0] !== `${save}@9` || second.stored !== 'Моё' || second.alert.length) {
    note({case: `${label}: the next save goes at the current revision and is applied`, got: second});
  }
  if (errors.length) note({case: `${label}: console clean`, got: errors});
  await page.close();
  return {first, second};
};

const results = [];
try {
  for (const moved of ['refused', 'conflict']) {
    results.push({moved, group: await run({capabilities: [], mode: 'auto', moved, label: `group save, ${moved}`})});
    results.push({moved, groupLoad: await run({capabilities: ['group-load'], mode: 'auto', moved, label: `group save with group-load, ${moved}`})});
    results.push({moved, all: await run({capabilities: [], mode: 'edit', moved, label: `whole-record save, ${moved}`})});
  }
} finally {
  await browser.close();
}

if (process.env.PROBE_DUMP) console.log(JSON.stringify(results, null, 2));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('PROPERTY_VIEW_REVISION_MOVED_OK');
