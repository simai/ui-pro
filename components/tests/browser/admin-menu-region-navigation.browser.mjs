#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The admin's pages without full reloads, piloted on the menu (interface
// fragments, owner 2026-10-15; Larena's region contract, larena/admin
// 4e4d10ff), on the built bytes with a stub of the admin's answers:
// - on Larena's shell (larena-shell-revision in the head, the region in
//   main#larena-admin-content) the menu turns region navigation on;
// - a row of the menu changes the region, not the page: the address, the
//   heading, focus on it; the menu stays the same element;
// - the menu's current row follows the address, on Back too;
// - a link inside the region goes the same way;
// - an open second column follows the page to another root, and a closed
//   one stays closed (Larena, 2026-10-16).
import {resolve, join} from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
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
  'smart/smart/icons/js/icons.js', 'smart/smart/buttons/js/buttons.js',
  'smart/smart/icon-buttons/js/icon-buttons.js', 'smart/smart/badges/js/badges.js',
  'smart/smart/inputs/js/inputs.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/profile-picker/js/profile-picker.js', 'smart/smart/admin-menu/js/admin-menu.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1400, height: 800}});
const SHELL = 'shell-r1';
const pages = {
  '/admin/cms': {title: 'Минимальная CMS', html: '<nav class="larena-page-path">Данные / Минимальная CMS</nav><h1>Минимальная CMS</h1><p><a id="to-files" href="/admin/files">К файлам</a></p>'},
  '/admin/files': {title: 'Файлы', html: '<nav class="larena-page-path">Данные / Файлы</nav><h1>Файлы</h1>'},
  '/admin/notifications': {title: 'Уведомления', html: '<h1>Уведомления</h1>'},
  '/admin/settings/sites': {title: 'Сайты', html: '<nav class="larena-page-path">Настройки / Сайты</nav><h1>Сайты</h1>'},
};
const regionRequests = [];
await context.route('http://probe.test/**', (route) => {
  const url = new URL(route.request().url());
  // The free runtime under /distr/, laid out as the ui distribution lays it,
  // so core.js finds its own parts (it cannot from an inlined script).
  if (url.pathname.startsWith('/distr/')) {
    const [product, ...rest] = url.pathname.slice('/distr/'.length).split('/');
    const file = join(out, product, product, ...rest);
    return existsSync(file)
      ? route.fulfill({status: 200, contentType: file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', body: readFileSync(file)})
      : route.fulfill({status: 404, body: ''});
  }
  const entry = pages[url.pathname];
  if (!entry) return route.fulfill({status: 404, body: ''});
  if (route.request().headers()['x-larena-region'] === 'content') {
    regionRequests.push(url.pathname);
    return route.fulfill({status: 200, contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({region: 'content', html: entry.html, title: entry.title, assets: [], shell_revision: SHELL, url: url.pathname})});
  }
  return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"><title>${entry.title}</title><meta name="larena-shell-revision" content="${SHELL}">
    <script>window.sfPath = '/distr/'; window.SF_BOOT_CONFIG = {cacheVersion: 'region-menu', pluginListVersion: 'region-menu', preloader: {enabled: false}, icons: {enabled: false}, theme: false};</script></head>
    <body style="margin:0"><div style="block-size:800px;display:flex"><sf-admin-menu id="m" aria-label="Меню"></sf-admin-menu>
    <main id="larena-admin-content" style="flex:1"><!--larena-region:content-->${entry.html}<!--/larena-region:content--></main></div><script src="/distr/core/js/core.js"></script></body></html>`});
});

const NAVIGATION = {
  answer: 'applied', revision: '1', current: 'cms',
  items: [
    {key: 'home', kind: 'page', level: 'site', label: 'Главная', icon: 'home', href: '/admin'},
    {key: 'data', kind: 'root', level: 'site', label: 'Данные', icon: 'database', children: [
      {key: 'cms', kind: 'page', level: 'site', label: 'Минимальная CMS', icon: 'table', href: '/admin/cms'},
      {key: 'files', kind: 'page', level: 'site', label: 'Файлы', icon: 'folder', href: '/admin/files'},
    ]},
    {key: 'settings', kind: 'root', level: 'site', label: 'Настройки', icon: 'settings', children: [
      {key: 'sites', kind: 'page', level: 'site', label: 'Сайты', icon: 'language', href: '/admin/settings/sites'},
    ]},
  ],
  notifications: {unread: 2, href: '/admin/notifications'},
  person: {name: 'Administrator', language: 'ru', languages: [{code: 'ru', native: 'Русский', english: 'Russian'}]},
  site: {current: {key: 'main', label: 'Main site'}, count: 1},
};

try {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('pageerror', error.message));
  await page.goto('http://probe.test/admin/cms');
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  await page.waitForFunction(() => window.SF?.RegionNavigation, null, {timeout: 8000});
  for (const path of modules.filter((one) => !one.endsWith('core/core/js/core.js'))) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-admin-menu'), null, {timeout: 8000});
  await page.evaluate((navigation) => {
    window.__marker = 'same document';
    window.__menu = document.getElementById('m');
    window.__menu.setHostPort({
      port: 'simai.admin-navigation-port', version: '1.0.0', capabilities: [],
      async raise(intent, payload) {
        if (intent === 'navigation.load') return structuredClone(navigation);
        if (intent === 'item.open') return {answer: 'applied', href: payload.href};
        return {answer: 'applied'};
      },
    });
  }, NAVIGATION);
  await page.waitForTimeout(900);
  const look = () => page.evaluate(() => {
    const current = document.querySelector('#m .sf-admin-nav-row[aria-current="page"]');
    return {
      enabled: window.SF.RegionNavigation.enabled, path: location.pathname, marker: window.__marker ?? null,
      sameMenu: document.getElementById('m') === window.__menu,
      heading: document.querySelector('#larena-admin-content h1')?.textContent ?? null,
      crumbs: document.querySelector('#larena-admin-content .larena-page-path')?.textContent ?? null,
      focused: document.activeElement?.tagName === 'H1' ? document.activeElement.textContent : null,
      current: current?.querySelector('.sf-admin-nav-row-label')?.textContent.trim() ?? null,
    };
  });
  const first = await look();
  if (!first.enabled || first.current !== 'Минимальная CMS') note({case: 'Larena\'s shell turns region navigation on', got: first});

  await page.evaluate(() => [...document.querySelectorAll('#m .sf-admin-nav-row')].find((row) => row.querySelector('.sf-admin-nav-row-label')?.textContent.trim() === 'Файлы')?.click());
  await page.waitForTimeout(600);
  const files = await look();
  if (files.path !== '/admin/files' || files.marker !== 'same document' || !files.sameMenu || files.heading !== 'Файлы' || files.crumbs !== 'Данные / Файлы') note({case: 'a menu row changes the region, not the page', got: files});
  if (files.focused !== 'Файлы') note({case: 'focus goes to the heading', got: files});
  if (files.current !== 'Файлы') note({case: 'the current row follows the address', got: files});

  await page.goBack();
  await page.waitForTimeout(600);
  const back = await look();
  if (back.path !== '/admin/cms' || back.heading !== 'Минимальная CMS' || back.current !== 'Минимальная CMS' || back.marker !== 'same document') note({case: 'Back: the region and the current row go back', got: back});

  await page.click('#to-files');
  await page.waitForTimeout(600);
  const linked = await look();
  if (linked.path !== '/admin/files' || linked.marker !== 'same document' || linked.current !== 'Файлы') note({case: 'a link in the region goes the same way', got: linked});
  // «Уведомления» at the foot is a row like the others: by region, marked.
  await page.evaluate(() => [...document.querySelectorAll('#m .sf-admin-nav-bottom a.sf-admin-nav-row')].find((row) => row.textContent.includes('Уведомления'))?.click());
  await page.waitForTimeout(600);
  const notices = await page.evaluate(() => ({path: location.pathname, marker: window.__marker ?? null,
    heading: document.querySelector('#larena-admin-content h1')?.textContent ?? null,
    marked: document.querySelector('#m .sf-admin-nav-bottom a.sf-admin-nav-row[aria-current="page"]')?.textContent.includes('Уведомления') ?? false}));
  if (notices.path !== '/admin/notifications' || notices.marker !== 'same document' || notices.heading !== 'Уведомления' || !notices.marked) note({case: '«Уведомления» goes by region and is marked', got: notices});
  if (regionRequests.length !== 4) note({case: 'one region request per move', got: regionRequests});
  // The second column: open on «Данные», then a page of «Настройки».
  const column = async (open) => {
    await page.evaluate((key) => { const nav = window.__menu._navigation; nav.openRoot = key; nav.update('root'); }, open);
    await page.evaluate(() => window.SF.RegionNavigation.navigate('/admin/settings/sites'));
    await page.waitForTimeout(600);
    const shown = await page.evaluate(() => window.__menu._navigation.openRoot);
    await page.evaluate(() => window.SF.RegionNavigation.navigate('/admin/cms'));
    await page.waitForTimeout(600);
    return shown;
  };
  const followed = await column('data');
  const stayedClosed = await column(null);
  if (followed !== 'settings' || stayedClosed !== null) note({case: 'an open column follows the page to its root; a closed one stays closed', got: {followed, stayedClosed}});
  console.log(JSON.stringify({first, files, back, linked, regionRequests, followed, stayedClosed}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('ADMIN_MENU_REGION_NAVIGATION_OK');
