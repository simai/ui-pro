#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-property-view, the first pair: one object read through its port and one
// group saved through it. What this measures is the seam, because that is where
// this composite can be wrong in ways a screenshot would not show -- a save that
// carries untouched fields, a value written on blur, a conflict that quietly
// becomes an overwrite, an error shown somewhere other than under its field.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/avatars/css/avatars.css',
  'component/component/reference-link/css/reference-link.css',
  'component/component/inputs/css/inputs.css', 'component/component/tree/css/tree.css',
  'component/component/progress-scale/css/progress-scale.css',
  'component/component/buttons/css/buttons.css',
  'component/component/dropdown/css/dropdown.css',
  'smart/smart/drawer/css/drawer.css',
  'component/component/datepicker/css/datepicker.css',
  'component/component/tags/css/tags.css',
  'component/component/textarea/css/textarea.css',
  'component/component/file-upload/css/file-upload.css',
  'component/component/file-preview/css/file-preview.css',
  'component/component/progress-bar/css/progress-bar.css',
  // The composite's own stylesheet, which it did not have at all in the first
  // pair -- the reason a consumer saw plain stacked text.
  'smart/smart/popover/css/popover.css',
  'component/component/context-menu/css/context-menu.css',
  'smart/smart/property-view/css/property-view.css',
  'smart/smart/profile-picker/css/profile-picker.css',
  'smart/smart/sortable/css/sortable.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
  'component/component/pagination/css/pagination.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/input/js/input.js', 'smart/smart/tree/js/tree.js',
  'smart/smart/tree-item/js/tree-item.js', 'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/button/js/button.js',
  'smart/smart/progress-scale/js/progress-scale.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js',
  'smart/smart/tag/js/tag.js',
  'smart/smart/datepicker/js/datepicker.js', 'smart/smart/textarea/js/textarea.js',
  'smart/smart/switch/js/switch.js', 'smart/smart/button-group/js/button-group.js',
  'smart/smart/file-upload/js/file-upload.js', 'smart/smart/file-preview/js/file-preview.js',
  'smart/smart/progress-bar/js/progress-bar.js',
  'smart/smart/field-renderers/js/field-renderers.js',
  'smart/smart/sortable/js/sortable.js',
  // A related group composes a data view, which brings a table and a page row.
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
  'smart/smart/popover/js/popover.js',
  'smart/smart/profile-picker/js/profile-picker.js',
  'smart/smart/property-view/js/property-view.js',
].map((p) => join(out, p));

const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) {
  console.error(JSON.stringify({missingAssets: absent, root: out}, null, 2));
  throw new Error(`${absent.length} build asset(s) not found under ${out}`);
}

// The record panel's «⋯» and its view chooser are the Framework's standard
// menu (owner, 2026-10-12): the views are a submenu of radio rows, as the menu
// profile is in the admin menu, and choosing one raises view.profile.
const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1100, height: 900}});
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><body style="margin:0"></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-property-view') && customElements.get('sf-context-menu')));

  await page.evaluate(async () => {
    window.raised = [];
    const view = document.createElement('sf-property-view');
    view.id = 'view';
    view.setAttribute('record-id', 'r1');
    view.setAttribute('collection', 'pages');
    // As a panel: the head with its «⋯» is the panel's.
    view.setAttribute('panel', '');
    view.setAttribute('panel-width', '40rem');
    document.body.append(view);
    const record = (profile) => ({
      record_id: 'r1', revision: '1',
      sections: [{key: 'main', label: 'Основное', groups: [{key: 'g', label: 'Группа', columns: 1, fields: [
        {key: 'title', label: 'Название', propertyType: 'string', value: 'Главная'},
      ]}]}],
      view: {
        target: 'personal', editable: ['personal', 'shared'], profile,
        profiles: [{id: 'default', label: 'Обычный', shared: true}, {id: 'mine', label: 'Мой', shared: false}],
        layers: {personal: {revision: 'p1', view: {schema_version: 1, sections: {}, groups: {}, fields: {}}}},
      },
    });
    view.setHostPort({
      version: '1.7.0', capabilities: ['view-settings'],
      async raise(intent, payload) {
        window.raised.push({intent, profile: payload?.profile, label: payload?.label});
        if (intent === 'record.load') return {answer: 'applied', record: record('default')};
        if (intent === 'view.create') return {answer: 'applied', record: record('mine')};
        if (intent === 'view.profile') return {answer: 'applied', record: record(payload.profile)};
        return {answer: 'applied'};
      },
    });
    for (let tries = 0; tries < 80 && !view.sections?.length; tries += 1) await new Promise((done) => setTimeout(done, 50));
  });
  await page.waitForTimeout(400);

  // Pressed from the page: the panel slides in, and a pointer aimed while it
  // moves misses.
  // The panel draws inside the drawer, so its controls are looked for in its
  // content root; the menus stand beside the page, in the document.
  const press = (selector, inPanel = false) => page.evaluate(([target, panel]) => {
    const view = document.getElementById('view');
    const root = panel ? (view.panelContent?.() ?? view) : document;
    const found = [...root.querySelectorAll(target)].pop();
    found?.click();
    return Boolean(found);
  }, [selector, inPanel]);
  await press('[data-action="menu"]', true);
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => {
    const surface = document.querySelector('sf-context-menu[data-sf-property-view-menu] > .sf-context-menu');
    return {
      top: surface?.matches(':popover-open') ?? false,
      labels: [...(surface?.querySelectorAll('.sf-context-menu-item-label') ?? [])].map((node) => node.textContent.trim()),
      value: surface?.querySelector('[aria-haspopup="menu"] .sf-context-menu-item-value')?.textContent.trim() ?? null,
      popover: Boolean((document.getElementById('view').panelContent?.() ?? document).querySelector('sf-popover[role="menu"]')),
    };
  });
  if (!menu.top || menu.popover) note({case: 'the «⋯» is the standard menu', got: menu});
  if (menu.labels[0] !== 'Вид' || menu.value !== 'Обычный') note({case: 'the views are a submenu that names the current one', got: menu});
  if (!menu.labels.includes('Настроить вид')) note({case: 'what belongs to the view is still in the menu', got: menu.labels});

  await press('sf-context-menu[data-sf-property-view-menu] [aria-haspopup="menu"]');
  await page.waitForTimeout(300);
  const views = await page.evaluate(() => [...document.querySelectorAll('sf-context-menu:not([data-sf-property-view-menu]) .sf-context-menu-item')]
    .map((row) => ({
      label: row.querySelector('.sf-context-menu-item-label')?.textContent.trim(),
      caption: row.querySelector('.sf-context-menu-item-caption')?.textContent.trim(),
      checked: row.getAttribute('aria-checked'),
      role: row.getAttribute('role'),
    })));
  const expected = 'Обычный|Для всех|true|menuitemradio,Мой|Персональный|false|menuitemradio';
  const seen = views.map((row) => `${row.label}|${row.caption}|${row.checked}|${row.role}`).join(',');
  if (seen !== expected) note({case: 'each view is a radio row that says whose it is', got: views});
  await press('sf-context-menu:not([data-sf-property-view-menu]) .sf-context-menu-item');
  await page.waitForTimeout(400);
  const chosen = await page.evaluate(() => ({
    raised: window.raised.filter((one) => one.intent === 'view.profile'),
    current: document.getElementById('view').viewProfile,
    open: document.querySelector('sf-context-menu[data-sf-property-view-menu]')?.isOpen,
  }));
  if (chosen.raised.length !== 1 || chosen.raised[0].profile !== 'mine' || chosen.current !== 'mine' || chosen.open) {
    note({case: 'choosing a view raises view.profile and closes the menu', got: chosen});
  }

  // While arranging, the chooser in the bar opens the same rows.
  await page.evaluate(() => document.getElementById('view').startConfiguringView());
  await page.waitForTimeout(300);
  const chooser = await page.evaluate(() => {
    const view = document.getElementById('view');
    const root = view.panelContent?.() ?? view;
    const button = root.querySelector('[data-action="view-profile"]');
    return {
      text: button?.textContent.replace(/\s+/gu, ' ').trim() ?? null,
      dropdown: Boolean(root.querySelector('sf-dropdown[data-action="view-profile"]')),
    };
  });
  if (!chooser.text?.includes('Мой') || chooser.dropdown) note({case: 'the bar names the view and is a menu button', got: chooser});
  // The bar's chooser is the Framework's profile picker since 2026-10-14.
  await press('[data-action="view-profile"] .sf-profile-picker-trigger', true);
  await page.waitForTimeout(300);
  const barMenu = await page.evaluate(() => [...document.querySelectorAll('sf-profile-picker[data-action="view-profile"] .sf-profile-picker-row[data-id]')]
    .map((row) => `${row.querySelector('.sf-profile-picker-label')?.textContent.trim()}:${row.getAttribute('aria-checked')}`));
  if (barMenu.join() !== 'Обычный:false,Мой:true') note({case: 'the bar opens the views as radio rows', got: barMenu});

  // «Add a view» asks for the name before anything is written (simai.main QA,
  // 2026-10-27): it made «New view» at once, a host record nobody had named.
  const naming = await page.evaluate(async () => {
    const view = document.getElementById('view');
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    view.startConfiguringView?.();
    await wait(300);
    const root = () => view.panelContent?.() ?? view;
    const created = () => window.raised.filter((entry) => entry.intent === 'view.create');
    const add = root().querySelector('[data-action="add-profile"]');
    (add?.querySelector('button') ?? add)?.click();
    await wait(300);
    const row = root().querySelector('[data-action="new-profile"]');
    const result = {button: Boolean(add), row: Boolean(row), createdOnPress: created().length};
    const input = row?.querySelector('sf-input');
    const field = input?.querySelector('input');
    if (field) { field.value = 'Договоры'; field.dispatchEvent(new Event('input', {bubbles: true})); }
    field?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, composed: true}));
    await wait(400);
    result.created = created().map((entry) => entry.label);
    result.rowAfter = Boolean(root().querySelector('[data-action="new-profile"]'));
    view.cancelConfiguringView?.();
    return result;
  });
  if (!naming.button || !naming.row || naming.createdOnPress !== 0
    || naming.created.join() !== 'Договоры' || naming.rowAfter) {
    note({case: '«Add a view» asks for the name before it makes the view', got: naming,
      expected: 'the press opens a naming row and raises nothing; Enter raises view.create once with the typed name and closes the row'});
  }

  // Cancelling an arrangement nobody changed writes nothing: it raised an
  // identical view.save, a shared revision and a history entry (simai.main QA,
  // 2026-10-28).
  const untouched = await page.evaluate(async () => {
    const view = document.getElementById('view');
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    const saves = () => window.raised.filter((entry) => entry.intent === 'view.save').length;
    const before = saves();
    view.startConfiguringView?.();
    await wait(300);
    await view.cancelConfiguringView?.();
    await wait(300);
    return {saves: saves() - before, configuring: Boolean(view.configuring)};
  });
  if (untouched.saves !== 0 || untouched.configuring) {
    note({case: 'cancelling an untouched arrangement writes nothing', got: untouched,
      expected: 'no view.save, and the mode left'});
  }

  // Entering and leaving the arrangement keeps the keyboard somewhere: both
  // left the focus on the body (simai.main keyboard QA, 2026-10-28).
  const focusTrail = await page.evaluate(async () => {
    const view = document.getElementById('view');
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    const root = () => view.panelContent?.() ?? view;
    document.activeElement?.blur?.();
    view.startConfiguringView?.();
    await wait(500);
    const entered = Boolean(document.activeElement?.closest?.('.sf-property-view-configure-bar'));
    const done = root().querySelector('[data-action="done-configuring"] button, [data-action="done-configuring"]');
    done?.focus?.();
    done?.click?.();
    await wait(500);
    const left = Boolean(document.activeElement?.closest?.('[data-action="menu"]'));
    return {entered, left, active: document.activeElement?.tagName ?? null};
  });
  if (!focusTrail.entered || !focusTrail.left) {
    note({case: 'arranging moves the focus in and back out', got: focusTrail,
      expected: "the arranging bar's first control on entering, the panel's menu on Done"});
  }

  // A link inside a field's value does its own thing only: downloading a
  // stored file also opened the group for editing (simai.main, 2026-10-28).
  const linkPress = await page.evaluate(async () => {
    const view = document.getElementById('view');
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    const root = view.panelContent?.() ?? view;
    const button = root.querySelector('[data-open-group]');
    if (!button) return {button: false};
    const link = document.createElement('a');
    link.href = '#file';
    link.textContent = 'file.pdf';
    link.addEventListener('click', (event) => event.preventDefault());
    button.prepend(link);
    link.click();
    await wait(200);
    const afterLink = Boolean(view.editing);
    link.remove();
    view.cancelEdit?.();
    return {button: true, afterLink};
  });
  if (!linkPress.button || linkPress.afterLink) {
    note({case: 'a link inside a value does not open the group', got: linkPress,
      expected: 'the field button present, and no edit after a press on the link inside it'});
  }

  // A host's own items slotted into `menu` are rows of the same standard menu
  // (owner, 2026-10-14): they were a popover of link buttons.
  await page.evaluate(() => document.getElementById('view').remove());
  await page.evaluate(async () => {
    window.hostPressed = 0;
    const view = document.createElement('sf-property-view');
    view.id = 'hosted';
    view.setAttribute('record-id', 'r2');
    view.setAttribute('panel', '');
    view.setAttribute('panel-width', '40rem');
    const link = document.createElement('a');
    link.slot = 'menu'; link.href = '#history'; link.dataset.icon = 'history'; link.textContent = 'История';
    const button = document.createElement('button');
    button.slot = 'menu'; button.type = 'button'; button.dataset.icon = 'content_copy'; button.textContent = 'Копировать';
    button.addEventListener('click', () => { window.hostPressed += 1; });
    view.append(link, button);
    document.body.append(view);
    view.setHostPort({
      version: '1.7.0', capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') return {answer: 'applied', record: {record_id: 'r2', revision: '1',
          sections: [{key: 'main', label: 'Основное', groups: [{key: 'g', label: 'Группа', columns: 1, fields: [
            {key: 'title', label: 'Название', propertyType: 'string', value: 'Страница'}]}]}]}};
        return {answer: 'applied'};
      },
    });
    for (let tries = 0; tries < 80 && !view.sections?.length; tries += 1) await new Promise((done) => setTimeout(done, 50));
  });
  await page.waitForTimeout(400);
  const hostedMenu = await page.evaluate(async () => {
    const view = document.getElementById('hosted');
    const root = view.panelContent?.() ?? view;
    const trigger = [...root.querySelectorAll('[data-action="menu"]')].pop();
    (trigger?.querySelector('button') ?? trigger)?.click();
    await new Promise((done) => setTimeout(done, 300));
    const surface = document.querySelector('sf-context-menu[data-sf-property-view-menu] > .sf-context-menu');
    const rows = [...(surface?.querySelectorAll('.sf-context-menu-item') ?? [])];
    const result = {
      popover: Boolean(root.querySelector('sf-popover[role="menu"]')),
      labels: rows.map((row) => row.querySelector('.sf-context-menu-item-label')?.textContent.trim()),
      linkRow: rows.find((row) => row.textContent.includes('История'))?.getAttribute('href') ?? null,
    };
    rows.find((row) => row.textContent.includes('Копировать'))?.click();
    await new Promise((done) => setTimeout(done, 100));
    result.pressed = window.hostPressed;
    return result;
  });
  if (hostedMenu.popover || !hostedMenu.labels.includes('История') || !hostedMenu.labels.includes('Копировать')
    || hostedMenu.linkRow !== '#history' || hostedMenu.pressed !== 1) {
    note({case: "a host's menu items are rows of the standard menu", got: hostedMenu});
  }

  console.log(JSON.stringify({probe: 'property-view-menu', menu, views, chosen, chooser, barMenu, naming, untouched, focusTrail, linkPress, hostedMenu, failures}, null, 2));
} finally {
  await browser.close();
}
if (failures.length) {
  console.error('PROPERTY_VIEW_MENU_FAIL');
  process.exit(1);
}
console.log('PROPERTY_VIEW_MENU_OK');
