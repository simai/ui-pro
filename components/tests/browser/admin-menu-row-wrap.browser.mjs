#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output [--shots <directory>]
//
// sf-admin-menu 1.7.0: a long row name takes a second line instead of an
// ellipsis (Larena Panel audit, 2026-11-05: «Программы и обновления» read
// «Программы и обно…»). On the built bytes, at 1440 and at 390, for a row of
// the first column, a row of a root in the second column and a row of an
// object menu with a badge:
//   - no row name is cut: its words are all on screen (no overflow);
//   - a long name is two lines, and its row is one text line taller than a
//     one-line row -- which keeps its height (icon-size-2 + 2 * a6);
//   - the glyph, the chevron and the badge stand on the middle of the first
//     line, within a pixel.
// With --shots it also writes the screenshots (light and dark).
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

const LONG = 'Программы и обновления сервера и всех его сайтов';
const LARENA = 'Программы и обновления';
const ITEMS = [
  {key: 'sites', kind: 'page', level: 'site', label: 'Сайты', icon: 'web', href: '/panel/sites'},
  {key: 'software', kind: 'root', level: 'site', label: LONG, icon: 'deployed_code', attention: {tone: 'warning', label: '2'}, children: [
    {key: 'software.updates', kind: 'page', level: 'site', label: LARENA, icon: 'update', href: '/panel/software'},
    {key: 'software.long', kind: 'page', level: 'site', label: LONG, icon: 'deployed_code', href: '/panel/software/all', attention: {tone: 'error', label: '1'}},
    {key: 'software.php', kind: 'page', level: 'site', label: 'PHP', icon: 'code', href: '/panel/software/php'},
  ]},
];
const CONTEXT = {
  title: 'demo-owned.test', subtitle: 'PHP 8.3', status: {text: 'Работает', status: 'success'},
  back: {label: 'Все сайты', href: '/panel/sites'},
  groups: [{label: null, items: [
    {key: 'site.overview', label: 'Обзор', href: '/panel/sites/demo', icon: 'dashboard'},
    {key: 'site.software', label: LARENA, href: '/panel/sites/demo/software', icon: 'update'},
    {key: 'site.long', label: LONG, href: '/panel/sites/demo/all', icon: 'backup', badge: {text: '1', status: 'error'}},
  ]}],
  current: 'site.overview',
};
const answer = (withContext, current) => ({
  answer: 'applied', revision: '1', echo: {site: 'main', profile: 'regular', sequence: null},
  site: {current: {key: 'main', label: 'Larena Panel', caption: 'panel.test'}, count: 1},
  current, items: ITEMS, favourites: [],
  profiles: {current: 'regular', list: [{key: 'regular', label: 'Общий', kind: 'shared', renamable: false, removable: false}]},
  rights: {edit_personal: false, edit_shared: false, create_shared: false},
  person: {name: 'Rim', theme: 'light', language: 'ru', compact: false, languages: [{code: 'ru', native: 'Русский', english: 'Russian'}]},
  ...(withContext ? {context: CONTEXT} : {}),
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
  return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"><title>wrap</title>
    <script>window.sfPath = '/distr/'; window.SF_BOOT_CONFIG = {cacheVersion: 'row-wrap', pluginListVersion: 'row-wrap', preloader: {enabled: false}, icons: {enabled: false}, theme: false};</script></head>
    <style>@media (max-width: 47.99rem) { main { display: none } #m { flex: 1 } }</style>
    <body style="margin:0"><div style="block-size:100dvh;display:flex"><sf-admin-menu id="m" source="port" aria-label="Меню"></sf-admin-menu>
    <main style="flex:1;padding:24px"><h1>${url.pathname}</h1></main></div><script src="/distr/core/js/core.js"></script></body></html>`});
});

const open = async (page, path, withContext, current) => {
  await page.goto(`http://probe.test${path}`);
  for (const file of styles) await page.addStyleTag({path: file}).catch(() => {});
  await page.waitForFunction(() => window.SF, null, {timeout: 8000});
  for (const file of modules) await page.addScriptTag({path: file, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-admin-menu'), null, {timeout: 8000});
  await page.evaluate((given) => {
    document.getElementById('m').setHostPort({
      port: 'simai.admin-navigation-port', version: '1.1.0', capabilities: [],
      async raise(intent) {
        if (intent === 'navigation.load') return structuredClone(given);
        return {answer: 'applied'};
      },
    });
  }, answer(withContext, current));
  await page.waitForFunction(() => document.querySelector('#m .sf-admin-nav-row-label'), null, {timeout: 8000});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
};

// Every visible row whose name is one of the probe's: its box, its name's
// lines, and where its glyph, chevron and badge stand against the first line.
const measure = (page) => page.evaluate((names) => {
  const box = (node) => node?.getBoundingClientRect();
  const visible = (node) => { const r = box(node); return r && r.width > 0 && r.height > 0; };
  const rows = [];
  for (const label of document.querySelectorAll('#m .sf-admin-nav-row-label')) {
    const row = label.closest('.sf-admin-nav-row');
    if (!row || !visible(label) || label.closest('.sf-admin-nav-edit-row')) continue;
    const text = label.textContent.trim();
    const style = getComputedStyle(label);
    const line = parseFloat(style.lineHeight);
    const l = box(label);
    const firstLine = l.top + line / 2;
    const centre = (node) => { const r = box(node); return r && r.height ? r.top + r.height / 2 : null; };
    const glyph = [...row.querySelectorAll('.sf-admin-nav-row-icon, sf-icon')].find((node) => visible(node) && !node.closest('.sf-admin-nav-row-label'));
    const chevron = row.querySelector('.sf-admin-nav-row-chevron');
    const item = row.closest('.sf-admin-nav-item') ?? row;
    const badge = [...item.querySelectorAll('.sf-admin-nav-attention .sf-badge, .sf-admin-nav-attention.sf-badge')].find(visible);
    rows.push({
      text,
      column: row.closest('.sf-admin-nav-second') ? 'second' : 'first',
      watched: names.includes(text) || text === 'Обзор' || text === 'PHP' || text === 'Сайты',
      lines: Math.round(l.height / line),
      line,
      cut: label.scrollWidth > label.clientWidth + 1 || style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap',
      height: Math.round(box(row).height * 10) / 10,
      glyph: glyph ? Math.round((centre(glyph) - firstLine) * 10) / 10 : null,
      chevron: chevron && visible(chevron) ? Math.round((centre(chevron) - firstLine) * 10) / 10 : null,
      badge: badge ? Math.round((centre(badge) - firstLine) * 10) / 10 : null,
    });
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;block-size:calc(var(--sf-icon-size-2) + 2 * var(--sf-a6))';
  document.getElementById('m').append(probe);
  const single = probe.getBoundingClientRect().height;
  probe.remove();
  return {rows: rows.filter((row) => row.watched), single};
}, [LONG, LARENA]);

const judge = (where, {rows, single}) => {
  if (!rows.length) note({case: `${where}: rows drawn`, got: rows});
  for (const row of rows) {
    if (row.cut) note({case: `${where}: «${row.text}» is not cut`, got: row});
    const tall = single + (row.lines - 1) * row.line;
    if (Math.abs(row.height - tall) > 1) note({case: `${where}: «${row.text}» is ${row.lines} line(s) tall, ${tall}px`, got: row});
    for (const part of ['glyph', 'chevron', 'badge']) {
      if (row[part] !== null && Math.abs(row[part]) > 1) note({case: `${where}: «${row.text}» ${part} on the middle of the first line`, got: row});
    }
  }
  const long = rows.filter((row) => row.text === LONG);
  if (!long.length || long.some((row) => row.lines !== 2)) note({case: `${where}: the long name takes two lines`, got: long});
  const short = rows.filter((row) => ['Обзор', 'PHP', 'Сайты'].includes(row.text));
  if (short.some((row) => row.lines !== 1 || Math.abs(row.height - single) > 0.5)) note({case: `${where}: a one-line row keeps its height`, got: short});
};

const shot = async (page, name) => {
  if (!shots) return;
  for (const theme of ['light', 'dark']) {
    await page.evaluate((mode) => {
      document.documentElement.classList.remove('theme-light', 'theme-dark');
      document.documentElement.classList.add(`theme-${mode}`);
    }, theme);
    await page.waitForTimeout(200);
    await page.screenshot({path: join(shots, `row-wrap-${name}-${page.viewportSize().width}-${theme}.png`)});
  }
};

const report = {};
try {
  const desk = await browser.newContext({viewport: {width: 1440, height: 900}});
  await serve(desk);
  const page = await desk.newPage();
  page.on('pageerror', (error) => note({case: 'no page error', got: error.message}));
  // The root's rows in the second column: the page is one of them.
  await open(page, '/panel/software', false, 'software.updates');
  report.root1440 = await measure(page);
  judge('1440 root', report.root1440);
  await shot(page, 'root');
  // The object menu of a site, with a badge.
  await open(page, '/panel/sites/demo', true, 'sites');
  report.object1440 = await measure(page);
  judge('1440 object menu', report.object1440);
  await shot(page, 'object');

  const phoneContext = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await serve(phoneContext);
  const phone = await phoneContext.newPage();
  phone.on('pageerror', (error) => note({case: 'no page error on a phone', got: error.message}));
  await open(phone, '/panel/sites/demo', true, 'sites');
  report.object390 = await measure(phone);
  judge('390 object menu', report.object390);
  await shot(phone, 'object');
  await phone.evaluate(() => document.querySelector('#m .sf-admin-nav-second-head sf-button-icon[icon="menu"]')?.click());
  await phone.waitForTimeout(300);
  report.first390 = await measure(phone);
  judge('390 first screen', report.first390);
  await shot(phone, 'first');
} finally {
  await browser.close();
}
console.log(JSON.stringify(report));
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('ADMIN_MENU_ROW_WRAP_OK');
