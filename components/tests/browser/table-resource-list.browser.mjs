#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Build output root is required: the free output with the set laid into
// smart/smart (scripts/run-browser-probes.mjs makes it).
//
// The list of resources (owner decision C31, 2026-11-09), on the built bytes,
// in the light and the dark theme, with a clean console:
// - the list roles: columns[].list draws the status dot (its word the
//   tooltip and the accessible text), the title over «domain · kind» (a
//   stopped resource's word first), the facts as badges without labels in
//   columns that line up, quiet when fine and warning or error when not, and
//   leaves a column without a role out;
// - the row of the ladder: 48 at size 1/2 and 56 at size 1 on the desktop,
//   52 on a phone; a table row with a supporting line at size 1/2 is two
//   text lines of its step, 40 (owner decision C146 (1), since 1.19.0; it
//   was 48, and 53 before), and so is the published two-line box (the row
//   model of the look points, table-look-points.browser.mjs);
// - the phone keeps only the most worrying fact (none when all is well), and
//   the quick actions fold into «more».
import {join, resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {COLUMNS, ROWS, ACTIONS} from '../fixtures/resource-list-fixture.mjs';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/dot/css/dot.css', 'component/component/tooltip/css/tooltip.css',
  'component/component/icon-buttons/css/icon-buttons.css', 'component/component/badges/css/badges.css',
  'component/component/context-menu/css/context-menu.css', 'component/component/buttons/css/buttons.css',
  'smart/smart/view-table/css/view-table.css', 'smart/smart/resizer/css/resizer.css',
].map((path) => join(out, path));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'component/component/tooltip/js/tooltip.js',
  'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js', 'smart/smart/button-icon/js/button-icon.js',
  'smart/smart/badge/js/badge.js', 'smart/smart/segmented/js/segmented.js', 'smart/smart/input/js/input.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/menu-context/js/menu-context.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/view-table/js/view-table.js',
].map((path) => join(out, path));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.slice(0, 3).join(', ')}`);

const failures = [];
const note = (theme, detail) => failures.push({theme, ...detail});
const browser = await chromium.launch();

async function stand({theme, width, height = 900, body, setup, density = ''}) {
  const page = await browser.newPage({viewport: {width, height}});
  // The theme the class names and the one the browser asks for agree.
  await page.emulateMedia({colorScheme: theme});
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error' && !/publicPath/u.test(message.text())) errors.push(message.text()); });
  // Scripts added by path have no address for webpack's automatic publicPath
  // (the same allowance as table-field-cells); every other error counts.
  page.on('pageerror', (error) => { if (!/publicPath/u.test(error.message)) errors.push(error.message); });
  await page.setContent(`<!doctype html><html class="theme-${theme}" lang="ru"${density ? ` data-sf-density="${density}"` : ''}><head><meta charset="utf-8"></head><body style="margin:0;background:var(--sf-surface-page)">${body}</body></html>`);
  for (const path of styles) await page.addStyleTag({path});
  for (const path of modules) await page.addScriptTag({path, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-view-table') && customElements.get('sf-badge')), null, {timeout: 10000});
  await page.evaluate(setup, {columns: COLUMNS, rows: ROWS, actions: ACTIONS});
  await page.waitForFunction(() => document.querySelectorAll('.sf-table-resource').length > 0
    || document.querySelectorAll('tbody tr[data-row-id]').length > 0, null, {timeout: 8000}).catch(() => {});
  // The page is drawn in the theme it was asked for.
  const drawn = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  if (drawn !== theme) errors.push(`the page is drawn in ${drawn}, not ${theme}`);
  await page.waitForTimeout(600);
  return {page, errors};
}

const feed = ({columns, rows, actions}) => {
  for (const table of document.querySelectorAll('sf-view-table')) {
    table.ACTIONS_SETTINGS_ROW = actions;
    table.setColumns(columns);
    table.setRows(rows);
  }
};

const read = () => {
  const length = (expression) => {
    const probe = document.createElement('div');
    probe.style.blockSize = expression;
    document.body.append(probe);
    const value = probe.getBoundingClientRect().height;
    probe.remove();
    return value;
  };
  const tables = {};
  for (const table of document.querySelectorAll('sf-view-table')) {
    const items = [...table.querySelectorAll('.sf-table-resource')];
    tables[table.id] = items.map((item) => {
      const dot = item.querySelector('.sf-table-resource-status .sf-dot');
      const facts = [...item.querySelectorAll('.sf-table-resource-fact')];
      const visibleFacts = facts.filter((fact) => fact.getBoundingClientRect().width > 0);
      const quick = item.querySelector('.sf-table-resource-quick');
      return {
        id: item.dataset.rowId,
        height: Math.round(item.getBoundingClientRect().height * 100) / 100,
        dot: dot ? [...dot.classList].find((name) => /^sf-dot--/u.test(name)) : null,
        dotWord: dot?.querySelector('.sf-table-visually-hidden')?.textContent.trim() ?? null,
        dotTip: dot?.parentElement?.querySelector('.sf-tooltip-text')?.textContent.trim() ?? null,
        dotSize: dot ? Math.round(dot.querySelector('.sf-dot-item').getBoundingClientRect().width) : null,
        title: item.querySelector('.sf-table-resource-title')?.textContent.trim() ?? null,
        titleLink: Boolean(item.querySelector('.sf-table-resource-title a.sf-table-title-link')),
        supporting: item.querySelector('.sf-table-resource-supporting')?.textContent.replace(/\s+/gu, ' ').trim() ?? null,
        facts: facts.map((fact) => {
          const badge = fact.querySelector('sf-badge');
          return {
            text: badge?.getAttribute('text') ?? null,
            status: badge?.getAttribute('status') ?? '',
            scheme: badge?.getAttribute('scheme') ?? '',
            label: fact.querySelector('.sf-table-visually-hidden')?.textContent.trim() ?? null,
            labelShown: (fact.querySelector('.sf-table-visually-hidden')?.getBoundingClientRect().width ?? 0) > 1,
            left: Math.round(fact.getBoundingClientRect().left),
            width: Math.round(fact.getBoundingClientRect().width),
            badgeHeight: Math.round(badge?.firstElementChild?.getBoundingClientRect().height ?? 0),
          };
        }),
        visibleFacts: visibleFacts.map((fact) => fact.querySelector('sf-badge')?.getAttribute('text')),
        quickShown: Boolean(quick && quick.getBoundingClientRect().width > 0),
        moreShown: (item.querySelector('.sf-table-resource-more')?.getBoundingClientRect().width ?? 0) > 0,
        menuIcon: item.querySelector('.sf-table-resource-more .sf-icon')?.textContent.trim() ?? null,
        text: item.textContent,
      };
    });
  }
  const rows = {};
  for (const table of document.querySelectorAll('sf-view-table[layout="table"]')) {
    rows[table.id] = [...table.querySelectorAll('tbody tr[data-row-id]')].map((tr) => Math.round(tr.getBoundingClientRect().height * 100) / 100);
  }
  const cells = [...document.querySelectorAll('#cells tbody tr[data-row-id]')].map((tr) => {
    const fact = (key) => {
      const badge = tr.querySelector(`td[data-key="${key}"] sf-badge`);
      return badge ? {text: badge.getAttribute('text'), status: badge.getAttribute('status') ?? '',
        tip: tr.querySelector(`td[data-key="${key}"] .sf-tooltip-text`)?.textContent.trim() ?? null} : null;
    };
    const dot = tr.querySelector('td[data-key="state"] .sf-dot');
    return {id: tr.dataset.rowId, dot: dot ? [...dot.classList].find((name) => /^sf-dot--/u.test(name))?.slice(8) : null,
      word: tr.querySelector('td[data-key="state"]')?.textContent.trim() ?? null, ssl: fact('ssl'), backup: fact('backup')};
  });
  return {
    tables, rows, cells,
    ladder: {row2: length('var(--sf-ui-2--control-height)'), row3: length('var(--sf-ui-3--control-height)')},
    published: getComputedStyle(document.documentElement).getPropertyValue('--sf-table-row-2-lines-block-size-1/2').trim(),
  };
};

const report = {};
try {
  for (const theme of ['light', 'dark']) {
    // The desktop: the list at size 1/2 and 1, and the table at 1/2.
    const desk = await stand({
      theme, width: 1280,
      body: '<div style="inline-size:1200px">'
        + '<sf-view-table id="half" size="1/2" layout="list" toolbar="false" selectable="false" quick-actions="visit,restart" aria-label="Сайты"></sf-view-table>'
        + '<sf-view-table id="one" size="1" layout="list" toolbar="false" selectable="false" quick-actions="visit,restart" aria-label="Сайты"></sf-view-table>'
        + '<sf-view-table id="grid" size="1/2" layout="table" toolbar="false" selectable="false" aria-label="Сайты"></sf-view-table>'
        + '<sf-view-table id="cells" size="1/2" layout="table" toolbar="false" selectable="false" aria-label="Сайты таблицей"></sf-view-table></div>',
      setup: (data) => {
        for (const table of document.querySelectorAll('sf-view-table')) {
          table.ACTIONS_SETTINGS_ROW = data.actions;
          if (table.id === 'grid') {
            table.setColumns([{key: 'name', label: 'Сайт', renderer: 'link'}, {key: 'kind', label: 'Тип'}]);
            table.setRows([{id: 'a', name: {text: 'Интернет-магазин', subtext: 'shop.simai.ru', href: '#a'}, kind: 'Laravel'},
              {id: 'b', name: {text: 'Блог', subtext: 'blog.simai.ru', href: '#b'}, kind: 'Static'}]);
          } else {
            table.setColumns(data.columns);
            table.setRows(data.rows);
          }
        }
      },
    });
    const desktop = await desk.page.evaluate(read);
    // A tooltip shows the status word on hover (the Framework's tooltip).
    await desk.page.hover('#half .sf-table-resource[data-row-id="shop"] .sf-dot');
    await desk.page.waitForTimeout(700);
    desktop.hoverTip = await desk.page.evaluate(() => {
      const surface = document.querySelector('#half .sf-table-resource[data-row-id="shop"] .sf-table-resource-status .sf-tooltip');
      return surface && !surface.hidden && surface.getBoundingClientRect().width > 0 ? surface.textContent.trim() : null;
    });
    desktop.errors = desk.errors;
    await desk.page.close();
    report[`${theme}-desktop`] = {...desktop, tables: {half: desktop.tables.half?.map(({text, ...rest}) => rest)}};

    const half = desktop.tables.half ?? [];
    const one = desktop.tables.one ?? [];
    if (half.length !== ROWS.length) note(theme, {said: 'the list does not hold every record', got: half.length});
    const expectedDots = {simai: 'sf-dot--success', shop: 'sf-dot--warning', demo: 'sf-dot--neutral', clinic: 'sf-dot--warning'};
    const words = {simai: 'Работает', shop: 'Есть замечания', demo: 'Остановлен', clinic: 'Есть замечания'};
    for (const row of half) {
      if (row.dot !== expectedDots[row.id] || row.dotWord !== words[row.id] || row.dotTip !== words[row.id]) {
        note(theme, {said: 'the status is not the dot with its word as tooltip and accessible text', row: row.id, got: [row.dot, row.dotWord, row.dotTip]});
      }
      if (row.dotSize !== 8) note(theme, {said: 'the dot is not 8 (--sf-a8)', row: row.id, got: row.dotSize});
      const source = ROWS.find((item) => item.id === row.id);
      const supporting = `${source.state === 'stopped' ? 'Остановлен · ' : ''}${source.domain} · ${source.kind}`;
      if (row.title !== source.name || !row.titleLink) note(theme, {said: 'the title is not the record\'s link', row: row.id, got: row.title});
      if (row.supporting !== supporting) note(theme, {said: 'the supporting line is not «domain · kind» (a stopped word first)', row: row.id, got: row.supporting, want: supporting});
      if (row.text.includes(source.owner)) note(theme, {said: 'a column without a list role is drawn in the list', row: row.id});
      if (row.facts.length !== 2 || row.facts.some((fact) => fact.labelShown || !fact.label)) {
        note(theme, {said: 'a fact shows its label, or has none for a screen reader', row: row.id, got: row.facts});
      }
      for (const [index, key] of ['ssl', 'backup'].entries()) {
        const want = source[key].status ?? '';
        const fact = row.facts[index];
        if (fact?.status !== want || (want ? fact.scheme : fact?.scheme !== 'neutral')) {
          note(theme, {said: 'a fact is not quiet when fine, or not warning/error when not', row: row.id, key, got: fact});
        }
      }
      if (row.height !== desktop.ladder.row2) note(theme, {said: 'a list row at size 1/2 is not the ladder\'s 48', row: row.id, got: row.height, want: desktop.ladder.row2});
      if (!row.quickShown || !row.moreShown || row.menuIcon !== 'more_horiz') note(theme, {said: 'a wide row does not show its quick actions and «more»', row: row.id, got: row});
    }
    // The facts stand in columns down the list.
    for (const index of [0, 1]) {
      const lefts = new Set(half.map((row) => row.facts[index]?.left));
      if (lefts.size !== 1) note(theme, {said: 'the facts do not line up down the list', index, got: [...lefts]});
    }
    if (one.some((row) => row.height !== desktop.ladder.row3)) note(theme, {said: 'a list row at size 1 is not the ladder\'s 56', got: one.map((row) => row.height)});
    if (desktop.ladder.row2 !== 48 || desktop.ladder.row3 !== 56) note(theme, {said: 'the desktop ladder is not 48/56', got: desktop.ladder});
    if (!(desktop.rows.grid?.length === 2 && desktop.rows.grid.every((height) => height === 40))) note(theme, {said: 'a table row of two lines at size 1/2 is not 40', got: desktop.rows.grid});
    // The box the page reserves says so (docs.md).
    if (desktop.published !== '40px') note(theme, {said: '--sf-table-row-2-lines-block-size-1/2 is not the two-line row\'s 40', got: desktop.published});
    if (desktop.hoverTip !== 'Есть замечания') note(theme, {said: 'the dot\'s tooltip does not show on hover', got: desktop.hoverTip});
    // The same columns as a table (C31 acceptance 1): a status is the dot
    // with its word, a fact its badge, quiet or warning/error, with its tip.
    const statusDots = {simai: ['success', 'Работает'], shop: ['warning', 'Есть замечания'], demo: ['neutral', 'Остановлен'], clinic: ['warning', 'Есть замечания']};
    for (const row of desktop.cells ?? []) {
      const source = ROWS.find((item) => item.id === row.id);
      if (row.dot !== statusDots[row.id][0] || row.word !== statusDots[row.id][1]) note(theme, {said: 'a status cell of the table is not the dot with its word', row: row.id, got: row});
      for (const key of ['ssl', 'backup']) {
        const want = {text: source[key].text, status: source[key].status ?? '', tip: source[key].tip ?? null};
        if (JSON.stringify(row[key]) !== JSON.stringify(want)) note(theme, {said: 'a fact cell of the table is not its badge', row: row.id, key, got: row[key], want});
      }
    }
    if ((desktop.cells ?? []).length !== ROWS.length) note(theme, {said: 'the table of the same columns does not draw every record', got: desktop.cells});
    if (desk.errors.length) note(theme, {said: 'the console is not clean (desktop)', errors: desk.errors});

    // The phone: the mobile row, the most worrying fact only, the actions in «more».
    const phone = await stand({
      theme, width: 390, height: 844,
      body: '<sf-view-table id="half" size="1/2" layout="auto" toolbar="false" selectable="false" quick-actions="visit,restart" aria-label="Сайты"></sf-view-table>',
      setup: feed,
    });
    const mobile = await phone.page.evaluate(read);
    mobile.errors = phone.errors;
    await phone.page.close();
    report[`${theme}-phone`] = {...mobile, tables: {half: mobile.tables.half?.map(({text, ...rest}) => rest)}};
    const rowsOnPhone = mobile.tables.half ?? [];
    const worst = {simai: [], shop: ['SSL · 6 дн'], demo: ['Копия · 12 дн'], clinic: ['SSL истёк']};
    if (rowsOnPhone.length !== ROWS.length) note(theme, {said: 'the phone does not draw the list', got: rowsOnPhone.length});
    for (const row of rowsOnPhone) {
      if (JSON.stringify(row.visibleFacts) !== JSON.stringify(worst[row.id])) note(theme, {said: 'the phone does not keep the most worrying fact only', row: row.id, got: row.visibleFacts});
      if (row.quickShown || !row.moreShown) note(theme, {said: 'the quick actions do not fold into «more» on the phone', row: row.id});
      if (row.height !== mobile.ladder.row3) note(theme, {said: 'a phone row is not the mobile ladder\'s 52', row: row.id, got: row.height, want: mobile.ladder.row3});
    }
    if (mobile.ladder.row3 !== 52) note(theme, {said: 'the mobile ladder is not 52', got: mobile.ladder});
    if (phone.errors.length) note(theme, {said: 'the console is not clean (phone)', errors: phone.errors});

    // Compact density (C22) on the root, a table without a size, desktop
    // (C31 acceptance 2, then the look points' row model): the ladder one
    // rung down -- 32 one line, 40 with a supporting line (C146 (1); 40 and
    // 48 to 1.18.x) -- and the published step-1 box says so.
    const dense = await stand({
      theme, width: 1440, density: 'compact',
      body: '<div style="inline-size:1200px"><sf-view-table id="dense" layout="table" toolbar="false" aria-label="Сайты"></sf-view-table></div>',
      setup: (data) => {
        const table = document.getElementById('dense');
        table.ACTIONS_SETTINGS_ROW = data.actions;
        table.setColumns([{key: 'name', label: 'Сайт', renderer: 'link'}, {key: 'kind', label: 'Тип'}]);
        table.setRows([{id: 'a', name: {text: 'Интернет-магазин', subtext: 'shop.simai.ru', href: '#a'}, kind: 'Laravel', actions: ['view', 'restart']},
          {id: 'b', name: {text: 'Блог', href: '#b'}, kind: 'Static', actions: ['view', 'restart']}]);
      },
    });
    const compact = await dense.page.evaluate(() => {
      const px = (name) => {
        const probe = document.createElement('div');
        probe.style.blockSize = `var(${name})`;
        document.body.append(probe);
        const value = probe.getBoundingClientRect().height;
        probe.remove();
        return value;
      };
      return {rows: [...document.querySelectorAll('#dense tbody tr[data-row-id]')].map((tr) => Math.round(tr.getBoundingClientRect().height * 100) / 100),
        menu: Boolean(document.querySelector('#dense tbody td[data-key="settings"] :is(button, sf-button-icon)')),
        published: {row: px('--sf-table-row-block-size-1'), twoLines: px('--sf-table-row-2-lines-block-size-1')}};
    });
    report[`${theme}-compact`] = compact;
    if (JSON.stringify(compact.rows) !== '[40,32]' || !compact.menu) note(theme, {said: 'compact density without a size does not draw the 40 and 32 rows', got: compact});
    if (compact.published.row !== 32 || compact.published.twoLines !== 40) note(theme, {said: 'the published step-1 box does not follow compact density', got: compact.published});
    if (dense.errors.length) note(theme, {said: 'the console is not clean (compact)', errors: dense.errors});
    await dense.page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({probe: 'table-resource-list', result: failures.length ? 'TABLE_RESOURCE_LIST_FAIL' : 'TABLE_RESOURCE_LIST_OK', failures, report}, null, 1));
if (failures.length) process.exit(1);
