#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// An embedded list inside a property view, measured where it shows: a related
// group holds an sf-data-view with no chrome, beside a group of fields. The
// list draws no card of its own inside the group card, the table inside it
// draws no second card, and the row text starts on the same inline axis as the
// field labels above it. Zero tolerance, at a desktop and a mobile width. Row
// height against the size ladder waits for sf-table to have a size.
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
  'smart/smart/property-view/css/property-view.css',
  'smart/smart/sortable/css/sortable.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
  'component/component/pagination/css/pagination.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js', 'smart/smart/badges/js/badges.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/inputs/js/inputs.js', 'smart/smart/tree/js/tree.js',
  'smart/smart/tree-item/js/tree-item.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/buttons/js/buttons.js',
  'smart/smart/progress-scale/js/progress-scale.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js',
  'smart/smart/tags/js/tags.js',
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
  'smart/smart/property-view/js/property-view.js',
].map((p) => join(out, p));

const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}`);

const DUMP = process.env.DUMP === '1';
const failures = [];
let measured = 0;
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({viewport: {width, height: 900}});
    await page.setContent('<!doctype html><html class="theme-light" lang="en"><body style="margin:0;padding:24px"></body></html>');
    for (const path of styles) await page.addStyleTag({path});
    for (const path of modules) await page.addScriptTag({path});
    await page.waitForTimeout(300);
    const result = await page.evaluate(async (dump) => {
      document.addEventListener('sf-host-port-request', (event) => {
        const element = event.target;
        if (element.tagName !== 'SF-DATA-VIEW') return;
        element.setHostPort({
          version: '1.6.0', capabilities: [],
          async raise(intent, payload) {
            if (intent !== 'query.change') return {answer: 'applied'};
            return {answer: 'applied', sequence: payload.sequence, data: {
              records: [{id: '1', number: 'A-1', revision: 'r1', actions: []}, {id: '2', number: 'A-2', revision: 'r1', actions: []}],
              total: 2,
              columns: [{key: 'number', label: 'Number', role: 'title', width: 200}],
              echo: {search: '', filters: {}, sort: [], page: 1, per_page: 10},
            }};
          },
        });
      });
      const view = document.createElement('sf-property-view');
      view.setAttribute('record-id', 'record-1');
      view.setAttribute('collection', 'pages');
      document.body.append(view);
      view.setHostPort({
        version: '1.7.0', capabilities: [],
        async raise(intent) {
          if (intent !== 'record.load') return {answer: 'unavailable', reason: 'unknown-intent'};
          return {answer: 'applied', record: {record_id: 'record-1', revision: '1', sections: [{key: 'only', groups: [
            {key: 'about', label: 'About', columns: 1, fields: [{key: 'title', label: 'Title', propertyType: 'string', value: 'Record'}]},
            {key: 'invoices', label: 'Invoices', kind: 'related', rowCap: 3},
          ]}]}};
        },
      });
      await new Promise((done) => setTimeout(done, 1500));
      const group = view.querySelector('[data-group="invoices"]');
      const fields = view.querySelector('[data-group="about"]');
      const list = group?.querySelector('sf-data-view');
      // The table is slotted into the list's light DOM; a shadow-tree fallback
      // is looked for only when none is.
      const table = list?.querySelector('sf-table') || list?.shadowRoot?.querySelector('sf-table');
      if (dump) return {field: fields?.innerHTML.slice(0, 400)};
      const frame = (element) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        return {border: style.borderTopWidth, shadow: style.boxShadow, radius: style.borderTopLeftRadius, padding: style.paddingTop, background: style.backgroundColor};
      };
      const textLeft = (element) => {
        if (!element) return null;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {acceptNode: (node) => node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT});
        const node = walker.nextNode();
        if (!node) return null;
        const range = document.createRange();
        range.selectNodeContents(node);
        return Math.round(range.getBoundingClientRect().left * 100) / 100;
      };
      const label = fields?.querySelector('.sf-property-view-field-label');
      const firstRow = table?.querySelector('tbody tr');
      const headerCells = [...(table?.querySelectorAll('thead th') || [])].map((cell) => cell.dataset.key);
      return {
        list: frame(list),
        tableParts: Object.fromEntries(['.sf-table', '.table-wrap', '.sf-table-scroll', 'table'].map((selector) => [selector, frame(table?.querySelector(selector) || (table?.matches?.(selector) ? table : null))])),
        labelLeft: textLeft(label),
        rowTextLeft: textLeft(firstRow?.querySelector('td[data-key="number"]') || firstRow?.querySelector('td:last-child')),
        columns: headerCells,
        rows: table?.querySelectorAll('tbody tr').length ?? 0,
      };
    }, DUMP);
    await page.close();
    if (DUMP) { console.log(JSON.stringify(result, null, 1)); break; }
    measured += 1;
    const where = `${width}px`;
    console.error(where, JSON.stringify(result));
    if (!result.rows) { failures.push(`${where}: the embedded list rendered no rows`); continue; }
    if (result.list.border !== '0px' || result.list.padding !== '0px' || result.list.shadow !== 'none') failures.push(`${where}: the list draws a card of its own: ${JSON.stringify(result.list)}`);
    for (const [part, style] of Object.entries(result.tableParts)) {
      if (style && (style.border !== '0px' || style.shadow !== 'none')) failures.push(`${where}: the table's ${part} draws a frame inside the group card: ${JSON.stringify(style)}`);
    }
    const extra = result.columns.filter((key) => ['select', 'settings'].includes(key));
    if (extra.length) failures.push(`${where}: an embedded list with chrome="" still renders the ${extra.join(' and ')} column`);
    if (result.labelLeft !== result.rowTextLeft) failures.push(`${where}: row text starts at ${result.rowTextLeft}, the field labels at ${result.labelLeft}`);
  }
} finally {
  await browser.close();
}
if (!DUMP) {
  console.log(JSON.stringify({measured, failures}, null, 1));
  process.exitCode = failures.length ? 1 : 0;
}
