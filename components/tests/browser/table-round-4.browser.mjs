#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Round four, measured on the built bytes: the guide on the separator, the pins
// answering, the footer in one row, the menus under their buttons, a notice that
// covers no control, and one indicator on the first load.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'component/component/inputs/css/inputs.css',
  'component/component/context-menu/css/context-menu.css',
  'component/component/toast/css/toast.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js', 'smart/smart/buttons/js/buttons.js',
  'smart/smart/icon-buttons/js/icon-buttons.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/inputs/js/inputs.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/close/js/close.js', 'smart/smart/toast/js/toast.js',
  'smart/smart/context-menu/js/context-menu.js', 'smart/smart/tabs/js/tabs.js',
  'smart/smart/tags/js/tags.js', 'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js', 'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

// The consumer's own page shape: a root size of 87.5% and a host total in the
// markup, so the first load can be measured the way they see it.
const open = async (delay = 60) => {
  const page = await browser.newPage({viewport: {width: 1400, height: 900}});
  await page.setContent(
    `<!doctype html><html class="theme-light" lang="ru" style="font-size:87.5%"><head><base href="http://admin.test/"></head>
     <body style="margin:0"><div style="width:1200px">
       <sf-data-view id="v">
         <sf-table slot="content" id="t"></sf-table>
         <sf-pagination slot="pagination" id="p" page-size="20" current="5" total="450"></sf-pagination>
       </sf-data-view>
     </div></body></html>`,
  );
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  await page.addStyleTag({content: '.sf-icon{display:inline-block;inline-size:1.25rem;block-size:1.25rem}'});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(900);
  await page.evaluate(async (wait) => {
    const view = document.getElementById('v');
    window.raised = [];
    window.refuse = false;
    view.setHostPort({
      version: '1.4.0',
      capabilities: ['row-actions', 'saved-views', 'shared-column-settings', 'bulk-under-filter'],
      async raise(intent, payload) {
        window.raised.push({intent, payload: JSON.parse(JSON.stringify(payload ?? {}))});
        await new Promise((done) => setTimeout(done, wait));
        if (window.refuse && intent !== 'query.change') {
          return {answer: 'refused', reason: 'minimal_cms_action_rejected'};
        }
        if (intent !== 'query.change') return {answer: 'applied'};
        return {answer: 'applied', sequence: payload.sequence, data: {
          records: Array.from({length: 6}, (_, index) => ({
            id: String(index + 1), code: 'C' + index, title: 'Title ' + index,
            section: 'S' + index, revision: 'r1', actions: ['view', 'publish'],
          })),
          total: 450,
          columns: [
            {key: 'code', label: 'Код решения', width: 200},
            {key: 'title', label: 'Название', role: 'title', width: 300},
            {key: 'section', label: 'Раздел', width: 200},
          ],
          echo: {search: '', filters: {}, sort: [], page: 5, per_page: 20},
          column_settings: {target: 'personal', layers: {personal: {revision: 's1', columns: {}}}},
        }};
      },
    });
  }, delay);
  return page;
};

const centre = (page, code) => page.evaluate((source) => {
  const node = new Function('return ' + source)()();
  const control = node?.matches?.('button, input, a') ? node
    : node?.querySelector?.('button, input, a') || node?.shadowRoot?.querySelector?.('button, input, a') || node;
  const rect = control?.getBoundingClientRect();
  return rect && (rect.width || rect.height) ? {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2} : null;
}, code);

try {
  // 6. The first load: the rows it waits for as skeletons (owner, 2026-10-12,
  // which replaced the one centred spinner), the words read in a status and
  // not printed, no English word, no zeros in the footer.
  {
    const page = await open(1500);
    await page.waitForTimeout(300);
    const first = await page.evaluate(() => {
      const table = document.querySelector('#t');
      const skeleton = table?.querySelector('tbody.sf-table-skeleton');
      const status = table?.querySelector('[role="status"]');
      const footer = document.querySelector('#p .sf-pagination-main')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
      const printed = (skeleton?.textContent ?? '').replace(/\s+/gu, ' ').trim();
      return {
        rows: skeleton?.querySelectorAll('tr').length ?? 0,
        bars: skeleton?.querySelectorAll('.sf-skeleton-text').length ?? 0,
        hidden: skeleton ? [...skeleton.querySelectorAll('tr')].every((row) => row.getAttribute('aria-hidden') === 'true') : false,
        printed: printed.slice(0, 40),
        label: status?.textContent?.trim() ?? null,
        english: /Loading/u.test(table?.textContent ?? ''),
        spinners: table?.querySelectorAll('tbody sf-spinner').length ?? 0,
        footer: footer.slice(0, 80),
        zeros: /0\/0|Всего: 0/u.test(footer),
        marked: /Отмечено/u.test(footer),
      };
    });
    if (first.english || first.rows !== 6 || first.bars < 6 || !first.hidden || first.printed || first.spinners
      || first.zeros || first.marked || !first.label) {
      note({case: 'first load', got: first, expected: 'six skeleton rows hidden from a reader, the words in a status, and no zeros in the footer'});
    }
    await page.close();
  }

  const page = await open();
  await page.waitForTimeout(900);

  // 1. The guide continues the header's separator.
  const guide = await (async () => {
    const at = await centre(page, `() => document.querySelector('#t thead th[data-key="code"] [data-sf-column-resizer]')`);
    if (!at) return {strip: 'not hittable'};
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(250);
    const read = () => page.evaluate(() => {
      const line = document.querySelector('#t .sf-table-resize-guide');
      const th = document.querySelector('#t thead th[data-key="code"]');
      const cell = th.getBoundingClientRect();
      const box = line?.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(th).borderInlineEndWidth) || 0;
      return {
        hidden: line?.hidden ?? null,
        // The separator is the cell's border: its own left edge.
        separatorLeft: Math.round((cell.right - border) * 100) / 100,
        lineLeft: box ? Math.round(box.left * 100) / 100 : null,
        off: box ? Math.round((box.left - (cell.right - border)) * 100) / 100 : null,
      };
    });
    const onHover = await read();
    await page.mouse.down();
    await page.mouse.move(at.x + 60, at.y, {steps: 5});
    await page.waitForTimeout(120);
    const mid = await read();
    await page.mouse.up();
    await page.waitForTimeout(150);
    return {onHover, mid};
  })();
  for (const [when, measured] of Object.entries(guide)) {
    if (!measured || measured.hidden !== false || Math.abs(measured.off ?? 9) > 0.5) {
      note({case: `guide ${when}`, got: measured, expected: 'the line on the separator, within half a pixel'});
    }
  }

  // 2. The pins answer, the handles are there, the search filters, no tab title.
  const settings = await (async () => {
    const gear = await centre(page, `() => document.querySelector('#t [aria-label="Настройки"]')`);
    if (!gear) return {gear: 'not found'};
    await page.mouse.click(gear.x, gear.y);
    await page.waitForTimeout(500);
    const state = () => page.evaluate(() => {
      const rows = [...document.querySelectorAll('sf-context-menu [data-column-key]')];
      return {
        rows: rows.map((row) => ({
          key: row.dataset.columnKey, pinned: row.dataset.pinned,
          pressed: row.querySelector('[icon="push_pin"]')?.getAttribute('aria-pressed') ?? null,
          handle: Boolean(row.querySelector('[data-move]')),
        })),
        // The one-tab title went (2026-10-05); the two tabs «Поля» and «Вид»
        // came (owner, 2026-10-14) and are the settings' own, counted apart.
        tabs: document.querySelectorAll('sf-context-menu sf-tabs:not(.sf-context-menu-tabs)').length,
        search: Boolean(document.querySelector('sf-context-menu [name="sf_table_column_search"]')),
        pinnedByTable: document.getElementById('t').getPinnedColumnKeys?.() ?? null,
      };
    });
    const before = await state();
    const pin = await centre(page, `() => [...document.querySelectorAll('sf-context-menu [data-column-key]')].find((row) => row.dataset.columnKey === 'code')?.querySelector('[icon="push_pin"]')`);
    if (pin) await page.mouse.click(pin.x, pin.y);
    await page.waitForTimeout(500);
    const after = await state();
    // And the search over the names.
    const field = await centre(page, `() => document.querySelector('sf-context-menu [name="sf_table_column_search"]')`);
    let filtered = null;
    if (field) {
      await page.mouse.click(field.x, field.y);
      await page.keyboard.type('раздел');
      await page.waitForTimeout(400);
      filtered = await page.evaluate(() => [...document.querySelectorAll('sf-context-menu [data-column-key]')].map((row) => row.dataset.columnKey));
    }
    return {before, after, filtered};
  })();
  {
    const titled = settings.before?.rows?.find((row) => row.key === 'title');
    const code = settings.after?.rows?.find((row) => row.key === 'code');
    if (titled?.pressed !== 'true') {
      note({case: 'pins', got: settings.before, expected: 'the pinned column reads as pinned'});
    }
    if (code?.pressed !== 'true' || code?.pinned !== '1') {
      note({case: 'pins', got: settings.after, expected: 'a press shows at once on the pin it was given to'});
    }
    if (!settings.before?.rows?.every((row) => row.handle)) {
      note({case: 'pins', got: settings.before, expected: 'a handle on every row'});
    }
    if (settings.before?.tabs !== 0 || settings.before?.search !== true) {
      note({case: 'pins', got: settings.before, expected: 'no tab title, and a search field'});
    }
    if (!settings.filtered || settings.filtered.join() !== 'section') {
      note({case: 'column search', got: settings.filtered, expected: 'the list filtered to the field searched for'});
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // 3. The footer in one row.
  const footer = await page.evaluate(() => {
    const main = document.querySelector('#p .sf-pagination-main');
    const text = main?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
    const field = main?.querySelector('.sf-pagination-page-input');
    const list = main?.querySelector('.sf-pagination-list');
    const numbers = [...(list?.querySelectorAll('.sf-pagination-item') ?? [])]
      .filter((item) => !item.classList.contains('sf-pagination-item-field'));
    return {
      text: text.slice(0, 110),
      marked: /Отмечено/u.test(text),
      ofN: /из \d/u.test(text),
      fieldBetweenArrows: Boolean(list?.querySelector('.sf-pagination-item-field .sf-pagination-page-input')),
      numbersLeft: numbers.filter((item) => /^\d+$/u.test(item.textContent.trim())).length,
      showMoreRow: Boolean(document.querySelector('#p .sf-pagination-top')),
      showMoreInFooter: Boolean(main?.querySelector('.sf-pagination-more sf-button')),
      hasField: Boolean(field),
    };
  });
  if (footer.marked || footer.ofN || !footer.fieldBetweenArrows || footer.numbersLeft > 0
      || footer.showMoreRow || !footer.showMoreInFooter) {
    note({case: 'footer', got: footer, expected: 'one row: no marked count, the field between the arrows, Show more beside them'});
  }

  // 4. The menus stay under their buttons.
  for (const [name, locate, setup] of [
    ['create', `() => [...document.querySelectorAll('#t sf-icon-button')].find((one) => one.getAttribute('aria-label') === 'Дополнительные действия создания')`,
      () => page.evaluate(() => document.getElementById('t').setCreateItems([{id: 'page', name: 'Запись'}, {id: 'folder', name: 'Раздел'}]))],
    ['toolbar', `() => [...document.querySelectorAll('#t sf-icon-button')].find((one) => one.getAttribute('aria-label') === 'Действия с представлением')`,
      () => page.evaluate(() => document.getElementById('t').setToolbarActions([{id: 'a', label: 'Настройки списка'}, {id: 'b', label: 'Удалённые элементы'}]))],
  ]) {
    await setup();
    await page.waitForTimeout(350);
    const at = await centre(page, locate);
    if (!at) { note({case: `menu ${name}`, expected: 'the control exists'}); continue; }
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(450);
    const placed = await page.evaluate((source) => {
      const node = new Function('return ' + source)()();
      const control = node?.querySelector('button') ?? node;
      const button = control.getBoundingClientRect();
      const surface = document.querySelector('sf-context-menu .sf-context-menu');
      const box = surface?.getBoundingClientRect();
      return box ? {
        underButton: Math.round(box.top) >= Math.round(button.bottom) - 2,
        endAligned: Math.abs(Math.round(box.right - button.right)) <= 2,
        pastTheButton: Math.round(box.right - button.right),
      } : null;
    }, locate);
    if (!placed?.underButton || !placed?.endAligned) {
      note({case: `menu ${name}`, got: placed, expected: 'under the button, aligned to its end edge'});
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }

  // 5. The notice covers no control.
  const notice = await page.evaluate(async () => {
    window.refuse = true;
    const table = document.getElementById('t');
    const toolbar = table.querySelector('.sf-table-toolbar') ?? table.querySelector('[class*="toolbar"]');
    const boxes = [...table.querySelectorAll('.sf-table-toolbar sf-button, .sf-table-toolbar sf-input, .sf-table-toolbar sf-icon-button')]
      .map((one) => (one.querySelector('button, input') ?? one).getBoundingClientRect());
    table.requestActionIntent('publish', ['1']);
    await new Promise((done) => setTimeout(done, 700));
    // The page's notification area since SF.notify (2026-10-13); the band over
    // the card on an older Framework.
    const toast = document.querySelector('.sf-notifications .sf-toast')
      ?? document.querySelector('sf-data-view > [slot="notice"] sf-toast');
    const root = toast?.querySelector('.sf-toast') ?? toast;
    const box = root?.getBoundingClientRect();
    const overlaps = (other) => box && other
      && !(box.bottom <= other.top || box.top >= other.bottom || box.right <= other.left || box.left >= other.right);
    return {
      shown: Boolean(toast), duration: toast?.getAttribute('duration') ?? toast?.dataset.duration ?? null,
      closable: toast?.getAttribute('closable') ?? null,
      title: toast?.getAttribute('title') ?? toast?.querySelector('.sf-toast-title, .sf-toast-text')?.textContent.trim() ?? null,
      code: toast?.getAttribute('data-sf-code') ?? window.SF?.notifications?.history?.()[0]?.source ?? null,
      coversToolbar: toolbar ? overlaps(toolbar.getBoundingClientRect()) : null,
      coversAControl: boxes.some((one) => overlaps(one)),
      position: root ? getComputedStyle(root.parentElement ?? root).position : null,
    };
  });
  if (!notice.shown || notice.coversToolbar || notice.coversAControl
      || notice.duration !== '7000' || notice.title === 'minimal_cms_action_rejected') {
    note({case: 'notice', got: notice, expected: 'a toast that covers no control, with a sentence and a life of its own'});
  }
  console.error(JSON.stringify({guide, settings, footer, notice}, null, 1));
  await page.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('TABLE_ROUND_4_OK');
