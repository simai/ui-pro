#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// sf-admin-menu's navigation skeleton takes the columns the answered menu will
// take (stand 25 D4): on a dashboard, whose row has no open root, the menu is
// one column (256 px), and a two-column skeleton (496 px) pushed the page aside
// and back (CLS 0.71). Measured on the built bytes, before any port, at 1280 px:
//   - expected-columns="1": one column, as wide as the answered first column;
//   - not written: two columns, as before;
//   - at 390 px both are one column the whole width.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/admin-menu/css/admin-menu.css',
  'component/component/skeleton/css/skeleton.css',
  'smart/smart/admin-menu/css/admin-menu.css',
  'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/admin-menu/js/admin-menu.js',
].map((p) => join(out, p));

const failures = [];
const browser = await chromium.launch();
const measure = async (width) => {
  const page = await browser.newPage({viewport: {width, height: 800}});
  await page.setContent(`<!doctype html><html class="theme-light"><body style="margin:0;display:flex;gap:0">
    <div id="one" style="display:flex;height:600px"><sf-admin-menu source="port" expected-columns="1" aria-label="Меню"></sf-admin-menu></div>
    <div id="two" style="display:flex;height:600px"><sf-admin-menu source="port" aria-label="Меню"></sf-admin-menu></div>
  </body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(700);
  const result = await page.evaluate(() => {
    if (!customElements.get('sf-admin-menu')) return {error: 'sf-admin-menu is not defined'};
    const read = (id) => {
      const menu = document.querySelector(`#${id} sf-admin-menu`);
      const root = menu.shadowRoot ?? menu;
      const nav = root.querySelector('.sf-admin-nav--skeleton');
      const first = nav?.querySelector('.sf-admin-nav-first');
      const second = nav?.querySelector('.sf-admin-nav-second');
      return {
        skeleton: Boolean(nav),
        width: Math.round(nav?.getBoundingClientRect().width ?? 0),
        first: Math.round(first?.getBoundingClientRect().width ?? 0),
        second: second ? Math.round(second.getBoundingClientRect().width) : null,
      };
    };
    return {one: read('one'), two: read('two')};
  });
  await page.close();
  return result;
};

try {
  const wide = await measure(1280);
  if (wide.error) throw new Error(wide.error);
  if (!wide.one.skeleton || !wide.two.skeleton) failures.push(`no navigation skeleton before a port: ${JSON.stringify(wide)}`);
  if (wide.one.second !== null) failures.push(`expected-columns="1" printed a second column: ${JSON.stringify(wide.one)}`);
  if (wide.one.width !== wide.one.first || wide.one.width < 200 || wide.one.width > 320) failures.push(`expected-columns="1" is not one first column wide: ${JSON.stringify(wide.one)}`);
  if (!(wide.two.second > 0) || wide.two.width !== wide.two.first + wide.two.second) failures.push(`the default skeleton is not two columns: ${JSON.stringify(wide.two)}`);
  if (wide.two.first !== wide.one.first) failures.push(`the first column differs: ${wide.one.first} and ${wide.two.first}`);
  const phone = await measure(390);
  if (phone.error) throw new Error(phone.error);
  for (const [name, one] of Object.entries(phone)) {
    if (one.second && one.second > 0) failures.push(`${name} at 390 px shows a second column: ${JSON.stringify(one)}`);
  }
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('admin-menu skeleton columns: one column where the page says one, two otherwise, one on a phone');
