#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-message-log on the built bytes: what a person reading a conversation relies
// on, for an assistant's conversation and a people's one alike.
// - a long conversation opens at its end, runs of one author are marked, the
//   reader's own messages are on the end side;
// - a message is drawn by the host's renderer, and as text when there is none:
//   markup in a message is shown, not run;
// - earlier history prepended does not move what is being read, and the top
//   asks for it once; a cancelled request lets the button be pressed again;
// - a new message follows the bottom only when the reader is there or wrote it,
//   otherwise «to the latest» appears;
// - what is new is announced once, what a conversation opens with is not;
// - from «to the latest» the keyboard moves between messages, and ArrowUp on the
//   first asks for more;
// - an unchanged message keeps its node and the focus inside it; a message that
//   got its server id keeps its place;
// - the empty slot, and the words in both languages.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/buttons/css/buttons.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'smart/smart/message-log/css/message-log.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/message-log/js/message-log.js',
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
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"><div id="box" style="display:flex;flex-direction:column;height:480px;width:720px"></div></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-message-log')));

  const frames = (count = 3) => page.evaluate((n) => new Promise((done) => {
    const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : done());
    step(n);
  }), count);

  // A conversation of people: Анна writes in runs, the reader answers.
  const make = async ({count = 60, hasMore = true, renderer = false, empty = false} = {}) => {
    await page.evaluate(async ({count, hasMore, renderer, empty}) => {
      const box = document.getElementById('box');
      box.replaceChildren();
      window.events = [];
      const log = document.createElement('sf-message-log');
      log.id = 'log';
      if (empty) log.innerHTML = '<div slot="empty"><p id="greeting">Начните разговор</p></div>';
      log.addEventListener('sf-message-log-load-earlier', (event) => window.events.push(event.detail));
      box.append(log);
      if (renderer) {
        window.drawn = [];
        log.renderMessage = (message, context) => {
          window.drawn.push({id: message.id, first: context.first, last: context.last});
          const article = document.createElement('article');
          article.className = 'host-message';
          article.dataset.first = String(context.first);
          article.textContent = message.text;
          const button = document.createElement('button');
          button.className = 'host-like';
          button.textContent = '♥';
          article.append(button);
          return article;
        };
      }
      const messages = Array.from({length: count}, (_, index) => {
        const own = index % 5 === 4;
        return {
          id: `m${index + 100}`,
          author: own ? 'me' : 'anna',
          author_name: own ? 'Я' : 'Анна',
          own,
          text: `Сообщение ${index + 100}. ${'Длинный текст строки. '.repeat(index % 3 + 1)}`,
        };
      });
      log.setMessages(messages, {hasMore});
      await log.whenRendered?.();
    }, {count, hasMore, renderer, empty});
    await frames(4);
    await page.waitForTimeout(150);
  };
  const state = () => page.evaluate(() => {
    const log = document.getElementById('log');
    const scroller = log.querySelector('.sf-message-log');
    return {
      atLatest: log.isAtLatest(),
      top: scroller.scrollTop,
      height: scroller.scrollHeight,
      items: log.querySelectorAll('.sf-message-log__item').length,
      jumpHidden: log.querySelector('.sf-message-log__jump').hidden,
      announced: log.querySelector('.sf-message-log__announcer').textContent,
      events: window.events.slice(),
    };
  });

  // 1. A long conversation opens at its end; the top is not asked for.
  await make();
  let now = await state();
  if (!now.atLatest || now.items !== 60) note({case: 'opens at the end of a long conversation', got: now});
  if (now.events.length) note({case: 'opening asks for no earlier page', got: now.events});
  if (now.announced) note({case: 'what a conversation opens with is not announced', got: now.announced});

  // Runs and sides: m100–m103 are Анна's run, m104 is the reader's own.
  const runs = await page.evaluate(() => ['m100', 'm101', 'm103', 'm104'].map((id) => {
    const item = document.querySelector(`.sf-message-log__item[data-id="${id}"]`);
    return {id, first: item.classList.contains('sf-message-log__item--first'), last: item.classList.contains('sf-message-log__item--last'),
      own: item.classList.contains('sf-message-log__item--own'), author: item.querySelector('.sf-message-log__author')?.textContent ?? null};
  }));
  const expectRuns = [
    {id: 'm100', first: true, last: false, own: false, author: 'Анна'},
    {id: 'm101', first: false, last: false, own: false, author: null},
    {id: 'm103', first: false, last: true, own: false, author: null},
    {id: 'm104', first: true, last: true, own: true, author: null},
  ];
  if (JSON.stringify(runs) !== JSON.stringify(expectRuns)) note({case: 'runs of one author and the reader\'s side', got: runs});
  const side = await page.evaluate(() => {
    const own = document.querySelector('.sf-message-log__item[data-id="m104"] .sf-message-log__text').getBoundingClientRect();
    const other = document.querySelector('.sf-message-log__item[data-id="m103"] .sf-message-log__text').getBoundingClientRect();
    return {ownRight: Math.round(own.right), otherLeft: Math.round(other.left), column: Math.round(document.querySelector('.sf-message-log__column').getBoundingClientRect().right)};
  });
  if (side.column - side.ownRight > 40) note({case: 'the reader\'s own message sits on the end side', got: side});

  // 2. Markup in a message is text.
  await page.evaluate(() => document.getElementById('log').upsert({id: 'html', author: 'anna', author_name: 'Анна', text: '<b id="bold">жирный</b>'}));
  await frames(3);
  const markup = await page.evaluate(() => ({element: Boolean(document.getElementById('bold')), text: document.querySelector('[data-id="html"] .sf-message-log__text')?.textContent}));
  if (markup.element || markup.text !== '<b id="bold">жирный</b>') note({case: 'markup in a message is shown as text', got: markup});

  // 3. Earlier history: the reader's place does not move.
  await make();
  await page.evaluate(() => { document.querySelector('#log .sf-message-log').scrollTop = 900; });
  await frames(2);
  await page.evaluate(() => { window.events.length = 0; });
  const anchorBefore = await page.evaluate(() => {
    const scroller = document.querySelector('#log .sf-message-log');
    const item = document.querySelector('.sf-message-log__item[data-id="m130"]');
    return item.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  });
  await page.evaluate(() => document.getElementById('log').prependMessages(
    Array.from({length: 20}, (_, index) => ({id: `e${index}`, author: 'anna', author_name: 'Анна', text: `Ранее ${index}`})), {hasMore: true}));
  await frames(2);
  const anchorAfter = await page.evaluate(() => {
    const scroller = document.querySelector('#log .sf-message-log');
    const item = document.querySelector('.sf-message-log__item[data-id="m130"]');
    return item.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  });
  if (Math.abs(anchorAfter - anchorBefore) > 1) note({case: 'prepended history does not move what is read', got: {anchorBefore, anchorAfter}});
  now = await state();
  if (now.items !== 80) note({case: 'prepended history is in the column', got: now.items});

  // 4. The top asks once; a cancelled request lets the button be pressed again.
  await page.evaluate(() => { window.events.length = 0; });
  await page.evaluate(() => { document.querySelector('#log .sf-message-log').scrollTop = 0; });
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.querySelector('#log .sf-message-log').scrollTop = 1; });
  await page.waitForTimeout(150);
  now = await state();
  if (now.events.length !== 1 || now.events[0].before !== 'e0') note({case: 'the top asks for earlier history once, before the first message', got: now.events});
  const disabled = await page.evaluate(() => document.querySelector('.sf-message-log__earlier button')?.disabled);
  if (disabled !== true) note({case: 'the earlier button waits while a request is out', got: disabled});
  await page.evaluate(() => {
    const log = document.getElementById('log');
    log.addEventListener('sf-message-log-load-earlier', (event) => event.preventDefault(), {once: true});
    log.earlierFailed();
  });
  await frames(2);
  await page.evaluate(() => { window.events.length = 0; });
  await page.click('.sf-message-log__earlier button');
  await frames(2);
  const afterCancel = await page.evaluate(() => ({events: window.events.length, disabled: document.querySelector('.sf-message-log__earlier button')?.disabled}));
  if (afterCancel.events !== 1 || afterCancel.disabled !== false) note({case: 'a cancelled request leaves the button pressable', got: afterCancel});

  // 5. Following the bottom.
  await make({hasMore: false});
  await page.evaluate(() => document.getElementById('log').upsert({id: 'n1', author: 'anna', author_name: 'Анна', text: 'Новое снизу'}));
  await frames(4);
  await page.waitForTimeout(400);
  now = await state();
  if (!now.atLatest) note({case: 'at the bottom, a new message is followed', got: now});
  if (now.announced !== 'Анна: Новое снизу') note({case: 'a finished message from someone else is announced once', got: now.announced});
  await page.evaluate(() => { document.querySelector('#log .sf-message-log').scrollTop = 200; });
  await frames(2);
  await page.evaluate(() => document.getElementById('log').upsert({id: 'n2', author: 'anna', author_name: 'Анна', text: 'Пока читаю выше'}));
  await frames(4);
  await page.waitForTimeout(300);
  now = await state();
  if (now.atLatest || now.top > 260 || now.jumpHidden) note({case: 'reading above, a new message does not pull, «to the latest» shows', got: now});
  await page.evaluate(() => document.getElementById('log').upsert({id: 'n3', author: 'me', own: true, text: 'Моё'}));
  await frames(4);
  await page.waitForTimeout(500);
  now = await state();
  if (!now.atLatest) note({case: 'the reader\'s own message is followed wherever they were', got: now});

  // The same words for one message are said once; a pending one not at all.
  await page.evaluate(() => {
    const log = document.getElementById('log');
    log.querySelector('.sf-message-log__announcer').textContent = '';
    log.upsert({id: 'n1', author: 'anna', author_name: 'Анна', text: 'Новое снизу', extra: 1});
    log.upsert({id: 'p1', author: 'anna', author_name: 'Анна', text: 'Пишет…', pending: true});
  });
  await page.waitForTimeout(150);
  now = await state();
  if (now.announced) note({case: 'the same words are not said twice, a pending message is not said', got: now.announced});
  const busy = await page.evaluate(() => document.querySelector('.sf-message-log__item[data-id="p1"]').getAttribute('aria-busy'));
  if (busy !== 'true') note({case: 'a pending message is busy', got: busy});
  await page.evaluate(() => document.getElementById('log').upsert({id: 'p1', author: 'anna', author_name: 'Анна', text: 'Готово'}));
  await page.waitForTimeout(150);
  now = await state();
  if (now.announced !== 'Анна: Готово') note({case: 'a pending message is announced when it is finished', got: now.announced});

  // 6. Keyboard: «to the latest» focuses the last message, arrows move.
  await make({hasMore: true});
  await page.evaluate(() => { document.querySelector('#log .sf-message-log').scrollTop = 300; });
  await frames(2);
  await page.waitForTimeout(100);
  await page.click('.sf-message-log__jump button');
  await page.waitForTimeout(500);
  const focused = () => page.evaluate(() => document.activeElement?.closest('.sf-message-log__item')?.dataset.id ?? document.activeElement?.tagName);
  let at = await focused();
  if (at !== 'm159') note({case: '«to the latest» moves focus to the last message', got: at});
  await page.keyboard.press('ArrowUp');
  at = await focused();
  if (at !== 'm158') note({case: 'ArrowUp moves to the message above', got: at});
  await page.keyboard.press('Home');
  at = await focused();
  if (at !== 'm100') note({case: 'Home moves to the first message loaded', got: at});
  // Home scrolled to the top, which asks for earlier history by itself; that
  // request is let go so that ArrowUp is what asks next.
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.getElementById('log').earlierFailed(); window.events.length = 0; });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  now = await state();
  if (now.events.length !== 1 || now.events[0].before !== 'm100') note({case: 'ArrowUp on the first message asks for earlier history', got: now.events});
  await page.keyboard.press('End');
  at = await focused();
  if (at !== 'm159') note({case: 'End moves to the last message', got: at});
  const region = await page.evaluate(() => {
    const scroller = document.querySelector('#log .sf-message-log');
    return {role: scroller.getAttribute('role'), label: scroller.getAttribute('aria-label'), tab: scroller.tabIndex,
      log: scroller.querySelector('[role="log"]')?.getAttribute('aria-label'), live: scroller.querySelector('[role="log"]')?.getAttribute('aria-live')};
  });
  if (JSON.stringify(region) !== JSON.stringify({role: 'region', label: 'Переписка', tab: 0, log: 'Сообщения', live: 'off'})) note({case: 'a named focusable region around a quiet log', got: region});

  // 7. The host's renderer: run flags, a kept node and the focus inside it.
  await make({count: 6, hasMore: false, renderer: true});
  const flags = await page.evaluate(() => [...document.querySelectorAll('.host-message')].map((node) => node.dataset.first));
  if (flags.join() !== 'true,false,false,false,true,true') note({case: 'the renderer is told where a run starts', got: flags});
  await page.focus('.sf-message-log__item[data-id="m102"] .host-like');
  const kept = await page.evaluate(() => {
    const log = document.getElementById('log');
    const node = document.querySelector('.sf-message-log__item[data-id="m102"] .host-message');
    log.upsert({...log.messages.find((one) => one.id === 'm102')});
    return node === document.querySelector('.sf-message-log__item[data-id="m102"] .host-message')
      && document.activeElement?.classList.contains('host-like');
  });
  if (!kept) note({case: 'an unchanged message keeps its node and the focus inside it'});
  // A new message of the same author changes the neighbour's run: it is drawn again.
  await page.evaluate(() => document.getElementById('log').upsert({id: 'm106', author: 'anna', author_name: 'Анна', text: 'ещё'}));
  await frames(2);
  const neighbour = await page.evaluate(() => ({
    m105: document.querySelector('.sf-message-log__item[data-id="m105"]').classList.contains('sf-message-log__item--last'),
    m106first: document.querySelector('.sf-message-log__item[data-id="m106"] .host-message').dataset.first,
  }));
  if (neighbour.m105 !== false || neighbour.m106first !== 'false') note({case: 'a message of the same author joins the run', got: neighbour});
  // A local key the server numbered keeps its place.
  const replaced = await page.evaluate(() => {
    const log = document.getElementById('log');
    log.upsert({id: 'local-1', author: 'me', own: true, text: 'отправляю', pending: true});
    log.upsert({id: 'x1', author: 'anna', author_name: 'Анна', text: 'после'});
    log.upsert({id: '501', author: 'me', own: true, text: 'отправлено'}, undefined, {replaces: 'local-1'});
    return log.messages.map((one) => one.id).slice(-2);
  });
  if (replaced.join() !== '501,x1') note({case: 'a message that got its server id keeps its place', got: replaced});

  // 8. Empty: the slot instead of the column.
  await make({count: 0, hasMore: false, empty: true});
  const empty = await page.evaluate(() => ({
    greeting: Boolean(document.getElementById('greeting')?.offsetParent),
    column: getComputedStyle(document.querySelector('.sf-message-log__column')).display,
  }));
  if (!empty.greeting || empty.column !== 'none') note({case: 'an empty conversation shows the empty slot', got: empty});
  await page.evaluate(() => document.getElementById('log').upsert({id: 'first', author: 'anna', author_name: 'Анна', text: 'Привет'}));
  await frames(3);
  const filled = await page.evaluate(() => ({greeting: Boolean(document.getElementById('greeting')?.offsetParent), items: document.querySelectorAll('.sf-message-log__item').length}));
  if (filled.greeting || filled.items !== 1) note({case: 'the first message replaces the empty slot', got: filled});

  // 9. English.
  await page.evaluate(() => document.documentElement.setAttribute('lang', 'en'));
  await make({count: 3, hasMore: true});
  const english = await page.evaluate(() => ({
    region: document.querySelector('#log .sf-message-log').getAttribute('aria-label'),
    earlier: document.querySelector('.sf-message-log__earlier .sf-button-text-container').textContent.trim(),
    latest: document.querySelector('.sf-message-log__jump button').getAttribute('aria-label'),
  }));
  if (JSON.stringify(english) !== JSON.stringify({region: 'Conversation', earlier: 'Show earlier messages', latest: 'To the latest message'})) note({case: 'an English page speaks English', got: english});

  if (errors.length) note({case: 'no page errors', got: errors});
  console.log(JSON.stringify({checked: 9}));
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('MESSAGE_LOG_OK');
