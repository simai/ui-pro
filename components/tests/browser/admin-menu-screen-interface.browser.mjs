#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// The interface an admin screen binds on sf-admin-menu (stand 24 A1, the
// screen manifest's role `menu`), on the built bytes with a navigation port:
//   - setting current: the row the page names is current, whatever the
//     address; changed, the mark follows;
//   - value favourite: whether that row is among the person's favourites, as
//     the host answered, read again after a change (sf-props-change);
//   - action toggle {id, on}: favourite.toggle goes to the host and the value
//     follows; the items menu refuses;
//   - setting open: a page that writes it folds the menu away on a phone while
//     false (data-open), a page that never writes it sees no change.
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
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'component/component/badges/js/badges.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/admin-menu/js/admin-menu.js',
].map((p) => join(out, p));

const NAVIGATION = {
  answer: 'applied', revision: '1', current: 'home',
  items: [
    {key: 'home', kind: 'page', level: 'site', label: 'Главная', icon: 'home', href: '/admin'},
    {key: 'news', kind: 'page', level: 'site', label: 'Новости', icon: 'news', href: '/admin/news'},
    {key: 'data', kind: 'root', level: 'site', label: 'Данные', icon: 'database', children: [
      {key: 'cms', kind: 'page', level: 'site', label: 'Каталог решений', icon: 'table', href: '/admin/cms'},
    ]},
  ],
  favourites: [{key: 'home', label: 'Главная', href: '/admin'}],
  person: {name: 'Administrator', language: 'ru', languages: [{code: 'ru', native: 'Русский', english: 'Russian'}]},
  rights: {},
  site: {current: {key: 'main', label: 'Main site'}, count: 1},
};

const failures = [];
const evidence = {};
const check = (name, pass, detail = {}) => { if (!pass) failures.push({name, ...detail}); };
const browser = await chromium.launch();

async function open({width, body}) {
  const page = await browser.newPage({viewport: {width, height: 900}});
  page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) failures.push({name: 'page error', said: error.message}); });
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"><base href="http://admin.test/"></head><body style="margin:0"><div style="display:flex;block-size:100vh">${body}</div></body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  await page.addStyleTag({content: '.sf-icon{display:inline-block;inline-size:1.25rem;block-size:1.25rem;overflow:hidden}'});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-admin-menu'), null, {timeout: 8000});
  return page;
}

const connect = (page) => page.evaluate((navigation) => {
  window.asked = [];
  window.favourites = structuredClone(navigation.favourites);
  document.getElementById('m').setHostPort({
    port: 'simai.admin-navigation-port', version: '1.0.0', capabilities: ['favourites'],
    async raise(intent, payload) {
      window.asked.push({intent, payload});
      if (intent === 'navigation.load') return {...structuredClone(navigation), favourites: structuredClone(window.favourites)};
      if (intent === 'favourite.toggle') {
        window.favourites = payload.on
          ? [...window.favourites.filter((one) => one.key !== payload.key), {key: payload.key, label: payload.key}]
          : window.favourites.filter((one) => one.key !== payload.key);
        return {answer: 'applied', favourites: structuredClone(window.favourites)};
      }
      return {answer: 'applied'};
    },
  });
}, NAVIGATION);

const currentRows = (page) => page.evaluate(() => [...document.querySelectorAll('#m [aria-current="page"]')]
  .map((one) => one.getAttribute('title') || one.textContent.trim()));

try {
  // current, favourite and toggle on a desktop.
  {
    const page = await open({width: 1200, body: '<sf-admin-menu id="m" aria-label="Меню" current="news"></sf-admin-menu><main style="flex:1">Страница</main>'});
    await connect(page);
    await page.waitForTimeout(900);
    const named = await currentRows(page);
    evidence.current = named;
    check('the row the page names is current', named.some((one) => one.includes('Новости')) && !named.some((one) => one.includes('Главная')), {named});
    check('favourite: «Новости» is not a favourite', await page.evaluate(() => document.getElementById('m').favourite) === false);

    const applied = await page.evaluate(() => {
      const menu = document.getElementById('m');
      window.reads = [];
      menu.addEventListener('sf-props-change', () => window.reads.push(menu.favourite));
      return menu.toggle({id: 'news', on: true});
    });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({favourite: document.getElementById('m').favourite, reads: window.reads,
      asked: window.asked.filter((one) => one.intent === 'favourite.toggle').map((one) => one.payload)}));
    evidence.toggle = {applied, ...after};
    check('toggle {id, on} is applied', applied?.outcome === 'applied', {applied});
    check('favourite.toggle goes to the host with the key and on', JSON.stringify(after.asked) === JSON.stringify([{key: 'news', on: true}]), after);
    check('the value follows, and a binding hears it', after.favourite === true && after.reads.includes(true), after);

    await page.evaluate(() => document.getElementById('m').setAttribute('current', 'cms'));
    await page.waitForTimeout(300);
    const moved = await page.evaluate(() => document.getElementById('m').favourite);
    check('current changed: the value reads the new row', moved === false, {moved});
    const off = await page.evaluate(() => document.getElementById('m').toggle('news', false));
    check('toggle(id, on) in declared order', off?.outcome === 'applied', {off});
    await page.close();
  }

  // open on a phone: written by the page, folded away while false.
  {
    const page = await open({width: 390, body: '<sf-admin-menu id="m" aria-label="Меню"></sf-admin-menu><main style="flex:1">Страница</main>'});
    await connect(page);
    await page.waitForTimeout(700);
    const untouched = await page.evaluate(() => {
      const menu = document.getElementById('m');
      return {open: menu.getAttribute('data-open'), display: getComputedStyle(menu).display};
    });
    check('a page that never writes open sees the menu as before', untouched.open === null && untouched.display !== 'none', untouched);
    const folded = await page.evaluate(() => {
      const menu = document.getElementById('m');
      menu.open = false;
      return {open: menu.getAttribute('data-open'), display: getComputedStyle(menu).display};
    });
    check('open false folds the menu away on a phone', folded.open === 'false' && folded.display === 'none', folded);
    const opened = await page.evaluate(() => {
      const menu = document.getElementById('m');
      menu.open = true;
      return {open: menu.getAttribute('data-open'), display: getComputedStyle(menu).display, value: menu.open};
    });
    check('open true shows it', opened.open === 'true' && opened.display !== 'none' && opened.value === true, opened);
    evidence.open = {untouched, folded, opened};
    await page.setViewportSize({width: 1200, height: 900});
    const wide = await page.evaluate(() => {
      const menu = document.getElementById('m');
      menu.open = false;
      return getComputedStyle(menu).display;
    });
    check('a desktop shows the menu whatever open says', wide !== 'none', {wide});
    await page.close();
  }

  // The items menu has no port and no favourites: toggle refuses.
  {
    const page = await open({width: 1200, body: '<sf-admin-menu id="m" aria-label="Меню"><sf-admin-menu-item item-id="a" label="A" href="/a"></sf-admin-menu-item></sf-admin-menu>'});
    await page.waitForTimeout(500);
    const refused = await page.evaluate(() => document.getElementById('m').toggle({id: 'a', on: true}));
    check('the items menu refuses toggle', refused?.outcome === 'refused', {refused});
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(evidence));
if (failures.length) { console.error(JSON.stringify({failures}, null, 1)); process.exit(1); }
console.log('ADMIN_MENU_SCREEN_INTERFACE_OK');
