#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// The admin's components speak the page's language, not their author's.
//
// `src/core/js/page-language` states the rule for every component: the nearest
// [lang], else the document's, else English. Some components followed it and
// some were written in Russian only, so an English page came out a patchwork —
// a record panel that had switched sitting above a list whose toolbar still
// read «Фильтр» and «Создать». It took a language switch in an admin to see it
// (owner, 2026-10-10).
//
// This checks the words a person actually reads, in both languages, rather than
// counting literals in the source: a dictionary nobody routes through would
// pass that and fail this.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/buttons/css/buttons.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js', 'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/input/js/input.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js', 'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) {
  console.error(JSON.stringify({missingAssets: absent, root: out}, null, 2));
  throw new Error(`${absent.length} build asset(s) not found under ${out}`);
}

const failures = [];
const browser = await chromium.launch();

const read = async (lang) => {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  await page.setContent(
    `<!doctype html><html class="theme-light" lang="${lang}"><body style="margin:0">`
    + '<sf-data-view id="list" aria-label="List"><span slot="toolbar"></span>'
    + '<sf-table slot="content" id="grid" aria-label="List"></sf-table>'
    + '<sf-pagination slot="pagination"></sf-pagination></sf-data-view></body></html>',
  );
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-table') && customElements.get('sf-data-view')));

  await page.evaluate(() => {
    document.querySelector('#list').setHostPort({
      version: '1.6.0',
      capabilities: ['row-actions', 'count-on-request'],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {
          answer: 'applied', sequence: payload.sequence,
          data: {
            records: [{id: '1', revision: 'r1', actions: ['view'], name: 'One'}],
            columns: [{key: 'name', label: 'Name', role: 'title', sortable: true}],
            total: 1,
            echo: {filters_chosen: {}, filters: {}, filters_rejected: [], search: '', sort: [], page: 1, per_page: 25},
            column_settings: {layers: {personal: {revision: 'p1', columns: {}}}, target: {kind: 'personal', revision: 'p1'}},
          },
        };
      },
    });
  });
  await page.waitForFunction(() => document.querySelectorAll('#grid tbody tr').length === 1, null, {timeout: 8000});

  const measured = await page.evaluate(() => {
    const table = document.querySelector('#grid');
    const words = {};
    // What the table says, asked of the component rather than scraped, so the
    // check does not depend on where each word is drawn.
    for (const key of ['filterText', 'createText', 'searchPlaceholder', 'emptyText',
      'retryText', 'filterApplyText', 'deleteActionText', 'selectAllLabel']) {
      words[key] = table.text?.(key) ?? null;
    }
    words.operatorContains = table.getFilterOperatorLabel?.('contains') ?? null;
    // And what the pagination says. Read off the element rather than out of
    // `getProp`: the declared default is the English one by design, and asking
    // for it would report English on a Russian page and call the component
    // broken. What a person reads is what the getters answer, which is what the
    // template is built from.
    const pagination = document.querySelector('sf-pagination');
    words.paginationTotal = pagination?.totalLabel ?? null;
    words.paginationShowMore = pagination?.showMoreText ?? null;
    words.paginationPageSize = pagination?.pageSizeLabel ?? null;
    return {
      words,
      toolbar: document.querySelector('.sf-table-toolbar')?.textContent.replace(/\s+/gu, ' ').trim() ?? '',
      paginationText: pagination?.textContent.replace(/\s+/gu, ' ').trim() ?? '',
    };
  });
  await page.close();
  return measured;
};

try {
  const ru = await read('ru');
  const en = await read('en');
  const cyrillic = /[А-Яа-яЁё]/u;

  for (const [key, word] of Object.entries(ru.words)) {
    if (word === null) continue;
    if (!cyrillic.test(String(word))) {
      failures.push({lang: 'ru', key, word, said: 'a Russian page gets this word in English'});
    }
  }
  for (const [key, word] of Object.entries(en.words)) {
    if (word === null) continue;
    if (cyrillic.test(String(word))) {
      failures.push({lang: 'en', key, word, said: 'an English page gets this word in Russian'});
    }
  }
  if (cyrillic.test(en.toolbar)) {
    failures.push({lang: 'en', said: 'the toolbar an English page draws still has Russian in it', toolbar: en.toolbar});
  }
  if (!cyrillic.test(ru.toolbar)) {
    failures.push({lang: 'ru', said: 'the toolbar a Russian page draws has no Russian in it', toolbar: ru.toolbar});
  }
  if (cyrillic.test(en.paginationText)) {
    failures.push({lang: 'en', said: 'the page row an English page draws still has Russian in it', paginationText: en.paginationText});
  }

  console.log(JSON.stringify({
    probe: 'components-speak-the-page-language',
    ru, en,
    result: failures.length ? 'PAGE_LANGUAGE_FAIL' : 'PAGE_LANGUAGE_OK',
    failures,
  }, null, 2));
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
