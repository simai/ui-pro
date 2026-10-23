#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// What a page of rows costs (owner, 2026-10-15, the rules of the road): a
// value that is only shown -- a badge, a tag, an avatar -- is drawn as its
// component's markup, not as an element of its own, and looks the same; a
// sort renders the table no more than twice (loading, then the rows).
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/featured-icon/css/featured-icon.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/empty-state/css/empty-state.css',
  'component/component/badges/css/badges.css', 'component/component/tags/css/tags.css', 'component/component/avatars/css/avatars.css',
  'component/component/tabs/css/tabs.css', 'smart/smart/tabs/css/tabs.css', 'component/component/context-menu/css/context-menu.css',
  'component/component/checkbox/css/checkbox.css', 'component/component/radio/css/radio.css', 'component/component/buttons/css/buttons.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/inputs/js/inputs.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/tags/js/tags.js', 'smart/smart/radio/js/radio.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/badges/js/badges.js', 'smart/smart/avatar/js/avatar.js', 'smart/smart/empty-state/js/empty-state.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const COLUMNS = [
  {key: 'name', label: 'Название', role: 'title'},
  {key: 'status', label: 'Статус', property_type: 'choice', propertyType: 'choice', options: [{value: 'done', label: 'Готово', color: 'success'}, {value: 'work', label: 'В работе', color: 'warning'}]},
  {key: 'tags', label: 'Модули', property_type: 'choices', propertyType: 'choices', options: [{value: 'a', label: 'Биллинг'}, {value: 'b', label: 'Хранилище'}]},
  {key: 'owner', label: 'Автор', property_type: 'user', propertyType: 'user'},
];
const rows = (from) => Array.from({length: 20}, (_, at) => ({id: String(from + at), name: `Запись ${from + at}`, status: at % 2 ? 'done' : 'work',
  tags: ['a', 'b'].slice(0, 1 + (at % 2)), owner: {value: `u${at}`, label: 'Анна Петрова', avatarText: 'АП'}, actions: ['view', 'edit']}));

try {
  const page = await browser.newPage({viewport: {width: 1200, height: 800}});
  page.on('pageerror', (error) => console.error('pageerror', error.message));
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
    <div style="width:1000px"><sf-data-view id="v"><sf-table slot="content" id="t"></sf-table></sf-data-view></div>
    <sf-badge id="ref" appearance="tonal" text="Готово"></sf-badge></body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-data-view') && customElements.get('sf-badge'), null, {timeout: 8000});
  // A first page, and another one when the person sorts.
  await page.evaluate(({columns, data}) => {
    document.getElementById('v').setHostPort({
      version: '1.10.0', capabilities: ['row-actions'],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        const records = payload.query.sort?.length ? data.second : data.first;
        return {answer: 'applied', sequence: payload.sequence, data: {records, total: 40, columns,
          echo: {search: '', filters: {}, sort: payload.query.sort ?? [], page: 1, per_page: 20}}};
      },
    });
  }, {columns: COLUMNS, data: {first: rows(0), second: rows(100)}});
  await page.waitForTimeout(1500);
  const weight = await page.evaluate(() => {
    const body = document.querySelector('#t tbody');
    const elements = [...body.querySelectorAll('sf-badge, sf-tag, sf-avatar')].length;
    const badge = body.querySelector('.sf-badge');
    const ref = document.querySelector('#ref .sf-badge');
    const box = (node) => node ? [Math.round(node.getBoundingClientRect().height), getComputedStyle(node).fontSize, getComputedStyle(node).paddingLeft] : null;
    return {elements, badges: body.querySelectorAll('.sf-badge').length, tags: body.querySelectorAll('.sf-tag').length,
      avatars: body.querySelectorAll('.sf-avatar').length, cell: box(badge), alone: box(ref)};
  });
  if (weight.elements !== 0 || !weight.badges || !weight.tags || !weight.avatars) note({case: 'shown values are markup, not elements', got: weight});
  // The row's buttons are in the row a person is on, and follow the pointer.
  const actions = async () => page.evaluate(() => [...document.querySelectorAll('#t tbody tr[data-row-id]')]
    .filter((row) => row.querySelector('td[data-key="actions"] sf-icon-button, td[data-key="actions"] .sf-icon-button')).map((row) => row.dataset.rowId));
  const idle = await actions();
  await page.hover('#t tbody tr[data-row-id]:nth-child(3) td[data-key="name"]');
  await page.waitForTimeout(250);
  const hovered = await actions();
  await page.hover('#t tbody tr[data-row-id]:nth-child(5) td[data-key="name"]');
  await page.waitForTimeout(250);
  const moved = await actions();
  if (idle.length > 1 || hovered.length !== 1 || moved.length !== 1 || hovered[0] === moved[0]) {
    note({case: "a row's buttons are in the row a person is on", got: {idle, hovered, moved}});
  }
  // A sort: no more than two renders of the table.
  const renders = await page.evaluate(async () => {
    const table = document.getElementById('t');
    let count = 0;
    const template = table.template;
    table.template = function (...args) { count += 1; return template.apply(this, args); };
    table.querySelector('thead th[data-key="name"] .sf-table-sort-button, thead th[data-key="name"]')?.click();
    await new Promise((done) => setTimeout(done, 1200));
    delete table.template;
    return count;
  });
  if (renders > 2) note({case: 'a sort renders the table at most twice', got: renders});
  console.log(JSON.stringify({weight, renders}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('TABLE_CELL_WEIGHT_OK');
