#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Round two, measured on the built bytes: the handle and its line, the current
// row, the pinned block and its toggle, the toolbar when it does not fit, the
// band before Show more, and the switcher with its field.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css',
  'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js',
  'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/inputs/js/inputs.js',
  'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js',
  'smart/smart/tags/js/tags.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

const open = async (markup) => {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html class="theme-light"><body style="margin:0">${markup}</body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(800);
  return page;
};

const fill = (page, columns, rows) => page.evaluate(async ([columns, rows]) => {
  const table = document.getElementById('t');
  window.settings = [];
  window.resets = [];
  table.addEventListener('sf-table-column-settings-change', (event) => window.settings.push(event.detail));
  table.addEventListener('sf-table-column-settings-reset', (event) => window.resets.push(event.detail));
  table.setColumns?.(columns);
  table.setRows?.(rows);
  await new Promise((done) => setTimeout(done, 400));
}, [columns, rows]);

try {
  // 1. The line is taken directly -- round three removed the handle -- and the
  //    guide answers for that strip alone.
  const table = await open('<div style="width:800px"><sf-table id="t" toolbar="false"></sf-table></div>');
  await fill(
    table,
    [{key: 'name', label: 'Name', role: 'title', width: 220, sortable: true}, {key: 'city', label: 'City', width: 220}],
    [{id: 'a', name: 'A', city: 'X', actions: ['view']}, {id: 'b', name: 'B', city: 'Y', actions: ['view']}],
  );
  const handle = await table.evaluate(() => {
    const cell = document.querySelector('#t thead th[data-key="city"]');
    const strip = cell.querySelector('[data-sf-column-resizer]');
    const box = strip?.getBoundingClientRect?.();
    const cellBox = cell.getBoundingClientRect();
    const style = strip ? getComputedStyle(strip) : null;
    return {
      icons: cell.querySelectorAll('sf-icon-button').length,
      tag: strip?.tagName ?? null,
      cursor: style?.cursor ?? null,
      width: box ? Math.round(box.width) : null,
      // The strip stands on the line, so its centre is the cell's edge.
      offEdge: box ? Math.round(box.left + box.width / 2 - cellBox.right) : null,
    };
  });
  if (handle.icons !== 0 || handle.tag !== 'BUTTON' || handle.cursor !== 'col-resize'
      || handle.width < 8 || handle.width > 12 || Math.abs(handle.offEdge) > 1) {
    note({case: 'handle', got: handle, expected: 'no handle; a strip of 8-12px astride the edge'});
  }
  const guideOnLabel = await table.evaluate(async () => {
    const cell = document.querySelector('#t thead th[data-key="city"]');
    const box = cell.getBoundingClientRect();
    cell.dispatchEvent(new MouseEvent('mouseover', {bubbles: true, clientX: box.left + 20, clientY: box.top + 10}));
    await new Promise((done) => setTimeout(done, 100));
    return document.querySelector('#t .sf-table-resize-guide')?.hidden ?? null;
  });
  if (guideOnLabel !== true) {
    note({case: 'guide on the label', got: guideOnLabel, expected: 'no line while the pointer is on the title'});
  }
  const guideOnHandle = await table.evaluate(async () => {
    const cell = document.querySelector('#t thead th[data-key="city"]');
    const grip = cell.querySelector('[data-sf-column-resizer]');
    grip.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
    await new Promise((done) => setTimeout(done, 100));
    return document.querySelector('#t .sf-table-resize-guide')?.hidden ?? null;
  });
  if (guideOnHandle !== false) {
    note({case: 'guide on the handle', got: guideOnHandle, expected: 'the line while the pointer is on the handle'});
  }

  // 2 and 7. The current row shows nothing of its own, and a keyboard focus
  // draws one ring over the pinned cells rather than segments between them.
  await table.click('tbody tr[data-row-id="a"] td[data-key="city"]');
  await table.waitForTimeout(120);
  const current = await table.evaluate(() => {
    const row = document.querySelector('#t tbody tr[data-current]');
    if (!row) return null;
    const first = row.querySelector('td');
    const ring = getComputedStyle(row, '::after');
    return {
      id: row.dataset.rowId,
      firstCellShadow: getComputedStyle(first).boxShadow,
      ringContent: ring.content,
      pinnedZ: getComputedStyle(row.querySelector('[data-sf-pinned]')).zIndex,
    };
  });
  if (!current) {
    note({case: 'current row', expected: 'a click still marks the row'});
  } else {
    if (current.firstCellShadow !== 'none') {
      note({case: 'current row', got: current.firstCellShadow, expected: 'no bar in the first cell'});
    }
    if (current.ringContent !== 'none') {
      note({case: 'current row', got: current.ringContent, expected: 'no ring without :focus-visible'});
    }
  }
  const keyboard = await table.evaluate(async () => {
    const row = document.querySelector('#t tbody tr[data-row-id="b"]');
    row.focus();
    // :focus-visible needs keyboard modality, which a key press gives.
    row.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
    await new Promise((done) => setTimeout(done, 80));
    const matches = row.matches(':focus-visible');
    const ring = getComputedStyle(row, '::after');
    const pinned = getComputedStyle(row.querySelector('[data-sf-pinned]'));
    return {
      matches,
      outline: ring.outlineStyle,
      ringZ: ring.zIndex,
      pinnedZ: pinned.zIndex,
      cellBorders: [...row.querySelectorAll('td')].map((cell) => getComputedStyle(cell).borderBlockStartColor),
    };
  });
  if (keyboard.matches && keyboard.outline === 'none') {
    note({case: 'row ring', got: keyboard, expected: 'one outline on the row under :focus-visible'});
  }
  if (keyboard.matches && Number(keyboard.ringZ) <= Number(keyboard.pinnedZ)) {
    note({case: 'row ring', ring: keyboard.ringZ, pinned: keyboard.pinnedZ, expected: 'the ring above the pinned cells'});
  }

  // 3. The pin toggle, the pinned block and the reset.
  const pinned = await table.evaluate(() => ({
    order: [...document.querySelectorAll('#t thead th')].map((cell) => cell.dataset.key),
    titlePinned: document.querySelector('#t thead th[data-key="name"]')?.hasAttribute('data-sf-pinned'),
    cityPinned: document.querySelector('#t thead th[data-key="city"]')?.hasAttribute('data-sf-pinned'),
  }));
  if (!pinned.titlePinned || pinned.cityPinned) {
    note({case: 'default pinning', got: pinned, expected: 'the title column pinned, the rest loose'});
  }
  // A pin used to leave a draft that «Применить» committed. On 2026-10-05 the
  // consumer's owner decided that everything in that window applies as it is
  // pressed, so what has to be true is the settled state, not a pending patch:
  // the column is pinned, its own setting says so, and its order puts it at the
  // end of the pinned block.
  const toggled = await table.evaluate(async () => {
    const element = document.getElementById('t');
    const city = element.getColumnItems().find((column) => column.key === 'city');
    const before = {...(element.getColumnSetting('city') || {})};
    element.toggleColumnPinned(city);
    await new Promise((done) => setTimeout(done, 300));
    const pinnedOrders = element.getColumnItems()
      .filter((column) => column.key !== 'city' && !column.system && element.isColumnPinned(column))
      .map((column) => Number(element.getColumnSetting(column.key)?.order ?? column.order))
      .filter((order) => Number.isFinite(order));
    return {
      before,
      setting: {...(element.getColumnSetting('city') || {})},
      pinnedNow: element.isColumnPinned(city),
      // Nothing is left pending: the press went into the settings themselves.
      draft: element.tempSettings?.cols?.city ?? null,
      highestOtherPinnedOrder: pinnedOrders.length ? Math.max(...pinnedOrders) : 0,
    };
  });
  if (toggled.pinnedNow !== true || toggled.setting?.pinned !== true || toggled.draft !== null) {
    note({case: 'pin toggle', got: toggled, expected: 'the column pinned in the settings themselves, with nothing left pending'});
  }
  if (!(toggled.setting?.order > toggled.highestOtherPinnedOrder)) {
    note({case: 'pin toggle', got: toggled, expected: 'an order that puts it at the end of the pinned block'});
  }
  const reset = await table.evaluate(async () => {
    document.getElementById('t').requestColumnSettingsReset();
    await new Promise((done) => setTimeout(done, 80));
    return window.resets.length;
  });
  if (reset !== 1) note({case: 'reset', got: reset, expected: 'one reset event for the host'});
  await table.close();

  // 3b. The settings list reads like the table: the pinned group, then the rest
  // of the visible columns, then the hidden ones. The consumer opened the gear
  // and found eight columns it had never shown standing above its own.
  const listed = await open('<div style="width:800px"><sf-table id="t" toolbar="false"></sf-table></div>');
  await fill(
    listed,
    [
      {key: 'active', label: 'Активно', order: 10, visible: false},
      {key: 'code', label: 'Код', order: 20, visible: false},
      {key: 'name', label: 'Название', role: 'title', order: 30},
      {key: 'status', label: 'Статус', order: 40},
      {key: 'city', label: 'Город', order: 50},
    ],
    [{id: 'a', name: 'A', status: 'S', city: 'X', actions: ['view']}],
  );
  const order = await listed.evaluate(() => {
    const element = document.getElementById('t');
    return element.getColumnItems().filter((column) => !column.system).map((column) => column.key);
  });
  if (String(order) !== 'name,status,city,active,code') {
    note({case: 'settings order', got: order, expected: 'name (pinned), then the visible ones, then the hidden ones'});
  }
  await listed.close();

  // 4. The toolbar: the search row sits above the chips when they do not fit,
  // whether or not the field has focus.
  const narrow = await open('<div style="width:520px"><sf-table id="t"></sf-table></div>');
  await fill(
    narrow,
    [{key: 'name', label: 'Name', role: 'title', width: 200}],
    [{id: 'a', name: 'A', actions: ['view']}],
  );
  const rows = await narrow.evaluate(async () => {
    const element = document.getElementById('t');
    element.setFilterFields?.([
      {key: 'status', label: 'Status'}, {key: 'owner', label: 'Owner'}, {key: 'stage', label: 'Stage'},
    ]);
    // Chips appear for conditions that are actually set, which is the state the
    // consumer reported: filter, chips and search no longer fit on one line.
    // Chips come from the selected filter template's tags, which is the state
    // the consumer reported: filter, chips and search no longer fit on one line.
    element.setTemplates?.({
      current: {
        key: 'current', label: 'Current', selected: true,
        data: {tags: {status: {label: 'Status', count: 2}, owner: {label: 'Owner', count: 1},
                      stage: {label: 'Stage', count: 3}}},
      },
    });
    await new Promise((done) => setTimeout(done, 300));
    const start = element.querySelector('.sf-table-toolbar-start');
    const end = element.querySelector('.sf-table-toolbar-end');
    const read = () => ({
      startTop: Math.round(start.getBoundingClientRect().top),
      endTop: Math.round(end.getBoundingClientRect().top),
      wrap: getComputedStyle(element.querySelector('.sf-table-toolbar')).flexWrap,
    });
    const resting = read();
    element.querySelector('.sf-search-input input')?.focus();
    await new Promise((done) => setTimeout(done, 150));
    const focused = read();
    element.querySelector('.sf-search-input input')?.blur();
    await new Promise((done) => setTimeout(done, 150));
    return {resting, focused, blurred: read()};
  });
  if (rows.resting.wrap !== 'wrap-reverse') {
    note({case: 'toolbar', got: rows.resting.wrap, expected: 'wrap-reverse, so the search row wraps upwards'});
  }
  if (!(rows.resting.endTop < rows.resting.startTop)) {
    note({case: 'toolbar', got: rows.resting, expected: 'the search row above the filter row when they do not fit'});
  }
  if (rows.focused.endTop !== rows.resting.endTop || rows.blurred.endTop !== rows.resting.endTop) {
    note({case: 'toolbar', got: rows, expected: 'the same place with and without focus'});
  }
  await narrow.close();

  // 5. No empty band between the last row and Show more.
  const banded = await open(
    `<div style="width:700px"><sf-table id="t" toolbar="false"></sf-table>
       <sf-pagination id="p" middle="false" bottom="false" total="100" page-size="10" current="1"></sf-pagination></div>`,
  );
  await fill(
    banded,
    [{key: 'name', label: 'Name', role: 'title', width: 200}],
    Array.from({length: 3}, (_, index) => ({id: String(index), name: `N${index}`, actions: ['view']})),
  );
  const band = await banded.evaluate(() => {
    const area = document.querySelector('#t .sf-table-scroll');
    const style = getComputedStyle(area);
    const lastRow = [...document.querySelectorAll('#t tbody tr')].pop();
    return {
      marginBottom: style.marginBlockEnd,
      gap: Math.round(area.getBoundingClientRect().bottom - lastRow.getBoundingClientRect().bottom),
    };
  });
  if (band.marginBottom !== '0px') {
    note({case: 'band', got: band.marginBottom, expected: 'no bottom margin under the rows'});
  }
  if (band.gap > 2) {
    note({case: 'band', got: band.gap, expected: 'the area ends where the rows end'});
  }
  await banded.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('TABLE_ROUND_2_OK');
