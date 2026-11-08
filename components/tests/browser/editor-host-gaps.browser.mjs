#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-editor 1.1.0 on the built bytes: the defects the ui-editor host found
// with sf-editor 1.0.x (ui-editor docs/GAPS.md, G-22 and G-24 to G-38, the
// one-editor scenarios of scripts/e2e-one-editor.mjs), each driven by a real
// pointer and keyboard as the host's driver does:
// - G-27 after «Edit template» the editor still draws, and a page the host
//   sets later is drawn;
// - G-28 the first press of «Output» opens the dialog while sf-modal is still
//   being fetched;
// - G-29 refused classes are named, by reason;
// - G-35 the bar wraps at 390 and 320 px: the page never scrolls sideways;
// - G-31 landmarks, heading order, options without controls inside, a heading
//   being typed keeps its role, locked parts inactive, origin and catalogue
//   notes readable in the dark theme (and, with AXE_CORE=<axe.min.js>, axe-core
//   itself finds nothing in each state);
// - G-22 a phone value equal to the type's default keeps the desktop's;
// - G-33 «Split into columns» from the grip menu is one undo;
// - G-34 a library card dropped at a block's side stands beside it, and inside
//   a column adds a column;
// - G-30 ↓ with nothing chosen chooses the first open block, then the next;
// - G-32 the gutter never covers the start of a line;
// - G-24 an empty named place draws its prompt and is its own +;
// - G-36 a phone value equal to the type's default is printed (and drawn)
//   when a wider screen differs: grid-col-1 md:grid-col-2;
// - G-37 the + catalogue and the grip menu open beside their button, never at
//   the window's corner (the sf-button-icon host has no box);
// - G-38 «Make a site block» on a chosen section its hero fills keeps the
//   section, and the section's own parameters can be exposed.
import {resolve, join} from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const parts = ['icon', 'button', 'button-icon', 'button-group', 'tabs', 'input', 'dropdown', 'switch', 'skeleton', 'menu-context', 'modal', 'editor-inline'];
const sheets = ['buttons', 'icon-buttons', 'button-group', 'inputs', 'dropdown', 'switch', 'skeleton', 'modal', 'menu', 'context-menu', 'tabs', 'tab', 'icons']
  .map((name) => `component/component/${name}/css/${name}.css`).filter((path) => existsSync(join(out, path)));
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css', ...sheets,
  ...parts.map((name) => `smart/smart/${name}/css/${name}.css`).filter((path) => existsSync(join(out, path))),
  'smart/smart/editor/css/editor.css',
].map((path) => join(out, path));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  ...parts.map((name) => `smart/smart/${name}/js/${name}.js`),
  'smart/smart/editor/js/editor.js',
].map((path) => join(out, path));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.join(', ')}`);
// axe-core is not a dependency of this package: a run that has it names it.
const axeSource = process.env.AXE_CORE && existsSync(process.env.AXE_CORE) ? readFileSync(process.env.AXE_CORE, 'utf8') : null;

const t = (value) => [{type: 'text', value}];
const page = (id, {main = [], header = 'Site name', footer = 'Footer line'} = {}) => ({
  schema: 'simai.composition.document', schema_version: 1, id, profile: 'ui-layout', locale: 'en',
  root: {id: 'regs', type: 'layout.regions', slots: {regions: [
    {id: 'hd', type: 'layout.region', props: {name: 'header', landmark: 'banner'}, slots: {default: [{id: 'logo', type: 'content.paragraph', data: {content: t(header)}}]}},
    {id: 'mn', type: 'layout.region', props: {name: 'main', landmark: 'main'}, slots: {default: main}},
    {id: 'ft', type: 'layout.region', props: {name: 'footer', landmark: 'contentinfo'}, slots: {default: [{id: 'copy', type: 'content.paragraph', data: {content: t(footer)}}]}},
  ]}},
});
const HOME = page('home', {main: [
  {id: 's1', type: 'layout.section', props: {width: 'normal'}, slots: {default: [
    {id: 'a1', type: 'layout.area', slots: {default: [
      {id: 'h1', type: 'content.heading', data: {level: 1, content: t('Title of the page')}},
      {id: 'p1', type: 'content.paragraph', data: {content: t('First paragraph of the page')}},
      {id: 'p2', type: 'content.paragraph', data: {content: t('Second paragraph of the page')}},
    ]}},
  ]}},
  {id: 's2', type: 'layout.section', props: {width: 'normal'}, slots: {default: [
    {id: 'c1', type: 'layout.columns', props: {columns: {xs: 2}}, slots: {columns: [
      {id: 'k1', type: 'layout.area', slots: {default: [{id: 'q1', type: 'content.paragraph', data: {content: t('Left column')}}]}},
      {id: 'k2', type: 'layout.area', slots: {default: [{id: 'q2', type: 'content.paragraph', data: {content: t('Right column')}}]}},
    ]}},
  ]}},
]});
const ABOUT = page('about', {main: [{id: 'b1', type: 'layout.section', slots: {default: [
  {id: 'ba', type: 'layout.area', slots: {default: [{id: 'bp', type: 'content.paragraph', data: {content: t('About the company')}}]}},
]}}]});
// A full-width section: its text starts at the frame's edge, with no margin of its own.
const EDGE = page('edge', {main: [{id: 'e1', type: 'layout.section', slots: {default: [
  {id: 'ea', type: 'layout.area', slots: {default: [{id: 'ep', type: 'content.paragraph', data: {content: t('A line at the very edge of the page')}}]}},
]}}]});
// A host block with a named place, as ui-editor's split hero: the renderer marks the place.
const SPLIT = {
  schema: 'simai.composition.type-manifest', schema_version: 1, type: 'probe.split', version: '1.0.0',
  category: 'content', mode: 'composite', profiles: ['ui-layout'],
  data_schema: {type: 'object', additionalProperties: false, properties: {}},
  props_schema: {type: 'object', additionalProperties: false, properties: {}},
  presentation: {views: ['default'], presets: [], modifiers: []},
  slots: {
    default: {min: 0, max: 20, categories: ['content'], groups: ['text'], label_key: 'probe.split.text'},
    media: {min: 0, max: 1, categories: ['content'], groups: ['media'], label_key: 'probe.split.media', empty_key: 'probe.split.media_empty'},
  },
  renderer: {kind: 'registered', name: 'probe.split'},
  capabilities: ['html'],
  catalogue: {group: 'marketing', label_key: 'probe.split.name'},
};
const SPLIT_PAGE = page('split', {main: [{id: 'x1', type: 'layout.section', props: {width: 'normal'}, slots: {default: [
  {id: 'xa', type: 'layout.area', slots: {default: [
    {id: 'hero', type: 'probe.split', slots: {default: [{id: 'hp', type: 'content.paragraph', data: {content: t('Hero text')}}], media: []}},
  ]}},
]}}]});

const failures = [];
const check = (label, condition, got) => { if (!condition) failures.push({case: label, got}); };
const browser = await chromium.launch();
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const END = MOD === 'Meta' ? 'Meta+ArrowRight' : 'End';

/** A page with sf-editor; `defer` names parts whose script comes only when the probe adds it (a lazy part being fetched). */
async function open({doc = HOME, lang = 'en', viewport = {width: 1400, height: 900}, theme = 'light', defer = [], host = null} = {}) {
  const tab = await browser.newPage({viewport, colorScheme: theme});
  tab.errors = [];
  tab.on('pageerror', (error) => { if (!/Automatic publicPath/u.test(error.message)) tab.errors.push(error.message); });
  tab.on('console', (message) => { if (message.type() === 'error' && /TypeError|insertBefore/u.test(message.text())) tab.errors.push(message.text().split('\n')[0]); });
  const markup = `<!doctype html><html class="theme-${theme}" lang="${lang}"><head><meta charset="utf-8"><title>sf-editor</title></head><body style="margin:0;height:100vh"><div id="box" style="height:100vh"></div></body></html>`;
  await tab.route('https://editor.probe/**', (route) => route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: markup}));
  await tab.goto('https://editor.probe/');
  for (const style of styles) await tab.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) if (!defer.some((name) => module.endsWith(`/${name}/js/${name}.js`))) await tab.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await tab.waitForFunction(() => Boolean(customElements.get('sf-editor')));
  await tab.evaluate(({doc, host}) => {
    window.changes = [];
    const editor = document.createElement('sf-editor');
    editor.id = 'editor';
    editor.addEventListener('change', (event) => window.changes.push({reason: event.detail.reason, scope: event.detail.scope, document: event.detail.document}));
    if (host) {
      editor.types = host.types;
      editor.words = host.words;
      // The host's renderer: its named place is marked for the editor.
      editor.renderers = {'probe.split': ({node, slots}) => `<div class="grid md:grid-col-2 gap-4" data-sf-composition-id="${node.id}"><div>${slots.default ?? ''}</div><div class="probe-media" data-sf-composition-slot="media">${slots.media ?? ''}</div></div>`};
    }
    editor.document = doc;
    editor.theme = {name: 'brand', label: 'Brand', defaults: {}};
    document.getElementById('box').append(editor);
  }, {doc, host});
  await tab.waitForSelector('#editor .sf-editor-page [data-sf-composition-id]', {timeout: 10000});
  await tab.waitForTimeout(300);
  return tab;
}
const model = (tab) => tab.evaluate(() => {
  const editor = document.getElementById('editor');
  return {selected: editor.model.selected, typing: editor.model.typing?.id ?? null, doc: editor.model.toJSON()};
});
const find = (root, id) => {
  if (!root) return null;
  if (root.id === id) return root;
  for (const list of Object.values(root.slots ?? {})) for (const child of list) { const hit = find(child, id); if (hit) return hit; }
  return null;
};
const parentOf = (root, id, parent = null) => {
  if (!root) return null;
  if (root.id === id) return parent;
  for (const list of Object.values(root.slots ?? {})) for (const child of list) { const hit = parentOf(child, id, root); if (hit) return hit; }
  return null;
};
const box = (tab, id) => tab.locator(`#editor [data-sf-composition-id="${id}"]`).first().boundingBox();
const settle = (tab, ms = 200) => tab.waitForTimeout(ms);
const scenario = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push({case: `${name}: the scenario finished`, got: String(error.stack ?? error).split('\n').slice(0, 3).join(' ')});
  }
};
/** Hover a block: its gutter (+ and grip) stands beside it. */
const hover = async (tab, id) => {
  const at = await box(tab, id);
  await tab.mouse.move(at.x + at.width / 2, at.y + Math.min(10, at.height / 2), {steps: 3});
  await settle(tab, 150);
};
/** Pull a library card onto a block's left or right edge and let go. */
const libraryDrag = async (tab, query, item, target, side) => {
  await tab.locator('#editor .sf-editor-search input').fill(query);
  await settle(tab);
  const card = await tab.locator(`#editor .sf-editor-left [data-item="${item}"]`).first().boundingBox();
  const at = await box(tab, target);
  const x = side === 'left' ? at.x + Math.min(20, at.width * 0.08) : at.x + at.width - Math.min(20, at.width * 0.08);
  await tab.mouse.move(card.x + 20, card.y + 20);
  await tab.mouse.down();
  await tab.mouse.move(card.x + 30, card.y + 30, {steps: 3});
  await tab.mouse.move(x, at.y + at.height / 2, {steps: 8});
  await settle(tab, 120);
  const line = await tab.evaluate(() => document.querySelector('#editor .sf-editor-drop')?.dataset.edge ?? null);
  await tab.mouse.up();
  await settle(tab, 300);
  await tab.locator('#editor .sf-editor-search input').fill('');
  return line;
};
/** WCAG contrast of an element's text on what is drawn behind it (its own background or an ancestor's). */
const contrastOf = (tab, selector) => tab.evaluate((selector) => {
  const parse = (value) => (value.match(/[\d.]+/gu) ?? []).map(Number);
  const luminance = ([r, g, b]) => {
    const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  return [...document.querySelectorAll(selector)].map((element) => {
    let back = null;
    for (let node = element; node && !back; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color.length >= 3 && (color[3] ?? 1) === 1) back = color;
    }
    back ??= [255, 255, 255];
    const fore = parse(getComputedStyle(element).color);
    const [a, b] = [luminance(fore), luminance(back)].sort((x, y) => y - x);
    return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
  });
}, selector);

try {
  // ---------------------------------------------------------------- G-27
  await scenario('G-27', async () => {
    const tab = await open();
    await tab.evaluate(() => document.getElementById('editor').choose('copy'));
    await settle(tab);
    await tab.locator('#editor .sf-editor-bar-start sf-button button').first().click();
    await settle(tab, 400);
    const at = await box(tab, 'copy');
    await tab.mouse.click(at.x + at.width - 4, at.y + at.height / 2);
    await tab.keyboard.press(END);
    await tab.keyboard.type(' Shared');
    await settle(tab, 300);
    await tab.keyboard.press('Escape');
    await tab.locator('#editor .sf-editor-bar-start sf-button button').first().click();
    await settle(tab, 400);
    const after = await tab.evaluate(() => ({
      template: document.getElementById('editor').model.templateEditing,
      bar: document.querySelector('#editor .sf-editor-bar-start sf-button')?.getAttribute('text'),
      live: document.querySelector('#editor .sf-editor-live')?.textContent ?? '',
    }));
    check('G-27: after «Edit template» and «Done» the bar is drawn again and says what happened', after.template === false && /Edit template/u.test(after.bar ?? '') && after.live.length > 0, after);
    check('G-27: the template edit went out with scope template', (await tab.evaluate(() => window.changes.some((change) => change.scope === 'template' && JSON.stringify(change.document).includes('Footer line Shared')))), null);
    await tab.evaluate((doc) => { document.getElementById('editor').document = doc; }, ABOUT);
    await tab.waitForSelector('#editor [data-sf-composition-id="bp"]', {timeout: 5000}).catch(() => {});
    const later = await tab.evaluate(() => ({id: document.getElementById('editor').model.doc.id, drawn: document.querySelector('#editor [data-sf-composition-id="bp"]')?.textContent ?? null}));
    check('G-27: a page the host sets after a template edit is drawn', later.id === 'about' && later.drawn === 'About the company', later);
    check('G-27: no render fails', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });

  // ---------------------------------------------------------------- G-28
  await scenario('G-28', async () => {
    const tab = await open({defer: ['modal']});
    const defined = await tab.evaluate(() => Boolean(customElements.get('sf-modal')));
    await tab.locator('#editor .sf-editor-output-open button').click();
    await settle(tab, 300);
    // The part arrives after the press, as the Loader fetches it on a page.
    await tab.addScriptTag({path: modules.find((path) => path.endsWith('/modal/js/modal.js')), type: 'module'});
    await settle(tab, 900);
    const shown = await tab.evaluate(() => ({
      width: Math.round(document.querySelector('.sf-editor-output-body')?.getBoundingClientRect().width ?? 0),
      text: (document.querySelector('.sf-editor-output-text')?.textContent ?? '').slice(0, 60),
    }));
    check('G-28: the first press of Output opens the dialog while sf-modal is still on its way', !defined && shown.width > 0 && shown.text.includes('simai.composition.document'), {defined, ...shown});
    await tab.keyboard.press('Escape');
    await settle(tab, 300);
    await tab.locator('#editor .sf-editor-output-open button').click();
    await settle(tab, 600);
    const again = await tab.evaluate(() => Math.round(document.querySelector('.sf-editor-output-body')?.getBoundingClientRect().width ?? 0));
    check('G-28: closed and pressed again, it opens again on one press', again > 0, again);
    check('G-28: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });

  // ---------------------------------------------------------------- G-29
  await scenario('G-29', async () => {
    const tab = await open();
    await tab.evaluate(() => document.getElementById('editor').choose('s1'));
    await settle(tab, 300);
    const field = tab.locator('#editor .sf-editor-right sf-input').filter({has: tab.locator('input')}).last().locator('input');
    await field.fill('lg:p-x-4 bogus-class');
    await field.press('Tab');
    await settle(tab, 400);
    const said = await tab.evaluate(() => [...document.querySelectorAll('#editor .sf-editor-right .sf-editor-error')].map((node) => node.textContent.trim()));
    const rules = await tab.evaluate(() => Object.values(globalThis.SF?.RuleLoader ?? {}).some((rule) => rule instanceof RegExp));
    check('G-29: a refused class is named, never «[object Object]»', said.length > 0 && said.every((line) => !line.includes('[object Object]')) && said.some((line) => line.includes('bogus-class')), said);
    if (rules) check('G-29: an unknown class is said to be no SIMAI Framework class; a known one is taken', said.some((line) => line === 'Not in SIMAI Framework: bogus-class') && !said.join(' ').includes('lg:p-x-4'), said);
    else check('G-29: without the Framework rules every class is said to be unchecked, by name', said.some((line) => /^Cannot be checked without the Framework rules: lg:p-x-4 bogus-class$/u.test(line)), said);
    await tab.close();
  });

  // ---------------------------------------------------------------- G-35
  await scenario('G-35', async () => {
    for (const viewport of [{width: 390, height: 844}, {width: 320, height: 256}]) {
      const tab = await open({viewport, lang: 'ru'});
      const wide = await tab.evaluate(() => {
        const bar = document.querySelector('#editor .sf-editor-bar');
        return {sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, bar: bar.scrollWidth - bar.clientWidth, barWidth: Math.round(bar.getBoundingClientRect().width)};
      });
      check(`G-35: at ${viewport.width} px the bar wraps and the page does not scroll sideways`, wide.sideways <= 0 && wide.bar <= 0 && wide.barWidth <= viewport.width, wide);
      await tab.close();
    }
  });

  // ---------------------------------------------------------------- G-31
  await scenario('G-31', async () => {
    const axe = async (tab, state) => {
      if (!axeSource) return;
      if (!(await tab.evaluate(() => Boolean(globalThis.axe)))) await tab.addScriptTag({content: axeSource});
      const found = await tab.evaluate(async () => (await globalThis.axe.run(document, {resultTypes: ['violations']})).violations
        // The icon font is not served on this probe page: an icon's ligature reads as its name.
        .filter((violation) => violation.id !== 'label-content-name-mismatch')
        .flatMap((violation) => violation.nodes.map((node) => `${violation.id} ${node.target.join(' ')}`)));
      check(`G-31: axe finds nothing, ${state}`, found.length === 0, found.slice(0, 6));
    };
    const structure = (tab) => tab.evaluate(() => {
      const outside = (selector) => [...document.querySelectorAll(selector)].filter((node) => !node.closest('[role="region"], main, aside, nav, header, footer, [role="status"]')).length;
      const canvas = document.querySelector('#editor .sf-editor-canvas');
      const left = document.querySelector('#editor .sf-editor-left');
      const headings = [...left.querySelectorAll('h2, h3')].map((node) => node.tagName);
      return {
        bar: outside('#editor .sf-editor-bar') + outside('#sf-editor-help'),
        // The page's main is drawn embedded (sf-editor 1.2.1): a div marked as
        // the main landmark, never a second <main> inside the editor's page.
        canvas: {role: canvas.getAttribute('role'), named: canvas.hasAttribute('aria-label'), main: Boolean(canvas.querySelector('[data-sf-composition-landmark="main"]')), nestedMain: canvas.querySelectorAll('main, [role="main"]').length},
        leftHeadings: headings,
        nested: [...document.querySelectorAll('#editor [role="option"]')].filter((option) => option.querySelector('button, a[href], input, select, textarea, [tabindex]')).length,
        locked: [...document.querySelectorAll('#editor .sf-editor-locked')].map((node) => node.getAttribute('aria-disabled')),
      };
    });
    let tab = await open();
    let seen = await structure(tab);
    check('G-31 region: the bar and the help stand in a region; the canvas of a page with its own main is an unnamed group', seen.bar === 0 && seen.canvas.main && seen.canvas.nestedMain === 0 && seen.canvas.role === 'group' && !seen.canvas.named, seen);
    check('G-31 heading-order: the library\'s groups (h3) follow the panel\'s own heading (h2)', seen.leftHeadings[0] === 'H2' && seen.leftHeadings.length > 1, seen.leftHeadings);
    check('G-31 color-contrast: the dimmed template is inactive (aria-disabled), so its text is not held to 4.5:1', seen.locked.length > 0 && seen.locked.every((value) => value === 'true'), seen.locked);
    await axe(tab, 'nothing chosen');
    await tab.evaluate(() => document.getElementById('editor').choose('s1'));
    await settle(tab, 300);
    await axe(tab, 'a block chosen');
    const at = await box(tab, 'h1');
    await tab.mouse.click(at.x + at.width - 4, at.y + at.height / 2);
    await settle(tab, 300);
    const typing = await tab.evaluate(() => {
      const heading = document.querySelector('#editor [data-sf-composition-id="h1"]');
      return {editing: heading.isContentEditable, role: heading.getAttribute('role'), tag: heading.tagName};
    });
    check('G-31 aria-allowed-role: a heading being typed keeps its heading role', typing.editing && typing.role === null && typing.tag === 'H1', typing);
    await axe(tab, 'typing');
    await tab.keyboard.press('Escape');
    await tab.keyboard.press('Escape');
    await hover(tab, 'p1');
    await tab.locator('#editor .sf-editor-plus button').click();
    await settle(tab, 300);
    seen = await structure(tab);
    const activedescendant = await tab.evaluate(() => document.querySelector('#editor .sf-editor-pop input')?.getAttribute('aria-activedescendant'));
    check('G-31 nested-interactive: the catalogue\'s options hold no control; the search names the active one', seen.nested === 0 && activedescendant === 'sf-editor-pop-0', {nested: seen.nested, activedescendant});
    await axe(tab, 'the + list open');
    await tab.keyboard.press('Escape');
    await tab.close();
    // A page with no landmarks of its own: the canvas is a named region.
    tab = await open({doc: {...page('plain'), root: {id: 'root', type: 'layout.page', slots: {default: [{id: 'z1', type: 'layout.section', slots: {default: [{id: 'za', type: 'layout.area', slots: {default: [{id: 'zp', type: 'content.paragraph', data: {content: t('Plain page')}}]}}]}}]}}}});
    seen = await structure(tab);
    if (!seen.canvas.main) check('G-31 region: the canvas of a page without landmarks is a named region', seen.canvas.role === 'region' && seen.canvas.named, seen.canvas);
    await tab.close();
    // The dark theme: origins and the catalogue's notes are readable.
    tab = await open({theme: 'dark'});
    await tab.evaluate(() => document.getElementById('editor').choose('s1'));
    await settle(tab, 300);
    const origins = await contrastOf(tab, '#editor .sf-editor-origin');
    check('G-31 color-contrast: every origin reads at 4.5:1 or more in the dark theme', origins.length > 0 && Math.min(...origins) >= 4.5, origins);
    await axe(tab, 'dark, a block chosen');
    await tab.evaluate(() => document.getElementById('editor').choose(null));
    await hover(tab, 'p1');
    await tab.locator('#editor .sf-editor-plus button').click();
    await settle(tab, 300);
    const notes = await contrastOf(tab, '#editor .sf-editor-pop .sf-editor-option-note');
    check('G-31 color-contrast: the catalogue\'s type and group notes read at 4.5:1 or more in the dark theme', notes.length > 0 && Math.min(...notes) >= 4.5, notes);
    await axe(tab, 'dark, the + list open');
    check('G-31: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });

  // ---------------------------------------------------------------- G-22
  await scenario('G-22', async () => {
    const tab = await open();
    await tab.evaluate(() => document.getElementById('editor').choose('c1'));
    await settle(tab, 300);
    const columns = async () => tab.evaluate(() => {
      const field = document.querySelector('#editor .sf-editor-field[data-key="columns"]');
      return {origin: field?.dataset.origin ?? null, value: field?.querySelector('input')?.value ?? null};
    });
    check('G-22: the desktop shows the block\'s 2 columns', (await columns()).value === '2', await columns());
    await tab.locator('#editor .sf-editor-bar .sf-editor-screens button').nth(2).click();
    await settle(tab, 400);
    const input = tab.locator('#editor .sf-editor-field[data-key="columns"] input');
    await input.fill('1');
    await input.press('Tab');
    await settle(tab, 400);
    const phone = await columns();
    check('G-22: on the phone 1 (the type\'s default) is the phone\'s own value', phone.value === '1' && phone.origin === 'screen', phone);
    const stored = find((await model(tab)).doc.root, 'c1').props?.columns;
    check('G-22: the Document keeps the phone\'s 1 and the wider screens\' 2', JSON.stringify(stored) === JSON.stringify({xs: 1, md: 2}), stored);
    await tab.locator('#editor .sf-editor-bar .sf-editor-screens button').nth(0).click();
    await settle(tab, 400);
    check('G-22: the desktop keeps its value', (await columns()).value === '2', await columns());
    const printed = await tab.evaluate(async () => (await document.getElementById('editor').output({format: 'html'})).value ?? '');
    // Mobile first: the phone's one column is printed because md: changes it (G-36).
    const line = printed.split('\n').find((text) => text.includes('data-sf-composition-id="c1"')) ?? '';
    check('G-22: the HTML is mobile first: one column, two from md: on, no lg: column class', /[ "]grid-col-1 md:grid-col-2[ "]/u.test(line) && !/lg:grid-col/u.test(line), line.trim());
    await tab.close();
  });

  // ---------------------------------------------------------------- G-33
  await scenario('G-33', async () => {
    const tab = await open();
    await tab.evaluate(() => document.getElementById('editor').choose('p1'));
    await hover(tab, 'p1');
    await tab.locator('#editor .sf-editor-grip button').click();
    await settle(tab, 400);
    await tab.locator('#editor .sf-editor-menu [role="menuitem"]', {hasText: 'Split into columns'}).first().click();
    await settle(tab, 400);
    const split = (await model(tab)).doc;
    const focus = await tab.evaluate(() => Boolean(document.activeElement?.closest('#editor .sf-editor-canvas')));
    check('G-33: the menu splits the block into columns and the keys stay on the canvas', JSON.stringify(split).includes('"layout.columns","props":{"columns":{"xs":1,"md":2}}') || find(split.root, 'p1') && parentOf(split.root, parentOf(split.root, 'p1').id)?.type === 'layout.columns', {focus});
    check('G-33: after the menu the focus is on the canvas', focus, focus);
    await tab.keyboard.press(`${MOD}+z`);
    await settle(tab, 300);
    const back = (await model(tab)).doc;
    check('G-33: one undo reverts the split', parentOf(back.root, 'p1')?.id === 'a1' && (find(back.root, 's1').slots.default.length === 1), find(back.root, 's1').slots.default.map((node) => node.type));
    check('G-33: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });

  // ---------------------------------------------------------------- G-34
  await scenario('G-34', async () => {
    const tab = await open();
    const edge = await libraryDrag(tab, 'quote', 'content.quote', 'p1', 'right');
    let doc = (await model(tab)).doc;
    const column = parentOf(doc.root, 'p1');
    const columns = column && parentOf(doc.root, column.id);
    const sides = columns?.slots?.columns ?? [];
    check('G-34: a card dropped at a block\'s right edge shows the side line and stands beside it', edge === 'end' && columns?.type === 'layout.columns' && sides.length === 2 && sides[0].id === column.id && sides[1].slots.default[0].type === 'content.quote', {edge, columns: sides.map((area) => area.slots.default.map((node) => node.type))});
    const quote = sides[1]?.slots.default[0]?.id;
    const second = await libraryDrag(tab, 'note', 'content.alert', quote, 'right');
    doc = (await model(tab)).doc;
    const three = find(doc.root, columns.id)?.slots.columns ?? [];
    check('G-34: a card dropped at the side of a block in a column adds a column', second === 'end' && three.length === 3 && three[2].slots.default[0].type === 'content.alert', {second, quote, said: await tab.evaluate(() => document.querySelector('#editor .sf-editor-live')?.textContent), columns: three.map((area) => area.slots.default.map((node) => node.type))});
    check('G-34: the new columns stand one under another on the phone', JSON.stringify(find(doc.root, columns.id).props.columns) === JSON.stringify({xs: 1, md: 3}), find(doc.root, columns.id).props);
    await tab.locator('#editor .sf-editor-canvas').focus();
    await tab.keyboard.press(`${MOD}+z`);
    await settle(tab, 300);
    check('G-34: one undo takes the added column back', (find((await model(tab)).doc.root, columns.id)?.slots.columns ?? []).length === 2, null);
    await tab.keyboard.press(`${MOD}+z`);
    await settle(tab, 300);
    doc = (await model(tab)).doc;
    check('G-34: and one more the split', parentOf(doc.root, 'p1')?.id === 'a1' && !JSON.stringify(find(doc.root, 's1')).includes('layout.columns'), null);
    check('G-34: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });

  // ---------------------------------------------------------------- G-30
  await scenario('G-30', async () => {
    const tab = await open();
    await tab.mouse.click(2, 2);
    for (let index = 0; index < 80 && !(await tab.evaluate(() => Boolean(document.activeElement?.closest('#editor .sf-editor-canvas')))); index += 1) await tab.keyboard.press('Tab');
    const reached = await tab.evaluate(() => document.activeElement?.classList.contains('sf-editor-canvas'));
    await tab.keyboard.press('ArrowDown');
    await settle(tab);
    const first = (await model(tab)).selected;
    check('G-30: Tab reaches the canvas and ↓ with nothing chosen chooses the first block a person can change', reached && first === 's1', {reached, first});
    await tab.keyboard.press('ArrowDown');
    await settle(tab);
    const second = (await model(tab)).selected;
    check('G-30: ↓ again chooses the next block', second === 's2', second);
    await tab.keyboard.press('ArrowDown');
    await settle(tab);
    check('G-30: past the main region\'s last block ↓ goes on to the footer', (await model(tab)).selected === 'copy', (await model(tab)).selected);
    await tab.keyboard.press('ArrowUp');
    await tab.keyboard.press('ArrowUp');
    await settle(tab);
    check('G-30: ↑ goes back the same way', (await model(tab)).selected === 's1', (await model(tab)).selected);
    await tab.keyboard.press('Enter');
    await tab.keyboard.press('Enter');
    await tab.keyboard.press('ArrowDown');
    await settle(tab);
    check('G-30: inside a block the arrows stay among its children', (await model(tab)).selected === 'p1', (await model(tab)).selected);
    check('G-30: the focus stays on the canvas', await tab.evaluate(() => document.activeElement?.classList.contains('sf-editor-canvas')), null);
    await tab.close();
  });

  // ---------------------------------------------------------------- G-32
  await scenario('G-32', async () => {
    for (const width of [1400, 1000, 700]) {
      const tab = await open({doc: EDGE, viewport: {width, height: 800}});
      const at = await box(tab, 'ep');
      await tab.mouse.move(at.x + 4, at.y + Math.min(10, at.height / 2), {steps: 3});
      await settle(tab, 200);
      const room = await tab.evaluate(() => {
        const gutter = document.querySelector('#editor .sf-editor-gutter');
        const line = document.querySelector('#editor [data-sf-composition-id="ep"]');
        const range = document.createRange();
        range.setStart(line.firstChild, 0);
        range.setEnd(line.firstChild, 1);
        const letter = range.getBoundingClientRect();
        const hit = document.elementFromPoint(letter.left + 1, letter.top + letter.height / 2);
        return {shown: !gutter.hidden, gutterEnd: Math.round(gutter.getBoundingClientRect().right), textStart: Math.round(letter.left), hit: hit?.getAttribute?.('data-sf-composition-id') ?? hit?.className ?? null};
      });
      check(`G-32: at ${width} px the gutter stands beside the line, never over its start`, room.shown && room.gutterEnd <= room.textStart && room.hit === 'ep', room);
      await tab.mouse.click(room.textStart + 1, at.y + Math.min(10, at.height / 2));
      await settle(tab, 200);
      check(`G-32: at ${width} px a press at the line's start types in it`, (await model(tab)).typing === 'ep', (await model(tab)).typing);
      await tab.close();
    }
  });

  // ---------------------------------------------------------------- G-24
  await scenario('G-24', async () => {
    const host = {types: [SPLIT], words: {en: {'probe.split.name': 'Split hero', 'probe.split.text': 'Text', 'probe.split.media': 'Picture', 'probe.split.media_empty': 'Picture or video'}}};
    const tab = await open({doc: SPLIT_PAGE, host});
    const place = await tab.evaluate(() => {
      const empty = document.querySelector('#editor [data-sf-composition-id="hero"] [data-sf-composition-slot="media"] .sf-editor-empty');
      return empty ? {text: empty.textContent.trim(), slot: empty.dataset.sfEditorSlot, plus: Boolean(empty.querySelector('sf-icon[icon="add"]'))} : null;
    });
    check('G-24: the empty named place draws its prompt and a + in the place the renderer marked', place?.text.endsWith('Picture or video') && place.slot === 'media' && place.plus, place);
    await tab.locator('#editor [data-sf-composition-id="hero"] .sf-editor-empty').click();
    await settle(tab, 300);
    const offered = await tab.evaluate(() => [...document.querySelectorAll('#editor .sf-editor-pop [role="option"]')].map((option) => option.dataset.item));
    check('G-24: a press on it opens the catalogue with what the place takes (its groups) only', offered.includes('content.figure') && !offered.includes('content.paragraph'), offered);
    await tab.locator('#editor .sf-editor-pop [role="option"][data-item="content.figure"]').first().click();
    await settle(tab, 400);
    const media = find((await model(tab)).doc.root, 'hero')?.slots?.media ?? [];
    check('G-24: the place takes the chosen block', media.length === 1 && media[0].type === 'content.figure', media.map((node) => node.type));
    check('G-24: a filled place draws no prompt', !(await tab.evaluate(() => Boolean(document.querySelector('#editor [data-sf-composition-id="hero"] .sf-editor-empty')))), null);
    check('G-24: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });

  // ---------------------------------------------------------------- G-36
  await scenario('G-36', async () => {
    const tab = await open();
    await tab.evaluate(() => document.getElementById('editor').choose('p1'));
    await hover(tab, 'p1');
    await tab.locator('#editor .sf-editor-grip button').click();
    await settle(tab, 400);
    await tab.locator('#editor .sf-editor-menu [role="menuitem"]', {hasText: 'Split into columns'}).first().click();
    await settle(tab, 400);
    const doc = (await model(tab)).doc;
    const columns = parentOf(doc.root, parentOf(doc.root, 'p1').id);
    check('G-36: the split stores one column on the phone, two from md: on', JSON.stringify(columns?.props?.columns) === JSON.stringify({xs: 1, md: 2}), columns?.props);
    const printed = await tab.evaluate(async () => (await document.getElementById('editor').output({format: 'html'})).value ?? '');
    const line = printed.split('\n').find((text) => text.includes(`data-sf-composition-id="${columns.id}"`)) ?? '';
    check('G-36: the HTML prints the phone\'s grid-col-1 before md:grid-col-2', /class="[^"]*\bgrid-col-1 md:grid-col-2[ "]/u.test(line), line.trim());
    await tab.locator('#editor .sf-editor-bar .sf-editor-screens button').nth(2).click();
    await settle(tab, 400);
    const phone = await tab.evaluate((id) => {
      const grid = document.querySelector(`#editor [data-sf-composition-id="${id}"]`);
      const wide = document.createElement('div');
      wide.style.inlineSize = '4000px';
      grid.querySelector('[data-sf-composition-id="p1"]')?.append(wide);
      const result = {classes: grid.className, track: getComputedStyle(grid).gridTemplateColumns, grid: Math.round(grid.getBoundingClientRect().width)};
      wide.remove();
      return result;
    }, columns.id);
    check('G-36: on the phone the canvas draws grid-col-1, so a wide child cannot stretch the column', phone.classes.split(' ').includes('grid-col-1') && !phone.track.includes(' ') && Number.parseFloat(phone.track) <= phone.grid + 1, phone);
    check('G-36: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });

  // ---------------------------------------------------------------- G-37
  await scenario('G-37', async () => {
    const tab = await open();
    await hover(tab, 'p1');
    const button = await tab.locator('#editor .sf-editor-plus button').boundingBox();
    await tab.locator('#editor .sf-editor-plus button').click();
    await settle(tab, 300);
    const pop = await tab.locator('#editor .sf-editor-pop').boundingBox();
    check('G-37: the + catalogue opens beside the +, not at the window\'s corner', Boolean(pop && button) && Math.abs(pop.x - button.x) <= 2 && pop.y >= button.y + button.height && pop.y <= button.y + button.height + 12, {pop, button});
    const option = tab.locator('#editor .sf-editor-pop [role="option"]').first();
    const said = String(await option.getAttribute('data-item')).split('#')[0];
    await option.click();
    await settle(tab, 400);
    const doc = (await model(tab)).doc;
    check('G-37: an option of the catalogue can be pressed', JSON.stringify(doc).includes(`"type":"${said}"`) && find(doc.root, 'a1').slots.default.length > 3, said);
    // Near the window's end edge the catalogue stays inside the window.
    await tab.evaluate(() => document.getElementById('editor').choose(null));
    const last = await box(tab, 'p2');
    const bottom = Math.round(last.y + last.height + 40);
    await tab.setViewportSize({width: 1400, height: bottom});
    await settle(tab, 300);
    await hover(tab, 'p2');
    const low = await tab.locator('#editor .sf-editor-plus button').boundingBox();
    await tab.locator('#editor .sf-editor-plus button').click();
    await settle(tab, 300);
    const kept = await tab.locator('#editor .sf-editor-pop').boundingBox();
    check('G-37: at the window\'s bottom the catalogue stays inside it, by its +', Boolean(kept && low) && kept.y >= 0 && kept.y + kept.height <= bottom + 1 && kept.y + kept.height <= low.y + 1 && Math.abs(kept.x - low.x) <= 2, {kept, low});
    await tab.keyboard.press('Escape');
    await tab.setViewportSize({width: 1400, height: 900});
    await settle(tab, 300);
    // The grip menu stands by the grip too.
    await hover(tab, 'p2');
    const grip = await tab.locator('#editor .sf-editor-grip button').boundingBox();
    await tab.locator('#editor .sf-editor-grip button').click();
    await settle(tab, 400);
    const menu = await tab.evaluate(() => {
      const item = document.querySelector('#editor .sf-editor-menu [role="menuitem"]');
      const list = item?.closest('[role="menu"]') ?? item?.parentElement;
      const rect = list?.getBoundingClientRect();
      return rect ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height} : null;
    });
    check('G-37: the grip menu opens by the grip, not at the corner', Boolean(menu && grip) && menu.width > 0 && Math.abs(menu.x - grip.x) <= 24 && menu.y >= grip.y && menu.y <= grip.y + grip.height + 24, {menu, grip});
    check('G-37: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });

  // ---------------------------------------------------------------- G-38
  await scenario('G-38', async () => {
    const host = {types: [SPLIT], words: {en: {'probe.split.name': 'Split hero', 'probe.split.text': 'Text', 'probe.split.media': 'Picture', 'probe.split.media_empty': 'Picture or video'}}};
    // A section its hero fills: the section has no point of its own. Since
    // layout.section 1.2.0 the type pads itself (parameter_defaults padding_y
    // 8, width normal): this section sets both off, so the hero fills it.
    const HERO = page('hero', {main: [{id: 'x1', type: 'layout.section', props: {padding_y: 0, width: 'full'}, slots: {default: [
      {id: 'hero', type: 'probe.split', slots: {default: [{id: 'hp', type: 'content.paragraph', data: {content: t('Hero text')}}], media: []}},
    ]}}]});
    const tab = await open({doc: HERO, host});
    let saved = null;
    await tab.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.addEventListener(editor.sfEventName?.('block-save') ?? 'block-save', (event) => { window.saved = event.detail; });
    });
    await tab.evaluate(() => document.getElementById('editor').choose('x1'));
    await settle(tab, 300);
    await hover(tab, 'hero');
    const gutter = await tab.evaluate(() => document.getElementById('editor').gutterId);
    check('G-38: inside the chosen section the gutter stays the section\'s', gutter === 'x1', gutter);
    await tab.locator('#editor .sf-editor-grip button').click();
    await settle(tab, 400);
    const forId = await tab.evaluate(() => document.querySelector('#editor .sf-editor-menu')?.dataset.for);
    check('G-38: the grip menu is the chosen section\'s', forId === 'x1', forId);
    await tab.locator('#editor .sf-editor-menu [role="menuitem"]', {hasText: 'Make a site block'}).first().click();
    await settle(tab, 500);
    const opened = await tab.evaluate(() => {
      const editor = document.getElementById('editor');
      return {root: editor.builder?.root?.type ?? null, chosen: editor.model.selected, fields: [...document.querySelectorAll('#editor .sf-editor-right .sf-editor-field')].map((field) => field.dataset.key)};
    });
    check('G-38: the builder holds the section itself, chosen, with its own parameters', opened.root === 'layout.section' && opened.chosen === 'x1' && opened.fields.includes('background'), opened);
    await tab.locator('#editor .sf-editor-field[data-key="background"] sf-switch.sf-editor-expose').locator('input, [role="switch"]').first().click();
    await settle(tab, 300);
    await tab.locator('#editor .sf-editor-builder-bar sf-input input').fill('Our hero');
    await settle(tab, 200);
    await tab.locator('#editor .sf-editor-builder-bar sf-button').last().locator('button').click();
    await settle(tab, 600);
    saved = await tab.evaluate(() => window.saved ? {root: window.saved.manifest.composed.root.type, exposed: window.saved.manifest.exposed, props: Object.keys(window.saved.manifest.props_schema?.properties ?? {})} : null);
    check('G-38: the saved block is the section with its background exposed', saved?.root === 'layout.section' && saved.props.join() === 'background' && saved.exposed?.[0]?.target === 'props.background', saved);
    const instance = (await model(tab)).doc.root.slots.regions[1].slots.default[0];
    await tab.evaluate((id) => document.getElementById('editor').choose(id), instance.id);
    await settle(tab, 300);
    const offered = await tab.evaluate(() => [...document.querySelectorAll('#editor .sf-editor-right .sf-editor-field')].map((field) => field.dataset.key));
    check('G-38: the instance stands in the section\'s place and offers the author the background', /^site\./u.test(instance.type) && offered.join() === 'background', {type: instance.type, offered});
    check('G-38: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 1));
  process.exit(1);
}
console.log('editor host gaps: every check passed');
