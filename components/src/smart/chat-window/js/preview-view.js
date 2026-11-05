// The source preview in sf-chat-window (1.2.0): a source of an answer, or a
// file the answer made, shown beside the conversation at its inline end
// (API.md v1.3, proposed: sources[].preview_url, locator, mime; an answer's
// attachments[].preview_url). On a narrow window it covers the conversation
// as a full-height sheet with «Назад».
//
// The message asks (sf-chat-message-open {kind: preview, source}); the window
// opens the panel, says so (sf-chat-window-open {kind: preview}, which a page
// may cancel) and cancels the message's event, so the footnote does not open
// the list as well. The panel is the workspace layout's panel region (1.7.0,
// core.css .sf-workspace-panel): a column from the wide width, below it the
// Framework's drawer -- Escape, the scrim, the conversation inert behind it
// and the focus coming back are the layer stack's, not this view's. Only the page's own origin is ever loaded: the source is
// read through chat-message's proposed.js, which keeps a same-origin
// preview_url and nothing else.
//
// What it shows. HTML (the material's accepted revision, whole or a fragment
// around the passage; Mirai24's only type for now) is fetched once with the
// page's cookies and drawn through SF.sanitizeHtml, never run: the cleaned
// markup is the chat's own (paragraphs, lists, tables, links), and the
// passage {from, to} -- characters of that text as drawn -- is marked and
// brought into view; without {from, to}, the element the address's
// #fragment names is the passage (1.3.0, below). Plain text is drawn as
// text. A PDF is the browser's viewer in a frame of the same origin (at its
// {page}); anything else is offered in a new tab. sf-file-preview (the Framework's file row: an icon,
// a name, download and remove) shows no content, so it is not used here.
//
// A document (1.12.0, x-blocks; BLOCKS.md §3) is shown here too: the
// engine's page from preview_url in a frame of the same origin that runs
// nothing (sandbox without scripts; the host's CSP allows its own styles
// only), so it reads as the paper it is. What is still to fill in is the
// engine's <mark data-field>; a press on one brings the form card's field
// (the window's focusDocumentField). A new revision of the open document
// reloads the frame where it was read.
import {iconButton, iconNode, text, textButton} from '../../chat-message/js/view/message.js';
import {previewTarget, sameOriginHref} from '../../chat-message/js/view/proposed.js';

let views = 0;

export class PreviewView {
  /** @param {HTMLElement} win  the sf-chat-window that shows it */
  constructor(win) {
    this.win = win;
    this.open = false;
    this.source = null;
    this.opener = null;      // what opened it: a node, or a way to find it again
    this.loading = 0;        // the load in flight; an older answer is dropped
  }

  get ctx() { return this.win.ctx; }
  get words() { return this.win.words; }

  build(headingTag) {
    const ctx = this.ctx;
    const doc = ctx.document;
    const id = `chat-preview-${++views}`;
    const root = doc.createElement('aside');
    root.className = 'chat-shell__preview chat-preview sf-workspace-panel';
    root.id = id;
    root.hidden = true;
    root.setAttribute('aria-labelledby', `${id}-title`);

    const head = doc.createElement('div');
    head.className = 'chat-preview__head';
    const back = iconButton(ctx, { icon: 'arrow_back', label: this.words('preview.back'), size: '1' });
    back.classList.add('chat-preview__back');
    back.addEventListener('click', () => this.win.closePreview());
    const titles = doc.createElement('div');
    titles.className = 'chat-preview__titles';
    const title = doc.createElement(headingTag === 'h1' ? 'h2' : 'h3');
    title.className = 'chat-preview__title';
    title.id = `${id}-title`;
    title.tabIndex = -1;
    const meta = doc.createElement('p');
    meta.className = 'chat-preview__meta';
    titles.append(title, meta);
    const tab = doc.createElement('a');
    tab.className = 'sf-icon-button sf-icon-button--size-1 sf-icon-button--icon sf-icon-button--link sf-icon-button--on-surface flex items-cross-center content-main-center chat-preview__tab';
    tab.target = '_blank';
    tab.rel = 'noopener';
    tab.setAttribute('aria-label', this.words('preview.newTab'));
    tab.title = this.words('preview.newTab');
    tab.append(iconNode(ctx, 'open_in_new', '', '2'));
    const close = iconButton(ctx, { icon: 'close', label: this.words('preview.close'), size: '1' });
    close.classList.add('chat-preview__close');
    close.addEventListener('click', () => this.win.closePreview());
    head.append(back, titles, tab, close);

    // The text scrolls by itself and is reachable by the keyboard.
    const body = doc.createElement('div');
    body.className = 'chat-preview__body';
    body.tabIndex = 0;
    body.setAttribute('role', 'region');
    body.setAttribute('aria-labelledby', `${id}-title`);
    const status = doc.createElement('p');
    status.className = 'sf-chat-offscreen';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.append(head, body, status);

    // Escape while it is a column, where no layer is open: as a drawer it is
    // the layer stack's key, which closes the top layer only (a menu inside
    // the panel first) and gives the focus back itself.
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || this.win.panelDrawer) return;
      event.preventDefault();
      event.stopPropagation();
      this.win.closePreview();
    });
    Object.assign(this, { root, head, back, title, meta, tab, close, body, status });
    return this;
  }

  /** Where the open document's frame was read, or null. */
  frameScroll() {
    try { return this.frame?.contentWindow?.scrollY ?? null; } catch { return null; }
  }

  // The document's page: the engine's own look, nothing run. Downloads above it.
  loadDocument() {
    const target = this.source;
    const ticket = ++this.loading;
    const doc = this.ctx.document;
    const keep = this.keepScroll;
    this.body.setAttribute('aria-busy', 'true');
    const parts = [];
    if (target.downloads.length || target.missing.length) {
      const bar = doc.createElement('div');
      bar.className = 'chat-preview__bar';
      if (target.missing.length) bar.append(text(this.ctx, 'p', 'chat-preview__hint', this.words('document.hint')));
      for (const one of target.downloads) {
        const link = doc.createElement('a');
        link.className = 'sf-button sf-button--size-1/2 sf-button--outline sf-button--primary flex items-cross-center content-main-center chat-preview__download';
        link.href = one.href;
        link.setAttribute('download', '');
        link.dataset.format = one.format;
        link.append(iconNode(this.ctx, 'download', '', '1'), text(this.ctx, 'span', 'sf-button-text-container', one.label));
        bar.append(link);
      }
      parts.push(bar);
    }
    const frame = doc.createElement('iframe');
    frame.className = 'chat-preview__frame chat-preview__frame--document';
    frame.title = target.title || this.words('document.untitled');
    // Its own origin, so its marks can be pressed; never its scripts.
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('referrerpolicy', 'same-origin');
    frame.addEventListener('load', () => {
      if (ticket !== this.loading || !this.open) return;
      this.body.setAttribute('aria-busy', 'false');
      this.wireMarks(frame, target);
      if (keep) { try { frame.contentWindow.scrollTo(0, keep); } catch { /* a page that is not ours */ } }
    }, { once: true });
    frame.src = target.preview_url;
    parts.push(frame);
    this.frame = frame;
    this.body.replaceChildren(...parts);
    this.say(this.words('document.opened', { title: this.title.textContent }));
  }

  // The engine's <mark data-field>: what is still to fill in, each a press
  // (and a key) that brings the form card's field.
  wireMarks(frame, target) {
    let inner = null;
    try { inner = frame.contentDocument; } catch { inner = null; }
    if (!inner?.body) return;
    const style = inner.createElement('style');
    style.textContent = 'mark[data-field]{cursor:pointer}mark[data-field]:hover{box-shadow:0 0 0 2px #e0b400}mark[data-field]:focus-visible{outline:2px solid #1a5fd0;outline-offset:2px}';
    inner.head?.append(style);
    const labels = new Map(target.missing.map((one) => [one.field, one]));
    for (const mark of inner.querySelectorAll('mark[data-field]')) {
      const key = mark.getAttribute('data-field');
      if (!key) continue;
      const known = labels.get(key);
      mark.tabIndex = 0;
      mark.setAttribute('role', 'button');
      mark.title = this.words('document.fillField', { label: known?.label || mark.textContent.trim() });
    }
    const go = (event) => {
      const mark = event.target?.closest?.('mark[data-field]');
      if (!mark) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const key = mark.getAttribute('data-field');
      this.win.focusDocumentField(target, labels.get(key)?.block ?? target.form_block, key);
    };
    inner.addEventListener('click', go);
    inner.addEventListener('keydown', go);
  }

  say(value) {
    this.status.textContent = '';
    requestAnimationFrame(() => { this.status.textContent = value; });
  }

  /** The source as the panel shows it, or null for one it may not load. */
  targetOf(source) {
    if (!source || typeof source !== 'object') return null;
    if (source.kind === 'document') return documentTarget(source, this.ctx.document);
    return previewTarget(source, {
      n: source.n ?? null, kind: source.kind || '', title: source.title || source.name || '', href: source.href || null,
    }, this.ctx.document);
  }

  /** Draw the source's head and load what it shows. */
  show(target) {
    const same = target.kind === 'document' && this.source?.kind === 'document' && this.source.document_id === target.document_id;
    this.keepScroll = same ? this.frameScroll() : null;
    this.source = target;
    this.root.classList.toggle('chat-preview--document', target.kind === 'document');
    if (target.kind === 'document') {
      this.title.textContent = target.title || this.words('document.untitled');
      this.meta.textContent = documentMeta(this.words, target);
      this.meta.hidden = !this.meta.textContent;
      this.tab.href = target.preview_url;
      return this.loadDocument();
    }
    this.title.textContent = target.title || this.words('preview.untitled');
    const kind = target.kind && ['base', 'my_base', 'web', 'file'].includes(target.kind) ? this.words(`preview.kind.${target.kind}`) : '';
    this.meta.textContent = [target.n != null ? this.words('preview.number', { n: target.n }) : '', kind].filter(Boolean).join(' · ');
    this.meta.hidden = !this.meta.textContent;
    this.tab.href = target.preview_url;
    return this.load();
  }

  async load() {
    const target = this.source;
    const ticket = ++this.loading;
    const doc = this.ctx.document;
    this.body.setAttribute('aria-busy', 'true');
    this.body.replaceChildren(text(this.ctx, 'p', 'chat-preview__note', this.words('preview.loading')));
    const pdf = (type) => type === 'application/pdf';
    let type = target.mime;
    let content = null;
    let failed = false;
    if (!pdf(type)) {
      try {
        const response = await doc.defaultView.fetch(target.preview_url, { credentials: 'same-origin', headers: { Accept: 'text/html, text/plain;q=0.9, */*;q=0.1' } });
        if (!response.ok) throw new Error(String(response.status));
        type ||= String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!pdf(type)) content = await response.text();
      } catch {
        failed = true;
      }
    }
    if (ticket !== this.loading || !this.open) return;
    this.body.setAttribute('aria-busy', 'false');
    if (failed) {
      const retry = textButton(this.ctx, { label: this.words('preview.retry'), appearance: 'outline', scheme: 'primary', size: '1/2', className: 'chat-preview__retry' });
      retry.addEventListener('click', () => this.load());
      const box = doc.createElement('div');
      box.className = 'chat-preview__problem';
      box.setAttribute('role', 'alert');
      box.append(text(this.ctx, 'p', 'chat-preview__note', this.words('preview.error')), retry);
      this.body.replaceChildren(box);
      return;
    }
    if (pdf(type)) {
      const frame = doc.createElement('iframe');
      frame.className = 'chat-preview__frame';
      frame.title = target.title || this.words('preview.untitled');
      // The browser's PDF viewer: the same origin only, never a page of scripts.
      frame.src = target.locator?.page ? `${target.preview_url.split('#')[0]}#page=${target.locator.page}` : target.preview_url;
      frame.setAttribute('referrerpolicy', 'same-origin');
      this.body.replaceChildren(frame);
      this.say(this.words('preview.opened', { title: this.title.textContent }));
      return;
    }
    if (!type || type.includes('html')) {
      const markup = doc.createElement('div');
      markup.className = 'sf-chat-markup chat-preview__text';
      // 1.3.0: without {from, to}, the element the address's #fragment names
      // (Mirai24: <mark id="cite">) is the passage.
      const located = target.locator?.from === undefined ? withSentinels(content ?? '', fragmentOf(target.preview_url, doc), doc) : null;
      markup.append(globalThis.SF.sanitizeHtml(located ?? content ?? '', { document: doc }));
      this.body.replaceChildren(markup);
      this.mark(markup, located ? takeSentinels(markup, doc) : target.locator);
      return;
    }
    if (type.startsWith('text/')) {
      const plain = text(this.ctx, 'div', 'chat-preview__text chat-preview__plain', content ?? '');
      this.body.replaceChildren(plain);
      this.mark(plain, target.locator);
      return;
    }
    const box = doc.createElement('div');
    box.className = 'chat-preview__problem';
    box.append(text(this.ctx, 'p', 'chat-preview__note', this.words('preview.unsupported')));
    this.body.replaceChildren(box);
    this.say(this.words('preview.unsupported'));
  }

  /**
   * The passage {from, to}: characters of the text as drawn (the cleaned
   * markup's text content), marked across the elements it spans and brought
   * into the middle of the panel. A locator past the text marks nothing.
   */
  mark(root, locator) {
    const opened = this.words('preview.opened', { title: this.title.textContent });
    if (!locator || !Number.isInteger(locator.from) || !Number.isInteger(locator.to)) {
      this.say(opened);
      return;
    }
    const doc = this.ctx.document;
    const walker = doc.createTreeWalker(root, 4);
    const pieces = [];
    let at = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = at;
      const end = at + node.data.length;
      at = end;
      if (end <= locator.from) continue;
      if (start >= locator.to) break;
      pieces.push({ node, from: Math.max(0, locator.from - start), to: Math.min(node.data.length, locator.to - start) });
    }
    const marks = [];
    for (const piece of pieces) {
      if (piece.to <= piece.from) continue;
      let node = piece.node;
      if (piece.from > 0) node = node.splitText(piece.from);
      if (piece.to - piece.from < node.data.length) node.splitText(piece.to - piece.from);
      const mark = doc.createElement('mark');
      mark.className = 'chat-preview__mark';
      node.replaceWith(mark);
      mark.append(node);
      marks.push(mark);
    }
    if (!marks.length) {
      this.say(opened);
      return;
    }
    marks[0].classList.add('chat-preview__mark--first');
    // The page's own <mark> around the passage, if the cleaning kept it, gives
    // way to the panel's marks: one look, not two.
    for (const own of [...root.querySelectorAll('mark:not(.chat-preview__mark)')]) {
      if (own.querySelector('.chat-preview__mark')) own.replaceWith(...own.childNodes);
    }
    const reduce = doc.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => marks[0].scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }));
    this.say(`${opened}. ${this.words('preview.marked')}`);
  }

  clear() {
    this.loading++;
    this.source = null;
    this.frame = null;
    this.root.classList.remove('chat-preview--document');
    this.body.replaceChildren();
    this.title.textContent = '';
    this.meta.textContent = '';
    this.tab.removeAttribute('href');
  }
}

// --- the passage named by the address's fragment (1.3.0) -------------------
//
// Mirai24 gives preview_url with a #fragment and wraps the passage in an
// element of that id (<mark id="cite">); the message's locator then has no
// character range. The element is found in the fetched page before it is
// cleaned (an inert parse: nothing runs), two private-use characters are put
// at its edges as text, which the cleaning keeps wherever it keeps the text,
// and their places after it are the {from, to} the panel marks as usual.

const START = '\uE000';
const END = '\uE001';

/** The #fragment of an address, decoded; '' without one. */
export function fragmentOf(url, doc) {
  if (typeof url !== 'string' || !url.includes('#')) return '';
  try {
    return decodeURIComponent(new URL(url, doc?.baseURI || 'http://localhost/').hash.slice(1));
  } catch {
    return '';
  }
}

/** The page with the edges of the element `id` marked, or null when it has none with text. */
export function withSentinels(html, id, doc) {
  if (!id || !html || typeof doc?.defaultView?.DOMParser !== 'function') return null;
  const parsed = new doc.defaultView.DOMParser().parseFromString(html, 'text/html');
  const element = parsed.getElementById(id);
  if (!element || !element.textContent.trim()) return null;
  element.prepend(parsed.createTextNode(START));
  element.append(parsed.createTextNode(END));
  return `<!doctype html>${parsed.documentElement.outerHTML}`;
}

/** Take the edges out of the cleaned text and answer where they were ({from, to}), or null. */
export function takeSentinels(root, doc) {
  const walker = doc.createTreeWalker(root, 4);
  let at = 0;
  let from = null;
  let to = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.data.includes(START) && !node.data.includes(END)) {
      at += node.data.length;
      continue;
    }
    let kept = '';
    for (const char of node.data) {
      if (char === START) { if (from === null) from = at + kept.length; continue; }
      if (char === END) { to = at + kept.length; continue; }
      kept += char;
    }
    node.data = kept;
    at += kept.length;
  }
  return from !== null && to !== null && to > from ? { from, to } : null;
}

// --- a document's target (1.12.0) ------------------------------------------

const DOC_STATES = new Set(['draft', 'ready', 'saved']);
const line = (value) => (typeof value === 'string' ? value.trim() : '');

/** A document (the message's documentOf, with its message) as the panel shows it, or null. */
export function documentTarget(source, documentRef) {
  const url = sameOrigin(source.preview_url, documentRef);
  if (!url || !line(String(source.document_id ?? ''))) return null;
  return {
    kind: 'document',
    id: String(source.id ?? source.document_id),
    message_id: source.message_id == null ? null : String(source.message_id),
    document_id: String(source.document_id),
    title: line(source.title),
    revision: source.revision ?? null,
    state: DOC_STATES.has(source.state) ? source.state : 'draft',
    preview_url: url,
    form_block: source.form_block == null ? null : String(source.form_block),
    downloads: (Array.isArray(source.downloads) ? source.downloads : [])
      .map((one) => ({ format: line(one?.format), label: line(one?.label) || line(one?.format).toUpperCase(), href: sameOrigin(one?.href ?? one?.url, documentRef) }))
      .filter((one) => one.href && one.label),
    missing: (Array.isArray(source.missing) ? source.missing : [])
      .filter((one) => line(one?.field))
      .map((one) => ({ field: line(one.field), label: line(one.label) || line(one.field), block: one.block == null ? null : String(one.block) })),
  };
}

/** «Черновик · 2 поля не заполнены» */
export function documentMeta(words, target) {
  const state = words(`document.${target.state}`);
  const missing = target.missing.length ? words('document.missing', { count: target.missing.length, n: target.missing.length }) : '';
  return [state, missing].filter(Boolean).join(' · ');
}

const sameOrigin = (value, documentRef) => sameOriginHref(value, documentRef);
