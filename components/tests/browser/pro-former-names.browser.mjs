#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Build output root is required: the free output with the package laid into
// smart/smart (scripts/run-browser-probes.mjs makes it).
//
// Rename plan R2 (2026-11-03): six package elements took new tags and keep the
// old ones as dated aliases until 2027-01-01. Measured on the built bytes, on a
// served page that declares the package as a consumer's page does, with the
// real Loader:
//   - markup that still writes a former tag (sf-table, sf-data-view,
//     sf-property-view, sf-content-editor, sf-thread-list, sf-change-confirm)
//     is found by the Loader, upgrades as the new element (instanceof its
//     class) and keeps its own tag name, and the use is noted in
//     SF.deprecations;
//   - an old sf-table draws as sf-view-table does: the cells and the header's
//     sort button carry the same computed style (the sheet reads
//     :is(sf-view-table, sf-table));
//   - every former event name still fires, chains included: a create sends
//     sf-view-table-create, sf-table-create and sf-table-create-intent; an
//     action sends sf-view-table-apply, sf-table-apply and the split row's
//     sf-table-action-intent with its own detail; a conversation asked for
//     sends sf-chat-threads-open, sf-thread-list-open and sf-thread-list-select.
import {createServer} from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {extname, join, resolve} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const parts = {core: join(out, 'core', 'core'), component: join(out, 'component', 'component'), smart: join(out, 'smart', 'smart'), utility: join(out, 'utility', 'utility')};
for (const [name, path] of Object.entries(parts)) if (!existsSync(path)) throw new Error(`${name} not found under ${out}`);
const ruleFile = join(parts.smart, 'rule.js');
const registered = existsSync(ruleFile) ? /registerPackage\(\s*["']([a-z][a-z0-9-]*)["']/u.exec(readFileSync(ruleFile, 'utf8'))?.[1] : null;
if (!registered) throw new Error(`no package rule file at ${ruleFile}`);

const RENAMED = [
  ['sf-table', 'sf-view-table'],
  ['sf-data-view', 'sf-view'],
  ['sf-property-view', 'sf-view-properties'],
  ['sf-content-editor', 'sf-editor-content'],
  ['sf-thread-list', 'sf-chat-threads'],
  ['sf-change-confirm', 'sf-confirm-change'],
];
const TABLE = 'aria-label="Записи" toolbar="false" selectable="false" settings="false" layout="table"';
const page = `<!doctype html><html lang="ru" class="theme-light"><head><meta charset="utf-8">
<script>window.sfPath='/distr/';window.sfSmartPath='/distr/';window.SF_BOOT_CONFIG={preloader:{enabled:false},packages:{${registered}:{base:'/distr/smart/'}}};</script>
<link rel="stylesheet" href="/distr/core/css/core.css">
<script src="/distr/core/js/core.js"></script></head><body style="margin:0"><div style="width:900px">
<sf-table id="old" ${TABLE}></sf-table>
<sf-view-table id="new" ${TABLE}></sf-view-table>
<sf-data-view id="old-view" aria-label="Записи"></sf-data-view>
<sf-property-view id="old-properties" aria-label="Запись"></sf-property-view>
<sf-content-editor id="old-editor"></sf-content-editor>
<sf-thread-list id="old-threads"></sf-thread-list>
<sf-change-confirm id="old-card" heading="Переименовать раздел" change-id="c1"></sf-change-confirm>
</div></body></html>`;

const types = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'};
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://probe').pathname);
  if (path === '/probe') {
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    return response.end(page);
  }
  const match = path.match(/^\/distr\/([^/]+)\/(.+)$/u);
  const file = match && parts[match[1]] ? join(parts[match[1]], match[2]) : '';
  if (!file || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404);
    return response.end();
  }
  const charset = ['.js', '.mjs', '.css', '.json', '.svg'].includes(extname(file)) ? '; charset=utf-8' : '';
  response.writeHead(200, {'content-type': `${types[extname(file)] ?? 'application/octet-stream'}${charset}`});
  return response.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((settle) => server.once('listening', settle));

const failures = [];
const browser = await chromium.launch();
try {
  const tab = await browser.newPage({viewport: {width: 1000, height: 900}});
  await tab.goto(`http://127.0.0.1:${server.address().port}/probe`);
  await tab.waitForFunction((pairs) => pairs.every(([old, to]) => customElements.get(old) && customElements.get(to)), RENAMED, {timeout: 15000})
    .catch(() => {});
  const result = await tab.evaluate(async (pairs) => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const upgraded = pairs.map(([old, to]) => {
      const element = document.querySelector(old);
      const Class = customElements.get(to);
      return {old, to, defined: Boolean(customElements.get(old)), upgraded: Boolean(Class && element instanceof Class), tag: element?.localName};
    });
    const noted = (globalThis.SF?.deprecations?.list?.() ?? globalThis.SF?.deprecations?.entries?.() ?? [])
      .filter((entry) => entry.kind === 'tag').map((entry) => entry.from);

    // An old sf-table draws as the new one does.
    const columns = [{key: 'title', label: 'Название', role: 'title', sortable: true}];
    const rows = [{id: 'a', revision: 'r1', title: 'Первая'}, {id: 'b', revision: 'r1', title: 'Вторая'}];
    for (const id of ['old', 'new']) {
      const table = document.getElementById(id);
      table.setColumns(columns);
      table.setRows(rows);
    }
    await frame();
    await new Promise((done) => setTimeout(done, 200));
    const look = (id) => {
      const table = document.getElementById(id);
      const cell = table.querySelector('tbody tr[data-row-id] > *');
      const sort = table.querySelector('.sf-table-sort-button');
      if (!cell) return null;
      const a = getComputedStyle(cell);
      const b = sort ? getComputedStyle(sort) : null;
      return {
        cell: {paddingTop: a.paddingTop, fontSize: a.fontSize, lineHeight: a.lineHeight, verticalAlign: a.verticalAlign},
        sort: b && {borderTopWidth: b.borderTopWidth, backgroundColor: b.backgroundColor, cursor: b.cursor},
        height: Math.round(table.getBoundingClientRect().height),
      };
    };
    const styled = {old: look('old'), new: look('new')};

    // The former event names, chains and the split row included.
    const heard = (element, names, act) => {
      const got = {};
      const listeners = names.map((name) => [name, (event) => { got[name] = event.detail ?? null; }]);
      for (const [name, listener] of listeners) element.addEventListener(name, listener);
      try { act(); } finally { for (const [name, listener] of listeners) element.removeEventListener(name, listener); }
      return got;
    };
    const table = document.getElementById('old');
    const create = heard(table, ['sf-view-table-create', 'sf-table-create', 'sf-table-create-intent'], () => table.requestCreateIntent());
    const apply = heard(table, ['sf-view-table-apply', 'sf-table-apply', 'sf-table-action-intent'], () => table.requestActionIntent('archive', ['a']));
    const threads = document.getElementById('old-threads');
    threads.setThreads?.([{id: 't1', title: 'Разговор', 'updated-at': new Date().toISOString()}]);
    const open = heard(threads, ['sf-chat-threads-open', 'sf-thread-list-open', 'sf-thread-list-select'], () => threads.open('t1'));
    return {upgraded, noted, styled, create, apply, open};
  }, RENAMED);

  for (const one of result.upgraded) {
    if (!one.defined) failures.push(`${one.old} is not defined beside ${one.to}`);
    else if (!one.upgraded) failures.push(`<${one.old}> in markup did not upgrade as ${one.to}`);
    if (one.tag !== one.old) failures.push(`<${one.old}> became <${one.tag}>`);
  }
  if (!result.noted.includes('sf-table')) failures.push(`SF.deprecations does not note the former tag sf-table (tag notes: ${JSON.stringify(result.noted)})`);
  if (!result.styled.old || !result.styled.new) failures.push(`a table drew no rows: ${JSON.stringify(result.styled)}`);
  else {
    if (JSON.stringify(result.styled.old) !== JSON.stringify(result.styled.new)) failures.push(`<sf-table> draws unlike <sf-view-table>: ${JSON.stringify(result.styled)}`);
    if (result.styled.old.cell.paddingTop === '0px') failures.push('the old table\'s cells have no padding: the sheet did not reach it');
  }
  const expect = (what, got, names) => {
    for (const name of names) if (!(name in got)) failures.push(`${what}: ${name} did not fire (heard ${Object.keys(got).join(', ') || 'nothing'})`);
  };
  expect('create', result.create, ['sf-view-table-create', 'sf-table-create', 'sf-table-create-intent']);
  expect('apply', result.apply, ['sf-view-table-apply', 'sf-table-apply', 'sf-table-action-intent']);
  if (result.apply['sf-table-action-intent'] && !('action_id' in result.apply['sf-table-action-intent'])) {
    failures.push(`sf-table-action-intent lost its own detail: ${JSON.stringify(result.apply['sf-table-action-intent'])}`);
  }
  expect('open', result.open, ['sf-chat-threads-open', 'sf-thread-list-open', 'sf-thread-list-select']);
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('pro former names: the six former tags upgrade as the new elements and draw alike; every former event name still fires');
