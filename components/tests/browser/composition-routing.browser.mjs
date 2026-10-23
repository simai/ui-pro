#!/usr/bin/env node
// Browser acceptance for generic cross-composite routing with real sf-table
// instances. Usage: PLAYWRIGHT_MODULE=/abs/playwright/index.mjs node
//   composition-routing.browser.mjs <lab-url> <distr-url> <smart-url> <source-url> <output-dir>
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [labUrl, assetsUrl, smartUrl, sourceUrl, outputDir] = process.argv.slice(2);
if (!labUrl || !assetsUrl || !smartUrl || !sourceUrl || !outputDir) throw new Error('usage: lab distr smart source output');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
mkdirSync(outputDir, { recursive: true });

const failures = [];
const errors = [];
const observations = {};
const check = (value, name, details = null) => { if (!value) failures.push({ name, details }); };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
page.on('request', (request) => {
  if (/^https?:/u.test(request.url()) && !request.url().startsWith('http://127.0.0.1:8766/')) errors.push(`external request: ${request.url()}`);
});

async function open({ width = 1280, theme = 'light', dir = 'ltr' } = {}) {
  await page.setViewportSize({ width, height: 900 });
  const query = new URLSearchParams({ assets: assetsUrl, smart: smartUrl, source: sourceUrl, theme, dir });
  await page.goto(`${labUrl}?${query}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('sf-table .sf-table').length === 5, null, { timeout: 30000 });
}

const table = (scope, endpoint) => page.locator(`sf-composition-scope[data-sf-composition-id="${scope}"] sf-table[data-sf-endpoint="${endpoint}"]`).first();
const rowCheckbox = (scope, endpoint, name) => table(scope, endpoint).locator('tr, [role="row"]').filter({ hasText: name }).locator('input[type="checkbox"]').first();
const lab = () => page.evaluate(() => ({ intents: window.lab.intents.map((entry) => ({ ...entry })), results: window.lab.results.map((entry) => ({ ...entry })) }));
const rowsOf = (scope, endpoint) => page.evaluate(({ scope, endpoint }) => document.querySelector(`sf-composition-scope[data-sf-composition-id="${scope}"] sf-table[data-sf-endpoint="${endpoint}"]`).getTableData().rows.map((row) => row.id), { scope, endpoint });
const settle = () => page.waitForTimeout(250);

await open();
const initial = await page.evaluate(() => ({
  routing: [...document.querySelectorAll('sf-composition-scope')].map((scope) => scope.getAttribute('data-sf-routing')),
  display: getComputedStyle(document.querySelector('sf-composition-scope')).display,
}));
observations.initial = initial;
check(initial.routing.every((state) => state === 'connected'), 'both scopes connect', initial);
check(initial.display === 'contents', 'scope does not affect layout', initial);

// Pointer selection routes one typed context to the sibling composite.
await rowCheckbox('workspace', 'orders', 'Заказ 1').check();
await settle();
let state = await lab();
observations.afterFirstSelection = state;
check(state.intents.length === 1 && state.intents[0].key === 'workspace/lines' && JSON.stringify(state.intents[0].ids) === '["заказ_1"]', 'one typed Unicode context reaches lines', state.intents);
check(JSON.stringify(await rowsOf('workspace', 'lines')) === '["l-11","l-12"]', 'lines show the host answer', await rowsOf('workspace', 'lines'));
check(state.intents.every((entry) => !entry.key.startsWith('archive/')), 'sibling scope is isolated', state.intents);
const routeState = await page.evaluate(() => document.querySelector('sf-composition-scope[data-sf-composition-id="workspace"]').getRouteState('order-lines'));
observations.routeState = routeState;
check(routeState.status === 'settled', 'route state is settled', routeState);

// Keyboard: Space on a focused native checkbox adds an integer-zero identity.
await rowCheckbox('workspace', 'orders', 'Заказ 0').focus();
await page.keyboard.press('Space');
await settle();
state = await lab();
check(state.intents.length === 2 && JSON.stringify(state.intents[1].ids) === '["заказ_1",0]', 'keyboard selection routes integer 0 without loss', state.intents);
check(JSON.stringify(await rowsOf('workspace', 'lines')) === '["l-11","l-12",7]', 'lines reflect both selected orders', await rowsOf('workspace', 'lines'));

// Chain: a selection in lines drives details through the same parent.
await rowCheckbox('workspace', 'lines', 'Строка 1.2').check();
await settle();
state = await lab();
check(state.intents.at(-1).key === 'workspace/details' && JSON.stringify(state.intents.at(-1).ids) === '["l-12"]', 'chained route reaches details', state.intents.at(-1));
check(JSON.stringify(await rowsOf('workspace', 'details')) === '["d-121"]', 'details show the chained answer', await rowsOf('workspace', 'details'));

// A new upstream context clears the downstream selection exactly once.
const beforeClear = state.intents.length;
await rowCheckbox('workspace', 'orders', 'Заказ 0').uncheck();
await settle();
state = await lab();
const cascade = state.intents.slice(beforeClear).map((entry) => `${entry.key}:${JSON.stringify(entry.ids)}`);
observations.cascade = cascade;
// The table clears its own selection before announcing its query, so the
// downstream clearing is observed first; each happens exactly once.
check(JSON.stringify(cascade) === JSON.stringify(['workspace/details:[]', 'workspace/lines:["заказ_1"]']), 'context change clears the downstream selection once, before the own query', cascade);

// Latest result wins: the slow answer to an older context arrives last.
await page.evaluate(() => {
  window.lab.delays['workspace/lines:["заказ_1","order-2"]'] = 700;
  window.lab.delays['workspace/lines:["заказ_1"]'] = 50;
});
const beforeRace = (await lab()).results.length;
await rowCheckbox('workspace', 'orders', 'Заказ 2').check();
await page.waitForTimeout(60);
await rowCheckbox('workspace', 'orders', 'Заказ 2').uncheck();
await page.waitForTimeout(1000);
state = await lab();
const race = state.results.slice(beforeRace).filter((entry) => entry.key === 'workspace/lines');
observations.race = race;
check(race.length === 2 && race[0].applied === true && race[1].applied === false && race[1].sequence < race[0].sequence, 'newest answer applied, older late answer refused', race);
check(JSON.stringify(await rowsOf('workspace', 'lines')) === '["l-11","l-12"]', 'visible rows belong to the newest context', await rowsOf('workspace', 'lines'));

// Remount the whole scope five times; one selection still yields one delivery.
const remount = await page.evaluate(async () => {
  const scope = document.querySelector('sf-composition-scope[data-sf-composition-id="workspace"]');
  const parent = scope.parentNode;
  const next = scope.nextSibling;
  for (let index = 0; index < 5; index += 1) {
    scope.remove();
    parent.insertBefore(scope, next);
  }
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  return { routing: scope.getAttribute('data-sf-routing'), counters: scope.getRoutingCounters() };
});
observations.remount = remount;
check(remount.routing === 'connected', 'scope reconnects after remount', remount);
const beforeRemountSelection = (await lab()).intents.length;
const deliveriesBefore = remount.counters.deliveries;
await rowCheckbox('workspace', 'orders', 'Заказ 2').check();
await settle();
state = await lab();
const afterRemount = state.intents.slice(beforeRemountSelection).filter((entry) => entry.key === 'workspace/lines');
const countersAfter = await page.evaluate(() => document.querySelector('sf-composition-scope[data-sf-composition-id="workspace"]').getRoutingCounters());
observations.afterRemount = { afterRemount, countersAfter };
check(afterRemount.length === 1, 'exactly one query intent after five remounts', afterRemount);
check(countersAfter.deliveries - deliveriesBefore === 1 || countersAfter.deliveries - deliveriesBefore === 2, 'no duplicate deliveries after remount', { deliveriesBefore, countersAfter });

// Removing a pending target discards its late answer.
await page.evaluate(() => { window.lab.delays['workspace/lines:[]'] = 400; });
const beforeRemoval = (await lab()).results.length;
await rowCheckbox('workspace', 'orders', 'Заказ 2').uncheck();
await page.evaluate(() => {
  const lines = document.querySelector('sf-composition-scope[data-sf-composition-id="workspace"] sf-table[data-sf-endpoint="lines"]');
  const parent = lines.parentNode;
  const next = lines.nextSibling;
  lines.remove();
  parent.insertBefore(lines, next);
});
await page.waitForTimeout(900);
state = await lab();
const late = state.results.slice(beforeRemoval).filter((entry) => entry.key === 'workspace/lines');
const dataState = await page.evaluate(() => document.querySelector('sf-composition-scope[data-sf-composition-id="workspace"] sf-table[data-sf-endpoint="lines"]').getAttribute('data-state'));
observations.lateAfterTargetRemount = { late, dataState };
check(late.length === 2 && late.find((entry) => !entry.applied) && late.find((entry) => entry.applied)
  && late.find((entry) => !entry.applied).sequence < late.find((entry) => entry.applied).sequence, 'removed target refuses its old answer and re-requests once after remount', late);
check(dataState === null, 'remounted target leaves the loading state after the new answer', dataState);
check(state.intents.every((entry) => !entry.key.startsWith('archive/')), 'archive scope never receives workspace traffic', null);

// Accessibility and layout across widths and themes.
const a11y = await page.evaluate(() => [...document.querySelectorAll('sf-table')].map((element) => element.getAttribute('aria-label')));
check(a11y.every(Boolean) && new Set(a11y).size === a11y.length, 'every routed table keeps a distinct accessible name', a11y);
await page.screenshot({ path: resolve(outputDir, 'routing-wide-light.png'), fullPage: false });
await open({ width: 390, theme: 'dark' });
const narrow = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
observations.narrowDark = narrow;
check(narrow.scrollWidth <= narrow.viewport, 'narrow dark layout has no document overflow', narrow);
await rowCheckbox('workspace', 'orders', 'Заказ 1').check();
await settle();
check(JSON.stringify(await rowsOf('workspace', 'lines')) === '["l-11","l-12"]', 'routing works at narrow width in dark theme', await rowsOf('workspace', 'lines'));
await page.screenshot({ path: resolve(outputDir, 'routing-narrow-dark.png'), fullPage: true });
await open({ width: 1280, dir: 'rtl' });
await rowCheckbox('workspace', 'orders', 'Заказ 1').check();
await settle();
check(JSON.stringify(await rowsOf('workspace', 'lines')) === '["l-11","l-12"]', 'routing works in RTL', await rowsOf('workspace', 'lines'));
await page.screenshot({ path: resolve(outputDir, 'routing-wide-rtl.png'), fullPage: false });

await browser.close();
const screenshots = Object.fromEntries(['routing-wide-light.png', 'routing-narrow-dark.png', 'routing-wide-rtl.png']
  .map((name) => [name, createHash('sha256').update(readFileSync(resolve(outputDir, name))).digest('hex')]));
const result = { status: failures.length || errors.length ? 'failed' : 'passed', failures, errors, observations, screenshots };
writeFileSync(resolve(outputDir, 'routing-browser.json'), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: result.status, failures, errors: errors.slice(0, 8) })}\n`);
if (result.status !== 'passed') process.exitCode = 1;
