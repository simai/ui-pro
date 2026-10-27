#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-change-confirm on the built bytes:
// - the values read as «field: was …, will be …», as text, empty ones named;
// - Confirm reports the change and waits (pending: the answers stay, the pressed
//   one busy -- aria-busy and the button's spinner -- and the other disabled;
//   the status saying so, focus on it); the host's outcome is then all there is;
// - a host that cancels the event keeps the question open, focus back on the
//   first answer; Decline is reported the same way;
// - the keyboard answers as the pointer does (Tab, Space, Enter);
// - an offer runs out at expires-at: the answers go, the host hears it once;
// - disabled answers cannot be pressed, and a long value wraps inside the card;
// - the words in both languages, accept-text and decline-text winning.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/buttons/css/buttons.css',
  'smart/smart/change-confirm/css/change-confirm.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js',
  'smart/smart/change-confirm/js/change-confirm.js',
].map((p) => join(out, p));
const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) throw new Error(`${absent.length} build asset(s) not found under ${out}: ${absent.join(', ')}`);

const failures = [];
const note = (detail) => failures.push(detail);
const errors = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 900, height: 700}});
  // Bundles added as inline module tags cannot work out their own public path;
  // the Loader gives them one on a real page. That one message is the harness's.
  page.on('pageerror', (error) => { if (!/Automatic publicPath/u.test(error.message)) errors.push(error.message); });
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"><button id="before">до</button><div id="box" style="width:420px;padding:16px"></div></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-change-confirm')));

  const make = async ({attributes = {}, changes = null, cancel = null} = {}) => {
    await page.evaluate(async ({attributes, changes, cancel}) => {
      const box = document.getElementById('box');
      box.replaceChildren();
      window.events = [];
      const card = document.createElement('sf-change-confirm');
      card.id = 'card';
      for (const [name, value] of Object.entries(attributes)) card.setAttribute(name, value);
      // The 1.1 names (vocabulary answer {id, accepted}; the fact expired),
      // read back as the person's two answers and the expiry.
      card.addEventListener('sf-change-confirm-answer', (event) => {
        const name = event.detail.accepted ? 'accept' : 'decline';
        window.events.push({name, id: event.detail.id});
        if (cancel === name) event.preventDefault();
      });
      card.addEventListener('sf-change-confirm-expired', (event) => window.events.push({name: 'expire', id: event.detail.id}));
      box.append(card);
      card.changes = changes ?? [
        {label: 'Название', before: 'Новости', after: 'События'},
        {label: 'Описание', before: '', after: '<b id="bold">жирно</b>'},
      ];
      await new Promise((done) => setTimeout(done, 250));
    }, {attributes, changes, cancel});
  };
  const read = () => page.evaluate(() => {
    const card = document.getElementById('card');
    return {
      state: card.querySelector('.sf-change-confirm').dataset.state,
      attribute: card.getAttribute('state'),
      // The words, not the glyph's ligature beside them.
      status: (card.querySelector('.sf-change-confirm__status > span')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      actions: !card.querySelector('.sf-change-confirm__actions').hidden,
      buttons: [...card.querySelectorAll('.sf-change-confirm__actions button')].map((node) => ({
        busy: node.getAttribute('aria-busy') === 'true', disabled: node.disabled,
        spinner: Boolean(node.querySelector('.sf-button-spinner')),
      })),
      focus: document.activeElement?.className ?? null,
      events: window.events.slice(),
    };
  });

  // 1. What is read.
  await make({attributes: {heading: 'Переименовать раздел', 'change-id': 'c1'}});
  const shape = await page.evaluate(() => {
    const card = document.getElementById('card');
    const section = card.querySelector('section');
    const heading = card.querySelector('[role="heading"]');
    return {
      named: section.getAttribute('aria-labelledby') === heading.id,
      level: heading.getAttribute('aria-level'),
      terms: [...card.querySelectorAll('dt')].map((node) => node.textContent),
      before: [...card.querySelectorAll('.sf-change-confirm__before')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
      after: [...card.querySelectorAll('.sf-change-confirm__after')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
      bold: Boolean(document.getElementById('bold')),
      buttons: [...card.querySelectorAll('.sf-change-confirm__actions button')].map((node) => node.textContent.trim()),
      live: card.querySelector('.sf-change-confirm__status').getAttribute('role'),
    };
  });
  const expected = {named: true, level: '3', terms: ['Название', 'Описание'], before: ['Было Новости', 'Было пусто'],
    after: ['Станет События', 'Станет <b id="bold">жирно</b>'], bold: false, buttons: ['Подтвердить', 'Отклонить'], live: 'status'};
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(shape[key]) !== JSON.stringify(value)) note({case: `what is read: ${key}`, got: shape[key], expected: value});
  }
  const weights = await page.evaluate(() => [...document.querySelectorAll('#card .sf-change-confirm__actions button')].map((node) => getComputedStyle(node).backgroundColor));
  if (weights[0] !== weights[1]) note({case: 'both answers weigh the same', got: weights});

  // 2. Confirm: pending, focus on the status, the host's outcome.
  await page.click('#card [data-action="accept"]');
  await page.waitForTimeout(200);
  let now = await read();
  if (now.state !== 'pending' || !now.actions || now.status !== 'Применяется…' || !String(now.focus).includes('sf-change-confirm__status')
      || JSON.stringify(now.events) !== JSON.stringify([{name: 'accept', id: 'c1'}])) {
    note({case: 'Confirm reports the change and waits, focus on what happens', got: now});
  }
  // The waiting look (owner, 2026-10-28, q-a49e2045c1): the pressed answer busy
  // with its spinner, the other disabled and not busy.
  if (!(now.buttons[0]?.busy && now.buttons[0]?.spinner && now.buttons[0]?.disabled)
      || now.buttons[1]?.busy || !now.buttons[1]?.disabled) {
    note({case: 'while the answer is applied the pressed button is busy and the other disabled', got: now.buttons});
  }
  await page.evaluate(() => { document.getElementById('card').state = 'accepted'; });
  await page.waitForTimeout(150);
  now = await read();
  if (now.state !== 'accepted' || now.actions || now.status !== 'Применено') note({case: 'the host\'s outcome is all there is', got: now});
  const again = await page.evaluate(() => document.getElementById('card').answer({accepted: false}));
  if (again?.outcome !== 'refused') note({case: 'a settled card answers nothing more'});

  // 3. A host that cancels keeps the question open.
  await make({attributes: {'change-id': 'c2'}, cancel: 'accept'});
  await page.click('#card [data-action="accept"]');
  await page.waitForTimeout(250);
  now = await read();
  if (now.state !== 'open' || !now.actions || !String(now.focus).includes('sf-button')) note({case: 'a cancelled answer keeps the question open, focus on the first answer', got: now});
  await page.click('#card [data-action="decline"]');
  await page.waitForTimeout(200);
  now = await read();
  if (now.state !== 'pending' || now.status !== 'Отклоняется…' || now.events.at(-1)?.name !== 'decline') note({case: 'Decline is reported and waits', got: now});
  if (now.buttons[0]?.busy || !now.buttons[0]?.disabled || !(now.buttons[1]?.busy && now.buttons[1]?.spinner)) {
    note({case: 'while a decline is applied the decline button is busy and confirm disabled', got: now.buttons});
  }
  await page.evaluate(() => { document.getElementById('card').state = 'declined'; });
  await page.waitForTimeout(150);
  now = await read();
  if (now.status !== 'Отклонено') note({case: 'declined', got: now.status});

  // 4. The keyboard answers as the pointer does.
  await make({attributes: {'change-id': 'c3'}});
  await page.focus('#before');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  now = await read();
  if (JSON.stringify(now.events) !== JSON.stringify([{name: 'accept', id: 'c3'}])) note({case: 'Tab and Space confirm', got: now.events});
  await make({attributes: {'change-id': 'c4'}});
  await page.focus('#before');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  now = await read();
  if (JSON.stringify(now.events) !== JSON.stringify([{name: 'decline', id: 'c4'}])) note({case: 'Tab, Tab and Enter decline', got: now.events});

  // 5. An offer runs out.
  const soon = await page.evaluate(() => new Date(Date.now() + 1500).toISOString());
  await make({attributes: {'change-id': 'c5', 'expires-at': soon}});
  now = await read();
  if (!/^Подтвердить можно до \d{2}:\d{2}$/u.test(now.status) || !now.actions) note({case: 'an open offer says until when', got: now});
  await page.waitForTimeout(2000);
  now = await read();
  if (now.state !== 'expired' || now.actions || now.status !== 'Время подтверждения истекло'
      || JSON.stringify(now.events) !== JSON.stringify([{name: 'expire', id: 'c5'}])) note({case: 'past its time the answers go, said once', got: now});
  const late = await page.evaluate(() => document.getElementById('card').answer({accepted: true}));
  if (late?.outcome !== 'refused') note({case: 'an expired offer cannot be confirmed'});
  // The host reopens with a new time: the question is back.
  const later = await page.evaluate(() => new Date(Date.now() + 60 * 60 * 1000).toISOString());
  await page.evaluate((value) => document.getElementById('card').setAttribute('expires-at', value), later);
  await page.waitForTimeout(150);
  now = await read();
  if (now.state !== 'open' || !now.actions) note({case: 'a new time reopens the offer', got: now});

  // 6. Disabled, and a long value.
  await make({attributes: {'change-id': 'c6', disabled: ''}, changes: [{label: 'Адрес', before: 'https://example.test/'.repeat(1), after: 'https://example.test/очень-длинный-путь-без-пробелов-'.repeat(8)}]});
  const disabled = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll('#card .sf-change-confirm__actions button')].map((node) => node.disabled),
    answered: document.getElementById('card').answer({accepted: true}).outcome === 'applied',
    overflow: (() => { const card = document.querySelector('#card .sf-change-confirm'); return card.scrollWidth > card.clientWidth; })(),
  }));
  if (JSON.stringify(disabled) !== JSON.stringify({buttons: [true, true], answered: false, overflow: false})) note({case: 'disabled answers, and a long value wraps', got: disabled});

  // 7. Words.
  await make({attributes: {'accept-text': 'Применить', 'decline-text': 'Отменить'}});
  const own = await page.evaluate(() => [...document.querySelectorAll('#card .sf-change-confirm__actions button')].map((node) => node.textContent.trim()));
  if (own.join() !== 'Применить,Отменить') note({case: 'accept-text and decline-text win', got: own});
  await page.evaluate(() => document.documentElement.setAttribute('lang', 'en'));
  await make();
  const english = await page.evaluate(() => ({
    label: document.querySelector('#card section').getAttribute('aria-label'),
    buttons: [...document.querySelectorAll('#card .sf-change-confirm__actions button')].map((node) => node.textContent.trim()),
    tags: [...document.querySelectorAll('#card .sf-change-confirm__tag')].slice(0, 2).map((node) => node.textContent),
  }));
  if (JSON.stringify(english) !== JSON.stringify({label: 'What will change', buttons: ['Confirm', 'Decline'], tags: ['Was', 'Will be']})) note({case: 'an English page speaks English', got: english});

  if (errors.length) note({case: 'no page errors', got: errors});
  console.log(JSON.stringify({checked: 7}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('CHANGE_CONFIRM_OK');
