#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Build output root is required: the free output with the package laid into
// smart/smart (scripts/run-browser-probes.mjs makes it).
//
// The controls sf-view-properties draws follow page density (C22, the pro
// patch of 2026-11-10 ahead of simai/ui-view, as sf-view and sf-view-table do
// since view 1.6.0): a panel without a size writes no size on its buttons and
// tabs, so compact page density (data-sf-density="compact", desktop) moves
// them a rung down with the page -- --sf-ui-1--control-height reads 32 there --
// and normal density keeps 40. A panel with a size keeps the rung it set:
// size="1" 40 and size="1/2" 32 under either density. Measured on the open-all
// bar (Save, Cancel) and the section tabs of an edit surface, light and dark,
// 1280, clean console; every height is compared with the page's own ladder.
import {join, resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/inputs/css/inputs.css',
  'component/component/buttons/css/buttons.css', 'component/component/icon-buttons/css/icon-buttons.css',
  'component/component/dropdown/css/dropdown.css', 'component/component/skeleton/css/skeleton.css',
  // smart/smart/tabs ships no sheet of its own since ui-7fb26d395af2.
  'component/component/tabs/css/tabs.css',
  'smart/smart/drawer/css/drawer.css', 'smart/smart/popover/css/popover.css',
  'smart/smart/empty-state/css/empty-state.css', 'component/component/context-menu/css/context-menu.css',
  'smart/smart/view-properties/css/view-properties.css', 'smart/smart/sortable/css/sortable.css',
].map((path) => join(out, path));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/button-icon/js/button-icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/button-copy/js/button-copy.js', 'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js', 'smart/smart/drawer/js/drawer.js',
  'smart/smart/switch/js/switch.js', 'smart/smart/segmented/js/segmented.js', 'smart/smart/tabs/js/tabs.js',
  'smart/smart/field-renderers/js/field-renderers.js', 'smart/smart/sortable/js/sortable.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/popover/js/popover.js',
  'smart/smart/empty-state/js/empty-state.js', 'smart/smart/view-properties/js/view-properties.js',
].map((path) => join(out, path));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.slice(0, 3).join(', ')}`);

const SECTIONS = ['main', 'contacts'].map((key, at) => ({key, label: `Раздел ${at + 1}`,
  groups: [{key: `${key}-g`, label: `Группа ${at + 1}`, fields: [0, 1].map((field) => ({
    key: `${key}-${field}`, label: `Поле ${at + 1}.${field + 1}`, propertyType: 'string', value: `значение ${field}`}))}]}));
const HOSTS = [{id: 'none', size: ''}, {id: 'one', size: '1'}, {id: 'half', size: '1/2'}];

const failures = [];
const report = {};
const browser = await chromium.launch();
try {
  const normal = {};
  for (const theme of ['light', 'dark']) for (const density of ['normal', 'compact']) {
    const key = `${theme}-${density}`;
    const note = (detail) => failures.push({stand: key, ...detail});
    const page = await browser.newPage({viewport: {width: 1280, height: 1400}});
    await page.emulateMedia({colorScheme: theme});
    const errors = [];
    page.on('console', (message) => { if (message.type() === 'error' && !/publicPath/u.test(message.text())) errors.push(message.text()); });
    page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(error.message); });
    const stands = HOSTS.map(({id, size}) => `<section data-host="${id}" style="inline-size:900px;margin-block-end:24px">
        <sf-view-properties id="p-${id}"${size ? ` size="${size}"` : ''} collection="demo" mode="edit" sections-as="tabs"></sf-view-properties>
      </section>`).join('');
    await page.setContent(`<!doctype html><html class="theme-${theme}" lang="ru"${density === 'compact' ? ' data-sf-density="compact"' : ''}><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:var(--sf-surface-page)">${stands}</body></html>`);
    for (const path of styles) await page.addStyleTag({path});
    for (const path of modules) await page.addScriptTag({path, type: 'module'});
    await page.waitForFunction(() => Boolean(customElements.get('sf-view-properties') && customElements.get('sf-button') && customElements.get('sf-tabs')), null, {timeout: 10000});
    await page.evaluate((sections) => {
      const record = {record_id: 'r1', collection: 'demo', revision: '1', label: 'Запись', actions: ['record.edit'], sections};
      for (const view of document.querySelectorAll('sf-view-properties')) {
        view.setHostPort({version: '1.15.0', capabilities: [], async raise(intent) {
          if (intent === 'record.load') return {answer: 'applied', record};
          return {answer: 'unavailable', reason: 'unknown-intent'};
        }});
        view.setAttribute('record-id', 'r1');
      }
    }, SECTIONS);
    await page.waitForFunction(() => document.querySelectorAll('sf-view-properties [data-action="save"] > button').length === 3, null, {timeout: 8000}).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    const m = await page.evaluate((hosts) => {
      const probe = document.createElement('div');
      document.body.append(probe);
      const length = (name) => { probe.style.blockSize = `var(${name})`; return probe.getBoundingClientRect().height; };
      const height = (element) => Math.round(element.getBoundingClientRect().height * 100) / 100;
      const shown = (element) => element.getBoundingClientRect().width > 0;
      const result = {ladder: {one: length('--sf-ui-1--control-height'), half: length('--sf-ui-1\\/2--control-height')}, hosts: {}};
      for (const {id} of hosts) {
        const view = document.getElementById(`p-${id}`);
        const controls = (selector) => [...view.querySelectorAll(selector)].filter(shown).map((element) => ({
          what: element.closest('[data-action]')?.getAttribute('data-action') || element.textContent.trim().slice(0, 20),
          height: height(element), size: element.closest('sf-button, sf-button-icon, sf-tabs')?.getAttribute('size') ?? null}));
        result.hosts[id] = {
          bar: controls('.sf-property-view-actions :is(sf-button, sf-button-icon) > button'),
          tabs: controls('sf-tabs [role="tab"]'),
          tabsSize: view.querySelector('sf-tabs')?.getAttribute('size') ?? null,
        };
      }
      probe.remove();
      return result;
    }, HOSTS);
    m.errors = errors;
    report[key] = m;
    if (density === 'normal') normal[theme] = m.ladder;
    for (const {id, size} of HOSTS) {
      const want = id === 'none' ? m.ladder.one : (id === 'half' ? normal[theme].half : normal[theme].one);
      const host = m.hosts[id];
      if (!host.bar.length) note({host: id, group: 'bar', said: 'no control found'});
      for (const control of host.bar) if (control.height !== want) note({host: id, group: 'bar', said: 'a control is not its rung', control, want, ladder: m.ladder});
      if (!host.tabs.length) note({host: id, group: 'tabs', said: 'no tab found'});
      if ((host.tabsSize ?? '') !== size) note({host: id, group: 'tabs', said: 'the tabs do not carry the host size, or carry one the host has not', got: host.tabsSize});
      for (const control of host.bar) if ((control.size ?? '') !== size) note({host: id, group: 'bar', said: 'a control does not carry the host size, or carries one the host has not', control});
    }
    // The tabs of a panel with no size are the page's: one height for every
    // tab, smaller under compact than the same stand under normal density.
    if (density === 'compact') {
      const tab = (stand, id) => report[stand]?.hosts[id]?.tabs[0]?.height;
      const normalTab = tab(`${theme}-normal`, 'none');
      const compactTab = tab(key, 'none');
      if (!(compactTab < normalTab)) note({host: 'none', group: 'tabs', said: 'the tabs do not follow compact density', normalTab, compactTab});
      if (tab(key, 'one') !== tab(`${theme}-normal`, 'one')) note({host: 'one', group: 'tabs', said: 'size 1 tabs move with density', got: [tab(`${theme}-normal`, 'one'), tab(key, 'one')]});
    }
    if (density === 'compact' && m.ladder.one !== 32) note({said: 'compact density does not move --sf-ui-1--control-height to 32 at 1280', ladder: m.ladder});
    if (density === 'normal' && m.ladder.one !== 40) note({said: 'normal density is not 40 at 1280', ladder: m.ladder});
    if (errors.length) note({said: 'the console is not clean', errors});
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({probe: 'property-view-density-controls', result: failures.length ? 'PROPERTY_VIEW_DENSITY_CONTROLS_FAIL' : 'PROPERTY_VIEW_DENSITY_CONTROLS_OK', failures, report}, null, 1));
if (failures.length) process.exitCode = 1;
