#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Reads the built bytes and checks the four defects Larena reported in the data
// view table, on the page rather than in the source.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css',
  // The head is held by utilities — `sticky`, `top-0`, `z-5` — and they live
  // outside core.css. Two earlier versions of this check loaded too little and
  // the head came out `position: static`, then `sticky` with `top: auto`; both
  // times the page-mode case looked like a failure of the fix rather than of
  // the check. The full utility sheet is what a page actually has.
  'core/core/css/utility.full.css',
  'component/component/tables/css/tables.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
  'smart/smart/sortable/css/sortable.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/sortable/js/sortable.js',
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
  await page.waitForTimeout(700);
  return page;
};

try {
  // 1. The resize handle is recognised: the element answers for it, which is
  // what pointerdown relies on.
  const page = await open('<sf-table id="t" toolbar="false" settings="false"></sf-table>');
  const recognised = await page.evaluate(() => {
    const table = document.getElementById('t');
    const handle = document.createElement('div');
    handle.setAttribute('data-sf-column-resizer', 'name');
    const inner = document.createElement('span');
    handle.append(inner);
    document.body.append(handle);
    const found = table.getColumnResizeHandle?.(inner);
    handle.remove();
    return {handleFromChild: found === handle};
  });
  if (!recognised.handleFromChild) note({case: 'resize handle', expected: 'found from a child of the handle'});

  // 1b. A drag that starts on the handle resizes and does not move the column:
  // the heading row's sortable (SF.Sortable.attach) is refused the start.
  const grabbed = await open('<div style="width:900px"><sf-table id="m" toolbar="false" settings="false"></sf-table></div>');
  const grip = await grabbed.evaluate(async () => {
    const table = document.getElementById('m');
    table.setColumns?.([
      {key: 'code', label: 'Code', width: 200},
      {key: 'city', label: 'City', width: 200},
      {key: 'zone', label: 'Zone', width: 200},
    ]);
    table.setRows?.([{id: '1', code: 'C', city: 'X', zone: 'Z'}]);
    await new Promise((done) => setTimeout(done, 400));
    const handle = table.querySelector('thead th[data-key="code"] [data-sf-column-resizer]');
    const box = handle?.getBoundingClientRect();
    return box ? {x: box.left + box.width / 2, y: box.top + box.height / 2} : null;
  });
  if (!grip) {
    note({case: 'resize handle', expected: 'a handle on the Code heading'});
  } else {
    const order = () => grabbed.evaluate(() => [...document.querySelectorAll('#m thead th')].map((cell) => cell.dataset.key).join(','));
    const before = await order();
    await grabbed.mouse.move(grip.x, grip.y);
    await grabbed.mouse.down();
    let moving = false;
    for (let step = 1; step <= 10; step += 1) {
      await grabbed.mouse.move(grip.x + step * 30, grip.y + 2);
      moving ||= await grabbed.evaluate(() => document.documentElement.hasAttribute('data-sf-sortable-active'));
    }
    await grabbed.mouse.up();
    await grabbed.waitForTimeout(400);
    if (moving || (await order()) !== before) note({case: 'resize handle', expected: 'the move handler steps aside'});
  }
  await grabbed.close();

  // 2. Appending keeps the rows that are already there, with their checked state.
  const kept = await page.evaluate(async () => {
    const table = document.getElementById('t');
    table.setColumns?.([{key: 'name', label: 'Name'}]);
    table.setRows?.([{id: 'a', name: 'A'}, {id: 'b', name: 'B'}]);
    await new Promise((done) => setTimeout(done, 100));
    const rows = table.getTableData?.().rows ?? [];
    const first = rows[0];
    if (first?.select?.component?.props) first.select.component.props.checked = true;
    table.addRows?.([{id: 'c', name: 'C'}]);
    await new Promise((done) => setTimeout(done, 100));
    return {
      ids: (table.getTableData?.().rows ?? []).map((row) => row.id),
      selected: table.getSelectedRecordIds?.() ?? [],
    };
  });
  if (String(kept.ids) !== String(['a', 'b', 'c'])) note({case: 'show more', ids: kept.ids, expected: 'a, b, c'});
  if (String(kept.selected) !== String(['a'])) note({case: 'selection', selected: kept.selected, expected: 'the checked row survives'});
  await page.close();

  // 3. The head stays visible while the page scrolls, in page mode only.
  for (const [mode, shouldStay] of [['page', true], ['self', false]]) {
    const scrolled = await open(
      `<div style="height:200px"></div>
       <sf-table id="t" toolbar="false" settings="false" vertical-scroll="${mode}"></sf-table>
       <div style="height:1500px"></div>`,
    );
    const top = await scrolled.evaluate(async () => {
      const table = document.getElementById('t');
      table.setColumns?.([{key: 'name', label: 'Name'}]);
      table.setRows?.(Array.from({length: 40}, (_, index) => ({id: String(index), name: `Row ${index}`})));
      await new Promise((done) => setTimeout(done, 200));
      window.scrollTo(0, 600);
      await new Promise((done) => setTimeout(done, 120));
      const head = table.querySelector('thead');
      return head ? Math.round(head.getBoundingClientRect().top) : null;
    });
    if (top === null) {
      note({case: `head in ${mode} mode`, expected: 'a rendered head'});
    } else if (shouldStay && !(top >= -1 && top < 200)) {
      note({case: 'head in page mode', top, expected: 'held near the top of the viewport'});
    } else if (!shouldStay && top >= -1) {
      note({case: 'head in self mode', top, expected: 'left with the page, as before'});
    }
    await scrolled.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('TABLE_DEFECTS_OK');
