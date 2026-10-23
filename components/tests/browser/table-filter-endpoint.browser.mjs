#!/usr/bin/env node
// Browser proof for endpoint option pages. Usage: node this-file <core-distr> <smart-output>.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

if (process.argv.length < 4) throw new Error('Core and Smart output roots are required');
const [coreRoot, smartRoot] = process.argv.slice(2).map((path) => resolve(path));
const fixture = resolve(fileURLToPath(new URL('../fixtures/table-filter-endpoint-lab.html', import.meta.url)));
const requests = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/filter-options') {
    requests.push(url);
    const sequence = Number(url.searchParams.get('sequence'));
    const cursor = url.searchParams.get('cursor');
    if (cursor === 'error') {
      response.writeHead(500, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({status: 'error'}));
      return;
    }
    const body = {status: 'ok', sequence, searchable: false,
      items: cursor === 'slow' ? [{value: 'stale', label: 'Stale page'}]
        : cursor ? [{value: 'second', label: 'Second page'}] : [{value: 'first', label: 'First page'}],
      next_cursor: cursor ? null : 'next', selected: [{value: 'offpage', label: 'Selected outside page'}]};
    const send = () => {
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify(body));
    };
    if (cursor === 'slow') setTimeout(send, 250);
    else send();
    return;
  }
  const prefixes = {'/assets/': coreRoot, '/smart/': smartRoot};
  const match = Object.entries(prefixes).find(([prefix]) => url.pathname.startsWith(prefix));
  try {
    const file = match ? resolve(match[1], decodeURIComponent(url.pathname.slice(match[0].length))) : fixture;
    if (match && !file.startsWith(match[1] + sep)) throw new Error('path escape');
    const bytes = await readFile(file);
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
    response.writeHead(200, {'Content-Type': type});
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 390, height: 780}});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  const chip = page.locator('sf-table#table .sf-table-tags sf-tag .sf-tag').first();
  await chip.click({position: {x: 12, y: 8}});
  await page.waitForFunction(() => document.getElementById('table').getFilterOptions({key: 'author', filter: {optionsSource: {type: 'endpoint', url: '/filter-options?scope_ref=scope%3Atest&structure_id=workbench.demo&field_key=author'}}}).some((item) => item.value === 'first'));
  const menu = page.locator('sf-context-menu[aria-label^="Настройка фильтра"]');
  if (!(await menu.textContent()).includes('Selected outside page')) throw new Error('off-page selected label absent');
  if (!(await menu.textContent()).includes('First page')) throw new Error('first page absent');
  await menu.locator('sf-button').filter({hasText: 'Загрузить ещё'}).locator('button').click();
  await page.waitForFunction(() => document.getElementById('table').getFilterOptions({key: 'author', filter: {optionsSource: {type: 'endpoint', url: '/filter-options?scope_ref=scope%3Atest&structure_id=workbench.demo&field_key=author'}}}).some((item) => item.value === 'second'));
  if (!(await menu.textContent()).includes('Second page')) throw new Error('second page absent');
  if (requests.length !== 2 || requests[0].searchParams.get('selected_values[]') !== 'offpage'
    || requests[1].searchParams.get('cursor') !== 'next') throw new Error('cursor or selected-values request invalid');
  const race = await page.evaluate(async () => {
    const table = document.getElementById('table');
    const field = table.getFilterField('author');
    const stale = table.loadEndpointFilterPage(field, 'slow');
    const fresh = table.loadEndpointFilterPage(field);
    await Promise.all([stale, fresh]);
    await new Promise((done) => setTimeout(done, 300));
    const afterRace = table._filterOptionPages.get('author');
    const failed = await table.loadEndpointFilterPage(field, 'error');
    const afterError = table._filterOptionPages.get('author');
    return {raceValues: afterRace.items.map((item) => item.value), failed,
      errorStatus: afterError.status, errorValues: afterError.items.map((item) => item.value)};
  });
  if (race.raceValues.includes('stale') || !race.raceValues.includes('first')) throw new Error('stale response replaced fresh options');
  if (race.failed || race.errorStatus !== 'error' || !race.errorValues.includes('first')) throw new Error('request error lost prior options');
  if (errors.length) throw new Error(`browser errors: ${errors.join('; ')}`);
  process.stdout.write('table filter endpoint browser: PASS (selected label, two pages, stale response, error recovery, no page errors)\n');
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
