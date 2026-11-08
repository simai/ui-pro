#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-view-properties 1.11.0: the property types the set draws itself (Larena
// addendum of 2026-11-03; Larena property types standard, notes of
// 2026-11-03), measured on the built bytes, at the view's sizes 1 and 1/2 and
// on a phone:
// - shown: money reads «1 500,50 ₽», percent «12,5 %», requisites
//   «ИНН …, КПП …», rows as a table with the total under the summed column;
// - money: a fixed currency's sign stands in the input; more minor digits than
//   the currency has hold the save and say so once left; a currency choice
//   when the field fixes none; the value written is {amount, currency} with a
//   decimal string;
// - percent: a % in the input; out of 0..100 holds the save;
// - rows: a typed cell recalculates the computed cell and the total live;
//   rows are added up to max_rows, moved and removed down to min_rows; the
//   save carries decimal strings, the computed cells last, and no float;
// - ru.requisites: a wrong ИНН holds the save and is said under its part; a
//   right one saves the parts in order;
// - the cell controls stand on the field ladder: a cell's input is as tall as
//   a plain string field's at the same size;
// - on a phone the rows are cards: no header row, each cell its label over its
//   value.
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
  'smart/smart/view-properties/css/view-properties.css',
];
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/input/js/input.js', 'smart/smart/button-icon/js/button-icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/drawer/js/drawer.js', 'smart/smart/tag/js/tag.js',
  'smart/smart/segmented/js/segmented.js', 'smart/smart/switch/js/switch.js',
  'smart/smart/field-renderers/js/field-renderers.js',
  'smart/smart/popover/js/popover.js', 'smart/smart/view-properties/js/view-properties.js',
];
const absent = [...styles, ...modules].map((path) => join(out, path)).filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.join(', ')}`);

const failures = [];
let checks = 0;
const check = (name, pass, got = {}) => { checks += 1; if (!pass) failures.push({check: name, got}); };

const RUB = (amount) => ({amount, currency: 'RUB'});
const columns = [
  {key: 'name', label: 'Наименование', type: 'string', required: true},
  {key: 'qty', label: 'Кол-во', type: 'number', settings: {scale: 3}},
  {key: 'price', label: 'Цена', type: 'money', settings: {currency: 'RUB'}},
  {key: 'vat', label: 'НДС', type: 'percent'},
  {key: 'sum', label: 'Сумма', type: 'money', compute: {op: 'multiply', of: ['qty', 'price']}, total: 'sum'},
];
const record = () => ({
  record_id: 'r1', revision: '7', actions: ['record.edit'],
  sections: [{key: 'main', label: 'Основное', groups: [
    {key: 'deal', label: 'Сделка', columns: 1, fields: [
      {key: 'title', label: 'Название', propertyType: 'string', value: 'Поставка'},
      {key: 'amount', label: 'Сумма договора', propertyType: 'money', currency: 'RUB', value: RUB('1500.5')},
      {key: 'deposit', label: 'Залог', propertyType: 'money', value: {amount: '10', currency: 'USD'}},
      {key: 'share', label: 'Доля', propertyType: 'percent', value: '12.5'},
      {key: 'items', label: 'Позиции', propertyType: 'items', width: 'full', minRows: 1, maxRows: 3, columns, value: [
        {name: 'Ручка', qty: '3', price: RUB('33.33'), vat: '20', sum: RUB('99.99')},
        {name: 'Тетрадь', qty: '2', price: RUB('1200.00'), sum: RUB('2400.00')},
      ]},
      {key: 'requisites', label: 'Реквизиты', propertyType: 'ru.requisites', width: 'full', parts: ['inn', 'kpp', 'ogrn', 'bik', 'account', 'corr_account'],
        value: {inn: '7707083893', kpp: '773601001'}},
    ]},
  ]}],
});

const browser = await chromium.launch();
try {
  const origin = 'http://probe.test';
  const page = await browser.newPage({viewport: {width: 1100, height: 1000}});
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
  await page.waitForFunction(() => Boolean(customElements.get('sf-view-properties')));

  const make = (mode, size, width = 900) => page.evaluate(async ({mode, size, width, record}) => {
    document.body.replaceChildren();
    window.raised = [];
    const view = document.createElement('sf-view-properties');
    view.id = 'view';
    view.setAttribute('record-id', 'r1');
    view.setAttribute('collection', 'deals');
    view.setAttribute('mode', mode);
    if (size) view.setAttribute('size', size);
    view.style.cssText = `display:block;width:${width}px`;
    document.body.append(view);
    view.setHostPort({
      version: '1.17.0', capabilities: [],
      async raise(intent, payload) {
        window.raised.push({intent, payload: JSON.parse(JSON.stringify(payload ?? {}))});
        return {answer: 'applied', record};
      },
    });
    for (let tries = 0; tries < 80 && !view.sections?.length; tries += 1) await new Promise((done) => setTimeout(done, 50));
    await new Promise((done) => setTimeout(done, 600));
  }, {mode, size, width, record: record()});

  const field = (key) => `sf-view-properties [data-field="${key}"]`;
  const retype = async (selector, text) => {
    await page.click(selector);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    if (text) await page.keyboard.type(text, {delay: 10});
    await page.waitForTimeout(80);
  };
  const leave = async () => { await page.keyboard.press('Tab'); await page.waitForTimeout(200); };
  const look = () => page.evaluate(() => {
    const view = document.getElementById('view');
    const save = view.querySelector('[data-action="save"]');
    const text = (selector) => view.querySelector(selector)?.textContent.replace(/\s+/gu, ' ').trim() ?? null;
    const message = (selector) => {
      const node = view.querySelector(selector)?.querySelector('[data-field-message]');
      return node?.getAttribute('data-field-message') === 'error' ? node.textContent.trim() : '';
    };
    const rows = [...view.querySelectorAll('[data-items="items"] .sf-view-items-row:not([data-totals])')];
    return {
      saveDisabled: save ? save.disabled === true || save.hasAttribute('disabled') : null,
      count: view.querySelector('.sf-property-view-errors')?.textContent.trim() ?? '',
      amountEnd: text('[data-field="amount"] sf-input .sf-input-text-end, [data-field="amount"] sf-input [class*="text-end"]'),
      amountMessage: message('[data-field="amount"] sf-input'),
      depositCurrency: view.querySelector('[data-field="deposit"] sf-dropdown')?.getAttribute('value') ?? null,
      shareMessage: message('[data-field="share"] sf-input'),
      rows: rows.length,
      sums: rows.map((row) => row.querySelector('[data-column="sum"] .sf-view-items-text')?.textContent.replace(/\s+/gu, ' ').trim()),
      total: text('[data-items="items"] [data-totals] [data-column="sum"] .sf-view-items-total'),
      add: view.querySelector('[data-items="items"] [data-action="row-add"]')?.hasAttribute('disabled') ?? null,
      removes: [...view.querySelectorAll('[data-items="items"] [data-action="row-remove"]')].map((node) => node.hasAttribute('disabled')),
      innMessage: message('[data-field="requisites"] [data-part="inn"] sf-input'),
    };
  });
  const saveBy = (mode) => page.evaluate(async (mode) => {
    const view = document.getElementById('view');
    const answer = mode === 'edit' ? await view.saveAll() : await view.saveGroup();
    await new Promise((done) => setTimeout(done, 200));
    return {answer: answer?.answer ?? null, reason: answer?.reason ?? null,
      raised: window.raised.filter((one) => one.intent === 'record.save' || one.intent === 'group.save')};
  }, mode);

  // Shown.
  await make('auto', '1');
  const shown = await page.evaluate(() => {
    const view = document.getElementById('view');
    // The value alone, not the pen glyph («edit») the open button carries.
    const text = (key) => view.querySelector(`[data-field="${key}"] .sf-property-view-field-value > :not(.sf-property-view-pen)`)?.textContent.replace(/[\s  ]+/gu, ' ').trim();
    return {amount: text('amount'), deposit: text('deposit'), share: text('share'), requisites: text('requisites'),
      rows: view.querySelectorAll('[data-field="items"] .sf-view-items-row:not([data-totals])').length,
      total: view.querySelector('[data-field="items"] [data-totals] .sf-view-items-total')?.textContent.replace(/[\s ]+/gu, ' ').trim(),
      inputs: view.querySelectorAll('[data-field="items"] sf-input').length};
  });
  check('shown: money with its sign and all minor digits', shown.amount === '1 500,50 ₽', shown);
  check('shown: a money of another currency', shown.deposit === '10,00 $', shown);
  check('shown: a percent with the locale\'s space', shown.share === '12,5 %', shown);
  check('shown: the requisites as one line', shown.requisites === 'ИНН 7707083893, КПП 773601001', shown);
  check('shown: rows as a table with the total, no inputs', shown.rows === 2 && shown.total === '2 499,99 ₽' && shown.inputs === 0, shown);

  for (const mode of ['edit', 'auto']) {
    const intent = mode === 'edit' ? 'record.save' : 'group.save';
    for (const size of ['1', '1/2']) {
      const at = (what) => `${intent} size ${size}: ${what}`;
      await make(mode, size);
      if (mode === 'auto') {
        await page.evaluate(() => document.getElementById('view').editGroup('main', 'deal'));
        await page.waitForTimeout(400);
      }
      const first = await look();
      check(at('rows drawn, the add button live, the total shown'), first.rows === 2 && first.add === false
        && first.total === '2 499,99 ₽', first);
      check(at('a currency choice where the field fixes none'), first.depositCurrency === 'USD', first);

      // Geometry: a cell's input and a field's input stand on one rung.
      const heights = await page.evaluate(() => {
        const view = document.getElementById('view');
        // The box sf-input draws (the host itself may draw none).
        const box = (selector) => view.querySelector(`${selector} .sf-input-field`)?.getBoundingClientRect().height ?? null;
        return {
          plain: box('[data-field="title"]'),
          cell: box('[data-items="items"] [data-row="0"] [data-column="qty"]'),
          money: box('[data-field="amount"]'),
          part: box('[data-field="requisites"] [data-part="inn"]'),
        };
      });
      check(at('a cell, an amount and a part are as tall as a plain field'), heights.plain > 20
        && [heights.cell, heights.money, heights.part].every((one) => one !== null && Math.abs(one - heights.plain) < 0.5), heights);
      // A cell's control fills its cell and no cell runs into the next one.
      const fit = await page.evaluate(() => [...document.querySelectorAll('#view [data-items="items"] [data-row="0"] .sf-view-items-cell')]
        .map((cell) => {
          const own = cell.getBoundingClientRect();
          const control = cell.querySelector('.sf-input-field')?.getBoundingClientRect();
          const input = cell.querySelector('.sf-input-field input');
          return control ? {key: cell.dataset.column, inside: control.left >= own.left - 0.5 && control.right <= own.right + 0.5,
            filled: control.width >= own.width - 1, readable: input.scrollWidth <= input.clientWidth + 1}
            : {key: cell.dataset.column, inside: true, filled: true, readable: true};
        }));
      check(at('every cell control fills its own cell, none overlaps the next, its digits are not cut'),
        fit.every((one) => one.inside && one.filled && one.readable), fit);

      // Money: too many minor digits.
      await retype(`${field('amount')} sf-input input`, '1500,555');
      const typing = await look();
      check(at('money: more minor digits hold the save'), typing.saveDisabled === true && /1$/u.test(typing.count) && typing.amountMessage === '', typing);
      await leave();
      const left = await look();
      check(at('money: said once left'), left.amountMessage === 'Не больше 2 знаков после запятой', left);
      await retype(`${field('amount')} sf-input input`, '2 000,5');
      await leave();

      // Percent out of bounds, then within.
      await retype(`${field('share')} sf-input input`, '120');
      await leave();
      const share = await look();
      check(at('percent: above 100 is said and holds the save'), share.shareMessage === 'От 0 до 100' && share.saveDisabled === true, share);
      await retype(`${field('share')} sf-input input`, '7,25');
      await leave();

      // Rows: a typed cell recalculates its row and the total.
      await retype(`${field('items')} [data-row="0"] [data-column="qty"] sf-input input`, '4');
      const recalculated = await look();
      check(at('rows: the computed cell and the total follow the typing'), recalculated.sums[0] === '133,32 ₽'
        && recalculated.total === '2 533,32 ₽', recalculated);
      await page.locator(`${field('items')} [data-action="row-add"]`).click({force: true});
      await page.waitForTimeout(200);
      const added = await look();
      check(at('rows: one added, and none past max_rows'), added.rows === 3 && added.add === true, added);
      await retype(`${field('items')} [data-row="2"] [data-column="name"] sf-input input`, 'Клей');
      await retype(`${field('items')} [data-row="2"] [data-column="qty"] sf-input input`, '1');
      await retype(`${field('items')} [data-row="2"] [data-column="price"] sf-input input`, '0,01');
      await leave();
      await page.locator(`${field('items')} [data-row="0"] [data-action="row-down"]`).click({force: true});
      await page.waitForTimeout(200);
      await page.locator(`${field('items')} [data-row="0"] [data-action="row-remove"]`).click({force: true});
      await page.waitForTimeout(200);
      const moved = await look();
      check(at('rows: moved and removed'), moved.rows === 2 && moved.add === false && moved.sums[0] === '133,32 ₽', moved);

      // Requisites: a wrong ИНН, then a right one.
      await retype(`${field('requisites')} [data-part="inn"] sf-input input`, '7707083894');
      await leave();
      const inn = await look();
      check(at('requisites: a wrong ИНН is said and holds the save'), inn.innMessage === 'Не сходятся контрольные цифры ИНН' && inn.saveDisabled === true, inn);
      await retype(`${field('requisites')} [data-part="inn"] sf-input input`, '7707083893');
      await retype(`${field('requisites')} [data-part="bik"] sf-input input`, '044525225');
      await leave();

      const saved = await saveBy(mode);
      const values = saved.raised[0]?.payload.values ?? {};
      const floats = JSON.stringify(values).match(/:\s*-?\d+(\.\d+)?[,}]/gu) ?? [];
      check(at(`one ${intent} carries decimal strings and no float`), saved.answer === 'applied' && saved.raised.length === 1
        && JSON.stringify(values.amount) === JSON.stringify({amount: '2000.5', currency: 'RUB'})
        && values.share === '7.25'
        && JSON.stringify(values.requisites) === JSON.stringify({inn: '7707083893', kpp: '773601001', bik: '044525225'})
        && floats.length === 0 && !('deposit' in values) && !('title' in values), {values, floats});
      check(at('rows: the saved rows in their new order, computed cells last'), JSON.stringify(values.items) === JSON.stringify([
        {name: 'Ручка', qty: '4', price: RUB('33.33'), vat: '20', sum: RUB('133.32')},
        {name: 'Клей', qty: '1', price: RUB('0.01'), sum: RUB('0.01')},
      ]), values.items);
    }
  }

  // A phone: a card a row.
  await page.setViewportSize({width: 390, height: 900});
  await make('edit', '1', 390);
  const phone = await page.evaluate(() => {
    const view = document.getElementById('view');
    const items = view.querySelector('[data-items="items"]');
    const head = items?.querySelector('.sf-view-items-head');
    const row = items?.querySelector('[data-row="0"]');
    const label = row?.querySelector('[data-column="qty"] .sf-view-items-cell-label');
    const cells = [...(row?.querySelectorAll('.sf-view-items-cell') ?? [])].map((cell) => cell.getBoundingClientRect());
    return {
      head: head ? getComputedStyle(head).display : null,
      border: row ? getComputedStyle(row).borderTopWidth : null,
      label: label ? getComputedStyle(label).display : null,
      stacked: cells.every((box, at) => at === 0 || box.top >= cells[at - 1].bottom - 0.5),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      // Each card inside the field, each control inside its card, its digits not cut.
      cards: [...items.querySelectorAll('.sf-view-items-row:not([data-totals])')].every((card) => {
        const own = card.getBoundingClientRect();
        const room = items.getBoundingClientRect();
        return own.right <= room.right + 0.5 && [...card.querySelectorAll('.sf-input-field')].every((control) => {
          const box = control.getBoundingClientRect();
          const input = control.querySelector('input');
          return box.left >= own.left - 0.5 && box.right <= own.right + 0.5 && input.scrollWidth <= input.clientWidth + 1;
        });
      }),
      qty: row?.querySelector('[data-column="qty"] input')?.value ?? null,
    };
  });
  check('phone: rows are cards, labels over values, no header, no sideways scroll', phone.head === 'none' && phone.border === '1px'
    && phone.label === 'block' && phone.stacked && !phone.overflow && phone.cards && phone.qty === '3', phone);
  console.log(JSON.stringify({checks}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('PROPERTY_VIEW_SET_FIELDS_OK');
