#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-property-view on simai.property-view-port 1.16.0 (consumer simai.main,
// agreed contract q-b0de123841): a masked string and a choice as buttons,
// measured on the built bytes with a host port that answers 1.16.0, both ways
// a record is saved -- one group (group.save) and the whole record open at once
// (record.save, «Изменить всё») -- at the view's sizes 1 and 1/2:
// - a masked string types through the mask; the stored text shows; the value
//   saved is the text as shown, fixed parts included;
// - while it is incomplete Save is disabled, the count stands beside it, the
//   field says «Заполните поле полностью» once left (and the panel does not say
//   it twice), and neither save is raised -- by the button or by the action;
// - two masked fields are complete or not each on its own;
// - a cleared optional one saves null, a nullable-false one "";
// - a choice as buttons: choosing saves the option's value, pressing the chosen
//   one again clears a field that is not required, a required one stays;
// - read-only: a masked field is shown, not typed in; a choice shows the chosen
//   button and none can be pressed. Disabled by a condition: the group is
//   disabled;
// - a plain string and a dropdown choice are what they were.
import {resolve, join} from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/inputs/css/inputs.css',
  'component/component/buttons/css/buttons.css', 'component/component/button-group/css/button-group.css',
  'component/component/dropdown/css/dropdown.css', 'smart/smart/drawer/css/drawer.css',
  'component/component/tags/css/tags.css', 'smart/smart/popover/css/popover.css',
  'smart/smart/property-view/css/property-view.css',
];
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/icon-button/js/icon-button.js', 'smart/smart/button/js/button.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/drawer/js/drawer.js', 'smart/smart/tag/js/tag.js',
  'smart/smart/button-group/js/button-group.js', 'smart/smart/field-renderers/js/field-renderers.js',
  'smart/smart/popover/js/popover.js', 'smart/smart/property-view/js/property-view.js',
];
const absent = [...styles, ...modules].map((path) => join(out, path)).filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.join(', ')}`);

const failures = [];
let checks = 0;
const check = (name, pass, got = {}) => { checks += 1; if (!pass) failures.push({check: name, got}); };
const browser = await chromium.launch();
try {
  // Served over a URL, not inlined: the bundles find their chunks -- the mask
  // is Core's and arrives on demand -- from where their script came from.
  const origin = 'http://probe.test';
  const page = await browser.newPage({viewport: {width: 1100, height: 900}});
  await page.route(`${origin}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body></body></html>'});
    const path = join(out, url.pathname);
    return existsSync(path)
      ? route.fulfill({status: 200, contentType: path.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', body: readFileSync(path)})
      : route.fulfill({status: 404, body: ''});
  });
  page.on('pageerror', (error) => failures.push({check: 'page error', got: error.message}));
  await page.goto(`${origin}/`);
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"></body></html>');
  for (const style of styles) await page.addStyleTag({url: `${origin}/${style}`}).catch(() => {});
  for (const module of modules) await page.addScriptTag({url: `${origin}/${module}`, type: 'module'});
  await page.waitForFunction(() => Boolean(customElements.get('sf-property-view')));

  const make = (mode, size) => page.evaluate(async ({mode, size}) => {
    document.body.replaceChildren();
    window.raised = [];
    const view = document.createElement('sf-property-view');
    view.id = 'view';
    view.setAttribute('record-id', 'r1');
    view.setAttribute('collection', 'contacts');
    view.setAttribute('mode', mode);
    if (size) view.setAttribute('size', size);
    view.style.cssText = 'display:block;width:640px';
    document.body.append(view);
    const options = [{value: 'person', label: 'Физлицо'}, {value: 'company', label: 'Юрлицо'}];
    const record = {
      record_id: 'r1', revision: '7', actions: ['record.edit'],
      sections: [{key: 'main', label: 'Основное', groups: [
        {key: 'contacts', label: 'Контакты', columns: 1, fields: [
          {key: 'phone', label: 'Телефон', propertyType: 'string', mask: '+7 (000) 000-00-00', value: '+7 (912) 345-67-89'},
          {key: 'fax', label: 'Факс', propertyType: 'string', mask: '+7 (000) 000-00-00', value: null},
          {key: 'inn', label: 'ИНН', propertyType: 'string', mask: '0000000000', nullable: false, required: true, value: '7701234567'},
          {key: 'shown', label: 'Телефон офиса', propertyType: 'string', mask: '+7 (000) 000-00-00', readonly: true, value: '+7 (495) 111-22-33'},
          {key: 'title', label: 'Название', propertyType: 'string', value: 'Ромашка'},
          {key: 'kind', label: 'Вид', propertyType: 'choice', variant: 'buttons', options, value: 'person'},
          {key: 'tier', label: 'Тариф', propertyType: 'choice', variant: 'buttons', size: '1/2', required: true,
            options: [{value: 1, label: 'Базовый'}, {value: 2, label: 'Расширенный'}], value: 1},
          {key: 'locked', label: 'Вид договора', propertyType: 'choice', variant: 'buttons', readonly: true, options, value: 'company'},
          {key: 'off', label: 'Вид оплаты', propertyType: 'choice', variant: 'buttons', options, value: 'person',
            when: {enabled: {field: 'title', op: 'eq', value: 'никогда'}}},
          {key: 'status', label: 'Статус', propertyType: 'choice', options: [{value: 'a', label: 'Активен'}, {value: 'b', label: 'Закрыт'}], value: 'a'},
        ]},
      ]}],
    };
    view.setHostPort({
      version: '1.16.0', capabilities: [],
      async raise(intent, payload) {
        window.raised.push({intent, payload: JSON.parse(JSON.stringify(payload ?? {}))});
        if (intent === 'record.load') return {answer: 'applied', record};
        if (intent === 'record.save' || intent === 'group.save') return {answer: 'applied', record};
        return {answer: 'applied'};
      },
    });
    for (let tries = 0; tries < 80 && !view.sections?.length; tries += 1) await new Promise((done) => setTimeout(done, 50));
    if (mode === 'auto') view.editGroup('main', 'contacts');
    await new Promise((done) => setTimeout(done, 500));
  }, {mode, size});

  const field = (key) => `sf-property-view [data-field="${key}"]`;
  const input = (key) => `${field(key)} sf-input input`;
  const look = () => page.evaluate(() => {
    const view = document.getElementById('view');
    // sf-button hands data-action to the native button it draws.
    const save = view.querySelector('[data-action="save"]');
    const control = (key) => view.querySelector(`[data-field="${key}"] sf-input`);
    const message = (key) => {
      const node = control(key)?.querySelector('[data-field-message]');
      return node?.getAttribute('data-field-message') === 'error' ? node.textContent.trim() : '';
    };
    const buttons = (key) => [...view.querySelectorAll(`[data-field="${key}"] sf-button-group .sf-button-group > button`)];
    return {
      saveDisabled: save ? save.disabled === true || save.hasAttribute('disabled') : null,
      count: view.querySelector('.sf-property-view-errors')?.textContent.trim() ?? '',
      panelErrors: [...view.querySelectorAll('.sf-property-view-field-error')].map((node) => node.textContent.trim()),
      phone: {text: control('phone')?.querySelector('input').value, invalid: control('phone')?.hasAttribute('invalid'), message: message('phone')},
      fax: {text: control('fax')?.querySelector('input').value, invalid: control('fax')?.hasAttribute('invalid'), message: message('fax')},
      shown: {input: Boolean(control('shown')), text: view.querySelector('[data-field="shown"] .sf-property-view-field-value')?.textContent.trim()},
      kind: buttons('kind').map((button) => button.getAttribute('aria-checked')),
      tier: buttons('tier').map((button) => button.getAttribute('aria-checked')),
      tierSize: view.querySelector('[data-field="tier"] sf-button-group')?.getAttribute('size'),
      locked: {checked: buttons('locked').map((button) => button.getAttribute('aria-checked')), disabled: buttons('locked').map((button) => button.disabled)},
      off: buttons('off').map((button) => button.disabled),
      dropdown: Boolean(view.querySelector('[data-field="status"] sf-dropdown')) && !view.querySelector('[data-field="status"] sf-button-group'),
      saves: window.raised.filter((one) => one.intent === 'record.save' || one.intent === 'group.save').length,
    };
  });
  const retype = async (key, text) => {
    await page.click(input(key));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    if (text) await page.keyboard.type(text, {delay: 10});
  };
  const leave = async () => { await page.keyboard.press('Tab'); await page.waitForTimeout(200); };
  const press = async (key, index) => {
    await page.locator(`${field(key)} sf-button-group .sf-button-group > button`).nth(index).click({force: true});
    await page.waitForTimeout(150);
  };
  const saveBy = (mode) => page.evaluate(async (mode) => {
    const view = document.getElementById('view');
    const answer = mode === 'edit' ? await view.saveAll() : await view.saveGroup();
    await new Promise((done) => setTimeout(done, 200));
    return {answer: answer?.answer ?? null, reason: answer?.reason ?? null,
      raised: window.raised.filter((one) => one.intent === 'record.save' || one.intent === 'group.save')};
  }, mode);

  for (const mode of ['edit', 'auto']) {
    const intent = mode === 'edit' ? 'record.save' : 'group.save';
    for (const size of ['1', '1/2']) {
      const at = (what) => `${intent} size ${size}: ${what}`;
      await make(mode, size);
      const first = await look();
      check(at('the stored masked text shows'), first.phone.text === '+7 (912) 345-67-89' && !first.phone.invalid, first);
      check(at('nothing changed: Save is disabled, as before'), first.saveDisabled === true, first);
      check(at('a read-only masked field is shown, not typed in'), !first.shown.input && first.shown.text === '+7 (495) 111-22-33', first);
      check(at('a choice as buttons shows the stored option'), JSON.stringify(first.kind) === '["true","false"]'
        && JSON.stringify(first.tier) === '["true","false"]' && first.tierSize === '1/2', first);
      check(at('read-only shows the chosen button, none disabled'), JSON.stringify(first.locked.checked) === '["false","true"]'
        && first.locked.disabled.every((one) => one === false), first);
      check(at('disabled by a condition: the group is disabled'), first.off.length === 2 && first.off.every((one) => one === true), first);
      check(at('a choice without the variant is the dropdown'), first.dropdown, first);

      // Typing an incomplete phone: Save disabled with the count; the message once left.
      await retype('phone', '912345');
      const typing = await look();
      check(at('typing incomplete: Save disabled, the count beside it'), typing.saveDisabled === true && /1$/u.test(typing.count)
        && typing.phone.text === '+7 (912) 345' && typing.phone.message === '', typing);
      await leave();
      const left = await look();
      check(at('left incomplete: the field says so, once'), left.phone.invalid && left.phone.message === 'Заполните поле полностью'
        && left.panelErrors.length === 0 && left.saveDisabled === true, left);
      await page.locator('sf-property-view [data-action="save"]').click({force: true});
      const viaAction = await saveBy(mode);
      check(at('neither the button nor the action raises a save'), viaAction.answer === 'refused' && viaAction.reason === 'input_invalid'
        && viaAction.raised.length === 0, viaAction);

      // A second masked field, on its own.
      await retype('fax', '12');
      await leave();
      await retype('phone', '9123456700');
      await leave();
      const one = await look();
      check(at('the phone completed, the fax still holds the save'), !one.phone.invalid && one.phone.text === '+7 (912) 345-67-00'
        && one.fax.invalid && one.fax.message === 'Заполните поле полностью' && one.saveDisabled === true && /1$/u.test(one.count), one);
      await retype('fax', '');
      await leave();
      const freed = await look();
      check(at('the fax cleared: Save is enabled'), freed.saveDisabled === false && !freed.fax.invalid && freed.count === '', freed);

      // Clearing a nullable-false field, and the choices.
      await retype('inn', '');
      await leave();
      await press('kind', 1);
      await press('kind', 1);
      const kind = await look();
      check(at('pressing the chosen button again clears it'), kind.kind.every((value) => value === 'false'), kind);
      await press('tier', 0);
      const stays = await look();
      check(at('a required choice stays chosen'), JSON.stringify(stays.tier) === '["true","false"]', stays);
      await press('tier', 1);
      await press('locked', 0);
      await press('off', 1);
      const locked = await look();
      check(at('read-only and disabled change nothing'), JSON.stringify(locked.locked.checked) === '["false","true"]', locked);
      await retype('title', 'Василёк');
      await leave();

      const saved = await saveBy(mode);
      const values = saved.raised[0]?.payload.values ?? {};
      check(at(`one ${intent} carries each value as the contract says`), saved.answer === 'applied' && saved.raised.length === 1
        && saved.raised[0].intent === intent && values.phone === '+7 (912) 345-67-00' && values.fax === null && values.inn === ''
        && values.kind === null && values.tier === 2 && values.title === 'Василёк'
        && !('locked' in values) && !('off' in values) && !('shown' in values) && !('status' in values), saved);
    }
  }
  // An empty optional masked field is allowed on its own: the stored phone cleared.
  await make('edit', '1');
  await retype('phone', '');
  await leave();
  const emptied = await saveBy('edit');
  check('record.save: a cleared optional masked field saves null', emptied.answer === 'applied'
    && emptied.raised[0]?.payload.values.phone === null, emptied);
  console.log(JSON.stringify({checks}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('PROPERTY_VIEW_MASK_BUTTONS_OK');
