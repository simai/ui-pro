#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// A product can teach the components a language the Framework has never heard
// of, and switch to it without reloading the page.
//
// Every component used to carry a dictionary of exactly two languages written
// into its source. Adding a third meant editing sixteen files, and a product
// that needed one could not add it at all. There will be many more than two
// (owner, 2026-10-11), so what a component ships is a floor and anything can be
// registered beside it.
//
// The registry lives on a shared global rather than in module scope, and this
// probe is why: core, each component and each composite are separate bundles
// with their own copy of the module, so a registry in module scope gave the
// page as many registries as bundles — `SF.language` was published from core's
// copy, the table read its own, and registering a language changed nothing.
// Everything looked right except the screen.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/buttons/css/buttons.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/inputs/js/inputs.js', 'smart/smart/dropdown/js/dropdown.js',
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

try {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<sf-data-view id="list" aria-label="Список"><span slot="toolbar"></span>'
    + '<sf-table slot="content" id="grid" aria-label="Список"></sf-table>'
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
            columns: [{key: 'name', label: 'Name', role: 'title'}],
            total: 1,
            echo: {filters_chosen: {}, filters: {}, filters_rejected: [], search: '', sort: [], page: 1, per_page: 25},
            column_settings: {layers: {personal: {revision: 'p1', columns: {}}}, target: {kind: 'personal', revision: 'p1'}},
          },
        };
      },
    });
  });
  await page.waitForFunction(() => document.querySelectorAll('#grid tbody tr').length === 1, null, {timeout: 8000});

  const read = () => page.evaluate(() => ({
    toolbar: document.querySelector('.sf-table-toolbar')?.textContent.replace(/\s+/gu, ' ').trim() ?? '',
    pageRow: document.querySelector('sf-pagination')?.textContent.replace(/\s+/gu, ' ').trim() ?? '',
  }));

  const published = await page.evaluate(() => ({
    register: typeof window.SF?.language?.register,
    use: typeof window.SF?.language?.use,
    current: typeof window.SF?.language?.current,
    onChange: typeof window.SF?.language?.onChange,
  }));
  for (const [name, kind] of Object.entries(published)) {
    if (kind !== 'function') {
      failures.push({said: `SF.language.${name} is not reachable by a consumer`, published});
    }
  }

  const asWritten = await read();
  if (!/Фильтр/u.test(asWritten.toolbar)) {
    failures.push({step: 'the page as written', said: 'a Russian page does not start in Russian', asWritten});
  }

  // A product teaches two components a language nobody shipped.
  await page.evaluate(() => {
    window.SF.language.registerAll('tr', {
      'sf-table': {filterText: 'Filtre', createText: 'Oluştur'},
      'sf-pagination': {totalLabel: 'Toplam:'},
    });
    window.SF.language.use('tr');
  });
  await page.waitForTimeout(600);
  const added = await read();

  if (!/Filtre/u.test(added.toolbar) || !/Oluştur/u.test(added.toolbar)) {
    failures.push({step: 'a language added', said: 'the words a product registered did not reach the screen', added});
  }
  if (!/Toplam:/u.test(added.pageRow)) {
    failures.push({step: 'a language added', said: 'a second component did not take the same language', added});
  }
  // What the product did not translate falls back to English, never to the
  // language the page happened to be written in.
  if (/Страницы|На странице/u.test(added.pageRow)) {
    failures.push({step: 'a language added', said: 'an untranslated word fell back to the page language instead of English', added});
  }

  // And the switch is reversible, both to another language and to the page's.
  await page.evaluate(() => window.SF.language.use('en'));
  await page.waitForTimeout(500);
  const english = await read();
  if (!/Filter/u.test(english.toolbar) || /Filtre/u.test(english.toolbar)) {
    failures.push({step: 'back to English', said: 'the previous language stayed on screen', english});
  }

  await page.evaluate(() => window.SF.language.use(null));
  await page.waitForTimeout(500);
  const back = await read();
  if (!/Фильтр/u.test(back.toolbar)) {
    failures.push({step: 'back to the page', said: 'releasing the choice did not return to what the page says', back});
  }

  console.log(JSON.stringify({
    probe: 'language-can-be-added',
    asWritten, added, english, back,
    result: failures.length ? 'LANGUAGE_REGISTRY_FAIL' : 'LANGUAGE_REGISTRY_OK',
    failures,
  }, null, 2));
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
