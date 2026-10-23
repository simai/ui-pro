#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/smart /absolute/path/to/distr
// sf-admin-menu speaks English by default and Russian on a Russian page. Split
// from ui-source tests/browser/page-language.browser.mjs when the package
// components left ui-source; the Smart root is the free output with the package
// output laid into it.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[3]) throw new Error('Smart output root and distr root are required');
const smartRoot = resolve(process.argv[2]);
const distrRoot = resolve(process.argv[3]);
const expected = {
  '': {menu: 'Menu settings'},
  ru: {menu: 'Настройки меню'},
};
const browser = await chromium.launch();
const failures = [];
try {
  for (const [lang, words] of Object.entries(expected)) {
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.evaluate((lang) => { if (lang) document.documentElement.lang = lang; }, lang);
    await page.addScriptTag({path: join(distrRoot, 'core', 'js', 'smart-base.js')});
    await page.addScriptTag({path: join(smartRoot, 'admin-menu', 'js', 'admin-menu.js')});
    const seen = await page.evaluate(async () => {
      document.body.innerHTML = '<sf-admin-menu></sf-admin-menu>';
      await new Promise((settle) => setTimeout(settle, 300));
      return {menu: document.querySelector('sf-admin-menu').getProp('settingsTitle')};
    });
    await page.close();
    const where = lang ? `lang="${lang}"` : 'no lang';
    if (seen.menu !== words.menu) failures.push(`${where}: sf-admin-menu settingsTitle ${seen.menu}, expected ${words.menu}`);
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({failures}, null, 1));
process.exitCode = failures.length ? 1 : 0;
