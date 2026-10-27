#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Measures on the built bytes what the source contracts cannot see: where the
// pinned cells actually land, what a click, a Shift-click and a double click
// really do, and what the page switcher and the bulk panel render.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css',
  'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'component/component/inputs/css/inputs.css',
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
  'smart/smart/input/js/input.js',
  'smart/smart/spinner/js/spinner.js',
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

const rows = (count, {open: canOpen = true} = {}) => Array.from({length: count}, (_, index) => ({
  id: String(index + 1),
  name: `Row ${index + 1}`,
  city: `City ${index + 1}`,
  actions: canOpen ? ['view', 'edit'] : ['edit'],
}));

try {
  // 1. A click makes a row current without marking it; a double click asks the
  // host to open the record, and only when the row offers the view action.
  const table = await open('<div style="width:700px"><sf-table id="t" toolbar="false"></sf-table></div>');
  await table.evaluate(async (records) => {
    const element = document.getElementById('t');
    window.intents = [];
    element.addEventListener('sf-table-action-intent', (event) => window.intents.push(event.detail));
    element.setColumns?.([
      {key: 'name', label: 'Name', role: 'title', sortable: true},
      {key: 'city', label: 'City'},
    ]);
    element.setRows?.(records);
    await new Promise((done) => setTimeout(done, 300));
  }, [...rows(4), {id: '5', name: 'Row 5', city: 'City 5', actions: ['edit']}]);

  // A cell other than the title: the title is a link that opens the record
  // with one click since 2026-10-14.
  await table.click('tbody tr[data-row-id="2"] td[data-key="city"]');
  await table.waitForTimeout(120);
  const afterClick = await table.evaluate(() => {
    const element = document.getElementById('t');
    return {
      current: [...element.querySelectorAll('tbody tr[data-current]')].map((row) => row.dataset.rowId),
      selected: element.getSelectedRecordIds?.() ?? [],
      focused: document.activeElement?.dataset?.rowId ?? null,
      intents: window.intents.length,
    };
  });
  if (String(afterClick.current) !== '2') note({case: 'click', got: afterClick.current, expected: 'row 2 is the current one'});
  if (afterClick.selected.length) note({case: 'click', selected: afterClick.selected, expected: 'a click marks nothing'});
  if (afterClick.focused !== '2') note({case: 'click', focused: afterClick.focused, expected: 'the row takes focus'});
  if (afterClick.intents) note({case: 'click', expected: 'no intent from a single click'});

  await table.dblclick('tbody tr[data-row-id="3"] td[data-key="city"]');
  await table.waitForTimeout(150);
  await table.dblclick('tbody tr[data-row-id="5"] td[data-key="city"]');
  await table.waitForTimeout(150);
  await table.dblclick('tbody tr[data-row-id="4"] td[data-key="select"]');
  await table.waitForTimeout(150);
  const opened = await table.evaluate(() => ({
    intents: window.intents.map((detail) => ({action: detail.action_id, ids: [...detail.record_ids]})),
    selection: String(window.getSelection?.() ?? ''),
  }));
  if (JSON.stringify(opened.intents) !== JSON.stringify([{action: 'view', ids: ['3']}])) {
    note({case: 'double click', got: opened.intents, expected: 'one view intent, for row 3 only'});
  }
  if (opened.selection.trim()) {
    note({case: 'double click', selection: opened.selection.slice(0, 40), expected: 'no text selected by the double click'});
  }

  // 2. Shift and the box mark a range, in both directions, and the page box
  // answers for what the rows say.
  const ranged = await table.evaluate(async () => {
    const element = document.getElementById('t');
    const box = (id) => element.querySelector(`tbody tr[data-row-id="${id}"] td[data-key="select"] input[type="checkbox"]`)
      ?? element.querySelector(`tbody tr[data-row-id="${id}"] td[data-key="select"] sf-checkbox`);
    const press = (id, shift) => {
      const target = box(id);
      target.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, composed: true, shiftKey: shift}));
      target.click();
    };
    press('2', false);
    await new Promise((done) => setTimeout(done, 150));
    press('4', true);
    await new Promise((done) => setTimeout(done, 250));
    return {
      marked: element.getSelectedRecordIds?.() ?? [],
      attribute: [...element.querySelectorAll('tbody tr[data-selected]')].map((row) => row.dataset.rowId),
    };
  });
  if (String(ranged.marked) !== '2,3,4') {
    note({case: 'shift range', got: ranged.marked, expected: 'rows 2 to 4 marked'});
  }
  if (String(ranged.attribute) !== '2,3,4') {
    note({case: 'shift range', got: ranged.attribute, expected: 'the rows say so themselves'});
  }

  // 3. The pinned block: the box, the row menu and the title column, placed
  // from measured widths, holding their place while the rows scroll sideways.
  const pinned = await table.evaluate(async () => {
    const element = document.getElementById('t');
    element.setColumns?.([
      {key: 'name', label: 'Name', role: 'title', width: 240},
      {key: 'city', label: 'City', width: 240},
      {key: 'extra', label: 'Extra', width: 240},
      {key: 'more', label: 'More', width: 240},
    ]);
    await new Promise((done) => setTimeout(done, 300));
    const area = element.querySelector('.sf-table-scroll');
    const head = (key) => element.querySelector(`thead th[data-key="${key}"]`);
    const read = (key) => {
      const cell = head(key);
      return cell && {
        position: getComputedStyle(cell).position,
        offset: getComputedStyle(cell).insetInlineStart,
        left: Math.round(cell.getBoundingClientRect().left),
      };
    };
    const widths = ['select', 'settings'].map((key) => head(key)?.getBoundingClientRect().width ?? 0);
    area.scrollLeft = 300;
    await new Promise((done) => setTimeout(done, 200));
    const areaLeft = Math.round(area.getBoundingClientRect().left);
    return {
      select: read('select'),
      settings: read('settings'),
      title: read('name'),
      loose: read('city'),
      widths: widths.map((value) => Math.round(value)),
      areaLeft,
      scrolled: area.hasAttribute('data-sf-pin-scrolled'),
      edge: [...element.querySelectorAll('[data-sf-pin-edge]')].map((cell) => cell.dataset.key).slice(0, 2),
      scrollLeft: area.scrollLeft,
    };
  });
  for (const key of ['select', 'settings', 'title']) {
    if (pinned[key]?.position !== 'sticky') {
      note({case: `pinned ${key}`, got: pinned[key]?.position, expected: 'sticky'});
    }
  }
  if (pinned.loose?.position === 'sticky') {
    note({case: 'unpinned column', expected: 'a column without the role stays with the rows'});
  }
  if (pinned.select?.offset !== '0px') {
    note({case: 'pinned offsets', got: pinned.select?.offset, expected: 'the box sits at the start'});
  }
  const expectedSettings = `${pinned.widths[0]}px`;
  if (pinned.settings?.offset !== expectedSettings) {
    note({case: 'pinned offsets', got: pinned.settings?.offset, expected: `${expectedSettings}, the measured width of the box column`});
  }
  const expectedTitle = `${pinned.widths[0] + pinned.widths[1]}px`;
  if (pinned.title?.offset !== expectedTitle) {
    note({case: 'pinned offsets', got: pinned.title?.offset, expected: `${expectedTitle}, the two system columns measured`});
  }
  // Placed, not merely sticky: while the rows are scrolled the three cells must
  // sit side by side at the start of the area, not on top of each other.
  if (pinned.scrollLeft > 0) {
    const places = [pinned.select?.left, pinned.settings?.left, pinned.title?.left];
    if (!(places[0] === pinned.areaLeft && places[1] > places[0] && places[2] > places[1])) {
      note({case: 'pinned placement', got: places, areaLeft: pinned.areaLeft, expected: 'three cells in a row from the start of the area'});
    }
    if (!pinned.scrolled) note({case: 'pinned edge', expected: 'the area says it is scrolled, so the shadow shows'});
  } else {
    note({case: 'pinned placement', expected: 'an area that scrolls sideways, so the test means something'});
  }
  if (!pinned.edge.includes('name')) {
    note({case: 'pinned edge', got: pinned.edge, expected: 'the title column ends the block and carries the shadow'});
  }
  await table.close();

  // 3b. A column move survives the render a host answer brings with it. This
  // is the defect the consumer reported: the preview moves cells by hand, the
  // commit used to read the order back out of them, and a host hands its rows
  // back on every answer — which put the cells where the data says they are and
  // lost the move without a word. Both drags are real pointer drags.
  for (const rerenderMidway of [false, true]) {
    const dragged = await open('<div style="width:1000px"><sf-table id="t" toolbar="false"></sf-table></div>');
    const before = await dragged.evaluate(async () => {
      const element = document.getElementById('t');
      window.rows = Array.from({length: 6}, (_, index) => ({
        id: String(index + 1), code: `C${index}`, name: `N${index}`, city: `X${index}`, actions: ['view'],
      }));
      element.setColumns?.([
        {key: 'code', label: 'Code', order: 10, sortable: true, width: 200},
        {key: 'name', label: 'Name', order: 20, role: 'title', sortable: true, width: 240},
        {key: 'city', label: 'City', order: 30, sortable: true, width: 200},
      ]);
      element.setRows?.(window.rows);
      await new Promise((done) => setTimeout(done, 350));
      return [...element.querySelectorAll('thead th')].map((cell) => cell.dataset.key).join(',');
    });
    // The columns are dragged inside the loose group: the title column is pinned
    // by default since 2026-10-04, and a move stays within its own group.
    const grip = await dragged.evaluate(() => {
      const head = document.querySelector('#t thead th[data-key="city"]');
      const label = head.querySelector('.sf-table-sort-button') ?? head;
      const from = label.getBoundingClientRect();
      const onto = document.querySelector('#t thead th[data-key="code"]').getBoundingClientRect();
      return {x: from.left + 30, y: from.top + from.height / 2, tx: onto.left + 20};
    });
    await dragged.mouse.move(grip.x, grip.y);
    await dragged.mouse.down();
    for (let step = 1; step <= 12; step += 1) {
      await dragged.mouse.move(grip.x + ((grip.tx - grip.x) * step) / 12, grip.y + 2, {steps: 1});
      if (rerenderMidway && step === 6) {
        await dragged.evaluate(() => document.getElementById('t').setRows?.(window.rows.map((row) => ({...row}))));
      }
    }
    await dragged.mouse.up();
    await dragged.waitForTimeout(600);
    const after = await dragged.evaluate(() => [...document.querySelectorAll('#t thead th')].map((cell) => cell.dataset.key).join(','));
    if (before !== 'select,settings,name,code,city,actions') {
      note({case: 'column move', before, expected: 'the pinned title column first, then the loose ones in order'});
    }
    if (after !== 'select,settings,name,city,code,actions') {
      note({case: `column move${rerenderMidway ? ' with a render halfway' : ''}`, after, expected: 'select,settings,name,city,code,actions'});
    }
    await dragged.close();
  }

  // 4. The switcher: the arrows, and the field that replaced the row of numbers
  // on 2026-10-05 ("поле номера страницы вместо ряда номеров").
  const pager = await open('<sf-pagination id="p" top="false" bottom="false" total="500" page-size="10"></sf-pagination>');
  const shapeAt = async (current) => pager.evaluate(async (page) => {
    const element = document.getElementById('p');
    element.setAttribute('current', String(page));
    await new Promise((done) => setTimeout(done, 200));
    const field = element.querySelector('.sf-pagination-page-input input');
    const list = element.querySelector('.sf-pagination-list');
    const box = field?.getBoundingClientRect();
    return {
      numbers: element.querySelectorAll('.sf-pagination-list .sf-page-number').length,
      value: field?.value ?? null,
      // The number has to be readable in the field it is typed into: its own
      // box, not the box of the chrome around it.
      fits: box ? Math.ceil(field.scrollWidth) <= Math.ceil(box.width) + 1 : null,
      betweenArrows: Boolean(list?.querySelector('.sf-pagination-item-field')),
      prev: Boolean(element.querySelector('.sf-pagination-direction--prev')),
      next: Boolean(element.querySelector('.sf-pagination-direction--next')),
      last: Boolean(element.querySelector('.sf-pagination-direction--last')),
    };
  }, current);

  for (const current of [1, 2, 5, 6, 7, 45]) {
    const shown = await shapeAt(current);
    if (shown.numbers !== 0 || shown.value !== String(current) || shown.fits !== true || !shown.betweenArrows) {
      note({case: `switcher on page ${current}`, got: shown, expected: 'no row of numbers; the page in a field between the arrows, and the number fits it'});
    }
    if (current === 1 && shown.prev) note({case: 'switcher', expected: 'no back on the first page'});
    if (current > 1 && !shown.prev) note({case: `switcher on page ${current}`, expected: 'back appears'});
    if (!shown.next || !shown.last) note({case: `switcher on page ${current}`, expected: 'forward and last while there is more'});
  }
  // Typing a page is the way to any other page now that the numbers are gone.
  const typed = await pager.evaluate(async () => {
    const element = document.getElementById('p');
    const seen = [];
    element.addEventListener('sf-pagination-change', (event) => seen.push(event.detail?.page ?? event.detail?.current));
    const input = element.querySelector('.sf-pagination-page-input input');
    input.focus();
    input.value = '12';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    await new Promise((done) => setTimeout(done, 250));
    return {seen, current: element.getAttribute('current')};
  });
  if (typed.current !== '12' && !typed.seen.includes(12)) {
    note({case: 'switcher by typing', got: typed, expected: 'a typed page and Enter move to it'});
  }
  // The gap that jumped into the middle of the hidden pages was removed with
  // the scheme it belonged to on 2026-10-04. What replaced it — the window, the
  // ends and the page field — is measured in pagination-round-2.
  await pager.close();

  // 5. The bulk panel, and Show more hidden when there is no next portion.
  const panel = await open(
    `<div style="height:300px;overflow:auto"><div style="height:900px">
       <sf-pagination id="p" total="450" page-size="10" current="1" selected-count="0"
         actions="archive:В архив|delete:Удалить" show-action-for-all="true"></sf-pagination>
     </div></div>`,
  );
  const states = await panel.evaluate(async () => {
    const element = document.getElementById('p');
    await new Promise((done) => setTimeout(done, 200));
    const read = () => {
      const dock = element.querySelector('.sf-pagination-actions');
      if (!dock) return null;
      const style = getComputedStyle(dock);
      const apply = [...dock.querySelectorAll('sf-button')].pop();
      return {
        position: style.position,
        bottom: style.insetBlockEnd,
        count: dock.querySelector('.sf-pagination-actions-count')?.textContent?.trim() ?? '',
        forAll: dock.querySelector('sf-checkbox')?.getAttribute('label') ?? '',
        applyDisabled: apply?.hasAttribute('disabled') ?? null,
        clear: Boolean(dock.querySelector('.sf-pagination-actions-clear')),
      };
    };
    const empty = read();
    element.setAttribute('selected-count', '3');
    await new Promise((done) => setTimeout(done, 250));
    const marked = read();
    const cleared = [];
    element.addEventListener('sf-pagination-selection-clear', (event) => cleared.push(event.detail['selected-count']));
    element.querySelector('.sf-pagination-actions-clear')?.click();
    await new Promise((done) => setTimeout(done, 150));
    const showMoreWithNext = Boolean(element.querySelector('.sf-pagination-more sf-button'));
    element.setAttribute('total', '10');
    await new Promise((done) => setTimeout(done, 200));
    const showMoreAtEnd = Boolean(element.querySelector('.sf-pagination-more sf-button'));
    return {empty, marked, cleared, showMoreWithNext, showMoreAtEnd};
  });
  if (states.empty !== null) note({case: 'panel', expected: 'nothing marked, no panel'});
  if (!states.marked) {
    note({case: 'panel', expected: 'a panel once rows are marked'});
  } else {
    // The band is part of the card now, and the page row is what sticks: the
    // owner replaced the floating panel on 2026-10-04. Its place is measured in
    // pagination-round-2; here it only has to be the band, not a floating box.
    if (states.marked.position !== 'sticky') {
      note({case: 'panel', got: states.marked.position, expected: 'a band in the card, sticky at its bottom'});
    }
    if (!/Selected:\s*3/u.test(states.marked.count)) {
      note({case: 'panel', got: states.marked.count, expected: 'it says three are marked'});
    }
    if (!/\(450\)/u.test(states.marked.forAll)) {
      note({case: 'panel', got: states.marked.forAll, expected: 'for-all names the 450 records'});
    }
    if (states.marked.applyDisabled !== true) {
      note({case: 'panel', expected: 'apply is out of reach until an action is chosen'});
    }
    if (!states.marked.clear) note({case: 'panel', expected: 'a cross that drops the selection'});
  }
  if (String(states.cleared) !== '3') {
    note({case: 'panel cross', got: states.cleared, expected: 'it announces the selection it dropped'});
  }
  if (!states.showMoreWithNext) note({case: 'show more', expected: 'shown while a next portion exists'});
  if (states.showMoreAtEnd) note({case: 'show more', expected: 'gone on the last portion, not greyed'});
  await panel.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('TABLE_BEHAVIOUR_OK');
