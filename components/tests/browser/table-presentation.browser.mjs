#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Reads the built bytes and measures what the source contracts cannot see: the
// colours a row actually resolves to, and where the resize guide lands.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css',
  // Utilities hold the layout of the table's own regions; without them the
  // scroll area has no size and every measurement below collapses to zero.
  'core/core/css/utility.full.css',
  'component/component/tables/css/tables.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
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

const fill = async (page, columns, rows) => page.evaluate(async ([columns, rows]) => {
  const table = document.getElementById('t');
  table.setColumns?.(columns);
  table.setRows?.(rows);
  await new Promise((done) => setTimeout(done, 250));
}, [columns, rows]);

try {
  // 1. A sorted column is answered in its header: the label takes the primary
  // role and a mark sits under the header. The cells of that column keep the
  // background every other column has.
  const sorted = await open('<sf-table id="t" toolbar="false" settings="false"></sf-table>');
  await fill(sorted, [{key: 'name', label: 'Name', sortable: true}, {key: 'city', label: 'City'}], [
    {id: 'a', name: 'A', city: 'X'},
    {id: 'b', name: 'B', city: 'Y'},
  ]);
  const sortLook = await sorted.evaluate(async () => {
    const table = document.getElementById('t');
    const read = (element, property) => getComputedStyle(element).getPropertyValue(property);
    const head = () => table.querySelector('th[data-key="name"]');
    const before = {
      ariaSort: head().getAttribute('aria-sort'),
      label: read(head().querySelector('.sf-table-sort-button'), 'color'),
      mark: getComputedStyle(head(), '::after').backgroundColor,
    };
    head().querySelector('.sf-table-sort-button')?.click();
    await new Promise((done) => setTimeout(done, 250));
    const cell = (key) => table.querySelector(`tbody tr td[data-key="${key}"]`) ?? table.querySelector('tbody tr td');
    const primary = read(document.documentElement, '--sf-primary').trim();
    return {
      before,
      ariaSort: head().getAttribute('aria-sort'),
      label: read(head().querySelector('.sf-table-sort-button'), 'color'),
      markColor: getComputedStyle(head(), '::after').backgroundColor,
      markHeight: getComputedStyle(head(), '::after').blockSize,
      primaryToken: primary,
      sortedCell: getComputedStyle(cell('name')).backgroundColor,
      plainCell: getComputedStyle(cell('city')).backgroundColor,
    };
  });
  // The token is declared as a colour, so the resolved label colour is the
  // comparison that holds: a hard-coded blue would pass a name check.
  const asRgb = async (token) => sorted.evaluate((token) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
  const primaryRgb = await asRgb('--sf-primary');
  if (sortLook.ariaSort === sortLook.before.ariaSort) {
    note({case: 'sort', ariaSort: sortLook.ariaSort, expected: 'the header announces the new direction'});
  }
  if (sortLook.label !== primaryRgb) {
    note({case: 'sorted label', got: sortLook.label, expected: primaryRgb});
  }
  if (sortLook.markColor !== primaryRgb) {
    note({case: 'sorted mark', got: sortLook.markColor, expected: primaryRgb});
  }
  if (sortLook.markHeight !== '2px') {
    note({case: 'sorted mark height', got: sortLook.markHeight, expected: '2px, two steps of the size scale'});
  }
  if (sortLook.sortedCell !== sortLook.plainCell) {
    note({case: 'sorted column cells', got: sortLook.sortedCell, plain: sortLook.plainCell, expected: 'the same background as every other column'});
  }
  await sorted.close();

  // 2. Hover, selection and selected-hover each resolve to their own colour,
  // and selection reads from the row rather than from the checkbox in a cell.
  const rows = await open('<sf-table id="t" toolbar="false" settings="false" selectable="true"></sf-table>');
  await fill(rows, [{key: 'name', label: 'Name'}], [{id: 'a', name: 'A'}, {id: 'b', name: 'B'}]);
  // The state is a tint over the row's surface, because every state colour here
  // is an alpha colour and a pinned cell has to inherit the layers rather than
  // a flattened result. So the tint is read from the row's background-image.
  const states = await rows.evaluate(async () => {
    const table = document.getElementById('t');
    const row = (index) => table.querySelectorAll('tbody tr')[index];
    const tint = (element) => getComputedStyle(element).backgroundImage;
    const resting = tint(row(1));
    const data = table.getTableData?.().rows ?? [];
    if (data[0]?.select?.component?.props) data[0].select.component.props.checked = true;
    table.setRows?.(data.map((record) => ({...record})));
    await new Promise((done) => setTimeout(done, 250));
    const selectedRow = table.querySelector('tbody tr[data-selected]');
    return {
      resting,
      marked: Boolean(selectedRow),
      selected: selectedRow ? tint(selectedRow) : null,
      surface: selectedRow ? getComputedStyle(selectedRow).backgroundColor : null,
    };
  });
  if (!states.marked) {
    note({case: 'selected row', expected: 'the row carries data-selected'});
  }
  if (states.resting !== 'none') {
    note({case: 'resting row', got: states.resting, expected: 'no tint at rest'});
  }
  if (states.selected === states.resting) {
    note({case: 'selected row', got: states.selected, expected: 'a tint of its own'});
  }
  const containerRgb = await rows.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--sf-primary-container)';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  if (states.selected && !states.selected.includes(containerRgb)) {
    note({case: 'selected row role', got: states.selected, expected: `${containerRgb} (--sf-primary-container)`});
  }
  const surfaceRgb = await rows.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--sf-surface-0)';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  if (states.surface !== surfaceRgb) {
    note({case: 'selected row', got: states.surface, expected: `an opaque surface under the tint (${surfaceRgb})`});
  }
  // Hover is measured with a real pointer: a forced class would not prove the
  // rule applies to the row under it.
  await rows.hover('tbody tr:nth-child(2) td');
  await rows.waitForTimeout(120);
  const hovered = await rows.evaluate(() => getComputedStyle(document.querySelectorAll('tbody tr')[1]).backgroundImage);
  if (hovered === states.resting) {
    note({case: 'row hover', got: hovered, expected: 'a container tint while the pointer is on the row'});
  }
  await rows.close();

  // 2b. A pinned cell is painted exactly like the rest of its row. The state
  // colours are alpha colours, so a pinned cell that inherited one flattened
  // result painted the tint a second time and came out a shade darker — which
  // is what the consumer saw on a hovered row. Both layers are compared,
  // because that is where the difference lived.
  const pinnedRow = await open('<div style="width:600px"><sf-table id="t" toolbar="false"></sf-table></div>');
  await fill(
    pinnedRow,
    [{key: 'name', label: 'Name', role: 'title', width: 200}, {key: 'city', label: 'City', width: 200}, {key: 'extra', label: 'Extra', width: 200}],
    [{id: 'a', name: 'A', city: 'X', extra: 'E'}, {id: 'b', name: 'B', city: 'Y', extra: 'F'}],
  );
  await pinnedRow.hover('tbody tr:nth-child(1) td[data-key="city"]');
  await pinnedRow.waitForTimeout(150);
  const layers = await pinnedRow.evaluate(() => {
    const row = document.querySelector('#t tbody tr');
    const read = (cell) => {
      const style = getComputedStyle(cell);
      return `${style.backgroundColor}|${style.backgroundImage}`;
    };
    const pinned = row.querySelector('td[data-key="name"]');
    const loose = row.querySelector('td[data-key="city"]');
    return {
      pinnedIsPinned: pinned.hasAttribute('data-sf-pinned'),
      looseIsPinned: loose.hasAttribute('data-sf-pinned'),
      pinned: read(pinned),
      loose: read(loose),
      row: read(row),
    };
  });
  if (!layers.pinnedIsPinned || layers.looseIsPinned) {
    note({case: 'pinned hover', got: layers, expected: 'the title cell pinned and the loose one not'});
  }
  if (layers.pinned !== layers.row) {
    note({case: 'pinned hover', pinned: layers.pinned, row: layers.row, expected: 'both layers of the row, inherited'});
  }
  if (!/linear-gradient/u.test(layers.row)) {
    note({case: 'pinned hover', row: layers.row, expected: 'a hover tint over the row surface'});
  }
  await pinnedRow.close();

  // 3. The guide runs from the bottom of the head to the end of the body, on
  // the edge of the column being resized. Only the page can say this: the
  // position is computed from boxes that do not exist in the source.
  const guided = await open('<div style="width:600px"><sf-table id="t" toolbar="false" settings="false"></sf-table></div>');
  await fill(guided, [{key: 'name', label: 'Name'}, {key: 'city', label: 'City'}], [
    {id: 'a', name: 'A', city: 'X'},
    {id: 'b', name: 'B', city: 'Y'},
    {id: 'c', name: 'C', city: 'Z'},
  ]);
  const placed = await guided.evaluate(async () => {
    const table = document.getElementById('t');
    const head = table.querySelector('th[data-key="name"]');
    const guide = table.querySelector('.sf-table-resize-guide');
    if (!guide) return {missing: true};
    const hiddenAtRest = guide.hidden;
    table.showColumnResizeGuide?.(head);
    await new Promise((done) => setTimeout(done, 60));
    const box = guide.getBoundingClientRect();
    const headBox = table.querySelector('thead').getBoundingClientRect();
    const bodyBox = table.querySelector('tbody').getBoundingClientRect();
    const edge = head.getBoundingClientRect().right;
    // Read the shown state before taking the guide away again: the measurement
    // and the state have to come from the same moment.
    const shown = !guide.hidden;
    table.hideColumnResizeGuide?.();
    await new Promise((done) => setTimeout(done, 60));
    return {
      hiddenAtRest,
      shown,
      width: box.width,
      top: box.top,
      height: box.height,
      headBottom: headBox.bottom,
      bodyHeight: bodyBox.height,
      edge,
      left: box.left,
      colour: getComputedStyle(guide).backgroundColor,
      hiddenAfter: guide.hidden,
    };
  });
  if (placed.missing) {
    note({case: 'resize guide', expected: 'one guide element in the scroll area'});
  } else {
    if (!placed.hiddenAtRest) note({case: 'resize guide', expected: 'away until a column edge is addressed'});
    if (!placed.shown) note({case: 'resize guide', expected: 'shown while the edge is addressed'});
    if (!placed.hiddenAfter) note({case: 'resize guide', expected: 'taken away again'});
    if (Math.round(placed.width) !== 1) {
      note({case: 'guide width', got: placed.width, expected: '1px'});
    }
    if (Math.abs(placed.top - placed.headBottom) > 2) {
      note({case: 'guide top', got: placed.top, expected: `the bottom of the head (${placed.headBottom})`});
    }
    if (Math.abs(placed.height - placed.bodyHeight) > 2) {
      note({case: 'guide height', got: placed.height, expected: `the height of the body (${placed.bodyHeight})`});
    }
    if (Math.abs(placed.left - placed.edge) > 2) {
      note({case: 'guide position', got: placed.left, expected: `the edge of the column (${placed.edge})`});
    }
    const outlineVariant = await guided.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--sf-outline-variant)';
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });
    if (placed.colour !== outlineVariant) {
      note({case: 'guide colour', got: placed.colour, expected: `${outlineVariant} (--sf-outline-variant)`});
    }
  }
  await guided.close();

  // 4. The sticky head is opaque: rows must not read through its labels while
  // they scroll under it. Only the page can answer this — the colour came from
  // a custom property nothing defined, and a transparent head looks correct
  // until the table rests on a surface of another colour.
  const headed = await open(
    `<div style="height:400px;background:#ff00ff">
       <sf-table id="t" toolbar="false" settings="false"></sf-table>
     </div>`,
  );
  await fill(headed, [{key: 'name', label: 'Name'}], Array.from({length: 30}, (_, index) => ({id: String(index), name: `Row ${index}`})));
  const paint = await headed.evaluate(async () => {
    const table = document.getElementById('t');
    const area = table.querySelector('.sf-table-scroll');
    area.style.maxBlockSize = '240px';
    await new Promise((done) => setTimeout(done, 120));
    area.scrollTop = 200;
    await new Promise((done) => setTimeout(done, 120));
    const cell = table.querySelector('thead th');
    const probe = document.createElement('span');
    probe.style.color = 'var(--sf-surface-0)';
    document.body.append(probe);
    const surface = getComputedStyle(probe).color;
    probe.remove();
    return {
      head: getComputedStyle(cell).backgroundColor,
      surface,
      scrolled: area.scrollTop > 0,
      stuck: Math.round(cell.getBoundingClientRect().top - area.getBoundingClientRect().top),
    };
  });
  if (!paint.scrolled) {
    note({case: 'head paint', expected: 'an area that scrolls, so the test means something'});
  }
  if (paint.head !== paint.surface) {
    note({case: 'head paint', got: paint.head, expected: `${paint.surface} (--sf-surface-0)`});
  }
  if (/rgba\(.+,\s*0\)/u.test(paint.head)) {
    note({case: 'head paint', got: paint.head, expected: 'an opaque head'});
  }
  if (Math.abs(paint.stuck) > 2) {
    note({case: 'head position', got: paint.stuck, expected: 'held at the top of the scrolled area'});
  }
  await headed.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('TABLE_PRESENTATION_OK');
