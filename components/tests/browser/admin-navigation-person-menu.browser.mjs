#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The admin menu's person menu, measured on the built bytes with a host port
// that answers the menu (Pro products batch, 2026-11-17):
// - the «Язык» row is SIMAI Framework's (SfLanguage.menuEntry's rows, C142 (7),
//   C176, SM-4): each language in itself with its lang, the page's name for it
//   beside it where that differs, the current one checked, the note under the
//   rows, no search below eight languages;
// - «Выйти» is a plain row (C163 (6), SM-5, PP-10): not the danger look.
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
  // The icons sheet: on a page with no Loader it is what draws an icon as one
  // glyph (ui-source ea3a53ca, core.css holds icons at 0 only where the Loader
  // runs). Without it a menu row's icon and chevron drew their names as text
  // (view_sidebar 88px, chevron_right 91px) and cut «Профиль меню» in a 320px
  // menu that a real page draws whole.
  'component/component/icons/css/icons.css',
  'smart/smart/admin-menu/css/admin-menu.css',
  'smart/smart/resizer/css/resizer.css',
  'smart/smart/profile-picker/css/profile-picker.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/button-icon/js/button-icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/menu-context/js/menu-context.js',
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
  person: {name: 'Administrator', theme: 'dark', links: [{label: 'Безопасность учётной записи', icon: 'shield', href: '/admin/security'}], language: 'ru', languages: [{code: 'ru', native: 'Русский', english: 'Russian'}, {code: 'en', native: 'English', english: 'English'}, {code: 'de', native: 'Deutsch', english: 'German'}]},
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
      port: 'simai.admin-navigation-port', version: '1.0.0', capabilities: ['preferences', 'menu-profiles', 'favourites', 'sign-out'],
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
  const menu = await page.evaluate(async () => {
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    document.querySelector('.sf-admin-nav-person')?.click();
    await wait(400);
    const root = document.querySelector('sf-menu-context[data-sf-admin-nav-menu]');
    const items = () => [...(root?.querySelectorAll('.sf-context-menu-item') ?? [])].filter((item) => item.getBoundingClientRect().width > 0);
    const label = (item) => item.querySelector('.sf-context-menu-item-label')?.textContent.trim() ?? '';
    const signOut = items().find((item) => label(item) === 'Выйти');
    const plain = items().find((item) => label(item) === 'Безопасность учётной записи');
    const language = items().find((item) => label(item) === 'Язык');
    const result = {
      signOut: signOut ? {color: getComputedStyle(signOut).color, danger: /danger|error/u.test(signOut.className)} : null,
      plain: plain ? getComputedStyle(plain).color : null,
      languageValue: language?.querySelector('.sf-context-menu-item-under, .sf-context-menu-item-value')?.textContent.trim() ?? null,
    };
    language?.click();
    await wait(400);
    result.rows = items().filter((item) => item.getAttribute('role') === 'menuitemradio').map((item) => ({
      text: label(item), value: item.querySelector('.sf-context-menu-item-under, .sf-context-menu-item-value')?.textContent.trim() ?? '',
      lang: item.getAttribute('lang') || item.querySelector('[lang]')?.getAttribute('lang') || '', checked: item.getAttribute('aria-checked'),
    }));
    result.note = Boolean(root?.querySelector('.sf-context-menu-note'));
    result.search = Boolean(root?.querySelector('input'));
    return result;
  });
  if (!menu.signOut || menu.signOut.danger || menu.signOut.color !== menu.plain) note({case: '«Выйти» is a plain row', got: menu});
  if (menu.languageValue !== 'русский' && menu.languageValue !== 'Русский') note({case: 'the language row says the current language', got: menu.languageValue});
  const rows = menu.rows ?? [];
  const en = rows.find((row) => row.lang === 'en');
  if (rows.map((row) => row.lang).join() !== 'ru,en,de' || rows.find((row) => row.lang === 'ru')?.checked !== 'true') note({case: 'the languages, in themselves, the current checked', got: rows});
  if (!en || en.text !== 'English' || !/английский/iu.test(en.value)) note({case: "the page's name beside a language (SfLanguage.menuEntry's rows)", got: en});
  if (menu.search) note({case: 'no search below eight languages', got: menu.search});
  if (!menu.note) note({case: 'the note stays under the rows', got: menu.note});
  await page.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
} else {
  console.log('ADMIN_NAVIGATION_PERSON_MENU_OK');
}
