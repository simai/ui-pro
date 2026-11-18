#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-chat-message highlights an answer's code block once the block is on the
// page (1.9.1). Before, a block drawn detached reached SIMAI Framework's
// highlight, whose id loop never ends for a block getElementById cannot find:
// a Russian page with a code answer froze at 100 % CPU (ui-control evidence
// 2026-11-18-pro-over-1ed6). On a served page (the Loader fetches the Russian
// language file and SF.Highlight, as on a site), Russian and English, held:
// - a first code answer, then a second once SF.Highlight is loaded (the case
//   that looped): the page answers within 2 s of each;
// - no long task over 200 ms after the answer is set;
// - both blocks end up highlighted (data-highlighted on the code).
import {createServer} from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {extname, join, resolve} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const parts = {core: join(out, 'core', 'core'), rule: join(out, 'core', 'rule'), component: join(out, 'component', 'component'), smart: join(out, 'smart', 'smart'), utility: join(out, 'utility', 'utility')};
for (const [name, path] of Object.entries(parts)) if (!existsSync(path)) throw new Error(`${name} not found under ${out}`);
const registered = /registerPackage\(\s*["']([a-z][a-z0-9-]*)["']/u.exec(readFileSync(join(parts.smart, 'rule.js'), 'utf8'));
const shell = (lang) => `<!doctype html><html lang="${lang}" class="theme-light"><head><meta charset="utf-8">
<script>window.sfPath='/distr/';window.sfSmartPath='/distr/';window.SF_BOOT_CONFIG={preloader:{enabled:false},packages:{${registered ? registered[1] : 'pro'}:{base:'/distr/smart'}}};</script>
<link rel="stylesheet" href="/distr/core/css/core.css"><script src="/distr/core/js/core.js"></script></head><body>
<main><sf-chat-message id="a"></sf-chat-message><sf-chat-message id="b"></sf-chat-message></main></body></html>`;
const types = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'};
let current = '';
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://probe').pathname);
  if (path === '/probe') {
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    return response.end(current);
  }
  const match = path.match(/^\/distr\/([^/]+)\/(.+)$/u);
  const file = match && parts[match[1]] ? join(parts[match[1]], match[2]) : '';
  if (file && existsSync(file) && statSync(file).isFile()) {
    response.writeHead(200, {'content-type': `${types[extname(file)] ?? 'application/octet-stream'}; charset=utf-8`});
    return response.end(readFileSync(file));
  }
  response.writeHead(404);
  response.end();
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

const answer = (id) => ({id, role: 'assistant', status: 'completed', text: 'Код',
  html: `<p>Пример ${id}:</p><pre><code class="language-js">const a = 1;\nif (a &lt; 2) console.log(a);</code></pre>`});

const failures = [];
const results = {};
const browser = await chromium.launch();
try {
  for (const lang of ['ru', 'en']) {
    current = shell(lang);
    const page = await browser.newPage({viewport: {width: 1000, height: 800}});
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error?.message || error)));
    await page.goto(`${base}/probe`);
    await page.waitForFunction(() => customElements.get('sf-chat-message'), null, {timeout: 20000});
    await page.evaluate(() => {
      window.__long = [];
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__long.push(Math.round(entry.duration)); })
        .observe({type: 'longtask', buffered: false});
    });
    const seen = {};
    for (const id of ['a', 'b']) {
      // Set from a task of the page's own, so a loop it starts cannot hold this call.
      await page.evaluate(({id, message}) => { setTimeout(() => { document.getElementById(id).message = message; }, 0); }, {id, message: answer(id)});
      await new Promise((done) => setTimeout(done, 50));
      const started = Date.now();
      // The page answers only when its thread is free.
      const idle = await Promise.race([
        page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(true)))),
        new Promise((done) => setTimeout(() => done(false), 2000)),
      ]);
      seen[id] = {idle, ms: Date.now() - started};
      if (!idle) break;
      if (id === 'a') {
        // The second answer comes once SF.Highlight is on the page: the case that looped.
        await page.waitForFunction(() => Boolean(globalThis.SF?.Highlight?.highlight)
          && document.querySelector('#a pre code')?.dataset.highlighted, null, {timeout: 10000}).catch(() => {});
      }
    }
    const frozen = Object.values(seen).some((one) => !one.idle);
    let state = {frozen};
    if (!frozen) {
      await page.waitForTimeout(600);
      state = await page.evaluate(() => ({
        highlighter: Boolean(globalThis.SF?.Highlight?.highlight),
        highlighted: ['a', 'b'].map((id) => document.querySelector(`#${id} pre code`)?.dataset.highlighted ?? null),
        long: window.__long,
      }));
    }
    results[lang] = {seen, ...state, errors};
    const label = `${lang} page`;
    if (frozen) failures.push({case: label, said: 'the page did not answer within 2 s of a code answer (busy loop)', seen});
    else {
      const over = state.long.filter((ms) => ms > 200);
      if (over.length) failures.push({case: label, said: 'a long task over 200 ms', long: state.long});
      if (!state.highlighter) failures.push({case: label, said: 'SF.Highlight never loaded'});
      else if (state.highlighted.some((one) => one !== 'yes')) failures.push({case: label, said: 'a code block was not highlighted', highlighted: state.highlighted});
    }
    if (errors.length) failures.push({case: label, said: 'page errors', errors});
    // A frozen page cannot close; the browser closes it below.
    if (!frozen) await page.close();
    else break;
  }
} finally {
  // A frozen page does not let the browser close gracefully: the result is
  // said and the process ends, which ends the browser with it.
  if (!Object.values(results).some((one) => one.frozen)) await browser.close();
  server.close();
}
console.log(JSON.stringify({probe: 'chat-message-code-idle', results, failures}, null, 1));
process.exit(failures.length ? 1 : 0);
