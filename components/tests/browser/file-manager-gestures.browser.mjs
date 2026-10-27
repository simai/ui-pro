#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The file manager's two gestures (owner, 2026-10-15), measured with real
// drag events: a row of a list with drag-rows carries its record -- or every
// selected record when it is one of them -- as application/x-sf-records+json;
// files from the computer over a view with accept-files show its drop zone
// and are handed to the host with sf-data-view-files-drop.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/featured-icon/css/featured-icon.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/empty-state/css/empty-state.css',
  'component/component/badges/css/badges.css', 'component/component/tags/css/tags.css', 'component/component/avatars/css/avatars.css',
  'component/component/tabs/css/tabs.css', 'smart/smart/tabs/css/tabs.css', 'component/component/context-menu/css/context-menu.css',
  'component/component/checkbox/css/checkbox.css', 'component/component/radio/css/radio.css', 'component/component/buttons/css/buttons.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js', 'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/input/js/input.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/tag/js/tag.js', 'smart/smart/radio/js/radio.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/badge/js/badge.js', 'smart/smart/avatar/js/avatar.js', 'smart/smart/empty-state/js/empty-state.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1100, height: 800}});
  page.on('pageerror', (error) => console.error('pageerror', error.message));
  await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0">
    <div style="width:1000px"><sf-data-view id="v" accept-files><sf-table slot="content" id="t" drag-rows></sf-table></sf-data-view></div></body></html>`);
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => customElements.get('sf-data-view') && customElements.get('sf-table'), null, {timeout: 8000});
  await page.evaluate(() => {
    document.getElementById('v').setHostPort({
      version: '1.10.0', capabilities: [],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {answer: 'applied', sequence: payload.sequence, data: {records: [{id: 'f1', name: 'photo.png'}, {id: 'f2', name: 'price.xlsx'}, {id: 'f3', name: 'readme.md'}],
          total: 3, columns: [{key: 'name', label: 'Название', role: 'title'}], echo: {search: '', filters: {}, sort: [], page: 1, per_page: 25}}};
      },
    });
  });
  await page.waitForTimeout(900);
  const got = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#t tbody tr[data-row-id]')];
    const drag = (row) => {
      const transfer = new DataTransfer();
      row.querySelector('td[data-key="name"]').dispatchEvent(new DragEvent('dragstart', {bubbles: true, cancelable: true, dataTransfer: transfer}));
      return JSON.parse(transfer.getData('application/x-sf-records+json') || 'null');
    };
    const one = drag(rows[1]);
    const draggable = rows.every((row) => row.getAttribute('draggable') === 'true');
    const view = document.getElementById('v');
    window.dropped = null;
    view.addEventListener('sf-data-view-files-drop', (event) => { window.dropped = event.detail.files.map((file) => file.name); });
    const files = new DataTransfer();
    files.items.add(new File(['x'], 'new.pdf', {type: 'application/pdf'}));
    const target = document.querySelector('#t tbody td');
    target.dispatchEvent(new DragEvent('dragover', {bubbles: true, cancelable: true, composed: true, dataTransfer: files}));
    const zone = view.shadowRoot.querySelector('[part="drop"]');
    const shown = zone && !zone.hidden ? zone.textContent.trim() : null;
    target.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, composed: true, dataTransfer: files}));
    return {draggable, one, shown, hiddenAfter: zone?.hidden ?? null, dropped: window.dropped};
  });
  if (!got.draggable || got.one?.ids?.join() !== 'f2') note({case: 'a row carries its record', got});
  if (!got.shown || !got.hiddenAfter || got.dropped?.join() !== 'new.pdf') note({case: 'files over the view show the zone and go to the host', got});
  console.log(JSON.stringify(got));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('FILE_MANAGER_GESTURES_OK');
