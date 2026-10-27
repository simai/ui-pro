#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Round five, measured: both windows bounded to the viewport with their head and
// buttons in view and the list scrolling inside; a pin that applies on the spot,
// reaches the host and shows a filled mark; a drag that applies; a visibility
// tick that is not lost by closing the window; and the search inset like every
// other block in the window.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'component/component/inputs/css/inputs.css',
  'component/component/context-menu/css/context-menu.css',
  'component/component/checkbox/css/checkbox.css',
  'component/component/tabs/css/tabs.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/close/js/close.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/tag/js/tag.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

// Twenty-two fields, which is what makes the windows taller than the screen.
const FIELDS = Array.from({length: 22}, (_, index) => ({
  key: `f${index}`,
  label: `Поле ${index}`,
  filter: {enabled: true, control: 'text', defaultOperator: 'contains', operators: ['contains']},
}));

const open = async (height = 700) => {
  const page = await browser.newPage({viewport: {width: 1280, height}});
  await page.setContent(
    `<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">
       <div style="width:1200px"><sf-table id="t"></sf-table></div></body></html>`,
  );
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(1100);
  await page.evaluate((fields) => {
    const table = document.getElementById('t');
    window.saved = [];
    table.addEventListener('sf-table-column-settings-change', (event) => {
      window.saved.push(JSON.parse(JSON.stringify(event.detail ?? {})));
    });
    table.setColumns(fields.map((field) => ({key: field.key, label: field.label})));
    table.setRows([{id: '1', f0: 'a', f1: 'b'}]);
    table.setFilterFields(fields);
  }, FIELDS);
  await page.waitForTimeout(500);
  return page;
};

const openWindow = async (page, label) => {
  // The gear closes the window it opened (owner, 2026-10-15): one left open
  // by the step before is closed first, so the click opens it again.
  if (await page.evaluate(() => Boolean(document.querySelector('sf-context-menu .sf-table-context-menu')))) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  // The control's host is display: contents, so the click goes to the real
  // button inside it; matching by aria-label on the host finds the control
  // whatever element the template wraps it in.
  const opened = await page.evaluate((name) => {
    // A control with visible text carries it in `text` and has no aria-label;
    // an icon-only one carries the name in aria-label. Match either.
    const host = [...document.querySelectorAll('#t sf-button, #t sf-icon-button')]
      .find((node) => node.getAttribute('aria-label') === name || node.getAttribute('text') === name);
    const control = host?.querySelector('button') ?? host;
    control?.click();
    return Boolean(control);
  }, label);
  if (!opened) throw new Error(`no control labelled ${label}`);
  await page.waitForTimeout(700);
  const surface = await page.evaluate(() => Boolean(document.querySelector('sf-context-menu .sf-table-context-menu')));
  if (!surface) throw new Error(`the window ${label} did not open`);
};

try {
  // 1. Both windows fit the screen, with the head and the buttons in view, and
  //    nothing of the list is cut off: the column settings list scrolls, while
  //    the filter window's fields are laid out in columns and may simply fit.
  //    Measured at two heights, because a ceiling that only works on a tall
  //    screen is not a ceiling.
  for (const [label, headSelector] of [['Настройки', '.sf-table-column-search'], ['Фильтр', '.sf-tabs-top-container']]) {
    for (const height of [700, 460]) {
      const page = await open(height);
      await openWindow(page, label);
      if (label === 'Фильтр') {
        const switched = await page.evaluate(() => {
          const tabs = document.querySelector('sf-context-menu sf-tabs');
          const tab = [...(tabs?.querySelectorAll('.sf-tabs-top-container button') ?? [])]
            .find((node) => node.textContent.trim() === 'Поля');
          tab?.click();
          return Boolean(tab);
        });
        if (!switched) throw new Error('the filter window has no fields tab');
        await page.waitForTimeout(600);
      }
      const fit = await page.evaluate((head) => {
        const surface = document.querySelector('sf-context-menu .sf-table-context-menu');
        if (!surface) return null;
        const box = surface.getBoundingClientRect();
        const list = surface.querySelector('.sf-context-menu-columns');
        const bottom = surface.querySelector('.sf-context-menu-footer');
        const top = surface.querySelector(head);
        const visible = (node) => {
          const rect = node?.getBoundingClientRect();
          return rect ? rect.top >= -1 && rect.bottom <= window.innerHeight + 1 : null;
        };
        const listBox = list?.getBoundingClientRect();
        return {
          windowBottom: Math.round(box.bottom), viewport: window.innerHeight,
          insideScreen: Math.round(box.bottom) <= window.innerHeight,
          headVisible: visible(top), buttonsVisible: visible(bottom),
          // Either everything fits, or what does not fit can be scrolled to.
          listReachable: list
            ? (list.scrollHeight <= list.clientHeight + 1) || getComputedStyle(list).overflowY === 'auto'
            : null,
          listInsideWindow: listBox ? Math.round(listBox.bottom) <= Math.round(box.bottom) + 1 : null,
          pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
        };
      }, headSelector);
      if (!fit || !fit.insideScreen || fit.headVisible !== true || fit.buttonsVisible !== true
          || fit.listReachable !== true || fit.listInsideWindow !== true || fit.pageScrolls) {
        note({case: `window ${label} at ${height}`, got: fit, expected: 'inside the screen, head and buttons in view, the list reachable within the window, and no page scroll'});
      }
      await page.close();
    }
  }

  const page = await open(900);
  await openWindow(page, 'Настройки');

  // 2. A pin applies on the spot, reaches the host and shows a filled mark.
  const pins = await page.evaluate(async () => {
    const row = () => [...document.querySelectorAll('sf-context-menu [data-column-key]')]
      .find((item) => item.dataset.columnKey === 'f3');
    const read = () => {
      const node = row();
      const button = node?.querySelector('[icon="push_pin"]');
      return {
        pinned: node?.dataset.pinned,
        pressed: button?.getAttribute('aria-pressed'),
        filled: button?.hasAttribute('filled') || button?.getAttribute('filled') === '',
        glyph: button?.querySelector('.sf-icon') ? getComputedStyle(button.querySelector('.sf-icon')).fontVariationSettings : null,
      };
    };
    const before = read();
    row()?.querySelector('[icon="push_pin"] button')?.click();
    await new Promise((done) => setTimeout(done, 400));
    const table = document.getElementById('t');
    return {
      before, after: read(),
      saved: window.saved.length,
      committed: (table.getPinnedColumnKeys?.() ?? []).includes('f3'),
      // The draft is empty again: the press went into the settings themselves.
      draft: table.tempSettings ? Object.keys(table.tempSettings) : [],
    };
  });
  if (pins.after?.pinned !== '1' || pins.after?.pressed !== 'true' || pins.after?.filled !== true
      || pins.saved !== 1 || !pins.committed) {
    note({case: 'pin applies at once', got: pins, expected: 'pinned, pressed, filled, one change emitted, and committed to the settings'});
  }
  if (pins.before?.filled !== false) {
    note({case: 'pin look', got: pins.before, expected: 'a loose column shows an unfilled pin'});
  }

  // 3. The window has no «Применить» left, a tick applies on the spot, and
  //    «Сбросить» goes back to the state the window opened with -- the owner's
  //    rule of 2026-10-05: everything here applies as it is pressed.
  const atOnce = await page.evaluate(async () => {
    const table = document.getElementById('t');
    const surface = document.querySelector('sf-context-menu .sf-table-context-menu');
    const buttons = [...surface.querySelectorAll('.sf-context-menu-footer sf-button')]
      .map((node) => node.getAttribute('text'));
    const visible = () => (table.getColumns?.() ?? []).filter((col) => col.visible !== false).length;
    const before = {buttons, visible: visible(), saved: window.saved.length};

    const row = [...document.querySelectorAll('sf-context-menu [data-column-key]')]
      .find((item) => item.dataset.columnKey === 'f5');
    row?.querySelector('input[type="checkbox"]')?.click();
    await new Promise((done) => setTimeout(done, 400));
    const afterTick = {visible: visible(), saved: window.saved.length,
      draft: table.tempSettings ? Object.keys(table.tempSettings) : []};

    // A click away loses nothing now.
    document.body.click();
    await new Promise((done) => setTimeout(done, 300));
    const afterAway = {visible: visible(), windowClosed: !document.querySelector('sf-context-menu .sf-table-context-menu')};
    return {before, afterTick, afterAway};
  });
  if (atOnce.before?.buttons?.includes('Применить')) {
    note({case: 'no Apply left', got: atOnce.before, expected: 'the window commits as it goes, so it has no Apply'});
  }
  if (atOnce.afterTick?.visible !== atOnce.before.visible - 1
      || atOnce.afterTick?.saved !== atOnce.before.saved + 1
      || atOnce.afterTick?.draft.length !== 0) {
    note({case: 'tick applies at once', got: atOnce, expected: 'the column hides, one change is announced, nothing is left pending'});
  }
  if (atOnce.afterAway?.visible !== atOnce.afterTick.visible || !atOnce.afterAway?.windowClosed) {
    note({case: 'a click away loses nothing', got: atOnce, expected: 'the window closes and the state stays'});
  }

  // «Сбросить» returns to the state the window opened with, in one announcement.
  await openWindow(page, 'Настройки');
  const reset = await page.evaluate(async () => {
    const table = document.getElementById('t');
    const visible = () => (table.getColumns?.() ?? []).filter((col) => col.visible !== false).length;
    const pinned = () => (table.getPinnedColumnKeys?.() ?? []).filter((key) => !['select', 'settings'].includes(key));
    const opened = {visible: visible(), pinned: pinned().length};
    const row = (key) => [...document.querySelectorAll('sf-context-menu [data-column-key]')]
      .find((item) => item.dataset.columnKey === key);
    row('f7')?.querySelector('input[type="checkbox"]')?.click();
    await new Promise((done) => setTimeout(done, 300));
    row('f9')?.querySelector('[icon="push_pin"] button')?.click();
    await new Promise((done) => setTimeout(done, 350));
    const changed = {visible: visible(), pinned: pinned().length};
    const savedBefore = window.saved.length;
    document.querySelector('sf-context-menu .sf-context-menu-footer sf-button button')?.click();
    await new Promise((done) => setTimeout(done, 400));
    return {opened, changed, restored: {visible: visible(), pinned: pinned().length},
      announcements: window.saved.length - savedBefore};
  });
  if (reset.changed?.visible !== reset.opened.visible - 1 || reset.changed?.pinned !== reset.opened.pinned + 1) {
    note({case: 'reset setup', got: reset, expected: 'the tick and the pin took effect before Reset was pressed'});
  }
  if (reset.restored?.visible !== reset.opened.visible || reset.restored?.pinned !== reset.opened.pinned
      || reset.announcements !== 1) {
    note({case: 'reset returns to the opening state', got: reset, expected: 'both changes undone, announced once'});
  }

  // 4. The search is inset like every other block in the window.
  await openWindow(page, 'Настройки');
  const inset = await page.evaluate(() => {
    const surface = document.querySelector('sf-context-menu .sf-table-context-menu');
    const search = surface?.querySelector('.sf-table-column-search');
    const list = surface?.querySelector('.sf-context-menu-columns');
    const read = (node) => {
      if (!node) return null;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return {start: Math.round(parseFloat(style.paddingInlineStart)), end: Math.round(parseFloat(style.paddingInlineEnd)), left: Math.round(box.left)};
    };
    const surfaceBox = surface?.getBoundingClientRect();
    const field = search?.querySelector('.sf-input-field')?.getBoundingClientRect();
    return {
      search: read(search), list: read(list),
      gapToWindowEdge: field && surfaceBox ? Math.round(field.left - surfaceBox.left) : null,
    };
  });
  if (!inset.search || inset.search.start !== inset.list?.start || inset.search.end !== inset.list?.end
      || !(inset.gapToWindowEdge > 0)) {
    note({case: 'search inset', got: inset, expected: 'the same inset as the list, and clear of the window edge'});
  }

  // The check above compares this window's blocks with each other, so it is
  // blind to the thing a person actually sees: whether they agree with the rows
  // the Framework draws inside them. Both are measured here from one origin --
  // the padding box of .sf-context-menu-content, which is the panel the items
  // live in -- against the axis the menu publishes for its own items.
  const axis = await page.evaluate(() => {
    const content = document.querySelector('sf-context-menu .sf-context-menu-content')
      ?? document.querySelector('sf-context-menu .sf-table-context-menu');
    if (!content) return null;
    // From the padding edge, where the published inset is counted from: the
    // panel has a hairline border since the standard menu (2026-10-12), and
    // the border box put every block a pixel off an axis they all shared.
    const origin = content.getBoundingClientRect().left + content.clientLeft;
    const end = content.getBoundingClientRect().right - content.clientLeft;
    const start = (node) => node ? Math.round((node.getBoundingClientRect().left - origin) * 10) / 10 : null;
    const finish = (node) => node ? Math.round((end - node.getBoundingClientRect().right) * 10) / 10 : null;
    const px = (value) => {
      const probe = document.createElement('div');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.inlineSize = value;
      content.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return Math.round(width * 10) / 10;
    };
    const style = getComputedStyle(content);
    const published = style.getPropertyValue('--sf-context-menu--item-inset-start-1').trim();
    const row = content.querySelector('[data-column-key]');
    return {
      published: published ? px(published) : null,
      // Each block is measured by its content, not by its own padded box: a
      // block's box spans the panel, and a Framework control's host is
      // display: contents and has no box at all. Both mistakes read as zero or
      // as the panel's own edge, which is how a measurement can look like a
      // defect that is not there.
      searchField: start(content.querySelector('.sf-table-column-search .sf-input-field')),
      searchFieldEnd: finish(content.querySelector('.sf-table-column-search .sf-input-field')),
      rowStart: start(row),
      rowPinEnd: finish(row?.querySelector('[icon="push_pin"] button')),
      buttons: start(content.querySelector('.sf-context-menu-footer sf-button button')),
    };
  });
  if (!axis || axis.published === null) {
    note({case: 'menu axis', got: axis, expected: 'the menu publishes its item axis for this window to read'});
  } else {
    const off = (value) => value === null || Math.abs(value - axis.published) > 0.5;
    if (off(axis.searchField) || off(axis.rowStart) || off(axis.buttons)) {
      note({case: 'blocks on the menu axis', got: axis,
        expected: `the search field, the rows and the buttons all start at the published axis (${axis.published})`});
    }
    // The pin sits at the end edge, so the search field and the pin have to
    // finish on one axis. The panel's body keeps the scrollbar's room
    // (Framework panel, 2026-10-15), so that axis is the published inset plus
    // the gutter -- the same for both, never less than the start's.
    if (axis.searchFieldEnd === null || axis.rowPinEnd === null
        || Math.abs(axis.searchFieldEnd - axis.rowPinEnd) > 0.5 || axis.searchFieldEnd < axis.published - 0.5) {
      note({case: 'the end edge too', got: axis, expected: 'the search field and the pin finish at the same axis'});
    }
  }
  // 5. The filter window names its object and says what is pending: the owner's
  //    separate item of 2026-10-05. With nothing pending the button reads as it
  //    always did; with a draft it carries the number of conditions a press
  //    would change, and the host can translate the label.
  const applyButton = async (page) => page.evaluate(() => {
    const bottom = document.querySelector('sf-context-menu .sf-context-menu-footer');
    const buttons = [...(bottom?.querySelectorAll('sf-button') ?? [])];
    const commit = buttons[buttons.length - 1];
    return {
      text: commit?.getAttribute('text') ?? null,
      ariaLabel: commit?.getAttribute('aria-label') ?? null,
      labels: buttons.map((node) => node.getAttribute('text')),
    };
  });

  const filterPage = await open(900);
  await openWindow(filterPage, 'Фильтр');
  const quiet = await applyButton(filterPage);
  // One word: the window is the filter's, so «фильтр» said it twice and
  // widened the window (owner, 2026-10-13).
  if (quiet.text !== 'Применить') {
    note({case: 'the apply button is one word', got: quiet, expected: 'Применить with nothing pending'});
  }

  // A draft: switch two fields on, through the window's own fields tab.
  const pending = await filterPage.evaluate(async () => {
    const table = document.getElementById('t');
    const tabs = document.querySelector('sf-context-menu sf-tabs');
    [...(tabs?.querySelectorAll('.sf-tabs-top-container button') ?? [])]
      .find((node) => node.textContent.trim() === 'Поля')?.click();
    await new Promise((done) => setTimeout(done, 500));
    // The fields tab renders its own checkboxes inside the window's tabs; the
    // settings window's rows carry data-column-key, this window's do not.
    const boxes = [...document.querySelectorAll('sf-context-menu .sf-context-menu-body input[type="checkbox"]')];
    const panel = document.querySelector('sf-context-menu .sf-context-menu-content');
    const before = Math.round(panel?.getBoundingClientRect().width ?? 0);
    boxes[0]?.click();
    await new Promise((done) => setTimeout(done, 250));
    boxes[1]?.click();
    await new Promise((done) => setTimeout(done, 350));
    // Against bytes that predate this item the method is absent; report that
    // rather than throwing, so the probe says which pair it is measuring.
    // The window keeps its width while «Применить» grows a count (owner,
    // 2026-10-15: it widened under the pointer).
    const widths = [before, Math.round(panel?.getBoundingClientRect().width ?? 0)];
    return {ticked: boxes.length, widths, counted: typeof table.countPendingFilterConditionChanges === 'function'
      ? table.countPendingFilterConditionChanges()
      : 'the component cannot count pending conditions'};
  });
  const marked = await applyButton(filterPage);
  if (!pending.widths?.[0] || pending.widths[0] !== pending.widths[1]) note({case: 'the filter keeps its width while fields are ticked', got: pending.widths});
  if (pending.counted !== 2 || marked.text !== 'Применить (2)'
      || marked.ariaLabel !== 'Применить: 2') {
    note({case: 'filter button shows what is pending', got: {pending, marked}, expected: 'two conditions counted, and said in the label and to a reader'});
  }
  // The label is the host's to translate.
  const translated = await filterPage.evaluate(async () => {
    const table = document.getElementById('t');
    table.setAttribute('filter-apply-text', 'Apply filter');
    await new Promise((done) => setTimeout(done, 400));
    const bottom = document.querySelector('sf-context-menu .sf-context-menu-footer');
    const buttons = [...(bottom?.querySelectorAll('sf-button') ?? [])];
    return buttons[buttons.length - 1]?.getAttribute('text') ?? null;
  });
  if (translated !== 'Apply filter (2)') {
    note({case: 'filter button label is translatable', got: translated, expected: 'Apply filter (2)'});
  }
  await filterPage.close();

  console.error(JSON.stringify({pins, atOnce, reset, inset, quiet, pending, marked, translated}, null, 1));
  await page.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('TABLE_ROUND_5_OK');
