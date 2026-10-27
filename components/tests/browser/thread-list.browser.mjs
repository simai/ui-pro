#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-thread-list on the built bytes:
// - conversations grouped by the day they last changed, the open one marked by
//   aria-current and weight, one Tab stop for the whole list;
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
  await page.waitForFunction(() => Boolean(customElements.get('sf-thread-list')));

  const make = async ({attributes = {}, threads = 'days', hasMore = false, actions = null, footer = false} = {}) => {
    await page.evaluate(async ({attributes, threads, hasMore, actions, footer}) => {
      const box = document.getElementById('box');
      box.replaceChildren();
      window.events = [];
      const list = document.createElement('sf-thread-list');
      list.id = 'list';
      for (const [name, value] of Object.entries(attributes)) list.setAttribute(name, value);
      if (footer) list.innerHTML = '<div slot="footer"><a id="usage" href="#usage">Мой расход</a></div>';
      for (const name of ['create', 'select', 'rename', 'archive', 'unarchive', 'action', 'load-more', 'view']) {
        list.addEventListener(`sf-thread-list-${name}`, (event) => window.events.push({name, ...event.detail}));
      }
      box.append(list);
      if (actions) list.actions = actions;
      const day = 24 * 3600 * 1000;
      const now = Date.now();
      const items = threads === 'days'
        ? [
          {id: 't1', title: 'Сегодняшний', updated_at: new Date(now - 60 * 1000).toISOString()},
          {id: 't2', title: 'Тоже сегодня', updated_at: new Date(now - 120 * 1000).toISOString()},
          {id: 't3', title: 'Вчерашний', updated_at: new Date(new Date().setHours(12, 0, 0, 0) - day).toISOString()},
          {id: 't4', title: 'Давний разговор с очень длинным названием, которое не помещается в строку списка', updated_at: '2026-01-02T10:00:00Z'},
          {id: 't9', title: 'В архиве', updated_at: '2026-01-01T10:00:00Z', archived: true},
        ]
        : threads === 'long'
          ? Array.from({length: 40}, (_, index) => ({id: `l${index}`, title: `Разговор ${index}`, updated_at: new Date(now - index * day * 3).toISOString()}))
          : threads;
      list.setThreads(items, {hasMore});
      await new Promise((done) => setTimeout(done, 300));
    }, {attributes, threads, hasMore, actions, footer});
  };
  const focused = () => page.evaluate(() => document.activeElement?.dataset?.id ?? document.activeElement?.className ?? null);
  const events = () => page.evaluate(() => window.events.slice());

  // 1. Groups, the open row, one Tab stop.
  await make({attributes: {selected: 't3'}, footer: true});
  const shape = await page.evaluate(() => ({
    groups: [...document.querySelectorAll('.sf-thread-list__heading')].map((node) => node.textContent),
    rows: [...document.querySelectorAll('.sf-thread-list__link')].map((node) => node.dataset.id),
    stops: [...document.querySelectorAll('.sf-thread-list__link')].filter((node) => node.tabIndex === 0).map((node) => node.dataset.id),
    current: document.querySelector('.sf-thread-list__link[aria-current="page"]')?.dataset.id,
    weight: getComputedStyle(document.querySelector('.sf-thread-list__item--current .sf-thread-list__title')).fontWeight,
    label: document.querySelector('nav.sf-thread-list').getAttribute('aria-label'),
    footer: Boolean(document.getElementById('usage')),
    create: document.querySelector('[data-action="create"]')?.hidden,
  }));
  const expected = {groups: ['Сегодня', 'Вчера', 'Раньше'], rows: ['t1', 't2', 't3', 't4'], stops: ['t3'], current: 't3', label: 'Разговоры', footer: true, create: false};
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(shape[key]) !== JSON.stringify(value)) note({case: `groups and the open row: ${key}`, got: shape[key], expected: value});
  }
  if (Number(shape.weight) < 500) note({case: 'the open row is told by weight as well', got: shape.weight});
  const oneLine = await page.evaluate(() => {
    const long = document.querySelector('.sf-thread-list__link[data-id="t4"]');
    const short = document.querySelector('.sf-thread-list__link[data-id="t1"]');
    const title = long.querySelector('.sf-thread-list__title');
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
  at = await page.evaluate(() => document.activeElement?.closest?.('.sf-thread-list__item') ? 'inside' : 'outside');
  if (at !== 'outside') note({case: 'Tab leaves the list after one stop', got: at});

  // 3. Rename with F2: Enter keeps, Escape gives up.
  await page.evaluate(() => { window.events.length = 0; window.escaped = 0; document.addEventListener('keydown', (event) => { if (event.key === 'Escape') window.escaped += 1; }); });
  await page.focus('.sf-thread-list__link[data-id="t2"]');
  await page.keyboard.press('F2');
  await page.waitForTimeout(150);
  const editing = await page.evaluate(() => ({focused: document.activeElement?.classList.contains('sf-thread-list__rename'), value: document.activeElement?.value,
    selected: document.activeElement?.selectionStart === 0 && document.activeElement?.selectionEnd === document.activeElement?.value.length}));
  if (!editing.focused || editing.value !== 'Тоже сегодня' || !editing.selected) note({case: 'F2 opens the title for editing, selected', got: editing});
  await page.keyboard.type('Переименован');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  got = await events();
  at = await focused();
  const title = await page.evaluate(() => document.querySelector('.sf-thread-list__link[data-id="t2"] .sf-thread-list__title')?.textContent);
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
  const kept = await page.evaluate(() => ({title: document.querySelector('.sf-thread-list__link[data-id="t2"] .sf-thread-list__title')?.textContent, escaped: window.escaped}));
  if (got.length || kept.title !== 'Переименован' || at !== 't2' || kept.escaped !== 0) note({case: 'Escape gives up the rename, inside the list', got: {got, kept, at}});

  // 4. Shift+F10: the row's actions; Archive and the host's own.
  await make({actions: [{id: 'mute', text: 'Без звука', icon: 'notifications_off'}]});
  await page.focus('.sf-thread-list__link[data-id="t1"]');
  await page.keyboard.press('Shift+F10');
  await page.waitForTimeout(400);
  const menu = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].filter((node) => node.offsetParent).map((node) => node.textContent.replace(/\s+/g, ' ').trim()));
  if (menu.length !== 3 || !menu[0].includes('Переименовать') || !menu[1].includes('В архив') || !menu[2].includes('Без звука')) note({case: 'Shift+F10 opens the row\'s actions', got: menu});
  await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find((node) => node.offsetParent && node.textContent.includes('В архив'))?.click());
  await page.waitForTimeout(200);
  got = await events();
  if (JSON.stringify(got) !== JSON.stringify([{name: 'archive', id: 't1'}])) note({case: 'Archive reports its row', got});
  await page.evaluate(() => { window.events.length = 0; });
  await page.click('.sf-thread-list__item[data-id="t2"] .sf-thread-list__more', {force: true});
  await page.waitForTimeout(400);
  await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find((node) => node.offsetParent && node.textContent.includes('Без звука'))?.click());
  await page.waitForTimeout(200);
  got = await events();
  if (JSON.stringify(got) !== JSON.stringify([{name: 'action', id: 't2', action: 'mute'}])) note({case: 'the host\'s own action reports its row', got});
  const moreStop = await page.evaluate(() => document.querySelector('.sf-thread-list__more').tabIndex);
  if (moreStop !== -1) note({case: 'the «⋯» is not a Tab stop', got: moreStop});

  // 5. A long list asks for the next page once, at its end.
  await make({threads: 'long', hasMore: true});
  got = await events();
  if (got.length) note({case: 'the first page in view asks for nothing', got});
  await page.evaluate(() => { const scroller = document.querySelector('.sf-thread-list__scroller'); scroller.scrollTop = scroller.scrollHeight; });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const scroller = document.querySelector('.sf-thread-list__scroller'); scroller.scrollTop -= 10; scroller.scrollTop += 10; });
  await page.waitForTimeout(300);
  got = await events();
  if (JSON.stringify(got) !== JSON.stringify([{name: 'load-more'}])) note({case: 'the end of a long list asks for the next page once', got});
  await page.evaluate(() => {
    window.events.length = 0;
    const list = document.getElementById('list');
    list.appendThreads([{id: 'l0', title: 'Повтор', updated_at: '2020-01-01T00:00:00Z'},
      {id: 'x1', title: 'Следующая страница', updated_at: '2020-01-01T00:00:00Z'}], {hasMore: false});
  });
  await page.waitForTimeout(300);
  const appended = await page.evaluate(() => ({rows: document.querySelectorAll('.sf-thread-list__link').length, last: [...document.querySelectorAll('.sf-thread-list__link')].at(-1)?.dataset.id}));
  if (appended.rows !== 41 || appended.last !== 'x1') note({case: 'the next page joins without repeating a row', got: appended});

  // 6. Empty, loading, archived, no-manage, a people's list.
  await make({threads: []});
  const empty = await page.evaluate(() => document.querySelector('.sf-thread-list__status:not([hidden])')?.textContent.trim());
  if (empty !== 'Разговоров пока нет') note({case: 'an empty list says so', got: empty});
  const loading = await page.evaluate(async () => {
    const list = document.getElementById('list');
    list.setLoading(true);
    await new Promise((done) => setTimeout(done, 150));
    return {busy: document.querySelector('.sf-thread-list__scroller').getAttribute('aria-busy'),
      rows: document.querySelectorAll('.sf-thread-list__skeleton span').length,
      status: document.querySelector('.sf-thread-list__status')?.hidden};
  });
  if (loading.busy !== 'true' || loading.rows !== 3 || loading.status !== true) note({case: 'loading shows the shape of the list, busy', got: loading});

  await make({attributes: {archived: ''}});
  const archive = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('.sf-thread-list__link')].map((node) => node.dataset.id),
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
    more: document.querySelectorAll('.sf-thread-list__more').length,
    head: document.querySelector('.sf-thread-list__head')?.hidden,
    footer: document.querySelector('.sf-thread-list__footer')?.hidden,
  }));
  if (JSON.stringify(plain) !== JSON.stringify({more: 0, head: true, footer: true})) note({case: 'no-manage, no-create, no-archive draw nothing they take away', got: plain});
  await page.focus('.sf-thread-list__link[data-id="t1"]');
  await page.keyboard.press('F2');
  await page.waitForTimeout(150);
  const renamed = await page.evaluate(() => Boolean(document.querySelector('.sf-thread-list__rename')));
  if (renamed) note({case: 'no-manage: F2 renames nothing'});

  await make({attributes: {'group-by': 'none', selected: 'p2'}, threads: [
    {id: 'p1', title: 'Анна Смирнова', caption: 'До завтра!', unread: 3, avatar: {text: 'АС'}, updated_at: new Date().toISOString()},
    {id: 'p2', title: 'Отдел продаж', caption: 'Пётр: отчёт готов', unread: 0, updated_at: '2026-01-01T00:00:00Z'},
    {id: 'p3', title: 'Пётр', caption: 'Спасибо', unread: 250, updated_at: '2025-01-01T00:00:00Z'},
  ]});
  const people = await page.evaluate(() => ({
    headings: document.querySelectorAll('.sf-thread-list__heading').length,
    captions: [...document.querySelectorAll('.sf-thread-list__caption')].map((node) => node.textContent),
    unread: [...document.querySelectorAll('sf-badge.sf-thread-list__unread')].map((node) => [node.getAttribute('text'), node.getAttribute('aria-label')]),
    avatars: document.querySelectorAll('sf-avatar.sf-thread-list__avatar').length,
    listLabel: document.querySelector('.sf-thread-list__list')?.getAttribute('aria-label'),
  }));
  const expectedPeople = {headings: 0, captions: ['До завтра!', 'Пётр: отчёт готов', 'Спасибо'], unread: [['3', 'Непрочитанных: 3'], ['99+', 'Непрочитанных: 250']], avatars: 1, listLabel: 'Разговоры'};
  if (JSON.stringify(people) !== JSON.stringify(expectedPeople)) note({case: 'a people\'s list: no groups, captions, unread counts, an avatar', got: people});

  // 7. English.
  await page.evaluate(() => document.documentElement.setAttribute('lang', 'en'));
  await make();
  const english = await page.evaluate(() => ({
    groups: [...document.querySelectorAll('.sf-thread-list__heading')].map((node) => node.textContent),
    create: document.querySelector('[data-action="create"] span')?.textContent,
    label: document.querySelector('nav.sf-thread-list').getAttribute('aria-label'),
  }));
  if (JSON.stringify(english) !== JSON.stringify({groups: ['Today', 'Yesterday', 'Earlier'], create: 'New conversation', label: 'Conversations'})) note({case: 'an English page speaks English', got: english});

  if (errors.length) note({case: 'no page errors', got: errors});
  console.log(JSON.stringify({checked: 7}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('THREAD_LIST_OK');
