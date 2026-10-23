#!/usr/bin/env node
// Browser acceptance for sf-table host intents and bubbling sf-drawer events:
// create button and create menu, template selection, sortable headers (not
// after a column drag or resize), column drag without duplicated cells, badge
// filter options, the actions system column.
// Usage: PLAYWRIGHT_MODULE=… node table-intents.browser.mjs <lab> <distr> <smart-root> <output-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [labUrl, assetsUrl, smartUrl, outputDir] = process.argv.slice(2);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
mkdirSync(outputDir, { recursive: true });
const failures = []; const errors = []; const observations = [];
const check = (value, name, details = null) => { if (!value) failures.push({ name, details }); };
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon/i.test(message.text())) errors.push(message.text());
});

const events = (name) => page.evaluate((name) => window.labEvents.filter((event) => event.name === name).map((event) => event.detail), name);
const clearEvents = () => page.evaluate(() => { window.labEvents.length = 0; });

async function load({ dir, theme }) {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto(`${labUrl}?${new URLSearchParams({ assets: assetsUrl, smart: smartUrl, dir, theme })}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
}

for (const theme of ['light', 'dark']) for (const dir of ['ltr', 'rtl']) {
  const tag = `${theme}/${dir}`;
  await load({ dir, theme });

  // 1. Create: without items there is no arrow; the button emits item null.
  const createButton = page.locator('sf-table#table .sf-table-toolbar-end sf-button').filter({ hasText: 'Создать' }).locator('button');
  check(await page.locator('sf-table#table [aria-label="Дополнительные действия создания"]').count() === 0, `${tag}: no create arrow without items`);
  await createButton.click();
  check(JSON.stringify(await events('sf-table-create-intent')) === '[{"item":null}]', `${tag}: create button intent`, await events('sf-table-create-intent'));
  await page.evaluate(() => document.getElementById('table').setCreateItems([{ id: 'page', name: 'Страница' }, { id: 'folder', name: 'Раздел' }]));
  const arrow = page.locator('sf-table#table [aria-label="Дополнительные действия создания"] button, sf-table#table button[aria-label="Дополнительные действия создания"]').first();
  await arrow.waitFor();
  await arrow.click();
  const menuItem = page.locator('sf-context-menu[aria-label="Варианты создания"] button').filter({ hasText: 'Раздел' });
  await menuItem.waitFor();
  const menuBox = await page.locator('sf-context-menu[aria-label="Варианты создания"]').evaluate((node) => {
    const box = (node.querySelector('.sf-context-menu') || node.firstElementChild || node).getBoundingClientRect();
    return { left: box.left, right: box.right, width: document.documentElement.clientWidth };
  });
  check(menuBox.left >= 0 && menuBox.right <= menuBox.width + 1, `${tag}: create menu inside viewport`, menuBox);
  await menuItem.click();
  check(JSON.stringify(await events('sf-table-create-intent')) === '[{"item":null},{"item":"folder"}]', `${tag}: create menu intent`, await events('sf-table-create-intent'));
  check(await page.locator('sf-context-menu[aria-label="Варианты создания"]').count() === 0, `${tag}: create menu closes`);

  // 2. Sort: header click cycles; aria-sort follows; keyboard works; rows keep order.
  const th = page.locator('sf-table#table th[data-key="title"]');
  const rowOrder = () => page.locator('sf-table#table tbody td[data-key="title"]').allTextContents();
  const before = await rowOrder();
  check(await th.getAttribute('aria-sort') === 'none', `${tag}: sortable header starts none`);
  check(await page.locator('sf-table#table th[data-key="author"]').getAttribute('aria-sort') === null, `${tag}: plain header has no aria-sort`);
  await th.locator('.sf-table-sort-button').click();
  check(await th.getAttribute('aria-sort') === 'ascending', `${tag}: ascending after click`);
  await th.locator('.sf-table-sort-button').click();
  check(await th.getAttribute('aria-sort') === 'descending', `${tag}: descending after second click`);
  await th.locator('.sf-table-sort-button').focus();
  await page.keyboard.press('Enter');
  check(await th.getAttribute('aria-sort') === 'none', `${tag}: keyboard clears sort`);
  check(JSON.stringify(await events('sf-table-sort-change')) === JSON.stringify([
    { key: 'title', direction: 'asc' }, { key: 'title', direction: 'desc' }, { key: 'title', direction: null }]),
    `${tag}: sort intents`, await events('sf-table-sort-change'));
  check(JSON.stringify(await rowOrder()) === JSON.stringify(before), `${tag}: table never reorders rows`);
  await page.evaluate(() => document.getElementById('table').setSort('status', 'desc'));
  check(await page.locator('sf-table#table th[data-key="status"]').getAttribute('aria-sort') === 'descending', `${tag}: setSort marks header`);
  check((await events('sf-table-sort-change')).length === 3, `${tag}: setSort emits nothing`);

  // Resizer keyboard and column drag must not sort. Round three took the handle
  // away: the strip on the line between two headers is the button itself.
  await page.locator('#table--column-resizer--title').focus();
  await page.keyboard.press('ArrowRight');
  const thBox = await th.boundingBox();
  const statusBox = await page.locator('sf-table#table th[data-key="status"]').boundingBox();
  await page.mouse.move(thBox.x + 20, thBox.y + thBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thBox.x + 60, thBox.y + thBox.height / 2, { steps: 4 });
  await page.mouse.move(statusBox.x + statusBox.width - 10, statusBox.y + statusBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  check((await events('sf-table-sort-change')).length === 3, `${tag}: column drag does not sort`, await events('sf-table-sort-change'));
  const headers = await page.locator('sf-table#table thead th').evaluateAll((cells) => cells.map((cell) => cell.dataset.key));
  check(new Set(headers).size === headers.length && headers.length === 6, `${tag}: column drag keeps one header per column`, headers);
  const cellsPerRow = await page.locator('sf-table#table tbody tr').evaluateAll((rows) => rows.map((row) => row.cells.length));
  check(cellsPerRow.every((count) => count === 6), `${tag}: column drag keeps one cell per column`, cellsPerRow);
  // The strip is there to be grabbed, on hover and without it.
  await th.hover();
  await page.locator('#table--column-resizer--title').waitFor();
  const handle = await page.locator('#table--column-resizer--title').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check((await events('sf-table-sort-change')).length === 3, `${tag}: pointer resize does not sort`, await events('sf-table-sort-change'));

  // Stage A: instances are isolated, and the region declares its data state.
  const resizerIds = await page.locator('sf-table [id*="column-resizer"]').evaluateAll((nodes) => nodes.map((node) => node.id));
  check(new Set(resizerIds).size === resizerIds.length, `${tag}: resize handle ids are unique across tables`, resizerIds);
  check(resizerIds.every((id) => id.startsWith('table--') || id.startsWith('second--')), `${tag}: resize handle ids carry their instance`, resizerIds);
  const regions = await page.locator('sf-table > .sf-table').evaluateAll((nodes) => nodes.map((node) => ({instance: node.dataset.sfInstance, state: node.dataset.state, busy: node.getAttribute('aria-busy')})));
  check(regions.length === 2 && new Set(regions.map((region) => region.instance)).size === 2, `${tag}: each region names its instance`, regions);
  check(regions.every((region) => region.state === 'populated' && region.busy === null), `${tag}: regions declare the state they are in`, regions);
  await page.evaluate(() => document.getElementById('second').setDataState('loading'));
  await page.waitForTimeout(200);
  const loading = await page.locator('sf-table#second > .sf-table').evaluate((node) => ({state: node.dataset.state, busy: node.getAttribute('aria-busy')}));
  check(loading.state === 'loading' && loading.busy === 'true', `${tag}: a loading region says so`, loading);
  await page.evaluate(() => document.getElementById('second').setDataState('auto'));

  // 6. The actions column is a system column: no resizer, not in settings.
  check(await page.locator('#table--column-resizer--actions').count() === 0, `${tag}: actions column has no resizer`);
  const settings = await events('sf-table-column-settings-change');
  check(settings.every((detail) => !Object.hasOwn(detail.columnSettings || {}, 'actions')), `${tag}: actions width never saved`, settings);
  check(await page.locator('sf-table#table th').last().getAttribute('data-key') === 'actions', `${tag}: actions stays last`);

  // 5. Badge options in the filter menu.
  await page.locator('sf-table#table sf-button').filter({ hasText: 'Фильтр' }).locator('button').click();
  const filterMenu = page.locator('sf-context-menu[aria-label="Настройки фильтра"]');
  await filterMenu.waitFor();
  const statusField = filterMenu.getByText('Статус', { exact: true }).first();
  if (await statusField.count()) await statusField.click().catch(() => {});
  await page.waitForTimeout(300);
  let badges = await page.locator('sf-context-menu sf-badge').evaluateAll((nodes) => nodes.map((node) => {
    const box = node.querySelector('.sf-badge');
    const style = box ? getComputedStyle(box) : null;
    return { text: node.getAttribute('text'), scheme: node.getAttribute('scheme'), icon: node.getAttribute('icon'),
      classes: box?.className || '', background: style?.backgroundColor, color: style?.color };
  }));
  if (!badges.length) {
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const table = document.getElementById('table');
      table.setTemplates([{ key: 'lab', label: 'Статусы', selected: true,
        data: { tags: { status: { label: 'Статус', active: true } }, values: {} } }]);
    });
    await page.locator('sf-table#table sf-tag').filter({ hasText: 'Статус' }).first().click();
    await page.waitForTimeout(400);
    badges = await page.locator('sf-context-menu sf-badge').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.querySelector('.sf-badge');
      const style = box ? getComputedStyle(box) : null;
      return { text: node.getAttribute('text'), scheme: node.getAttribute('scheme'), icon: node.getAttribute('icon'),
        classes: box?.className || '', background: style?.backgroundColor, color: style?.color };
    }));
  }
  observations.push({ tag, badges });
  const byText = Object.fromEntries(badges.map((badge) => [badge.text, badge]));
  check(badges.length === 4, `${tag}: four badge options`, badges);
  check(byText['Готово']?.scheme === 'success' && /sf-badge--tonal/.test(byText['Готово']?.classes) && byText['Готово']?.icon === 'check', `${tag}: scheme badge with icon`, byText['Готово']);
  check(byText['Отменено']?.scheme === 'danger', `${tag}: danger badge`, byText['Отменено']);
  check(byText['Черновик']?.scheme === 'neutral' && byText['Черновик']?.background !== byText['Прочее']?.background, `${tag}: hex badge tinted`, [byText['Черновик'], byText['Прочее']]);
  check(byText['Прочее']?.scheme === 'neutral', `${tag}: invalid colour falls back to neutral`, byText['Прочее']);
  await page.screenshot({ path: resolve(outputDir, `table-intents-${theme}-${dir}.png`) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Chip menu opens under the chip (the sf-tag host has no box of its own).
  await page.evaluate(() => document.getElementById('table').setTemplates([{ key: 'lab', label: 'Статусы', selected: true,
    data: { tags: { status: { label: 'Статус', active: true } }, values: {} } }]));
  const chip = page.locator('sf-table#table .sf-table-tags sf-tag .sf-tag').first();
  await chip.waitFor();
  await chip.click({ position: { x: 12, y: 8 } });
  const tagMenu = page.locator('sf-context-menu[aria-label^="Настройка фильтра"] > .sf-context-menu');
  await tagMenu.waitFor();
  await page.waitForTimeout(250);
  const chipBox = await chip.boundingBox();
  const tagBox = await tagMenu.boundingBox();
  const startAligned = dir === 'rtl' ? Math.abs(tagBox.x + tagBox.width - (chipBox.x + chipBox.width)) <= 2 : Math.abs(tagBox.x - chipBox.x) <= 2;
  check(tagBox.y >= chipBox.y + chipBox.height && tagBox.y <= chipBox.y + chipBox.height + 12 && startAligned,
    `${tag}: chip menu opens under the chip`, { chipBox, tagBox });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // The chip is keyboard operable: its label is a button beside the remove action.
  const chipAction = page.locator('sf-table#table .sf-table-tags sf-tag .sf-tag-action').first();
  await chipAction.focus();
  await page.keyboard.press('Enter');
  await tagMenu.waitFor();
  await page.waitForTimeout(250);
  const keyBox = await tagMenu.boundingBox();
  check(Math.abs(keyBox.y - tagBox.y) <= 1 && Math.abs(keyBox.x - tagBox.x) <= 1, `${tag}: chip menu opens from the keyboard in the same place`, { keyBox, tagBox });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.activeElement?.classList.contains('sf-tag-action')), `${tag}: focus returns to the chip after Escape`);
  const removeName = await page.locator('sf-table#table .sf-table-tags sf-tag sf-icon-button button').first().getAttribute('aria-label');
  check(removeName === 'Удалить', `${tag}: chip keeps a separate remove action`, removeName);

  // Row menu opens beside its button with the tail towards it.
  const rowButton = page.locator('sf-table#table tbody tr').first().locator('td[data-key="settings"] button').first();
  await rowButton.click();
  const rowMenu = page.locator('sf-context-menu[aria-label="Действия со строкой"]');
  await rowMenu.waitFor();
  await page.waitForTimeout(250);
  const buttonBox = await rowButton.boundingBox();
  const rowBox = await rowMenu.locator(':scope > .sf-context-menu').boundingBox();
  const beside = dir === 'rtl' ? rowBox.x + rowBox.width <= buttonBox.x + 1 : rowBox.x >= buttonBox.x + buttonBox.width - 1;
  const centered = Math.abs((rowBox.y + rowBox.height / 2) - (buttonBox.y + buttonBox.height / 2)) <= 3 || rowBox.y >= 0;
  check(beside && centered && await rowMenu.getAttribute('position') === 'left', `${tag}: row menu beside its button`, { buttonBox, rowBox, position: await rowMenu.getAttribute('position') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Clicking the action-for-all label toggles it once, not twice. The band of
  // bulk controls only exists while something is marked -- round two made it so,
  // on the consumer's request -- so the pager is given a selection first.
  await clearEvents();
  await page.evaluate(() => document.getElementById('pager').setAttribute('selected-count', '2'));
  await page.locator('#pager sf-checkbox').first().locator('label').first().waitFor();
  await page.locator('#pager sf-checkbox').first().locator('label').first().click();
  await page.waitForTimeout(250);
  const forAllByLabel = await events('sf-action-for-all-change');
  check(JSON.stringify(forAllByLabel) === '[{"actionForAll":true}]', `${tag}: action-for-all label click toggles once`, forAllByLabel);
  await page.locator('#pager sf-checkbox input[type="checkbox"]').first().click();
  await page.waitForTimeout(250);
  const forAllAfter = await events('sf-action-for-all-change');
  check(JSON.stringify(forAllAfter) === '[{"actionForAll":true},{"actionForAll":false}]', `${tag}: action-for-all box click toggles back once`, forAllAfter);

  // Deleting a saved template on Apply is its own intent.
  await clearEvents();
  await page.evaluate(() => document.getElementById('table').setTemplates([
    { key: 'all', label: 'Все записи', selected: true, data: { tags: {}, values: {} } },
    { key: 'old', label: 'Старый вид', data: { tags: {}, values: {} } },
  ]));
  await page.locator('sf-table#table sf-button').filter({ hasText: 'Фильтр' }).locator('button').click();
  const templateMenu = page.locator('sf-context-menu[aria-label="Настройки фильтра"]');
  await templateMenu.waitFor();
  const templatesTab = templateMenu.locator('sf-button').filter({ hasText: 'Шаблоны' }).locator('button').first();
  if (await templatesTab.count()) await templatesTab.click();
  await page.waitForTimeout(300);
  const templateRow = templateMenu.locator('[data-context-submenu-anchor="old"]').first();
  await templateRow.waitFor();
  await templateRow.click();
  const remove = page.locator('sf-context-menu[data-context-submenu] sf-button').filter({ hasText: 'Удалить' }).first();
  await remove.waitFor();
  await remove.click();
  await page.waitForTimeout(250);
  await templateMenu.locator('sf-button').filter({ hasText: 'Применить' }).locator('button').click();
  await page.waitForTimeout(350);
  const deleted = await events('sf-table-template-delete');
  check(JSON.stringify(deleted) === '[{"key":"old"}]', `${tag}: deleting a template raises its own intent`, deleted);
  const savedAfterDelete = await events('sf-table-template-save');
  check(savedAfterDelete.length > 0, `${tag}: the save intent still reports the flags`, savedAfterDelete);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 4. Drawer events reach the document; the on* helper keeps its own drawer only.
  await clearEvents();
  await page.evaluate(() => document.getElementById('outer').open());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('inner').open());
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('inner').close(); document.getElementById('outer').close(); });
  await page.waitForTimeout(300);
  const drawerEvents = await page.evaluate(() => window.labEvents.filter((event) => event.name.startsWith('drawer:')).map((event) => `${event.name}:${event.detail.drawerId}`));
  for (const expected of ['drawer:before-open:outer', 'drawer:after-open:outer', 'drawer:before-open:inner', 'drawer:after-open:inner', 'drawer:before-close:inner', 'drawer:after-close:inner', 'drawer:after-close:outer']) {
    check(drawerEvents.includes(expected), `${tag}: document hears ${expected}`, drawerEvents);
  }
  const helper = await page.evaluate(() => window.labOuterHelper);
  check(JSON.stringify(helper) === '["outer"]', `${tag}: onAfterOpen receives only its own drawer`, helper);

  // Modal events bubble too; the on* helper keeps its own modal only.
  await clearEvents();
  await page.evaluate(() => document.getElementById('m-outer').open());
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('m-inner').open());
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('m-inner').close());
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('m-outer').close());
  await page.waitForTimeout(500);
  const modalEvents = await page.evaluate(() => window.labEvents.filter((event) => event.name.startsWith('modal:')).map((event) => `${event.name}:${event.detail.modalId}`));
  for (const expected of ['modal:after-open:m-outer', 'modal:after-open:m-inner', 'modal:after-close:m-inner', 'modal:after-close:m-outer']) {
    check(modalEvents.includes(expected), `${tag}: document hears ${expected}`, modalEvents);
  }
  const modalHelper = await page.evaluate(() => window.labModalHelper.splice(0));
  check(JSON.stringify(modalHelper) === '["m-outer"]', `${tag}: modal onAfterOpen receives only its own modal`, modalHelper);
}

// 2 (template select) is exercised once: pick another template and Apply.
await load({ dir: 'ltr', theme: 'light' });
await page.evaluate(() => document.getElementById('table').setTemplates([
  { key: 'all', label: 'Все записи', selected: true, data: { tags: {}, values: {} } },
  { key: 'mine', label: 'Мои записи', data: { tags: {}, values: {} } },
]));
await clearEvents();
await page.locator('sf-table#table sf-button').filter({ hasText: 'Фильтр' }).locator('button').click();
const menu = page.locator('sf-context-menu[aria-label="Настройки фильтра"]');
await menu.waitFor();
const tabs = await menu.locator('[role="tab"], button').allTextContents();
const templatesTab = menu.locator('[role="tab"]').filter({ hasText: 'Шаблоны' });
if (await templatesTab.count()) await templatesTab.first().click();
await page.waitForTimeout(200);
const mine = menu.getByText('Мои записи', { exact: true }).first();
await mine.click();
await page.waitForTimeout(200);
await menu.locator('sf-button').filter({ hasText: 'Применить' }).locator('button').click();
await page.waitForTimeout(300);
const selectEvents = await events('sf-table-template-select');
check(JSON.stringify(selectEvents) === '[{"key":"mine"}]', 'template select event on Apply', { selectEvents, tabs });
await page.locator('sf-table#table sf-button').filter({ hasText: 'Фильтр' }).locator('button').click();
await menu.waitFor();
await menu.locator('sf-button').filter({ hasText: 'Применить' }).locator('button').click();
await page.waitForTimeout(300);
check((await events('sf-table-template-select')).length === 1, 'Apply without a new choice emits no template select');

await browser.close();
const report = { schema: 'simai.framework.table-intents-browser.v1', lab: labUrl, failures, errors, observations };
writeFileSync(resolve(outputDir, 'table-intents-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`table intents: ${failures.length} failures, ${errors.length} errors`);
if (failures.length) console.log(JSON.stringify(failures.slice(0, 12), null, 1));
if (errors.length) console.log(JSON.stringify(errors.slice(0, 8), null, 1));
process.exit(failures.length || errors.length ? 1 : 0);
