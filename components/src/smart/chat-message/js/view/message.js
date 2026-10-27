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
// the «Файл удалён» check added here for a sent file.
//
// Nothing here talks to a server. What a person does is reported through
// ctx.onAction(action, detail); the element turns it into its events.
//
// ctx: {
//   document: Document,
//   locale: 'ru'|'en',
//   words: (key, values?) => string,     the 0.3 dotted keys (stage.queued, …)
//   icon: (name, {size}) => Node,        smart sf-icon on a Framework page, an SVG in the widget
//   onAction?: (action, detail) => void, retry | check | feedback | feedback-draft |
//                                        feedback-send | feedback-skip | sources | copy |
//                                        remove-attachment | brief-answer
//   enhanceCode?: (pre) => void,         SF.Highlight on a Framework page
//   renderProposal?: (proposal, {disabled}) => Node,
//                                        sf-change-confirm (index.js)
//   features?: {feedback, proposals, memory, brief}   brief (v1.2) is off unless given
// }
import {render} from 'lit';
import {sanitizeHtml as ownSanitizeHtml, safeHref as ownSafeHref} from './sanitize.js';
import {attachmentState, renderAttachment as attachmentChip} from '../../../chat-composer/js/templates/parts.js';

// The Framework's sanitizer when the page has it (ui-89834691fb9d and later),
// else the component's own copy (js/view/sanitize.js), the same allow-list.
const sanitizer = () => (typeof globalThis.SF?.sanitizeHtml === 'function' ? globalThis.SF.sanitizeHtml : ownSanitizeHtml);
export const safeHref = (value) => (typeof globalThis.SF?.safeHref === 'function' ? globalThis.SF.safeHref(value) : ownSafeHref(value));
const sanitizeHtml = (html, policy) => sanitizer()(html, policy);

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
export function renderSources(ctx, sources, { idPrefix = 'chat', open: startOpen = false, onToggle } = {}) {
  const listId = `${idPrefix}-sources`;
  const root = element(ctx, 'ol', 'sf-chat-sources', { id: listId, 'aria-label': ctx.words('sources.title', { count: sources.length }) });
  root.hidden = !startOpen;
  for (const source of sources) {
    const item = element(ctx, 'li', 'sf-chat-sources__item', { id: `${idPrefix}-source-${source.n}`, tabindex: '-1' });
    item.append(text(ctx, 'span', 'sf-chat-sources__number', String(source.n)));
    const body = element(ctx, 'span', 'sf-chat-sources__body');
    const href = source.kind === 'web' ? webHref(source.url) : null;
    if (href) {
      body.append(text(ctx, 'a', 'sf-chat-sources__title', source.title, { href, target: '_blank', rel: 'noopener noreferrer nofollow' }));
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
// gone is said so in its chip -- the name without a link, «Файл удалён».
async function checkDownload(ctx, event, link, metaNode, name) {
  if (link.dataset.checked) { delete link.dataset.checked; return; }
  event.preventDefault();
  let gone = false;
  try {
    const response = await ctx.document.defaultView.fetch(link.href, { method: 'HEAD', credentials: 'same-origin' });
    gone = response.status === 404 || response.status === 410;
  } catch { gone = false; }
  if (!gone) {
    link.dataset.checked = '1';
    link.click();
    return;
  }
  const plain = text(ctx, 'span', 'sf-chat-attachment__name', name, { title: name });
  link.replaceWith(plain);
  metaNode.textContent = ctx.words('attachment.deleted');
  metaNode.setAttribute('role', 'status');
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
  const root = element(ctx, 'article', `sf-chat-message sf-chat-message--assistant sf-chat-message--${message.status}`, {
    'data-id': message.id, 'aria-label': ctx.words('assistant'), 'aria-busy': PENDING_STATUSES.has(message.status) ? 'true' : null,
  });
  const body = element(ctx, 'div', 'sf-chat-message__body');
  root.append(body);

  if (PENDING_STATUSES.has(message.status)) {
    if (view.wait) {
      body.append(renderNotice(ctx, view.wait, ctx.words(`status.${view.wait}`), { label: 'action.check', run: () => ctx.onAction?.('check', { id: message.id }) }));
    } else {
      body.append(renderStages(ctx, message));
    }
    return root;
  }

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
    if (message.sources?.length) {
      sources = renderSources(ctx, message.sources, {
        idPrefix, open: Boolean(view.sources_open), onToggle: (open) => ctx.onAction?.('sources', { id: message.id, open }),
      });
    }
    body.append(renderMarkup(ctx, message.html, { sources: message.sources || [], idPrefix, onFootnote: (n) => sources?.reveal(n) }));
  } else if (answered) {
    if (message.text) body.append(text(ctx, 'p', 'sf-chat-message__plain', message.text));
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

  if (answered) body.append(renderActions(ctx, message, view, features, sources));
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
  const summary = typeof message.summary?.text === 'string' ? message.summary.text.trim() : '';
  if (summary) actions.append(text(ctx, 'span', 'sf-chat-message__summary', summary, { title: summary }));
  actions.append(live);
  return actions;
}

/**
 * Let what a detached rendering still runs go. Nothing does now: the one timer
 * a rendering had, the proposal's expiry, went with the card to
 * sf-change-confirm, which stops its own timer when it leaves the page. Kept
 * for the widget and the pilot, which call it on every node they drop, so the
 * next thing that does need it has one place to go.
 */
export function disposeRendering(root) {
  for (const node of root.querySelectorAll('[data-sf-chat-dispose]')) node.dispatchEvent(new Event('sf-chat-dispose'));
}
