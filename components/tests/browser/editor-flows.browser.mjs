#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-editor, the one block editor, on the built bytes, driven by a real
// pointer and keyboard (Playwright mouse and keys, no synthetic events):
// - the page is drawn by the Framework's renderers; the site template
//   (header, footer) is dimmed with a lock and says why on a press;
// - depth: a press on text types, Esc goes up (the block, then its area),
//   Enter goes down; Enter in text splits, Backspace at the start joins;
// - one undo history: typing and a structure change undone in turn;
// - Alt+arrows move the chosen block, Alt+Shift+arrows while typing;
// - the grip drags a block with a drop line; a drop at a block's side makes columns;
// - insert three ways: + between blocks, / in an empty line, a library card dragged;
// - the catalogue: a tab with nothing that fits is hidden; search finds in both languages;
// - the parameter panel: values carry their origin; a value set for a screen;
// - rights: with layout false the section is locked, the area's text is typed;
//   the template is a separate, explicit edit (scope template in change);
// - output: JSON, HTML and Markdown; the words in Russian; RTL; reduced motion.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const parts = ['icon', 'button', 'button-icon', 'button-group', 'tabs', 'input', 'dropdown', 'switch', 'skeleton', 'menu-context', 'modal', 'editor-inline'];
// The parts' own sheets, as the Loader would bring them on a real page.
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

const t = (value) => [{type: 'text', value}];
const DOCUMENT = {
  schema: 'simai.composition.document', schema_version: 1, id: 'home', profile: 'ui-layout', locale: 'en',
  root: {id: 'regs', type: 'layout.regions', slots: {regions: [
    {id: 'hd', type: 'layout.region', props: {name: 'header', landmark: 'banner'}, slots: {default: [{id: 'logo', type: 'content.paragraph', data: {content: t('Site name')}}]}},
    {id: 'mn', type: 'layout.region', props: {name: 'main', landmark: 'main'}, slots: {default: [
      {id: 's1', type: 'layout.section', props: {width: 'normal'}, slots: {default: [
        {id: 'a1', type: 'layout.area', slots: {default: [
          {id: 'h1', type: 'content.heading', data: {level: 1, content: t('Title of the page')}},
          {id: 'p1', type: 'content.paragraph', data: {content: t('First paragraph of the page')}},
          {id: 'p2', type: 'content.paragraph', data: {content: t('Second paragraph of the page')}},
        ]}},
      ]}},
    ]}},
    {id: 'ft', type: 'layout.region', props: {name: 'footer', landmark: 'contentinfo'}, slots: {default: [{id: 'copy', type: 'content.paragraph', data: {content: t('Footer line')}}]}},
  ]}},
};

const failures = [];
const note = (detail) => failures.push(detail);
const check = (label, condition, got) => { if (!condition) note({case: label, got}); };
const errors = [];
const browser = await chromium.launch();
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
// Home and End of a line: on macOS the browser moves the caret with ⌘← and ⌘→.
const HOME = MOD === 'Meta' ? 'Meta+ArrowLeft' : 'Home';
const END = MOD === 'Meta' ? 'Meta+ArrowRight' : 'End';
try {
  const open = async ({lang = 'en', dir = 'ltr', rights = null, reducedMotion = 'no-preference'} = {}) => {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}, reducedMotion});
    page.on('pageerror', (error) => { if (!/Automatic publicPath/u.test(error.message)) errors.push(error.message); });
    // A secure page: the renderers hash with crypto.subtle, which a blank page lacks.
    const markup = `<!doctype html><html class="theme-light" lang="${lang}" dir="${dir}"><head><meta charset="utf-8"></head><body style="margin:0;height:100vh"><div id="box" style="height:100vh"></div></body></html>`;
    await page.route('https://editor.probe/**', (route) => route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: markup}));
    await page.goto('https://editor.probe/');
    for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
    for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
    await page.waitForFunction(() => Boolean(customElements.get('sf-editor')));
    await page.evaluate(async ({doc, rights}) => {
      window.changes = [];
      window.selects = [];
      const editor = document.createElement('sf-editor');
      editor.id = 'editor';
      editor.addEventListener('change', (event) => window.changes.push({reason: event.detail.reason, scope: event.detail.scope, document: event.detail.document}));
      editor.addEventListener('sf-editor-select', (event) => window.selects.push(event.detail.ids));
      editor.document = doc;
      if (rights) editor.rights = rights;
      editor.theme = {name: 'brand', label: 'Brand', defaults: {}};
      document.getElementById('box').append(editor);
    }, {doc: DOCUMENT, rights});
    await page.waitForSelector('#editor [data-sf-composition-id="p1"]', {timeout: 10000});
    await page.waitForTimeout(300);
    return page;
  };
  const doc = (page) => page.evaluate(() => window.changes.at(-1)?.document ?? null);
  const textOf = (node) => (node?.data?.content ?? []).map((entry) => entry.value).join('');
  const find = (root, id) => {
    if (!root) return null;
    if (root.id === id) return root;
    for (const list of Object.values(root.slots ?? {})) for (const child of list) { const hit = find(child, id); if (hit) return hit; }
    return null;
  };
  const childIds = (document, id) => (find(document.root, id)?.slots?.default ?? []).map((node) => node.id);
  const box = (page, id) => page.locator(`#editor [data-sf-composition-id="${id}"]`).first().boundingBox();
  const state = (page) => page.evaluate(() => {
    const editor = document.getElementById('editor');
    return {selected: editor.model.selected, typing: editor.model.typing?.id ?? null, chosenVisible: !editor.querySelector('.sf-editor-chosen').hidden};
  });

  // 1. The page drawn; the template locked with a reason.
  let page = await open();
  const drawn = await page.evaluate(() => ({
    heading: document.querySelector('#editor [data-sf-composition-id="h1"]')?.tagName,
    lockedHeader: document.querySelector('#editor [data-sf-composition-id="hd"]')?.classList.contains('sf-editor-locked'),
    lockMark: Boolean(document.querySelector('#editor [data-sf-composition-id="hd"] .sf-editor-lock-mark')),
    mainOpen: !document.querySelector('#editor [data-sf-composition-id="mn"]')?.closest('.sf-editor-locked'),
    page: Boolean(document.querySelector('#editor .sf-editor-page section')),
  }));
  check('the page is drawn by the renderers, the header dimmed with a lock, the main region not', drawn.heading === 'H1' && drawn.lockedHeader && drawn.lockMark && drawn.mainOpen && drawn.page, drawn);
  let at = await box(page, 'logo');
  await page.mouse.click(at.x + 10, at.y + at.height / 2);
  await page.waitForTimeout(150);
  const lockNote = await page.evaluate(() => document.querySelector('#editor .sf-editor-lock-note')?.textContent.trim() ?? '');
  check('a press on the template says why it is locked', /template/iu.test(lockNote), lockNote);
  check('a press on the template does not type in it', (await state(page)).typing === null, await state(page));

  // 2. Depth: a press on text types; Esc goes up; Enter goes down.
  at = await box(page, 'p1');
  await page.mouse.click(at.x + at.width - 4, at.y + at.height / 2);
  await page.waitForTimeout(100);
  await page.keyboard.press(END);
  await page.keyboard.type(' typed');
  await page.waitForTimeout(150);
  let now = await doc(page);
  check('a press on text types in it, the change goes out', textOf(find(now?.root, 'p1')) === 'First paragraph of the page typed', textOf(find(now?.root, 'p1')));
  await page.keyboard.press('Escape');
  check('Esc from text chooses its block', (await state(page)).selected === 'p1' && (await state(page)).typing === null, await state(page));
  await page.keyboard.press('Escape');
  check('Esc again chooses the area', (await state(page)).selected === 'a1', await state(page));
  await page.keyboard.press('Enter');
  check('Enter goes down to the first block', (await state(page)).selected === 'h1', await state(page));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check('Enter on a text block types in it', (await state(page)).typing === 'p1', await state(page));

  // 3. Enter splits, Backspace at the start joins; one undo history.
  await page.keyboard.press(END);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await page.keyboard.type('New line');
  await page.waitForTimeout(150);
  now = await doc(page);
  let list = childIds(now, 'a1');
  check('Enter at the end makes the next paragraph', list.length === 4 && textOf(find(now.root, list[2])) === 'New line', list);
  await page.keyboard.press(HOME);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(250);
  now = await doc(page);
  check('Backspace at the start joins it to the one before', childIds(now, 'a1').length === 3 && textOf(find(now.root, 'p1')) === 'First paragraph of the page typedNew line', textOf(find(now.root, 'p1')));
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(250);
  now = await doc(page);
  check('undo brings the join back', childIds(now, 'a1').length === 4, childIds(now, 'a1'));
  await page.keyboard.press(`${MOD}+z`);
  await page.keyboard.press(`${MOD}+z`);
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(250);
  now = await doc(page);
  check('undo goes back through typing and structure in one history', childIds(now, 'a1').length === 3 && textOf(find(now.root, 'p1')) === 'First paragraph of the page', {ids: childIds(now, 'a1'), text: textOf(find(now.root, 'p1'))});

  // 4. Alt+arrows move a chosen block; Alt+Shift+arrows while typing.
  await page.evaluate(() => document.getElementById('editor').choose('p2'));
  await page.locator('#editor .sf-editor-canvas').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await page.waitForTimeout(250);
  check('Alt+↑ moves the chosen block up', JSON.stringify(childIds(await doc(page), 'a1')) === JSON.stringify(['h1', 'p2', 'p1']), childIds(await doc(page), 'a1'));
  at = await box(page, 'p1');
  await page.mouse.click(at.x + 20, at.y + at.height / 2);
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await page.waitForTimeout(300);
  check('Alt+Shift+↑ moves the block while typing goes on', JSON.stringify(childIds(await doc(page), 'a1')) === JSON.stringify(['h1', 'p1', 'p2']) && (await state(page)).typing === 'p1', {ids: childIds(await doc(page), 'a1'), state: await state(page)});
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 5. The grip drags a block with a drop line; a side drop makes columns.
  const dragGrip = async (id, to, {hold} = {}) => {
    const block = await box(page, id);
    await page.mouse.move(block.x + 30, block.y + block.height / 2);
    await page.waitForTimeout(120);
    const grip = await page.locator('#editor .sf-editor-grip button').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 10, grip.y + grip.height / 2 + 10, {steps: 3});
    await page.mouse.move(to.x, to.y, {steps: 8});
    await page.waitForTimeout(80);
    const line = await page.evaluate(() => {
      const drop = document.querySelector('#editor .sf-editor-drop');
      return {shown: !drop.hidden, edge: drop.dataset.edge};
    });
    if (hold) await hold(line);
    await page.mouse.up();
    await page.waitForTimeout(300);
    return line;
  };
  const heading = await box(page, 'h1');
  const line = await dragGrip('p2', {x: heading.x + heading.width / 2, y: heading.y + 3});
  check('a pulled block shows the line where it lands', line.shown && line.edge === 'before', line);
  check('the grip drops a block where the line was', JSON.stringify(childIds(await doc(page), 'a1')) === JSON.stringify(['p2', 'h1', 'p1']), childIds(await doc(page), 'a1'));
  const target = await box(page, 'p1');
  const side = await dragGrip('p2', {x: target.x + target.width - 6, y: target.y + target.height / 2});
  now = await doc(page);
  const columns = JSON.stringify(now).includes('"layout.columns"');
  check('a drop at a block\'s side splits the place into columns', side.edge === 'end' && columns, {side, columns});
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(250);
  check('the side drop is one step of undo', !JSON.stringify(await doc(page)).includes('"layout.columns"'), childIds(await doc(page), 'a1'));

  // 6. Insert: + between blocks, / in an empty line, a library card dragged.
  at = await box(page, 'h1');
  await page.mouse.move(at.x + 30, at.y + at.height / 2);
  await page.waitForTimeout(120);
  await page.locator('#editor .sf-editor-plus button').click();
  await page.waitForTimeout(200);
  const pop = await page.evaluate(() => ({
    open: Boolean(document.querySelector('#editor .sf-editor-pop')),
    options: [...document.querySelectorAll('#editor .sf-editor-pop [role="option"]')].length,
  }));
  check('+ opens the catalogue at the place', pop.open && pop.options > 3, pop);
  await page.keyboard.type('quote');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  now = await doc(page);
  list = childIds(now, 'a1');
  check('+ inserts the found block after the block', find(now.root, list[list.indexOf('h1') + 1])?.type === 'content.quote', list.map((id) => find(now.root, id)?.type));
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.getElementById('editor').choose(null));
  at = await box(page, 'p1');
  await page.mouse.click(at.x + at.width - 4, at.y + at.height / 2);
  await page.keyboard.press(END);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await page.keyboard.type('/head');
  await page.waitForTimeout(250);
  const slash = await page.evaluate(() => [...document.querySelectorAll('#editor .sf-editor-pop [role="option"]')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()));
  check('/ in an empty line opens the catalogue filtered by what follows', slash.length >= 1 && /heading/iu.test(slash[0]), slash);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  now = await doc(page);
  check('/ turns the line into the chosen block', childIds(now, 'a1').some((id) => find(now.root, id)?.type === 'content.heading' && id !== 'h1') && !JSON.stringify(now).includes('/head'), childIds(now, 'a1').map((id) => find(now.root, id)?.type));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('#editor .sf-editor-search input').fill('divider');
  await page.waitForTimeout(200);
  const card = page.locator('#editor .sf-editor-left [data-item="content.divider"]').first();
  const cardBox = await card.boundingBox();
  at = await box(page, 'p2');
  const before = childIds(await doc(page), 'a1').length;
  await page.mouse.move(cardBox.x + 20, cardBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + 40, cardBox.y + 40, {steps: 3});
  await page.mouse.move(at.x + at.width / 2, at.y + at.height - 3, {steps: 10});
  await page.mouse.up();
  await page.waitForTimeout(300);
  now = await doc(page);
  list = childIds(now, 'a1');
  check('a library card dragged onto the page lands at the line', list.length === before + 1 && find(now.root, list[list.indexOf('p2') + 1])?.type === 'content.divider', list.map((id) => find(now.root, id)?.type));

  // 7. The catalogue: tabs by place, hidden when empty; search in both languages.
  const tabs = await page.evaluate(() => {
    const editor = document.getElementById('editor');
    const area = editor.catalogue({parent: 'a1', slot: 'default', index: 0});
    const region = editor.catalogue({parent: 'mn', slot: 'default', index: 0});
    const frame = editor.catalogue({parent: 'regs', slot: 'regions', index: 0});
    return {area: area.tab, regionTab: region.tab, frameTabs: frame.tabs.map((tab) => tab.id)};
  });
  check('a text area opens the catalogue on Text, the page between sections on Blocks; a place nothing fits shows no tab', tabs.area === 'text' && tabs.regionTab === 'blocks' && tabs.frameTabs.length === 0, tabs);
  await page.locator('#editor .sf-editor-search input').fill('Цитата');
  await page.waitForTimeout(200);
  const found = await page.evaluate(() => [...document.querySelectorAll('#editor .sf-editor-left .sf-editor-item')].map((node) => node.dataset.item));
  check('library search finds a block by its Russian word', found.includes('content.quote'), found);
  await page.locator('#editor .sf-editor-search input').fill('');

  // 8. Parameters: origins and a value per screen.
  await page.evaluate(() => document.getElementById('editor').choose('s1'));
  await page.waitForTimeout(200);
  const form = await page.evaluate(() => [...document.querySelectorAll('#editor .sf-editor-field')].map((node) => ({key: node.dataset.key, origin: node.dataset.origin})));
  check('a section shows its parameters, each with where it comes from', form.length > 3 && form.some((field) => field.key === 'width' && field.origin === 'block'), form);
  const set = await page.evaluate(() => document.getElementById('editor').setParameter({id: 's1', key: 'padding_y', value: '6', screen: 'desktop'}));
  check('the set-parameter action answers applied', set?.outcome === 'applied', set);
  await page.locator('#editor .sf-editor-screens [role="radio"], #editor .sf-editor-screens button').last().click();
  await page.waitForTimeout(400);
  const phone = await page.evaluate(() => ({
    screen: document.getElementById('editor').screenName,
    width: Math.round(document.querySelector('#editor .sf-editor-frame').getBoundingClientRect().width),
    origin: document.querySelector('#editor .sf-editor-field[data-key="padding_y"]')?.dataset.origin,
  }));
  check('the screen switch draws the phone width; a desktop value is not the phone\'s', phone.screen === 'phone' && phone.width <= 390 && phone.origin !== 'screen', phone);

  // 9. Output: JSON, HTML, Markdown.
  await page.locator('#editor .sf-editor-output-open button').click();
  await page.waitForTimeout(500);
  const output = await page.evaluate(() => ({
    text: document.querySelector('.sf-editor-output-text')?.textContent ?? '',
    state: document.getElementById('editor').outputView?.format ?? null,
    modal: Boolean(document.querySelector('sf-modal.sf-editor-output')),
  }));
  check('Output shows the Document as JSON', output.text.includes('"simai.composition.document"'), {...output, text: output.text.slice(0, 80)});
  const formats = await page.evaluate(async () => {
    const editor = document.getElementById('editor');
    const html = await editor.output({format: 'html'});
    const markdown = await editor.output({format: 'markdown'});
    const chosen = editor.select({id: 'p2'});
    return {html: html.value ?? '', markdown: markdown.value ?? '', chosen: chosen.outcome, selected: editor.model.selected, unknown: editor.select({id: 'nope'}).reason};
  });
  check('the select action chooses a block and refuses an unknown one', formats.chosen === 'applied' && formats.selected === 'p2' && formats.unknown === 'unknown', formats);
  check('HTML output carries utility classes, Markdown the text areas', /class="[^"]*m-inline-auto/u.test(formats.html) && /^# Title of the page/mu.test(formats.markdown), {html: formats.html.slice(0, 200), markdown: formats.markdown.slice(0, 120)});
  await page.keyboard.press('Escape');
  await page.close();

  // 10a. The block builder: a section made a site block, saved, the page holds an instance.
  page = await open();
  await page.evaluate(() => {
    window.saved = [];
    document.getElementById('editor').addEventListener('sf-editor-block-save', (event) => window.saved.push(event.detail.manifest));
    document.getElementById('editor').openBuilder({from: 's1'});
  });
  await page.waitForTimeout(400);
  await page.locator('#editor .sf-editor-builder-bar sf-input input').fill('Promo');
  await page.locator('#editor .sf-editor-builder-bar sf-input input').press('Tab');
  await page.waitForTimeout(150);
  await page.locator('#editor .sf-editor-builder-bar sf-button[scheme="primary"] button').click();
  await page.waitForTimeout(400);
  const built = await page.evaluate(() => ({saved: window.saved.map((manifest) => `${manifest.type}@${manifest.version}`), builder: Boolean(document.getElementById('editor').builder)}));
  now = await doc(page);
  check('the builder saves a site block and the page holds an instance of it', JSON.stringify(built.saved) === JSON.stringify(['site.promo@1.0.0']) && !built.builder && childIds(now, 'mn').some((id) => find(now.root, id)?.type === 'site.promo'), {built, main: childIds(now, 'mn').map((id) => find(now.root, id)?.type)});
  await page.close();

  // 10. Template: a separate, explicit edit.
  page = await open();
  await page.locator('#editor .sf-editor-bar-start sf-button button').first().click();
  await page.waitForTimeout(400);
  at = await box(page, 'logo');
  await page.mouse.click(at.x + at.width - 4, at.y + at.height / 2);
  await page.keyboard.press(END);
  await page.keyboard.type('!');
  await page.waitForTimeout(200);
  const template = await page.evaluate(() => window.changes.at(-1));
  check('after Edit template the header is typed in and the change says scope template', template?.scope === 'template' && JSON.stringify(template.document).includes('Site name!'), template && {scope: template.scope});
  const pageLocked = await page.evaluate(() => document.querySelector('#editor [data-sf-composition-id="mn"]')?.classList.contains('sf-editor-locked'));
  check('while the template is edited, the page is locked', pageLocked, pageLocked);
  await page.close();

  // 11. Rights: an author writes only in text areas; no builder, no template button.
  page = await open({rights: {layout: false, template: false, builder: false}, lang: 'ru'});
  const author = await page.evaluate(() => ({
    section: document.querySelector('#editor [data-sf-composition-id="s1"]')?.dataset.sfEditorLock === 'layout',
    text: document.querySelector('#editor [data-sf-composition-id="p1"]')?.dataset.sfEditorLock ?? null,
    dimmed: Boolean(document.querySelector('#editor [data-sf-composition-id="p1"]')?.closest('.sf-editor-locked')),
    templateButton: [...document.querySelectorAll('#editor .sf-editor-bar-start sf-button')].length,
    make: Boolean(document.querySelector('#editor .sf-editor-make')),
    words: document.querySelector('#editor .sf-editor-left sf-tabs')?.textContent ?? '',
  }));
  check('an author: the section locked, the text in the area open and not dimmed, no template or builder buttons', author.section && author.text === null && !author.dimmed && author.templateButton === 0 && !author.make, author);
  check('the words follow the page language', /Блоки/u.test(author.words), author.words);
  at = await box(page, 'p1');
  await page.mouse.click(at.x + at.width - 4, at.y + at.height / 2);
  await page.keyboard.press(END);
  await page.keyboard.type('!');
  await page.waitForTimeout(200);
  check('an author types in the area', JSON.stringify(await doc(page)).includes('page!'), null);
  await page.close();

  // 12. RTL and reduced motion.
  page = await open({dir: 'rtl', reducedMotion: 'reduce'});
  at = await box(page, 'p1');
  await page.mouse.move(at.x + at.width - 30, at.y + at.height / 2);
  await page.waitForTimeout(150);
  const rtl = await page.evaluate(() => {
    const gutter = document.querySelector('#editor .sf-editor-gutter').getBoundingClientRect();
    const block = document.querySelector('#editor [data-sf-composition-id="p1"]').getBoundingClientRect();
    return {gutterLeft: Math.round(gutter.left), blockRight: Math.round(block.right), transition: getComputedStyle(document.querySelector('#editor .sf-editor-gutter')).transitionDuration};
  });
  check('in RTL the gutter stands at the block\'s right; reduced motion has no transition', rtl.gutterLeft >= rtl.blockRight - 4 && /^0s/u.test(rtl.transition), rtl);
  await page.close();
} finally {
  if (failures.length) console.error('so far:', JSON.stringify(failures, null, 1));
  await browser.close();
}

if (errors.length) note({case: 'no page errors', got: errors.slice(0, 5)});
if (failures.length) {
  console.error(JSON.stringify(failures, null, 1));
  process.exit(1);
}
console.log('editor flows: every check passed');
