#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-chat-threads on the built bytes:
// - conversations grouped by the day they last changed (the rows are sf-list's
//   since 2.0.0), the open one marked by aria-current, one Tab stop for the
//   whole list;
// - arrows, Home and End move between rows, Enter opens one (the list reports
//   it and does not move `selected` itself);
// - F2 renames in place: Enter keeps and reports, Escape gives up and does not
//   leave the list; focus returns to the row;
// - Shift+F10 opens the row's actions, Archive and the host's own action report
//   their row;
// - a long list asks for the next page once at its end, and moreFailed() lets
//   it ask again;
// - empty, archived, no-manage and the people's list (no groups, caption,
//   unread count) each draw what they promise; a long title stays one line.
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

const failures = [];
const note = (detail) => failures.push(detail);
const errors = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 900, height: 700}});
  // Bundles added as inline module tags cannot work out their own public path;
  // the Loader gives them one on a real page. That one message is the harness's.
  page.on('pageerror', (error) => { if (!/Automatic publicPath/u.test(error.message)) errors.push(error.message); });
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"><button id="before">до</button><div id="box" style="display:flex;flex-direction:column;height:420px;width:280px"></div></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-chat-threads')));

  const make = async ({attributes = {}, threads = 'days', hasMore = false, actions = null, footer = false} = {}) => {
    await page.evaluate(async ({attributes, threads, hasMore, actions, footer}) => {
      const box = document.getElementById('box');
      box.replaceChildren();
      window.events = [];
      const list = document.createElement('sf-chat-threads');
      list.id = 'list';
      for (const [name, value] of Object.entries(attributes)) list.setAttribute(name, value);
      if (footer) list.innerHTML = '<div slot="footer"><a id="usage" href="#usage">Мой расход</a></div>';
      // The 1.1 names (vocabulary 1.1.5), read back in the words of the cases
      // below: open is the old select, restore unarchive, apply action, toggle view.
      const read = {
        create: ['create', () => ({})],
        open: ['select', ({id}) => ({id})],
        rename: ['rename', ({id, title}) => ({id, title})],
        archive: ['archive', ({id}) => ({id})],
        restore: ['unarchive', ({id}) => ({id})],
        apply: ['action', ({id, action}) => ({id, action})],
        'load-more': ['load-more', () => ({})],
        toggle: ['view', ({archived}) => ({archived})],
      };
      for (const [verb, [name, pick]] of Object.entries(read)) {
        list.addEventListener(`sf-thread-list-${verb}`, (event) => window.events.push({name, ...pick(event.detail)}));
      }
      box.append(list);
      if (actions) list.actions = actions;
      const day = 24 * 3600 * 1000;
      const now = Date.now();
      const items = threads === 'days'
        ? [
          {id: 't1', title: 'Сегодняшний', 'updated-at': new Date(now - 60 * 1000).toISOString()},
          {id: 't2', title: 'Тоже сегодня', 'updated-at': new Date(now - 120 * 1000).toISOString()},
          {id: 't3', title: 'Вчерашний', 'updated-at': new Date(new Date().setHours(12, 0, 0, 0) - day).toISOString()},
          {id: 't4', title: 'Давний разговор с очень длинным названием, которое не помещается в строку списка', 'updated-at': '2026-01-02T10:00:00Z'},
          {id: 't9', title: 'В архиве', 'updated-at': '2026-01-01T10:00:00Z', archived: true},
        ]
        : threads === 'long'
          ? Array.from({length: 40}, (_, index) => ({id: `l${index}`, title: `Разговор ${index}`, 'updated-at': new Date(now - index * day * 3).toISOString()}))
          : threads;
      list.setThreads(items, {hasMore});
      await new Promise((done) => setTimeout(done, 300));
    }, {attributes, threads, hasMore, actions, footer});
  };
  const focused = () => page.evaluate(() => document.activeElement?.closest?.('.sf-list__row')?.dataset.id ?? document.activeElement?.className ?? null);
  const ROW = (id) => `.sf-list__row[data-id="${id}"] .sf-list-item[data-sf-list-roving]`;
  const events = () => page.evaluate(() => window.events.slice());

  // 1. Groups, the open row, one Tab stop.
  await make({attributes: {selected: 't3'}, footer: true});
  const shape = await page.evaluate(() => ({
    groups: [...document.querySelectorAll('.sf-list__heading')].map((node) => node.textContent.trim()),
    rows: [...document.querySelectorAll('.sf-list__row')].map((node) => node.dataset.id),
    stops: [...document.querySelectorAll('.sf-list-item[data-sf-list-roving]')].filter((node) => node.tabIndex === 0).map((node) => node.closest('.sf-list__row').dataset.id),
    current: document.querySelector('.sf-list-item[data-sf-list-roving][aria-current="true"]')?.closest('.sf-list__row').dataset.id,
    label: document.querySelector('nav.sf-thread-list').getAttribute('aria-label'),
    footer: Boolean(document.getElementById('usage')),
    create: document.querySelector('[data-action="create"]')?.hidden,
  }));
  // Earlier days are named by their date (sf-list's day groups, since 2.0.0).
  const expected = {groups: ['Сегодня', 'Вчера', '2 января'], rows: ['t1', 't2', 't3', 't4'], stops: ['t3'], current: 't3', label: 'Разговоры', footer: true, create: false};
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(shape[key]) !== JSON.stringify(value)) note({case: `groups and the open row: ${key}`, got: shape[key], expected: value});
  }
  const oneLine = await page.evaluate(() => {
    const long = document.querySelector('.sf-list__row[data-id="t4"] .sf-list-item[data-sf-list-roving]');
    const short = document.querySelector('.sf-list__row[data-id="t1"] .sf-list-item[data-sf-list-roving]');
    const title = long.querySelector('.sf-list-item-container');
    return {long: Math.round(long.getBoundingClientRect().height), short: Math.round(short.getBoundingClientRect().height), cut: title.scrollWidth > title.clientWidth,
      overflow: document.querySelector('.sf-thread-list__scroller').scrollWidth > document.querySelector('.sf-thread-list__scroller').clientWidth};
  });
  if (oneLine.long !== oneLine.short || !oneLine.cut || oneLine.overflow) note({case: 'a long title stays one line, cut, without a sideways scroll', got: oneLine});

  // 2. Keyboard: Tab enters on the open row, arrows move, Enter opens.
  // «New conversation» comes first, then the list as one stop.
  await page.focus('#before');
  await page.keyboard.press('Tab');
  let at = await page.evaluate(() => document.activeElement?.dataset?.action ?? null);
  if (at !== 'create') note({case: 'New conversation is the first stop', got: at});
  await page.keyboard.press('Tab');
  at = await focused();
  if (at !== 't3') note({case: 'Tab enters the list on the open row', got: at});
  await page.keyboard.press('ArrowDown');
  at = await focused();
  if (at !== 't4') note({case: 'ArrowDown moves to the next row', got: at});
  await page.keyboard.press('Home');
  at = await focused();
  if (at !== 't1') note({case: 'Home moves to the first row', got: at});
  await page.keyboard.press('End');
  at = await focused();
  if (at !== 't4') note({case: 'End moves to the last row', got: at});
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  let got = await events();
  if (JSON.stringify(got) !== JSON.stringify([{name: 'select', id: 't3'}])) note({case: 'Enter opens the row it is on', got});
  const stillSelected = await page.evaluate(() => document.getElementById('list').selected);
  if (stillSelected !== 't3') note({case: 'the list does not move selected itself', got: stillSelected});
  await page.keyboard.press('Tab');
  at = await page.evaluate(() => document.activeElement?.closest?.('.sf-list__row') ? 'inside' : 'outside');
  if (at !== 'outside') note({case: 'Tab leaves the list after one stop', got: at});

  // 3. Rename with F2: Enter keeps, Escape gives up.
  await page.evaluate(() => { window.events.length = 0; window.escaped = 0; document.addEventListener('keydown', (event) => { if (event.key === 'Escape') window.escaped += 1; }); });
  await page.focus(ROW('t2'));
  await page.keyboard.press('F2');
  await page.waitForTimeout(150);
  const editing = await page.evaluate(() => ({focused: document.activeElement?.classList.contains('sf-list__rename'), value: document.activeElement?.value,
    selected: document.activeElement?.selectionStart === 0 && document.activeElement?.selectionEnd === document.activeElement?.value.length}));
  if (!editing.focused || editing.value !== 'Тоже сегодня' || !editing.selected) note({case: 'F2 opens the title for editing, selected', got: editing});
  await page.keyboard.type('Переименован');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  got = await events();
  at = await focused();
  const title = await page.evaluate(() => document.querySelector('.sf-list__row[data-id="t2"] sf-list-item')?.getAttribute('text'));
  if (JSON.stringify(got) !== JSON.stringify([{name: 'rename', id: 't2', title: 'Переименован'}]) || title !== 'Переименован' || at !== 't2') {
    note({case: 'Enter keeps the new title, reports it and returns to the row', got: {got, title, at}});
  }
  await page.evaluate(() => { window.events.length = 0; });
  await page.keyboard.press('F2');
  await page.waitForTimeout(150);
  await page.keyboard.type('Не то');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  got = await events();
  at = await focused();
  const kept = await page.evaluate(() => ({title: document.querySelector('.sf-list__row[data-id="t2"] sf-list-item')?.getAttribute('text'), escaped: window.escaped}));
  if (got.length || kept.title !== 'Переименован' || at !== 't2' || kept.escaped !== 0) note({case: 'Escape gives up the rename, inside the list', got: {got, kept, at}});

  // 4. Shift+F10: the row's actions; Archive and the host's own.
  await make({actions: [{id: 'mute', text: 'Без звука', icon: 'notifications_off'}]});
  await page.focus(ROW('t1'));
  await page.keyboard.press('Shift+F10');
  await page.waitForTimeout(400);
  const menu = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].filter((node) => node.offsetParent).map((node) => node.textContent.replace(/\s+/g, ' ').trim()));
  if (menu.length !== 3 || !menu[0].includes('Переименовать') || !menu[1].includes('В архив') || !menu[2].includes('Без звука')) note({case: 'Shift+F10 opens the row\'s actions', got: menu});
  await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find((node) => node.offsetParent && node.textContent.includes('В архив'))?.click());
  await page.waitForTimeout(200);
  got = await events();
  if (JSON.stringify(got) !== JSON.stringify([{name: 'archive', id: 't1'}])) note({case: 'Archive reports its row', got});
  await page.evaluate(() => { window.events.length = 0; });
  await page.click('.sf-list__row[data-id="t2"] .sf-list__actions', {force: true});
  await page.waitForTimeout(400);
  await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find((node) => node.offsetParent && node.textContent.includes('Без звука'))?.click());
  await page.waitForTimeout(200);
  got = await events();
  if (JSON.stringify(got) !== JSON.stringify([{name: 'action', id: 't2', action: 'mute'}])) note({case: 'the host\'s own action reports its row', got});
  const moreStop = await page.evaluate(() => document.querySelector('.sf-list__actions').tabIndex);
  if (moreStop !== -1) note({case: 'the «⋯» is not a Tab stop', got: moreStop});

  // 5. A long list asks for the next page once, at its end.
  await make({threads: 'long', hasMore: true});
  got = await events();
  if (got.length) note({case: 'the first page in view asks for nothing', got});
  // The rows settle their height as sf-list-item draws them: scroll to the
  // end of what is there, then again to the end it grew to.
  for (let pass = 0; pass < 2; pass += 1) {
    await page.evaluate(() => { const scroller = document.querySelector('.sf-thread-list__scroller'); scroller.scrollTop = scroller.scrollHeight; });
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(300);
  got = await events();
  if (JSON.stringify(got) !== JSON.stringify([{name: 'load-more'}])) note({case: 'the end of a long list asks for the next page once', got});
  await page.evaluate(() => {
    window.events.length = 0;
    const list = document.getElementById('list');
    list.appendThreads([{id: 'l0', title: 'Повтор', 'updated-at': '2020-01-01T00:00:00Z'},
      {id: 'x1', title: 'Следующая страница', 'updated-at': '2020-01-01T00:00:00Z'}], {hasMore: false});
  });
  await page.waitForTimeout(300);
  const appended = await page.evaluate(() => ({rows: document.querySelectorAll('.sf-list__row').length, last: [...document.querySelectorAll('.sf-list__row')].at(-1)?.dataset.id}));
  if (appended.rows !== 41 || appended.last !== 'x1') note({case: 'the next page joins without repeating a row', got: appended});

  // 6. Empty, loading, archived, no-manage, a people's list.
  await make({threads: []});
  const empty = await page.evaluate(() => document.querySelector('.sf-list__empty sf-empty-state')?.getAttribute('heading'));
  if (empty !== 'Разговоров пока нет') note({case: 'an empty list says so', got: empty});
  const loading = await page.evaluate(async () => {
    const list = document.getElementById('list');
    list.loading = true;
    await new Promise((done) => setTimeout(done, 150));
    return {busy: document.querySelector('.sf-list__frame').getAttribute('aria-busy'),
      rows: document.querySelectorAll('.sf-list__skeleton span').length,
      status: document.querySelector('.sf-thread-list__status')?.hidden};
  });
  if (loading.busy !== 'true' || loading.rows !== 3 || loading.status !== true) note({case: 'loading shows the shape of the list, busy', got: loading});

  await make({attributes: {archived: ''}});
  const archive = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('.sf-list__row')].map((node) => node.dataset.id),
    create: document.querySelector('[data-action="create"]')?.hidden,
    back: document.querySelector('[data-action="back"]')?.hidden,
    label: document.querySelector('nav.sf-thread-list').getAttribute('aria-label'),
  }));
  if (JSON.stringify(archive) !== JSON.stringify({rows: ['t9'], create: true, back: false, label: 'Архив'})) note({case: 'the archive: its rows, a way back, no New', got: archive});
  await page.click('[data-action="back"]');
  got = await events();
  if (JSON.stringify(got) !== JSON.stringify([{name: 'view', archived: false}])) note({case: 'the way back from the archive', got});

  await make({attributes: {'no-manage': '', 'no-create': '', 'no-archive': ''}});
  const plain = await page.evaluate(() => ({
    more: document.querySelectorAll('.sf-list__actions').length,
    head: document.querySelector('.sf-thread-list__head')?.hidden,
    footer: document.querySelector('.sf-thread-list__footer')?.hidden,
  }));
  if (JSON.stringify(plain) !== JSON.stringify({more: 0, head: true, footer: true})) note({case: 'no-manage, no-create, no-archive draw nothing they take away', got: plain});
  await page.focus(ROW('t1'));
  await page.keyboard.press('F2');
  await page.waitForTimeout(150);
  const renamed = await page.evaluate(() => Boolean(document.querySelector('.sf-list__rename')));
  if (renamed) note({case: 'no-manage: F2 renames nothing'});

  await make({attributes: {'group-by': 'none', selected: 'p2'}, threads: [
    {id: 'p1', title: 'Анна Смирнова', caption: 'До завтра!', unread: 3, avatar: {text: 'АС'}, 'updated-at': new Date().toISOString()},
    {id: 'p2', title: 'Отдел продаж', caption: 'Пётр: отчёт готов', unread: 0, 'updated-at': '2026-01-01T00:00:00Z'},
    {id: 'p3', title: 'Пётр', caption: 'Спасибо', unread: 250, 'updated-at': '2025-01-01T00:00:00Z'},
  ]});
  const people = await page.evaluate(() => ({
    headings: document.querySelectorAll('.sf-list__heading').length,
    captions: [...document.querySelectorAll('.sf-list__row sf-list-item')].map((node) => node.getAttribute('supporting')),
    unread: [...document.querySelectorAll('sf-badge.sf-list__count')].map((node) => [node.getAttribute('text'), node.getAttribute('aria-label')]),
    avatars: document.querySelectorAll('.sf-list__row sf-avatar').length,
    listLabel: document.querySelector('.sf-list__rows')?.getAttribute('aria-label'),
  }));
  const expectedPeople = {headings: 0, captions: ['До завтра!', 'Пётр: отчёт готов', 'Спасибо'], unread: [['3', '3 непрочитанных'], ['99+', '250 непрочитанных']], avatars: 1, listLabel: 'Разговоры'};
  if (JSON.stringify(people) !== JSON.stringify(expectedPeople)) note({case: 'a people\'s list: no groups, captions, unread counts, an avatar', got: people});

  // 7. English.
  await page.evaluate(() => document.documentElement.setAttribute('lang', 'en'));
  await make();
  const english = await page.evaluate(() => ({
    groups: [...document.querySelectorAll('.sf-list__heading')].map((node) => node.textContent.trim()),
    create: document.querySelector('[data-action="create"] span')?.textContent,
    label: document.querySelector('nav.sf-thread-list').getAttribute('aria-label'),
  }));
  if (JSON.stringify(english) !== JSON.stringify({groups: ['Today', 'Yesterday', 'January 2'], create: 'New conversation', label: 'Conversations'})) note({case: 'an English page speaks English', got: english});

  if (errors.length) note({case: 'no page errors', got: errors});
  console.log(JSON.stringify({checked: 7}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('THREAD_LIST_OK');
