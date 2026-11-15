#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// sf-view-table 1.18.0, owner decision C32 (2026-11-09): the table's own
// windows by their kind, from the Framework's popup widths, measured on the
// built bytes at 1440 normal, 1440 compact and 390, light and dark:
//   - the filter with its saved views and the column settings are panels,
//     --sf-popup-panel-width (320; 288 compact) or the trigger when wider;
//   - saving a template and a chip's filter are forms, --sf-popup-form-width
//     (320; 288 compact), whatever they hold;
//   - the menus (create, toolbar actions, list sort) stay sf-menu-context's,
//     between --sf-popup-menu-min-width and --sf-popup-menu-max-width;
//   - a clean console.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';
if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const shots = null;
const label = 'probe';
const STYLES = ['core/core/css/core.css', 'core/core/css/utility.full.css', 'component/component/icons/css/icons.css', 'component/component/dot/css/dot.css', 'component/component/tooltip/css/tooltip.css', 'component/component/icon-buttons/css/icon-buttons.css', 'component/component/badges/css/badges.css', 'component/component/button-group/css/button-group.css', 'component/component/buttons/css/buttons.css', 'component/component/inputs/css/inputs.css', 'component/component/context-menu/css/context-menu.css', 'component/component/pagination/css/pagination.css', 'component/component/skeleton/css/skeleton.css', 'component/component/segmented/css/segmented.css', 'component/component/tags/css/tags.css', 'smart/smart/view-table/css/view-table.css', 'smart/smart/view/css/view.css', 'smart/smart/resizer/css/resizer.css'];
const MODULES = ['core/core/js/core.js', 'core/core/js/smart-base.js', 'component/component/tooltip/js/tooltip.js', 'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js', 'smart/smart/button-icon/js/button-icon.js', 'smart/smart/badge/js/badge.js', 'smart/smart/segmented/js/segmented.js', 'smart/smart/input/js/input.js', 'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js', 'smart/smart/menu-context/js/menu-context.js', 'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js', 'smart/smart/tag/js/tag.js', 'smart/smart/tabs/js/tabs.js', 'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/sortable/js/sortable.js', 'smart/smart/view-table/js/view-table.js'];
import {existsSync} from 'node:fs';
const COLUMNS = [
  {key: 'title', label: 'Название', sortable: true, filter: {control: 'text'}},
  {key: 'state', label: 'Состояние', sortable: true, filter: {control: 'text'}},
  {key: 'owner', label: 'Владелец', filter: {control: 'text'}},
];
const ROWS = [1, 2, 3].map((n) => ({id: String(n), title: `Запись ${n}`, state: 'Опубликована', owner: 'Римма'}));
const browser = await chromium.launch();
const results = [];
const failures = [];
try {
  for (const load of [1]) for (const scheme of ['light', 'dark']) for (const [width, density] of [[1440, 'normal'], [1440, 'compact'], [390, 'normal']]) {
    const where = `${scheme} ${width} ${density}`;
    const context = await browser.newContext({viewport: {width, height: 900}, colorScheme: scheme});
    const tab = await context.newPage();
    const errors = [];
    tab.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    tab.on('pageerror', (e) => { if (!/publicPath/u.test(e.message)) errors.push(`pageerror: ${e.message}`); });
    await tab.setContent(`<!doctype html><html class="theme-${scheme}" lang="ru" data-sf-density="${density}"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px">
      <sf-view-table id="t" aria-label="Каталог" filter-templates="true" layout="table"></sf-view-table></body></html>`);
    for (const s of STYLES) { const f = join(out, s); if (existsSync(f)) await tab.addStyleTag({path: f}); }
    for (const m of MODULES) { const f = join(out, m); if (existsSync(f)) await tab.addScriptTag({path: f, type: 'module'}); }
    await tab.waitForFunction(() => customElements.get('sf-view-table'), null, {timeout: 20000});
    const measured = await tab.evaluate(async ({COLUMNS, ROWS}) => {
      const wait = (ms) => new Promise((done) => setTimeout(done, ms));
      const t = document.getElementById('t');
      t.setColumns(COLUMNS);
      t.setRows(ROWS);
      t.setCreateItems?.([{id: 'page', name: 'Страница'}, {id: 'folder', name: 'Папка'}]);
      t.setToolbarActions?.([{id: 'export', label: 'Выгрузить'}, {id: 'import', label: 'Загрузить список из файла'}]);
      t.setTemplates?.({all: {key: 'all', label: 'Все записи'}, mine: {key: 'mine', label: 'Мои'}});
      await wait(700);
      const deep = (root, selector) => {
        const found = root.querySelector(selector);
        if (found) return found;
        for (const node of root.querySelectorAll('*')) if (node.shadowRoot) { const inner = deep(node.shadowRoot, selector); if (inner) return inner; }
        return null;
      };
      const filterButton = t.querySelector('.sf-table-toolbar-start sf-button button') || t.querySelector('.sf-table-toolbar sf-button-icon button') || t.querySelector('.sf-table-toolbar button');
      const fake = (target) => ({currentTarget: target, target, preventDefault() {}, stopPropagation() {}, composedPath: () => [target]});
      const open = async (menu, extra = {}) => {
        t.closeContextMenu?.(false);
        await wait(150);
        t.openContextMenu(fake(filterButton), {type: 'bottom', menu, ...extra});
        await wait(500);
        const menuEl = deep(document, '.sf-table-context-menu') || deep(document, '[data-context-main-menu] .sf-context-menu, sf-menu-context[data-context-main-menu] > *');
        let target = menuEl;
        if (!target) {
          const host = deep(document, 'sf-menu-context[data-context-main-menu]') || deep(document, 'sf-menu-context');
          target = host && (host.firstElementChild || host);
        }
        const r = target?.getBoundingClientRect();
        return r ? {width: Math.round(r.width * 100) / 100, left: Math.round(r.left), right: Math.round(r.right), classes: target.className?.baseVal ?? target.className} : null;
      };
      const trigger = filterButton?.getBoundingClientRect().width ?? null;
      const out = {trigger};
      out['filter-settings (panel)'] = await open('filter-settings');
      out['table-settings (panel)'] = await open('table-settings');
      out['filter-favorites (form)'] = await open('filter-favorites');
      out['tag-settings (form)'] = await open('tag-settings', {fieldKey: 'title'});
      out['create (menu)'] = await open('create');
      out['toolbar-actions (menu)'] = await open('toolbar-actions');
      out['list-sort (menu)'] = await open('list-sort');
      t.closeContextMenu?.(false);
      const vars = getComputedStyle(document.documentElement);
      out.vars = Object.fromEntries(['--sf-popup-panel-width', '--sf-popup-form-width', '--sf-popup-menu-min-width', '--sf-popup-menu-max-width'].map((n) => [n, vars.getPropertyValue(n).trim()]));
      return out;
    }, {COLUMNS, ROWS});
    if (shots && load === 1) {
      await tab.evaluate(async () => {
        const t = document.getElementById('t');
        const b = t.querySelector('.sf-table-toolbar-start sf-button button') || t.querySelector('.sf-table-toolbar button');
        t.openContextMenu({currentTarget: b, target: b, preventDefault() {}, stopPropagation() {}, composedPath: () => [b]}, {type: 'bottom', menu: 'filter-settings'});
        await new Promise((d) => setTimeout(d, 500));
      });
      await tab.screenshot({path: join(shots, `${label}-filter-panel-${width}-${density}-${scheme}.png`)});
    }
    results.push({load, where, ...measured, errors: errors.length, errorText: errors.slice(0, 3)});
    if (errors.length) failures.push(`${where}: ${errors.slice(0, 2).join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
}
const px = (value) => parseFloat(value) * (String(value).endsWith('rem') ? 16 : 1);
for (const r of results) {
  const panel = px(r.vars['--sf-popup-panel-width']), form = px(r.vars['--sf-popup-form-width']);
  const min = px(r.vars['--sf-popup-menu-min-width']), max = px(r.vars['--sf-popup-menu-max-width']);
  const want = Math.max(panel, Math.ceil(r.trigger ?? 0));
  for (const [name, expected] of [['filter-settings (panel)', want], ['table-settings (panel)', want], ['filter-favorites (form)', form], ['tag-settings (form)', form]]) {
    if (!r[name] || Math.abs(r[name].width - expected) > 0.5) failures.push(`${r.where}: ${name} is ${r[name]?.width}, expected ${expected}`);
  }
  for (const name of ['create (menu)', 'toolbar-actions (menu)', 'list-sort (menu)']) {
    if (!r[name] || r[name].width < min - 0.5 || r[name].width > max + 0.5) failures.push(`${r.where}: ${name} is ${r[name]?.width}, outside ${min}-${max}`);
  }
}
console.log(JSON.stringify(results));
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('TABLE_WINDOW_KINDS_OK');
