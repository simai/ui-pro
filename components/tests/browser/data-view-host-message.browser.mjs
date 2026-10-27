#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// A list the host refused or could not give says the host's own sentence
// (Larena storage-admin, 2026-10-21). Larena storage lists answer only from a
// read model; while a large storage's is built the host answers query.change
// {answer: 'unavailable', reason: 'storage_view_not_ready', message: «Список
// готовится…»}. Measured on the built bytes with a stub host behind a data view:
// - unavailable with a message → the error brick's title and the live region
//   say the message; no error notice is raised;
// - refused with a message → the no-access brick's title says it;
// - unavailable without a message → the general words and the error notice;
// - markup in the message is shown as text: no element is made from it.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/featured-icon/css/featured-icon.css',
  'component/component/pagination/css/pagination.css',
  'smart/smart/empty-state/css/empty-state.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/inputs/js/inputs.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js', 'smart/smart/tags/js/tags.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/empty-state/js/empty-state.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
].map((p) => join(out, p));

const PREPARING = 'Список готовится. Хранилище большое, список строится в фоне — обновите страницу через несколько минут';
const DENIED = 'Нет доступа к хранилищу «Файлы»';
const MARKUP = '<img src="x" onerror="window.pwned = 1"><b>Жирный</b> & <i>курсив</i>';
const GENERAL = 'Данные временно недоступны';

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1100, height: 900}});
page.on('pageerror', (error) => console.error('pageerror', error.message));
await page.setContent(`<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0">
  <div style="width:900px"><sf-data-view id="v" size="1/2"><sf-table slot="content" id="t"></sf-table></sf-data-view></div>
</body></html>`);
for (const path of styles) await page.addStyleTag({path}).catch(() => {});
for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
await page.waitForTimeout(900);

const settle = () => page.waitForTimeout(500);
// What the person sees and hears: the brick, the live region, and every error
// notice raised since the last look -- through SF.notify, which the view uses
// when the page has it, or as a toast in its own notice band.
const look = () => page.evaluate(() => {
  const view = document.getElementById('v');
  const element = document.querySelector('#t sf-empty-state');
  const title = element?.querySelector('.sf-empty-state-title');
  const band = [...view.querySelectorAll(':scope > [slot="notice"] sf-toast')]
    .map((toast) => ({status: toast.getAttribute('status'), title: toast.getAttribute('heading')}));
  const notified = window.notified.splice(0);
  return {
    state: view.getAttribute('data-state'),
    kind: element?.getAttribute('kind') ?? null,
    title: title?.textContent.trim() ?? null,
    titleElements: title ? title.children.length : null,
    status: view.shadowRoot.querySelector('[part="status"]').textContent,
    statusRole: view.shadowRoot.querySelector('[part="status"]').getAttribute('role'),
    errors: [...notified, ...band].filter((one) => one.status === 'error'),
    pwned: window.pwned ?? null,
  };
});
const answerWith = (next) => page.evaluate((one) => { window.next = one; }, next);
const reload = async () => {
  await page.evaluate(() => {
    window.notified.splice(0);
    const view = document.getElementById('v');
    view.notify('');
    view.refresh('probe');
  });
  await settle();
  return look();
};

try {
  await page.evaluate(() => {
    window.notified = [];
    if (typeof globalThis.SF?.notify === 'function') {
      const original = globalThis.SF.notify.bind(globalThis.SF);
      globalThis.SF.notify = (options) => { window.notified.push({status: options?.status, title: options?.title}); return original(options); };
    }
    window.next = {answer: 'unavailable', reason: 'storage_view_not_ready'};
    document.getElementById('v').setHostPort({
      version: '1.12.0', capabilities: [],
      async raise(intent, payload) {
        if (intent !== 'query.change') return {answer: 'applied'};
        return {...window.next, sequence: payload.sequence};
      },
    });
  });
  await settle();

  await answerWith({answer: 'unavailable', reason: 'storage_view_not_ready', message: PREPARING});
  const preparing = await reload();
  if (preparing.state !== 'error' || preparing.kind !== 'error' || preparing.title !== PREPARING
      || preparing.status !== PREPARING || preparing.statusRole !== 'status' || preparing.errors.length) {
    note({case: 'unavailable with a message', got: preparing});
  }

  await answerWith({answer: 'refused', reason: 'forbidden', message: DENIED});
  const denied = await reload();
  if (denied.kind !== 'no-access' || denied.title !== DENIED || denied.status !== DENIED) {
    note({case: 'refused with a message', got: denied});
  }

  await answerWith({answer: 'unavailable', reason: 'down'});
  const general = await reload();
  if (general.state !== 'error' || general.kind !== 'error' || general.title === PREPARING
      || general.status !== GENERAL || general.errors.length !== 1) {
    note({case: 'unavailable without a message', got: general});
  }

  await answerWith({answer: 'unavailable', reason: 'storage_view_not_ready', message: MARKUP});
  const markup = await reload();
  if (markup.title !== MARKUP || markup.titleElements !== 0 || markup.status !== MARKUP
      || markup.pwned !== null || markup.errors.length) {
    note({case: 'markup in the message is text', got: markup});
  }

  console.log(JSON.stringify({preparing, denied, general, markup}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('DATA_VIEW_HOST_MESSAGE_OK');
