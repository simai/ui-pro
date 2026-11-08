#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-editor 1.2.0 on the built bytes: what the ui-editor host still found
// against the prototype in 1.1.0 (ui-editor docs/GAPS.md), measured with a
// real pointer and keyboard:
// - G-20 + and / list the library's sections (icon, count), a section opens
//   in place with «Back», a search names each block's section once; / opens
//   Text first; the button stands in Text too (catalogue.also_in); Forms holds
//   the Framework's form types;
// - G-21 «Reset» after a change returns the variant's value;
// - G-42 a site block's instance shows only its exposed parameters, no
//   «Extra classes»;
// - accent: the section's accent variant draws on the primary colour with
//   on-primary text, at 4.5:1 or more, light and dark;
// - the grid keeps three columns on a phone (390), as the prototype; three
//   titled cards there keep the prototype's 16 px semibold title, every line
//   inside its card, the titles apart;
// - on the accent a primary button inverts and an outlined one takes the
//   on-primary edge, 3:1 off the fill;
// - nothing chosen: the page's settings the host gives (name, address, site
//   template, theme link, publishing, history) and the slot page; a short
//   note when the host gives nothing.
import {resolve, join} from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const parts = ['icon', 'button', 'button-icon', 'segmented', 'tabs', 'input', 'dropdown', 'switch', 'skeleton', 'menu-context', 'modal', 'editor-inline'];
const sheets = ['card', 'buttons', 'icon-buttons', 'button-group', 'inputs', 'dropdown', 'switch', 'skeleton', 'modal', 'menu', 'context-menu', 'tabs', 'tab', 'icons']
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


const EMPTY_LINE = page('empty', {main: [{id: 'w1', type: 'layout.section', props: {width: 'normal'}, slots: {default: [
  {id: 'wa', type: 'layout.area', slots: {default: [
    {id: 'wp', type: 'content.paragraph', data: {content: t('A line above')}},
    {id: 'we', type: 'content.paragraph', data: {content: []}},
  ]}},
]}}]});
// The section's accent variant with a heading and a line in it.
const ACCENT = page('accent', {main: [{id: 'ac', type: 'layout.section', props: {background: 'accent'}, extensions: {'simai.composition:variant': {id: 'accent'}}, slots: {default: [
  {id: 'aa', type: 'layout.area', slots: {default: [
    {id: 'ah', type: 'content.heading', data: {level: 2, content: t('Ready to start?')}},
    {id: 'ap', type: 'content.paragraph', data: {content: t('Leave a request and we call you back.')}},
    {id: 'ab', type: 'element.button', data: {text: 'Leave a request'}},
    {id: 'ao', type: 'element.button', data: {text: 'More'}, props: {appearance: 'outline'}},
  ]}},
]}}]});
const TITLED = page('titled', {main: [{id: 'ts', type: 'layout.section', slots: {default: [
  {id: 'tg', type: 'layout.grid', slots: {default: [['Быстро', 'Страница собирается за минуты.'], ['Понятно', 'Короткое описание преимущества.'], ['Надёжно', 'Автор не сломает макет.']].map(([title, line], index) => ({
    id: `tc${index + 1}`, type: 'content.card', slots: {default: [
      {id: `tc${index + 1}-h`, type: 'content.heading', data: {level: 3, content: t(title)}},
      {id: `tc${index + 1}-p`, type: 'content.paragraph', data: {content: t(line)}},
    ]},
  }))}},
]}}]});
const popState = (tab) => tab.evaluate(() => {
  const pop = document.querySelector('#editor .sf-editor-pop');
  if (!pop) return null;
  const rows = [...pop.querySelectorAll('li[role="option"]')];
  return {
    listing: pop.dataset.listing, section: pop.dataset.section,
    back: Boolean(pop.querySelector('.sf-editor-pop-back sf-button')),
    sections: rows.filter((row) => row.dataset.section).map((row) => ({id: row.dataset.section, name: row.querySelector('.sf-editor-option-name')?.dataset.label, icon: row.querySelector('.sf-editor-option-icon')?.getAttribute('icon'), count: Number(row.querySelector('.sf-editor-count')?.textContent)})),
    items: rows.filter((row) => row.dataset.item).map((row) => ({item: row.dataset.item, name: row.querySelector('.sf-editor-option-name')?.dataset.label, note: row.querySelector('.sf-editor-option-note')?.textContent.trim(), sub: row.querySelector('.sf-editor-option-sub')?.textContent.trim() ?? ''})),
  };
});
const library = (tab) => tab.evaluate(() => [...document.querySelectorAll('#editor .sf-editor-left .sf-editor-section-name')].map((node) => node.textContent.trim()));
const fieldOf = (tab, id, key) => tab.evaluate(({id, key}) => {
  const field = document.getElementById('editor').model.fields(id, 'xs').find((entry) => entry.key === key);
  return field ? {origin: field.origin, value: field.value} : null;
}, {id, key});

try {
  // ---------------------------------------------------------------- G-20
  await scenario('G-20', async () => {
    const tab = await open();
    // + between the sections: the same sections as the library.
    await hover(tab, 's2');
    await tab.locator('#editor .sf-editor-plus button').click();
    await settle(tab, 300);
    let pop = await popState(tab);
    const left = await library(tab);
    check('G-20: + between sections opens the list of sections, each with its icon and count', pop?.listing === 'sections' && pop.sections.length >= 4 && pop.sections.every((section) => section.icon && section.count > 0), pop);
    check('G-20: the + list names the library\'s sections, in its order', pop && pop.sections.map((section) => section.name).every((name) => left.includes(name)), {pop: pop?.sections.map((section) => section.name), left});
    check('G-20: Forms is a section', pop?.sections.some((section) => section.id === 'forms'), pop?.sections.map((section) => section.id));
    await tab.locator('#editor .sf-editor-pop li[data-section="forms"]').click();
    await settle(tab, 300);
    pop = await popState(tab);
    const forms = pop?.items.map((item) => item.item.split('#')[0]) ?? [];
    check('G-20: the section opens in place with «Back», its blocks naming it', pop?.listing === 'section' && pop.section === 'forms' && pop.back && pop.items.every((item) => item.note === pop.items[0].note), pop);
    check('G-20: Forms holds the form, field, text area, checkbox, switch, list and send button', ['form.form', 'form.input', 'form.textarea', 'form.checkbox', 'form.switch', 'form.select', 'form.button-submit'].every((type) => forms.includes(type)), forms);
    await tab.locator('#editor .sf-editor-pop-back sf-button button').click();
    await settle(tab, 300);
    pop = await popState(tab);
    check('G-20: «Back» returns to the sections', pop?.listing === 'sections', pop?.listing);
    const formsCount = pop?.sections.find((section) => section.id === 'forms')?.count;
    check('G-20: the count of Forms is the types it lists', formsCount === new Set(forms).size, {formsCount, forms});
    await tab.locator('#editor .sf-editor-pop li[data-section="text"]').click();
    await settle(tab, 300);
    pop = await popState(tab);
    const button = pop?.items.find((item) => item.item.startsWith('element.button'));
    check('G-20: the button stands in Text too, saying where it is from', Boolean(button) && /Elements|Элемент/u.test(button.sub), pop?.items);
    await tab.locator('#editor .sf-editor-pop-back sf-button button').click();
    await settle(tab, 200);
    await tab.locator('#editor .sf-editor-pop sf-input input').fill('button');
    await settle(tab, 300);
    pop = await popState(tab);
    const found = pop?.items.filter((item) => item.item === 'element.button#plain') ?? [];
    check('G-20: a search lists each block once, naming its section', pop?.listing === 'found' && found.length === 1 && found[0].note.length > 0, pop);
    await tab.keyboard.press('Escape');
    await settle(tab, 200);
    // ← in an empty search goes back, Enter opens a section.
    await hover(tab, 's2');
    await tab.locator('#editor .sf-editor-plus button').click();
    await settle(tab, 300);
    await tab.keyboard.press('Enter');
    await settle(tab, 200);
    const opened = (await popState(tab))?.listing;
    await tab.keyboard.press('ArrowLeft');
    await settle(tab, 200);
    const closed = (await popState(tab))?.listing;
    check('G-20: Enter opens a section, ← goes back', opened === 'section' && closed === 'sections', {opened, closed});
    await tab.keyboard.press('Escape');
    check('G-20: no page errors (+)', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
    // / in an empty line: Text first, its first block a paragraph.
    const slash = await open({doc: EMPTY_LINE});
    const at = await box(slash, 'we');
    await slash.mouse.click(at.x + 8, at.y + at.height / 2);
    await settle(slash, 200);
    await slash.keyboard.type('/');
    await settle(slash, 300);
    pop = await popState(slash);
    check('G-20: / opens Text first, with «Back» to the sections', pop?.listing === 'section' && pop.section === 'text' && pop.back, pop && {listing: pop.listing, section: pop.section, back: pop.back});
    const kinds = pop?.items.map((item) => (/from|из раздела/u.test(item.sub) ? 'borrowed' : 'own')) ?? [];
    check('G-20: Text lists its own blocks first (heading, paragraph, list …), the button from Elements after them', kinds[0] === 'own' && kinds.lastIndexOf('own') < kinds.indexOf('borrowed') && pop.items.some((item) => item.item === 'content.paragraph'), pop?.items.map((item) => item.item));
    await slash.keyboard.press('Escape');
    check('G-20: no page errors (/)', slash.errors.length === 0, slash.errors.slice(0, 3));
    await slash.close();
  });

  // ---------------------------------------------------------------- G-21
  await scenario('G-21', async () => {
    const tab = await open();
    const id = await tab.evaluate(() => {
      const editor = document.getElementById('editor');
      const made = editor.model.insert({type: 'layout.section', variant: 'accent'}, editor.model.placeAfter('s2'));
      editor.choose(made.id);
      return made.id;
    });
    await settle(tab, 400);
    const before = await fieldOf(tab, id, 'background');
    await tab.evaluate((id) => document.getElementById('editor').model.setParam(id, 'background', 'primary'), id);
    await tab.evaluate(() => document.getElementById('editor').refresh());
    await settle(tab, 300);
    const changed = await fieldOf(tab, id, 'background');
    await tab.locator('#editor .sf-editor-field[data-key="background"] sf-button[aria-label^="Reset"] button').click();
    await settle(tab, 300);
    const reset = await fieldOf(tab, id, 'background');
    check('G-21: a section made from the accent variant says the variant', before?.origin === 'variant' && before.value === 'accent', before);
    check('G-21: after a change «Reset» returns the variant\'s value', changed?.value === 'primary' && reset?.origin === 'variant' && reset.value === 'accent', {changed, reset});
    check('G-21: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });

  // ---------------------------------------------------------------- G-42
  await scenario('G-42', async () => {
    const tab = await open();
    const id = await tab.evaluate(() => {
      const editor = document.getElementById('editor');
      const builder = editor.model.startBuilder({from: 's1'}).builder;
      builder.exposed = [{key: 'background', path: 's1', target: 'props.background'}];
      const saved = editor.model.saveBuilder(builder, {name: 'Promo'});
      const instance = editor.model.toJSON().root.slots.regions[1].slots.default[0];
      editor.choose(instance.id);
      return saved.ok ? instance.id : null;
    });
    await settle(tab, 400);
    const right = await tab.evaluate(() => ({
      fields: [...document.querySelectorAll('#editor .sf-editor-right .sf-editor-field')].map((field) => field.dataset.key),
      modifiers: Boolean(document.querySelector('#editor .sf-editor-right .sf-editor-modifiers')),
      headings: [...document.querySelectorAll('#editor .sf-editor-right .sf-editor-heading')].map((node) => node.textContent.trim()),
    }));
    check('G-42: the instance shows only its exposed parameter', Boolean(id) && right.fields.join() === 'background', right);
    check('G-42: no «Extra classes» on an instance', right.modifiers === false, right);
    check('G-42: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });

  // ---------------------------------------------------------------- accent
  await scenario('accent', async () => {
    for (const theme of ['light', 'dark']) {
      const tab = await open({theme, doc: ACCENT});
      const id = 'ac';
      await settle(tab, 500);
      const seen = await tab.evaluate((id) => {
        const section = document.querySelector(`#editor .sf-editor-page [data-sf-composition-id="${id}"]`);
        const probe = document.createElement('span');
        probe.style.cssText = 'color: var(--sf-primary); background: var(--sf-on-primary)';
        section.append(probe);
        const want = getComputedStyle(probe);
        const text = section.querySelector('h1, h2, h3, p') ?? section;
        const result = {classes: section.className, background: getComputedStyle(section).backgroundColor, primary: want.color, text: getComputedStyle(text).color, onPrimary: want.backgroundColor};
        probe.remove();
        return result;
      }, id);
      check(`accent (${theme}): the section is drawn on the primary colour`, /bg-primary/u.test(seen.classes) && seen.background === seen.primary, seen);
      check(`accent (${theme}): its text is on-primary`, seen.text === seen.onPrimary, seen);
      const ratio = (await contrastOf(tab, `#editor .sf-editor-page [data-sf-composition-id="${id}"] :is(h1, h2, h3, p)`));
      check(`accent (${theme}): its text reads at 4.5:1 or more`, ratio.length > 0 && Math.min(...ratio) >= 4.5, ratio);
      const buttons = await tab.evaluate(() => {
        const look = (id) => {
          const inner = document.querySelector(`#editor .sf-editor-page [data-sf-composition-id="${id}"] .sf-button`);
          if (!inner) return null;
          const s = getComputedStyle(inner);
          return {background: s.backgroundColor, border: s.borderTopColor, borderWidth: parseFloat(s.borderTopWidth), ink: getComputedStyle(inner.querySelector('.sf-button-text-container')).color};
        };
        return {section: getComputedStyle(document.querySelector('#editor .sf-editor-page [data-sf-composition-id="ac"]')).backgroundColor, button: look('ab'), outline: look('ao')};
      });
      const rgb = (value) => (value.match(/[\d.]+/gu) ?? []).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      const contrast = (x, y) => { const [p, q] = [lum(rgb(x)), lum(rgb(y))].sort((u, v) => v - u); return Math.round(((p + 0.05) / (q + 0.05)) * 100) / 100; };
      const plate = buttons.button ? contrast(buttons.button.background, buttons.section) : 0;
      check(`accent (${theme}): a primary button inverts, its plate at 3:1 or more off the fill, its words at 4.5:1`, plate >= 3 && contrast(buttons.button.ink, buttons.button.background) >= 4.5, {plate, buttons});
      const edge = buttons.outline ? contrast(buttons.outline.border, buttons.section) : 0;
      check(`accent (${theme}): an outlined button's edge at 3:1, its words at 4.5:1 on the fill`, edge >= 3 && buttons.outline.borderWidth > 0 && contrast(buttons.outline.ink, buttons.section) >= 4.5, {edge, buttons});
      check(`accent (${theme}): no page errors`, tab.errors.length === 0, tab.errors.slice(0, 3));
      await tab.close();
    }
  });

  // ---------------------------------------------------------------- grid at 390
  await scenario('grid-390', async () => {
    const tab = await open({viewport: {width: 390, height: 844}});
    const id = await tab.evaluate(() => {
      const editor = document.getElementById('editor');
      const section = editor.model.insert({type: 'layout.section'}, editor.model.placeAfter('s2'));
      const made = editor.model.insert({type: 'layout.grid', variant: 'cards-3'}, editor.model.placeInside(section.id));
      editor.setScreen('phone');
      editor.redraw();
      return made.ok === false ? null : made.id;
    });
    await settle(tab, 500);
    const seen = await tab.evaluate((id) => {
      const editor = document.getElementById('editor');
      const block = id ? document.querySelector(`#editor .sf-editor-page [data-sf-composition-id="${id}"]`) : null;
      const grids = block ? [block, ...block.querySelectorAll('.grid')].filter((node) => node.classList.contains('grid')) : [];
      return {screen: editor.screenName, grids: grids.map((grid) => ({classes: grid.className, tracks: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length}))};
    }, id);
    const html = await tab.evaluate(async () => (await document.getElementById('editor').model.toHTML()).html);
    check('grid-390: the phone screen shows the grid\'s three columns, as the prototype', seen.screen === 'phone' && seen.grids.length > 0 && seen.grids.every((grid) => grid.tracks === 3), seen);
    check('grid-390: the printed grid keeps grid-col-3 with no phone rule', /class="grid grid-col-3 gap-5"/u.test(html) && !/grid-col-1/u.test(html), html.match(/class="grid[^"]*"/gu));
    check('grid-390: the page does not scroll sideways', await tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), null);
    check('grid-390: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
    // Three titled cards on the phone screen: the prototype's title, every line inside its card, no titles meeting.
    const cards = await open({viewport: {width: 390, height: 844}, lang: 'ru', doc: TITLED});
    await cards.evaluate(() => { const editor = document.getElementById('editor'); editor.setScreen('phone'); editor.redraw(); });
    await settle(cards, 600);
    const titled = await cards.evaluate(() => [1, 2, 3].map((n) => {
      const node = (id) => document.querySelector(`#editor .sf-editor-page [data-sf-composition-id="${id}"]`);
      const card = node(`tc${n}`).getBoundingClientRect();
      const lines = [node(`tc${n}-h`), node(`tc${n}-p`)].map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = [...range.getClientRects()];
        return {left: Math.min(...rects.map((rect) => rect.left)), right: Math.max(...rects.map((rect) => rect.right)), scroll: element.scrollWidth - element.clientWidth};
      });
      const heading = node(`tc${n}-h`);
      const style = getComputedStyle(heading);
      const at = heading.getBoundingClientRect();
      return {card: {left: card.left, right: card.right}, lines, size: parseFloat(style.fontSize), weight: Number(style.fontWeight), title: {left: at.left, right: at.right}};
    }));
    check('cards-390: a heading in a card is its title, 16 px semibold', titled.every((card) => Math.abs(card.size - 16) <= 0.5 && card.weight >= 600 && card.weight < 700), titled.map((card) => [card.size, card.weight]));
    check('cards-390: no line leaves its card', titled.every((card) => card.lines.every((line) => line.left >= card.card.left - 0.5 && line.right <= card.card.right + 0.5 && line.scroll <= 0)), titled);
    check('cards-390: the titles do not overlap', titled.every((card, index) => index === 0 || card.title.left >= titled[index - 1].title.right), titled.map((card) => card.title));
    check('cards-390: no page errors', cards.errors.length === 0, cards.errors.slice(0, 3));
    await cards.close();
  });

  // ---------------------------------------------------------------- page settings
  await scenario('page', async () => {
    const tab = await open();
    await tab.evaluate(() => document.getElementById('editor').choose(null));
    await settle(tab, 300);
    const bare = await tab.evaluate(() => ({note: Boolean(document.querySelector('#editor .sf-editor-right .sf-editor-empty-state')), page: Boolean(document.querySelector('#editor .sf-editor-right .sf-editor-page'))}));
    check('page: without settings the panel says only to choose a block', bare.note && !bare.page, bare);
    await tab.evaluate(() => {
      const editor = document.getElementById('editor');
      window.pageEvents = [];
      editor.addEventListener('sf-editor-page-change', (event) => window.pageEvents.push({type: 'change', ...event.detail}));
      editor.addEventListener('sf-editor-page-action', (event) => window.pageEvents.push({type: 'action', ...event.detail}));
      editor.pageSettings = {
        name: 'Home', address: '/', status: 'Draft · not published',
        template: {value: 'main', options: [{value: 'main', text: 'Main: header and footer'}, {value: 'none', text: 'No header and footer'}]},
        theme: {label: 'Regular', settings_url: '/admin/site'},
        publish: {note: 'Visitors see the last published version.'},
        history: {count: 12},
      };
    });
    await settle(tab, 400);
    const seen = await tab.evaluate(() => {
      const right = document.querySelector('#editor .sf-editor-right');
      return {
        title: right.querySelector('.sf-editor-panel-title')?.textContent.trim(),
        sub: right.querySelector('.sf-editor-panel-sub')?.textContent.trim(),
        keys: [...right.querySelectorAll('.sf-editor-page-field')].map((node) => node.dataset.key),
        name: right.querySelector('.sf-editor-page-field[data-key="name"] input')?.value,
        address: right.querySelector('.sf-editor-page-field[data-key="address"] input')?.value,
        link: right.querySelector('.sf-editor-page-link')?.getAttribute('href'),
        buttons: [...right.querySelectorAll('.sf-editor-page-field[data-key="publish"] sf-button')].map((node) => node.getAttribute('text')),
        hint: Boolean(right.querySelector('.sf-editor-page .sf-editor-card')),
        note: Boolean(right.querySelector('.sf-editor-empty-state')),
        overflow: right.scrollWidth > right.clientWidth + 1,
      };
    });
    check('page: the panel is the page\'s, named with its status', seen.title === 'Home' && seen.sub === 'Draft · not published', seen);
    check('page: name, address, template, theme and publishing in the prototype\'s order', seen.keys.join() === 'name,address,template,theme,publish', seen.keys);
    check('page: the fields hold the host\'s values, the theme links to its settings', seen.name === 'Home' && seen.address === '/' && seen.link === '/admin/site', seen);
    check('page: Publish and History · 12', seen.buttons.join('|') === 'Publish|History · 12', seen.buttons);
    check('page: the hint card stays, the empty note goes, nothing overflows', seen.hint && !seen.note && !seen.overflow, seen);
    await tab.locator('#editor .sf-editor-page-field[data-key="name"] input').fill('Start');
    await tab.locator('#editor .sf-editor-page-field[data-key="name"] input').press('Tab');
    await settle(tab, 200);
    await tab.locator('#editor .sf-editor-page-field[data-key="publish"] sf-button').first().locator('button').click();
    await tab.locator('#editor .sf-editor-page-field[data-key="publish"] sf-button').last().locator('button').click();
    await settle(tab, 200);
    const events = await tab.evaluate(() => window.pageEvents);
    check('page: a change and the presses go out to the host', events.some((event) => event.type === 'change' && event.key === 'name' && event.value === 'Start') && events.some((event) => event.action === 'publish') && events.some((event) => event.action === 'history'), events);
    // The slot page: the host's own markup in the panel.
    await tab.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.pageSettings = null;
      const own = document.createElement('p');
      own.className = 'probe-page-slot';
      own.textContent = 'Host page tools';
      editor.setSlot('page', own);
    });
    await settle(tab, 300);
    const slotted = await tab.evaluate(() => Boolean(document.querySelector('#editor .sf-editor-right [data-slot="page"] .probe-page-slot')));
    check('page: the slot page is drawn in the panel', slotted, null);
    check('page: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 1));
  process.exit(1);
}
console.log('editor 1.2.0 host checks: every check passed');
