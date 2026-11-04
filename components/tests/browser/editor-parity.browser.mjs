#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-editor 1.1.0 on the built bytes: the visual parity with the accepted
// prototype (ui-control prototypes/block-editor.html, brief
// control/ui-editor/visual-parity-2026-11-04), each item measured in a real
// browser at 1440 (light and dark) and 390:
// 1 density: the editor's own words are 14/20 or 12/16, never the page's 16;
// 2 the catalogue: Framework sections in the Framework's order, each with an
//   icon and a count, opened in place with «Back»; search names the section;
//   no name spills out of its row;
// 3 variant previews drawn from each variant's tree differ from each other;
// 4 the parameter panel: icon, name and section; Parameters / JSON / HTML;
//   fields under Content, Layout and More, each with its origin dot, reset
//   and Framework binding; the type's effective value; a short empty state;
// 5 the chosen block: a frame and a floating bar above it, at its end edge;
//   + and the grip in the gutter with a first-use hint until used;
// 6 the canvas: a sheet at least the prototype's 792 at 1440, with a shadow,
//   on a quieter background; the template lock is a chip in the corner; the
//   status bar is 32 high at 12px;
// 7 the bar: one row, the screens in the centre, help, output and theme as
//   32 px icon buttons, «Edit template» a link, the host's slotted controls
//   (slots start and actions) in the same row;
// G-40 text typed in a site block's instance is kept in data.texts, through
//   drawing again and undo;
// G-41 the + catalogue low in the window stays inside it, its list scrolled.
import {resolve, join} from 'node:path';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
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
// The fonts the sheets name (the icon font among them): icons draw without the
// Loader since ui-source 2f1865e8, so the page must get the glyphs, not the ligature words.
const fonts = new Map();
const scan = (dir) => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) scan(path);
    else if (/\.(woff2?|ttf)$/u.test(name)) fonts.set(name, path);
  }
};
scan(join(out, 'core'));
scan(join(out, 'component'));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.join(', ')}`);

const t = (value) => [{type: 'text', value}];
const DOC = {
  schema: 'simai.composition.document', schema_version: 1, id: 'home', profile: 'ui-layout', locale: 'ru',
  root: {id: 'regs', type: 'layout.regions', slots: {regions: [
    {id: 'hd', type: 'layout.region', props: {name: 'header', landmark: 'banner'}, slots: {default: [{id: 'logo', type: 'content.paragraph', data: {content: t('SIMAI')}}]}},
    {id: 'mn', type: 'layout.region', props: {name: 'main', landmark: 'main'}, slots: {default: [
      {id: 's1', type: 'layout.section', slots: {default: [
        {id: 'a1', type: 'layout.area', slots: {default: [
          {id: 'h1', type: 'content.heading', data: {level: 1, content: t('Страница из блоков')}},
          {id: 'p1', type: 'content.paragraph', data: {content: t('Макет и текст — одно дерево блоков.')}},
        ]}},
      ]}},
      {id: 's2', type: 'layout.section', slots: {default: [
        {id: 'a2', type: 'layout.area', slots: {default: [
          {id: 'h2', type: 'content.heading', data: {level: 2, content: t('Как здесь работать')}},
          {id: 'p2', type: 'content.paragraph', data: {content: t('Щёлкните по любому тексту и печатайте.')}},
        ]}},
      ]}},
    ]}},
    {id: 'ft', type: 'layout.region', props: {name: 'footer', landmark: 'contentinfo'}, slots: {default: [{id: 'copy', type: 'content.paragraph', data: {content: t('Подвал')}}]}},
  ]}},
};
// The Framework's catalogue order (core.runtime CATALOGUE_GROUPS).
const ORDER = ['text', 'media', 'elements', 'layout', 'page-parts', 'marketing', 'data', 'forms'];

const failures = [];
const check = (label, condition, got) => { if (!condition) failures.push({case: label, got}); };
const browser = await chromium.launch();
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const END = MOD === 'Meta' ? 'Meta+ArrowDown' : 'Control+End';

async function open({viewport = {width: 1440, height: 900}, theme = 'light', slots = false} = {}) {
  const tab = await browser.newPage({viewport, colorScheme: theme});
  tab.errors = [];
  tab.on('pageerror', (error) => { if (!/Automatic publicPath/u.test(error.message)) tab.errors.push(error.message); });
  const markup = `<!doctype html><html class="theme-${theme}" lang="ru"><head><meta charset="utf-8"><title>sf-editor</title></head><body style="margin:0;height:100vh"><div id="box" style="height:100vh"></div></body></html>`;
  await tab.route('https://editor.probe/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (/\.(woff2?|ttf)$/u.test(name)) {
      const file = fonts.get(name);
      return file ? route.fulfill({status: 200, contentType: 'font/woff2', body: readFileSync(file)}) : route.fulfill({status: 404, body: ''});
    }
    return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: markup});
  });
  await tab.goto('https://editor.probe/');
  for (const style of styles) await tab.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await tab.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await tab.waitForFunction(() => Boolean(customElements.get('sf-editor')));
  await tab.evaluate(({doc, slots}) => {
    window.changes = [];
    const editor = document.createElement('sf-editor');
    editor.id = 'editor';
    editor.addEventListener('change', (event) => window.changes.push(event.detail.document));
    editor.document = doc;
    editor.rights = {layout: true, template: true, builder: true};
    editor.theme = {name: 'brand', label: 'Фирменная', defaults: {}};
    // The page's name and caption, as the host gives them.
    editor.setAttribute('heading', 'Главная');
    editor.setAttribute('caption', 'Страница сайта · черновик');
    // A host's own controls: the page list toggle at the start, the language at the end.
    if (slots) editor.innerHTML = '<sf-button-icon slot="start" id="host-pages" size="1/2" appearance="ghost" scheme="on-surface-variant" icon="menu" aria-label="Страницы"></sf-button-icon><sf-button slot="actions" id="host-lang" size="1/2" appearance="link" scheme="on-surface-variant" text="RU"></sf-button>';
    document.getElementById('box').append(editor);
  }, {doc: DOC, slots});
  await tab.waitForSelector('#editor [data-sf-composition-id="p1"]', {timeout: 10000});
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(400);
  return tab;
}
const settle = (tab, ms = 250) => tab.waitForTimeout(ms);
const box = (tab, selector) => tab.locator(selector).first().boundingBox();
const scenario = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push({case: `${name}: the scenario finished`, got: String(error.stack ?? error).split('\n').slice(0, 3).join(' ')});
  }
};
const choose = (tab, id) => tab.evaluate((id) => document.getElementById('editor').choose(id), id);

try {
  await scenario('1 density', async () => {
    const tab = await open();
    await choose(tab, 's1');
    await settle(tab, 400);
    const sizes = await tab.evaluate(() => {
      const px = (selector) => {
        const element = document.querySelector(selector);
        return element ? Number.parseFloat(getComputedStyle(element).fontSize) : null;
      };
      // Every text the editor itself draws (not the page on the sheet): its largest size.
      const chrome = ['.sf-editor-bar', '.sf-editor-left', '.sf-editor-right', '.sf-editor-path', '.sf-editor-toolbar', '.sf-editor-lock-mark'];
      let largest = 0;
      let where = '';
      for (const root of chrome.flatMap((selector) => [...document.querySelectorAll(`#editor ${selector}`)])) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim() || !node.parentElement?.checkVisibility?.() || node.parentElement.closest('.sf-editor-visually-hidden, sf-icon, .sf-icon')) continue;
          const size = Number.parseFloat(getComputedStyle(node.parentElement).fontSize);
          if (size > largest) {
            largest = size;
            where = `${node.parentElement.className || node.parentElement.tagName}: ${node.textContent.trim().slice(0, 30)}`;
          }
        }
      }
      return {
        body: px('#editor .sf-editor'), label: px('#editor .sf-editor-field-label'), hint: px('#editor .sf-editor-hint'),
        binding: px('#editor .sf-editor-utility'), origin: px('#editor .sf-editor-origin'), heading: px('#editor .sf-editor-heading'),
        path: px('#editor .sf-editor-path'), keys: px('#editor .sf-editor-keys'), title: px('#editor .sf-editor-panel-title'),
        lock: px('#editor .sf-editor-lock-mark'), largest, where,
      };
    });
    check('1: the editor\'s text is 14px, labels, hints, origins, bindings, headings and the status bar 12px', sizes.body === 14 && sizes.label === 12 && sizes.hint === 12 && sizes.binding === 12 && sizes.origin === 12 && sizes.heading === 12 && sizes.path === 12 && sizes.keys === 12 && sizes.title === 14, sizes);
    check('1: no text the editor draws (bar, panels, status bar, floating bar, lock chip) is larger than 14px', sizes.largest <= 14 && sizes.lock === 12, sizes);
    await tab.close();
  });

  await scenario('2 catalogue', async () => {
    const tab = await open();
    const list = await tab.evaluate(() => [...document.querySelectorAll('#editor .sf-editor-section-row')].map((row) => ({
      id: row.dataset.section,
      icon: row.querySelector('sf-icon')?.getAttribute('icon') ?? '',
      count: Number(row.querySelector('.sf-editor-count')?.textContent ?? 0),
      name: row.querySelector('.sf-editor-section-name')?.getAttribute('text') ?? '',
      height: Math.round(row.getBoundingClientRect().height),
    })));
    const order = list.map((row) => row.id).filter((id) => ORDER.includes(id));
    check('2: the sections are the Framework\'s, in its order', order.length >= 4 && JSON.stringify(order) === JSON.stringify(ORDER.filter((id) => order.includes(id))), order);
    check('2: each section has an icon, a word and a count; rows are 36 high', list.every((row) => row.icon && row.icon !== 'widgets' && row.name && row.count > 0 && row.height === 36), list);
    const legacy = await tab.evaluate(() => ({
      cards: [...document.querySelectorAll('#editor .sf-editor-left .sf-editor-items')].filter((grid) => getComputedStyle(grid).display === 'grid').length,
      structure: [...document.querySelectorAll('#editor .sf-editor-left h3')].some((heading) => /^Структура$/u.test(heading.textContent.trim())),
    }));
    check('2: no two-column cards and no «Структура» heading in the library', legacy.cards === 0 && !legacy.structure, legacy);
    await tab.locator('#editor .sf-editor-section-row[data-section="layout"] .sf-editor-section-name button').click();
    await settle(tab);
    const opened = await tab.evaluate(() => ({
      back: document.querySelector('#editor .sf-editor-back sf-button')?.getAttribute('text') ?? '',
      sections: document.querySelectorAll('#editor .sf-editor-section-row').length,
      types: [...document.querySelectorAll('#editor .sf-editor-open-section .sf-editor-items > .sf-editor-item')].map((row) => row.dataset.item),
    }));
    check('2: a section opens in place, with «Back» to the sections', opened.back === 'Макет' && opened.sections === 0 && opened.types.length >= 3, opened);
    await tab.locator('#editor .sf-editor-back button').click();
    await settle(tab);
    check('2: «Back» returns to the sections', await tab.evaluate(() => document.querySelectorAll('#editor .sf-editor-section-row').length) === list.length, null);
    await tab.locator('#editor .sf-editor-search input').fill('цитата');
    await settle(tab);
    const found = await tab.evaluate(() => [...document.querySelectorAll('#editor .sf-editor-found .sf-editor-group')].map((group) => ({
      heading: group.querySelector('.sf-editor-heading > span')?.textContent.trim(),
      items: [...group.querySelectorAll('[data-item]')].map((row) => row.dataset.item),
    })));
    check('2: a search result names its section', found.some((group) => group.heading === 'Текст' && group.items.includes('content.quote')), found);
    await tab.locator('#editor .sf-editor-search input').fill('');
    await settle(tab);
    // No name spills out of its row: every section and type, at the panel's width.
    for (const section of list.map((row) => row.id)) {
      await tab.locator(`#editor .sf-editor-section-row[data-section="${section}"] .sf-editor-section-name button`).click();
      await settle(tab, 150);
      const spills = await tab.evaluate(() => {
        const panel = document.querySelector('#editor .sf-editor-left').getBoundingClientRect();
        return [...document.querySelectorAll('#editor .sf-editor-left .sf-editor-item, #editor .sf-editor-left .sf-editor-back')]
          .filter((row) => row.getBoundingClientRect().right > panel.right + 0.5 || [...row.querySelectorAll('button, span')].some((part) => part.scrollWidth > part.clientWidth + 1 && getComputedStyle(part).textOverflow !== 'ellipsis' && getComputedStyle(part).overflow !== 'hidden'))
          .map((row) => row.dataset.item ?? 'back');
      });
      check(`2: no label spills out of its row in ${section}`, spills.length === 0, spills);
      await tab.locator('#editor .sf-editor-back button').click();
      await settle(tab, 150);
    }
    await tab.close();
  });

  await scenario('3 variant previews', async () => {
    const tab = await open();
    await tab.locator('#editor .sf-editor-section-row[data-section="layout"] .sf-editor-section-name button').click();
    await settle(tab, 300);
    const previews = await tab.evaluate(() => Object.fromEntries([...document.querySelectorAll('#editor .sf-editor-variant')].map((card) => {
      const preview = card.querySelector('.sf-editor-preview');
      const shape = (element) => [...element.children].map((child) => `${child.className}|${child.getAttribute('style') ?? ''}|${child.dataset.background ?? ''}|${child.dataset.width ?? ''}|${child.dataset.look ?? ''}[${shape(child)}]`).join(',');
      return [card.dataset.item, {shape: shape(preview), cells: preview.querySelectorAll('.sf-editor-shape-card, .sf-editor-shape-cell').length, gap: preview.querySelectorAll('.sf-editor-shape-gap').length, height: Math.round(preview.getBoundingClientRect().height)}];
    })));
    const of = (type) => Object.entries(previews).filter(([key]) => key.startsWith(`${type}#`));
    const distinct = (entries) => new Set(entries.map(([, value]) => value.shape)).size === entries.length;
    const sections = of('layout.section');
    check('3: every layout.section variant looks different', sections.length >= 4 && distinct(sections), sections.map(([key, value]) => [key, value.shape.slice(0, 120)]));
    const grids = of('layout.grid');
    check('3: layout.grid variants draw a row by their columns (2, 3, 4 cards)', grids.length >= 3 && distinct(grids) && grids.map(([, value]) => value.cells).join() === '2,3,4', grids.map(([key, value]) => [key, value.cells]));
    const containers = of('layout.container');
    check('3: layout.container variants look different', containers.length < 2 || distinct(containers), containers.map(([key, value]) => [key, value.shape.slice(0, 120)]));
    check('3: a preview is 56 high', Object.values(previews).every((value) => value.height === 56), Object.values(previews).map((value) => value.height));
    const spacer = await tab.evaluate(() => {
      const editor = document.getElementById('editor');
      const item = editor.catalogue(null).items.find((entry) => entry.type === 'layout.spacer');
      return item ? editor.skeleton(item).map((shape) => shape.kind) : null;
    });
    check('3: layout.spacer draws a gap', spacer === null || spacer.join() === 'gap', spacer);
    const elements = await tab.evaluate(() => {
      const editor = document.getElementById('editor');
      const items = editor.model.registry ? [...editor.model.registry.types.values()].filter((manifest) => /^element\./u.test(manifest.type)) : [];
      return items.flatMap((manifest) => (manifest.variants?.length ? manifest.variants.map((variant) => ({type: manifest.type, variant: variant.id})) : [{type: manifest.type}]))
        .map((item) => ({key: `${item.type}#${item.variant ?? ''}`, shape: JSON.stringify(editor.skeleton(item))}));
    });
    const buttons = elements.filter((entry) => entry.key.startsWith('element.button#'));
    check('3: element.button variants draw a button, an outlined pill or an icon, each different', buttons.length >= 2 && new Set(buttons.map((entry) => entry.shape)).size === buttons.length && buttons.every((entry) => /"kind":"button"|"kind":"dot"/u.test(entry.shape)), buttons);
    await tab.close();
  });

  await scenario('4 parameter panel', async () => {
    const tab = await open();
    const empty = await tab.evaluate(() => ({
      title: document.querySelector('#editor .sf-editor-right .sf-editor-panel-title')?.textContent.trim(),
      note: document.querySelector('#editor .sf-editor-empty-state')?.textContent.trim() ?? '',
      fields: document.querySelectorAll('#editor .sf-editor-right .sf-editor-field').length,
    }));
    check('4: with nothing chosen the panel says so, briefly', empty.note.length > 0 && empty.note.length <= 80 && empty.fields === 0, empty);
    await choose(tab, 's1');
    await settle(tab, 400);
    const panel = await tab.evaluate(() => {
      const right = document.querySelector('#editor .sf-editor-right');
      return {
        icon: right.querySelector('.sf-editor-panel-icon sf-icon')?.getAttribute('icon'),
        iconBox: Math.round(right.querySelector('.sf-editor-panel-icon').getBoundingClientRect().width),
        title: right.querySelector('.sf-editor-panel-title')?.textContent.trim(),
        sub: right.querySelector('.sf-editor-panel-sub')?.textContent.trim(),
        tabs: [...right.querySelectorAll('sf-tabs [role="tab"]')].map((tab) => tab.textContent.trim()),
        groups: [...right.querySelectorAll('.sf-editor-fields > .sf-editor-heading')].map((heading) => heading.textContent.trim()),
        fields: [...right.querySelectorAll('.sf-editor-field[data-origin]')].map((field) => ({
          key: field.dataset.key, origin: field.dataset.origin, dot: Boolean(field.querySelector('.sf-editor-origin-dot')),
          binding: field.querySelector('.sf-editor-utility')?.textContent.trim() ?? '', bindingFont: field.querySelector('.sf-editor-utility') ? getComputedStyle(field.querySelector('.sf-editor-utility')).fontFamily : '',
          reset: Boolean(field.querySelector('.sf-editor-reset')),
        })),
        width: right.querySelector('.sf-editor-field[data-key="width"] .sf-editor-control')?.value,
        padding: right.querySelector('.sf-editor-field[data-key="padding_y"] .sf-editor-control')?.value,
      };
    });
    check('4: the header: the block\'s icon in a 32 square, its name and section', panel.icon === 'crop_landscape' && panel.iconBox === 32 && panel.title === 'Секция' && /Макет/u.test(panel.sub ?? ''), panel);
    check('4: tabs Параметры, JSON, HTML', ['Параметры', 'JSON', 'HTML'].every((word) => panel.tabs.includes(word)), panel.tabs);
    check('4: field groups under Содержимое / Расположение / Дополнительно', panel.groups.includes('Расположение') && panel.groups.includes('Дополнительно') && panel.groups.every((word) => ['Содержимое', 'Расположение', 'Дополнительно'].includes(word)), panel.groups);
    check('4: every field has its origin dot', panel.fields.length > 3 && panel.fields.every((field) => field.dot), panel.fields);
    check('4: a utility field names its SIMAI Framework binding in monospace', panel.fields.some((field) => /^SIMAI Framework: /u.test(field.binding) && /mono/iu.test(field.bindingFont)), panel.fields.map((field) => [field.key, field.binding, field.bindingFont]));
    check('4: the type\'s effective value: width normal and padding 8 from parameter_defaults, origin type', String(panel.width) === 'normal' && String(panel.padding) === '8' && panel.fields.find((field) => field.key === 'width')?.origin === 'type', {width: panel.width, padding: panel.padding, origin: panel.fields.find((field) => field.key === 'width')});
    await tab.evaluate(() => document.getElementById('editor').setParameter({id: 's1', key: 'width', value: 'narrow', screen: 'desktop'}));
    await settle(tab, 400);
    const set = await tab.evaluate(() => {
      const field = document.querySelector('#editor .sf-editor-field[data-key="width"]');
      return {origin: field?.dataset.origin, reset: field?.querySelector('.sf-editor-reset')?.getAttribute('text')};
    });
    check('4: a value set on the block shows «Сбросить»', set.origin === 'block' && set.reset === 'Сбросить', set);
    await tab.locator('#editor .sf-editor-field[data-key="width"] .sf-editor-reset button').click();
    await settle(tab, 400);
    check('4: «Сбросить» brings the type\'s value back', await tab.evaluate(() => document.querySelector('#editor .sf-editor-field[data-key="width"]')?.dataset.origin) === 'type', null);
    await tab.locator('#editor .sf-editor-right sf-tabs [role="tab"]', {hasText: 'JSON'}).click();
    await settle(tab, 300);
    const json = await tab.evaluate(() => document.querySelector('#editor .sf-editor-code')?.textContent ?? '');
    check('4: JSON shows the block as the Document holds it', /"id": "s1"/u.test(json) && /"layout.section"/u.test(json), json.slice(0, 120));
    await tab.locator('#editor .sf-editor-right sf-tabs [role="tab"]', {hasText: 'HTML'}).click();
    await tab.waitForFunction(() => /<section/u.test(document.querySelector('#editor .sf-editor-code')?.textContent ?? ''), null, {timeout: 5000}).catch(() => {});
    const html = await tab.evaluate(() => document.querySelector('#editor .sf-editor-code')?.textContent ?? '');
    check('4: HTML shows the block as the site prints it, with the Framework\'s classes', /<section class="p-y-8"/u.test(html) && /m-inline-auto/u.test(html), html.slice(0, 160));
    await tab.close();
  });

  await scenario('5 selection', async () => {
    const tab = await open();
    const block = await box(tab, '#editor [data-sf-composition-id="h2"]');
    await tab.mouse.move(block.x + block.width / 2, block.y + 6, {steps: 3});
    await settle(tab, 200);
    const hint = await tab.evaluate(() => {
      const element = document.querySelector('#editor .sf-editor-gutter-hint');
      return {shown: Boolean(element && !element.hidden), text: element?.textContent.trim(), size: element ? getComputedStyle(element).fontSize : ''};
    });
    check('5: the first-use hint stands by the gutter, 12px', hint.shown && /⠿/u.test(hint.text) && hint.size === '12px', hint);
    const gutter = await tab.evaluate(() => [...document.querySelectorAll('#editor .sf-editor-gutter button')].map((button) => Math.round(button.getBoundingClientRect().height)));
    check('5: + and the grip in the gutter, 24 high', gutter.length === 2 && gutter.every((height) => height === 24), gutter);
    await choose(tab, 'a2');
    await settle(tab, 300);
    const bar = await tab.evaluate(() => {
      const toolbar = document.querySelector('#editor .sf-editor-toolbar');
      const chosen = document.querySelector('#editor [data-sf-composition-id="a2"]').getBoundingClientRect();
      const frame = document.querySelector('#editor .sf-editor-chosen');
      const rect = toolbar.getBoundingClientRect();
      return {
        visible: getComputedStyle(toolbar).visibility === 'visible' && !toolbar.hidden, frame: !frame.hidden,
        side: toolbar.dataset.side, above: Math.round(chosen.top - rect.bottom), endGap: Math.round(chosen.right - rect.right), height: Math.round(rect.height),
        crumbs: toolbar.querySelector('.sf-editor-crumbs')?.textContent.replace(/\s+/gu, ' ').trim(),
        buttons: [...toolbar.querySelectorAll('sf-button-icon')].map((button) => button.getAttribute('icon')),
        role: toolbar.querySelector('[role="toolbar"]')?.getAttribute('aria-label'),
      };
    });
    check('5: a frame and a floating bar above the chosen block, at its end edge', bar.visible && bar.frame && bar.side === 'above' && bar.above >= 4 && bar.above <= 12 && Math.abs(bar.endGap) <= 1 && bar.height <= 36, bar);
    check('5: the floating bar: the path, grip, up, down, duplicate, more', /Секция.*Текстовая область/u.test(bar.crumbs ?? '') && bar.buttons.join() === 'drag_indicator,arrow_upward,arrow_downward,content_copy,more_horiz' && Boolean(bar.role), bar);
    await choose(tab, 'p2');
    await settle(tab, 300);
    await tab.locator('#editor .sf-editor-toolbar sf-button-icon[icon="arrow_upward"] button').click();
    await settle(tab, 300);
    const moved = await tab.evaluate(() => document.getElementById('editor').model.node('a2').slots.default.map((node) => node.id));
    check('5: «up» on the floating bar moves the chosen block', moved.join() === 'p2,h2', moved);
    await choose(tab, 'a2');
    await settle(tab, 200);
    await tab.keyboard.press(`${MOD}+z`);
    await settle(tab, 300);
    await tab.locator('#editor .sf-editor-toolbar sf-button-icon[icon="more_horiz"] button').click();
    await settle(tab, 300);
    const menu = await tab.evaluate(() => ({for: document.querySelector('#editor .sf-editor-menu')?.dataset.for, items: [...document.querySelectorAll('#editor .sf-editor-menu [role="menuitem"]')].length}));
    check('5: «more» opens the chosen block\'s menu', menu.for === 'a2' && menu.items >= 4, menu);
    await tab.keyboard.press('Escape');
    await settle(tab, 150);
    // The grip was used: the hint is not shown again.
    await tab.mouse.move(block.x + block.width / 2, block.y + 6, {steps: 3});
    await settle(tab, 150);
    await tab.locator('#editor .sf-editor-grip button').click();
    await settle(tab, 200);
    await tab.keyboard.press('Escape');
    await tab.mouse.move(block.x + block.width / 2, block.y + 30, {steps: 3});
    await settle(tab, 200);
    check('5: after the grip is used the hint is gone', await tab.evaluate(() => document.querySelector('#editor .sf-editor-gutter-hint')?.hidden !== false), null);
    // Typing hides the floating bar.
    const text = await box(tab, '#editor [data-sf-composition-id="p2"]');
    await tab.mouse.click(text.x + text.width - 4, text.y + text.height / 2);
    await settle(tab, 200);
    check('5: while typing the floating bar is hidden', await tab.evaluate(() => getComputedStyle(document.querySelector('#editor .sf-editor-toolbar')).visibility !== 'visible' || document.querySelector('#editor .sf-editor-toolbar').hidden), null);
    await tab.close();
  });

  // Second pass on the prototype (2026-11-04): the left panel's quiet search and
  // «make» link, favourites always shown, the light segmented switch with
  // H1–H3 and «more», the panel's cards and rhythm, the hint beside the
  // floating bar, the page's name in the bar, the status bar's ink.
  for (const [label, options] of [['1440 light', {}], ['1440 dark', {theme: 'dark'}], ['390', {viewport: {width: 390, height: 844}}]]) {
    await scenario(`8 second pass ${label}`, async () => {
      const tab = await open(options);
      const left = await tab.evaluate(() => {
        const panel = document.querySelector('#editor .sf-editor-left');
        if (!panel?.checkVisibility?.()) return null;
        const field = panel.querySelector('.sf-editor-search input')?.closest('[class*="sf-input"]:not(sf-input)') ?? panel.querySelector('.sf-editor-search > *');
        const style = field ? getComputedStyle(field) : null;
        const make = panel.querySelector('.sf-editor-make > button');
        const makeStyle = make ? getComputedStyle(make) : null;
        const favourites = panel.querySelector('#sf-editor-h-favourites')?.closest('section');
        const sections = panel.querySelector('#sf-editor-h-sections');
        return {
          control: Math.round(document.querySelector('#editor .sf-editor-output-open button').getBoundingClientRect().height),
          height: field ? Math.round(field.getBoundingClientRect().height) : 0,
          border: style ? Number.parseFloat(style.borderTopWidth) * (style.borderTopColor.endsWith(', 0)') || style.borderTopStyle === 'none' ? 0 : 1) : -1,
          fill: style?.backgroundColor ?? '',
          makeHeight: make ? Math.round(make.getBoundingClientRect().height) : 0,
          makeWidth: make ? Math.round(make.getBoundingClientRect().width) : 0,
          panelWidth: Math.round(panel.getBoundingClientRect().width),
          makeBorder: makeStyle ? Number.parseFloat(makeStyle.borderTopWidth) : -1,
          makeFill: makeStyle?.backgroundColor ?? '',
          favourites: favourites ? {heading: favourites.querySelector('.sf-editor-heading > span')?.textContent.trim(), empty: favourites.querySelector('.sf-editor-empty-list')?.textContent.trim() ?? ''} : null,
          sections: sections ? {size: getComputedStyle(sections).fontSize, weight: getComputedStyle(sections).fontWeight} : null,
        };
      });
      if (left) {
        check(`8 ${label}: the search is a filled field, a control of the ladder high (32 at 1440), with no border`, left.height === left.control && (options.viewport || left.height === 32) && left.border === 0 && !/rgba\(0, 0, 0, 0\)|transparent/u.test(left.fill), left);
        check(`8 ${label}: «Создать свой блок» is a small quiet link, not a full-width box`, left.makeHeight > 0 && left.makeHeight <= 28 && left.makeWidth < left.panelWidth - 32 && left.makeBorder === 0 && /rgba\(0, 0, 0, 0\)|transparent/u.test(left.makeFill), left);
        check(`8 ${label}: Избранное is shown, with a short hint while empty`, left.favourites?.heading === 'Избранное' && left.favourites.empty.length > 0 && left.favourites.empty.length <= 60, left.favourites);
        check(`8 ${label}: «Разделы» is a 12px medium heading`, left.sections?.size === '12px' && Number(left.sections.weight) >= 500, left.sections);
      }
      const bar = await tab.evaluate(() => {
        const title = document.querySelector('#editor .sf-editor-title');
        const toggle = document.querySelector('#editor .sf-editor-template-toggle');
        const path = document.querySelector('#editor .sf-editor-path');
        const ink = (element) => element ? getComputedStyle(element).color : '';
        const variant = getComputedStyle(document.querySelector('#editor .sf-editor-keys') ?? document.body).color;
        return {
          name: title?.querySelector('.sf-editor-title-name')?.textContent.trim(), caption: title?.querySelector('.sf-editor-title-caption')?.textContent.trim(),
          body: getComputedStyle(document.querySelector('#editor .sf-editor')).fontSize,
          control: Math.round(document.querySelector('#editor .sf-editor-output-open button').getBoundingClientRect().height),
          nameSize: title ? getComputedStyle(title.querySelector('.sf-editor-title-name')).fontSize : '', captionSize: title?.querySelector('.sf-editor-title-caption') ? getComputedStyle(title.querySelector('.sf-editor-title-caption')).fontSize : '',
          toggleIcon: Boolean(toggle?.querySelector('.sf-icon, sf-icon')), toggleBorder: toggle?.querySelector('button') ? Number.parseFloat(getComputedStyle(toggle.querySelector('button')).borderTopWidth) : -1,
          crumbs: [...(path?.querySelectorAll('sf-button > button') ?? [])].map((button) => ink(button)), variant,
        };
      });
      check(`8 ${label}: the page's name (the editor's text, 14 at 1440) and caption (12) at the start of the bar`, bar.name === 'Главная' && bar.caption === 'Страница сайта · черновик' && bar.nameSize === bar.body && (options.viewport || bar.nameSize === '14px') && bar.captionSize === '12px', bar);
      check(`8 ${label}: «Изменить шаблон» is a quiet text link with no icon`, !bar.toggleIcon && bar.toggleBorder === 0, bar);
      await choose(tab, 'h2');
      await settle(tab, 400);
      check(`8 ${label}: every step of the status bar is on-surface-variant`, bar.crumbs.length >= 0 && await tab.evaluate(() => {
        const variant = getComputedStyle(document.querySelector('#editor .sf-editor-keys')).color;
        const steps = [...document.querySelectorAll('#editor .sf-editor-path sf-button > button')];
        const ink = (button) => getComputedStyle(button.querySelector('.sf-button-text-container, .sf-button-text') ?? button).color;
        return steps.length >= 3 && steps.every((button) => ink(button) === variant);
      }), null);
      const level = await tab.evaluate(() => {
        const right = document.querySelector('#editor .sf-editor-right');
        if (!right?.checkVisibility?.()) return null;
        const row = right.querySelector('.sf-editor-field[data-key="level"]');
        const group = row?.querySelector('.sf-button-group');
        const segments = [...(group?.querySelectorAll('.sf-button-group-segment') ?? [])];
        const active = segments.find((segment) => segment.classList.contains('active'));
        const probe = document.createElement('span');
        probe.style.color = 'var(--sf-primary)';
        right.append(probe);
        const primary = getComputedStyle(probe).color;
        probe.remove();
        return {
          labels: segments.map((segment) => segment.textContent.trim()), active: active?.textContent.trim(),
          activeFill: active ? getComputedStyle(active).backgroundColor : '', activeShadow: active ? getComputedStyle(active).boxShadow : '', primary,
          height: group ? Math.round(group.getBoundingClientRect().height) : 0,
          more: Boolean(row?.querySelector('.sf-editor-more-steps')),
          sameRow: (() => {
            const more = row?.querySelector('.sf-editor-more-steps > *')?.getBoundingClientRect();
            const track = group?.getBoundingClientRect();
            return Boolean(more && track) && Math.abs(more.top - track.top) <= 1 && more.left >= track.right;
          })(),
          primaryPlates: [...right.querySelectorAll('.sf-button-group--segmented > .sf-button-group-segment.active')].filter((segment) => getComputedStyle(segment).backgroundColor === primary).length,
        };
      });
      if (level) {
        check(`8 ${label}: the heading level is H1–H3 with the rest behind «ещё»`, level.labels.join() === 'H1,H2,H3' && level.active === 'H2' && level.more && level.sameRow, level);
        check(`8 ${label}: the switch is light: the chosen segment a raised surface with a shadow, no primary fill anywhere`, level.activeFill !== level.primary && level.activeShadow !== 'none' && level.primaryPlates === 0 && level.height === bar.control, level);
        const panel = await tab.evaluate(() => {
          const right = document.querySelector('#editor .sf-editor-right');
          const cards = [...right.querySelectorAll('.sf-editor-card')];
          return {first: cards[0]?.textContent.trim(), firstOnTop: Boolean(cards[0]) && cards[0].compareDocumentPosition(right.querySelector('.sf-editor-fields')) === Node.DOCUMENT_POSITION_FOLLOWING, last: cards.at(-1) === [...right.querySelectorAll('.sf-editor-card, .sf-editor-fields')].at(-1), size: cards[0] ? getComputedStyle(cards[0]).fontSize : '', fill: cards[0] ? getComputedStyle(cards[0]).backgroundColor : '', count: cards.length};
        });
        check(`8 ${label}: a quiet info card on top names SIMAI Framework, the notes are cards at the end`, /SIMAI Framework/u.test(panel.first ?? '') && panel.firstOnTop && panel.last && panel.count >= 2 && panel.size === '12px' && !/rgba\(0, 0, 0, 0\)/u.test(panel.fill), panel);
      }
      // Alignment and «show on this screen» on a heading, as the prototype (Framework 2f1865e8).
      const sets = await tab.evaluate(() => {
        const right = document.querySelector('#editor .sf-editor-right');
        const align = right.querySelector('.sf-editor-field[data-key="align"]');
        const hidden = right.querySelector('.sf-editor-field[data-key="hidden"]');
        return {
          align: align ? {label: align.querySelector('.sf-editor-field-label')?.textContent.trim(), options: [...align.querySelectorAll('.sf-button-group-segment')].length, icons: [...align.querySelectorAll('.sf-button-group-segment sf-icon, .sf-button-group-segment .sf-icon')].length, group: align.closest('.sf-editor-fields')?.querySelector('.sf-editor-heading')?.textContent.trim()} : null,
          shown: hidden ? {label: hidden.querySelector('.sf-editor-field-label')?.textContent.trim(), active: hidden.querySelector('.sf-button-group-segment.active')?.textContent.trim()} : null,
          card: right.querySelector('.sf-editor-sets')?.textContent.trim(),
        };
      });
      check(`8 ${label}: a heading offers «Выравнивание» (three options) and «Показывать на этом экране» (Да while not hidden)`, sets.align?.label === 'Выравнивание' && sets.align.options === 3 && sets.align.icons >= 3 && sets.shown?.label === 'Показывать на этом экране' && sets.shown.active === 'Да' && /Выравнивание · Видимость/u.test(sets.card ?? ''), sets);
      if (!options.viewport) {
        await tab.locator('#editor .sf-editor-field[data-key="hidden"] .sf-button-group-segment', {hasText: 'Нет'}).click();
        await settle(tab, 300);
        const hiddenNow = await tab.evaluate(() => JSON.stringify(document.getElementById('editor').model.node('h2').props?.hidden ?? null));
        check(`8 ${label}: «Нет» on «Показывать на этом экране» keeps hidden: true in the Document`, /true/u.test(hiddenNow), hiddenNow);
        await tab.locator('#editor .sf-editor-field[data-key="hidden"] .sf-button-group-segment', {hasText: 'Да'}).click();
        await settle(tab, 300);
      }
      if (!options.viewport) {
        await choose(tab, 's1');
        await settle(tab, 400);
        const rhythm = await tab.evaluate(() => {
          const fields = [...document.querySelectorAll('#editor .sf-editor-right .sf-editor-fields')].find((group) => group.querySelectorAll(':scope > .sf-editor-field').length >= 2);
          const [one, two] = fields.querySelectorAll(':scope > .sf-editor-field');
          const head = one.querySelector('.sf-editor-field-head').getBoundingClientRect();
          const control = one.querySelector('.sf-editor-control');
          const target = (control.getBoundingClientRect().height ? control : control.firstElementChild).getBoundingClientRect();
          return {label: getComputedStyle(one.querySelector('.sf-editor-field-label')).fontSize, toControl: Math.round(target.top - head.bottom), between: Math.round(two.getBoundingClientRect().top - one.getBoundingClientRect().bottom)};
        });
        check(`8 ${label}: the panel's rhythm: label 12px, 8 to the control, 16 between fields`, rhythm.label === '12px' && rhythm.toControl === 8 && rhythm.between === 16, rhythm);
        // The first-use hint beside the chosen block's floating bar: nothing overlaps.
        await choose(tab, 'h2');
        await settle(tab, 300);
        const block = await box(tab, '#editor [data-sf-composition-id="h2"]');
        await tab.mouse.move(block.x + block.width / 2, block.y + block.height / 2, {steps: 3});
        await settle(tab, 300);
        const overlap = await tab.evaluate(() => {
          const rect = (selector) => {
            const element = document.querySelector(selector);
            if (!element || element.hidden || getComputedStyle(element).visibility !== 'visible') return null;
            const r = element.getBoundingClientRect();
            return {top: r.top, bottom: r.bottom, left: r.left, right: r.right};
          };
          const meets = (a, b) => Boolean(a && b) && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          const hint = rect('#editor .sf-editor-gutter-hint');
          const bar = rect('#editor .sf-editor-toolbar');
          const gutter = rect('#editor .sf-editor-gutter');
          return {hint, bar, gutter, barHit: meets(hint, bar), gutterHit: meets(hint, gutter)};
        });
        check(`8 ${label}: the first-use hint and the floating bar are both shown and do not overlap; the hint stays off the gutter`, Boolean(overlap.hint && overlap.bar) && !overlap.barHit && !overlap.gutterHit, overlap);
      }
      check(`8 ${label}: no page error`, tab.errors.length === 0, tab.errors);
      await tab.close();
    });
  }

  for (const [label, options] of [['1440 light', {}], ['1440 dark', {theme: 'dark'}], ['390', {viewport: {width: 390, height: 844}}]]) {
    await scenario(`6 canvas ${label}`, async () => {
      const tab = await open(options);
      const canvas = await tab.evaluate(() => {
        const sheet = document.querySelector('#editor .sf-editor-frame');
        const stage = document.querySelector('#editor .sf-editor-canvas');
        const header = document.querySelector('#editor [data-sf-composition-id="hd"]').getBoundingClientRect();
        const mark = document.querySelector('#editor [data-sf-composition-id="hd"] .sf-editor-lock-mark');
        const markBox = mark?.getBoundingClientRect();
        const path = document.querySelector('#editor .sf-editor-path');
        return {
          sheet: Math.round(sheet.getBoundingClientRect().width), shadow: getComputedStyle(sheet).boxShadow !== 'none',
          sheetBg: getComputedStyle(sheet).backgroundColor, canvasBg: getComputedStyle(stage).backgroundColor,
          mark: markBox ? {top: Math.round(markBox.top - header.top), end: Math.round(header.right - markBox.right), height: Math.round(markBox.height), position: getComputedStyle(mark).position, text: mark.lastElementChild?.textContent.trim()} : null,
          headerHeight: Math.round(header.height),
          path: {height: Math.round(path.getBoundingClientRect().height), size: getComputedStyle(path).fontSize, control: Math.round(document.querySelector('#editor .sf-editor-output-open button').getBoundingClientRect().height)},
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      if (!options.viewport) check(`6 ${label}: the sheet is at least the prototype's 792 at 1440`, canvas.sheet >= 792, canvas.sheet);
      check(`6 ${label}: the sheet has a soft shadow on a different background`, canvas.shadow && canvas.sheetBg !== canvas.canvasBg, canvas);
      check(`6 ${label}: the template lock is a chip in the template's corner, not a line of its own`, canvas.mark && canvas.mark.position === 'absolute' && canvas.mark.top >= 0 && canvas.mark.top <= 12 && canvas.mark.end >= 0 && canvas.mark.end <= 12 && canvas.mark.height <= 20 && canvas.mark.text === 'Шаблон', canvas.mark);
      // The Framework's control ladder is responsive: 32 at 1440, a step less on a phone.
      check(`6 ${label}: the status bar is a 1/2 control high (32 at 1440) at 12px`, canvas.path.height === canvas.path.control && (options.viewport || canvas.path.height === 32) && canvas.path.size === '12px', canvas.path);
      check(`6 ${label}: the page never scrolls sideways`, canvas.scroll <= 0, canvas.scroll);
      await tab.close();
    });
  }

  await scenario('7 bar', async () => {
    const tab = await open({slots: true});
    const bar = await tab.evaluate(() => {
      const element = document.querySelector('#editor .sf-editor-bar');
      const rect = element.getBoundingClientRect();
      const centre = (node) => { const b = node.getBoundingClientRect(); return Math.round(b.top + b.height / 2); };
      const controls = [...element.querySelectorAll('button')].filter((button) => button.getBoundingClientRect().width > 0);
      // sf-button-group's host draws no box: the screens are its buttons, first to last.
      const buttons = [...element.querySelectorAll('.sf-editor-screens button')].map((button) => button.getBoundingClientRect());
      const screens = {left: Math.min(...buttons.map((b) => b.left)), width: Math.max(...buttons.map((b) => b.right)) - Math.min(...buttons.map((b) => b.left))};
      const icon = (selector) => { const button = element.querySelector(`${selector} button`); const b = button?.getBoundingClientRect(); return b ? [Math.round(b.width), Math.round(b.height)] : null; };
      const template = element.querySelector('.sf-editor-template-toggle > button');
      // The hosts' sf-button and sf-button-icon draw no box of their own: their buttons do.
      const pages = document.querySelector('#host-pages button');
      const lang = document.querySelector('#host-lang button');
      return {
        height: Math.round(rect.height), rows: new Set(controls.map(centre)).size, centres: [...new Set(controls.map(centre))],
        screensOffset: Math.round(screens.left + screens.width / 2 - (rect.left + rect.width / 2)),
        help: icon('.sf-editor-help-open'), output: icon('.sf-editor-output-open'), theme: icon('.sf-editor-theme-open'),
        template: template ? {border: getComputedStyle(template).borderTopWidth, appearance: template.parentElement.getAttribute('appearance'), height: Math.round(template.getBoundingClientRect().height)} : null,
        pages: pages && element.contains(pages) ? centre(pages) : null, lang: lang && element.contains(lang) ? centre(lang) : null, barCentre: centre(element),
        pagesFirst: pages ? element.querySelector('.sf-editor-bar-start').firstElementChild.contains(pages) : false,
        langBeforeHelp: lang ? Boolean(lang.compareDocumentPosition(element.querySelector('.sf-editor-help-open')) & Node.DOCUMENT_POSITION_FOLLOWING) : false,
      };
    });
    check('7: one bar row of 48 at 1440', bar.height === 48 && bar.rows === 1, bar);
    check('7: the screens are in the centre', Math.abs(bar.screensOffset) <= 2, bar.screensOffset);
    check('7: help, output and theme are 32px icon buttons', [bar.help, bar.output, bar.theme].every((size) => size && size[0] === 32 && size[1] === 32), {help: bar.help, output: bar.output, theme: bar.theme});
    check('7: «Изменить шаблон» is a link, not a full outlined button', bar.template && bar.template.appearance === 'link' && bar.template.height <= 32, bar.template);
    check('7: the host\'s slotted controls (slots start and actions) stand in the same row', bar.pages !== null && bar.lang !== null && Math.abs(bar.pages - bar.barCentre) <= 2 && Math.abs(bar.lang - bar.barCentre) <= 2 && bar.pagesFirst && bar.langBeforeHelp, bar);
    await tab.locator('#editor .sf-editor-help-open button').click();
    await settle(tab, 200);
    const help = await tab.evaluate(() => document.querySelectorAll('#editor .sf-editor-help-pop li').length);
    check('7: help opens a short list of how to edit', help === 4, help);
    await tab.keyboard.press('Escape');
    await tab.close();
    const phone = await open({slots: true, viewport: {width: 390, height: 844}});
    const narrow = await phone.evaluate(() => ({scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, height: Math.round(document.querySelector('#editor .sf-editor-bar').getBoundingClientRect().height)}));
    // With a host's controls in both slots: at most three rows of 1/2 controls, never sideways.
    check('7: at 390 the bar wraps (the screens on a row of their own), never sideways', narrow.scroll <= 0 && narrow.height <= 112, narrow);
    await phone.close();
  });

  await scenario('G-41', async () => {
    // The + low in the window (1440x900): the catalogue stays inside it and every option can be pressed.
    const tab = await open();
    await tab.evaluate(() => {
      const canvas = document.querySelector('#editor .sf-editor-canvas');
      const block = document.querySelector('#editor [data-sf-composition-id="p2"]');
      canvas.scrollTop += block.getBoundingClientRect().top - 560;
    });
    await settle(tab, 200);
    const at = await box(tab, '#editor [data-sf-composition-id="p2"]');
    await tab.mouse.move(at.x + at.width / 2, at.y + Math.min(10, at.height / 2), {steps: 3});
    await settle(tab, 200);
    await tab.locator('#editor .sf-editor-plus button').click();
    await settle(tab, 400);
    const pop = await tab.evaluate(() => {
      const element = document.querySelector('#editor .sf-editor-pop');
      const rect = element.getBoundingClientRect();
      const options = [...element.querySelectorAll('[role="option"]')];
      return {top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: innerHeight, options: options.length, last: options.at(-1)?.dataset.item};
    });
    check('G-41: the + catalogue stands inside the window', pop.top >= 0 && pop.bottom <= pop.height, pop);
    const last = tab.locator('#editor .sf-editor-pop [role="option"]').last();
    await last.scrollIntoViewIfNeeded();
    const lastBox = await last.boundingBox();
    check('G-41: its last option is within the window once its list scrolls', lastBox && lastBox.y >= 0 && lastBox.y + lastBox.height <= pop.height, lastBox);
    const before = await tab.evaluate(() => document.getElementById('editor').model.node('a2').slots.default.length);
    await last.click();
    await settle(tab, 300);
    check('G-41: the last option can be pressed and inserts its block', await tab.evaluate(() => document.getElementById('editor').model.node('a2').slots.default.length) === before + 1, pop.last);
    await tab.close();
  });

  await scenario('G-40', async () => {
    const tab = await open();
    await tab.evaluate(() => {
      window.saved = [];
      document.getElementById('editor').addEventListener('sf-editor-block-save', (event) => window.saved.push(event.detail.manifest));
      document.getElementById('editor').openBuilder({from: 's2'});
    });
    await settle(tab, 400);
    await tab.locator('#editor .sf-editor-builder-bar sf-input input').fill('Наш блок');
    await tab.locator('#editor .sf-editor-builder-bar sf-input input').press('Tab');
    await settle(tab, 150);
    await tab.locator('#editor .sf-editor-builder-bar sf-button[scheme="primary"] button').click();
    await settle(tab, 500);
    const instance = await tab.evaluate(() => document.getElementById('editor').model.doc.root.slots.regions[1].slots.default.find((node) => /^site\./u.test(node.type))?.id);
    check('G-40: the page holds an instance of the site block', Boolean(instance), instance);
    const dataOf = () => tab.evaluate((id) => {
      const find = (node) => (node.id === id ? node : Object.values(node.slots ?? {}).flat().map(find).find(Boolean));
      return find(document.getElementById('editor').model.doc.root)?.data ?? null;
    }, instance);
    const plain = (content) => (content ?? []).map((part) => part.value ?? '').join('');
    // As the host's driver does (scenario S08): choose the instance, press near its start, type.
    await choose(tab, instance);
    await settle(tab, 300);
    const at = await box(tab, `#editor [data-sf-composition-id="${instance}"]`);
    await tab.mouse.move(at.x + 4, at.y + Math.min(10, at.height / 2), {steps: 3});
    await settle(tab, 150);
    await tab.mouse.click(at.x + 4, at.y + Math.min(10, at.height / 2));
    await tab.keyboard.press(END);
    await settle(tab);
    await tab.keyboard.type(' — наш');
    await tab.keyboard.press('Escape');
    await settle(tab, 300);
    let data = await dataOf();
    check('G-40: a press on the chosen instance types in its nearest text, kept in data.texts', Object.values(data?.texts ?? {}).some((content) => plain(content).endsWith('— наш')), data);
    // A press right on a text of the instance types there.
    const text = await box(tab, `#editor [data-sf-composition-id="${instance}"] p`);
    await tab.mouse.click(text.x + text.width - 3, text.y + text.height / 2);
    await tab.keyboard.press(END);
    await tab.keyboard.type(' ещё');
    await tab.keyboard.press('Escape');
    await settle(tab, 300);
    data = await dataOf();
    check('G-40: a press on a text of the instance types there', Object.values(data?.texts ?? {}).some((content) => plain(content).endsWith(' ещё')), data);
    // Enter on the chosen instance goes into its first text.
    await choose(tab, instance);
    await tab.locator('#editor .sf-editor-canvas').focus();
    await tab.keyboard.press('Enter');
    await settle(tab, 200);
    const typing = await tab.evaluate(() => document.getElementById('editor').model.typing?.id ?? null);
    check('G-40: Enter on a chosen instance types in its first text', typeof typing === 'string' && typing.startsWith(`${instance}:`), typing);
    await tab.keyboard.press('Escape');
    await tab.evaluate(() => document.getElementById('editor').redraw());
    await settle(tab, 400);
    const drawn = await tab.locator(`#editor [data-sf-composition-id="${instance}"]`).first().innerText();
    check('G-40: the typed text survives drawing again', /— наш/u.test(drawn) && / ещё/u.test(drawn), drawn.slice(0, 200));
    const emitted = await tab.evaluate((id) => {
      const doc = window.changes.at(-1);
      const find = (node) => (node.id === id ? node : Object.values(node.slots ?? {}).flat().map(find).find(Boolean));
      return Boolean(doc && Object.keys(find(doc.root)?.data?.texts ?? {}).length);
    }, instance);
    check('G-40: the host\'s change carries the texts', emitted, emitted);
    await tab.locator('#editor .sf-editor-canvas').focus();
    await tab.keyboard.press(`${MOD}+z`);
    await settle(tab, 300);
    data = await dataOf();
    check('G-40: undo takes back the last typing only', Object.values(data?.texts ?? {}).some((content) => plain(content).endsWith('— наш')) && !Object.values(data?.texts ?? {}).some((content) => plain(content).endsWith(' ещё')), data);
    check('G-40: no page errors', tab.errors.length === 0, tab.errors.slice(0, 3));
    await tab.close();
  });
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 1));
  process.exit(1);
}
console.log('editor parity: every check passed');
