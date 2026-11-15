#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output [--theme light|dark]
// simai/ui-pro#3 and #4 (2026-10-26, sf-property-view, now sf-view-properties),
// measured on the built bytes with a stub host, in the light and the dark theme:
// #3
// - a host with group-load is asked group.load for the open group and never
//   record.load, and the answer it gives is one group's bytes, not the record's;
// - the element is loading (data-state, aria-busy) before any host is given;
// - with sections-as tabs at a wide window the skeleton draws the tab strip in
//   the box sf-tabs takes (its strip, hairline and empty panel), so the first
//   group stands where it stood in the skeleton once the record comes, at sizes
//   1 and 1/2 (red before sf-view-properties 1.13.2: a one-line strip, 24px
//   against the tabs' 73px);
// #4
// - an applied group.save sends sf-view-properties-saved once, a flat object
//   {id, revision} (decision «Event detail that is not a flat object»), bubbling
//   and composed, and its dated name sf-property-view-saved once; a conflict or a
//   refusal sends none;
// - a panel inserted hidden (or open=false) is not open; it opens when hidden
//   goes and closes when hidden comes back.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const themeAt = process.argv.indexOf('--theme');
const themes = themeAt === -1 ? ['light', 'dark'] : [process.argv[themeAt + 1]];
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/avatars/css/avatars.css',
  'component/component/reference-link/css/reference-link.css',
  'component/component/inputs/css/inputs.css', 'component/component/buttons/css/buttons.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'component/component/dropdown/css/dropdown.css', 'component/component/datepicker/css/datepicker.css',
  'component/component/tags/css/tags.css', 'component/component/textarea/css/textarea.css',
  'component/component/skeleton/css/skeleton.css',
  'component/component/tabs/css/tabs.css',
  'smart/smart/drawer/css/drawer.css', 'smart/smart/popover/css/popover.css',
  'smart/smart/empty-state/css/empty-state.css', 'component/component/featured-icon/css/featured-icon.css',
  'component/component/context-menu/css/context-menu.css',
  'smart/smart/view-properties/css/view-properties.css', 'smart/smart/sortable/css/sortable.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/input/js/input.js', 'smart/smart/button-icon/js/button-icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/button-copy/js/button-copy.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js', 'smart/smart/tag/js/tag.js',
  'smart/smart/input-date/js/input-date.js', 'smart/smart/input-textarea/js/input-textarea.js',
  'smart/smart/switch/js/switch.js', 'smart/smart/segmented/js/segmented.js', 'smart/smart/tabs/js/tabs.js',
  'smart/smart/field-renderers/js/field-renderers.js', 'smart/smart/sortable/js/sortable.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/popover/js/popover.js',
  'smart/smart/empty-state/js/empty-state.js',
  'smart/smart/view-properties/js/view-properties.js',
].map((p) => join(out, p));

const failures = [];
const results = {};
const note = (theme, detail) => failures.push({theme, ...detail});
const browser = await chromium.launch();

// The record of the stand: three sections, each one group of three fields.
const SECTIONS = ['main', 'contacts', 'legal'].map((key, at) => ({key, label: `Раздел ${at + 1}`,
  groups: [{key: `${key}-g`, label: `Группа ${at + 1}`, fields: [0, 1, 2].map((field) => ({
    key: `${key}-${field}`, label: `Поле ${at + 1}.${field + 1}`, propertyType: 'string', value: `значение ${'x'.repeat(200)}`}))}]}));

const open = async (theme, body) => {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  const errors = [];
  // Scripts added by path have no address for webpack's automatic publicPath;
  // that page error is the harness's, every other one is the component's.
  page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(`pageerror: ${error.message}`); });
  page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`); });
  await page.setContent(`<!doctype html><html class="theme-${theme}" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0;padding:24px">${body}</body></html>`);
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-view-properties')), null, {timeout: 10000});
  return {page, errors};
};

const installHost = (page, {capabilities, slow = 0}) => page.evaluate(({sections, capabilities, slow}) => {
  const record = (revision, only) => ({record_id: 'r1', collection: 'demo', revision, label: 'Запись', actions: ['record.edit'],
    sections: sections.map((section) => ({...section, groups: section.groups.map((group) => (only && group.key !== only
      ? {key: group.key, label: group.label, fields: [], field_count: group.fields.length} : group))}))});
  window.asked = [];
  window.answered = [];
  window.state = {revision: '7', next: 'applied'};
  window.host = {version: '1.15.0', capabilities, async raise(intent, payload) {
    window.asked.push(intent + (payload?.group !== undefined ? `:${payload.group}` : ''));
    if (slow) await new Promise((done) => setTimeout(done, slow));
    let answer = {answer: 'unavailable', reason: 'unknown-intent'};
    if (intent === 'record.load') answer = {answer: 'applied', record: record(window.state.revision)};
    if (intent === 'group.load') {
      const group = payload.group ?? 'main-g';
      answer = {answer: 'applied', record: record(window.state.revision, group), group, revision: window.state.revision};
    }
    if (intent === 'group.save') {
      if (window.state.next === 'conflict') answer = {answer: 'conflict', reason: 'revision', revision: window.state.revision};
      else if (window.state.next === 'refused') answer = {answer: 'refused', reason: 'access_denied'};
      else {
        window.state.revision = String(Number(window.state.revision) + 1);
        answer = {answer: 'applied', record: record(window.state.revision, capabilities.includes('group-load') ? payload.group : null), revision: window.state.revision};
      }
    }
    window.answered.push({intent, bytes: JSON.stringify(answer).length});
    return answer;
  }};
}, {sections: SECTIONS, capabilities, slow});

try {
  for (const theme of themes) {
    const seen = results[theme] = {};

    // #3.1: one group read, not the record.
    {
      const {page, errors} = await open(theme, '<sf-view-properties id="v" collection="demo"></sf-view-properties>');
      const born = await page.evaluate(() => {
        const view = document.getElementById('v');
        return {state: view.getAttribute('data-state'), busy: view.getAttribute('aria-busy')};
      });
      seen.born = born;
      if (born.state !== 'loading' || born.busy !== 'true') note(theme, {case: '#3: loading before any host is given', got: born});
      await installHost(page, {capabilities: ['group-load']});
      await page.evaluate(() => { const view = document.getElementById('v'); view.setHostPort(window.host); view.setAttribute('record-id', 'r1'); });
      await page.waitForTimeout(700);
      const grouped = await page.evaluate(() => ({asked: [...window.asked], bytes: window.answered.map((one) => one.bytes),
        fields: document.querySelectorAll('#v .sf-property-view-field').length}));
      await installHost(page, {capabilities: []});
      await page.evaluate(() => { const view = document.getElementById('v'); view.setHostPort(window.host); return view.load('probe'); });
      await page.waitForTimeout(500);
      const whole = await page.evaluate(() => ({asked: [...window.asked], bytes: window.answered.map((one) => one.bytes)}));
      seen.groupLoad = {grouped, whole};
      if (grouped.asked.join() !== 'group.load:null' || grouped.fields !== 3) note(theme, {case: '#3: group-load reads the open group only', got: grouped});
      if (!(grouped.bytes[0] < whole.bytes[0] / 2)) note(theme, {case: '#3: the first read is one group\'s bytes', got: {grouped, whole}});
      if (errors.length) note(theme, {case: 'console clean (group-load)', got: errors});
      await page.close();
    }

    // #3.2: the tab strip in the skeleton, in the box the tabs take: nothing
    // moves when the record comes, at either size.
    for (const size of ['1', '1/2']) {
      const {page, errors} = await open(theme, `<div style="inline-size:900px"><sf-view-properties id="v" collection="demo" sections-as="tabs" size="${size}"></sf-view-properties></div>`);
      await installHost(page, {capabilities: [], slow: 900});
      const box = () => page.evaluate(() => {
        const view = document.getElementById('v');
        const strip = view.querySelector('.sf-property-view-tabs--skeleton');
        const tabs = view.querySelector('sf-tabs > .sf-tabs');
        const group = view.querySelector('.sf-property-view-group');
        const rect = (node) => node.getBoundingClientRect();
        return {state: view.getAttribute('data-state'),
          strip: strip ? {display: getComputedStyle(strip).display, height: Math.round(rect(strip).height)} : null,
          tabs: tabs ? {height: Math.round(rect(tabs).height)} : null,
          groupTop: group ? Math.round(rect(group).top) : null, groupLeft: group ? Math.round(rect(group).left) : null};
      });
      await page.evaluate(() => { const view = document.getElementById('v'); view.setHostPort(window.host); view.setAttribute('record-id', 'r1'); });
      await page.waitForTimeout(300);
      const loading = await box();
      await page.waitForTimeout(1200);
      const loaded = await box();
      seen[`skeleton ${size}`] = {loading, loaded};
      if (loading.state !== 'loading' || !loading.strip || loading.strip.display === 'none' || !loading.strip.height) {
        note(theme, {case: `#3: the skeleton draws the tab strip (size ${size})`, got: loading});
      }
      if (loaded.state !== 'ready' || !loaded.tabs) note(theme, {case: `#3: the record came with its tabs (size ${size})`, got: loaded});
      if (loading.strip?.height !== loaded.tabs?.height || loading.groupTop !== loaded.groupTop || loading.groupLeft !== loaded.groupLeft) {
        note(theme, {case: `#3: the skeleton's strip is the tabs' box and the first group does not move (size ${size})`, got: {loading, loaded}});
      }
      if (errors.length) note(theme, {case: `console clean (skeleton ${size})`, got: errors});
      await page.close();
    }

    // #4.1: the saved fact.
    {
      const {page, errors} = await open(theme, '<div id="frame"><sf-view-properties id="v" collection="demo" record-id="r1"></sf-view-properties></div>');
      await installHost(page, {capabilities: []});
      await page.evaluate(() => {
        window.facts = [];
        for (const name of ['sf-view-properties-saved', 'sf-property-view-saved']) {
          document.getElementById('frame').addEventListener(name, (event) => window.facts.push({name, detail: event.detail,
            bubbles: event.bubbles, composed: event.composed}));
        }
        document.getElementById('v').setHostPort(window.host);
      });
      await page.waitForTimeout(600);
      const save = (next, value) => page.evaluate(async ({next, value}) => {
        window.state.next = next;
        window.facts.length = 0;
        const view = document.getElementById('v');
        view.editGroup('main', 'main-g');
        view.changeField({key: 'main-0', propertyType: 'string', value: 'x'}, value);
        await view.saveGroup();
        await new Promise((done) => setTimeout(done, 200));
        const facts = [...window.facts];
        view.cancelGroup?.();
        return facts;
      }, {next, value});
      const applied = await save('applied', 'B');
      const conflict = await save('conflict', 'C');
      const refused = await save('refused', 'D');
      seen.saved = {applied, conflict: conflict.length, refused: refused.length};
      const fact = applied.find((one) => one.name === 'sf-view-properties-saved');
      const flat = fact && fact.detail && typeof fact.detail === 'object' && !Array.isArray(fact.detail)
        && Object.keys(fact.detail).sort().join() === 'id,revision'
        && Object.values(fact.detail).every((value) => typeof value === 'string');
      if (applied.filter((one) => one.name === 'sf-view-properties-saved').length !== 1 || !flat
          || fact.detail.id !== 'r1' || fact.detail.revision !== '8' || !fact.bubbles || !fact.composed) {
        note(theme, {case: '#4: an applied save sends sf-view-properties-saved {id, revision} once', got: applied});
      }
      if (applied.filter((one) => one.name === 'sf-property-view-saved').length !== 1) note(theme, {case: '#4: the dated name follows once', got: applied});
      if (conflict.length || refused.length) note(theme, {case: '#4: no saved fact without an applied save', got: {conflict, refused}});
      if (errors.length) note(theme, {case: 'console clean (saved)', got: errors});
      await page.close();
    }

    // #4.2: a panel inserted hidden stays closed; hidden and open=false are honoured.
    {
      const {page, errors} = await open(theme, '<main id="page">Список</main>');
      await installHost(page, {capabilities: []});
      const panelState = () => page.evaluate(() => {
        const panel = document.querySelector('.sf-property-view-panel')?.closest('.sf-drawer-panel');
        const drawer = panel?.closest('sf-drawer') ?? document.querySelector('sf-drawer');
        return {drawerOpen: drawer ? drawer.hasAttribute('open') : null,
          visibility: panel ? getComputedStyle(panel).visibility : null,
          box: panel ? Math.round(panel.getBoundingClientRect().left) : null};
      });
      const visible = (state) => state.drawerOpen === true && state.visibility === 'visible' && state.box < 1280;
      await page.evaluate(() => {
        const view = document.createElement('sf-view-properties');
        view.id = 'p';
        view.setAttribute('collection', 'demo');
        view.setAttribute('panel', '');
        view.hidden = true;
        view.setHostPort(window.host);
        view.setAttribute('record-id', 'r1');
        document.body.append(view);
      });
      await page.waitForTimeout(800);
      const inserted = await panelState();
      await page.evaluate(() => { document.getElementById('p').hidden = false; });
      await page.waitForTimeout(800);
      const shown = await panelState();
      await page.evaluate(() => { document.getElementById('p').hidden = true; });
      await page.waitForTimeout(800);
      const hidden = await panelState();
      await page.evaluate(() => { const view = document.getElementById('p'); view.hidden = false; view.setAttribute('open', 'false'); });
      await page.waitForTimeout(800);
      const closedByOpen = await panelState();
      seen.panel = {inserted, shown, hidden, closedByOpen};
      if (visible(inserted)) note(theme, {case: '#4: a panel inserted hidden is not open', got: inserted});
      if (!visible(shown)) note(theme, {case: '#4: the panel opens when hidden goes', got: shown});
      if (visible(hidden)) note(theme, {case: '#4: hidden closes the panel', got: hidden});
      if (visible(closedByOpen)) note(theme, {case: '#4: open=false closes the panel', got: closedByOpen});
      if (errors.length) note(theme, {case: 'console clean (panel)', got: errors});
      await page.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results));
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('PROPERTY_VIEW_PRO_ISSUES_3_4_OK');
