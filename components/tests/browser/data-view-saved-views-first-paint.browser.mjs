#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Build output root is required: the directory holding core/, smart/, component/, utility/.
//
// sf-view-table 1.18.1 (DEV decision msg-e39bb812,
// 2026-11-09): when the page declares saved views before the first answer
// (its data-sf-port lists saved-views), the toolbar does not move from its
// first frame to the drawn answer. Watched frame by frame on a served page
// through the real Loader -- Core runs the declared port's first call, the
// components' code is held back, the port's answer comes once the skeleton
// has stood (skeleton first), or at once, so it is in before the code is
// defined (data first: Core's early call answered quickly, the normal case on
// a fast host; saved-views r2, D1) -- with the first paint's sheets in the
// head, withheld (the Loader links them) or late (after the code), three
// loads each, light and dark, at 1440 and 390, with saved views declared and
// without:
//   - no frame shows the table's own toolbar before the view is defined: the
//     first toolbar on the page is the view's first paint (sf-view-table
//     1.18.1; the Loader defines the table first, and the table drew its
//     own toolbar for a frame or two -- the search field across the whole
//     row -- before the skeleton replaced it);
//   - from the first toolbar frame on, once the sheets are in, no control of
//     the toolbar (the bar, the filter button, the saved-views control or its
//     slot, the search field, the create button) moves or resizes by more than
//     0.5 px: through the skeleton, the answer, and a refresh. A step taken
//     in the frame a font face set changed (the icon font's subset is
//     replaced as icons come in, R078) is reported as fontSteps, not counted;
//   - with saved views declared at 1440, the slot is there from the first
//     toolbar frame: a square of the step's control, as tall as the filter
//     button beside it (C27), and the drawn control stands in it; without
//     them nothing is held; the phone's compact list has no such control;
//   - at 390 the first drawn frame is the compact toolbar in either order
//     (it was the desktop one when the data came first: 80-124 px, then 36);
//   - a clean console: no error, no warning, no failed request. Chrome's
//     note that a preloaded file was not used within a few seconds is not a
//     defect of the page and is left out (it reddened a correct build under
//     load, M1).
import {createServer} from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {extname, join, resolve, sep} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const sheetsFile = new URL('../../src/smart/view/static/sheets.json', import.meta.url);
const FIRST_PAINT_SHEETS = JSON.parse(readFileSync(sheetsFile, 'utf8')).sheets;
const LOADS = Number(process.env.SAVED_VIEWS_LOADS || 3);
const SCRIPT_DELAY = 400;
const LATE_SHEETS = SCRIPT_DELAY + 500;
const TOLERANCE = 0.5;
const mounts = [
  ['/distr/core/', join(out, 'core', 'core')],
  ['/distr/rule/', join(out, 'core', 'rule')],
  ['/distr/component/', join(out, 'component', 'component')],
  ['/distr/utility/', join(out, 'utility', 'utility')],
  ['/distr/smart/', join(out, 'smart', 'smart')],
];
for (const [, path] of mounts) if (!existsSync(path)) throw new Error(`${path} not found: the build output root holds core/, component/, utility/, smart/`);
const TYPES = new Map([['.js', 'text/javascript'], ['.mjs', 'text/javascript'], ['.css', 'text/css'], ['.json', 'application/json'], ['.woff2', 'font/woff2'], ['.woff', 'font/woff'], ['.svg', 'image/svg+xml']]);

const BASE = ['row-actions', 'personal-column-settings', 'create-record'];
const QUERY = {filters: {}, search: '', sort: [], page: 1, per_page: 20};
const records = [1, 2, 3, 4].map((n) => ({id: String(n), revision: `r${n}`, title: `Запись ${n}`, state: 'Опубликована', actions: ['open']}));
const answer = {records, total: 4, revision: 'list-1', columns: [{key: 'title', label: 'Название'}, {key: 'state', label: 'Состояние'}],
  row_actions: [{id: 'open', label: 'Открыть'}]};
const BOOT = {cacheVersion: 'saved-views', pluginListVersion: 'saved-views', preloader: {enabled: false}, packages: {view: {base: '/distr/smart/'}}};

// The page's state, per page path: the sheets mode, and the held answer.
const pages = new Map();
const held = new Map();
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  const page = pages.get(url.searchParams.get('page') ?? '') ?? null;
  if (path === '/port' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const call = JSON.parse(body || '{}');
    const one = pages.get(call.page);
    // The first answer waits until the page has watched its skeleton stand
    // (/release), unless the data comes first; a later one comes at once.
    if (one && !one.answered && one.order === 'data-first') {
      one.answered = true;
    } else if (one && !one.answered) {
      one.answered = true;
      await new Promise((done) => { one.release = done; setTimeout(done, 8000); });
    } else await new Promise((done) => setTimeout(done, 120));
    response.writeHead(200, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
    response.end(JSON.stringify({answer: 'applied', sequence: call.payload?.sequence, data: answer}));
    return;
  }
  if (path === '/release') {
    page?.release?.();
    response.writeHead(204);
    response.end();
    return;
  }
  if (pages.has(path)) {
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    response.end(pages.get(path).html);
    return;
  }
  const referrer = pages.get(new URL(request.headers.referer || 'http://localhost/').pathname);
  let wait = 0;
  if (/\.m?js$/u.test(path) && path.startsWith('/distr/') && !path.startsWith('/distr/core/')) wait = SCRIPT_DELAY;
  if (referrer?.mode === 'late' && /\.css$/u.test(path) && path !== '/distr/core/css/core.css') wait = LATE_SHEETS;
  if (wait) await new Promise((done) => setTimeout(done, wait));
  let file = '';
  for (const [prefix, root] of mounts) {
    if (!path.startsWith(prefix)) continue;
    const one = resolve(root, path.slice(prefix.length));
    if (one.startsWith(root + sep) && existsSync(one) && !statSync(one).isDirectory()) { file = one; break; }
  }
  if (!file) { response.writeHead(404); response.end(); return; }
  const type = TYPES.get(extname(file)) ?? 'application/octet-stream';
  response.writeHead(200, {'content-type': /^(text|application\/json|image\/svg)/u.test(type) ? `${type}; charset=utf-8` : type,
    'cache-control': 'no-store', 'access-control-allow-origin': '*'});
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

// Installed before Core: a record per frame of the toolbar on the page -- the
// view's skeleton while it awaits, the table's toolbar otherwise -- and the
// layout shifts. Once the skeleton has stood 20 frames with its sheets in,
// the held answer is released.
const WATCH = `(() => {
  const fp = window.__fp = {frames: [], shifts: [], released: false};
  new PerformanceObserver((list) => { for (const e of list.getEntries()) fp.shifts.push({t: Math.round(e.startTime), value: e.value}); })
    .observe({type: 'layout-shift', buffered: true});
  const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width || b.height ? [b.left, b.right, b.top, b.height].map((n) => Math.round(n * 100) / 100) : null; };
  const shown = (e) => e && getComputedStyle(e).display !== 'none' ? e : null;
  let stood = 0;
  const tick = () => {
    const view = document.querySelector('#stage sf-view');
    if (view && document.body) {
      const sheetsIn = [...document.querySelectorAll('link[rel=stylesheet]')].every((l) => l.sheet);
      const defined = Boolean(customElements.get('sf-view'));
      const awaiting = view.hasAttribute('data-sf-awaiting');
      const skeleton = view.querySelector('.sf-data-view-skeleton-toolbar');
      const bar = view.querySelector('sf-view-table .sf-table-toolbar');
      const fonts = [...document.fonts].filter((f) => f.status === 'loaded').length;
      let row = {phase: 'none'};
      if (awaiting && skeleton) {
        const part = (kind) => box(shown(skeleton.querySelector('[data-control="' + kind + '"]')));
        row = {phase: 'skeleton', bar: box(skeleton), filter: part('filter'), slot: part('segment'), field: part('field'), create: part('create')};
      } else if (!awaiting && bar && box(bar)) {
        const control = (selector) => { const e = bar.querySelector(selector); return box(e && (e.querySelector('button') || e)); };
        const field = bar.querySelector('sf-input, sf-search');
        row = {phase: defined ? 'drawn' : 'table-alone', bar: box(bar),
          filter: control('sf-button[icon-start="filter_list"], sf-button-icon[icon="filter_list"]'),
          slot: control('sf-button-icon[icon="bookmark_add"]'),
          field: box(field && (field.firstElementChild || field)),
          create: control('sf-button[appearance="outline"], sf-button-icon[icon="add"]')};
      }
      Object.assign(row, {t: Math.round(performance.now()), sheetsIn, fonts});
      fp.frames.push(row);
      stood = row.phase === 'skeleton' && sheetsIn ? stood + 1 : 0;
      if (stood >= 20 && !fp.released) { fp.released = true; fetch('/release?page=' + encodeURIComponent(location.pathname)); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

const html = ({scheme, sheets, capabilities, dataFirst}) => `<!doctype html><html lang="ru" class="theme-${scheme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>saved views first paint</title><link rel="icon" href="data:,">
${sheets.map((href) => `<link rel="stylesheet" href="/distr/${href}">`).join('\n')}
<script>window.sfPath='/distr/';window.sfSmartPath='/distr/';window.SF_BOOT_CONFIG=${JSON.stringify(BOOT)};</script>
<script>${WATCH}${dataFirst ? 'window.__fp.released = true;' : ''}</script><script src="/distr/core/js/core.js"></script></head>
<body style="margin:0;padding:16px"><div id="stage"><sf-view aria-label="Каталог">
<script type="application/json" data-sf-port>${JSON.stringify({port: 'simai.dataview-port', version: '1.12.0', url: '/port', capabilities, first: {intent: 'query.change', payload: {query: QUERY}}})}</script>
<sf-view-table slot="content" aria-label="Каталог"></sf-view-table>
<sf-pagination slot="pagination" page-size="20" current="1" total="0"></sf-pagination></sf-view></div>
<p id="after">Текст под списком</p></body></html>`;

const KEYS = ['bar', 'filter', 'slot', 'field', 'create'];
const moved = (a, b) => (!a && !b) ? 0 : (!a || !b) ? Infinity : Math.max(...a.map((value, index) => Math.abs(value - b[index])));
const rows = [];
const failures = [];
const browser = await chromium.launch();
try {
  for (let load = 1; load <= LOADS; load += 1) for (const order of ['skeleton-first', 'data-first']) for (const mode of ['head', 'withheld', 'late']) for (const scheme of ['light', 'dark']) for (const width of [1440, 390]) for (const views of [true, false]) {
    const where = `load ${load} ${order} ${mode} ${scheme} ${width} ${views ? 'saved-views' : 'plain'}`;
    const path = `/p/${load}/${order}/${mode}/${scheme}/${width}/${views ? 'views' : 'plain'}`;
    pages.set(path, {mode, order, html: html({scheme, dataFirst: order === 'data-first', sheets: mode === 'withheld' ? ['core/css/core.css'] : FIRST_PAINT_SHEETS,
      capabilities: views ? [...BASE, 'saved-views'] : BASE})});
    const context = await browser.newContext({viewport: {width, height: 900}, colorScheme: scheme});
    const tab = await context.newPage();
    const errors = [];
    tab.on('console', (message) => {
      if (message.type() !== 'error' && message.type() !== 'warning') return;
      // Chrome's own note on an unused preload, not the page's (M1).
      if (/was preloaded using link preload but not used within a few seconds/u.test(message.text())) return;
      errors.push(`${message.type()}: ${message.text()}`);
    });
    tab.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    tab.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    try {
      await tab.goto(origin + path);
      // Data first does not wait for the sheets, so wait here until a frame
      // with every sheet in has been drawn (late sheets under load).
      await tab.waitForFunction(() => window.__fp?.released && !document.querySelector('#stage sf-view').hasAttribute('data-sf-awaiting')
        && window.__fp.frames.some((frame) => frame.phase === 'drawn' && frame.sheetsIn), null, {timeout: 60000});
      await tab.waitForTimeout(700);
      await tab.evaluate(() => document.querySelector('#stage sf-view').refresh?.('again'));
      await tab.waitForTimeout(700);
    } catch (error) {
      failures.push(`${where}: ${error.message.split('\n')[0]}`);
      await context.close();
      continue;
    }
    const fp = await tab.evaluate(() => window.__fp);
    await context.close();
    const alone = fp.frames.filter((frame) => frame.phase === 'table-alone').length;
    const frames = fp.frames.filter((frame) => frame.phase !== 'none' && frame.sheetsIn && frame.bar);
    const first = frames[0];
    const last = frames.at(-1);
    let shift = 0;
    const steps = [];
    const fontSteps = [];
    for (let index = 1; index < frames.length; index += 1) {
      const step = Math.max(...KEYS.map((key) => moved(frames[index - 1][key], frames[index][key])));
      if (step <= TOLERANCE) continue;
      const fontChanged = frames[index].fonts !== frames[index - 1].fonts || (index > 1 && frames[index - 1].fonts !== frames[index - 2].fonts);
      const at = {t: frames[index].t, from: frames[index - 1].phase, to: frames[index].phase,
        keys: Object.fromEntries(KEYS.map((key) => [key, moved(frames[index - 1][key], frames[index][key])]).filter(([, value]) => value > TOLERANCE))};
      if (fontChanged) fontSteps.push(at);
      else { steps.push(at); shift = Math.max(shift, step); }
    }
    const phases = [...new Set(frames.map((frame) => frame.phase))];
    const row = {where, order, width, firstBar: first?.bar ?? null, lastBar: last?.bar ?? null, frames: frames.length, phases: phases.join('>'), tableAlone: alone, toolbarShift: shift === Infinity ? 'appears' : Math.round(shift * 100) / 100,
      steps, fontSteps, slotFirst: first?.slot ?? null, slotLast: last?.slot ?? null, filter: last?.filter ?? null,
      cls: Math.round(fp.shifts.reduce((sum, entry) => sum + entry.value, 0) * 1e5) / 1e5, console: errors};
    rows.push(row);
    if (alone) failures.push(`${where}: ${alone} frames show the table's own toolbar before the view is defined`);
    if ((order === 'skeleton-first' && !phases.includes('skeleton')) || phases.at(-1) !== 'drawn') failures.push(`${where}: the frames are ${row.phases}, not ${order === 'skeleton-first' ? 'the skeleton then ' : ''}the drawn toolbar`);
    // At 390 the first toolbar frame is the compact one: one row, as tall as
    // the bar it ends as (D1: the desktop toolbar came first, 80-124 px).
    if (width < 600 && first && last && Math.abs(first.bar[3] - last.bar[3]) > TOLERANCE) failures.push(`${where}: the first toolbar is ${first.bar[3]} px tall (${first.phase}), the drawn one ${last.bar[3]} px`);
    if (steps.length) failures.push(`${where}: the toolbar moves ${JSON.stringify(steps.slice(0, 3))}`);
    const desktop = width >= 600;
    if (views && desktop) {
      if (!first?.slot) failures.push(`${where}: the first toolbar frame holds no saved-views slot`);
      else if (Math.abs(first.slot[3] - first.filter?.[3]) > TOLERANCE || Math.abs((first.slot[1] - first.slot[0]) - first.slot[3]) > TOLERANCE) {
        failures.push(`${where}: the slot is ${JSON.stringify(first.slot)}, not a square as tall as the filter button ${JSON.stringify(first.filter)}`);
      }
      if (!last?.slot) failures.push(`${where}: the table drew no saved-views control`);
    } else if (frames.some((frame) => frame.slot)) failures.push(`${where}: a saved-views place is ${views ? 'held in the compact list' : 'held without saved views declared'}`);
    if (errors.length) failures.push(`${where}: console ${errors.slice(0, 3).join(' | ')}`);
  }
} finally {
  await browser.close();
  server.close();
}

if (process.env.SAVED_VIEWS_REPORT) console.log(JSON.stringify(rows));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`data-view saved-views first paint: ${rows.length} pages watched frame by frame, the toolbar holds still from its first frame (saved views declared and not; skeleton first and data first; sheets in the head, withheld and late; light and dark; 1440 and 390; ${LOADS} loads)`);
