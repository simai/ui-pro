#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// The «Действия» column draws the actions a row offers.
//
// It drew an empty container instead, in every row of every list -- a consumer
// reported it on an embedded one, which is only where they happened to be
// looking. `row.actions` is read twice over a row's life and means two things:
// from a host it is ids, the data view port's word for which actions apply to
// this record, and once the cell is built it holds the built items. The filter
// that selects by ids was handed the built items and asked whether an array of
// objects includes a string, so it emptied the cell every time.
//
// Measured on the built bytes rather than asserted in a unit, because nothing
// in the chain is wrong on its own: the ids are right, the items are
// well-formed, the renderer answers when called by hand. Only the rendering
// disagrees, and only a browser renders.
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
  const page = await browser.newPage({viewport: {width: 1100, height: 700}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<sf-data-view id="list" chrome="" row-cap="5" aria-label="Связанные">'
    + '<sf-table slot="content" toolbar="false" row-actions-visible="always" aria-label="Связанные"></sf-table>'
    + '</sf-data-view></body></html>',
  );
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-data-view') && customElements.get('sf-table')));

  // A host that answers the way the port says: each record declares which of
  // the list's actions apply to it, by id.
  await page.evaluate(() => {
    document.querySelector('#list').setHostPort({
      version: '1.6.0',
      capabilities: ['row-actions'],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {
          answer: 'applied',
          sequence: payload.sequence,
          data: {
            records: [
              {id: '1', name: 'Раз', actions: ['view']},
              {id: '2', name: 'Два', actions: ['view', 'edit']},
              {id: '3', name: 'Три'},
            ],
            columns: [{key: 'name', label: 'Название'}],
            total: 3,
          },
        };
      },
    });
  });
  await page.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 3, null, {timeout: 8000});

  const measured = await page.evaluate(() => [...document.querySelectorAll('#list tbody tr')].map((tr) => {
    const cells = [...tr.querySelectorAll('td')];
    const last = cells[cells.length - 1];
    return {controls: last ? last.querySelectorAll('button, sf-button').length : 0};
  }));

  // A row that names its actions offers exactly those: one for the first, two
  // for the second. A row that names none offers the list's own, which is the
  // contract a table whose rows say nothing has always answered to -- change
  // that and a consumer who sets the action list and no per-row ids sees an
  // empty column, which is the defect this probe exists for.
  if (measured[0]?.controls === 0) failures.push({row: 1, said: 'declares view and draws nothing', measured});
  if (!(measured[1]?.controls > measured[0]?.controls)) {
    failures.push({row: 2, said: 'declares two actions and does not draw more than the row that declares one', measured});
  }
  if (!(measured[2]?.controls >= measured[1]?.controls)) {
    failures.push({row: 3, said: 'declares nothing and is offered less than a row that names two', measured});
  }

  console.log(JSON.stringify({
    probe: 'row-actions-cell',
    measured,
    result: failures.length ? 'ROW_ACTIONS_CELL_FAIL' : 'ROW_ACTIONS_CELL_OK',
    failures,
  }, null, 2));
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
