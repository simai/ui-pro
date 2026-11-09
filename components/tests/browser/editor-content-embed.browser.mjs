#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output [--shots <directory>]
// Build output root is required: the free output with the package laid into
// smart/smart (scripts/run-browser-probes.mjs makes it).
//
// sf-editor-content 1.4.0, the embed setting (G-15, ui-control
// control/ui-editor/CONTENT-IN-LAYOUT-GAPS.md): in a layout's outlet the
// editor stood as a sheet of its own, and on opening the text moved 68px right
// and 40px down. On the built bytes, with the real Loader and the package
// declared, at 1280 and at 390, against the same Document rendered as the
// Framework renders it (an article of p and h2, no title) in a box of the same
// width beside it:
//   - embed: the first line starts where the rendered page's does, at the
//     box's own corner (no shift); every
//     block's text stands where the rendered page has it (p, h2 after a p,
//     p after an h2, p after a p), and the editor is as tall as the rendered
//     page with its last block's text space, within a pixel;
//   - embed: no title field is drawn and a change keeps data.title;
//     title-field="shown" draws it, embedded or not;
//   - embed: the gutter of a block under the pointer stands wholly outside
//     the box, in the host's margin, beside the block's first line, and on
//     screen (x >= 0) at 1280, 1440 and 390. The host's margin is the gutter's
//     room read from the ladder, as a host leaves it: two 1/3 controls, their
//     gaps and the highlight's reach beside a box of 640px and wider, one
//     control beside a narrower one (28 + 28 + 4 + 4 + 12 = 76px on a desktop
//     since C27, pair ui-b4a77681f0a7; it was 68 with the 24px control);
//   - without embed the sheet is kept: its text stands in from the box.
// With --shots it also writes the screenshots.
import {createServer} from 'node:http';
import {existsSync, mkdirSync, readFileSync, statSync} from 'node:fs';
import {extname, join, resolve} from 'node:path';
import {chromium} from 'playwright';

const args = process.argv.slice(2);
const shotsAt = args.indexOf('--shots');
const shots = shotsAt === -1 ? null : resolve(args[shotsAt + 1]);
const roots = args.filter((value, index) => !value.startsWith('--') && (shotsAt === -1 || index !== shotsAt + 1));
if (!roots[0]) throw new Error('Build output root is required');
const out = resolve(roots[0]);
if (shots) mkdirSync(shots, {recursive: true});
const parts = {core: join(out, 'core', 'core'), component: join(out, 'component', 'component'), smart: join(out, 'smart', 'smart'), utility: join(out, 'utility', 'utility')};
for (const [name, path] of Object.entries(parts)) if (!existsSync(path)) throw new Error(`${name} not found under ${out}`);
const ruleFile = join(parts.smart, 'rule.js');
const registered = existsSync(ruleFile) ? /registerPackage\(\s*["']([a-z][a-z0-9-]*)["']/u.exec(readFileSync(ruleFile, 'utf8')) : null;
const PACKAGE = registered ? registered[1] : 'pro';

const t = (value) => [{type: 'text', value}];
const TITLE = 'Заголовок страницы';
const BLOCKS = [
  {id: 'p1', type: 'content.paragraph', data: {content: t('Первый абзац страницы, достаточно длинный, чтобы на узком экране занять две строки.')}},
  {id: 'p2', type: 'content.paragraph', data: {content: t('Второй абзац.')}},
  {id: 'h2', type: 'content.heading', data: {level: 2, content: t('Раздел')}},
  {id: 'p3', type: 'content.paragraph', data: {content: t('Абзац после заголовка.')}},
];
const DOCUMENT = {schema: 'simai.composition.document', schema_version: 1, id: 'page', profile: 'structured-content',
  root: {id: 'root', type: 'content.document', data: {title: TITLE}, slots: {default: BLOCKS}}};
// The Framework's renderer draws content.document as an article with an h1 of
// the title when there is one; the outlet here shows the page with no title,
// as a layout that carries the page's title itself does.
const RENDERED = `<article>${BLOCKS.map((node) => node.type === 'content.heading'
  ? `<h2 data-ref="${node.id}">${node.data.content[0].value}</h2>`
  : `<p data-ref="${node.id}">${node.data.content[0].value}</p>`).join('')}</article>`;

const page = (attributes) => `<!doctype html><html lang="ru" class="theme-light"><head><meta charset="utf-8"><title>embed</title>
<script>window.sfPath='/distr/';window.sfSmartPath='/distr/';window.SF_BOOT_CONFIG={preloader:{enabled:false},packages:{${PACKAGE}:{base:'/distr/smart'}}};</script>
<link rel="stylesheet" href="/distr/core/css/core.css">
<style>
  body { margin: 0; }
  /* The host: a column whose margin is just the gutter's room, from the
     ladder (--room, set per width: two 1/3 controls beside a box of 640px and
     wider, one beside a narrower one). */
  .host { display: grid; gap: 24px; padding: 24px var(--room); }
  .box { min-inline-size: 0; }
</style>
<script src="/distr/core/js/core.js"></script></head><body>
<div class="host" id="host">
  <div class="box" id="reference">${RENDERED}</div>
  <div class="box" id="outlet" data-sf-outlet><sf-editor-content id="editor" ${attributes}></sf-editor-content></div>
</div>
</body></html>`;

let current = '';
const types = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'};
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://probe').pathname);
  if (path === '/probe') {
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    return response.end(current);
  }
  const match = path.match(/^\/distr\/([^/]+)\/(.+)$/u);
  const file = match && parts[match[1]] ? join(parts[match[1]], match[2]) : '';
  if (!file || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404);
    return response.end();
  }
  const text = ['.js', '.mjs', '.css', '.json', '.svg'].includes(extname(file));
  response.writeHead(200, {'content-type': `${types[extname(file)] ?? 'application/octet-stream'}${text ? '; charset=utf-8' : ''}`});
  return response.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((settle) => server.once('listening', settle));
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const note = (detail) => failures.push(detail);
const near = (a, b, within = 1) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= within;

const open = async (browserPage, attributes, room) => {
  current = page(attributes);
  await browserPage.goto(`${base}/probe`);
  await browserPage.evaluate((value) => document.documentElement.style.setProperty('--room', value), room);
  await browserPage.waitForFunction(() => customElements.get('sf-editor-content'), null, {timeout: 10000});
  await browserPage.evaluate((doc) => { document.getElementById('editor').document = doc; }, DOCUMENT);
  await browserPage.waitForFunction(() => document.querySelectorAll('#editor .sf-content-editor-blocks > .sf-content-editor-block').length === 4, null, {timeout: 10000});
  await browserPage.evaluate(() => document.fonts.ready);
  await browserPage.waitForTimeout(300);
};

const measure = (browserPage) => browserPage.evaluate(() => {
  const box = (node) => node?.getBoundingClientRect();
  const outlet = box(document.getElementById('outlet'));
  const reference = box(document.getElementById('reference'));
  const firstLine = (node) => {
    if (!node) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const line = [...range.getClientRects()].find((rect) => rect.width && rect.height);
    return line ? {left: line.left, top: line.top} : null;
  };
  const blocks = {};
  for (const id of ['p1', 'p2', 'h2', 'p3']) {
    const field = document.querySelector(`#editor .sf-content-editor-block[data-sf-node="${id}"] .sf-content-editor-field`);
    const rendered = document.querySelector(`#reference [data-ref="${id}"]`);
    const own = box(field);
    const theirs = box(rendered);
    blocks[id] = {
      top: own ? Math.round((own.top - outlet.top) * 10) / 10 : null,
      reference: theirs ? Math.round((theirs.top - reference.top) * 10) / 10 : null,
      left: own ? Math.round((own.left - outlet.left) * 10) / 10 : null,
    };
  }
  const title = document.querySelector('#editor .sf-content-editor-title');
  const first = firstLine(document.querySelector('#editor .sf-content-editor-block[data-sf-node="p1"] .sf-content-editor-field'));
  const theirFirst = firstLine(document.querySelector('#reference [data-ref="p1"]'));
  const editor = box(document.querySelector('#editor .sf-content-editor'));
  return {
    width: outlet.width,
    referenceWidth: reference.width,
    first: first ? {left: Math.round((first.left - outlet.left) * 10) / 10, top: Math.round((first.top - outlet.top) * 10) / 10} : null,
    referenceFirst: theirFirst ? {left: Math.round((theirFirst.left - reference.left) * 10) / 10, top: Math.round((theirFirst.top - reference.top) * 10) / 10} : null,
    blocks,
    height: Math.round(editor.height * 10) / 10,
    referenceHeight: Math.round(reference.height * 10) / 10,
    title: title ? {drawn: title.checkVisibility(), text: title.textContent} : null,
    embedded: document.querySelector('#editor .sf-content-editor')?.dataset.embed ?? null,
  };
});

const gutter = async (browserPage) => {
  const target = await browserPage.evaluate(() => {
    const field = document.querySelector('#editor .sf-content-editor-block[data-sf-node="p2"] .sf-content-editor-field');
    const rect = field.getBoundingClientRect();
    return {x: rect.left + 20, y: rect.top + rect.height / 2};
  });
  await browserPage.mouse.move(target.x, target.y);
  await browserPage.mouse.move(target.x + 4, target.y);
  await browserPage.waitForTimeout(250);
  return browserPage.evaluate(() => {
    const outlet = document.getElementById('outlet').getBoundingClientRect();
    const own = document.querySelector('#editor .sf-content-editor-gutter');
    const buttons = [...own.querySelectorAll('button')].map((button) => button.getBoundingClientRect());
    const field = document.querySelector('#editor .sf-content-editor-block[data-sf-node="p2"] .sf-content-editor-field');
    const line = parseFloat(getComputedStyle(field).lineHeight);
    const lineMiddle = field.getBoundingClientRect().top + line / 2;
    return {
      shown: own.classList.contains('is-shown'),
      left: Math.round(Math.min(...buttons.map((b) => b.left)) * 10) / 10,
      right: Math.round(Math.max(...buttons.map((b) => b.right)) * 10) / 10,
      outletLeft: Math.round(outlet.left * 10) / 10,
      middle: Math.round((buttons[0].top + buttons[0].height / 2 - lineMiddle) * 10) / 10,
    };
  });
};

const browser = await chromium.launch();
const report = {};
try {
  // The gutter's room as a host reserves it: the 1/3 control of the ladder
  // (C27), the gutter's gap on each side of a button and the highlight's reach.
  const WIDE = 'calc(var(--sf-ui-1\\/3--control-height) * 2 + var(--sf-a4) * 2 + var(--sf-space-1\\/2))';
  const NARROW = 'calc(var(--sf-ui-1\\/3--control-height) + var(--sf-a4) * 2 + var(--sf-space-1\\/2))';
  for (const [width, room] of [[1280, WIDE], [1440, WIDE], [390, NARROW]]) {
    const context = await browser.newContext({viewport: {width, height: 900}});
    const browserPage = await context.newPage();
    browserPage.on('pageerror', (error) => note({case: `${width}: no page error`, got: error.message}));

    // Embedded, the title by default (auto: hidden).
    await open(browserPage, 'embed', room);
    const embedded = await measure(browserPage);
    report[`embed-${width}`] = embedded;
    if (embedded.embedded !== 'true') note({case: `${width}: embed marks the editor`, got: embedded.embedded});
    if (!embedded.first || !embedded.referenceFirst || !near(embedded.first.left, embedded.referenceFirst.left, 0.5) || !near(embedded.first.top, embedded.referenceFirst.top, 0.5)) {
      note({case: `${width}: the first line starts where the rendered page's does, at the box's corner`, got: {first: embedded.first, reference: embedded.referenceFirst}});
    }
    for (const [id, block] of Object.entries(embedded.blocks)) {
      if (!near(block.top, block.reference)) note({case: `${width}: ${id} stands where the rendered page has it`, got: block});
      if (!near(block.left, 0, 0.5)) note({case: `${width}: ${id} starts at the box's edge`, got: block});
    }
    if (!near(embedded.height, embedded.referenceHeight)) note({case: `${width}: the editor is as tall as the rendered text`, got: {height: embedded.height, reference: embedded.referenceHeight}});
    if (embedded.title?.drawn) note({case: `${width}: no title field embedded`, got: embedded.title});
    const room1 = await gutter(browserPage);
    room1.room = await browserPage.evaluate(() => parseFloat(getComputedStyle(document.getElementById('host')).paddingInlineStart));
    report[`gutter-${width}`] = room1;
    if (!room1.shown) note({case: `${width}: the gutter shows for the block under the pointer`, got: room1});
    if (!(room1.right <= room1.outletLeft + 0.5)) note({case: `${width}: the gutter stands outside the box`, got: room1});
    if (!(room1.left >= 0)) note({case: `${width}: the gutter stands on screen, in the host's margin`, got: room1});
    if (!near(room1.middle, 0, 1.5)) note({case: `${width}: the gutter stands beside the block's first line`, got: room1});
    if (shots) await browserPage.screenshot({path: join(shots, `embed-${width}.png`), fullPage: true});

    // Typing keeps data.title, which the hidden field never touched.
    await browserPage.evaluate(() => {
      globalThis.changes = [];
      document.getElementById('editor').addEventListener('change', (event) => globalThis.changes.push(event.detail));
    });
    await browserPage.click('#editor .sf-content-editor-block[data-sf-node="p2"] .sf-content-editor-field');
    await browserPage.keyboard.press('End');
    await browserPage.keyboard.type(' Ещё');
    await browserPage.waitForTimeout(500);
    const kept = await browserPage.evaluate(() => globalThis.changes.at(-1)?.document?.root?.data?.title ?? null);
    if (kept !== TITLE) note({case: `${width}: a change embedded keeps data.title`, got: kept});

    // Embedded with title-field="shown": the title is drawn and holds data.title.
    await open(browserPage, 'embed title-field="shown"', room);
    const titled = await measure(browserPage);
    report[`embed-shown-${width}`] = titled.title;
    if (!titled.title?.drawn || titled.title.text !== TITLE) note({case: `${width}: title-field shown draws the title embedded`, got: titled.title});

    // Without embed, the sheet as before: the text stands in from the box.
    await open(browserPage, '', room);
    const sheet = await measure(browserPage);
    report[`sheet-${width}`] = {first: sheet.first, title: sheet.title};
    if (!sheet.first || sheet.first.left < 16 || sheet.first.top < 16) note({case: `${width}: without embed the sheet keeps its margin`, got: sheet.first});
    if (!sheet.title?.drawn) note({case: `${width}: without embed the title is drawn`, got: sheet.title});
    if (shots) await browserPage.screenshot({path: join(shots, `sheet-${width}.png`), fullPage: true});
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(report));
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('EDITOR_CONTENT_EMBED_OK');
