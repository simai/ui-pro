// The view of one chat message, as plain DOM: an assistant's answer (or its
// wait, refusal or error) and a person's question with its files. It came
// from simai/ui-chat (components/src/component/chat/js/render.js, ui-chat
// 10d376b) with the D31 move (step 5, owner yes 2026-10-27) and keeps its
// shape, so the site widget and the pilot, which carry no Framework runtime,
// can still call renderMessage directly from a pinned ui-pro revision.
//
// sf-chat-message projects it (index.js); a chat window draws it inside
// sf-message-log through the log's renderMessage hook. Controls are the
// Framework's plain markup (sf-button, sf-icon-button, sf-input); a file chip
// is sf-chat-composer's (js/templates/parts.js), with the download link and
// the «Файл недоступен» check added here for a sent file.
//
// The fields proposed to Mirai24 as API.md v1.3 (an answer's steps, a
// source's preview, an answer's files) are read only through ./proposed.js,
// so their names can still change in one place; without them nothing here
// draws differently.
//
// Nothing here talks to a server. What a person does is reported through
// ctx.onAction(action, detail); the element turns it into its events.
//
// ctx: {
//   document: Document,
//   locale: 'ru'|'en',
//   words: (key, values?) => string,     the 0.3 dotted keys (stage.queued, …)
//   icon: (name, {size}) => Node,        smart sf-icon on a Framework page, an SVG in the widget
//   onAction?: (action, detail) => any,  retry | check | feedback | feedback-draft |
//                                        feedback-send | feedback-skip | sources | copy |
//                                        remove-attachment | brief-answer | steps | preview;
//                                        for preview, false means the host took it (the
//                                        element's open event was cancelled); among people
//                                        (1.4.0) also react | reply | quote | picker | fold |
//                                        stop | delete-ask | delete-cancel | delete
//   avatar?: ({text, image, icon}) => Node, among people: sf-avatar, or its markup with a sign
//   enhanceCode?: (pre) => void,         SF.Highlight on a Framework page
//   renderProposal?: (proposal, {disabled}) => Node,
//                                        sf-change-confirm (index.js)
//   features?: {feedback, proposals, memory, brief}   brief (v1.2) is off unless given
// }
import {render} from 'lit';
// Core's sanitizer, SF.sanitizeHtml and SF.safeHref (src/core/js/sanitize.js,
// pair ui-89834691fb9d and later). On a Framework page core.js has published
// them; the import publishes them where it has not run (a page that calls
// renderMessage without the Framework runtime) and never replaces Core's.
import '../../../../core/js/sanitize.js';
import {attachmentState, renderAttachment as attachmentChip} from '../../../chat-composer/js/templates/parts.js';
import {deliverablesOf, previewTarget, stepsOf, timeOf} from './proposed.js';
import {renderDeleteAsk, renderPicker, renderQuote, renderReactions, renderTools, whenPlaced} from './social.js';

export const safeHref = (value) => globalThis.SF.safeHref(value);
const sanitizeHtml = (html, policy) => globalThis.SF.sanitizeHtml(html, policy);

/** 48213 → «47 КБ»: sizes are for reading, in plain units. */
export function formatBytes(bytes, words, locale = 'ru') {
  const number = Number(bytes) || 0;
  const format = (value) => new Intl.NumberFormat(locale, {maximumFractionDigits: value < 10 ? 1 : 0}).format(value);
  if (number < 1024) return words('size.b', {n: number});
  if (number < 1024 * 1024) return words('size.kb', {n: format(number / 1024)});
  if (number < 1024 ** 3) return words('size.mb', {n: format(number / 1024 / 1024)});
  return words('size.gb', {n: format(number / 1024 ** 3)});
}

export const PENDING_STATUSES = new Set(['queued', 'running']);

export function element(ctx, tag, className, attributes = {}) {
  const node = ctx.document.createElement(tag);
  if (className) node.className = className;
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  return node;
}

export function text(ctx, tag, className, value, attributes) {
  const node = element(ctx, tag, className, attributes);
  node.textContent = value ?? '';
  return node;
}

// size: the Framework icon step; meta lines take '1/2', controls their own.
export function iconNode(ctx, name, className = '', size = '') {
  const node = ctx.icon(name, { size });
  if (className && node.classList) node.classList.add(...className.split(' '));
  node.setAttribute?.('aria-hidden', 'true');
  return node;
}

// The icon step that sits in a button of each step (SPEC §3): 16 in 32, 20 in 40.
const ICON_IN_BUTTON = { '1/3': '1', '1/2': '1', 1: '2', 2: '2', 3: '3' };

/** A Framework icon button: one native button, a decorative icon, a required name. */
export function iconButton(ctx, { icon, label, appearance = 'link', scheme = 'on-surface', size = '1/2', pressed, className = '' }) {
  const button = element(ctx, 'button', [
    'sf-icon-button', `sf-icon-button--size-${size}`, 'sf-icon-button--icon',
    // The Framework's own icon-button markup centres on both axes.
    `sf-icon-button--${appearance}`, `sf-icon-button--${scheme}`, 'flex', 'items-cross-center', 'content-main-center', className,
  ].filter(Boolean).join(' '), { type: 'button', 'aria-label': label, title: label, 'aria-pressed': pressed === undefined ? null : String(pressed) });
  if (pressed) button.classList.add('active');
  button.append(iconNode(ctx, icon, '', ICON_IN_BUTTON[size] || '1'));
  return button;
}

/** A Framework text button. */
export function textButton(ctx, { label, appearance = 'default', scheme = 'primary', size = '1/2', icon, className = '' }) {
  const button = element(ctx, 'button', [
    'sf-button', `sf-button--size-${size}`, `sf-button--${appearance}`, `sf-button--${scheme}`,
    'flex', 'items-cross-center', 'content-main-center', className,
  ].filter(Boolean).join(' '), { type: 'button' });
  if (icon) button.append(iconNode(ctx, icon, '', '1'));
  button.append(text(ctx, 'span', 'sf-button-text-container', label));
  return button;
}

function formatTime(ctx, iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(ctx.locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDate(ctx, value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat(ctx.locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** «1 ноября в 00:00» in the reader's own time zone; '' for what is not a date. */
export function formatMoment(ctx, value) {
  const date = new Date(value);
  if (value == null || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(ctx.locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date);
}

// --- sf-chat-markup ------------------------------------------------------

const FOOTNOTE = /\[(\d{1,3})\]/g;

// [n] in the answer's text becomes a link to source n -- only where source n
// exists, and never inside code, where brackets are code.
function linkFootnotes(ctx, root, numbers, idPrefix, onFootnote) {
  const walker = ctx.document.createTreeWalker(root, 4);
  const targets = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('code, pre, a')) continue;
    FOOTNOTE.lastIndex = 0;
    if (FOOTNOTE.test(node.data)) targets.push(node);
  }
  for (const node of targets) {
    const fragment = ctx.document.createDocumentFragment();
    let last = 0;
    // matchAll copies the pattern's lastIndex, which the test above left past
    // the first mark of the last node tested: without this, a lone text node
    // with two marks lost its first footnote (also so in ui-chat 10d376b).
    FOOTNOTE.lastIndex = 0;
    for (const match of node.data.matchAll(FOOTNOTE)) {
      const n = Number(match[1]);
      if (!numbers.has(n)) continue;
      // The footnote sits on the word it cites, like a printed one: no space
      // before it, and the word, the footnote and the punctuation after it
      // never part across lines.
      const start = last;
      const before = node.data.slice(last, match.index).replace(/\s+$/, '');
      const word = /\S+$/.exec(before)?.[0] || '';
      fragment.append(before.slice(0, before.length - word.length));
      const sup = element(ctx, 'sup', 'sf-chat-markup__ref');
      const button = text(ctx, 'button', 'sf-chat-footnote', String(n), {
        type: 'button',
        'aria-label': ctx.words('sources.footnote', { n }),
        'aria-controls': `${idPrefix}-source-${n}`,
      });
      button.addEventListener('click', () => onFootnote(n));
      sup.append(button);
      last = match.index + match[0].length;
      const punctuation = /^[.,;:!?)»…]+/.exec(node.data.slice(last))?.[0] || '';
      last += punctuation.length;
      const cite = element(ctx, 'span', 'sf-chat-markup__cite');
      // The cited word may end an inline element before this text («<strong>
      // 28 дней</strong>[1]»): a line may break between two inline boxes, so
      // a short element joins the unbreakable piece with its footnote.
      const prev = !before && start === 0 ? node.previousSibling : null;
      if (prev?.nodeType === 1 && /^(STRONG|B|EM|I|CODE|SPAN|MARK)$/.test(prev.tagName)) {
        // Only its last word: «<strong>28 календарных </strong><cite>
        // <strong>дней</strong>¹</cite>», so the phrase still wraps freely.
        const only = prev.childNodes.length === 1 && prev.firstChild.nodeType === 3 ? prev.firstChild : null;
        const tail = only ? /\S+$/.exec(only.data)?.[0] : null;
        if (tail && tail.length < only.data.length) {
          only.data = only.data.slice(0, only.data.length - tail.length);
          const piece = prev.cloneNode(false);
          piece.textContent = tail;
          cite.append(piece);
        } else if (prev.textContent.length <= 24) {
          cite.append(prev);
        }
      }
      cite.append(word, sup, punctuation);
      fragment.append(cite);
    }
    if (last === 0) continue;
    fragment.append(node.data.slice(last));
    node.replaceWith(fragment);
  }
}

/**
 * The server's html, cleaned again, with code enhanced and [n] linked.
 * @returns {HTMLElement}
 */
export function renderMarkup(ctx, html, { sources = [], idPrefix = 'chat', onFootnote = () => {} } = {}) {
  const root = element(ctx, 'div', 'sf-chat-markup');
  root.append(sanitizeHtml(html, { document: ctx.document, codeLanguage: true }));
  for (const table of root.querySelectorAll('table')) {
    const scroller = element(ctx, 'div', 'sf-chat-markup__table', { tabindex: '0', role: 'region', 'aria-label': table.querySelector('th')?.textContent || 'table' });
    table.replaceWith(scroller);
    scroller.append(table);
  }
  // A Markdown image comes as a link «Изображение: …» and is never loaded;
  // an icon says what is behind it.
  for (const link of root.querySelectorAll('a')) {
    if (/^\s*(Изображение|Image):/i.test(link.textContent)) {
      link.classList.add('sf-chat-markup__image');
      link.prepend(iconNode(ctx, 'image', 'sf-chat-markup__image-icon', '1'));
    }
  }
  // Adjacent text joins first, so a footnote finds the word it follows.
  root.normalize();
  linkFootnotes(ctx, root, new Set(sources.map((one) => Number(one.n))), idPrefix, onFootnote);
  if (ctx.enhanceCode) for (const pre of root.querySelectorAll('pre')) ctx.enhanceCode(pre);
  return root;
}

// --- sf-chat-sources -----------------------------------------------------

/**
 * The sources of an answer, as a list shown on request: the «Источники · N»
 * chip in the action row toggles it, and a footnote opens it at its source.
 * `open` draws it open (the window remembers an open list across a redraw of
 * its message, a rating for one); `onToggle` hears every opening and closing.
 * @returns {{root: HTMLElement, toggle: HTMLElement, reveal: (n: number) => void}}
 */
export function renderSources(ctx, sources, { idPrefix = 'chat', open: startOpen = false, onToggle, previews = null, onPreview } = {}) {
  const listId = `${idPrefix}-sources`;
  const root = element(ctx, 'ol', 'sf-chat-sources', { id: listId, 'aria-label': ctx.words('sources.title', { count: sources.length }) });
  root.hidden = !startOpen;
  for (const source of sources) {
    const item = element(ctx, 'li', 'sf-chat-sources__item', { id: `${idPrefix}-source-${source.n}`, tabindex: '-1' });
    item.append(text(ctx, 'span', 'sf-chat-sources__number', String(source.n)));
    const body = element(ctx, 'span', 'sf-chat-sources__body');
    const href = source.kind === 'web' ? webHref(source.url) : null;
    // A source with a preview of its own (v1.3 preview_url, the knowledge
    // base's) opens it by its title; a site keeps its link.
    const preview = href ? null : previews?.get(Number(source.n));
    if (href) {
      body.append(text(ctx, 'a', 'sf-chat-sources__title', source.title, { href, target: '_blank', rel: 'noopener noreferrer nofollow' }));
    } else if (preview && onPreview) {
      const button = text(ctx, 'button', 'sf-chat-sources__title sf-chat-sources__preview', source.title, {
        type: 'button', 'aria-label': ctx.words('sources.preview', { title: source.title }),
      });
      button.addEventListener('click', () => onPreview(preview, button));
      body.append(button);
    } else {
      body.append(text(ctx, 'span', 'sf-chat-sources__title', source.title));
    }
    // The passage the answer leans on (API.md v1.1), under its title.
    const excerpt = typeof source.excerpt === 'string' ? source.excerpt.trim() : '';
    if (excerpt) body.append(renderExcerpt(ctx, excerpt, `${idPrefix}-source-${source.n}-excerpt`));
    const meta = [ctx.words(`sources.kind.${source.kind}`)];
    if (href) meta.push(new URL(href).host);
    if (source.read_at) meta.push(ctx.words('sources.read', { date: formatDate(ctx, source.read_at) }));
    body.append(text(ctx, 'span', 'sf-chat-sources__meta', meta.filter(Boolean).join(' · ')));
    item.append(body);
    root.append(item);
  }

  const toggle = element(ctx, 'button', 'sf-chat-chip sf-chat-chip--sources', { type: 'button', 'aria-expanded': String(Boolean(startOpen)), 'aria-controls': listId });
  toggle.setAttribute('aria-label', ctx.words('sources.chip', { count: sources.length }));
  toggle.append(
    iconNode(ctx, 'library_books', '', '1'),
    text(ctx, 'span', 'sf-chat-chip__label', ctx.words('sources.title', { count: '' }).replace(/\s*\(\)\s*$/, '')),
    text(ctx, 'span', '', String(sources.length)),
  );
  const show = (open) => {
    if (root.hidden === !open) return;
    root.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    onToggle?.(open);
  };
  toggle.addEventListener('click', () => show(root.hidden));

  const reveal = (n) => {
    show(true);
    const item = root.querySelector(`#${CSS.escape(`${idPrefix}-source-${n}`)}`);
    if (!item) return;
    for (const one of root.children) one.classList.remove('sf-chat-sources__item--target');
    item.classList.add('sf-chat-sources__item--target');
    item.focus({ preventScroll: true });
    item.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return { root, toggle, reveal };
}

// Up to 400 characters come from the server; past about two lines the
// passage folds to them and opens in place. Folded or not, it is all in the
// page, so a screen reader reads it whole and the fold is only for the eye.
const EXCERPT_FOLD = 160;

function renderExcerpt(ctx, value, id) {
  const box = element(ctx, 'span', 'sf-chat-sources__excerpt-box');
  const passage = text(ctx, 'span', 'sf-chat-sources__excerpt', value, { id });
  box.append(passage);
  if (value.length <= EXCERPT_FOLD) return box;
  passage.classList.add('sf-chat-sources__excerpt--folded');
  passage.title = value;
  const more = text(ctx, 'button', 'sf-chat-sources__more', ctx.words('sources.more'), { type: 'button', 'aria-expanded': 'false', 'aria-controls': id });
  more.addEventListener('click', () => {
    const open = more.getAttribute('aria-expanded') !== 'true';
    passage.classList.toggle('sf-chat-sources__excerpt--folded', !open);
    more.setAttribute('aria-expanded', String(open));
    more.textContent = ctx.words(open ? 'sources.less' : 'sources.more');
  });
  box.append(more);
  return box;
}

function webHref(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch { return null; }
}

// --- sf-chat-stages ------------------------------------------------------

/** What the server is doing now, as words: the line shows it, the list says it. */
export function stageKey(message) {
  // A running answer may have no stage yet (API.md, 5a992f6): it is searching.
  return message.status === 'queued' ? 'stage.queued' : `stage.${message.stage || 'searching'}`;
}

/**
 * The waiting line. It is not a live region of its own: it is rebuilt with
 * its message, inside a busy article, where readers miss it; the message
 * list's one standing announcer says the stage instead (Q-03).
 */
export function renderStages(ctx, message) {
  const root = element(ctx, 'div', 'sf-chat-stages');
  const key = stageKey(message);
  root.append(element(ctx, 'span', 'sf-chat-stages__pulse', { 'aria-hidden': 'true' }), text(ctx, 'span', 'sf-chat-stages__label', ctx.words(key)));
  return root;
}

// --- sf-chat-attachment --------------------------------------------------

/**
 * A file chip: sf-chat-composer's (name, size, upload progress, the server's
 * refusal, remove), drawn into this view's DOM. With `href` (the host's own
 * download address, never built here) the name of a ready file is a link
 * that downloads it, checked first: a file deleted since is said so.
 * @param {{id?: string, name: string, bytes: number, href?: string, progress?: number|null, error?: string, removable?: boolean}} file
 */
export function renderAttachment(ctx, file) {
  const words = {
    file: (name, size) => ctx.words('attachment.file', {name, size}),
    uploading: (percent) => ctx.words('attachment.uploading', {percent}),
    remove: (name) => ctx.words('attachment.remove', {name}),
    size: (bytes) => formatBytes(bytes, ctx.words, ctx.locale),
  };
  const holder = ctx.document.createElement('div');
  render(attachmentChip(file, {
    words,
    removable: Boolean(file.removable),
    onRemove: (one) => ctx.onAction?.('remove-attachment', {id: one.id, name: one.name}),
  }), holder);
  const root = holder.querySelector('.sf-chat-attachment');
  root.remove();
  if (file.href && attachmentState(file) === 'ready') {
    const name = root.querySelector('.sf-chat-attachment__name');
    const metaNode = root.querySelector('.sf-chat-attachment__meta');
    const link = text(ctx, 'a', 'sf-chat-attachment__name sf-chat-attachment__link', file.name, {
      href: file.href, download: file.name, title: ctx.words('files.downloadLabel', {name: file.name}),
    });
    link.addEventListener('click', (event) => checkDownload(ctx, event, link, metaNode, file.name));
    name.replaceWith(link);
  }
  return root;
}

// The server keeps a sent file's attachment after the file is deleted from
// «Мои файлы» (Mirai24, 27.10): the address is asked first, and a file that is
// gone is said so in its chip -- the name without a link, «Файл недоступен»
// (the neutral word a people messenger can say as well: 1.1.0, was «Файл удалён»).
async function checkDownload(ctx, event, link, metaNode, name) {
  await checkFirst(ctx, event, link, () => {
    const plain = text(ctx, 'span', 'sf-chat-attachment__name', name, { title: name });
    link.replaceWith(plain);
    metaNode.textContent = ctx.words('attachment.deleted');
    metaNode.setAttribute('role', 'status');
  });
}

// A download link asks its address first (HEAD, the page's own cookies) and
// follows it unless the file is gone (404 or 410): then `gone` says so.
async function checkFirst(ctx, event, link, gone) {
  if (link.dataset.checked) { delete link.dataset.checked; return; }
  event.preventDefault();
  let missing = false;
  try {
    const response = await ctx.document.defaultView.fetch(link.href, { method: 'HEAD', credentials: 'same-origin' });
    missing = response.status === 404 || response.status === 410;
  } catch { missing = false; }
  if (!missing) {
    link.dataset.checked = '1';
    link.click();
    return;
  }
  gone();
}

// --- sf-chat-steps (API.md v1.3, proposed) ---------------------------------

/** 72000 → «1 мин 12 с»: whole seconds, then minutes, then hours. */
export function formatDuration(ctx, ms) {
  const seconds = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  if (seconds < 60) return ctx.words('time.seconds', { s: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const s = seconds % 60;
    return s ? ctx.words('time.minutesSeconds', { m: minutes, s }) : ctx.words('time.minutes', { m: minutes });
  }
  const hours = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? ctx.words('time.hoursMinutes', { h: hours, m }) : ctx.words('time.hours', { h: hours });
}

/** «4 шага»: the plural form of the page's language (Intl.PluralRules). */
export function stepCount(ctx, count) {
  let form = 'other';
  try { form = new Intl.PluralRules(ctx.locale).select(count); } catch { form = 'other'; }
  if (!['one', 'few', 'many', 'other'].includes(form)) form = 'other';
  return ctx.words(`steps.count.${form}`, { n: count });
}

const STEP_ICON = { done: 'check_circle', failed: 'error' };

/** What the conversation's announcer says of an answer's steps: the step at work, or one that failed. */
export function stepsSay(ctx, message) {
  const steps = stepsOf(message);
  if (!steps.length) return '';
  const failed = steps.findLast((one) => one.state === 'failed');
  if (failed) return ctx.words('steps.sayFailed', { label: failed.label });
  const running = steps.findLast((one) => one.state === 'running');
  const at = running ? steps.indexOf(running) : steps.length - 1;
  return ctx.words('steps.say', { n: at + 1, label: steps[at].label });
}

/**
 * An answer's steps (v1.3 steps), one compact line that opens the list.
 * While the answer is written: «Работаю · 1 мин 12 с · 4 шага», the time
 * ticking each second from the first step's start (else the message's
 * created_at), a spinner, the step at work last in the list. After it:
 * «Сделано за 1 мин 40 с · 4 шага» (or «Прервано…» for an answer that did
 * not come), folded; a failed answer with a failed step keeps the list open.
 * A step without its times has no time of its own, and the line none when
 * the start or the end is unknown. The ticking time is not a live region:
 * the conversation's announcer says a new step (stepsSay), never the clock.
 * `open` (display.steps_open) is the reader's choice the window remembers.
 * @returns {HTMLElement|null}
 */
export function renderSteps(ctx, message, { idPrefix = 'chat', open } = {}) {
  const steps = stepsOf(message);
  if (!steps.length) return null;
  const pending = PENDING_STATUSES.has(message.status);
  const answered = message.status === 'completed' || message.status === 'partial';
  const anyFailed = steps.some((one) => one.state === 'failed');
  // An answer that did not come (failed, refused, a limit) ends as stopped.
  const state = pending ? 'running' : (answered ? 'done' : 'failed');
  const listId = `${idPrefix}-steps`;
  const startOpen = typeof open === 'boolean' ? open : (message.status === 'failed' && anyFailed);
  const root = element(ctx, 'div', `sf-chat-steps sf-chat-steps--${state}`, { 'data-sf-chat-dispose': pending ? '' : null });
  const toggle = element(ctx, 'button', 'sf-chat-steps__toggle', { type: 'button', 'aria-expanded': String(startOpen), 'aria-controls': listId });
  const mark = pending
    ? element(ctx, 'span', 'sf-chat-steps__spinner', { 'aria-hidden': 'true' })
    : iconNode(ctx, STEP_ICON[state], 'sf-chat-steps__mark', '1');
  const label = element(ctx, 'span', 'sf-chat-steps__line');
  toggle.append(mark, label, iconNode(ctx, 'expand_more', 'sf-chat-steps__chevron', '1'));

  // The running one last: the list reads as what was done, then what is done now.
  const ordered = [...steps.filter((one) => one.state !== 'running'), ...steps.filter((one) => one.state === 'running')];
  const list = element(ctx, 'ol', 'sf-chat-steps__list', { id: listId, 'aria-label': ctx.words('steps.label') });
  list.hidden = !startOpen;
  for (const step of ordered) {
    const item = element(ctx, 'li', `sf-chat-steps__item sf-chat-steps__item--${step.state}`, { 'data-code': step.code });
    item.append(
      step.state === 'running'
        ? element(ctx, 'span', 'sf-chat-steps__spinner', { 'aria-hidden': 'true' })
        : iconNode(ctx, STEP_ICON[step.state], 'sf-chat-steps__state', '1'),
      text(ctx, 'span', 'sf-chat-steps__label', step.label),
      text(ctx, 'span', 'sf-chat-offscreen', `, ${ctx.words(`steps.state.${step.state}`)}`),
    );
    if (step.started != null && step.finished != null && step.finished >= step.started) {
      item.append(text(ctx, 'span', 'sf-chat-steps__took', formatDuration(ctx, step.finished - step.started)));
    }
    list.append(item);
  }
  root.append(toggle, list);

  const starts = steps.map((one) => one.started).filter((one) => one != null);
  const start = starts.length ? Math.min(...starts) : timeOf(message.created_at);
  const ends = steps.map((one) => one.finished).filter((one) => one != null);
  const end = timeOf(message.finished_at) ?? (ends.length ? Math.max(...ends) : null);
  const count = stepCount(ctx, steps.length);
  const write = () => {
    let head;
    if (pending) {
      const now = Date.now();
      head = start != null && now >= start ? `${ctx.words('steps.running')} · ${formatDuration(ctx, now - start)}` : ctx.words('steps.running');
    } else {
      const took = start != null && end != null && end >= start ? formatDuration(ctx, end - start) : '';
      const key = state === 'done' ? 'steps.done' : 'steps.stopped';
      head = took ? ctx.words(`${key}In`, { time: took }) : ctx.words(key);
    }
    label.textContent = `${head} · ${count}`;
  };
  write();

  toggle.addEventListener('click', () => {
    const next = list.hidden;
    list.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
    ctx.onAction?.('steps', { id: message.id, open: next });
  });

  // The clock of a running line: each second while its node is on the page;
  // stopped when the rendering is let go (disposeRendering), started again
  // when it comes back (resumeRendering).
  if (pending && start != null) {
    let timer = 0;
    let away = 0;
    const stop = () => { clearInterval(timer); timer = 0; };
    const run = () => {
      if (timer) return;
      away = 0;
      timer = setInterval(() => {
        if (!root.isConnected) { if (++away > 5) stop(); return; }
        away = 0;
        write();
      }, 1000);
    };
    root.addEventListener('sf-chat-dispose', stop);
    root.addEventListener('sf-chat-resume', () => { write(); run(); });
    run();
  }
  return root;
}

// --- sf-chat-deliverables (API.md v1.3, proposed) --------------------------

// The icon of a file by its type (or its name's extension).
function fileIcon(file) {
  const type = file.mime;
  const extension = /\.([a-z0-9]{1,5})$/iu.exec(file.name)?.[1]?.toLowerCase() || '';
  if (type === 'application/pdf' || extension === 'pdf') return 'picture_as_pdf';
  if (type.startsWith('image/')) return 'image';
  if (/spreadsheet|excel|csv/u.test(type) || ['xlsx', 'xls', 'csv', 'ods'].includes(extension)) return 'table_chart';
  if (/presentation|powerpoint/u.test(type) || ['pptx', 'ppt', 'odp'].includes(extension)) return 'slideshow';
  if (/zip|compressed|tar|rar|7z/u.test(type) || ['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'folder_zip';
  return 'description';
}

/**
 * An answer's files (v1.3 attachments): «Что готово», a card per file with
 * its icon, name and size, «Просмотр» when it has a preview (the host's
 * panel, through ctx.onAction('preview'); without a host, a new tab) and
 * «Скачать» when its address is the page's own, checked first: a file gone
 * says «Файл недоступен» in its card.
 * @returns {HTMLElement|null}
 */
export function renderDeliverables(ctx, message, idPrefix = 'chat') {
  const files = deliverablesOf(message, ctx.document);
  if (!files.length) return null;
  const titleId = `${idPrefix}-files-title`;
  const root = element(ctx, 'section', 'sf-chat-deliverables', { 'aria-labelledby': titleId });
  root.append(text(ctx, 'p', 'sf-chat-deliverables__title', ctx.words('files.ready'), { id: titleId }));
  const list = element(ctx, 'ul', 'sf-chat-deliverables__list');
  files.forEach((file, index) => {
    const nameId = `${idPrefix}-file-${index}`;
    const card = element(ctx, 'li', 'sf-chat-deliverable', { 'data-id': file.id });
    const icon = element(ctx, 'span', 'sf-chat-deliverable__icon', { 'aria-hidden': 'true' });
    icon.append(iconNode(ctx, fileIcon(file), '', '2'));
    const body = element(ctx, 'span', 'sf-chat-deliverable__body');
    const extension = /\.([a-z0-9]{1,5})$/iu.exec(file.name)?.[1]?.toUpperCase() || '';
    const meta = [file.bytes == null ? '' : formatBytes(file.bytes, ctx.words, ctx.locale), extension].filter(Boolean).join(' · ');
    body.append(text(ctx, 'span', 'sf-chat-deliverable__name', file.name, { id: nameId, title: file.name }));
    const metaNode = text(ctx, 'span', 'sf-chat-deliverable__meta', meta);
    body.append(metaNode);
    const actions = element(ctx, 'span', 'sf-chat-deliverable__actions');
    if (file.preview) {
      const view = textButton(ctx, { label: ctx.words('files.preview'), appearance: 'outline', scheme: 'primary', size: '1/2', className: 'sf-chat-deliverable__preview' });
      view.setAttribute('aria-describedby', nameId);
      view.addEventListener('click', () => openPreview(ctx, message, file.preview, view));
      actions.append(view);
    }
    if (file.href) {
      const link = element(ctx, 'a', 'sf-button sf-button--size-1/2 sf-button--outline sf-button--primary flex items-cross-center content-main-center sf-chat-deliverable__download', {
        href: file.href, download: file.name, 'aria-describedby': nameId,
      });
      link.append(iconNode(ctx, 'download', '', '1'), text(ctx, 'span', 'sf-button-text-container', ctx.words('files.download')));
      link.addEventListener('click', (event) => checkFirst(ctx, event, link, () => {
        card.classList.add('sf-chat-deliverable--gone');
        actions.replaceChildren();
        metaNode.textContent = ctx.words('attachment.deleted');
        metaNode.setAttribute('role', 'status');
      }));
      actions.append(link);
    }
    card.append(icon, body);
    if (actions.childNodes.length) card.append(actions);
    list.append(card);
  });
  root.append(list);
  return root;
}

// A preview is the host's (the window's panel): the message asks, and a host
// that shows it says so by cancelling the element's open event (onAction
// answers false). Nobody took it: a source opens in the list (`fallback`), a
// file's preview in a new tab.
function openPreview(ctx, message, target, opener, fallback) {
  if (ctx.onAction?.('preview', { id: message.id, source: target, opener }) === false) return;
  if (fallback) { fallback(); return; }
  ctx.document.defaultView?.open(target.preview_url, '_blank', 'noopener');
}

// --- sf-chat-message -----------------------------------------------------

// The answer as text to paste: footnote marks become «[n]» only where the
// sources follow, listed after the text (U-15).
function copyValue(message, button) {
  const body = message.text || button.closest('.sf-chat-message')?.querySelector('.sf-chat-markup')?.textContent || '';
  const sources = message.sources || [];
  if (!sources.length) return body.replace(/\s*\[\d+\]/g, '');
  const list = sources.map((one) => `[${one.n}] ${one.title}${one.url ? ` — ${one.url}` : ''}`);
  return `${body.trim()}\n\n${list.join('\n')}`;
}

async function copyText(ctx, value) {
  const navigatorRef = ctx.document.defaultView?.navigator;
  if (ctx.document.defaultView?.isSecureContext && navigatorRef?.clipboard?.writeText) {
    try { await navigatorRef.clipboard.writeText(value); return true; } catch { /* fall back */ }
  }
  const area = ctx.document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.className = 'sf-chat-offscreen';
  ctx.document.body.append(area);
  area.select();
  let copied = false;
  try { copied = ctx.document.execCommand('copy'); } catch { copied = false; }
  area.remove();
  return copied;
}

// A question the window sent for a button -- a proposal's command, or a
// retry of the question above -- is a note of what was done, not a second
// bubble of the same words (U-09, U-10).
const USER_NOTE = {
  confirm: { icon: 'check_circle', key: 'message.confirmed' },
  cancel: { icon: 'cancel', key: 'message.cancelled' },
  repeat: { icon: 'refresh', key: 'message.repeated' },
};

function renderUser(ctx, message, view = {}) {
  const root = element(ctx, 'article', 'sf-chat-message sf-chat-message--user', { 'data-id': message.id, 'aria-label': ctx.words('you') });
  const note = USER_NOTE[view.note];
  if (note) {
    root.classList.add('sf-chat-message--note');
    const line = element(ctx, 'p', 'sf-chat-message__note');
    line.append(iconNode(ctx, note.icon, 'sf-chat-message__note-icon', '1'), text(ctx, 'span', '', ctx.words(note.key, { code: view.code || '' })));
    root.append(line);
    return root;
  }
  if (message.attachments?.length) {
    const files = element(ctx, 'div', 'sf-chat-message__files');
    for (const file of message.attachments) files.append(renderAttachment(ctx, file));
    root.append(files);
  }
  if (message.text) root.append(text(ctx, 'div', 'sf-chat-message__bubble', message.text));
  return root;
}

const NOTICE_ICON = { refused: 'block', withheld: 'lock', failed: 'error', limit: 'account_balance_wallet', delayed: 'schedule', stopped: 'pause_circle', network: 'wifi_off' };

function renderNotice(ctx, kind, value, action, more = '') {
  const notice = element(ctx, 'div', `sf-chat-notice sf-chat-notice--${kind}`, { role: kind === 'failed' || kind === 'network' ? 'alert' : null });
  const line = text(ctx, 'p', 'sf-chat-notice__text', value);
  // A second, quieter line of the same notice (when a limit renews).
  if (more) line.append(text(ctx, 'span', 'sf-chat-notice__more', more));
  notice.append(iconNode(ctx, NOTICE_ICON[kind] || 'info', 'sf-chat-notice__icon', '1'), line);
  if (action) {
    const button = text(ctx, 'button', 'sf-chat-notice__action', ctx.words(action.label), { type: 'button' });
    button.addEventListener('click', action.run);
    notice.append(button);
  }
  return notice;
}

// --- a document among people (1.4.0) -----------------------------------------

// Who speaks when it is not a person: a neutral sign, never a face, and a word,
// so colour is never the only difference.
const SPEAKER_ICON = {assistant: 'auto_awesome', agent: 'hub', bot: 'bolt'};
const SPEAKER_WORD = {assistant: 'speaker.assistant', agent: 'speaker.agent', bot: 'speaker.bot'};

const speakerKind = (message) => (SPEAKER_WORD[message.speaker?.kind] ? message.speaker.kind : 'assistant');

/** The sign, the name, the word beside it and «по просьбе Анны». */
function renderSpeaker(ctx, message) {
  const kind = speakerKind(message);
  const head = element(ctx, 'div', 'sf-chat-message__head');
  const sign = element(ctx, 'span', 'sf-chat-person__avatar', {'aria-hidden': 'true'});
  if (ctx.avatar) sign.append(ctx.avatar({icon: SPEAKER_ICON[kind]}));
  else sign.append(iconNode(ctx, SPEAKER_ICON[kind], '', '1'));
  head.append(sign);
  const line = element(ctx, 'p', 'sf-chat-message__who');
  const name = String(message.speaker?.name ?? '');
  if (name) line.append(text(ctx, 'span', 'sf-chat-message__name', name));
  const word = ctx.words(SPEAKER_WORD[kind]);
  if (ctx.badge) line.append(ctx.badge(word));
  else line.append(text(ctx, 'span', 'sf-chat-message__word', word));
  const asked = String(message.asked_by?.name ?? '');
  if (asked) line.append(text(ctx, 'span', 'sf-chat-message__asked', ctx.words('speaker.askedBy', {name: asked})));
  head.append(line);
  return head;
}

// Past about this many lines of plain text an answer among people folds, so it
// does not push the conversation away. Two lines of grace: nobody opens a fold
// for a line or two.
const FOLD_LINES = 14;
const FOLD_GRACE = 2;

/**
 * Fold what the text holds past FOLD_LINES: blocks past it are hidden, the one
 * across the line is cut to whole lines. A table is never folded away, and a
 * proposal's card stands outside the text; neither counts. It needs a layout,
 * so it runs once placed, and with no width to measure it leaves the text open.
 * «Показать полностью» opens it; the host remembers that in display.fold_open.
 */
function foldLong(ctx, message, target, startOpen, idPrefix) {
  const id = `${idPrefix}-fold`;
  target.id = id;
  const toggle = text(ctx, 'button', 'sf-chat-fold', ctx.words('fold.more'), {type: 'button', 'aria-expanded': String(Boolean(startOpen)), 'aria-controls': id});
  toggle.hidden = true;
  let closed = [];
  const open = () => {
    for (const {node, cut} of closed) {
      node.hidden = false;
      if (cut) {
        node.classList.remove('sf-chat-fold__cut');
        node.style.removeProperty('max-block-size');
      }
    }
    closed = [];
  };
  const fold = () => {
    const style = ctx.document.defaultView.getComputedStyle(target);
    const line = parseFloat(style.lineHeight) || 24;
    const blocks = target.children.length && !target.matches('.sf-chat-message__plain') ? [...target.children] : [target];
    const counted = blocks.filter((one) => !one.matches('.sf-chat-markup__table'));
    const whole = counted.reduce((sum, one) => sum + one.getBoundingClientRect().height, 0);
    if (!target.clientWidth || whole <= (FOLD_LINES + FOLD_GRACE) * line) return false;
    let room = FOLD_LINES * line;
    for (const node of counted) {
      const height = node.getBoundingClientRect().height;
      if (room <= 0) {
        node.hidden = true;
        closed.push({node});
      } else if (height > room) {
        // A list or a code block cut across a line reads as cut; the fade is the sign.
        const lines = Math.floor(room / line);
        if (lines >= 2) {
          node.classList.add('sf-chat-fold__cut');
          node.style.maxBlockSize = `${lines * line}px`;
          closed.push({node, cut: true});
        } else {
          node.hidden = true;
          closed.push({node});
        }
        room = 0;
      } else {
        room -= height;
      }
    }
    return true;
  };
  const say = (isOpen) => {
    toggle.textContent = ctx.words(isOpen ? 'fold.less' : 'fold.more');
    toggle.setAttribute('aria-expanded', String(isOpen));
  };
  whenPlaced(target, () => {
    const folds = fold();
    if (!folds) return;
    toggle.hidden = false;
    if (startOpen) open();
    say(Boolean(startOpen));
  });
  toggle.addEventListener('click', () => {
    const next = toggle.getAttribute('aria-expanded') !== 'true';
    if (next) open(); else fold();
    say(next);
    if (!next) toggle.closest('article')?.scrollIntoView({block: 'nearest'});
    ctx.onAction?.('fold', {id: message.id, open: next});
  });
  return toggle;
}

/**
 * One message of the conversation.
 * @param {object} ctx
 * @param {object} message   API.md Message (v1.1: feedback, summary, limit_resets_at, sources[].excerpt)
 * @param {{wait?: 'stopped'|'delayed'|'network'|null, feedback?: 'up'|'down'|{value, reason?, note?, asking?, draft?}|null, busy?: boolean}} [view]
 *        what the window knows that the server does not: a stopped or delayed
 *        wait, the person's own rating this page (over the stored
 *        message.feedback) and whether it asks why, whether a send is in flight.
 */
export function renderMessage(ctx, message, view = {}) {
  if (message.role === 'user') return renderUser(ctx, message, view);
  // The brief is offered only by a surface that says so (the staff window,
  // x-brief): the widget and the embed draw an answer without it.
  const features = { feedback: true, proposals: true, memory: true, brief: false, ...(ctx.features || {}) };
  const idPrefix = `m-${String(message.id).replace(/[^\w-]/g, '')}`;
  // Among people (display.document, 1.4.0): a document without a bubble, on the
  // full column, with all this template's parts; it says who speaks unless the
  // conversation is one to one (display.showAuthor), where the header has.
  const documentOf = Boolean(view.document);
  const named = documentOf && view.showAuthor !== false;
  const label = named
    ? [message.speaker?.name, ctx.words(SPEAKER_WORD[speakerKind(message)])].filter(Boolean).join(', ')
    : ctx.words('assistant');
  const root = element(ctx, 'article', `sf-chat-message sf-chat-message--assistant sf-chat-message--${message.status}`, {
    'data-id': message.id, 'aria-label': label, 'aria-busy': PENDING_STATUSES.has(message.status) ? 'true' : null,
  });
  if (documentOf) root.classList.add('sf-chat-message--document');
  if (named) {
    root.classList.add('sf-chat-message--named');
    root.append(renderSpeaker(ctx, message));
  }
  const body = element(ctx, 'div', 'sf-chat-message__body');
  root.append(body);

  // A document deleted keeps its place, as a person's message does.
  if (documentOf && message.is_deleted === true) {
    const tomb = element(ctx, 'p', 'sf-chat-person__bubble sf-chat-person__bubble--tomb');
    tomb.append(iconNode(ctx, 'block', 'sf-chat-person__tomb-icon', '1'), text(ctx, 'span', '', ctx.words('people.deleted')));
    body.append(tomb);
    return root;
  }
  if (documentOf && !PENDING_STATUSES.has(message.status)) {
    const quote = renderQuote(ctx, message, view);
    if (quote) body.append(quote);
  }

  // The steps (v1.3): while the answer is written they stand for the stage
  // line; after it, a folded line above the answer.
  const steps = PENDING_STATUSES.has(message.status) && view.wait ? null : renderSteps(ctx, message, { idPrefix, open: view.steps_open });
  if (PENDING_STATUSES.has(message.status)) {
    if (view.wait) {
      body.append(renderNotice(ctx, view.wait, ctx.words(`status.${view.wait}`), { label: 'action.check', run: () => ctx.onAction?.('check', { id: message.id }) }));
    } else {
      body.append(steps || renderStages(ctx, message));
    }
    // Stop belongs to the message, where the host allows it (can_stop).
    if (documentOf && view.canStop) {
      const stop = textButton(ctx, {label: ctx.words('action.stop'), appearance: 'link', scheme: 'primary', size: '1/2', icon: 'stop', className: 'sf-chat-message__stop'});
      stop.addEventListener('click', () => ctx.onAction?.('stop', {id: message.id}));
      body.append(stop);
    }
    return root;
  }
  if (steps) body.append(steps);

  let sources = null;
  const answered = message.status === 'completed' || message.status === 'partial';
  // The task brief (API.md v1.2), only where the surface offers it (the staff
  // window); its lead, when the server gives one, stands for the html, which
  // would repeat the questions the brief asks.
  const brief = features.brief && answered ? briefOf(message.brief) : null;
  const lead = brief && typeof message.brief.lead === 'string' ? message.brief.lead.trim() : '';
  if (lead) {
    body.append(text(ctx, 'p', 'sf-chat-message__plain', lead));
  } else if (message.html && answered) {
    // A source with a preview (v1.3 preview_url) opens it in the host's
    // panel, from its footnote or its title; without one, as before.
    const previews = new Map();
    for (const source of message.sources || []) {
      const target = previewTarget(source, { n: Number(source.n), kind: source.kind, title: source.title }, ctx.document);
      if (target) previews.set(Number(source.n), target);
    }
    if (message.sources?.length) {
      sources = renderSources(ctx, message.sources, {
        idPrefix, open: Boolean(view.sources_open), onToggle: (open) => ctx.onAction?.('sources', { id: message.id, open }),
        previews, onPreview: (target, button) => openPreview(ctx, message, target, button),
      });
    }
    const onFootnote = (n) => {
      const target = previews.get(n);
      if (target) openPreview(ctx, message, target, null, () => sources?.reveal(n));
      else sources?.reveal(n);
    };
    const markup = renderMarkup(ctx, message.html, { sources: message.sources || [], idPrefix, onFootnote });
    body.append(markup);
    if (documentOf) body.append(foldLong(ctx, message, markup, view.fold_open, idPrefix));
  } else if (answered) {
    if (message.text) {
      const plain = text(ctx, 'p', 'sf-chat-message__plain', message.text);
      body.append(plain);
      if (documentOf) body.append(foldLong(ctx, message, plain, view.fold_open, idPrefix));
    }
  } else {
    // Once retried, the failed answer stays as a record without its button.
    const retry = message.status === 'failed' && !view.retried ? { label: 'action.retry', run: () => ctx.onAction?.('retry', { id: message.id }) } : null;
    // When the month's limit renews, if the server says (API.md v1.1).
    const renews = message.status === 'limit' ? formatMoment(ctx, message.limit_resets_at) : '';
    body.append(renderNotice(ctx, message.status, message.text || '', retry, renews ? ctx.words('limit.resets', { date: renews }) : ''));
  }

  // A caveat is part of the answer and stays in sight; «checked» is a quiet
  // mark in the action row.
  if (message.verification === 'unverified') {
    body.append(renderCheck(ctx, 'unverified', ctx.words('verification.unverified')));
  } else if (message.status === 'partial') {
    body.append(renderCheck(ctx, 'partial', ctx.words('status.partial')));
  }
  if (features.memory && message.notices?.length) {
    const memory = element(ctx, 'ul', 'sf-chat-memory', { 'aria-label': ctx.words('memory.label') });
    for (const notice of message.notices) {
      const item = element(ctx, 'li', 'sf-chat-memory__item');
      item.append(iconNode(ctx, 'bookmark', 'sf-chat-memory__icon', '1'), text(ctx, 'span', '', notice));
      memory.append(item);
    }
    body.append(memory);
  }
  if (features.proposals && message.proposal && ctx.renderProposal) {
    body.append(ctx.renderProposal(message.proposal, { disabled: Boolean(view.busy) }));
  }
  if (brief) body.append(renderBrief(ctx, message, brief, view, idPrefix));
  // What the answer made (v1.3 attachments), under it.
  const made = answered ? renderDeliverables(ctx, message, idPrefix) : null;
  if (made) body.append(made);

  if (documentOf && answered) {
    const reactions = renderReactions(ctx, message, view);
    if (reactions) body.append(reactions);
  }
  if (answered) body.append(renderActions(ctx, message, view, features, sources));
  if (documentOf && answered && view.picker && view.canReact) root.append(renderPicker(ctx, message, view));
  if (documentOf && view.askDelete) body.append(renderDeleteAsk(ctx, message, view.conflict));
  // «Не полезно» asks why, once, in place; the window says when (view).
  const rating = view.feedback && typeof view.feedback === 'object' ? view.feedback : null;
  if (answered && features.feedback && rating?.asking) body.append(renderFeedbackReason(ctx, message, rating, idPrefix));
  if (sources) body.append(sources.root);
  return root;
}

// --- sf-chat-brief (API.md v1.2) ----------------------------------------------

/** The brief as it can be drawn, or null: questions to ask or a card to confirm. */
export function briefOf(brief) {
  if (!brief || typeof brief !== 'object') return null;
  if (brief.decision === 'ask') {
    const questions = (Array.isArray(brief.questions) ? brief.questions : [])
      .filter((one) => one && typeof one.text === 'string' && one.text.trim())
      .map((one) => ({
        text: one.text.trim(),
        options: (Array.isArray(one.options) ? one.options : [])
          .filter((option) => option && typeof option.label === 'string' && option.label.trim())
          .map((option) => ({ label: option.label.trim(), detail: typeof option.detail === 'string' ? option.detail.trim() : '' })),
        recommended: Number.isInteger(one.recommended) ? one.recommended : null,
        other: one.allow_other !== false,
        blocking: one.blocking !== false,
      }));
    return questions.length ? { decision: 'ask', questions } : null;
  }
  if (brief.decision === 'card' && brief.card && typeof brief.card === 'object') {
    const card = brief.card;
    const line = (value) => (typeof value === 'string' ? value.trim() : '');
    const list = (value) => (Array.isArray(value) ? value.map(line).filter(Boolean) : []);
    return {
      decision: 'card',
      card: { goal: line(card.goal), result: line(card.result), steps: list(card.steps), assumptions: list(card.assumptions), confirm: line(card.confirm) || 'Да' },
    };
  }
  return null;
}

// Several answers go as one message, in the questions' order (API.md v1.2);
// a question left unanswered is a dash.
export const BRIEF_JOIN = '; ';
export const BRIEF_SKIPPED = '—';

const BUTTON_LOOKS = ['default', 'tonal', 'outline'];

function lookOf(button, appearance) {
  for (const one of BUTTON_LOOKS) button.classList.toggle(`sf-button--${one}`, one === appearance);
}

/**
 * The brief under an answer. Live (view.brief.live: the conversation's last
 * message, with nobody's question after it) it asks: an option, the person's
 * own words, or «Да» to the card go out as a message through
 * ctx.onAction('brief-answer', {id, text}), the way a typed one does. Not
 * live, it is a record: what was asked, and which option was taken when the
 * question after it says so (view.brief.answer). What is chosen among several
 * questions is kept in view.brief_draft, which the window holds, so a redraw
 * keeps it. The root is a fieldset: the window disables it while a send is
 * out, without touching the controls' own state.
 */
export function renderBrief(ctx, message, brief, view = {}, idPrefix = 'chat') {
  const state = view.brief || {};
  const live = Boolean(state.live);
  const answer = typeof state.answer === 'string' ? state.answer : null;
  const send = (value) => ctx.onAction?.('brief-answer', { id: message.id, text: value });
  const root = element(ctx, 'fieldset', `sf-chat-brief sf-chat-brief--${brief.decision}`, { 'data-live': live || null });
  if (!live) root.classList.add('sf-chat-brief--done');
  if (brief.decision === 'card') {
    renderBriefCard(ctx, root, brief.card, { live, answer, send, idPrefix });
    return root;
  }
  const questions = brief.questions;
  const single = questions.length === 1;
  const draft = view.brief_draft || {};
  draft.choices ||= questions.map(() => null);
  draft.others ||= questions.map(() => '');
  draft.open ||= questions.map(() => false);
  const given = answer == null ? [] : (single ? [answer] : answer.split(BRIEF_JOIN));
  const value = (index) => {
    const choice = draft.choices[index];
    if (choice != null && questions[index].options[choice]) return questions[index].options[choice].label;
    return String(draft.others[index] || '').trim();
  };
  const ready = () => questions.every((one, index) => !one.blocking || value(index));
  let submit = null;
  let hint = null;
  const refresh = () => {
    if (!submit) return;
    const ok = ready();
    submit.disabled = !ok;
    hint.hidden = ok;
  };
  const sendAll = () => {
    if (!ready()) return;
    send(questions.map((one, index) => value(index) || BRIEF_SKIPPED).join(BRIEF_JOIN));
  };

  if (!single) root.setAttribute('aria-label', ctx.words('brief.questions'));
  questions.forEach((question, index) => {
    const qid = `${idPrefix}-brief-${index}`;
    // One question is the brief itself; several are groups of their own.
    const group = single ? root : element(ctx, 'fieldset', 'sf-chat-brief__question');
    const legend = element(ctx, 'legend', 'sf-chat-brief__text', { id: `${qid}-text` });
    legend.append(text(ctx, 'span', '', single ? question.text : `${index + 1}. ${question.text}`));
    if (!single && !question.blocking) legend.append(text(ctx, 'span', 'sf-chat-brief__optional', ctx.words('brief.optional')));
    group.append(legend);
    if (!single) root.append(group);
    const options = element(ctx, 'div', 'sf-chat-brief__options');
    const buttons = [];
    let input = null;
    const pressed = () => {
      buttons.forEach((button, at) => {
        const on = draft.choices[index] === at;
        button.setAttribute('aria-pressed', String(on));
        lookOf(button, on ? 'default' : (at === question.recommended ? 'tonal' : 'outline'));
      });
    };
    question.options.forEach((option, at) => {
      const recommended = at === question.recommended;
      const row = element(ctx, 'div', 'sf-chat-brief__option');
      const meta = element(ctx, 'span', 'sf-chat-brief__meta');
      const described = [];
      if (option.detail) {
        meta.append(text(ctx, 'span', '', option.detail, { id: `${qid}-${at}-detail` }));
        described.push(`${qid}-${at}-detail`);
      }
      if (recommended) {
        meta.append(text(ctx, 'span', 'sf-chat-brief__mark', ctx.words('brief.recommended'), { id: `${qid}-${at}-mark` }));
        described.push(`${qid}-${at}-mark`);
      }
      if (live) {
        const button = textButton(ctx, { label: option.label, appearance: recommended ? 'default' : 'outline', scheme: 'primary', size: '1/2', className: 'sf-chat-brief__choice' });
        button.dataset.option = String(at);
        if (described.length) button.setAttribute('aria-describedby', described.join(' '));
        if (single) {
          button.addEventListener('click', () => send(option.label));
        } else {
          button.addEventListener('click', () => {
            draft.choices[index] = draft.choices[index] === at ? null : at;
            if (draft.choices[index] != null && input) { draft.others[index] = ''; input.value = ''; }
            pressed();
            refresh();
          });
        }
        buttons.push(button);
        row.append(button);
      } else {
        // A record: the option as it was offered, the one taken marked.
        const chosen = given[index] === option.label;
        const chip = element(ctx, 'span', `sf-chat-chip sf-chat-chip--choice sf-chat-brief__chip${chosen ? ' sf-chat-chip--chosen' : ''}`);
        if (chosen) chip.append(iconNode(ctx, 'check', '', '1'));
        chip.append(text(ctx, 'span', '', option.label));
        if (chosen) chip.append(text(ctx, 'span', 'sf-chat-offscreen', `, ${ctx.words('brief.answered')}`));
        row.append(chip);
      }
      if (meta.childNodes.length) row.append(meta);
      options.append(row);
    });
    if (!single) pressed();
    if (live && question.other) {
      const otherId = `${qid}-other`;
      const box = element(ctx, 'div', 'sf-chat-brief__other', { id: otherId });
      // The Framework's input markup (component/inputs), named by a hidden label.
      const field = element(ctx, 'label', 'sf-input sf-input--size-1/2 sf-input--bordered flex flex-col sf-chat-brief__field');
      const row = element(ctx, 'span', 'sf-input-field items-cross-center transition flex');
      input = element(ctx, 'input', '', { type: 'text', maxlength: '1000', autocomplete: 'off', placeholder: ctx.words('brief.otherPlaceholder') });
      input.value = draft.others[index] || '';
      row.append(input);
      field.append(text(ctx, 'span', 'sf-chat-offscreen', ctx.words('brief.otherLabel', { question: question.text })), row);
      box.append(field);
      if (single) {
        const answerOwn = textButton(ctx, { label: ctx.words('brief.send'), scheme: 'primary', size: '1/2', className: 'sf-chat-brief__send' });
        const own = () => {
          const typed = input.value.trim();
          if (typed) send(typed); else input.focus();
        };
        answerOwn.addEventListener('click', own);
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); own(); }
        });
        box.append(answerOwn);
      } else {
        input.addEventListener('input', () => {
          draft.others[index] = input.value;
          if (input.value.trim()) draft.choices[index] = null;
          pressed();
          refresh();
        });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); sendAll(); }
        });
      }
      if (question.options.length) {
        // «Свой вариант» opens the field, which takes the focus.
        const toggle = textButton(ctx, { label: ctx.words('brief.other'), appearance: 'ghost', scheme: 'primary', size: '1/2', className: 'sf-chat-brief__toggle' });
        toggle.setAttribute('aria-expanded', String(Boolean(draft.open[index])));
        toggle.setAttribute('aria-controls', otherId);
        box.hidden = !draft.open[index];
        toggle.addEventListener('click', () => {
          draft.open[index] = !draft.open[index];
          box.hidden = !draft.open[index];
          toggle.setAttribute('aria-expanded', String(draft.open[index]));
          if (draft.open[index]) input.focus();
        });
        const row2 = element(ctx, 'div', 'sf-chat-brief__option');
        row2.append(toggle);
        options.append(row2);
      }
      if (options.childNodes.length) group.append(options);
      group.append(box);
    } else if (options.childNodes.length) {
      group.append(options);
    }
  });

  if (live && !single) {
    const actions = element(ctx, 'div', 'sf-chat-brief__actions');
    const hintId = `${idPrefix}-brief-hint`;
    submit = textButton(ctx, { label: ctx.words('brief.send'), scheme: 'primary', size: '1/2', className: 'sf-chat-brief__send' });
    submit.setAttribute('aria-describedby', hintId);
    submit.addEventListener('click', sendAll);
    hint = text(ctx, 'span', 'sf-chat-brief__hint', ctx.words('brief.required'), { id: hintId });
    actions.append(submit, hint);
    root.append(actions);
    refresh();
  }
  return root;
}

function renderBriefCard(ctx, root, card, { live, answer, send, idPrefix }) {
  root.append(text(ctx, 'legend', 'sf-chat-brief__text', ctx.words('brief.card'), { id: `${idPrefix}-brief-card` }));
  const parts = element(ctx, 'dl', 'sf-chat-brief__parts');
  const part = (key, value) => {
    parts.append(text(ctx, 'dt', 'sf-chat-brief__term', ctx.words(key)));
    const detail = element(ctx, 'dd', 'sf-chat-brief__detail');
    if (Array.isArray(value)) {
      const list = element(ctx, key === 'brief.steps' ? 'ol' : 'ul', 'sf-chat-brief__list');
      for (const one of value) list.append(text(ctx, 'li', '', one));
      detail.append(list);
    } else {
      detail.textContent = value;
    }
    parts.append(detail);
  };
  if (card.goal) part('brief.goal', card.goal);
  if (card.result) part('brief.result', card.result);
  if (card.steps.length) part('brief.steps', card.steps);
  if (card.assumptions.length) part('brief.assumptions', card.assumptions);
  root.append(parts);
  if (live) {
    const actions = element(ctx, 'div', 'sf-chat-brief__actions');
    const confirm = textButton(ctx, { label: card.confirm, scheme: 'primary', size: '1/2', className: 'sf-chat-brief__send' });
    const hintId = `${idPrefix}-brief-fix`;
    confirm.setAttribute('aria-describedby', hintId);
    confirm.addEventListener('click', () => send(card.confirm));
    actions.append(confirm, text(ctx, 'span', 'sf-chat-brief__hint', ctx.words('brief.fix'), { id: hintId }));
    root.append(actions);
  } else if (answer === card.confirm) {
    const done = element(ctx, 'p', 'sf-chat-brief__confirmed');
    done.append(iconNode(ctx, 'check_circle', '', '1'), text(ctx, 'span', '', ctx.words('brief.confirmed')));
    root.append(done);
  }
}

export const FEEDBACK_REASONS = ['wrong', 'incomplete', 'off_topic', 'other'];

/**
 * Why an answer was not helpful (API.md v1.1 feedback reason): four choices
 * and the person's own words, both optional. What is chosen and typed is kept
 * in rating.draft, which the window holds, so a redraw of the message keeps
 * it; the window is told of every change, of «Отправить» and of «Не сейчас».
 */
export function renderFeedbackReason(ctx, message, rating, idPrefix = 'chat') {
  const draft = rating.draft || (rating.draft = { reason: null, note: '' });
  const id = message.id;
  const titleId = `${idPrefix}-reason-title`;
  const root = element(ctx, 'div', 'sf-chat-reason', { role: 'group', 'aria-labelledby': titleId });
  root.append(text(ctx, 'p', 'sf-chat-reason__title', ctx.words('feedback.ask'), { id: titleId }));
  const report = () => ctx.onAction?.('feedback-draft', { id, reason: draft.reason, note: draft.note });
  const choices = element(ctx, 'div', 'sf-chat-reason__choices');
  const buttons = FEEDBACK_REASONS.map((reason) => {
    const button = text(ctx, 'button', 'sf-chat-chip sf-chat-chip--choice', ctx.words(`feedback.reason.${reason}`), {
      type: 'button', 'aria-pressed': String(draft.reason === reason), 'data-reason': reason,
    });
    button.addEventListener('click', () => {
      draft.reason = draft.reason === reason ? null : reason;
      for (const one of buttons) one.setAttribute('aria-pressed', String(one.dataset.reason === draft.reason));
      report();
    });
    return button;
  });
  choices.append(...buttons);
  // The Framework's input markup (component/inputs), named by a hidden label.
  const field = element(ctx, 'label', 'sf-input sf-input--size-1/2 sf-input--bordered flex flex-col sf-chat-reason__note');
  const box = element(ctx, 'span', 'sf-input-field items-cross-center transition flex');
  const input = element(ctx, 'input', '', { type: 'text', maxlength: '500', autocomplete: 'off', placeholder: ctx.words('feedback.notePlaceholder') });
  input.value = draft.note || '';
  input.addEventListener('input', () => { draft.note = input.value; report(); });
  box.append(input);
  field.append(text(ctx, 'span', 'sf-chat-offscreen', ctx.words('feedback.noteLabel')), box);
  const send = () => ctx.onAction?.('feedback-send', { id, reason: draft.reason, note: (draft.note || '').trim() });
  const skip = () => ctx.onAction?.('feedback-skip', { id });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); send(); }
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); skip(); }
  });
  const actions = element(ctx, 'div', 'sf-chat-reason__actions');
  const sendButton = textButton(ctx, { label: ctx.words('feedback.send'), scheme: 'primary', size: '1/2' });
  sendButton.addEventListener('click', send);
  const skipButton = textButton(ctx, { label: ctx.words('feedback.skip'), appearance: 'link', scheme: 'primary', size: '1/2' });
  skipButton.addEventListener('click', skip);
  actions.append(sendButton, skipButton);
  root.append(choices, field, actions);
  return root;
}

function renderCheck(ctx, kind, label) {
  const node = element(ctx, 'p', `sf-chat-check sf-chat-check--${kind}`);
  node.append(iconNode(ctx, 'info', 'sf-chat-check__icon', '1'), text(ctx, 'span', '', label));
  return node;
}

function renderActions(ctx, message, view, features, sources) {
  const actions = element(ctx, 'div', 'sf-chat-message__actions');
  const live = element(ctx, 'span', 'sf-chat-offscreen', { role: 'status', 'aria-live': 'polite' });
  // What belongs to the answer first (its sources, the check), then the tools
  // for it, which earlier answers keep out of sight until hovered.
  if (sources) actions.append(sources.toggle);
  if (message.verification === 'verified') {
    const checked = element(ctx, 'span', 'sf-chat-chip sf-chat-chip--verified');
    // The full meaning is read out; the eye gets the short word (Q-24).
    checked.append(iconNode(ctx, 'verified', '', '1'), text(ctx, 'span', '', ctx.words('verification.verifiedShort')), text(ctx, 'span', 'sf-chat-offscreen', ctx.words('verification.verifiedTail')));
    checked.title = ctx.words('verification.verified');
    actions.append(checked);
  }
  if (sources || message.verification === 'verified') {
    actions.append(element(ctx, 'span', 'sf-chat-message__divider sf-chat-message__tool', { 'aria-hidden': 'true' }));
  }
  const time = message.finished_at ? formatTime(ctx, message.finished_at) : '';
  const copy = iconButton(ctx, { icon: 'content_copy', label: ctx.words('action.copy') });
  copy.classList.add('sf-chat-message__tool');
  if (time) copy.title = `${ctx.words('action.copy')} · ${time}`;
  copy.addEventListener('click', async () => {
    const done = await copyText(ctx, copyValue(message, copy));
    live.textContent = done ? ctx.words('action.copied') : ctx.words('action.copyFailed');
    ctx.onAction?.('copy', { id: message.id, done });
  });
  actions.append(copy);
  if (features.feedback) {
    // The rating is shown at once and kept by the buttons themselves, so a
    // redraw of the list does not take the focus away from them. The window's
    // rating of this page wins over the one the server stored (v1.1).
    const saved = view.feedback ?? message.feedback ?? null;
    const rated = typeof saved === 'string' ? saved : (saved?.value ?? null);
    const buttons = ['up', 'down'].map((value) => {
      const button = iconButton(ctx, { icon: value === 'up' ? 'thumb_up' : 'thumb_down', label: ctx.words(`action.${value}`), pressed: rated === value });
      button.classList.add('sf-chat-message__tool');
      button.dataset.rating = value;
      // A stored reason is named where the eye goes for it.
      if (value === 'down' && rated === 'down' && FEEDBACK_REASONS.includes(saved?.reason)) {
        button.title = `${ctx.words('action.down')} · ${ctx.words(`feedback.reason.${saved.reason}`)}`;
      }
      button.addEventListener('click', () => {
        if (button.getAttribute('aria-pressed') === 'true') return;
        for (const other of buttons) {
          const on = other === button;
          other.setAttribute('aria-pressed', String(on));
          other.classList.toggle('active', on);
        }
        live.textContent = ctx.words('action.thanks');
        ctx.onAction?.('feedback', { id: message.id, value });
      });
      return button;
    });
    actions.append(...buttons);
  }
  // How the answer was made, folded (API.md v1.1): a quiet line at the end of
  // the row, no louder than the time in the copy button's tooltip.
  // Among people (1.4.0): who answers it and what else, shown as a person's are;
  // copy and the rating stay in sight, and the rating is the reader's alone.
  if (view.document) {
    const at = message.finished_at || message.created_at;
    const when = at ? formatTime(ctx, at) : '';
    if (when) actions.append(text(ctx, 'time', 'sf-chat-message__time', when, {datetime: at}));
    const tools = view.askDelete ? null : renderTools(ctx, message, view, {remove: message.canDelete === true});
    if (tools) actions.append(tools);
  }
  const summary = typeof message.summary?.text === 'string' ? message.summary.text.trim() : '';
  if (summary) actions.append(text(ctx, 'span', 'sf-chat-message__summary', summary, { title: summary }));
  actions.append(live);
  return actions;
}

/**
 * Let what a detached rendering still runs go: the clock of a running
 * answer's steps (v1.3). The proposal's expiry went with the card to
 * sf-change-confirm, which stops its own timer when it leaves the page. The
 * widget and the pilot call it on every node they drop.
 */
export function disposeRendering(root) {
  for (const node of root.querySelectorAll('[data-sf-chat-dispose]')) node.dispatchEvent(new Event('sf-chat-dispose'));
}

/** Start again what disposeRendering stopped: a rendering back on the page (a running answer's clock). */
export function resumeRendering(root) {
  for (const node of root.querySelectorAll('[data-sf-chat-dispose]')) node.dispatchEvent(new Event('sf-chat-resume'));
}
