#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-message-log as the feed of a streamed reply, on the built bytes: stand 23
// b's stream scenario (ui-control control/smart-architecture/stands/23-red-team/b/stream)
// with the log's own interface instead of the stand's adapter (standard
// simai.smart-component 1.3.8 §10.8, §18.4; vocabulary 1.1.5 §5.2).
//
// A host writes an assistant's reply in 30 parts, 100 ms apart, the revision
// rising with each, into a conversation that already holds two messages; the
// renderer puts a «Копировать» button in every message. The person puts the
// focus on the growing reply's button after the 8th part and presses
// «Остановить» after the 12th: the stop calls cancel {id} on the log (what the
// chat's stop rule asks of its feed), and the host goes on writing, as a
// server may (vocabulary §5.1: stand 23 saw 24 more chunks after the press).
//
// Held:
// - every part the host wrote before the stop is drawn, as one chunk fact;
// - each part redraws exactly one entry, the reply, in place: its item element
//   is the same node from the first part to the last, no other entry changes;
// - the focus stays on the reply's button through every part;
// - the stop ends the stream cancelled within 100 ms and nothing written after
//   it is drawn; the reply's busy mark goes;
// - the facts are begun once, chunk per part, cancelled once, nothing else;
// - a host that keeps the revision while the body grows still streams under
//   changes: content (the default), and is seen to lose its parts under
//   changes: revision -- why content is the default.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'component/component/buttons/css/buttons.css',
  'component/component/icon-buttons/css/icon-buttons.css', 'smart/smart/message-log/css/message-log.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js',
  'smart/smart/button/js/button.js', 'smart/smart/icon-button/js/icon-button.js',
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
  page.on('pageerror', (error) => { if (!/Automatic publicPath/u.test(error.message)) errors.push(error.message); });
  await page.setContent('<!doctype html><html class="theme-light" lang="ru"><head><meta charset="utf-8"></head><body style="margin:0"><div id="box" style="display:flex;flex-direction:column;height:480px;width:720px"></div></body></html>');
  for (const style of styles) await page.addStyleTag({path: style}).catch(() => {});
  for (const module of modules) await page.addScriptTag({path: module, type: 'module'}).catch(() => {});
  await page.waitForFunction(() => Boolean(customElements.get('sf-message-log')));

  const scenario = ({changes = null, revision = true, stopAt = 12, focusAt = 8, parts = 30, every = 100} = {}) => page.evaluate(async (options) => {
    const words = 'Чтобы оформить возврат, откройте заказ, нажмите «Вернуть товар», выберите причину и способ возврата денег, затем распечатайте ярлык и сдайте посылку в пункт выдачи в течение четырнадцати дней; деньги придут после проверки товара на складе.'.split(' ');
    const box = document.getElementById('box');
    box.replaceChildren();
    const log = document.createElement('sf-message-log');
    if (options.changes) log.setAttribute('changes', options.changes);
    box.append(log);
    log.renderMessage = (message) => {
      const node = document.createElement('div');
      node.className = 'msg';
      node.textContent = message.text;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy';
      button.textContent = 'Копировать';
      node.append(' ', button);
      return node;
    };
    const facts = [];
    for (const fact of ['begun', 'chunk', 'completed', 'failed', 'cancelled']) {
      log.addEventListener(`sf-message-log-${fact}`, (event) => facts.push({fact, id: event.detail.id, t: performance.now()}));
    }
    const conversation = [
      {id: 'q0', author: 'me', own: true, text: 'Здравствуйте', revision: '1'},
      {id: 'a0', author: 'ai', 'author-name': 'Ассистент', text: 'Здравствуйте! Чем помочь?', revision: '1'},
      {id: 'q1', author: 'me', own: true, text: 'Как вернуть товар?', revision: '1'},
    ];
    log.messages = conversation;
    await new Promise((done) => setTimeout(done, 200));

    // Every change inside the column, by the entry it belongs to, per part.
    const column = log.querySelector('.sf-message-log__column');
    const observer = new MutationObserver(() => {});
    observer.observe(column, {subtree: true, childList: true, characterData: true, attributes: true});
    const touched = (records) => [...new Set(records.map((record) => {
      const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return node?.closest?.('.sf-message-log__item')?.dataset.id ?? (record.target === column ? '(column)' : '(other)');
    }))];

    const reply = {id: 'r1', author: 'ai', 'author-name': 'Ассистент', text: '', growing: true, revision: 1};
    const perPart = [];
    const focus = [];
    let item = null;
    let copy = null;
    let stoppedAt = null;
    let cancelledAt = null;
    let drawnAfterStop = 0;
    let textAtStop = '';
    const write = () => {
      const message = {...reply, revision: String(reply.revision)};
      log.messages = [...conversation, message];
      return touched(observer.takeRecords());
    };
    perPart.push({part: 0, entries: write()});
    item = log.querySelector('[data-id="r1"]');
    for (let part = 1; part <= options.parts; part += 1) {
      await new Promise((done) => setTimeout(done, options.every));
      reply.text = words.slice(0, Math.ceil((words.length * part) / options.parts)).join(' ');
      if (options.revision) reply.revision += 1;
      if (part === options.parts) reply.growing = false;
      const entries = write();
      if (stoppedAt === null) perPart.push({part, entries});
      else if (entries.length) drawnAfterStop += 1;
      if (copy) focus.push(document.activeElement === copy);
      if (part === options.focusAt) {
        copy = item.querySelector('.copy');
        copy.focus();
      }
      if (part === options.stopAt) {
        textAtStop = item.textContent;
        stoppedAt = performance.now();
        // The person presses «Остановить»: the chat's stop rule asks its feed
        // to cancel the reply and tells the port to stop waiting.
        log.cancel({id: 'r1'});
        cancelledAt = facts.find((one) => one.fact === 'cancelled')?.t ?? null;
        observer.takeRecords();
      }
    }
    observer.disconnect();
    const sameItem = log.querySelector('[data-id="r1"]') === item;
    return {
      parts: options.parts,
      written: Math.min(options.stopAt, options.parts),
      drawn: perPart.filter((one) => one.part > 0 && one.entries.length).length,
      perPartEntries: perPart.filter((one) => one.part > 0).map((one) => one.entries.join(',')),
      oneEntryPerPart: perPart.filter((one) => one.part > 0 && one.entries.length).every((one) => one.entries.length === 1 && one.entries[0] === 'r1'),
      sameItem,
      focusKept: focus.length > 0 && focus.every(Boolean),
      focusChecks: focus.length,
      stopToCancelledMs: stoppedAt !== null && cancelledAt !== null ? +(cancelledAt - stoppedAt).toFixed(2) : null,
      drawnAfterStop,
      textKept: stoppedAt === null || item.textContent === textAtStop,
      busyAfter: item.getAttribute('aria-busy'),
      facts: facts.reduce((all, one) => ({...all, [one.fact]: (all[one.fact] ?? 0) + 1}), {}),
    };
  }, {changes, revision, stopAt, focusAt, parts, every});

  // A: the reply streams with its revision rising and is stopped at the 12th part.
  const a = await scenario();
  console.log(JSON.stringify({run: 'A', ...a, perPartEntries: undefined}));
  if (a.drawn !== a.written) note({case: 'every part written before the stop is drawn', got: a});
  if (!a.oneEntryPerPart || !a.sameItem) note({case: 'each part redraws the reply only, in place', got: a.perPartEntries, sameItem: a.sameItem});
  if (!a.focusKept) note({case: 'the focus stays on the reply\'s button through every part', got: a});
  if (!(a.stopToCancelledMs !== null && a.stopToCancelledMs < 100)) note({case: 'the stop ends the stream within 100 ms', got: a.stopToCancelledMs});
  if (a.drawnAfterStop !== 0 || !a.textKept) note({case: 'nothing written after the stop is drawn', got: a});
  if (a.busyAfter !== null) note({case: 'the stopped reply is not busy', got: a.busyAfter});
  if (JSON.stringify(a.facts) !== JSON.stringify({begun: 1, chunk: a.written, cancelled: 1})) note({case: 'begun once, a chunk per part, cancelled once', got: a.facts});

  // B: the whole reply, a host that keeps the revision; content compares (the default).
  const b = await scenario({revision: false, stopAt: Infinity, focusAt: 8});
  console.log(JSON.stringify({run: 'B content', ...b, perPartEntries: undefined}));
  if (b.drawn !== b.parts || !b.oneEntryPerPart || !b.focusKept) note({case: 'a host that keeps the revision streams under changes: content', got: b});
  if (JSON.stringify(b.facts) !== JSON.stringify({begun: 1, chunk: b.parts - 1, completed: 1})) note({case: 'begun, a chunk per growing part, completed', got: b.facts});

  // C: the same host under changes: revision loses every part but the end.
  const c = await scenario({changes: 'revision', revision: false, stopAt: Infinity, focusAt: 8});
  console.log(JSON.stringify({run: 'C revision', drawn: c.drawn, parts: c.parts, facts: c.facts}));
  if (c.drawn >= c.parts || JSON.stringify(c.facts) !== JSON.stringify({begun: 1, completed: 1})) note({case: 'under changes: revision an unchanged revision is not drawn again; the end still is', got: c});

  if (errors.length) note({case: 'no page errors', got: errors});
} finally {
  await browser.close();
}
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log('MESSAGE_LOG_STREAM_OK');
