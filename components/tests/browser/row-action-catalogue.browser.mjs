#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// A row action the table declares keeps the table's own control.
//
// The data view narrows the table's action list to the ids the records name.
// It used to narrow the list in place, and the first projection of a list that
// had not answered yet carried no records at all -- so the catalogue was
// overwritten with nothing, and from then on every id the host named was
// unknown. «view» came out as a text link labelled "view", in a Russian
// interface, and in the actions column of a narrow list the label broke
// mid-word and set the height of every row.
//
// Measured in a browser because the defect needs two projections to appear:
// called once, by hand, the narrowing is correct.
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

try {
  const page = await browser.newPage({viewport: {width: 1100, height: 700}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<sf-data-view id="list" chrome="" row-cap="5" aria-label="Записи">'
    + '<sf-table slot="content" toolbar="false" row-actions-visible="always" aria-label="Записи"></sf-table>'
    + '</sf-data-view></body></html>',
  );
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-data-view') && customElements.get('sf-table')));

  // The host answers twice: nothing at all, the way a list looks before its
  // first page arrives, and then the records.
  await page.evaluate(() => {
    let served = 0;
    document.querySelector('#list').setHostPort({
      version: '1.6.0',
      capabilities: ['row-actions'],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        served += 1;
        return {
          answer: 'applied',
          sequence: payload.sequence,
          data: {
            records: served === 1 ? [] : [
              {id: '1', name: 'Раз', actions: ['view', 'edit']},
            ],
            columns: [{key: 'name', label: 'Название'}],
            total: served === 1 ? 0 : 1,
          },
        };
      },
    });
  });
  // An empty list draws one row saying so -- its sf-empty-state, no data --
  // which is how the first projection is recognised here.
  await page.waitForFunction(
    () => Boolean(document.querySelector('#list tbody sf-empty-state[kind="no-data"]')),
    null, {timeout: 8000},
  );
  // The second projection, after the empty one that used to eat the catalogue.
  await page.evaluate(() => document.querySelector('#list').refresh());
  await page.waitForFunction(
    () => /Раз/u.test(document.querySelector('#list tbody')?.textContent ?? ''),
    null, {timeout: 8000},
  );

  const measured = await page.evaluate(() => {
    const table = document.querySelector('#list sf-table');
    const row = document.querySelector('#list tbody tr');
    const cells = [...(row?.querySelectorAll('td') ?? [])];
    const cell = cells[cells.length - 1];
    return {
      catalogue: (table?.ACTIONS_SETTINGS_ROW ?? []).map((action) => ({
        id: action.id, type: action.component?.type, icon: action.component?.props?.icon,
      })),
      labels: [...(cell?.querySelectorAll('.sf-button-text-container') ?? [])]
        .map((span) => span.textContent.trim()),
      icons: [...(cell?.querySelectorAll('.sf-icon') ?? [])].map((icon) => icon.textContent.trim()),
      controls: cell?.querySelectorAll('button').length ?? 0,
    };
  });

  // The ids the host named resolve to the controls the table declares for them,
  // and nothing in the cell is a control labelled with a bare id.
  for (const id of ['view', 'edit']) {
    const entry = measured.catalogue.find((action) => action.id === id);
    if (!entry) failures.push({id, said: 'the host named it and the catalogue does not hold it', measured});
    else if (entry.type === 'button' && !entry.icon) {
      failures.push({id, said: 'resolved to a synthesised text control, so the catalogue was overwritten', measured});
    }
  }
  if (measured.labels.some((label) => ['view', 'edit', 'delete'].includes(label))) {
    failures.push({said: 'an action control is labelled with a bare action id', measured});
  }
  if (!(measured.controls >= 2)) failures.push({said: 'the row named two actions and does not offer two', measured});

  console.log(JSON.stringify({
    probe: 'row-action-catalogue',
    measured,
    result: failures.length ? 'ROW_ACTION_CATALOGUE_FAIL' : 'ROW_ACTION_CATALOGUE_OK',
    failures,
  }, null, 2));
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
