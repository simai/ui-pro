#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The two defects the consumer found in round five's filter window.
//
// 1. Round five gave `display: flex` to every box in the tabs container so the
//    list could shrink inside a bounded window. The tab that is not selected is
//    hidden by a display of its own, so that rule unhid it: the window showed
//    its fields under its templates.
// 2. A page can open the window before the modules of the elements it renders
//    have arrived. The template row then shows its handle and its menu but no
//    radio and no name, the tabs render as one list, and nothing redraws when
//    the modules land.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/inputs/css/inputs.css',
  'component/component/context-menu/css/context-menu.css',
  'component/component/tabs/css/tabs.css',
  'component/component/checkbox/css/checkbox.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const base = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js', 'smart/smart/buttons/js/buttons.js',
  'smart/smart/icon-buttons/js/icon-buttons.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/inputs/js/inputs.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/close/js/close.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tags/js/tags.js', 'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
].map((p) => join(out, p));
// The two the consumer's page had not loaded when the window opened.
const late = ['smart/smart/radio/js/radio.js', 'smart/smart/tabs/js/tabs.js'].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

const open = async ({withLate}) => {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<div style="width:1200px"><sf-table id="t"></sf-table></div></body></html>',
  );
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of base) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  if (withLate) for (const path of late) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(1300);
  await page.evaluate(() => {
    const table = document.getElementById('t');
    const fields = ['Название', 'Код решения', 'Раздел'].map((label, index) => ({
      key: `f${index}`, label,
      filter: {enabled: true, control: 'text', defaultOperator: 'contains', operators: ['contains']},
    }));
    table.setColumns(fields.map((field) => ({key: field.key, label: field.label})));
    table.setRows([{id: '1', f0: 'a'}]);
    table.setFilterFields(fields);
    table.setTemplates([
      {key: 'default', label: 'По умолчанию', selected: true, data: {tags: {}, values: {}}},
      {key: 'saved', label: 'default', selected: false, data: {tags: {}, values: {}}},
    ]);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const host = [...document.querySelectorAll('#t sf-button, #t sf-icon-button')]
      .find((node) => node.getAttribute('text') === 'Фильтр');
    (host?.querySelector('button') ?? host)?.click();
  });
  await page.waitForTimeout(900);
  return page;
};

const look = (page) => page.evaluate(() => {
  const menu = document.querySelector('sf-context-menu');
  if (!menu) return null;
  const rows = [...menu.querySelectorAll('[data-filter-template-key]')];
  const visible = (node) => node.getBoundingClientRect().height > 0;
  return {
    templates: rows.length,
    named: rows.map((row) => row.textContent.replace(/\s+/gu, ' ').trim())
      .filter((text) => /По умолчанию|default/u.test(text)).length,
    radios: menu.querySelectorAll('input[type="radio"]').length,
    // The fields belong to the other tab, so none of their ticks may be on
    // screen while the templates tab is the one selected.
    fieldTicksOnScreen: [...menu.querySelectorAll('input[type="checkbox"]')].filter(visible).length,
    tabTitles: [...menu.querySelectorAll('.sf-tabs-top-container button')].map((node) => node.textContent.trim()),
  };
});

try {
  // 1. Everything loaded: the templates tab shows templates alone.
  const ready = await open({withLate: true});
  const shown = await look(ready);
  if (!shown || shown.templates !== 2 || shown.named !== 2 || shown.radios !== 2) {
    note({case: 'templates tab', got: shown, expected: 'both templates, each with a radio and its name'});
  }
  if (shown?.fieldTicksOnScreen !== 0) {
    note({case: 'the other tab stays hidden', got: shown, expected: 'no field ticks on screen while Шаблоны is selected'});
  }
  if (String(shown?.tabTitles) !== 'Шаблоны,Поля') {
    note({case: 'tab titles', got: shown?.tabTitles, expected: 'both tab titles'});
  }
  await ready.close();

  // 2. The modules arrive after the window is open: it must repair itself with
  //    no interaction at all.
  const racing = await open({withLate: false});
  const beforeModules = await look(racing);
  for (const path of late) await racing.addScriptTag({path, type: 'module'}).catch(() => {});
  await racing.waitForTimeout(1200);
  const afterModules = await look(racing);
  if (afterModules?.named !== 2 || afterModules?.radios !== 2
      || String(afterModules?.tabTitles) !== 'Шаблоны,Поля' || afterModules?.fieldTicksOnScreen !== 0) {
    note({case: 'late modules', got: {beforeModules, afterModules},
      expected: 'the window redraws itself once the elements it renders are defined'});
  }
  console.error(JSON.stringify({shown, beforeModules, afterModules}, null, 1));
  await racing.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('TABLE_ROUND_5_FIX_OK');
