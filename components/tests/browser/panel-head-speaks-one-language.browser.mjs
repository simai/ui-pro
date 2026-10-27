#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// The record panel's head speaks the page's language, all of it.
//
// Every label the panel shows is resolved by a getter that reads the nearest
// [lang] and falls back to the document's. A label left out of the template's
// context never reaches that getter and falls through to its declared default
// instead, which is English. Three were left out, so on a Russian page the head
// read «В избранное», «Ещё» and «Ссылка скопирована» beside «Close», «Copy
// link» and «Open as a page» — one header in two languages, in the only part of
// the panel a person looks at first (owner, 2026-10-10, on the admin polygon).
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/buttons/css/buttons.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'smart/smart/copy-button/css/copy-button.css',
  'smart/smart/property-view/css/property-view.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js', 'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/close/js/close.js', 'smart/smart/drawer/js/drawer.js',
  'smart/smart/modal/js/modal.js', 'smart/smart/popover/js/popover.js',
  'smart/smart/tree/js/tree.js', 'smart/smart/tree-item/js/tree-item.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/copy-button/js/copy-button.js',
  'smart/smart/property-view/js/property-view.js',
].map((p) => join(out, p));

const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) {
  console.error(JSON.stringify({missingAssets: absent, root: out}, null, 2));
  throw new Error(`${absent.length} build asset(s) not found under ${out}`);
}

const failures = [];
const browser = await chromium.launch();

const RECORD = {
  record_id: 'r-1',
  collection: 'admin.solutions',
  revision: 1,
  label: 'Запись',
  // The address is what draws the copy-link control, and the capability is what
  // draws the open-as-a-page one.
  address: '/?record=r-1',
  sections: [{
    key: 'main', label: 'Общее',
    groups: [{key: 'main', label: 'Основное', columns: 2, fields: [
      {key: 'title', label: 'Название', propertyType: 'string', value: 'Раз'},
    ]}],
  }],
};

const headLabels = async (lang) => {
  const page = await browser.newPage({viewport: {width: 1200, height: 800}});
  await page.setContent(
    `<!doctype html><html class="theme-light" lang="${lang}"><body style="margin:0"></body></html>`,
  );
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-property-view')));

  await page.evaluate((record) => {
    const panel = document.createElement('sf-property-view');
    panel.setAttribute('panel', '');
    panel.setAttribute('record-id', record.record_id);
    panel.setAttribute('collection', record.collection);
    document.body.append(panel);
    panel.setHostPort({
      version: '1.10.0',
      capabilities: ['record-open'],
      async raise(intent) {
        if (intent === 'record.load') return {answer: 'applied', record};
        return {answer: 'applied'};
      },
    });
  }, RECORD);
  await page.waitForFunction(() => document.querySelector('.sf-property-view-panel'), null, {timeout: 8000});
  await page.waitForTimeout(400);

  const measured = await page.evaluate(() => {
    const wanted = ['close', 'link', 'open_in_full', 'star', 'more_horiz'];
    const found = {};
    for (const button of document.querySelectorAll('button')) {
      const icon = button.querySelector('.sf-icon')?.textContent?.trim();
      if (icon && wanted.includes(icon) && !(icon in found)) {
        found[icon] = button.getAttribute('aria-label') ?? '';
      }
    }
    return found;
  });
  await page.close();
  return measured;
};

try {
  const ru = await headLabels('ru');
  const en = await headLabels('en');

  const cyrillic = /[А-Яа-яЁё]/u;
  for (const [icon, label] of Object.entries(ru)) {
    if (!label) {
      failures.push({lang: 'ru', icon, said: 'the control carries no accessible name at all'});
    } else if (!cyrillic.test(label)) {
      failures.push({lang: 'ru', icon, label, said: 'a Russian page shows this control in English'});
    }
  }
  for (const [icon, label] of Object.entries(en)) {
    if (label && cyrillic.test(label)) {
      failures.push({lang: 'en', icon, label, said: 'an English page shows this control in Russian'});
    }
  }
  // The three that were missing have to be drawn at all, or the check proves
  // nothing about them.
  for (const icon of ['close', 'link', 'open_in_full']) {
    if (!(icon in ru)) failures.push({icon, said: 'the head does not draw this control, so its language cannot be checked'});
  }

  console.log(JSON.stringify({
    probe: 'panel-head-speaks-one-language',
    ru, en,
    result: failures.length ? 'PANEL_HEAD_LANGUAGE_FAIL' : 'PANEL_HEAD_LANGUAGE_OK',
    failures,
  }, null, 2));
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
