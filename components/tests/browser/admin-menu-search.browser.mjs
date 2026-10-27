#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The submenu header and the search panel, measured on the built bytes: the
// geometry the consumer gave in numbers, and the behaviour nothing but a page
// can show.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css',
  'core/core/css/utility.full.css',
  'component/component/admin-menu/css/admin-menu.css',
  'component/component/inputs/css/inputs.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js',
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/admin-menu/js/admin-menu.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

const menuMarkup = `
  <sf-admin-menu id="m" brand="Larena" logo="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3C/svg%3E"
                 searchable="true" collapsible="true" settings="false" search-mode="panel">
    <sf-admin-menu-item label="Сводка" left-icon="dashboard" href="/admin"></sf-admin-menu-item>
    <sf-admin-menu-item label="Безопасность" left-icon="key">
      <sf-admin-menu-item label="Роли" left-icon="badge" href="/admin/roles"></sf-admin-menu-item>
      <sf-admin-menu-item label="Пользователи" left-icon="group" href="/admin/users"></sf-admin-menu-item>
    </sf-admin-menu-item>
    <sf-admin-menu-item label="Платежи" left-icon="payments" href="/admin/payments"></sf-admin-menu-item>
  </sf-admin-menu>`;

// `rootSize` is a CSS length or percentage for the root element, written the way
// a host writes it: the consumer's admin declares `html { font-size: 87.5% }`,
// which is 14px at a 16px browser default and 17.5px at a 20px one.
const open = async (markup = menuMarkup, rootSize = '14px') => {
  const page = await browser.newPage({viewport: {width: 1200, height: 800}});
  await page.setContent(
    // A base is needed because setContent serves about:blank, where a root-relative
    // href cannot be resolved at all — a real admin page always has an origin.
    // The size goes on the root, not on the body: every rem token in the menu
    // resolves against html, so a body font-size changes nothing the component
    // measures -- which is what this page did before, in both of its sizes.
    `<!doctype html><html class="theme-light" lang="ru" style="font-size:${rootSize}"><head><base href="http://admin.test/"></head><body style="margin:0">
       <div style="display:flex;height:100vh">${markup}</div>
     </body></html>`,
  );
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  // The icon font is missing here, so every glyph would measure zero and the
  // icon buttons would collapse: give the glyphs the size the font gives them.
  await page.addStyleTag({content: '.sf-icon{display:inline-block;inline-size:1.25rem;block-size:1.25rem}'});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(900);
  return page;
};

try {
  const page = await open();
  const ready = await page.evaluate(() => ({
    items: document.querySelectorAll('#m .sf-admin-menu-main .sf-admin-menu-item').length,
    toggle: Boolean(document.querySelector('#m [data-sf-admin-search-toggle]')),
    row: Boolean(document.querySelector('#m .sf-admin-menu-search sf-input')),
  }));
  if (!ready.items) note({case: 'setup', got: ready, expected: 'the menu rendered its items'});
  if (!ready.toggle) note({case: 'panel mode', expected: 'a magnifier in the header'});
  if (ready.row) note({case: 'panel mode', expected: 'no search row in the body'});

  // 1. The magnifier stands in the column the item arrows are in.
  const columns = await page.evaluate(() => {
    const menu = document.getElementById('m');
    const panel = menu.querySelector('.sf-admin-menu-panel');
    const toggle = menu.querySelector('[data-sf-admin-search-toggle] button, [data-sf-admin-search-toggle]');
    const chevron = [...menu.querySelectorAll('.sf-admin-menu-main .sf-admin-menu-item .sf-icon')]
      .find((icon) => icon.textContent.trim() === 'chevron_right');
    // The leading icon of an item, which is the column the back arrow stands in.
    const icon = menu.querySelector('.sf-admin-menu-main .sf-admin-menu-item-container .sf-icon');
    const centre = (element) => {
      const box = element.getBoundingClientRect();
      return Math.round((box.left + box.right) / 2 - panel.getBoundingClientRect().left);
    };
    return {
      toggleCentre: toggle ? centre(toggle) : null,
      chevronCentre: chevron ? centre(chevron) : null,
      iconCentre: icon ? centre(icon) : null,
      panelWidth: Math.round(panel.getBoundingClientRect().width),
    };
  });
  if (columns.chevronCentre == null) {
    note({case: 'columns', expected: 'an item with a chevron to align against'});
  } else if (Math.abs(columns.toggleCentre - columns.chevronCentre) > 6) {
    note({case: 'magnifier column', got: columns, expected: 'the magnifier centred on the chevron column'});
  }

  // 2. The submenu header takes the height of the logo header, and its arrow
  // stands in the item icon column.
  const header = await page.evaluate(async () => {
    const menu = document.getElementById('m');
    const panel = menu.querySelector('.sf-admin-menu-panel');
    const logoHeight = Math.round(menu.querySelector('.sf-admin-menu-head').getBoundingClientRect().height);
    const trigger = [...menu.querySelectorAll('.sf-admin-menu-main .sf-admin-menu-item')]
      .find((item) => item.textContent.includes('Безопасность'));
    trigger.click();
    await new Promise((done) => setTimeout(done, 400));
    const sub = menu.querySelector('.sf-admin-menu-panel-sub.open');
    if (!sub) return {logoHeight, open: false};
    const head = sub.querySelector('.sf-admin-menu-head');
    const back = head.querySelector('.sf-admin-menu-back-button');
    const icon = menu.querySelector('.sf-admin-menu-main .sf-admin-menu-item-container .sf-icon');
    const edge = (element) =>
      Math.round(element.getBoundingClientRect().left - panel.getBoundingClientRect().left);
    return {
      logoHeight,
      open: true,
      subHeight: Math.round(head.getBoundingClientRect().height),
      backCentre: edge(back),
      iconCentre: edge(icon),
      title: head.textContent.replace(/\s+/gu, ' ').trim(),
      backLabel: head.querySelector('[aria-label]')?.getAttribute('aria-label') ?? null,
      divider: getComputedStyle(head).borderBlockEndWidth,
      focused: document.activeElement?.closest?.('.sf-admin-menu-head') ? 'header' : document.activeElement?.tagName,
    };
  });
  if (!header.open) {
    note({case: 'submenu', expected: 'the submenu opened'});
  } else {
    if (Math.abs(header.subHeight - header.logoHeight) > 2) {
      note({case: 'submenu header', got: header, expected: 'the height of the header with the logo'});
    }
    if (Math.abs(header.backCentre - header.iconCentre) > 6) {
      note({case: 'submenu header', got: header, expected: 'the arrow centred on the item icon column'});
    }
    if (!header.title.includes('Безопасность')) {
      note({case: 'submenu header', got: header.title, expected: 'the section name in the header'});
    }
    if (header.backLabel !== 'Назад к меню') {
      note({case: 'submenu header', got: header.backLabel, expected: 'Назад к меню'});
    }
    if (header.divider === '0px') {
      note({case: 'submenu header', expected: 'a line under the header'});
    }
    if (header.focused !== 'header') {
      note({case: 'submenu header', got: header.focused, expected: 'focus on the arrow when the submenu opens'});
    }
  }

  // 3. The shortcut opens the panel from anywhere, the field has the focus, and
  // Escape gives it back to the magnifier.
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  const readPanel = () => page.evaluate(() => {
    const menu = document.getElementById('m');
    const root = menu.querySelector('.sf-admin-menu') ?? menu;
    const search = menu.querySelector('.sf-admin-menu-panel-search');
    const field = search?.querySelector('input[role="combobox"]');
    const panelBox = search.getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    const fieldBox = field?.closest('.sf-input')?.getBoundingClientRect();
    // What the person sees, not what the state says: the box of the open panel
    // has to be the menu's box, and the field has to be the thing at its own
    // coordinates. The earlier check compared the field with the panel and
    // passed while the panel itself stood one menu width to the side, clipped
    // away by the menu's own overflow.
    const centre = fieldBox
      ? document.elementFromPoint(fieldBox.left + fieldBox.width / 2, fieldBox.top + fieldBox.height / 2)
      : null;
    return {
      open: search?.classList.contains('open') ?? false,
      focused: document.activeElement === field,
      keys: Boolean(search?.querySelector('.sf-admin-menu-search-keys')),
      esc: search?.querySelector('.sf-admin-menu-search-kbd')?.textContent?.trim() ?? null,
      listbox: Boolean(search?.querySelector('#sf-admin-search-list[role="listbox"]')),
      insidePanel: fieldBox
        ? Math.round(fieldBox.left - panelBox.left) >= 0 && Math.round(panelBox.right - fieldBox.right) >= 0
        : null,
      panelOverMenu: Math.round(panelBox.left - rootBox.left) === 0
        && Math.round(panelBox.right - rootBox.right) === 0,
      fieldAtItsOwnPoint: Boolean(centre && (centre === field || field.contains(centre) || centre.contains(field))),
      title: search?.querySelector('.sf-admin-menu-head .sf-admin-menu-back span span:last-child')
        ?.textContent?.trim() ?? null,
      viewport: window.innerWidth,
    };
  });
  const panel = await readPanel();
  if (!panel.open) note({case: 'shortcut', expected: 'Ctrl+K opens the panel'});
  if (!panel.focused) note({case: 'shortcut', expected: 'the field has the focus'});
  if (!panel.keys || panel.esc !== 'Esc') note({case: 'panel', got: panel, expected: 'the key hints and the Esc hint'});
  if (!panel.listbox) note({case: 'panel', expected: 'a listbox for the results'});
  if (panel.insidePanel !== true) note({case: 'panel', got: panel, expected: 'the field inside the panel'});
  if (!panel.panelOverMenu || !panel.fieldAtItsOwnPoint) {
    note({case: 'panel', got: panel, expected: 'the open panel standing over the menu, and the field visible in it'});
  }
  if (panel.title !== 'Поиск') {
    note({case: 'panel', got: panel.title, expected: 'the panel named beside the arrow'});
  }
  // And the same, at a width where a narrow-screen rule cannot cover for it.
  // The panel and the menu both animate their width, so the box is waited for
  // rather than slept on: a settled box that is wrong is the failure, not a box
  // measured mid-transition.
  for (const width of [420, 1296]) {
    await page.setViewportSize({width, height: 900});
    let wide = null;
    for (let waited = 0; waited < 2000; waited += 100) {
      await page.waitForTimeout(100);
      wide = await readPanel();
      if (wide.panelOverMenu) break;
    }
    if (!wide.panelOverMenu || !wide.fieldAtItsOwnPoint || wide.title !== 'Поиск') {
      note({case: 'panel at a width', got: wide, expected: 'the panel over the menu at every width'});
    }
  }
  await page.setViewportSize({width: 1200, height: 800});
  await page.waitForTimeout(250);

  // 4. The sections group finds a nested item by a stem, with the match marked
  // and the parent section named.
  await page.keyboard.type('роль');
  await page.waitForTimeout(400);
  const found = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#m .sf-admin-menu-search-row')];
    const first = rows[0];
    return {
      count: rows.length,
      text: first?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      mark: first?.querySelector('mark')?.textContent ?? null,
      selected: first?.getAttribute('aria-selected'),
      active: document.querySelector('input[role="combobox"]')?.getAttribute('aria-activedescendant'),
      firstId: first?.id ?? null,
    };
  });
  if (!found.count) note({case: 'sections', expected: 'роль finds Роли'});
  if (found.mark !== 'Рол') note({case: 'sections', got: found, expected: 'the matched part marked'});
  if (!/Безопасность/u.test(found.text ?? '')) {
    note({case: 'sections', got: found.text, expected: 'the section it sits in named under it'});
  }
  if (found.active !== found.firstId || found.selected !== 'true') {
    note({case: 'sections', got: found, expected: 'the first row selected and named by the field'});
  }

  // ё and е are the same letter for a search.
  await page.evaluate(() => {
    const field = document.querySelector('input[role="combobox"]');
    field.value = 'платёж';
    field.dispatchEvent(new Event('input', {bubbles: true}));
  });
  // Wait for the list to answer this query rather than for a duration: the debounce restarts whenever the
  // field is re-rendered under the typing, so a fixed pause can still read the previous query's rows.
  const yo = await page.evaluate(async () => {
    const rows = () => [...document.querySelectorAll('#m .sf-admin-menu-search-row')]
      .map((row) => row.textContent.replace(/\s+/gu, ' ').trim());
    for (let waited = 0; waited < 3000; waited += 50) {
      const now = rows();
      if (now.length && !now.some((text) => text.includes('Роли'))) {
        return now;
      }
      await new Promise((done) => setTimeout(done, 50));
    }
    return rows();
  });
  if (!yo.some((text) => text.includes('Платежи'))) {
    note({case: 'ё', got: yo, expected: 'платёж finds Платежи'});
  }

  // 5. The host answers one request, and a stale answer is dropped.
  const hosted = await page.evaluate(async () => {
    const menu = document.getElementById('m');
    // Let the request from the previous typing drain first: otherwise it lands
    // in this listener and the test reads someone else's query.
    await new Promise((done) => setTimeout(done, 500));
    const seen = [];
    menu.addEventListener('sf-admin-menu-search', (event) => seen.push({...event.detail}));
    const field = document.querySelector('input[role="combobox"]');
    field.value = 'роль';
    field.dispatchEvent(new Event('input', {bubbles: true}));
    // Wait for the request itself rather than for a duration: the debounce
    // restarts whenever the field is re-rendered under the typing.
    for (let waited = 0; waited < 3000 && !seen.length; waited += 50) {
      await new Promise((done) => setTimeout(done, 50));
    }
    await new Promise((done) => setTimeout(done, 350));
    const first = seen[seen.length - 1];
    // While the host is answering the two waiting rows stand where its results
    // will stand, so they must measure like a result row, not like a block.
    const waiting = [...document.querySelectorAll('#m .sf-admin-menu-search-skeleton')]
      .map((one) => Math.round(one.getBoundingClientRect().height));
    const stale = menu.setSearchResults('search-does-not-exist', [
      {key: 'stale', label: 'Stale', items: [{text: 'Stale row', href: '/admin/stale'}]},
    ]);
    const fresh = menu.setSearchResults(first?.requestId, [
      {key: 'people', label: 'Люди', more: {text: 'Все результаты', href: '/admin/people'},
       items: [
         {text: 'Ольга', subtext: 'Администратор', icon: 'person', href: '/admin/people/1'},
         {text: 'Другой сайт', href: 'https://example.test/evil'},
       ]},
    ]);
    await new Promise((done) => setTimeout(done, 250));
    const groups = [...document.querySelectorAll('#m .sf-admin-menu-search-group-head')]
      .map((head) => head.textContent.replace(/\s+/gu, ' ').trim());
    const rows = [...document.querySelectorAll('#m .sf-admin-menu-search-row')]
      .map((row) => row.textContent.replace(/\s+/gu, ' ').trim());
    return {requests: seen.length, query: first?.query, waiting, stale, fresh, groups, rows,
      more: Boolean(document.querySelector('#m .sf-admin-menu-search-group-head a'))};
  });
  if (hosted.query !== 'роль') note({case: 'host', got: hosted, expected: 'the query it asked about'});
  if (hosted.stale !== false) note({case: 'host', expected: 'a stale answer is refused'});
  if (hosted.fresh !== true) note({case: 'host', expected: 'the answer to the last request is taken'});
  if (!hosted.rows.some((text) => text.includes('Ольга'))) {
    note({case: 'host', got: hosted.rows, expected: 'the host row shown'});
  }
  if (hosted.rows.some((text) => text.includes('Другой сайт'))) {
    note({case: 'host', got: hosted.rows, expected: 'a result naming another origin is not rendered'});
  }
  if (!hosted.more) note({case: 'host', expected: 'the all-results link of the group'});
  if (hosted.waiting.length !== 2 || hosted.waiting.some((height) => height < 24 || height > 48)) {
    note({case: 'host', got: hosted.waiting, expected: 'two waiting rows the size of a result row'});
  }

  // 6. The arrows move the selection and wrap; Escape returns the focus.
  const keyboard = await page.evaluate(async () => {
    const field = document.querySelector('input[role="combobox"]');
    const ids = () => [...document.querySelectorAll('#m .sf-admin-menu-search-row')].map((row) => row.id);
    const active = () => field.getAttribute('aria-activedescendant');
    const before = active();
    field.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
    await new Promise((done) => setTimeout(done, 120));
    const afterDown = active();
    const rows = ids();
    for (let step = 0; step < rows.length; step += 1) {
      field.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
      await new Promise((done) => setTimeout(done, 40));
    }
    const wrapped = active();
    field.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    await new Promise((done) => setTimeout(done, 350));
    return {
      before, afterDown, wrapped, rows: rows.length,
      closed: !document.querySelector('#m .sf-admin-menu-panel-search')?.classList.contains('open'),
      // The main menu is inert behind the open submenu, so the focus cannot go
      // to the magnifier: it goes to the place the user is standing in.
      focusedBack: Boolean(document.activeElement?.classList?.contains('sf-admin-menu-back')),

    };
  });
  if (keyboard.afterDown === keyboard.before) note({case: 'keyboard', expected: 'the arrow moves the selection'});
  if (keyboard.wrapped !== keyboard.afterDown) {
    note({case: 'keyboard', got: keyboard, expected: 'the selection wraps round the list'});
  }
  if (!keyboard.closed) note({case: 'keyboard', expected: 'Escape closes the panel'});
  if (!keyboard.focusedBack) {
    note({case: 'keyboard', got: keyboard, expected: 'the focus lands in the submenu behind the panel'});
  }
  await page.close();

  // 6b. The focus comes back to the magnifier — measured on a page where the
  // main menu is the thing behind the panel. With a submenu open the main menu
  // is inert while the panel is up, and the magnifier is rightly unreachable.
  const returning = await open();
  const back = await returning.evaluate(async () => {
    const menu = document.getElementById('m');
    const toggle = document.querySelector('#m [data-sf-admin-search-toggle]');
    toggle.click();
    await new Promise((done) => setTimeout(done, 400));
    const opened = Boolean(document.querySelector('#m .sf-admin-menu-panel-search.open'));
    document.querySelector('input[role="combobox"]')
      .dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    await new Promise((done) => setTimeout(done, 400));
    const active = document.activeElement;
    return {opened, focused: Boolean(active?.closest?.('[data-sf-admin-search-toggle]')),
      active: active?.tagName + '.' + (active?.className || '')};
  });
  if (!back.opened || !back.focused) {
    note({case: 'keyboard', got: back, expected: 'Escape gives the focus back to the magnifier'});
  }
  await returning.close();

  // 6c. An empty field: the host's recent list and the hint under it. And the
  // collapsed menu that carried the panel is collapsed again when it closes.
  const empty = await open(menuMarkup.replace('searchable="true"', 'searchable="true" search-hint="Начните вводить название раздела"'));
  const resting = await empty.evaluate(async () => {
    const menu = document.getElementById('m');
    menu.setCompact(true, 'test');
    await new Promise((done) => setTimeout(done, 300));
    menu.setRecentResults([
      {key: 'recent', label: 'Недавние', items: [
        {text: 'Платежи', subtext: 'Вчера', icon: 'payments', href: '/admin/payments'},
        {text: 'Другой сайт', href: 'https://example.test/evil'},
      ]},
    ]);
    document.querySelector('#m [data-sf-admin-search-toggle]').click();
    await new Promise((done) => setTimeout(done, 450));
    const field = document.querySelector('input[role="combobox"]');
    const groups = [...document.querySelectorAll('#m .sf-admin-menu-search-group-head')]
      .map((head) => head.textContent.replace(/\s+/gu, ' ').trim());
    const rows = [...document.querySelectorAll('#m .sf-admin-menu-search-row')]
      .map((row) => row.textContent.replace(/\s+/gu, ' ').trim());
    const opened = {
      compact: menu.getProp('compact'), groups, rows,
      hint: document.querySelector('#m .sf-admin-menu-search-hint')?.textContent?.trim() || null,
      skeletons: document.querySelectorAll('#m .sf-admin-menu-search-skeleton').length,
      selected: field.getAttribute('aria-activedescendant'),
    };
    field.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    await new Promise((done) => setTimeout(done, 450));

    return {...opened, compactAfter: menu.getProp('compact'),
      panelAfter: Boolean(document.querySelector('#m .sf-admin-menu-panel-search.open'))};
  });
  if (resting.compact !== false || resting.groups.join() !== 'Недавние'
      || resting.rows.length !== 1 || !resting.rows[0].includes('Платежи')
      || !resting.hint || resting.skeletons !== 0 || !resting.selected) {
    note({case: 'recent', got: resting, expected: 'the recent group, the hint under it, no skeletons, a selected row'});
  }
  if (resting.panelAfter || resting.compactAfter !== true) {
    note({case: 'recent', got: resting, expected: 'the collapsed menu comes back when the panel closes'});
  }
  await empty.close();

  // 6d. The dark theme paints the mark and the selected row differently from
  // the panel behind them -- the request asks for both themes to be readable.
  const dark = await open();
  const painted = await dark.evaluate(async () => {
    document.documentElement.classList.replace('theme-light', 'theme-dark');
    const menu = document.getElementById('m');
    menu.openSearchPanel();
    await new Promise((done) => setTimeout(done, 400));
    menu.search('роль');
    for (let waited = 0; waited < 2000; waited += 50) {
      if (document.querySelector('#m .sf-admin-menu-search-row mark')) break;
      await new Promise((done) => setTimeout(done, 50));
    }
    const row = document.querySelector('#m .sf-admin-menu-search-row');
    if (!row) return {missing: 'a section row for роль'};
    const mark = row?.querySelector('mark');
    const panel = document.querySelector('#m .sf-admin-menu-panel-search');
    const read = (node, property) => getComputedStyle(node)[property];

    // And the panel itself in the dark: a surface of its own, standing over the
    // menu, with a title that is not the colour of what it stands on.
    const root = menu.querySelector('.sf-admin-menu') ?? menu;
    const panelBox = panel.getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    const title = panel.querySelector('.sf-admin-menu-head .sf-admin-menu-back span span:last-child');
    return {
      panel: read(panel, 'backgroundColor'),
      rowBackground: read(row, 'backgroundColor'),
      markBackground: mark ? read(mark, 'backgroundColor') : null,
      markColor: mark ? read(mark, 'color') : null,
      selected: row?.getAttribute('aria-selected'),
      panelOverMenu: Math.round(panelBox.left - rootBox.left) === 0
        && Math.round(panelBox.right - rootBox.right) === 0,
      titleText: title?.textContent?.trim() ?? null,
      titleColour: title ? read(title, 'color') : null,
    };
  });
  if (painted.missing || !painted.markBackground || painted.markBackground === 'rgba(0, 0, 0, 0)'
      || painted.markBackground === painted.panel
      || painted.rowBackground === painted.panel
      || painted.selected !== 'true') {
    note({case: 'dark theme', got: painted, expected: 'the mark and the selected row stand out of the panel'});
  }
  await dark.close();

  console.error(JSON.stringify({dark: painted}));
  if (!painted.panelOverMenu || !painted.titleText
      || painted.titleColour === painted.panel) {
    note({case: 'dark theme', got: painted, expected: 'the panel over the menu with a readable title in the dark'});
  }

  // 6e. Another root size. The submenu and the search headers stand in for the
  // logo header, and their height is measured from it rather than taken from a
  // token, so a root size the consumer has not tried is where that would show.
  // 16px and 20px as the root; '87.5%' as the consumer's own declaration, which
  // is 14px at a 16px browser default; and 17.5px, the size that same
  // declaration computes to when the person's browser default is 20px.
  for (const rootSize of ['16px', '20px', '87.5%', '17.5px']) {
    const scaled = await open(menuMarkup, rootSize);
    const measured = await scaled.evaluate(async () => {
      const menu = document.getElementById('m');
      const root = menu.querySelector('.sf-admin-menu') ?? menu;
      const logoHead = menu.querySelector('.sf-admin-menu-panel:not(.sf-admin-menu-panel-sub, .sf-admin-menu-panel-search) .sf-admin-menu-head');
      const logoHeight = Math.round(logoHead.getBoundingClientRect().height);
      menu.openSearchPanel();
      await new Promise((done) => setTimeout(done, 450));
      const panel = menu.querySelector('.sf-admin-menu-panel-search');
      const head = panel.querySelector('.sf-admin-menu-head');
      const field = panel.querySelector('input[role="combobox"]');
      const panelBox = panel.getBoundingClientRect();
      const rootBox = root.getBoundingClientRect();
      const fieldBox = field?.getBoundingClientRect();
      const centre = fieldBox
        ? document.elementFromPoint(fieldBox.left + fieldBox.width / 2, fieldBox.top + fieldBox.height / 2)
        : null;
      return {
        rootSize: getComputedStyle(document.documentElement).fontSize,
        logoHeight,
        headHeight: Math.round(head.getBoundingClientRect().height),
        panelOverMenu: Math.round(panelBox.left - rootBox.left) === 0
          && Math.round(panelBox.right - rootBox.right) === 0,
        fieldAtItsOwnPoint: Boolean(centre && (centre === field || field.contains(centre) || centre.contains(field))),
        title: head.querySelector('.sf-admin-menu-back span span:last-child')?.textContent?.trim() ?? null,
        fieldInside: fieldBox
          ? Math.round(fieldBox.left - panelBox.left) >= 0 && Math.round(panelBox.right - fieldBox.right) >= 0
          : null,
      };
    });
    console.error(JSON.stringify({[`root ${rootSize}`]: measured}));
    if (!measured.panelOverMenu || !measured.fieldAtItsOwnPoint || measured.title !== 'Поиск'
        || !measured.fieldInside || Math.abs(measured.headHeight - measured.logoHeight) > 1) {
      note({case: `root ${rootSize}`, got: measured,
        expected: 'the panel over the menu, the field in it, and the header the height of the logo header'});
    }
    await scaled.close();
  }

  // 7. Without the mode, the page keeps the row it has.
  const legacy = await open(menuMarkup.replace(' search-mode="panel"', ''));
  const row = await legacy.evaluate(() => ({
    row: Boolean(document.querySelector('#m .sf-admin-menu-search sf-input')),
    toggle: Boolean(document.querySelector('#m [data-sf-admin-search-toggle]')),
  }));
  if (!row.row || row.toggle) {
    note({case: 'default mode', got: row, expected: 'the search row, and no magnifier'});
  }
  await legacy.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('ADMIN_MENU_SEARCH_OK');
