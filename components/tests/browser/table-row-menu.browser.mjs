#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
//
// The row menu is the Framework's standard menu (owner, 2026-10-12). Before,
// it opened beside its button, centred on it, with a tail, and a group of the
// host's row_actions replaced the menu with a second one. Measured here: it
// opens below its button and start-aligned, in the top layer; a group is a
// submenu of the members the record allows; choosing a member raises the
// record's intent with that member's id; and the focus goes back to the button.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/buttons/css/buttons.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'component/component/context-menu/css/context-menu.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js', 'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) {
  console.error(JSON.stringify({missingAssets: absent, root: out}, null, 2));
  throw new Error(`${absent.length} build asset(s) not found under ${out}`);
}

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

try {
  const page = await browser.newPage({viewport: {width: 1100, height: 700}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<sf-data-view id="list" aria-label="Страницы">'
    + '<sf-table slot="content" aria-label="Страницы"></sf-table>'
    + '</sf-data-view></body></html>',
  );
  for (const style of styles) await page.addStyleTag({path: style});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-data-view') && customElements.get('sf-table')
    && customElements.get('sf-context-menu')));

  await page.evaluate(() => {
    window.raised = [];
    document.querySelector('#list').setHostPort({
      version: '1.8.0',
      capabilities: ['row-actions'],
      async raise(intent, payload) {
        if (intent !== 'query.change') {
          window.raised.push({intent, action: payload.action_id, ids: payload.record_ids});
          return {answer: 'applied'};
        }
        return {
          answer: 'applied', sequence: payload.sequence,
          data: {
            columns: [{key: 'title', label: 'Страница'}],
            row_actions: [
              {id: 'rename', label: 'Переименовать', icon: 'edit'},
              {id: 'publish:ru', label: 'ru', group: 'publish', group_label: 'Опубликовать'},
              {id: 'publish:en', label: 'en', group: 'publish', group_label: 'Опубликовать'},
              {id: 'archive', label: 'В архив', icon: 'archive', danger: true},
            ],
            // Published in ru already: its submenu offers en alone.
            records: [{id: 'home', title: 'Главная', revision: 'r1', actions: ['rename', 'publish:en', 'archive']}],
            total: 1,
          },
        };
      },
    });
  });
  await page.waitForFunction(() => /Главная/u.test(document.querySelector('#list tbody')?.textContent ?? ''), null, {timeout: 8000});

  // The row's menu button, in the settings column.
  const button = page.locator('#list tbody tr td button[data-sf-row-menu]').first();
  await button.click();
  await page.waitForTimeout(250);
  const opened = await page.evaluate(() => {
    const menu = document.querySelector('sf-context-menu[data-sf-table-menu="row"]');
    const surface = menu?.querySelector('.sf-context-menu');
    const trigger = document.querySelector('#list tbody tr td button[data-sf-row-menu]');
    const box = surface?.getBoundingClientRect();
    const at = trigger?.getBoundingClientRect();
    return {
      found: Boolean(menu),
      top: surface?.matches(':popover-open') ?? false,
      below: box && at ? box.top >= at.bottom - 0.5 : false,
      start: box && at ? Math.abs(box.left - at.left) <= 1 : false,
      tail: Boolean(surface?.querySelector('.sf-context-menu-tooltip')),
      labels: [...(surface?.querySelectorAll('.sf-context-menu-item-label') ?? [])].map((node) => node.textContent.trim()),
      submenu: surface?.querySelector('[aria-haspopup="menu"] .sf-context-menu-item-label')?.textContent.trim() ?? null,
      danger: surface?.querySelector('.sf-context-menu-item--danger .sf-context-menu-item-label')?.textContent.trim() ?? null,
      expanded: trigger?.getAttribute('aria-expanded'),
    };
  });
  if (!opened.found || !opened.top) note({case: 'the row menu is the standard menu, in the top layer', got: opened});
  if (!opened.below || !opened.start || opened.tail) note({case: 'below its button, start-aligned, no tail', got: opened});
  if (opened.labels.join('|') !== 'Переименовать|Опубликовать|В архив') note({case: 'the record\'s actions, a group once', got: opened.labels});
  if (opened.submenu !== 'Опубликовать') note({case: 'a group is a submenu', got: opened.submenu});
  if (opened.danger !== 'В архив') note({case: 'a dangerous action is marked', got: opened.danger});
  if (opened.expanded !== 'true') note({case: 'the button says the menu is open', got: opened.expanded});

  // Into the group: the members the record allows, and a choice raises it.
  await page.locator('sf-context-menu[data-sf-table-menu="row"] [aria-haspopup="menu"]').click();
  await page.waitForTimeout(250);
  const members = await page.evaluate(() => [...document.querySelectorAll('sf-context-menu:not([data-sf-table-menu]) .sf-context-menu-item-label')]
    .map((node) => node.textContent.trim()));
  if (members.join() !== 'en') note({case: 'the submenu holds the members this record allows', got: members});
  await page.locator('sf-context-menu:not([data-sf-table-menu]) .sf-context-menu-item').first().click();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    raised: window.raised,
    menus: document.querySelectorAll('sf-context-menu').length,
    open: document.querySelector('sf-context-menu[data-sf-table-menu="row"]')?.isOpen ?? null,
    // The row's menu button is the icon button's class markup since standard
    // 1.3.8 §18.4 (a cell that only shows a control is markup): data-sf-row-menu.
    focus: document.activeElement?.closest?.('sf-icon-button')?.getAttribute('icon')
      ?? (document.activeElement?.hasAttribute?.('data-sf-row-menu') ? 'menu' : null)
      ?? document.activeElement?.tagName ?? null,
  }));
  const raised = after.raised[0];
  if (!raised || raised.intent !== 'record.mutate' || raised.action !== 'publish:en' || raised.ids?.join() !== 'home') {
    note({case: 'a member raises the record\'s intent with its own id', got: after.raised});
  }
  if (after.open || after.menus !== 1) note({case: 'a choice closes the menu and its submenu', got: after});
  if (after.focus !== 'menu') note({case: 'the focus returns to the row\'s button', got: after});

  console.log(JSON.stringify({probe: 'table-row-menu', opened, members, after, failures}, null, 2));
} finally {
  await browser.close();
}
if (failures.length) {
  console.error('TABLE_ROW_MENU_FAIL');
  process.exit(1);
}
console.log('TABLE_ROW_MENU_OK');
