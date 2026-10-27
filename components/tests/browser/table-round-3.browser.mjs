#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Round three, measured on the built bytes: the width taken by the line and the
// guide that follows it, the band's corners, the spacing around Show more, the
// page field by digits, the view's own actions, what an empty result and a
// refusal show, and what a write re-renders.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css',
  'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'component/component/alert/css/alert.css',
  'component/component/toast/css/toast.css',
  'component/component/inputs/css/inputs.css',
  // The menu's own sheet: without it the page measures a menu nobody styled.
  'component/component/context-menu/css/context-menu.css',
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
  'smart/smart/close/js/close.js',
  'smart/smart/alert/js/alert.js',
  'smart/smart/toast/js/toast.js',
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js',
  'smart/smart/tags/js/tags.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

// A view with a stub host. `width` bounds the card so a wide table overflows.
const open = async ({width = 1000, columnWidth = 300, rows = 10, delay = 60, hostReset = true} = {}) => {
  const page = await browser.newPage({viewport: {width: 1200, height: 900}});
  await page.setContent(
    `<!doctype html><html class="theme-light" lang="ru"><head><base href="http://admin.test/"></head>
     <body style="margin:0"><div style="width:${width}px">
       <sf-data-view id="v">
         <sf-table slot="content" id="t"></sf-table>
         <sf-pagination slot="pagination" id="p" page-size="10" current="3"></sf-pagination>
       </sf-data-view>
     </div></body></html>`,
  );
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  // The icon font is not here, so every glyph would measure zero and the icon
  // buttons would collapse: give the glyphs the size the font gives them.
  await page.addStyleTag({content: '.sf-icon{display:inline-block;inline-size:1.25rem;block-size:1.25rem}'});
  // And a host shell's own reset, unlayered, the way every admin has one: an
  // unlayered declaration beats every layered one whatever its specificity, so
  // a component measured without one is measured in a page nobody ships.
  if (hostReset) await page.addStyleTag({content: '* { box-sizing: border-box; }'});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(900);
  await page.evaluate(async ([columnWidth, rowCount, wait]) => {
    const view = document.getElementById('v');
    window.raised = [];
    window.empty = false;
    window.refuse = false;
    window.patchOnMutate = false;
    const rows = (from, count) => Array.from({length: count}, (_, index) => ({
      id: String(from + index), name: `Name ${from + index}`, city: `City ${from + index}`,
      tail: `Tail ${from + index}`, revision: 'r1', actions: ['view', 'publish'],
    }));
    view.setHostPort({
      version: '1.5.0',
      capabilities: ['row-actions', 'saved-views', 'shared-column-settings', 'bulk-under-filter'],
      async raise(intent, payload) {
        window.raised.push(intent);
        await new Promise((done) => setTimeout(done, wait));
        if (window.refuse && intent !== 'query.change') {
          return {answer: 'refused', reason: 'minimal_cms_action_rejected'};
        }
        if (intent === 'record.mutate' && window.patchOnMutate) {
          return {answer: 'applied', data: {records: [{
            id: payload.record_ids[0], revision: 'r2', actions: ['view'], name: 'Patched',
          }]}};
        }
        if (intent !== 'query.change') return {answer: 'applied'};
        return {answer: 'applied', sequence: payload.sequence, data: {
          records: window.empty ? [] : rows(1, rowCount),
          total: window.empty ? 0 : 40,
          columns: [
            {key: 'name', label: 'Name', role: 'title', width: columnWidth, sortable: true},
            {key: 'city', label: 'City', width: columnWidth},
            {key: 'tail', label: 'Tail', width: columnWidth},
          ],
          echo: {search: payload.query.search ?? '', filters: {}, sort: [], page: 3, per_page: 10},
          column_settings: {target: 'personal', layers: {personal: {revision: 's1', columns: {}}}},
        }};
      },
    });
    document.getElementById('t').setFilterFields?.([
      {key: 'name', label: 'Name', filter: {control: 'text'}},
      {key: 'city', label: 'City', filter: {control: 'text'}},
    ]);
    await new Promise((done) => setTimeout(done, 700));
  }, [columnWidth, rows, delay]);
  return page;
};

// The centre of a native control inside a Framework component: the hosts are
// display:contents and have no box of their own.
const centre = (page, code) => page.evaluate((source) => {
  const node = new Function('return ' + source)()();
  const control = node?.matches?.('button, input, a') ? node
    : node?.querySelector?.('button, input, a') || node?.shadowRoot?.querySelector?.('button, input, a') || node;
  const rect = control?.getBoundingClientRect?.();
  return rect && (rect.width || rect.height) ? {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2} : null;
}, code);

try {
  const page = await open();

  // 2. No handle. The strip stands on the line, is wide enough to hit, and says
  //    what it does with the cursor.
  const strip = await page.evaluate(() => {
    const cell = document.querySelector('#t thead th[data-key="city"]');
    const one = cell.querySelector('[data-sf-column-resizer]');
    const box = one?.getBoundingClientRect();
    const cellBox = cell.getBoundingClientRect();
    const style = one ? getComputedStyle(one) : null;
    return {
      icons: cell.querySelectorAll('sf-icon-button').length,
      tag: one?.tagName ?? null, label: one?.getAttribute('aria-label') ?? null,
      keys: one?.getAttribute('aria-keyshortcuts') ?? null,
      cursor: style?.cursor ?? null, width: box ? Math.round(box.width) : null,
      offEdge: box ? Math.round(box.left + box.width / 2 - cellBox.right) : null,
    };
  });
  if (strip.icons !== 0 || strip.tag !== 'BUTTON' || strip.cursor !== 'col-resize'
      || strip.width < 8 || strip.width > 12 || Math.abs(strip.offEdge) > 1
      // The keys of the Framework's resize gesture since 2026-10-14.
      || !strip.label?.startsWith('Изменить ширину столбца') || strip.keys !== 'ArrowLeft ArrowRight Home End Enter') {
    note({case: 'resize strip', got: strip, expected: 'no handle; a strip of 8-12px on the edge, named, with the arrows'});
  }

  // 3. The line shows while the pointer is on the strip, and follows the edge
  //    on every frame of the drag.
  const guide = await (async () => {
    const at = await centre(page, `() => document.querySelector('#t thead th[data-key="city"] [data-sf-column-resizer]')`);
    if (!at) return {strip: 'not hittable'};
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(200);
    const read = () => page.evaluate(() => {
      const line = document.querySelector('#t .sf-table-resize-guide');
      const cell = document.querySelector('#t thead th[data-key="city"]');
      const scroll = document.querySelector('#t .sf-table-scroll');
      const area = scroll.getBoundingClientRect();
      return {
        hidden: line?.hidden ?? null,
        line: line ? Math.round(parseFloat(line.style.insetInlineStart || '0')) : null,
        edge: Math.round(cell.getBoundingClientRect().right - area.left + scroll.scrollLeft),
        width: Math.round(cell.getBoundingClientRect().width),
      };
    });
    const onHover = await read();
    await page.mouse.down();
    const steps = [];
    for (const step of [40, 80, 120]) {
      await page.mouse.move(at.x + step, at.y);
      await page.waitForTimeout(120);
      steps.push(await read());
    }
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await read();
    return {onHover, steps, after};
  })();
  if (guide.onHover?.hidden !== false) {
    note({case: 'guide', got: guide.onHover, expected: 'the line while the pointer is on the strip'});
  }
  for (const step of guide.steps ?? []) {
    if (step.hidden !== false || Math.abs(step.line - step.edge) > 2) {
      note({case: 'guide', got: step, expected: 'the line on the edge in the same frame'});
    }
  }
  if ((guide.steps ?? []).length && guide.steps.at(-1).width <= guide.onHover.width) {
    note({case: 'resize', got: {before: guide.onHover?.width, after: guide.steps.at(-1).width}, expected: 'the drag widened the column'});
  }
  if (guide.after?.hidden !== true) {
    note({case: 'guide', got: guide.after, expected: 'no line once the drag is over'});
  }

  // 4. Show more has no row of its own any more: on 2026-10-05 the owner asked
  //    for it in the footer beside the arrows ("отдельной строки над подвалом
  //    больше нет"), so what round three measured -- equal space above and
  //    below that row -- no longer has a subject. What is measured instead is
  //    that the row is gone and the button sits on the footer's own line.
  const spacing = await page.evaluate(async () => {
    const pagination = document.getElementById('p');
    pagination.setState?.({hasNextPage: true});
    pagination.setAttribute('has-next', 'true');
    await new Promise((done) => setTimeout(done, 300));
    const box = (node) => {
      const rect = node?.getBoundingClientRect?.();
      return rect ? {top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height)} : null;
    };
    const scroll = document.querySelector('#t .sf-table-scroll');
    const more = document.querySelector('#p .sf-pagination-more sf-button button');
    const arrow = document.querySelector('#p .sf-pagination-direction--next button');
    const moreBox = box(more);
    const arrowBox = box(arrow);
    return {
      ownRow: Boolean(document.querySelector('#p .sf-pagination-top')),
      more: Boolean(more),
      // One line: the two share a centre, within a couple of pixels.
      sharedLine: moreBox && arrowBox
        ? Math.abs((moreBox.top + moreBox.height / 2) - (arrowBox.top + arrowBox.height / 2)) <= 2
        : null,
      overflowing: scroll ? scroll.scrollWidth > scroll.clientWidth : null,
      panels: document.querySelectorAll('#t sf-modal').length,
    };
  });
  if (spacing.panels !== 0) {
    note({case: 'spacing', got: spacing, expected: 'no demo panel in the table'});
  }
  if (spacing.ownRow || !spacing.more || spacing.sharedLine !== true) {
    note({case: 'show more', got: spacing, expected: 'no row above the footer; Show more on the footer line with the arrows'});
  }

  // 8. The page field is as wide as its number and grows as it is typed -- and
  //    the number inside it is not clipped, which is what the first published
  //    pair got wrong: the width was set on the field and had to guess the
  //    chrome inside it, leaving about eleven pixels for two digits.
  const field = await page.evaluate(async () => {
    const root = document.querySelector('#p .sf-pagination-page-input');
    const input = root?.matches('input') ? root : root?.querySelector('input');
    const read = (value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      return {
        value,
        box: Math.round(input.getBoundingClientRect().width),
        fieldBox: Math.round(root.getBoundingClientRect().width),
        needs: input.scrollWidth, has: input.clientWidth,
        clipped: input.scrollWidth > input.clientWidth,
      };
    };
    const steps = ['1', '31', '314', '3141'].map(read);
    read('3');
    return steps;
  });
  for (const step of field) {
    if (step.clipped) {
      note({case: 'page field', got: step, expected: 'the number is not clipped'});
    }
  }
  // The same field in a page whose host declares no reset at all.
  const bare = await open({hostReset: false});
  const bareField = await bare.evaluate(() => {
    const root = document.querySelector('#p .sf-pagination-page-input');
    const input = root?.matches('input') ? root : root?.querySelector('input');
    return ['1', '31', '3141'].map((value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      return {value, boxSizing: getComputedStyle(input).boxSizing,
        needs: input.scrollWidth, has: input.clientWidth,
        clipped: input.scrollWidth > input.clientWidth};
    });
  });
  for (const step of bareField) {
    if (step.clipped) {
      note({case: 'page field without a host reset', got: step, expected: 'the number is not clipped'});
    }
  }
  await bare.close();
  if (field[3].fieldBox - field[0].fieldBox < 10) {
    note({case: 'page field', got: field, expected: 'the field grows with the digits typed'});
  }

  // 1. The band is a surface, so it is rounded like one.
  const band = await page.evaluate(async () => {
    // The action list is an attribute: `value:text`, separated by bars.
    document.getElementById('p').setAttribute('actions', 'remove:Удалить');
    await new Promise((done) => setTimeout(done, 200));
    const row = document.querySelector('#t tbody tr');
    const checkbox = row?.querySelector('sf-checkbox input') ?? row?.querySelector('input[type="checkbox"]');
    checkbox?.click();
    await new Promise((done) => setTimeout(done, 500));
    const strip = document.querySelector('sf-data-view > [slot="bulk"]');
    const style = strip ? getComputedStyle(strip) : null;
    return {
      found: Boolean(strip),
      radius: style ? [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius] : null,
      position: style?.position ?? null,
      selected: document.getElementById('t').getSelectedRecordIds?.() ?? null,
      actions: document.getElementById('p').actions?.length ?? null,
    };
  });
  if (!band.found || band.radius.some((value) => parseFloat(value) <= 0) || band.position !== 'sticky') {
    note({case: 'band', got: band, expected: 'the band sticks and carries the surface radius'});
  }
  await page.close();

  // 5. Nothing found is said once, by the table; a refusal is a notice that
  //    moves nothing.
  const quiet = await open();
  const empty = await quiet.evaluate(async () => {
    const view = document.getElementById('v');
    const table = document.getElementById('t');
    const before = Math.round(table.getBoundingClientRect?.().top ?? 0);
    const region = () => Math.round(document.querySelector('#t [data-state]').getBoundingClientRect().top);
    const first = region();
    window.empty = true;
    await view.refresh('nothing');
    await new Promise((done) => setTimeout(done, 400));
    const status = view.shadowRoot.querySelector('[part="status"]');
    return {
      statusText: status?.textContent ?? null,
      statusHeight: Math.round(status?.getBoundingClientRect?.().height ?? 0),
      moved: region() - first,
      body: document.querySelector('#t tbody sf-empty-state')?.getAttribute('kind') ?? '',
      notice: document.querySelectorAll('sf-data-view > [slot="notice"]').length,
    };
  });
  if (empty.statusHeight > 1 || empty.moved !== 0 || empty.body !== 'no-data'
      || empty.statusText !== 'Нет данных' || empty.notice !== 0) {
    note({case: 'empty', got: empty, expected: 'the table says it; nothing above it moves'});
  }

  const refused = await quiet.evaluate(async () => {
    const view = document.getElementById('v');
    window.empty = false;
    window.refuse = true;
    await view.refresh('filled');
    await new Promise((done) => setTimeout(done, 400));
    const region = () => Math.round(document.querySelector('#t [data-state]').getBoundingClientRect().top);
    const before = region();
    document.getElementById('t').requestActionIntent('publish', ['1']);
    await new Promise((done) => setTimeout(done, 500));
    // Round three made the notice an alert above the table; on 2026-10-05 the
    // owner asked for one that covers no control, so it is a toast. What round
    // three asked of it stands: a sentence, the code beside it, and no shift.
    // The page's notification area since SF.notify (2026-10-13); the band over
    // the card on an older Framework. The code travels in the record's source.
    const alert = document.querySelector('.sf-notifications .sf-toast')
      ?? document.querySelector('sf-data-view > [slot="notice"] sf-toast');
    const box = alert?.querySelector('.sf-toast')?.getBoundingClientRect?.() ?? alert?.getBoundingClientRect?.();
    return {
      shown: Boolean(alert), moved: region() - before,
      title: alert?.getAttribute('heading') ?? alert?.getAttribute('title') ?? null,
      code: alert?.getAttribute('data-sf-code')
        ?? (window.SF?.notifications?.history?.()[0]?.source ?? '').replace(/^sf-data-view:/u, '') ?? null,
      text: (alert?.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 80),
      overlaps: box ? box.top <= before + 1 : null,
    };
  });
  if (!refused.shown || refused.moved !== 0 || refused.title === 'minimal_cms_action_rejected'
      || !refused.text.includes('Действие отклонено') || refused.code !== 'minimal_cms_action_rejected') {
    note({case: 'refusal', got: refused, expected: 'a notice with a sentence, the code beside it, and no shift'});
  }
  await quiet.close();

  // 6. The view's own actions, and no control without them.
  const actions = await open();
  const toolbar = await actions.evaluate(async () => {
    const table = document.getElementById('t');
    const control = () => [...document.querySelectorAll('#t .sf-table-head sf-icon-button, #t sf-icon-button')]
      .find((one) => one.getAttribute('aria-label') === 'Действия с представлением');
    const before = Boolean(control());
    window.toolbarEvents = [];
    table.addEventListener('sf-table-toolbar-action', (event) => {
      event.preventDefault();
      window.toolbarEvents.push(event.detail);
    });
    table.setToolbarActions([
      {id: 'list-settings', label: 'Настройки списка', icon: 'tune'},
      {id: 'removed', label: 'Удалённые элементы', href: '/admin/cms/removed'},
    ]);
    await new Promise((done) => setTimeout(done, 400));
    return {before, after: Boolean(control())};
  });
  if (toolbar.before !== false || toolbar.after !== true) {
    note({case: 'toolbar actions', got: toolbar, expected: 'no control without actions, a control with them'});
  }
  const chosen = await (async () => {
    const at = await centre(actions, `() => [...document.querySelectorAll('#t sf-icon-button')].find((one) => one.getAttribute('aria-label') === 'Действия с представлением')`);
    if (!at) return {control: 'not hittable'};
    await actions.mouse.click(at.x, at.y);
    await actions.waitForTimeout(350);
    // The standard menu's rows; the label is the row's text.
    const items = await actions.evaluate(() => [...document.querySelectorAll('sf-context-menu .sf-context-menu-item')]
      .map((one) => (one.querySelector('.sf-context-menu-item-label') ?? one).textContent.trim()));
    const item = await centre(actions, `() => [...document.querySelectorAll('sf-context-menu .sf-context-menu-item')].find((one) => one.textContent.trim().endsWith('Удалённые элементы'))`);
    if (item) await actions.mouse.click(item.x, item.y);
    await actions.waitForTimeout(350);
    return {items, events: await actions.evaluate(() => window.toolbarEvents),
      here: await actions.evaluate(() => location.pathname)};
  })();
  if (!(chosen.items ?? []).includes('Настройки списка') || chosen.events?.[0]?.action !== 'removed'
      || chosen.events?.[0]?.href !== '/admin/cms/removed' || chosen.here !== 'blank') {
    note({case: 'toolbar actions', got: chosen, expected: 'the host items, the id in the event, the href in it, and no navigation once cancelled'});
  }
  await actions.close();

  // 9. The first click after the load, including one that lands while the first
  //    answer is still on its way.
  const slow = await open({delay: 1200});
  const firstClick = await (async () => {
    const find = `() => [...document.querySelectorAll('#t sf-button')].find((one) => (one.getAttribute('text') || '').includes('Фильтр'))`;
    const gear = `() => document.querySelector('#t thead th[data-key="settings"] sf-icon-button, #t tbody th[data-key="settings"] sf-icon-button, #t [aria-label="Настройки"]')`;
    const open = () => slow.evaluate(() => Boolean(document.querySelector('sf-context-menu')));
    const close = async () => {
      await slow.keyboard.press('Escape');
      await slow.waitForTimeout(250);
    };
    // A page that has just answered once: the plain first click.
    const settled = {};
    for (const [name, locate] of [['filter', find], ['gear', gear]]) {
      const at = await centre(slow, locate);
      if (!at) { settled[name] = 'not hittable'; continue; }
      await slow.mouse.click(at.x, at.y);
      await slow.waitForTimeout(350);
      settled[name] = await open();
      await close();
    }
    // And one that lands in the middle of the first answer: the view is asked
    // again, and the click arrives while the answer is being applied.
    await slow.evaluate(() => document.getElementById('v').refresh('slow-again'));
    await slow.waitForTimeout(120);
    const at = await centre(slow, find);
    const duringAnswer = {clicked: Boolean(at)};
    if (at) {
      await slow.mouse.click(at.x, at.y);
      await slow.waitForTimeout(1600);
      duringAnswer.menu = await open();
      await close();
    }
    return {settled, duringAnswer};
  })();
  if (firstClick.settled.filter !== true || firstClick.settled.gear !== true
      || firstClick.duringAnswer.menu !== true) {
    note({case: 'first click', got: firstClick, expected: 'the first click opens the menu, during the first answer too'});
  }
  await slow.close();

  // 9b. The consumer's own startup: the surface is hidden until the port is
  //     connected and un-hidden straight after, and the person clicks as soon
  //     as the rows appear. The first click still opens, and the first double
  //     click on a row still opens the record.
  const late = await browser.newPage({viewport: {width: 1200, height: 900}});
  await late.setContent(
    `<!doctype html><html class="theme-light" lang="ru"><head><base href="http://admin.test/"></head>
     <body style="margin:0"><div id="surface" hidden style="width:1000px">
       <sf-data-view id="v">
         <sf-table slot="content" id="t"></sf-table>
         <sf-pagination slot="pagination" id="p" page-size="10" current="1"></sf-pagination>
       </sf-data-view>
     </div></body></html>`,
  );
  for (const path of styles) await late.addStyleTag({path}).catch(() => {});
  await late.addStyleTag({content: '.sf-icon{display:inline-block;inline-size:1.25rem;block-size:1.25rem}'});
  for (const path of modules) await late.addScriptTag({path, type: 'module'}).catch(() => {});
  await late.waitForTimeout(900);
  await late.evaluate(async () => {
    const view = document.getElementById('v');
    window.opens = [];
    view.setHostPort({
      version: '1.5.0', capabilities: ['row-actions'],
      async raise(intent, payload) {
        await new Promise((done) => setTimeout(done, 300));
        if (intent !== 'query.change') return {answer: 'applied'};
        return {answer: 'applied', sequence: payload.sequence, data: {
          records: Array.from({length: 6}, (_, index) => ({
            id: String(index + 1), name: `Name ${index}`, city: `City ${index}`,
            revision: 'r1', actions: ['view'],
          })),
          total: 40,
          columns: [{key: 'name', label: 'Name', role: 'title', width: 300}, {key: 'city', label: 'City', width: 300}],
          echo: {search: '', filters: {}, sort: [], page: 1, per_page: 10},
          column_settings: {target: 'personal', layers: {personal: {revision: 's1', columns: {}}}},
        }};
      },
    });
    document.getElementById('t').setFilterFields?.([{key: 'name', label: 'Name', filter: {control: 'text'}}]);
    document.getElementById('surface').hidden = false;
    document.getElementById('t').addEventListener('sf-table-action-intent', (event) => window.opens.push(event.detail));
  });
  await late.waitForFunction(() => document.querySelectorAll('#t tbody tr').length > 1, null, {timeout: 6000});
  const afterLoad = await (async () => {
    const menu = () => late.evaluate(() => Boolean(document.querySelector('sf-context-menu')));
    const escape = async () => { await late.keyboard.press('Escape'); await late.waitForTimeout(200); };
    const result = {};
    for (const [name, locate] of [
      ['filter', `() => [...document.querySelectorAll('#t sf-button')].find((one) => (one.getAttribute('text') || '').includes('Фильтр'))`],
      ['gear', `() => document.querySelector('#t [aria-label="Настройки"]')`],
    ]) {
      const at = await centre(late, locate);
      if (!at) { result[name] = 'not hittable'; continue; }
      await late.mouse.click(at.x, at.y);
      await late.waitForTimeout(300);
      result[name] = await menu();
      await escape();
    }
    const row = await late.evaluate(() => {
      const cell = document.querySelector('#t tbody tr td[data-key="name"]');
      const rect = cell.getBoundingClientRect();
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    });
    await late.mouse.dblclick(row.x, row.y);
    await late.waitForTimeout(400);
    result.opened = await late.evaluate(() => window.opens.length);
    return result;
  })();
  if (afterLoad.filter !== true || afterLoad.gear !== true || afterLoad.opened !== 1) {
    note({case: 'first click after a late surface', got: afterLoad,
      expected: 'the first click opens, and the first double click opens the record'});
  }
  await late.close();

  // 6b. A menu opened from a control near the window's edge keeps its items on
  //     one line: it is moved inside the viewport, not squeezed into the space
  //     beside the control, where the labels wrapped to two lines.
  const tight = await open({width: 1180});
  const tightMenu = await (async () => {
    await tight.evaluate(async () => {
      document.getElementById('t').setToolbarActions([
        {id: 'list-settings', label: 'Настройки списка', icon: 'tune'},
        {id: 'removed', label: 'Удалённые элементы'},
      ]);
      await new Promise((done) => setTimeout(done, 300));
    });
    const at = await centre(tight, `() => [...document.querySelectorAll('#t sf-icon-button')].find((one) => one.getAttribute('aria-label') === 'Действия с представлением')`);
    if (!at) return {control: 'not hittable'};
    await tight.mouse.click(at.x, at.y);
    await tight.waitForTimeout(400);
    return tight.evaluate(() => {
      const menu = document.querySelector('sf-context-menu');
      const surface = menu?.querySelector('.sf-context-menu') ?? menu;
      const content = menu?.querySelector('.sf-context-menu-content');
      // The standard menu's rows (2026-10-13); they were link buttons.
      const items = [...(menu?.querySelectorAll('.sf-context-menu-item') ?? [])].map((row) => {
        const label = row.querySelector('.sf-context-menu-item-label, .sf-context-menu-item-text') ?? row;
        const box = row.getBoundingClientRect();
        return {
          text: row.textContent.trim(), height: Math.round(box.height),
          width: Math.round(box.width), wrap: getComputedStyle(label).whiteSpace,
          lines: Math.round(label.getBoundingClientRect().height / (parseFloat(getComputedStyle(label).lineHeight) || 1)),
        };
      });
      const box = surface?.getBoundingClientRect();
      return {
        items,
        right: box ? Math.round(box.right) : null,
        width: box ? Math.round(box.width) : null,
        viewport: window.innerWidth,
        contentWidth: content ? Math.round(content.getBoundingClientRect().width) : null,
      };
    });
  })();
  {
    const tallest = Math.max(...(tightMenu.items ?? []).map((item) => item.height ?? 0));
    // One line each: a standard menu row is as tall as a field of the
    // table's size -- 40px for this table at 1, since the menus take the
    // table's size (owner, 2026-10-14) -- so the height says a second line
    // only above that; 26 was a link button's.
    const wrapped = (tightMenu.items ?? []).some((item) => item.wrap !== 'nowrap' || item.lines > 1);
    if (!tightMenu.items?.length || wrapped || tallest > 40
        || tightMenu.right > tightMenu.viewport || tightMenu.width < 120) {
      note({case: 'menu near the edge', got: {...tightMenu, tallest},
        expected: 'items on one line, the menu inside the window'});
    }
  }
  await tight.close();

  // 10. What a write re-renders.
  const audit = await open();
  const renders = await audit.evaluate(async () => {
    const view = document.getElementById('v');
    const table = document.getElementById('t');
    const body = () => document.querySelector('#t tbody');
    const measure = async (act) => {
      const counts = {added: 0, removed: 0, attributes: 0};
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes') counts.attributes += 1;
          else { counts.added += record.addedNodes.length; counts.removed += record.removedNodes.length; }
        }
      });
      observer.observe(body(), {childList: true, subtree: true, attributes: true, characterData: true});
      window.raised.length = 0;
      await act();
      await new Promise((done) => setTimeout(done, 400));
      observer.disconnect();
      return {...counts, raised: [...window.raised]};
    };
    // Which elements the cells hold, so a render can be shown to keep them.
    const cellElements = () => [...body().querySelectorAll('tr td sf-checkbox, tr td sf-icon-button, tr td sf-button')];
    const before = cellElements();
    const open = await measure(() => table.requestActionIntent('view', ['1']));
    window.patchOnMutate = true;
    const patched = await measure(() => table.requestActionIntent('publish', ['1']));
    const titleOf = (id) => (body().querySelector(`tr[data-row-id="${id}"] td[data-key="name"]`)?.textContent ?? '')
      .replace(/\s+/gu, ' ').trim();
    const patchedTitle = titleOf('1');
    const requeried = await measure(() => view.changeQuery({search: 'name'}, 'search'));
    const requeriedTitle = titleOf('1');
    const after = cellElements();
    // How many of the elements that were there are still the same elements.
    // Not «all of them»: the patched record comes back offering one action
    // where it offered two, so that row's actions cell genuinely changes and
    // its controls are genuinely new. Everything else must survive (owner,
    // 2026-10-09).
    const live = new Set(after);
    const keptCount = before.filter((element) => live.has(element)).length;
    const kept = before.length > 0 && keptCount >= before.length - 4;
    const byHand = await measure(() => view.updateRecord('2', {name: 'By hand'}));
    return {open, patched, requeried, byHand, patchedTitle, requeriedTitle,
      byHandTitle: titleOf('2'),
      cells: before.length, cellsKept: kept,
      rows: body().querySelectorAll('tr').length,
      // Measured, not required: every cell that is a Framework element is
      // rebuilt on each render, changed row or not. That is the next piece of
      // work, and this number is the evidence for it.
      nodesPerRow: Math.round(patched.added / Math.max(body().querySelectorAll('tr').length, 1))};
  });
  if (renders.open.added !== 0 || renders.open.attributes !== 0 || renders.open.raised.join() !== 'record.open') {
    note({case: 'renders', got: renders.open, expected: 'opening a record re-renders nothing and asks once'});
  }
  // A write answered with its own record asks the host once and no more: the
  // page is not read again. What the rows cost to redraw is measured below.
  if (renders.patched.raised.join() !== 'record.mutate') {
    note({case: 'renders', got: renders.patched, expected: 'a write answered with its record does not re-query the page'});
  }
  if (!renders.patchedTitle.includes('Patched')) {
    note({case: 'renders', got: renders.patchedTitle, expected: 'the patched row shows the new value'});
  }
  if (renders.byHand.raised.length !== 0 || !renders.byHandTitle.includes('By hand')) {
    note({case: 'renders', got: {raised: renders.byHand.raised, title: renders.byHandTitle},
      expected: 'updateRecord writes the row and asks nothing'});
  }
  // A re-query writes the rows it changed and keeps the elements the cells hold.
  // It used to tear every cell out and build it again -- 280 nodes for ten rows,
  // changed row or not -- and the control a person was using went with them.
  // A wholesale rebuild touches every row -- 280 nodes for ten, which is what
  // this refused when it was written. It was written as «nothing at all», which
  // held only while the actions column drew nothing: the patched record offers
  // one action where it offered two, so one row's controls are rightly rebuilt.
  // Fewer nodes than there are rows cannot be every row (owner, 2026-10-09).
  if (renders.requeried.added >= renders.rows || renders.requeried.removed >= renders.rows) {
    note({case: 'renders', got: renders.requeried, rows: renders.rows,
      expected: 'a re-query writes the rows it changed, not every cell in the table'});
  }
  if (renders.patched.added > 0 || renders.byHand.added > 0) {
    note({case: 'renders', got: {patched: renders.patched, byHand: renders.byHand},
      expected: 'a one-row change writes that row only'});
  }
  if (!renders.cellsKept) {
    note({case: 'renders', got: {cells: renders.cells, kept: renders.cellsKept},
      expected: 'the elements the cells hold are the same elements after a render'});
  }
  // What reusing an element has to be worth: the state on it survives a render,
  // and so does the focus. A box that stopped answering the state, or a control
  // that lost the focus, would be the cost of keeping the element.
  const live = await audit.evaluate(async () => {
    const view = document.getElementById('v');
    const table = document.getElementById('t');
    const boxes = () => [...document.querySelectorAll('#t tbody tr sf-checkbox input')];
    const first = boxes()[0];
    first.click();
    await new Promise((done) => setTimeout(done, 300));
    const marked = {
      selected: table.getSelectedRecordIds().map(String),
      checked: first.checked,
      attribute: first.closest('sf-checkbox').getAttribute('checked'),
    };
    // A render over a marked row: the mark is the row's own, so it stays.
    view.updateRecord('3', {name: 'Changed elsewhere'});
    await new Promise((done) => setTimeout(done, 300));
    const afterRender = {
      sameElement: boxes()[0] === first,
      checked: first.checked,
      selected: table.getSelectedRecordIds().map(String),
    };
    // The focus is in a cell's control, and a render happens under it.
    const action = document.querySelector('#t tbody tr [data-key="settings"] button, #t tbody tr sf-icon-button button');
    action?.focus();
    const focused = document.activeElement === action;
    view.updateRecord('4', {name: 'And again'});
    await new Promise((done) => setTimeout(done, 300));
    const focusKept = document.activeElement === action;
    // Unmarking takes the attribute back off a live element.
    first.click();
    await new Promise((done) => setTimeout(done, 300));
    const unmarked = {
      checked: first.checked,
      attribute: first.closest('sf-checkbox').getAttribute('checked'),
      selected: table.getSelectedRecordIds().map(String),
    };
    return {marked, afterRender, focused, focusKept, unmarked};
  });
  if (live.marked.selected.join() !== '1' || live.marked.checked !== true) {
    note({case: 'live state', got: live.marked, expected: 'a click marks the row'});
  }
  if (!live.afterRender.sameElement || live.afterRender.checked !== true
      || live.afterRender.selected.join() !== '1') {
    note({case: 'live state', got: live.afterRender, expected: 'the mark survives a render on the same element'});
  }
  if (live.focused && !live.focusKept) {
    note({case: 'live state', got: live, expected: 'the focus stays in the cell through a render'});
  }
  if (live.unmarked.checked !== false || live.unmarked.selected.length !== 0
      || live.unmarked.attribute !== null) {
    note({case: 'live state', got: live.unmarked, expected: 'unmarking clears the box and the attribute'});
  }
  // A variant that changes on an element that is kept. The classes of a
  // Framework control are written from its props, so a control that switches
  // emphasis -- link to tonal primary, say -- has to be written on update and
  // not only when it was created. This is the seam between keeping the element
  // and the button variants the other Framework session published.
  const variant = await audit.evaluate(async () => {
    const table = document.getElementById('t');
    const cell = () => document.querySelector('#t tbody tr[data-row-id="1"] td[data-key="city"]');
    const control = () => cell()?.querySelector('sf-button');
    const classesOf = () => {
      const button = control()?.querySelector('button');
      return button ? [...button.classList].filter((name) => name.startsWith('sf-button')).sort().join(' ') : null;
    };
    const asLink = {id: '1', name: 'Name 0', city: {component: {type: 'button', props: {
      text: 'Open', type: 'link', scheme: 'on-surface',
    }}}, revision: 'r1', actions: ['view']};
    const asTonal = {...asLink, city: {component: {type: 'button', props: {
      text: 'Open', type: 'tonal', scheme: 'primary',
    }}}};
    table.updateRowByKey('id', '1', asLink, 'variant-check');
    await new Promise((done) => setTimeout(done, 300));
    const first = {element: control(), classes: classesOf()};
    table.updateRowByKey('id', '1', asTonal, 'variant-check');
    await new Promise((done) => setTimeout(done, 300));
    const second = {element: control(), classes: classesOf()};
    return {
      kept: Boolean(first.element) && first.element === second.element,
      before: first.classes, after: second.classes,
    };
  });
  if (!variant.kept || !variant.before || variant.before === variant.after
      || !variant.after.includes('tonal') || variant.after.includes('--link')) {
    note({case: 'variant on a kept element', got: variant,
      expected: 'the same element, written into the new variant'});
  }

  // And the spacing, which the other Framework session asked for: a control is
  // told its spacing by name now, and the class the Smart component writes from
  // it -- spacing-<step> since ui-a2d9554ab5ee, tightness-<step> before -- has to be written on update as well as at
  // creation, on the element that is kept.
  const controlSpacing = await audit.evaluate(async () => {
    const table = document.getElementById('t');
    const control = () => document.querySelector('#t tbody tr[data-row-id="1"] td[data-key="city"] sf-button');
    const tightnessOf = () => {
      const button = control()?.querySelector('button');
      return button ? [...button.classList].filter((name) => name.startsWith('spacing-') || name.startsWith('tightness-')).sort().join(' ') : null;
    };
    const row = (spacingName) => ({id: '1', name: 'Name 0', city: {component: {type: 'button', props: {
      text: 'Open', type: 'link', scheme: 'on-surface', spacing: spacingName,
    }}}, revision: 'r1', actions: ['view']});
    table.updateRowByKey('id', '1', row('compact'), 'spacing-check');
    await new Promise((done) => setTimeout(done, 300));
    const first = {element: control(), tightness: tightnessOf()};
    table.updateRowByKey('id', '1', row('spacious'), 'spacing-check');
    await new Promise((done) => setTimeout(done, 300));
    const second = {element: control(), tightness: tightnessOf()};
    return {
      kept: Boolean(first.element) && first.element === second.element,
      before: first.tightness, after: second.tightness,
    };
  });
  if (!controlSpacing.kept || !controlSpacing.before || controlSpacing.before === controlSpacing.after) {
    note({case: 'spacing on a kept element', got: controlSpacing,
      expected: 'the same element, written into the new spacing'});
  }
  console.error(JSON.stringify({audit: renders, live, variant, controlSpacing}, null, 2));
  await audit.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('TABLE_ROUND_3_OK');
