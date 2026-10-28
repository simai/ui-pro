#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// sf-admin-menu's box is the same in every section (Larena, 2026-10-28): the
// second column was as wide as its labels (237-258 px between sections), so the
// menu's box changed from page to page and the page beside it moved by what
// it had reserved. Measured on the built bytes over a navigation port, at
// 1280 px: two sections whose rows have short and long labels give the same
// menu box, equal to the published two-column width; a section without an
// open root gives the published one-column width; a long label ends in «…»;
// a width the person set with the handle is kept.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/admin-menu/css/admin-menu.css',
  'component/component/skeleton/css/skeleton.css',
  'component/component/inputs/css/inputs.css',
  'smart/smart/admin-menu/css/admin-menu.css',
  'smart/smart/input/css/input.css', 'smart/smart/icon-button/css/icon-button.css',
  'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/admin-menu/js/admin-menu.js',
].map((p) => join(out, p));

const LONG = 'Очень длинное название раздела с подробностями';
const items = [
  {key: 'home', kind: 'page', level: 'site', label: 'Главная', icon: 'home', href: '/admin'},
  {key: 'short', kind: 'root', level: 'site', label: 'Кратко', icon: 'database', children: [
    {key: 'a', kind: 'page', level: 'site', label: 'Лента', icon: 'table', href: '/admin/a'}]},
  {key: 'long', kind: 'root', level: 'site', label: `Подробно: ${LONG}`, icon: 'folder',
    action: {label: `Создать запись в разделе «${LONG}»`, icon: 'add', href: '/admin/b/new'}, children: [
    {key: 'b', kind: 'page', level: 'site', label: LONG, icon: 'table', href: '/admin/b'},
    {key: 'c', kind: 'page', level: 'site', label: `${LONG} и ещё длиннее, чем колонка`, icon: 'table', href: '/admin/c'},
    // Enough pages for «Найти в разделе»: its field's own width took the
    // column past the token's (Larena: 237-258 px between sections).
    ...Array.from({length: 12}, (_, at) => ({key: `p${at}`, kind: 'page', level: 'site', label: `Страница ${at + 1}`, icon: 'article', href: `/admin/p${at}`}))]},
];

const failures = [];
const browser = await chromium.launch();
const measure = async (current, {kept = null} = {}) => {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
    <div id="shell" style="display:flex;block-size:600px"><sf-admin-menu id="menu" source="port" current="${current}" aria-label="Меню"></sf-admin-menu><main style="flex:1">Страница</main></div>
  </body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-admin-menu')));
  const result = await page.evaluate(async ({items, current, kept}) => {
    const menu = document.getElementById('menu');
    const port = {port: 'simai.admin-navigation-port', version: '1.0.0', capabilities: [],
      raise: async (intent, payload) => (intent === 'navigation.load'
        ? {answer: 'applied', revision: '1', current, items, sequence: payload?.sequence, ...(kept ? {person: {widths: {second: kept}}} : {})}
        : {answer: 'unavailable'})};
    (menu.connectPort ?? menu.setHostPort).call(menu, typeof menu.connectPort === 'function' ? {port} : port);
    await new Promise((done) => setTimeout(done, 600));
    const box = (selector) => {
      const node = menu.querySelector(selector) ?? menu.shadowRoot?.querySelector(selector);
      return node ? Math.round(node.getBoundingClientRect().width * 10) / 10 : null;
    };
    const px = (name) => {
      const probe = document.createElement('div');
      probe.style.inlineSize = `var(${name})`;
      document.body.append(probe);
      const value = probe.getBoundingClientRect().width;
      probe.remove();
      return Math.round(value * 10) / 10;
    };
    const label = [...menu.querySelectorAll('.sf-admin-nav-second .sf-admin-nav-row span, .sf-admin-nav-second a span')]
      .find((node) => node.textContent.includes('Очень длинное'));
    return {
      nav: box('.sf-admin-nav'), first: box('.sf-admin-nav-first'), second: box('.sf-admin-nav-second'),
      main: Math.round(document.querySelector('main').getBoundingClientRect().left * 10) / 10,
      ellipsis: label ? (label.scrollWidth > label.clientWidth && getComputedStyle(label).textOverflow === 'ellipsis') : null,
      published: {one: px('--sf-admin-menu-one-column-inline-size'), two: px('--sf-admin-menu-two-columns-inline-size'),
        compactOne: px('--sf-admin-menu-compact-one-column-inline-size'), compactTwo: px('--sf-admin-menu-compact-two-columns-inline-size')},
    };
  }, {items, current, kept});
  await page.close();
  return result;
};

try {
  const short = await measure('a');
  const long = await measure('b');
  const home = await measure('home');
  if (short.nav !== long.nav || short.main !== long.main) failures.push(`the menu box differs between sections: ${JSON.stringify({short, long})}`);
  if (!(short.published.two > 0) || Math.abs(short.nav - short.published.two) > 0.5) failures.push(`the two-column box is not the published width: ${JSON.stringify(short)}`);
  if (!(home.published.one > 0) || Math.abs(home.nav - home.published.one) > 0.5) failures.push(`the one-column box is not the published width: ${JSON.stringify(home)}`);
  if (!(short.published.compactOne > 0 && short.published.compactTwo > short.published.compactOne)) failures.push(`the compact widths are not published: ${JSON.stringify(short.published)}`);
  if (long.ellipsis !== true) failures.push(`a long label does not end in «…»: ${JSON.stringify(long)}`);
  // The width the person set, as the host keeps it for them.
  const resized = await measure('b', {kept: 300});
  if (Math.abs(resized.second - 300) > 0.5) failures.push(`the width the person set is not kept: ${JSON.stringify(resized)}`);
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('admin-menu: the same box in every section, the published widths, «…» for a long label, the person\'s width kept');
