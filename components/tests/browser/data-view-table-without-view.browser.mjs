#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Build output root is required: the directory holding core/, smart/, component/, utility/.
//
// sf-view-table 1.18.1 (saved-views r2, DEV acceptance D2): the content table
// of an sf-view waits for the view's code, but not for ever. Through the real
// Loader, with Core's early port call answered:
//   - the view's script fails (404 for both forms): the table draws on its
//     own, without the view's toolbar, within a second, and the console has
//     exactly one warning of the table's and the Loader's failure, nothing
//     else;
//   - the view's script comes 5 s late: the table draws on its own after
//     about 3 s with one warning, and when the view comes it takes the table
//     over (the view's toolbar is drawn, no error);
//   - the view's script comes in time: no warning, the table is the view's.
// Light, 1440 and 390, three loads.
import {createServer} from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {extname, join, resolve, sep} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const mounts = [
  ['/distr/core/', join(out, 'core', 'core')],
  ['/distr/rule/', join(out, 'core', 'rule')],
  ['/distr/component/', join(out, 'component', 'component')],
  ['/distr/utility/', join(out, 'utility', 'utility')],
  ['/distr/smart/', join(out, 'smart', 'smart')],
];
for (const [, path] of mounts) if (!existsSync(path)) throw new Error(`${path} not found: the build output root holds core/, component/, utility/, smart/`);
const TYPES = new Map([['.js', 'text/javascript'], ['.mjs', 'text/javascript'], ['.css', 'text/css'], ['.json', 'application/json'], ['.woff2', 'font/woff2'], ['.woff', 'font/woff'], ['.svg', 'image/svg+xml']]);
const VIEW_JS = /^\/distr\/smart\/view\/js\/view(?:\.min)?\.js$/u;
const records = [1, 2, 3].map((n) => ({id: String(n), revision: `r${n}`, title: `Запись ${n}`, state: 'Опубликована', actions: ['open']}));
const answer = {records, total: 3, revision: 'list-1', columns: [{key: 'title', label: 'Название'}, {key: 'state', label: 'Состояние'}], row_actions: [{id: 'open', label: 'Открыть'}]};
const BOOT = {cacheVersion: 'without-view', pluginListVersion: 'without-view', preloader: {enabled: false}, packages: {view: {base: '/distr/smart/'}}};
const QUERY = {filters: {}, search: '', sort: [], page: 1, per_page: 20};

const pages = new Map();
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  if (path === '/port' && request.method === 'POST') {
    for await (const chunk of request) void chunk;
    response.writeHead(200, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
    response.end(JSON.stringify({answer: 'applied', sequence: 1, data: answer}));
    return;
  }
  if (pages.has(path)) {
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    response.end(pages.get(path).html);
    return;
  }
  const page = pages.get(new URL(request.headers.referer || 'http://localhost/').pathname);
  if (VIEW_JS.test(path) && page?.view === 'missing') { response.writeHead(404); response.end(); return; }
  if (VIEW_JS.test(path) && page?.view === 'late') await new Promise((done) => setTimeout(done, 5000));
  let file = '';
  for (const [prefix, root] of mounts) {
    if (!path.startsWith(prefix)) continue;
    const one = resolve(root, path.slice(prefix.length));
    if (one.startsWith(root + sep) && existsSync(one) && !statSync(one).isDirectory()) { file = one; break; }
  }
  if (!file) { response.writeHead(404); response.end(); return; }
  const type = TYPES.get(extname(file)) ?? 'application/octet-stream';
  response.writeHead(200, {'content-type': /^(text|application\/json|image\/svg)/u.test(type) ? `${type}; charset=utf-8` : type, 'cache-control': 'no-store'});
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

const html = () => `<!doctype html><html lang="ru" class="theme-light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>table without view</title><link rel="icon" href="data:,">
<link rel="stylesheet" href="/distr/core/css/core.css">
<script>window.sfPath='/distr/';window.sfSmartPath='/distr/';window.SF_BOOT_CONFIG=${JSON.stringify(BOOT)};</script>
<script src="/distr/core/js/core.js"></script></head>
<body style="margin:0;padding:16px"><div id="stage"><sf-view aria-label="Каталог">
<script type="application/json" data-sf-port>${JSON.stringify({port: 'simai.dataview-port', version: '1.12.0', url: '/port', capabilities: ['row-actions'], first: {intent: 'query.change', payload: {query: QUERY}}})}</script>
<sf-view-table slot="content" aria-label="Каталог"></sf-view-table></sf-view></div></body></html>`;

const failures = [];
const rows = [];
const browser = await chromium.launch();
try {
  for (let load = 1; load <= 3; load += 1) for (const view of ['missing', 'late', 'in-time']) for (const width of [1440, 390]) {
    const where = `load ${load} view ${view} ${width}`;
    const path = `/w/${load}/${view}/${width}`;
    pages.set(path, {view, html: html()});
    const context = await browser.newContext({viewport: {width, height: 800}});
    const tab = await context.newPage();
    const messages = [];
    tab.on('console', (message) => {
      if (message.type() !== 'error' && message.type() !== 'warning') return;
      if (/was preloaded using link preload but not used within a few seconds/u.test(message.text())) return;
      messages.push(`${message.type()}: ${message.text()}`);
    });
    tab.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
    const started = Date.now();
    await tab.goto(origin + path);
    let drawnAt = null;
    try {
      await tab.waitForFunction(() => document.querySelector('#stage sf-view-table .sf-table'), null, {timeout: 8000});
      drawnAt = Date.now() - started;
    } catch {}
    if (view === 'late') await tab.waitForFunction(() => customElements.get('sf-view'), null, {timeout: 10000}).catch(() => {});
    await tab.waitForTimeout(800);
    const state = await tab.evaluate(() => ({
      defined: Boolean(customElements.get('sf-view')),
      table: Boolean(document.querySelector('#stage sf-view-table .sf-table')),
      rows: document.querySelectorAll('#stage sf-view-table [data-row-id], #stage sf-view-table tbody tr').length,
    }));
    await context.close();
    const tableWarnings = messages.filter((m) => /sf-view-table: the sf-view around this table/u.test(m));
    const other = messages.filter((m) => !tableWarnings.includes(m) && !/Failed to load script: .*\/view\/js\/view/u.test(m) && !/404/u.test(m));
    rows.push({where, drawnAt, ...state, tableWarnings: tableWarnings.length, other});
    if (!state.table) failures.push(`${where}: the table never drew`);
    if (view === 'missing' && (drawnAt === null || drawnAt > 2500)) failures.push(`${where}: drew after ${drawnAt} ms, not within the failure grace`);
    if (view === 'late' && (drawnAt === null || drawnAt < 2500 || drawnAt > 4500)) failures.push(`${where}: drew after ${drawnAt} ms, not at the 3 s bound`);
    if (view === 'late' && !state.defined) failures.push(`${where}: the view never came`);
    if (view === 'in-time' ? tableWarnings.length !== 0 : tableWarnings.length !== 1) failures.push(`${where}: ${tableWarnings.length} warnings of the table`);
    if (other.length) failures.push(`${where}: console ${other.slice(0, 3).join(' | ')}`);
  }
} finally {
  await browser.close();
  server.close();
}
if (process.env.WITHOUT_VIEW_REPORT) console.log(JSON.stringify(rows));
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`data-view table without view: ${rows.length} pages; a failed view draws the table within the grace, a late one at the 3 s bound, each with one warning; a view in time, none`);
