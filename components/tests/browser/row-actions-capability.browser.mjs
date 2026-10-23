#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// A list does not draw a control the host has not claimed.
//
// `record.mutate` and `record.open` are behind the `row-actions` capability and
// the view already refused them without it -- answered «unavailable» without
// calling the host at all. The actions column was drawn regardless, with its
// buttons, so a person could press an action that nothing would ever apply and
// nothing would ever explain. The same rule the saved-view controls already
// follow: claimed, or not shown (found on the admin polygon by turning the
// capability off, 2026-10-10).
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

const measure = async (capabilities) => {
  const page = await browser.newPage({viewport: {width: 1200, height: 700}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<sf-data-view id="list" chrome="" aria-label="Записи">'
    + '<sf-table slot="content" toolbar="false" row-actions-visible="always" aria-label="Записи"></sf-table>'
    + '</sf-data-view></body></html>',
  );
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-data-view') && customElements.get('sf-table')));

  await page.evaluate((claimed) => {
    document.querySelector('#list').setHostPort({
      version: '1.6.0',
      capabilities: claimed,
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {
          answer: 'applied',
          sequence: payload.sequence,
          data: {
            records: [{id: '1', revision: 'r1', actions: ['view', 'edit'], name: 'Раз'}],
            columns: [{key: 'name', label: 'Название', role: 'title'}],
            total: 1,
          },
        };
      },
    });
  }, capabilities);
  await page.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 1, null, {timeout: 8000});

  const measured = await page.evaluate(() => {
    const row = document.querySelector('#list tbody tr');
    return {
      columns: [...document.querySelectorAll('#list thead th')].map((th) => th.dataset.key),
      controlsInLastCell: [...row.querySelectorAll('td')].pop()?.querySelectorAll('button').length ?? 0,
    };
  });
  await page.close();
  return measured;
};

try {
  const claimed = await measure(['row-actions']);
  const unclaimed = await measure([]);

  if (!claimed.columns.includes('actions')) {
    failures.push({said: 'the host claims row-actions and the list offers none', claimed});
  }
  if (!(claimed.controlsInLastCell > 0)) {
    failures.push({said: 'the host claims row-actions and the row draws no control', claimed});
  }
  if (unclaimed.columns.includes('actions')) {
    failures.push({said: 'the host claims no row-actions and the list draws the actions column anyway', unclaimed});
  }
  if (unclaimed.controlsInLastCell > 0) {
    failures.push({said: 'the host claims no row-actions and the row still draws controls', unclaimed});
  }

  console.log(JSON.stringify({
    probe: 'row-actions-capability',
    claimed, unclaimed,
    result: failures.length ? 'ROW_ACTIONS_CAPABILITY_FAIL' : 'ROW_ACTIONS_CAPABILITY_OK',
    failures,
  }, null, 2));
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
