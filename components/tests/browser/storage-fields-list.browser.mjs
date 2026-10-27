#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// The storage's fields as a list (owner, 2026-10-16; Larena's storage schema
// port): on the built bytes with a stub host that offers row-reorder and
// inline-edit:
// - a boolean the record names in `editable` is a checkbox; another is a mark;
// - pressing it raises record.set {record_id, key, value, revision}, and the
//   applied record replaces the row; a write the host confirms first asks;
// - a refusal leaves the checkbox as the host holds it;
// - dragging a row into another place raises record.reorder {record_ids,
//   before, revision}, shows the new order at once, and a refusal puts the
//   old order back.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css',
  'core/core/css/utility.full.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js',
  'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js',
  'smart/smart/spinner/js/spinner.js',
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js',
  'smart/smart/tag/js/tag.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1100, height: 800}});
await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><body style="margin:0"><div style="width:1000px">
  <sf-data-view id="v"><sf-table slot="content" id="t" toolbar="false"></sf-table></sf-data-view></div></body></html>`);
for (const path of styles) await page.addStyleTag({path}).catch(() => {});
for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
await page.waitForTimeout(900);

try {
  await page.evaluate(async () => {
    window.raised = [];
    window.mode = 'apply';
    const fields = ['title', 'code', 'status', 'owner'].map((key, position) => ({
      id: key, key, label: key.toUpperCase(), required: key === 'title', hidden: false, position, _revision: 's1',
      editable: key === 'owner' ? [] : ['required', 'hidden'],
    }));
    window.fields = fields;
    document.getElementById('v').setHostPort({
      version: '1.10.0', capabilities: ['row-reorder', 'inline-edit'],
      async raise(intent, payload) {
        window.raised.push({intent, payload: structuredClone(payload)});
        if (intent === 'query.change') {
          return {answer: 'applied', sequence: payload.sequence, data: {
            records: structuredClone(window.fields), total: window.fields.length,
            columns: [
              {key: 'label', label: 'Поле', role: 'title'},
              {key: 'required', label: 'Обязательное', property_type: 'boolean'},
              {key: 'hidden', label: 'Скрыто', property_type: 'boolean'},
            ],
            echo: {search: '', filters: {}, sort: [], page: 1, per_page: 25},
          }};
        }
        if (window.mode === 'refuse') return {answer: 'refused', reason: 'not-allowed'};
        if (intent === 'record.set') {
          if (payload.key === 'required' && !payload.confirm) {
            return {answer: 'refused', reason: 'confirm_required', data: {confirm: {digest: 'd1', summary: 'Записи без значения перестанут сохраняться.'}}};
          }
          const record = window.fields.find((one) => one.id === payload.record_id);
          record[payload.key] = payload.value;
          return {answer: 'applied', data: {records: [structuredClone(record)]},
            effects: [{type: 'record-changed.v1', value: {collection: 'storage.fields', id: 'demo', revision: 's2'}}]};
        }
        if (intent === 'record.reorder') {
          const moving = window.fields.filter((one) => payload.record_ids.includes(one.id));
          const rest = window.fields.filter((one) => !payload.record_ids.includes(one.id));
          const at = payload.before === null ? rest.length : rest.findIndex((one) => one.id === payload.before);
          window.fields = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
          window.fields.forEach((one, position) => { one.position = position; });
          // As Larena answers: the moved records as a patch of their positions.
          return {answer: 'applied', data: {records: structuredClone(moving)}};
        }
        return {answer: 'applied'};
      },
    });
    await new Promise((done) => setTimeout(done, 900));
  });
  const cells = () => page.evaluate(() => [...document.querySelectorAll('#t tbody tr[data-row-id]')].map((row) => ({
    id: row.dataset.rowId,
    boxes: [...row.querySelectorAll('[data-cell-edit]')].map((box) => `${box.getAttribute('data-cell-edit')}:${box.hasAttribute('checked') || box.querySelector('input')?.checked ? 1 : 0}`),
  })));
  const first = await cells();
  const owner = first.find((row) => row.id === 'owner');
  const code = first.find((row) => row.id === 'code');
  if (!code || code.boxes.join() !== 'required:0,hidden:0' || owner?.boxes.length) note({case: 'editable booleans are checkboxes, the others marks', got: first});

  // hidden applies at once.
  await page.evaluate(() => document.querySelector('#t tbody tr[data-row-id="code"] [data-cell-edit="hidden"] input')?.click());
  await page.waitForTimeout(500);
  const set = await page.evaluate(() => window.raised.filter((one) => one.intent === 'record.set'));
  const afterSet = (await cells()).find((row) => row.id === 'code');
  if (set.length !== 1 || set[0].payload.record_id !== 'code' || set[0].payload.key !== 'hidden' || set[0].payload.value !== true || set[0].payload.revision !== 's1') note({case: 'a checkbox raises record.set', got: set});
  if (afterSet?.boxes.join() !== 'required:0,hidden:1') note({case: 'the applied record replaces the row', got: afterSet});

  // required asks to confirm first.
  await page.evaluate(() => document.querySelector('#t tbody tr[data-row-id="status"] [data-cell-edit="required"] input')?.click());
  await page.waitForTimeout(600);
  const dialog = await page.evaluate(() => {
    const text = document.body.innerText;
    return {asked: /перестанут сохраняться/u.test(text)};
  });
  if (!dialog.asked) note({case: 'a write the host confirms first asks', got: dialog});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // A refusal leaves the box as the host holds it.
  await page.evaluate(() => { window.mode = 'refuse'; document.querySelector('#t tbody tr[data-row-id="code"] [data-cell-edit="required"] input')?.click(); });
  await page.waitForTimeout(600);
  const refused = (await cells()).find((row) => row.id === 'code');
  if (refused?.boxes.join() !== 'required:0,hidden:1') note({case: 'a refusal leaves the checkbox as the host holds it', got: refused});

  // Reorder: «status» before «title», applied.
  await page.evaluate(() => { window.mode = 'apply'; });
  const drag = async (from, to) => {
    const source = page.locator(`#t tbody tr[data-row-id="${from}"]`);
    const target = page.locator(`#t tbody tr[data-row-id="${to}"]`);
    const box = await target.boundingBox();
    await source.dragTo(target, {targetPosition: {x: 40, y: 3}});
    await page.waitForTimeout(500);
    return box;
  };
  await drag('status', 'title');
  const order = await page.evaluate(() => [...document.querySelectorAll('#t tbody tr[data-row-id]')].map((row) => row.dataset.rowId));
  const reorder = await page.evaluate(() => window.raised.filter((one) => one.intent === 'record.reorder').map((one) => one.payload));
  if (order.join() !== 'status,title,code,owner' || reorder.length !== 1 || reorder[0].record_ids.join() !== 'status' || reorder[0].before !== 'title') note({case: 'a dragged row raises record.reorder and stands in its new place', got: {order, reorder}});

  // A second drag right after the first is taken too (Larena, 2026-10-16:
  // it raised nothing).
  await drag('code', 'status');
  const second = await page.evaluate(() => ({
    order: [...document.querySelectorAll('#t tbody tr[data-row-id]')].map((row) => row.dataset.rowId),
    raised: window.raised.filter((one) => one.intent === 'record.reorder').length,
  }));
  if (second.raised !== 2 || second.order.join() !== 'code,status,title,owner') note({case: 'a second drag after an applied patch is taken', got: second});

  // Refused: the old order comes back.
  await page.evaluate(() => { window.mode = 'refuse'; });
  await drag('owner', 'status');
  const back = await page.evaluate(() => [...document.querySelectorAll('#t tbody tr[data-row-id]')].map((row) => row.dataset.rowId));
  if (back.join() !== 'code,status,title,owner') note({case: 'a refused reorder puts the old order back', got: back});
  console.log(JSON.stringify({first, set, afterSet, dialog, refused, order, reorder, back}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('STORAGE_FIELDS_LIST_OK');
