#!/usr/bin/env node
// Usage: node this-file <core-distr> <smart-root> <lab-fixture>
// A tab can be hidden for its whole load -- opened in the background, restored
// with a session, behind another window -- and a hidden tab pauses
// requestAnimationFrame. The loader used to schedule its work, bootstrap
// included, through rAF alone, so such a tab waited to be shown before anything
// was upgraded. A consumer met it as a filter window whose rows had no radio and
// no label, five seconds after opening.
//
// The tab is emulated the way a paused one behaves: document.hidden is true and
// requestAnimationFrame never calls back. Nothing is shown during the test, so
// a loader that waits for a frame waits for ever and this probe says so.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

// The probe serves the bytes itself. python's http.server truncates a file now
// and then under parallel requests -- the other Framework session found it, and
// it explains two intermittent results of ours that were put down to a warming
// server. A truncated core.js looks exactly like a loader that never starts,
// which is the very thing this probe is here to judge.
const [coreRoot, smartRoot, fixture] = process.argv.slice(2).map((path) => path && resolve(path));
if (!coreRoot || !smartRoot || !fixture) {
  throw new Error('Core distr, smart root and the lab fixture are required');
}

const types = new Map([
  ['.js', 'text/javascript'], ['.mjs', 'text/javascript'], ['.css', 'text/css'],
  ['.json', 'application/json'], ['.woff2', 'font/woff2'], ['.svg', 'image/svg+xml'],
]);
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const roots = [['/distr/', coreRoot], ['/smartroot/', smartRoot]];
  const match = roots.find(([prefix]) => url.pathname.startsWith(prefix));
  try {
    const file = match
      ? resolve(match[1], decodeURIComponent(url.pathname.slice(match[0].length)))
      : fixture;
    if (match && !file.startsWith(match[1] + sep)) throw new Error('path escape');
    const bytes = await readFile(file);
    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, {
      'Content-Type': types.get(extension) ?? 'text/html',
      'Content-Length': bytes.length,
    });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const labUrl = `${origin}/lab.html`;
const assetsUrl = `${origin}/distr`;
const smartUrl = `${origin}/smartroot`;

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1100, height: 760}});
await page.addInitScript(() => {
  Object.defineProperty(document, 'hidden', {get: () => true, configurable: true});
  Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true});
  // A paused tab: the callback is registered and never run.
  window.__framesRequested = 0;
  window.requestAnimationFrame = (callback) => {
    window.__framesRequested += 1;
    void callback;
    return 0;
  };
  window.cancelAnimationFrame = () => {};
});
await page.goto(`${labUrl}?${new URLSearchParams({assets: assetsUrl, smart: smartUrl, dir: 'ltr', theme: 'light'})}`);

try {
  // The lab's own readiness waits for sf-table to be defined, so reaching it at
  // all means the loader worked without a single frame.
  // Playwright polls a waitForFunction through requestAnimationFrame by default,
  // and this probe has just taken rAF away: the poll would never run and the
  // wait would fail against a loader that works. The instrument gets a timer
  // for the same reason the loader does.
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === 'true',
    null,
    {timeout: 20000, polling: 250},
  );
} catch (error) {
  failures.push({case: 'bootstrap', why: String(error).slice(0, 160),
    expected: 'the loader starts and defines its elements in a tab that is never shown'});
}

const state = await page.evaluate(() => ({
  hidden: document.hidden,
  framesRequested: window.__framesRequested,
  framesRan: 0,
  table: Boolean(customElements.get('sf-table')),
  input: Boolean(customElements.get('sf-input')),
  rendered: Boolean(document.querySelector('sf-table thead th')),
}));
if (!state.hidden) failures.push({case: 'the test itself', got: state, expected: 'the tab reports itself hidden'});
if (!state.table || !state.input) {
  failures.push({case: 'elements upgrade', got: state, expected: 'the elements the page uses are defined'});
}
if (!state.rendered) {
  failures.push({case: 'first render', got: state, expected: 'the table renders its head without waiting for a frame'});
}

// And a module asked for after the page is up still arrives, which is the
// consumer's own case: a window opened in a hidden tab wanting sf-radio.
const late = await page.evaluate(async () => {
  const host = document.createElement('sf-radio');
  host.setAttribute('name', 'probe');
  document.body.append(host);
  const start = Date.now();
  await Promise.race([
    customElements.whenDefined('sf-radio'),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
  return {defined: Boolean(customElements.get('sf-radio')), waitedMs: Date.now() - start};
});
if (!late.defined) {
  failures.push({case: 'a module wanted later', got: late, expected: 'the loader fetches it in a hidden tab too'});
}

console.error(JSON.stringify({state, late}, null, 1));
await browser.close();
server.close();

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('LOADER_HIDDEN_TAB_OK');
