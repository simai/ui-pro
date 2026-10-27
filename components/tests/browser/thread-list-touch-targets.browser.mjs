#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-thread-list (owner, 2026-10-28, q-a49e2045c1), on the built bytes:
// - under a finger (a touch phone: pointer coarse) a row, «Новый разговор» and
//   a row's «⋯» are at least 44px; with a mouse the row keeps the ladder's step.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/avatars/css/avatars.css',
  'component/component/context-menu/css/context-menu.css',
  'smart/smart/thread-list/css/thread-list.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/badge/js/badge.js', 'smart/smart/avatar/js/avatar.js',
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/thread-list/js/thread-list.js',
].map((p) => join(out, p));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.join(', ')}`);

const now = Date.now();
const iso = (hours) => new Date(now - hours * 3600e3).toISOString();
const THREADS = [
  {id: 'a', title: 'Сегодняшний', 'updated-at': iso(0.5)},
  {id: 'b', title: 'Давний', 'updated-at': iso(24 * 10), caption: 'Анна: да'},
];

const failures = [];
const browser = await chromium.launch();
const open = async (options) => {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"><div id="box" style="display:flex;flex-direction:column;height:600px;width:320px"></div></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-thread-list')));
  return {context, page};
};
const make = (page, attributes = {}) => page.evaluate(async ({threads, attributes}) => {
  const box = document.getElementById('box');
  box.replaceChildren();
  window.events = [];
  const list = document.createElement('sf-thread-list');
  list.id = 'list';
  for (const [name, value] of Object.entries(attributes)) list.setAttribute(name, value);
  list.addEventListener('sf-thread-list-apply', (event) => window.events.push(event.detail));
  box.append(list);
  list.actions = [{id: 'pin', text: 'Закрепить'}];
  list.setThreads({threads, 'has-more': false});
  await new Promise((done) => setTimeout(done, 300));
}, {threads: THREADS, attributes});

try {
  const desk = await open({viewport: {width: 900, height: 700}});
  await make(desk.page);
  // A mouse keeps the ladder's row.
  const mouse = await desk.page.evaluate(() => Math.round(document.querySelector('#list .sf-thread-list__link').getBoundingClientRect().height));
  if (mouse >= 44) failures.push(`with a mouse the row is ${mouse}px, not the ladder's step`);
  await desk.context.close();

  // Under a finger: 44px targets.
  const phone = await open({viewport: {width: 390, height: 700}, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
  await make(phone.page, {'group-by': 'none'});
  const sizes = await phone.page.evaluate(() => {
    const list = document.getElementById('list');
    const box = (node) => (node ? node.getBoundingClientRect() : null);
    const coarse = matchMedia('(pointer: coarse)').matches;
    const link = box(list.querySelector('.sf-thread-list__link'));
    const more = box(list.querySelector('.sf-thread-list__more'));
    const create = box(list.querySelector('.sf-thread-list__command[data-action="create"]'));
    return {coarse, link: link && Math.round(link.height), more: more && [Math.round(more.width), Math.round(more.height)],
      create: create && Math.round(create.height)};
  });
  if (!sizes.coarse) failures.push('the phone context is not a coarse pointer');
  if (!(sizes.link >= 44) || !(sizes.create >= 44) || !(sizes.more?.[0] >= 44 && sizes.more?.[1] >= 44)) {
    failures.push(`a target under a finger is under 44px: ${JSON.stringify(sizes)}`);
  }
  await phone.context.close();
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('thread-list: 44px targets under a finger, the ladder\'s row under a mouse');
