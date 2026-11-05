#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output [--shots <directory>]
//
// sf-admin-menu 1.7.1 (Larena Panel UX audit IA-07): the second column's
// caption «Общее для всех сайтов» (locale key all-sites) says a section is
// shared by every site, so it shows only where the menu switches sites. On the
// built bytes, at 1440, with the page in a section of the install level:
//   - a host whose capabilities include site-switch: the caption is there and
//     reads «Общее для всех сайтов»;
//   - a host without site-switch: no caption element at all, and the section's
//     name still heads the column;
//   - a section of the site level keeps the current site's name as its
//     caption in both cases (unchanged).
// With --shots it also writes the screenshots.
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

const SHARED = 'Общее для всех сайтов';
const ITEMS = [
  {key: 'site', kind: 'root', level: 'site', label: 'Сайт', icon: 'web', children: [
    {key: 'site.pages', kind: 'page', level: 'site', label: 'Страницы', icon: 'article', href: '/panel/pages'},
  ]},
  {key: 'server', kind: 'root', level: 'install', label: 'Сервер', icon: 'dns', children: [
    {key: 'server.updates', kind: 'page', level: 'install', label: 'Обновления', icon: 'update', href: '/panel/updates'},
    {key: 'server.php', kind: 'page', level: 'install', label: 'PHP', icon: 'code', href: '/panel/php'},
  ]},
];
const answer = (current) => ({
  answer: 'applied', revision: '1', echo: {site: 'main', profile: 'regular', sequence: null},
  site: {current: {key: 'main', label: 'Larena Panel', caption: 'panel.test'}, count: 1},
  current, items: ITEMS, favourites: [],
  profiles: {current: 'regular', list: [{key: 'regular', label: 'Общий', kind: 'shared', renamable: false, removable: false}]},
  rights: {edit_personal: false, edit_shared: false, create_shared: false},
  person: {name: 'Rim', theme: 'light', language: 'ru', compact: false, languages: [{code: 'ru', native: 'Русский', english: 'Russian'}]},
});

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

const serve = async (context) => context.route('http://probe.test/**', (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/distr/')) {
    const [product, ...rest] = url.pathname.slice('/distr/'.length).split('/');
    const file = join(out, product, product, ...rest);
    return existsSync(file)
      ? route.fulfill({status: 200, contentType: file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', body: readFileSync(file)})
      : route.fulfill({status: 404, body: ''});
  }
  return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"><title>caption</title>
    <script>window.sfPath = '/distr/'; window.SF_BOOT_CONFIG = {cacheVersion: 'all-sites', pluginListVersion: 'all-sites', preloader: {enabled: false}, icons: {enabled: false}, theme: false};</script></head>
    <body style="margin:0"><div style="block-size:100dvh;display:flex"><sf-admin-menu id="m" source="port" aria-label="Меню"></sf-admin-menu>
    <main style="flex:1;padding:24px"><h1>${url.pathname}</h1></main></div><script src="/distr/core/js/core.js"></script></body></html>`});
});

const open = async (page, path, capabilities, current) => {
  await page.goto(`http://probe.test${path}`);
  for (const file of styles) await page.addStyleTag({path: file}).catch(() => {});
  await page.waitForFunction(() => window.SF, null, {timeout: 8000});
  for (const file of modules) await page.addScriptTag({path: file, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-admin-menu'), null, {timeout: 8000});
  await page.evaluate(({given, capabilities}) => {
    document.getElementById('m').setHostPort({
      port: 'simai.admin-navigation-port', version: '1.1.0', capabilities,
      async raise(intent) {
        if (intent === 'navigation.load') return structuredClone(given);
        if (intent === 'sites.search') return {answer: 'applied', items: [], next: null};
        return {answer: 'applied'};
      },
    });
  }, {given: answer(current), capabilities});
  await page.waitForFunction(() => document.querySelector('#m .sf-admin-nav-second-label'), null, {timeout: 8000});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
};

const head = (page) => page.evaluate(() => {
  const second = document.querySelector('#m .sf-admin-nav-second');
  const caption = second?.querySelector('.sf-admin-nav-second-head .sf-admin-nav-second-caption');
  return {
    label: second?.querySelector('.sf-admin-nav-second-label')?.textContent.trim() ?? null,
    caption: caption ? caption.textContent.trim() : null,
    install: caption?.getAttribute('data-install') ?? null,
    shared: document.querySelector('#m').innerText.includes('Общее для всех сайтов'),
  };
});

const report = {};
try {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await serve(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => note({case: 'no page error', got: error.message}));

  for (const [name, capabilities] of [['switch', ['site-switch']], ['single', []]]) {
    await open(page, '/panel/updates', capabilities, 'server.updates');
    const install = await head(page);
    report[`${name}-install`] = install;
    if (install.label !== 'Сервер') note({case: `${name}: the install section heads the column`, got: install});
    if (name === 'switch') {
      if (install.caption !== SHARED || install.install !== 'true') note({case: 'with site-switch: «Общее для всех сайтов» under the section', got: install});
    } else if (install.caption !== null || install.shared) {
      note({case: 'without site-switch: no «Общее для всех сайтов» anywhere', got: install});
    }
    if (shots) await page.screenshot({path: join(shots, `all-sites-${name}-install-1440.png`)});

    await open(page, '/panel/pages', capabilities, 'site.pages');
    const site = await head(page);
    report[`${name}-site`] = site;
    if (site.label !== 'Сайт' || site.caption !== 'Larena Panel' || site.install !== null) note({case: `${name}: a site section keeps the site's name as its caption`, got: site});
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(report));
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('ADMIN_MENU_ALL_SITES_CAPTION_OK');
