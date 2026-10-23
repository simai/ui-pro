#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// A list draws its values with the Framework's own renderer set.
//
// Three things were wrong at once and all three needed a table to see, which is
// why they survived a suite with a renderer unit for every type (found on the
// admin polygon, 2026-10-10).
//
// The port had no word for a column's property type, so a host answering the
// contract could not ask for a typed cell at all: a boolean read «true», a
// choice read its stored code, a colour read its hex. Larena's own port sends
// columns without one to this day, for want of somewhere to put it.
//
// Two of the eleven cell renderers answer with markup rather than with a
// component descriptor -- the colour and the included block -- and the cell
// dropped anything that was not a descriptor. Every colour cell and every code
// cell in every table drew nothing.
//
// And the cell path passed no host, so `formatFieldValue` was reachable from the
// record panel and not from the list beside it: the same date read one way in a
// card and as a stored timestamp in a row, with no way for a consumer to change
// the second.
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
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/badges/js/badges.js',
  'smart/smart/tags/js/tags.js', 'smart/smart/avatar/js/avatar.js',
  'smart/smart/color/js/color.js', 'smart/smart/reference-link/js/reference-link.js',
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
  const page = await browser.newPage({viewport: {width: 1400, height: 800}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<sf-data-view id="list" chrome="" row-cap="5" aria-label="Решения">'
    + '<sf-table slot="content" toolbar="false" aria-label="Решения"></sf-table>'
    + '</sf-data-view></body></html>',
  );
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-data-view') && customElements.get('sf-table')));

  // A host answering the port and nothing else: the columns name what they hold
  // in the port's own words, snake_case, with no component's spelling in sight.
  // The host is built first, then bound, so a pair that does not know the
  // version can answer by refusing it -- which is the right answer and a useful
  // red: it says the column vocabulary is not there yet rather than dying with
  // a stack.
  await page.evaluate(() => {
    window.__host = {
      version: '1.7.0',
      capabilities: ['row-actions'],
      // The host's own formatting, which is the only place a format belongs.
      formatFieldValue(field, value) {
        if (field?.propertyType !== 'datetime' && field?.property_type !== 'datetime') return undefined;
        return value ? 'ЧИТАЕМАЯ ДАТА' : '';
      },
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {
          answer: 'applied',
          sequence: payload.sequence,
          data: {
            records: [{
              id: '1', revision: 'r1', actions: ['view'],
              name: 'Биллинг', status: 'active', public: true,
              accent: '#2f6feb', script: '<script>x()</script>',
              checked_at: '2026-09-25T07:12:00+03:00',
            }],
            // The columns name what they hold in the port's own words, snake
            // case, with no component's spelling in sight: a host that had to
            // write `propertyType` would be writing to the component and not to
            // the contract.
            columns: [
              {key: 'name', label: 'Название', property_type: 'string', role: 'title'},
              {key: 'status', label: 'Статус', property_type: 'choice',
                options: [{value: 'active', label: 'В работе', scheme: 'primary'}]},
              {key: 'public', label: 'Доступно', property_type: 'boolean'},
              {key: 'accent', label: 'Цвет', property_type: 'color'},
              {key: 'script', label: 'Скрипт', property_type: 'include', language: 'html'},
              {key: 'checked_at', label: 'Проверено', property_type: 'datetime'},
            ],
            total: 1,
            echo: {filters_chosen: {}, filters: {}, filters_rejected: [], search: '', sort: [], page: 1, per_page: 25},
            column_settings: {layers: {personal: {revision: 'p1', columns: {}}}, target: {kind: 'personal', revision: 'p1'}},
          },
        };
      },
    };
  });

  const bound = await page.evaluate(() => {
    try {
      document.querySelector('#list').setHostPort(window.__host);
      return {bound: true};
    } catch (error) {
      return {bound: false, message: String(error?.message ?? error)};
    }
  });

  if (!bound.bound) {
    console.log(JSON.stringify({
      probe: 'typed-cells',
      result: 'TYPED_CELLS_FAIL',
      failures: [{said: 'the pair does not accept a host declaring the column vocabulary', message: bound.message}],
    }, null, 2));
    await browser.close();
    process.exit(1);
  }

  await page.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 1, null, {timeout: 8000});

  const measured = await page.evaluate(() => {
    const cell = (key) => [...document.querySelectorAll('#list tbody tr:first-child td')]
      .find((td) => td.dataset.key === key);
    const read = (key) => {
      const found = cell(key);
      if (!found) return null;
      return {
        // A shown badge, tag or avatar is its component's markup (owner,
        // 2026-10-15), so a component is found by its element or its class.
        tags: [...new Set([...found.querySelectorAll('*')].flatMap((node) => [node.tagName.toLowerCase(),
          ...['sf-badge', 'sf-tag', 'sf-avatar'].filter((name) => node.classList.contains(name))])
          .filter((tag) => tag.startsWith('sf-')))],
        text: found.textContent.replace(/\s+/gu, ' ').trim(),
      };
    };
    return {
      status: read('status'), public: read('public'), accent: read('accent'),
      script: read('script'), checked_at: read('checked_at'), name: read('name'),
      columnKeys: [...document.querySelectorAll('#list thead th')].map((th) => th.dataset.key),
    };
  });

  // The port's own word for the type reaches the renderer set.
  if (!measured.status?.tags.includes('sf-badge')) {
    failures.push({cell: 'status', said: 'a choice column named in the port\'s words did not reach the renderer set', measured});
  }
  if (measured.public?.text === 'true' || measured.public?.text === '') {
    failures.push({cell: 'public', said: 'a boolean column printed its stored value', measured});
  }
  // The two renderers that answer with markup.
  if (!measured.accent?.tags.includes('sf-color')) {
    failures.push({cell: 'accent', said: 'a colour column drew nothing: the cell dropped the markup the renderer set returned', measured});
  }
  if (!measured.script?.text) {
    failures.push({cell: 'script', said: 'an include column drew nothing: the cell dropped the markup the renderer set returned', measured});
  }
  // The host's formatting, reachable from a cell at last.
  if (measured.checked_at?.text !== 'ЧИТАЕМАЯ ДАТА') {
    failures.push({cell: 'checked_at', said: 'the host formatted the value and the cell showed the stored one', measured});
  }

  console.log(JSON.stringify({
    probe: 'typed-cells',
    measured,
    result: failures.length ? 'TYPED_CELLS_FAIL' : 'TYPED_CELLS_OK',
    failures,
  }, null, 2));
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
