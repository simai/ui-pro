#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The record panel's width (DEV decision msg-6aead3f3, A9; sf-view-properties 1.24.0 over sf-drawer 1.20.0): the
// drawer's ladder step measures the fields and the column of sections is added on top of it through aside-width,
// never taken from it; when the step and the column would pass 60 percent of the window the sections are tabs on top
// and the panel is the plain step. A column of sections never holds a folded, horizontal row of tabs (VR11-1, the
// view set's defect: its column was sf-tabs and folded inside the panel). The favourite star is the Framework's
// toggle (C393): a real click flips aria-pressed on the native button; the title stays on one line with the star
// right after it. 1440, 1024 and 390 px, light and dark, panel sizes 1 and 2; the console stays clean.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/inputs/css/inputs.css',
  'component/component/buttons/css/buttons.css', 'component/component/icon-buttons/css/icon-buttons.css',
  'component/component/icons/css/icons.css', 'component/component/tree/css/tree.css',
  'component/component/dropdown/css/dropdown.css', 'component/component/skeleton/css/skeleton.css',
  'component/component/tabs/css/tabs.css', 'component/component/context-menu/css/context-menu.css',
  'smart/smart/drawer/css/drawer.css', 'smart/smart/popover/css/popover.css',
  'smart/smart/view-properties/css/view-properties.css', 'smart/smart/sortable/css/sortable.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/button/js/button.js', 'smart/smart/button-icon/js/button-icon.js', 'smart/smart/button-copy/js/button-copy.js',
  'smart/smart/input/js/input.js', 'smart/smart/switch/js/switch.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/segmented/js/segmented.js', 'smart/smart/menu-context/js/menu-context.js',
  'smart/smart/tree/js/tree.js', 'smart/smart/tree-item/js/tree-item.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js', 'smart/smart/tabs/js/tabs.js', 'smart/smart/field-renderers/js/field-renderers.js',
  'smart/smart/sortable/js/sortable.js', 'smart/smart/popover/js/popover.js', 'smart/smart/view-properties/js/view-properties.js',
].map((p) => join(out, p));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.slice(0, 3).join(', ')}`);

const record = {record_id: 'r1', collection: 'pages', revision: '3',
  sections: ['Основное', 'Контакты', 'Реквизиты', 'История'].map((name, at) => ({key: `s${at}`, label: name,
    groups: [{key: `g${at}`, label: `Группа ${at + 1}`, columns: 2, fields: [0, 1, 2].map((f) => ({
      key: `f${at}${f}`, label: `Поле ${f + 1}`, propertyType: 'string', value: `значение ${at}.${f}`}))}]}))};
const STEP = {'1': '--sf-measure-52', '2': '--sf-measure-64'};
const failures = [];
const measured = [];
const browser = await chromium.launch({headless: true});
try {
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]]) for (const theme of ['light', 'dark']) for (const size of ['1', '2']) {
    const note = (detail) => failures.push({width, theme, size, ...detail});
    const page = await browser.newPage({viewport: {width, height}});
    const errors = [];
    // Scripts added by path have no address for webpack's automatic publicPath; that page error is the harness's.
    page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(`pageerror: ${error.message}`); });
    page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`); });
    await page.setContent(`<!doctype html><html class="theme-${theme}" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0">`
      + `<sf-view-properties id="pv" panel panel-size="${size}" record-id="r1" collection="pages"`
      + ' panel-label="Договор поставки оборудования для северного филиала № 2026-118"></sf-view-properties></body></html>');
    for (const path of styles) await page.addStyleTag({path}).catch(() => {});
    for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
    await page.waitForFunction(() => ['sf-view-properties', 'sf-drawer', 'sf-button-icon', 'sf-tree', 'sf-tabs'].every((tag) => customElements.get(tag)), null, {timeout: 15000});
    await page.evaluate(async (payload) => {
      const view = document.getElementById('pv');
      view.setHostPort({version: '1.8.0', capabilities: [], async raise(intent) {
        if (intent === 'record.load') return {answer: 'applied', record: payload};
        return {answer: 'applied'};
      }});
      for (let tries = 0; tries < 80 && !view.sections?.length; tries += 1) await new Promise((done) => setTimeout(done, 50));
    }, record);
    await page.waitForTimeout(900);
    const read = () => page.evaluate((stepVar) => {
      const view = document.getElementById('pv');
      const content = view.panelContent();
      const shell = content.closest('[data-sf-drawer-root]') ?? document;
      const width = (node) => (node ? Math.round(node.getBoundingClientRect().width) : 0);
      const box = (node) => { const r = node?.getBoundingClientRect(); return r ? {left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height)} : null; };
      const probe = document.createElement('div');
      probe.style.cssText = `position: absolute; visibility: hidden; inline-size: var(${stepVar});`;
      document.body.append(probe);
      const step = width(probe);
      probe.remove();
      const rail = content.querySelector('.sf-property-view-sections');
      const title = content.querySelector('.sf-property-view-title');
      const star = content.querySelector('[data-action=favourite]');
      return {
        wide: view.wide, step,
        layout: content.querySelector('.sf-property-view-layout')?.getAttribute('data-sections-layout') ?? null,
        aside: shell.closest('sf-drawer')?.getAttribute('aside-width') ?? document.querySelector('sf-drawer')?.getAttribute('aside-width') ?? null,
        panel: width(shell.querySelector('.sf-drawer-panel')), rail: width(rail),
        columnTablists: rail ? [...rail.querySelectorAll('[role=tablist]')].map((list) => list.getAttribute('aria-orientation') || 'horizontal') : [],
        tabsOnTop: Boolean(content.querySelector('.sf-property-view-tabs:not(.sf-property-view-tabs--skeleton) [role=tablist]')),
        title: title ? {...box(title), line: Math.round(Number.parseFloat(getComputedStyle(title).lineHeight))} : null,
        star: star ? {...box(star), look: star.closest('sf-button-icon')?.getAttribute('appearance') ?? null, pressed: star.getAttribute('aria-pressed')} : null,
      };
    }, STEP[size]);
    const seen = await read();
    await page.locator('.sf-property-view-title-row [data-action=favourite]').first().click();
    await page.waitForTimeout(250);
    const pressed = (await read()).star?.pressed;
    measured.push({width, theme, size, seen, pressedAfterClick: pressed});
    await page.close();

    if (seen.layout === 'column' && seen.columnTablists.some((orientation) => orientation !== 'vertical')) {
      note({case: 'a column of sections never holds a folded, horizontal row of tabs (VR11-1)', got: seen.columnTablists});
    }
    if (seen.wide && seen.layout === 'column') {
      // The fields keep the whole step: the panel is the step and the column beside it, never less.
      if (!seen.aside) note({case: 'the column is announced to the drawer as aside-width', got: seen.aside});
      if (seen.panel - seen.rail < seen.step - 1) note({case: 'the column is added on top of the step, not taken from it', got: seen});
      if (seen.panel > width * 0.6 + 1) note({case: 'a column only while the panel stays within 60 percent of the window', got: seen});
    }
    if (seen.wide && seen.layout === 'tabs') {
      if (seen.aside) note({case: 'tabs on top: the drawer is asked for no column', got: seen.aside});
      if (Math.abs(seen.panel - seen.step) > 1) note({case: 'tabs on top: the panel is the plain step', got: seen});
      if (!seen.tabsOnTop) note({case: 'tabs on top are drawn', got: seen});
    }
    if (width === 1440 && seen.layout !== 'column') note({case: 'at 1440 the sections are a column beside the fields', got: seen.layout});
    if (width === 1024 && seen.layout !== 'tabs') note({case: 'at 1024 step and column pass 60 percent: tabs on top', got: seen.layout});
    if (!seen.star || seen.star.look !== 'toggle') note({case: 'the favourite star is the toggle (C393)', got: seen.star});
    else if (seen.star.pressed !== 'false' || pressed !== 'true') note({case: 'a click on the star presses it', got: [seen.star.pressed, pressed]});
    if (seen.title && seen.title.height > seen.title.line + 1) note({case: 'the title is one line', got: seen.title});
    if (seen.title && seen.star && seen.star.left < seen.title.right - 1) note({case: 'the star stands right after the title', got: {title: seen.title, star: seen.star}});
    if (errors.length) note({case: 'the console stays clean', got: errors});
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(JSON.stringify({failures, measured}, null, 1));
  process.exit(1);
}
console.log(JSON.stringify({ok: true, measured: measured.length}));
