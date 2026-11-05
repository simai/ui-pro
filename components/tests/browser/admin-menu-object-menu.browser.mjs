#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output [--shots <directory>]
//
// sf-admin-menu 1.7.0: never more than two menus on screen, and the second is
// about where the person is (owner, 2026-11-05, after the Larena Panel UX
// audit; Larena's request msg-955aa941487545d68f4a). On the built bytes, on a
// Larena-like shell (region navigation on) whose server prints the menu's
// first answer in its data-sf-settings island and answers navigation.load by
// the page it is told:
//   - first paint: the menu is drawn from the printed answer, with no skeleton
//     and no port; the port, connected later, is asked navigation.load with
//     the page's address (`page`);
//   - a site card: exactly two menus, the second the site's own -- title,
//     status, subtitle, «← Все сайты» -- with aria-current="page" on its
//     current row, the rows ordinary links;
//   - the sites list and the notifications: the second column closed;
//   - «Сервер › Службы» after «Настройки» (a swap and a full load): the
//     column shows «Сервер», not the root of the page before;
//   - a root clicked in the first column is shown until a page is opened,
//     then the column follows the page;
//   - a column the person closed stays closed across pages; «Показать
//     колонку» opens it on the page's object menu or root;
//   - a swap's answer replaces or removes the object menu;
//   - the keyboard reaches «← Все сайты» and the rows, and Enter opens one;
//   - on a phone the object menu is the screen the menu opens on, «← Все
//     сайты» at its top.
// With --shots it also writes the evidence screenshots (1440 and 390, light
// and dark).
import {resolve, join} from 'node:path';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const args = process.argv.slice(2);
const shotsAt = args.indexOf('--shots');
const shots = shotsAt === -1 ? null : resolve(args[shotsAt + 1]);
const roots = args.filter((value, index) => !value.startsWith('--') && (shotsAt === -1 || index !== shotsAt + 1));
if (!roots[0]) throw new Error('Build output root is required');
const out = resolve(roots[0]);
if (shots) mkdirSync(shots, {recursive: true});
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/admin-menu/css/admin-menu.css',
  'component/component/badges/css/badges.css',
  'component/component/inputs/css/inputs.css',
  'component/component/context-menu/css/context-menu.css',
  'component/component/skeleton/css/skeleton.css',
  'smart/smart/admin-menu/css/admin-menu.css',
  'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/button-icon/js/button-icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/menu-context/js/menu-context.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/admin-menu/js/admin-menu.js',
].map((p) => join(out, p));

const SHELL = 'shell-r1';
const SITE = {
  title: 'demo-owned.test', subtitle: 'PHP 8.3', status: {text: 'Работает', status: 'success'},
  back: {label: 'Все сайты', href: '/panel/sites'},
  groups: [
    {label: null, items: [
      {key: 'site.overview', label: 'Обзор', href: '/panel/sites/demo', icon: 'dashboard'},
      {key: 'site.domains', label: 'Домены и HTTPS', href: '/panel/sites/demo/domains', icon: 'language'},
      {key: 'site.files', label: 'Файлы', href: '/panel/sites/demo/files', icon: 'folder'},
      {key: 'site.databases', label: 'Базы данных', href: '/panel/sites/demo/databases', icon: 'database'},
      {key: 'site.backups', label: 'Резервные копии', href: '/panel/sites/demo/backups', icon: 'backup', badge: {text: '1', status: 'error'}},
      {key: 'site.cron', label: 'Планировщик', href: '/panel/sites/demo/cron', icon: 'schedule'},
    ]},
    {label: 'Дополнительно', items: [
      {key: 'site.php', label: 'PHP и веб-сервер', href: '/panel/sites/demo/php', icon: 'code'},
    ]},
  ],
};
// The page, its row in the tree and its object menu, as the host knows them.
const PAGES = {
  '/panel/sites': {title: 'Сайты', current: 'sites'},
  '/panel/sites/demo': {title: 'demo-owned.test', current: 'sites', context: 'site.overview'},
  '/panel/sites/demo/files': {title: 'Файлы — demo-owned.test', current: 'sites', context: 'site.files'},
  '/panel/notifications': {title: 'Уведомления', current: null},
  '/panel/server': {title: 'Обзор сервера', current: 'server.overview'},
  '/panel/server/services': {title: 'Службы', current: 'server.services'},
  '/panel/settings/dns': {title: 'Подключение DNS', current: 'settings.dns'},
  '/panel/settings/access': {title: 'Доступ к панели', current: 'settings.access'},
};
const ITEMS = [
  {key: 'sites', kind: 'page', level: 'site', label: 'Сайты', icon: 'web', href: '/panel/sites'},
  {key: 'server', kind: 'root', level: 'site', label: 'Сервер', icon: 'dns', children: [
    {key: 'server.overview', kind: 'page', level: 'site', label: 'Обзор', icon: 'monitoring', href: '/panel/server'},
    {key: 'server.services', kind: 'page', level: 'site', label: 'Службы', icon: 'settings_applications', href: '/panel/server/services'},
  ]},
  {key: 'settings', kind: 'root', level: 'site', label: 'Настройки', icon: 'settings', children: [
    {key: 'settings.dns', kind: 'page', level: 'site', label: 'Подключение DNS', icon: 'language', href: '/panel/settings/dns'},
    {key: 'settings.access', kind: 'page', level: 'site', label: 'Доступ к панели', icon: 'lock', href: '/panel/settings/access'},
  ]},
];
const answerFor = (address) => {
  const path = new URL(address ?? '/', 'http://probe.test').pathname;
  const entry = PAGES[path] ?? {current: null};
  const answer = {
    revision: '1', echo: {site: 'main', profile: 'regular', sequence: null},
    site: {current: {key: 'main', label: 'Larena Panel', caption: 'panel.test'}, count: 1},
    current: entry.current, items: ITEMS, favourites: [],
    profiles: {current: 'regular', list: [{key: 'regular', label: 'Общий', kind: 'shared'}]},
    rights: {edit_personal: false, edit_shared: false, create_shared: false},
    person: {name: 'Rim', language: 'ru', languages: [{code: 'ru', native: 'Русский', english: 'Russian'}]},
    notifications: {unread: 2, href: '/panel/notifications'},
  };
  if (entry.context) answer.context = {...SITE, current: entry.context};
  return answer;
};
const body = (path) => `<h1>${PAGES[path]?.title ?? path}</h1>
  <p><a id="to-services" href="/panel/server/services">Службы</a> · <a id="to-notifications" href="/panel/notifications">Уведомления</a> · <a id="to-site" href="/panel/sites/demo">demo-owned.test</a></p>`;

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1440, height: 900}});
await context.addInitScript(() => {
  // Whether the menu ever drew its skeleton: with a printed answer it must not.
  window.__skeleton = false;
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && (node.matches?.('.sf-admin-nav--skeleton') || node.querySelector?.('.sf-admin-nav--skeleton'))) window.__skeleton = true;
      }
    }
  }).observe(document, {childList: true, subtree: true});
});
await context.route('http://probe.test/**', (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/distr/')) {
    const [product, ...rest] = url.pathname.slice('/distr/'.length).split('/');
    const file = join(out, product, product, ...rest);
    return existsSync(file)
      ? route.fulfill({status: 200, contentType: file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', body: readFileSync(file)})
      : route.fulfill({status: 404, body: ''});
  }
  const entry = PAGES[url.pathname];
  if (!entry) return route.fulfill({status: 404, body: ''});
  if (route.request().headers()['x-larena-region'] === 'content') {
    return route.fulfill({status: 200, contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({region: 'content', html: body(url.pathname), title: entry.title, assets: [], shell_revision: SHELL, url: url.pathname})});
  }
  const printed = JSON.stringify({'first-answer': {...answerFor(url.pathname), capabilities: ['notifications']}}).replace(/</gu, '\\u003c');
  return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"><title>${entry.title}</title><meta name="larena-shell-revision" content="${SHELL}">
    <script>window.sfPath = '/distr/'; window.SF_BOOT_CONFIG = {cacheVersion: 'object-menu', pluginListVersion: 'object-menu', preloader: {enabled: false}, icons: {enabled: false}, theme: false};</script></head>
    <style>@media (max-width: 47.99rem) { #larena-admin-content { display: none } #m { flex: 1 } }</style>
    <body style="margin:0"><div style="block-size:100dvh;display:flex"><sf-admin-menu id="m" source="port" aria-label="Меню"><script type="application/json" data-sf-settings>${printed}</script></sf-admin-menu>
    <main id="larena-admin-content" style="flex:1;padding:24px"><!--larena-region:content-->${body(url.pathname)}<!--/larena-region:content--></main></div><script src="/distr/core/js/core.js"></script></body></html>`});
});

// Opens a page as a full load: the menu is drawn from the printed answer
// first, then the host connects its port (asked with the page's address).
const open = async (page, path, {port = true} = {}) => {
  await page.goto(`http://probe.test${path}`);
  for (const file of styles) await page.addStyleTag({path: file}).catch(() => {});
  await page.waitForFunction(() => window.SF?.RegionNavigation, null, {timeout: 8000});
  for (const file of modules) await page.addScriptTag({path: file, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-admin-menu') && document.querySelector('#m .sf-admin-nav'), null, {timeout: 8000});
  await page.waitForTimeout(300);
  const before = await look(page);
  if (port) {
    await page.evaluate((pages) => {
      window.__asked = [];
      document.getElementById('m').setHostPort({
        port: 'simai.admin-navigation-port', version: '1.0.0', capabilities: ['notifications'],
        async raise(intent, payload) {
          if (intent === 'navigation.load') {
            window.__asked.push(payload.page ?? null);
            return {answer: 'applied', ...structuredClone(window.__answerFor(payload.page))};
          }
          if (intent === 'item.open') return {answer: 'applied', href: payload.href};
          return {answer: 'applied'};
        },
      });
    }, PAGES);
    await page.waitForTimeout(400);
  }
  return before;
};

const look = (page) => page.evaluate(() => {
  const menu = document.getElementById('m');
  const second = menu.querySelector('.sf-admin-nav-second');
  const label = (node) => node?.querySelector('.sf-admin-nav-row-label')?.textContent.trim() ?? node?.textContent.trim() ?? null;
  return {
    path: location.pathname,
    columns: menu.querySelectorAll('.sf-admin-nav-first, .sf-admin-nav-second').length,
    first: Boolean(menu.querySelector('.sf-admin-nav-first')),
    skeleton: Boolean(menu.querySelector('.sf-admin-nav--skeleton')) || window.__skeleton,
    port: Boolean(menu.hostPort),
    object: second?.dataset.object === 'true',
    title: second?.querySelector('.sf-admin-nav-second-label')?.textContent.trim() ?? null,
    caption: second?.querySelector('.sf-admin-nav-second-caption')?.textContent.trim() ?? null,
    status: second?.querySelector('.sf-admin-nav-object-status')?.getAttribute('text') ?? null,
    back: second?.querySelector('.sf-admin-nav-back a') ? {text: label(second.querySelector('.sf-admin-nav-back a')), href: second.querySelector('.sf-admin-nav-back a').getAttribute('href')} : null,
    backFirst: second ? second.firstElementChild?.classList.contains('sf-admin-nav-back') : null,
    rows: second ? [...second.querySelectorAll('.sf-admin-nav-scroll a.sf-admin-nav-row')].map((row) => ({label: label(row), href: row.getAttribute('href'), role: row.getAttribute('role')})) : [],
    headings: second ? [...second.querySelectorAll('.sf-admin-nav-heading')].map((node) => node.textContent.trim()) : [],
    current: second ? [...second.querySelectorAll('[aria-current="page"]')].map(label) : [],
    showColumn: Boolean(menu.querySelector('.sf-admin-nav-show-column')),
    shown: menu._navigation?.shownColumn?.() ?? null,
  };
});

const navigate = async (page, path) => {
  await page.evaluate((to) => window.SF.RegionNavigation.navigate(to), path);
  await page.waitForTimeout(700);
};

const shot = async (page, name) => {
  if (!shots) return;
  for (const theme of ['light', 'dark']) {
    await page.evaluate((mode) => {
      document.documentElement.classList.remove('theme-light', 'theme-dark');
      document.documentElement.classList.add(`theme-${mode}`);
    }, theme);
    await page.waitForTimeout(200);
    await page.screenshot({path: join(shots, `${name}-${page.viewportSize().width}-${theme}.png`)});
  }
  await page.evaluate(() => {
    document.documentElement.classList.remove('theme-dark');
    document.documentElement.classList.add('theme-light');
  });
};

const report = {};
try {
  const page = await context.newPage();
  page.on('pageerror', (error) => note({case: 'no page error', got: error.message}));
  await page.addInitScript(`window.__answerFor = ${answerFor.toString().replace('PAGES', JSON.stringify(PAGES)).replace('ITEMS', JSON.stringify(ITEMS)).replace('SITE', JSON.stringify(SITE))};`);

  // 1. The site card, first paint: drawn from the printed answer, no port.
  const printed = await open(page, '/panel/sites/demo');
  report.printed = printed;
  if (printed.port || printed.skeleton || printed.columns !== 2 || !printed.object) note({case: 'first paint: the printed answer is drawn at once, no skeleton, no port', got: printed});
  const card = await look(page);
  report.card = card;
  const asked = await page.evaluate(() => window.__asked.slice());
  if (asked[0] !== '/panel/sites/demo') note({case: 'the port is asked navigation.load with the page\'s address', got: asked});
  if (card.columns !== 2 || !card.object) note({case: 'site card: exactly two menus, the second the site\'s', got: card});
  if (card.title !== 'demo-owned.test' || card.status !== 'Работает' || card.caption !== 'PHP 8.3') note({case: 'site card: title, status, subtitle', got: card});
  if (card.back?.text !== 'Все сайты' || card.back?.href !== '/panel/sites' || !card.backFirst) note({case: 'site card: «← Все сайты» at the top', got: card.back});
  if (card.current.join() !== 'Обзор') note({case: 'aria-current="page" on the current row', got: card.current});
  if (card.rows.length !== 7 || card.rows.some((row) => !row.href || row.role) || card.headings.join() !== 'Дополнительно') note({case: 'the object menu\'s rows are ordinary links in their groups', got: card.rows});
  await shot(page, 'site-card');

  // 2. The keyboard reaches «← Все сайты» and the rows; Enter opens one.
  await page.evaluate(() => document.activeElement?.blur());
  const reached = [];
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    reached.push(await page.evaluate(() => document.activeElement?.querySelector?.('.sf-admin-nav-row-label')?.textContent.trim() ?? document.activeElement?.getAttribute?.('aria-label') ?? document.activeElement?.tagName));
    if (reached.at(-1) === 'Файлы' && reached.includes('Все сайты')) break;
  }
  if (!reached.includes('Все сайты') || reached.at(-1) !== 'Файлы') note({case: 'Tab reaches «← Все сайты» and the rows', got: reached});
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const files = await look(page);
  report.files = files;
  if (files.path !== '/panel/sites/demo/files' || files.current.join() !== 'Файлы' || !files.object) note({case: 'Enter on a row opens its page; the row is current', got: files});

  // 3. A swap to the notifications: the answer takes the object menu away and
  //    the column is closed -- never another root's rows.
  await navigate(page, '/panel/notifications');
  const notices = await look(page);
  report.notices = notices;
  if (notices.columns !== 1 || notices.shown !== null) note({case: 'notifications: the second column closed', got: notices});

  // 4. The sites list: its row is a page with no rows and gives no object menu.
  await open(page, '/panel/sites');
  const list = await look(page);
  report.list = list;
  if (list.columns !== 1 || list.shown !== null || list.showColumn) note({case: 'sites list: the second column closed, nothing to open', got: list});
  await shot(page, 'sites-list');

  // 5. «Сервер › Службы» after «Настройки»: by a swap, and by a full load.
  await open(page, '/panel/settings/dns');
  const settings = await look(page);
  await navigate(page, '/panel/server/services');
  const swapped = await look(page);
  await open(page, '/panel/settings/dns');
  await open(page, '/panel/server/services');
  const loaded = await look(page);
  report.services = {settings, swapped, loaded};
  if (settings.title !== 'Настройки' || swapped.title !== 'Сервер' || loaded.title !== 'Сервер' || swapped.columns !== 2 || loaded.columns !== 2) note({case: '«Сервер › Службы» after «Настройки»: the column shows «Сервер»', got: report.services});

  // 6. A root clicked in the first column is shown until a page is opened.
  await page.evaluate(() => [...document.querySelectorAll('#m .sf-admin-nav-first a.sf-admin-nav-row')].find((row) => row.textContent.includes('Настройки'))?.click());
  await page.waitForTimeout(300);
  const preview = await look(page);
  await shot(page, 'preview');
  await page.evaluate(() => [...document.querySelectorAll('#m .sf-admin-nav-second a.sf-admin-nav-row')].find((row) => row.textContent.includes('Доступ к панели'))?.click());
  await page.waitForTimeout(800);
  const opened = await look(page);
  await navigate(page, '/panel/server/services');
  const followed = await look(page);
  report.preview = {preview, opened, followed};
  if (preview.title !== 'Настройки' || preview.path !== '/panel/server/services') note({case: 'a clicked root is shown in the second column', got: preview});
  if (opened.path !== '/panel/settings/access' || opened.title !== 'Настройки' || opened.current.join() !== 'Доступ к панели') note({case: 'a page opened from it: the column is the page\'s', got: opened});
  if (followed.title !== 'Сервер') note({case: 'then the column follows the page again', got: followed});

  // 7. Closed by the person: closed on every page; «Показать колонку» opens it
  //    on what the page has.
  await page.evaluate(() => document.querySelector('#m .sf-admin-nav-second-head sf-button-icon[icon="left_panel_close"]')?.click());
  await page.waitForTimeout(300);
  const hidden = await look(page);
  await open(page, '/panel/sites/demo');
  const stillHidden = await look(page);
  await page.evaluate(() => document.querySelector('#m .sf-admin-nav-show-column')?.click());
  await page.waitForTimeout(300);
  const reopened = await look(page);
  await navigate(page, '/panel/server/services');
  const stillOpen = await look(page);
  report.collapse = {hidden, stillHidden, reopened, stillOpen};
  if (hidden.columns !== 1 || !hidden.showColumn) note({case: 'hide: the column closes and «Показать колонку» is offered', got: hidden});
  if (stillHidden.columns !== 1 || stillHidden.skeleton) note({case: 'a closed column stays closed on the next page', got: stillHidden});
  if (!reopened.object || reopened.title !== 'demo-owned.test') note({case: '«Показать колонку» opens the page\'s object menu', got: reopened});
  if (stillOpen.title !== 'Сервер') note({case: 'open again on the next page, on its root', got: stillOpen});

  // 8. A phone: the object menu is the screen the menu opens on.
  const phone = await context.newPage();
  await phone.setViewportSize({width: 390, height: 844});
  await phone.addInitScript(`window.__answerFor = ${answerFor.toString().replace('PAGES', JSON.stringify(PAGES)).replace('ITEMS', JSON.stringify(ITEMS)).replace('SITE', JSON.stringify(SITE))};`);
  phone.on('pageerror', (error) => note({case: 'no page error on a phone', got: error.message}));
  await open(phone, '/panel/sites/demo');
  const drawer = await look(phone);
  report.drawer = drawer;
  if (drawer.first || !drawer.object || !drawer.backFirst || drawer.back?.text !== 'Все сайты') note({case: 'phone: the object menu is the first screen, «← Все сайты» at its top', got: drawer});
  await shot(phone, 'drawer');
  await phone.evaluate(() => document.querySelector('#m .sf-admin-nav-second-head sf-button-icon[icon="menu"]')?.click());
  await phone.waitForTimeout(300);
  const sections = await look(phone);
  if (!sections.first || sections.object) note({case: 'phone: «Все разделы» goes to the first screen', got: sections});
  await shot(phone, 'drawer-sections');
  // A root tapped on the first screen is its screen: the phone's preview.
  await phone.evaluate(() => [...document.querySelectorAll('#m .sf-admin-nav-first a.sf-admin-nav-row')].find((row) => row.textContent.includes('Настройки'))?.click());
  await phone.waitForTimeout(300);
  const phonePreview = await look(phone);
  if (phonePreview.first || phonePreview.title !== 'Настройки') note({case: 'phone: a tapped root is its own screen', got: phonePreview});
  await shot(phone, 'preview');
  // The sites list on a phone: no object, no root -- the first screen.
  await open(phone, '/panel/sites');
  const phoneList = await look(phone);
  if (!phoneList.first || phoneList.columns !== 1) note({case: 'phone: the sites list opens on the first screen', got: phoneList});
  await shot(phone, 'sites-list');
} finally {
  await browser.close();
}
console.log(JSON.stringify(report));
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('ADMIN_MENU_OBJECT_MENU_OK');
