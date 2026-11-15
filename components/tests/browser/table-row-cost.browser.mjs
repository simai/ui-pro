#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-view-table 1.17.1, the cost of a row (simai/ui-pro#1 and #2), on the
// built bytes:
//   - the column settings are read once a draw, not once a cell: counted
//     over one setRows() draw, 8 rows ask getColumnSettings() a handful of
//     times (they asked 268), a window of 60 rows of 1 000 as few;
//   - variant В (C146 (5), R239): no «Действия» column, so no row carries
//     hover-only buttons; a row of the bench's five columns with its box and
//     ≡ menu is ROW_NODES nodes: 29, the box's tick glyph in and the bare
//     actions cell out (it was 29 with that cell and no glyph);
//   - the pointer over a row draws nothing into it and focus on the name
//     link stays where it is (the row is not drawn anew);
//   - a clean console.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = ['core/core/css/core.css', 'core/core/css/utility.full.css', 'component/component/icons/css/icons.css',
  'component/component/pagination/css/pagination.css', 'component/component/inputs/css/inputs.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/resizer/css/resizer.css'].map((p) => join(out, p));
const modules = ['core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js', 'smart/smart/button-icon/js/button-icon.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js', 'smart/smart/input/js/input.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/pagination/js/pagination.js', 'smart/smart/menu-context/js/menu-context.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/view-table/js/view-table.js'].map((p) => join(out, p));

const ROW_NODES = Number(process.env.ROW_NODES ?? 29);
const COLUMNS = [{key: 'title', label: 'Название', sortable: true, role: 'title'}, {key: 'status', label: 'Статус'}, {key: 'owner', label: 'Владелец'}, {key: 'amount', label: 'Сумма', type: 'number'}, {key: 'published', label: 'Опубликовано', type: 'boolean'}];
const rows = (n) => Array.from({length: n}, (_, i) => ({id: String(i + 1), title: `Запись ${i + 1}`, status: 'active', owner: 'Сотрудник', amount: i, published: i % 2 === 0, revision: 'r1', actions: ['view', 'edit', 'delete']}));

const failures = [];
const browser = await chromium.launch();
try {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, colorScheme: scheme});
    const tab = await context.newPage();
    const errors = [];
    tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    tab.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(error.message); });
    await tab.setContent(`<!doctype html><html class="theme-${scheme}" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"><div style="width:1200px"><sf-view-table id="t" aria-label="Т"></sf-view-table></div></body></html>`);
    for (const path of styles) await tab.addStyleTag({path}).catch(() => {});
    for (const path of modules) await tab.addScriptTag({path, type: 'module'}).catch(() => {});
    await tab.waitForFunction(() => customElements.get('sf-view-table'), null, {timeout: 15000});
    const read = await tab.evaluate(async ({COLUMNS, R8, R1000}) => {
      const settle = () => new Promise((done) => setTimeout(done, 600));
      const t = document.getElementById('t');
      t.setColumns(COLUMNS);
      await settle();
      const Ctor = customElements.get('sf-view-table');
      const get = Ctor.prototype.getColumnSettings;
      let calls = 0;
      Ctor.prototype.getColumnSettings = function (...args) { calls += 1; return get.apply(this, args); };
      const count = (root) => { const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL); let n = 1; while (walker.nextNode()) n += 1; return n; };
      calls = 0; t.setRows(R8); await settle();
      const draw8 = calls;
      const row = t.querySelector('tbody tr[data-row-id="2"]');
      const nodes = count(row);
      const actionCells = t.querySelectorAll('td[data-key="actions"], th[data-key="actions"]').length;
      calls = 0; t.setRows(R1000); await settle();
      const window1000 = calls;
      const drawn = t.querySelectorAll('tbody tr[data-row-id]').length;
      Ctor.prototype.getColumnSettings = get;
      t.setRows(R8); await settle();
      const three = () => t.querySelector('tbody tr[data-row-id="3"]');
      const before = three();
      before.querySelector('td[data-key="owner"]').dispatchEvent(new PointerEvent('pointerover', {bubbles: true}));
      await settle();
      const hovered = three().querySelectorAll('button').length;
      const hoveredNodes = count(three());
      const same = three() === before;
      t.querySelector('tbody tr[data-row-id="5"] td[data-key="owner"]').dispatchEvent(new PointerEvent('pointerover', {bubbles: true}));
      await settle();
      const left = three().querySelectorAll('button').length;
      const leftNodes = count(three());
      const menus = three().querySelectorAll('[data-sf-row-menu]').length;
      // Focus into row 6: its buttons come in, the focus stays on the link.
      const link = t.querySelector('tbody tr[data-row-id="6"] .sf-table-title-link');
      link?.focus();
      await settle();
      const focus = {kept: document.activeElement === link && link.isConnected,
        buttons: t.querySelectorAll('tbody tr[data-row-id="6"] button').length};
      return {draw8, window1000, drawn, nodes, actionCells, hovered, hoveredNodes, same, left, leftNodes, menus, focus};
    }, {COLUMNS, R8: rows(8), R1000: rows(1000)});
    const where = scheme;
    if (read.draw8 > 12) failures.push(`${where}: a draw of 8 rows read the column settings ${read.draw8} times`);
    if (read.window1000 > 12) failures.push(`${where}: a window of ${read.drawn} rows read the column settings ${read.window1000} times`);
    if (read.nodes !== ROW_NODES || read.actionCells !== 0) failures.push(`${where}: an idle row is ${read.nodes} nodes, «Действия» cells ${read.actionCells}`);
    if (!read.same || read.hoveredNodes !== read.leftNodes || read.hovered !== read.left) failures.push(`${where}: the pointer drew into the row: ${read.hovered}/${read.left} buttons, ${read.hoveredNodes}/${read.leftNodes} nodes (row kept: ${read.same})`);
    if (read.menus !== 1) failures.push(`${where}: the row has ${read.menus} ≡ menus`);
    if (!read.focus.kept || read.focus.buttons !== read.left) failures.push(`${where}: focus into a row: ${JSON.stringify(read.focus)}`);
    if (errors.length) failures.push(`${where}: console ${errors.slice(0, 3).join(' | ')}`);
    await context.close();
  }
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`table row cost: the column settings read once a draw, an idle row ${ROW_NODES} nodes, no «Действия» column, the pointer and the focus draw nothing into a row`);
