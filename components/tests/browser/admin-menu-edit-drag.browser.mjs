#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The admin menu's edit mode, driven with the mouse on the built bytes (owner,
// 2026-10-14: rows move between the top level and the open section's column):
// - a row of the open section's column dragged into the first column lands at
//   the top level, where it was dropped, and the host is sent that layout;
// - a row of the top level dragged into the section's column lands there;
// - a section stays at the top level: the menu is two deep.
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
  'smart/smart/sortable/css/sortable.css',
  'smart/smart/profile-picker/css/profile-picker.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/sortable/js/sortable.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/profile-picker/js/profile-picker.js', 'smart/smart/admin-menu/js/admin-menu.js',
].map((p) => join(out, p));

const NAVIGATION = {
  answer: 'applied', revision: '1', current: 'cms',
  items: [
    {key: 'home', kind: 'page', level: 'site', label: 'Главная', icon: 'home', href: '/admin'},
    {key: 'data', kind: 'root', level: 'site', label: 'Данные', icon: 'database', children: [
      {key: 'cms', kind: 'page', level: 'site', label: 'Минимальная CMS', icon: 'table', href: '/admin/cms'},
      {key: 'files', kind: 'page', level: 'site', label: 'Файлы', icon: 'folder', href: '/admin/files'},
      {key: 'news', kind: 'page', level: 'site', label: 'Новости', icon: 'article', href: '/admin/news'},
    ]},
    {key: 'users', kind: 'page', level: 'site', label: 'Пользователи', icon: 'group', href: '/admin/users'},
    {key: 'settings', kind: 'root', level: 'site', label: 'Настройки', icon: 'settings', children: [
      {key: 'sites', kind: 'page', level: 'site', label: 'Сайты', icon: 'language', href: '/admin/sites'},
    ]},
  ],
  person: {name: 'Administrator', language: 'ru', languages: [{code: 'ru', native: 'Русский', english: 'Russian'}]},
  profiles: {current: 'mine', list: [{key: 'mine', label: 'Мой', kind: 'personal'}]},
  rights: {edit_personal: true},
  site: {current: {key: 'main', label: 'Main site'}, count: 1},
};

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1400, height: 800}});
await context.route('http://probe.test/**', (route) => route.fulfill({status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>'}));
try {
  const page = await context.newPage();
  // core.js added as an inline module cannot work out its own address: that
  // one error is every such probe's and changes nothing here.
  page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) note({case: 'no page error', got: error.message}); });
  await page.goto('http://probe.test/');
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><body style="margin:0"><div style="block-size:800px;display:flex"><sf-admin-menu id="m" aria-label="Меню"></sf-admin-menu><main style="flex:1">Страница</main></div></body></html>');
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-admin-menu') && customElements.get('sf-sortable'), null, {timeout: 8000});
  await page.evaluate((navigation) => {
    window.saved = [];
    document.getElementById('m').setHostPort({
      port: 'simai.admin-navigation-port', version: '1.0.0', capabilities: ['menu-profiles'],
      async raise(intent, payload) {
        if (intent === 'navigation.load') return structuredClone(navigation);
        if (intent === 'view.save') { window.saved.push(structuredClone(payload.layout)); return {answer: 'applied', revision: String(window.saved.length + 1)}; }
        return {answer: 'applied'};
      },
    });
  }, NAVIGATION);
  await page.waitForTimeout(900);
  // Into the edit mode, the «Данные» column open.
  await page.evaluate(async () => {
    const nav = document.getElementById('m')._navigation;
    await nav.startEdit();
    nav.openRoot = 'data';
    nav.update('root');
  });
  await page.waitForTimeout(500);

  // Aimed as a person aims: at the target where it stands while the row is in
  // the hand. The outline opens room in the list it enters and the rows after
  // it move, so the target is read again once the drag is under way.
  const rectOf = (key) => page.evaluate((key) => {
    const box = document.querySelector(`.sf-admin-nav-edit-row[data-sf-sortable-item="${key}"]`)?.getBoundingClientRect();
    return box ? {left: box.left, top: box.top, bottom: box.bottom, height: box.height} : null;
  }, key);
  const drag = async (fromKey, toKey, where) => {
    const handle = await page.evaluate((key) => {
      const box = document.querySelector(`.sf-admin-nav-edit-row[data-sf-sortable-item="${key}"] [data-sf-sortable-handle]`)?.getBoundingClientRect();
      return box ? {x: box.left + box.width / 2, y: box.top + box.height / 2} : null;
    }, fromKey);
    if (!handle) return null;
    const aim = (box) => ({x: box.left + 24, y: where === 'before' ? box.top + box.height * 0.25 : box.bottom - box.height * 0.25});
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 4, handle.y + 4, {steps: 3});
    let box = await rectOf(toKey);
    if (!box) return null;
    let point = aim(box);
    await page.mouse.move(point.x, point.y, {steps: 14});
    for (let pass = 0; pass < 3; pass += 1) {
      box = await rectOf(toKey);
      point = aim(box);
      await page.mouse.move(point.x, point.y, {steps: 4});
    }
    await page.mouse.up();
    await page.waitForTimeout(500);
    return point;
  };
  const layoutAt = () => page.evaluate(() => window.saved.at(-1) ?? null);
  const columns = () => page.evaluate(() => ({
    first: [...document.querySelectorAll('.sf-admin-nav-first .sf-admin-nav-edit-row[data-sf-sortable-item]')].map((row) => row.dataset.sfSortableItem),
    second: [...document.querySelectorAll('.sf-admin-nav-second .sf-admin-nav-edit-row[data-sf-sortable-item]')].map((row) => row.dataset.sfSortableItem),
  }));
  const before = await columns();

  // 1. «Файлы» from the section's column to the top level, before «Пользователи».
  const moved = await drag('files', 'users', 'before');
  const afterOut = await columns();
  const outLayout = await layoutAt();
  if (!moved) note({case: 'the rows to drag are drawn', got: before});
  if (!afterOut.first.includes('files') || afterOut.second.includes('files') || afterOut.first.indexOf('files') !== afterOut.first.indexOf('users') - 1) {
    note({case: 'a section row dragged to the first column lands at the top level where it was dropped', got: {before, after: afterOut}});
  }
  if (outLayout?.items?.files?.parent !== null) note({case: 'the host is sent the row at the top level', got: outLayout?.items?.files});

  // 2. «Пользователи» from the top level into the section's column, after «Новости».
  await drag('users', 'news', 'after');
  const afterIn = await columns();
  const inLayout = await layoutAt();
  if (!afterIn.second.includes('users') || afterIn.first.includes('users')) note({case: 'a top-level row dragged into the column lands there', got: afterIn});
  if (inLayout?.items?.users?.parent !== 'data') note({case: 'the host is sent the row under the section', got: inLayout?.items?.users});

  // 3. A section stays at the top level.
  await drag('settings', 'cms', 'after');
  const afterSection = await columns();
  if (!afterSection.first.includes('settings') || afterSection.second.includes('settings')) note({case: 'a section stays at the top level', got: afterSection});
  console.log(JSON.stringify({before, afterOut, afterIn, afterSection, saves: (await page.evaluate(() => window.saved.length))}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify({failures}, null, 1)); process.exit(1); }
console.log('ADMIN_MENU_EDIT_DRAG_OK');
