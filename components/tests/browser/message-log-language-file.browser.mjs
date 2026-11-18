#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-message-log keeps the conversation's own words on a Russian page that
// carries SIMAI Framework's Russian language file (C282, since the pair
// ui-1ed6b6c9a040). The file registers sf-list-feed's words under the entry
// the alias shares with the feed; before sf-message-log 2.0.6 they overrode
// its own («Лента» for «Переписка», ui-control evidence 2026-11-18-pro-over-1ed6).
// Held, with core/lang/ru.js included first (before core.js, as a page does)
// and last (after the elements are defined and drawn):
// - sf-message-log says «Переписка» / «Сообщения», drawn and asked;
// - an sf-list-feed beside it keeps the feed's «Лента» / «Записи»;
// - an English page says «Conversation».
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'smart/smart/list-feed/css/list-feed.css', 'smart/smart/message-log/css/message-log.css',
].map((p) => join(out, p));
const LANG_FILE = join(out, 'core/core/lang/ru.js');
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js', 'smart/smart/button-icon/js/button-icon.js',
  'smart/smart/list-feed/js/list-feed.js', 'smart/smart/message-log/js/message-log.js',
].map((p) => join(out, p));
const absent = [...styles, LANG_FILE, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.join(', ')}`);

const failures = [];
const browser = await chromium.launch();

const read = async ({lang, file}) => {
  const page = await browser.newPage({viewport: {width: 900, height: 700}});
  const errors = [];
  page.on('pageerror', (error) => { if (!/Automatic publicPath/u.test(error.message)) errors.push(error.message); });
  await page.setContent(`<!doctype html><html class="theme-light" lang="${lang}"><head><meta charset="utf-8"></head><body style="margin:0">`
    + '<div style="display:flex;gap:16px"><div style="display:flex;flex-direction:column;height:300px;width:400px"><sf-message-log id="log"></sf-message-log></div>'
    + '<div style="display:flex;flex-direction:column;height:300px;width:400px"><sf-list-feed id="feed"></sf-list-feed></div></div></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  if (file === 'first') await page.addScriptTag({path: LANG_FILE});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-message-log') && customElements.get('sf-list-feed')));
  const fill = () => page.evaluate(() => {
    document.querySelector('#log').setMessages([{id: 'm1', author: 'anna', 'author-name': 'Анна', text: 'Добрый день!'}]);
    document.querySelector('#feed').items = [{id: 'f1', author: 'anna', 'author-name': 'Анна', text: 'Запись'}];
  });
  await fill();
  await page.waitForTimeout(300);
  if (file === 'last') {
    await page.addScriptTag({path: LANG_FILE});
    // The file arrived after the first drawing: the page draws again.
    await page.evaluate(() => globalThis.SF?.language?.use?.(document.documentElement.lang));
    await fill();
    await page.waitForTimeout(300);
  }
  const seen = await page.evaluate(() => {
    const log = document.querySelector('#log');
    const feed = document.querySelector('#feed');
    return {
      logRegion: log.querySelector('[role=region]')?.getAttribute('aria-label') ?? null,
      logWord: log.sfWord?.('region-label') ?? null,
      logList: log.sfWord?.('log-label') ?? null,
      feedRegion: feed.querySelector('[role=region]')?.getAttribute('aria-label') ?? null,
      feedWord: feed.sfWord?.('region-label') ?? null,
      packs: Object.keys(globalThis.SF?.language?.packs?.() ?? {}),
    };
  });
  await page.close();
  return {...seen, errors};
};

const cases = [
  {lang: 'ru', file: 'first', log: 'Переписка', list: 'Сообщения', feed: 'Лента'},
  {lang: 'ru', file: 'last', log: 'Переписка', list: 'Сообщения', feed: 'Лента'},
  {lang: 'en', file: 'none', log: 'Conversation', list: 'Messages', feed: null},
];
const results = {};
try {
  for (const one of cases) {
    const seen = await read(one);
    const label = `${one.lang} page, language file ${one.file}`;
    results[label] = seen;
    if (seen.logRegion !== one.log || seen.logWord !== one.log) failures.push({case: label, said: `sf-message-log says ${seen.logRegion} / ${seen.logWord}, not ${one.log}`});
    if (seen.logList !== one.list) failures.push({case: label, said: `sf-message-log's list is ${seen.logList}, not ${one.list}`});
    if (one.feed && (seen.feedRegion !== one.feed || seen.feedWord !== one.feed)) failures.push({case: label, said: `sf-list-feed says ${seen.feedRegion} / ${seen.feedWord}, not ${one.feed}`});
    if (one.file !== 'none' && !seen.packs.includes('ru')) failures.push({case: label, said: 'the Russian language file was not taken'});
    if (seen.errors.length) failures.push({case: label, said: 'page errors', errors: seen.errors});
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({probe: 'message-log-language-file', results, failures}, null, 1));
if (failures.length) process.exit(1);
