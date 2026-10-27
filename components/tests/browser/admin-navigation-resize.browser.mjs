#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The admin menu's navigation shell (owner, 2026-10-14), measured on the built
// bytes with a host port that answers the menu:
// - both columns stand with an sf-resizer on their edge; dragging the first
//   column's edge widens it within 13rem..24rem and the width is kept on the
//   next page; a double click gives the width back;
// - the theme is a row of the profile menu with its choice in a submenu.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/admin-menu/css/admin-menu.css',
  'component/component/badges/css/badges.css',
  'component/component/inputs/css/inputs.css',
  'component/component/context-menu/css/context-menu.css',
  'smart/smart/admin-menu/css/admin-menu.css',
  'smart/smart/resizer/css/resizer.css',
  'smart/smart/profile-picker/css/profile-picker.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/profile-picker/js/profile-picker.js', 'smart/smart/admin-menu/js/admin-menu.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1400, height: 800}});
// An origin of its own, so the remembered width has a storage to live in.
await context.route('http://probe.test/**', (route) => route.fulfill({status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>'}));

const NAVIGATION = {
  answer: 'applied', revision: '1', current: 'cms',
  items: [
    {key: 'home', kind: 'page', level: 'site', label: 'Главная', icon: 'home', href: '/admin'},
    {key: 'data', kind: 'root', level: 'site', label: 'Данные', icon: 'database', children: [
      {key: 'cms', kind: 'page', level: 'site', label: 'Минимальная CMS', icon: 'table', href: '/admin/cms'},
    ]},
  ],
  notifications: {unread: 1},
  favourites: [{key: 'cms', label: 'Минимальная CMS', icon: 'table', href: '/admin/cms'}],
  person: {name: 'Administrator', theme: 'dark', links: [{label: 'Безопасность учётной записи', icon: 'shield', href: '/admin/security'}], language: 'ru', languages: [{code: 'ru', native: 'Русский', english: 'Russian'}]},
  profiles: {current: 'regular', list: [
    {key: 'regular', label: 'Обычный', kind: 'shared'},
    {key: 'editors', label: 'Редакторы', kind: 'shared', renamable: true, removable: true},
  ]},
  rights: {edit_shared: true, edit_personal: true, create_shared: true},
  site: {current: {key: 'main', label: 'Main site'}, count: 1},
};

const open = async (person = {}, frame = 800) => {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('pageerror', error.message));
  await page.goto('http://probe.test/');
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><body style="margin:0"><div style="block-size:${frame}px;display:flex"><sf-admin-menu id="m" aria-label="Меню"></sf-admin-menu><main style="flex:1">Страница</main></div></body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-admin-menu') && customElements.get('sf-resizer'), null, {timeout: 8000});
  await page.evaluate((navigation) => {
    window.raised = [];
    document.getElementById('m').setHostPort({
      port: 'simai.admin-navigation-port', version: '1.0.0', capabilities: ['preferences', 'menu-profiles', 'favourites'],
      async raise(intent, payload) {
        window.raised.push({intent, payload: structuredClone(payload)});
        if (intent === 'navigation.load') return structuredClone(navigation);
        return {answer: 'applied'};
      },
    });
  }, {...NAVIGATION, person: {...NAVIGATION.person, ...person}});
  await page.waitForTimeout(900);
  return page;
};

try {
  const page = await open();
  const before = await page.evaluate(() => {
    const first = document.querySelector('.sf-admin-nav-first');
    const second = document.querySelector('.sf-admin-nav-second');
    const handle = first?.querySelector(':scope > sf-resizer')?.getBoundingClientRect();
    return {
      first: first ? Math.round(first.getBoundingClientRect().width) : null,
      secondHandle: Boolean(second?.querySelector(':scope > sf-resizer')),
      handle: handle ? {x: handle.left + handle.width / 2, y: handle.top + 300} : null,
    };
  });
  if (!before.handle) note({case: 'the first column has a handle', got: before});
  if (!before.secondHandle) note({case: 'the second column has a handle', got: before});
  let widened = null;
  if (before.handle) {
    await page.mouse.move(before.handle.x, before.handle.y);
    await page.mouse.down();
    await page.mouse.move(before.handle.x + 48, before.handle.y, {steps: 6});
    await page.mouse.up();
    await page.waitForTimeout(100);
    widened = await page.evaluate(() => Math.round(document.querySelector('.sf-admin-nav-first').getBoundingClientRect().width));
    if (widened !== before.first + 48) note({case: 'a drag widens the first column', got: {before: before.first, widened}});
    // The width is the person's: the host is told, to keep it.
    const told = await page.evaluate(() => window.raised.filter((one) => one.intent === 'preference.widths').map((one) => one.payload));
    if (told.length !== 1 || told[0]?.widths?.first !== widened) note({case: 'the host keeps the width', got: told, expected: {widths: {first: widened}}});
  }

  // Favourites are a section of their own: a star at the foot of the first
  // column, its pages in the second (owner, 2026-10-15).
  const favourites = await page.evaluate(async () => {
    const star = [...document.querySelectorAll('.sf-admin-nav-bottom .sf-admin-nav-row')].find((row) => row.textContent.includes('Избранное'));
    const inScroll = Boolean(document.querySelector('.sf-admin-nav-first .sf-admin-nav-scroll .sf-admin-nav-favourites'));
    star?.click();
    await new Promise((done) => setTimeout(done, 300));
    const second = document.querySelector('.sf-admin-nav-second');
    return {star: Boolean(star), inScroll, second: second?.getAttribute('aria-label') ?? null,
      rows: [...(second?.querySelectorAll('.sf-admin-nav-row-label') ?? [])].map((node) => node.textContent.trim())};
  });
  if (!favourites.star || favourites.inScroll || favourites.second !== 'Избранное' || !favourites.rows.includes('Минимальная CMS')) {
    note({case: 'favourites are a section at the foot of the menu', got: favourites});
  }
  await page.evaluate(() => [...document.querySelectorAll('.sf-admin-nav-bottom .sf-admin-nav-row')].find((row) => row.textContent.includes('Избранное'))?.click());
  await page.waitForTimeout(200);

  // The count beside «Уведомления» is a small counter, no taller than the
  // letters' line.
  const counter = await page.evaluate(() => {
    const badge = document.querySelector('.sf-admin-nav-attention .sf-badge');
    const row = badge?.closest('.sf-admin-nav-row');
    return badge ? {height: Math.round(badge.getBoundingClientRect().height), row: Math.round(row?.getBoundingClientRect().height ?? 0)} : null;
  });
  if (!counter || counter.height > 16) note({case: 'the notification counter', got: counter, expected: 'at most 16px tall'});

  // The theme is a row with a submenu.
  const theme = await page.evaluate(async () => {
    const person = document.querySelector('.sf-admin-nav-person');
    person?.click();
    await new Promise((done) => setTimeout(done, 400));
    const menu = document.querySelector('sf-context-menu[data-sf-admin-nav-menu]');
    const rows = [...(menu?.querySelectorAll('.sf-context-menu-item') ?? [])];
    const row = rows.find((item) => item.querySelector('.sf-context-menu-item-label')?.textContent.trim() === 'Тема');
    const labels = [...(menu?.querySelectorAll('.sf-context-menu-item-label, .sf-context-menu-item-value') ?? [])];
    const surface = menu?.querySelector('.sf-context-menu-content')?.getBoundingClientRect();
    return {
      width: surface ? Math.round(surface.width) : null,
      button: Math.round(person?.getBoundingClientRect().width ?? 0),
      cut: labels.filter((label) => label.scrollWidth > label.clientWidth + 1).map((label) => label.textContent.trim()),
      choice: Boolean(menu?.querySelector('.sf-context-menu-choice')),
      row: Boolean(row), value: row?.querySelector('.sf-context-menu-item-value')?.textContent.trim() ?? null,
      submenu: row?.getAttribute('aria-haspopup') ?? null,
    };
  });
  // At least the button's width, and no line cut short.
  if (theme.width === null || theme.width < theme.button - 1 || theme.cut.length) {
    note({case: 'the profile menu is at least as wide as its button and cuts no line', got: theme});
  }
  if (theme.choice || !theme.row || theme.value !== 'Тёмная' || theme.submenu !== 'menu') {
    note({case: 'the theme is a row with a submenu', got: theme});
  }
  // The edit mode's profiles are the profile picker: the profiles as rows,
  // rename and remove where the person may, a new profile inline.
  const picker = await page.evaluate(async () => {
    await document.getElementById('m')._navigation?.startEdit();
    await new Promise((done) => setTimeout(done, 500));
    const element = document.querySelector('.sf-admin-nav-edit-banner sf-profile-picker');
    element?.querySelector('.sf-profile-picker-trigger')?.click();
    await new Promise((done) => setTimeout(done, 300));
    return element ? {
      trigger: element.querySelector('.sf-profile-picker-trigger')?.textContent.replace(/\s+/gu, ' ').trim(),
      rows: [...element.querySelectorAll('.sf-profile-picker-row[data-id]')].map((row) => `${row.dataset.id}:${row.getAttribute('aria-checked')}:${Boolean(row.querySelector('.sf-profile-picker-actions'))}`),
      add: Boolean(element.querySelector('.sf-profile-picker-add')),
      oldForm: Boolean(document.querySelector('.sf-admin-nav-edit-profile, .sf-admin-nav-edit-check')),
    } : null;
  });
  if (!picker || !picker.trigger?.includes('Профиль: Обычный') || picker.rows.join() !== 'regular:true:false,editors:false:true' || !picker.add || picker.oldForm) {
    note({case: "the edit mode's profiles are the profile picker", got: picker});
  }
  await page.close();

  const again = await open();
  const kept = await again.evaluate(() => Math.round(document.querySelector('.sf-admin-nav-first').getBoundingClientRect().width));
  if (widened !== null && kept !== widened) note({case: 'the width is kept on the next page', got: {widened, kept}});
  await again.dblclick('.sf-admin-nav-first > sf-resizer');
  await again.waitForTimeout(150);
  const reset = await again.evaluate(() => Math.round(document.querySelector('.sf-admin-nav-first').getBoundingClientRect().width));
  if (reset !== before.first) note({case: 'a double click gives the width back', got: {reset, expected: before.first}});
  // At the column's own width the button is narrower than the profile
  // menu's longest line: the menu grows to it rather than cutting it.
  const narrow = await again.evaluate(async () => {
    const person = document.querySelector('.sf-admin-nav-person');
    person?.click();
    await new Promise((done) => setTimeout(done, 400));
    const menu = document.querySelector('sf-context-menu[data-sf-admin-nav-menu]');
    const labels = [...(menu?.querySelectorAll('.sf-context-menu-item-label, .sf-context-menu-item-value') ?? [])];
    const surface = menu?.querySelector('.sf-context-menu-content')?.getBoundingClientRect();
    return {width: surface ? Math.round(surface.width) : null, button: Math.round(person?.getBoundingClientRect().width ?? 0),
      cut: labels.filter((label) => label.scrollWidth > label.clientWidth + 1).map((label) => label.textContent.trim())};
  });
  if (narrow.width === null || narrow.width < narrow.button - 1 || narrow.cut.length) {
    note({case: 'a narrow column: the profile menu grows to its longest line', got: narrow});
  }
  console.log(JSON.stringify({narrow}));
  // A frame as tall as a long page: the menu is the window's height and stays
  // at the top while the page scrolls (owner, 2026-10-14: it scrolled away,
  // an empty column under it).
  const tall = await open({}, 2400);
  const held = await tall.evaluate(async () => {
    window.scrollTo(0, 900);
    await new Promise((done) => setTimeout(done, 100));
    const box = document.querySelector('.sf-admin-nav').getBoundingClientRect();
    return {top: Math.round(box.top), height: Math.round(box.height), window: innerHeight};
  });
  if (held.top !== 0 || held.height !== held.window) note({case: 'the menu stays in the window', got: held});
  await tall.close();
  // A width the host keeps for the person wins over this browser's memory.
  const third = await open({widths: {first: 320}});
  const personal = await third.evaluate(() => Math.round(document.querySelector('.sf-admin-nav-first').getBoundingClientRect().width));
  if (personal !== 320) note({case: "the person's width wins", got: personal, expected: 320});
  await third.close();
  console.log(JSON.stringify({before, widened, theme, kept, reset, personal, counter, picker, held, favourites}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('ADMIN_NAVIGATION_RESIZE_OK');
