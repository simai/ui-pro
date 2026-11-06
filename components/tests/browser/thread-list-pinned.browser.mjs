#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-chat-threads (owner, 2026-10-28, q-a49e2045c1), on the built bytes:
// - pinned conversations (pinned: true, Mirai24 API v1.1) lead under their own
//   heading «Закреплённые» (sf-list's, since 2.0.0); the days follow with the
//   rest; without groups the pinned ones simply lead; pinning is the
//   host's action: the row menu offers what the host gave and reports it;
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/avatars/css/avatars.css',
  'component/component/context-menu/css/context-menu.css', 'component/component/icon-buttons/css/icon-buttons.css',
  'component/component/skeleton/css/skeleton.css', 'component/component/dropdown/css/dropdown.css', 'smart/smart/list/css/list.css',
  'smart/smart/chat-threads/css/chat-threads.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/badge/js/badge.js', 'smart/smart/avatar/js/avatar.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/button/js/button.js',
  'smart/smart/empty-state/js/empty-state.js', 'smart/smart/list-item/js/list-item.js', 'smart/smart/list/js/list.js',
  'smart/smart/chat-threads/js/chat-threads.js',
].map((p) => join(out, p));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.join(', ')}`);

const now = Date.now();
const iso = (hours) => new Date(now - hours * 3600e3).toISOString();
const THREADS = [
  {id: 'a', title: 'Сегодняшний', 'updated-at': iso(0.5)},
  {id: 'p1', title: 'Закреплённый давний', 'updated-at': iso(24 * 30), pinned: true},
  {id: 'b', title: 'Давний', 'updated-at': iso(24 * 10)},
  {id: 'p2', title: 'Закреплённый сегодня', 'updated-at': iso(1), pinned: true, caption: 'Анна: да'},
];

const failures = [];
const browser = await chromium.launch();
const open = async (options) => {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"><div id="box" style="display:flex;flex-direction:column;height:600px;width:320px"></div></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-chat-threads')));
  return {context, page};
};
const make = (page, attributes = {}) => page.evaluate(async ({threads, attributes}) => {
  const box = document.getElementById('box');
  box.replaceChildren();
  window.events = [];
  const list = document.createElement('sf-chat-threads');
  list.id = 'list';
  for (const [name, value] of Object.entries(attributes)) list.setAttribute(name, value);
  list.addEventListener('sf-chat-threads-apply', (event) => window.events.push(event.detail));
  box.append(list);
  list.actions = [{id: 'pin', text: 'Закрепить'}];
  list.setThreads({threads, 'has-more': false});
  await new Promise((done) => setTimeout(done, 300));
}, {threads: THREADS, attributes});

try {
  // Pinned, grouped by day.
  const desk = await open({viewport: {width: 900, height: 700}});
  await make(desk.page);
  const grouped = await desk.page.evaluate(() => {
    const list = document.getElementById('list');
    return [...list.querySelectorAll('.sf-list__group')].map((group) => ({
      key: group.dataset.group,
      heading: group.querySelector('.sf-list__heading')?.textContent.trim(),
      ids: [...group.querySelectorAll('.sf-list__row')].map((item) => item.dataset.id),
    }));
  });
  const first = grouped[0];
  if (!first || first.key !== 'pinned' || first.heading !== 'Закреплённые' || first.ids.join() !== 'p1,p2') {
    failures.push(`the pinned ones do not lead under «Закреплённые»: ${JSON.stringify(grouped)}`);
  }
  const rest = grouped.slice(1);
  if (rest.some((group) => group.ids.some((id) => id.startsWith('p')))) {
    failures.push(`a pinned conversation is also under a day: ${JSON.stringify(rest)}`);
  }
  // Without groups the pinned ones lead.
  await make(desk.page, {'group-by': 'none'});
  const flat = await desk.page.evaluate(() => [...document.querySelectorAll('#list .sf-list__row')].map((item) => item.dataset.id));
  if (flat.slice(0, 2).join() !== 'p1,p2') failures.push(`without groups the pinned ones do not lead: ${flat.join()}`);
  // Pinning is the host's: the menu offers its action and reports the row.
  await make(desk.page);
  await desk.page.hover('#list .sf-list__row[data-id="b"]');
  await desk.page.click('#list .sf-list__row[data-id="b"] .sf-list__actions');
  await desk.page.waitForTimeout(250);
  const pin = desk.page.locator('text=Закрепить').first();
  if (await pin.count()) {
    await pin.click();
    await desk.page.waitForTimeout(150);
    const events = await desk.page.evaluate(() => window.events);
    const event = events.at(-1);
    if (!event || event.action !== 'pin' || !(event.ids ?? []).includes('b')) failures.push(`«Закрепить» did not leave as apply for its row: ${JSON.stringify(events)}`);
  } else {
    failures.push('the row menu does not offer the host\'s «Закрепить»');
  }
  await desk.context.close();
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('thread-list: pinned conversations lead under their own heading; pinning is the host\'s action');
