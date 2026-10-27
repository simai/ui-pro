#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// A data view offers saved views when the host keeps them, and not otherwise.
//
// The toolbar's «Вид / Название вида / Сохранить вид / Удалить вид» were drawn
// for every host. A host that claims neither saved-views nor
// shared-saved-views answers all four intents with capability-not-provided, so
// those controls could do nothing but refuse -- which is not a control, it is a
// trap. The owner met them on a page whose host claims only row-actions, and
// the admin reference showed them on its first page (owner, 2026-10-09).
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = ['core/core/css/core.css', 'core/core/css/utility.full.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css'].map((p) => join(out, p));
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
    + '<sf-data-view id="plain" chrome="toolbar" aria-label="Без видов"></sf-data-view>'
    + '<sf-data-view id="keeper" chrome="toolbar" aria-label="С видами"></sf-data-view>'
    + '</body></html>',
  );
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-data-view')));

  await page.evaluate(() => {
    const host = (capabilities) => ({
      version: '1.6.0',
      capabilities,
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {answer: 'applied', sequence: payload.sequence,
          data: {records: [], columns: [{key: 'name', label: 'Название'}], total: 0}};
      },
    });
    document.querySelector('#plain').setHostPort(host(['row-actions']));
    document.querySelector('#keeper').setHostPort(host(['row-actions', 'saved-views']));
  });
  await page.waitForTimeout(1200);

  const measured = await page.evaluate(() => ['plain', 'keeper'].map((id) => {
    const view = document.querySelector(`#${id}`);
    const saved = view.shadowRoot?.querySelector('[data-saved-views]');
    const visible = Boolean(saved) && !saved.hidden && saved.getClientRects().length > 0;
    return {id, offered: visible};
  }));

  const plain = measured.find((entry) => entry.id === 'plain');
  const keeper = measured.find((entry) => entry.id === 'keeper');
  if (plain?.offered) failures.push({said: 'a host that keeps no views is offered «Сохранить вид»'});
  if (!keeper?.offered) failures.push({said: 'a host that keeps views is not offered them'});

  console.log(JSON.stringify({
    probe: 'saved-views-capability',
    measured,
    result: failures.length ? 'SAVED_VIEWS_CAPABILITY_FAIL' : 'SAVED_VIEWS_CAPABILITY_OK',
    failures,
  }, null, 2));
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
