// The source preview in sf-chat-window (1.2.0): a source of an answer, or a
// file the answer made, shown beside the conversation at its inline end
// (API.md v1.3, proposed: sources[].preview_url, locator, mime; an answer's
// attachments[].preview_url). On a narrow window it covers the conversation
// as a full-height sheet with «Назад».
//
// The message asks (sf-chat-message-open {kind: preview, source}); the window
// opens the panel, says so (sf-chat-window-open {kind: preview}, which a page
// may cancel) and cancels the message's event, so the footnote does not open
// the list as well. Only the page's own origin is ever loaded: the source is
// read through chat-message's proposed.js, which keeps a same-origin
// preview_url and nothing else.
//
// What it shows. HTML (the material's accepted revision, whole or a fragment
// around the passage; Mirai24's only type for now) is fetched once with the
// page's cookies and drawn through SF.sanitizeHtml, never run: the cleaned
// markup is the chat's own (paragraphs, lists, tables, links), and the
// passage {from, to} -- characters of that text as drawn -- is marked and
// brought into view. Plain text is drawn as text. A PDF is the browser's
// viewer in a frame of the same origin (at its {page}); anything else is
// offered in a new tab. sf-file-preview (the Framework's file row: an icon,
// a name, download and remove) shows no content, so it is not used here.
import {iconButton, iconNode, text, textButton} from '../../chat-message/js/view/message.js';
import {previewTarget} from '../../chat-message/js/view/proposed.js';

let views = 0;

// The conversation needs this much room beside the panel; less, and the
// panel is a sheet over it.
export const PREVIEW_DOCK_MIN = 900;

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
    root.className = 'chat-shell__preview chat-preview';
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

    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      this.win.closePreview();
    });
    Object.assign(this, { root, head, back, title, meta, tab, close, body, status });
    return this;
  }

  say(value) {
    this.status.textContent = '';
    requestAnimationFrame(() => { this.status.textContent = value; });
  }

  /** The source as the panel shows it, or null for one it may not load. */
  targetOf(source) {
    if (!source || typeof source !== 'object') return null;
    return previewTarget(source, {
      n: source.n ?? null, kind: source.kind || '', title: source.title || source.name || '', href: source.href || null,
    }, this.ctx.document);
  }

  /** Draw the source's head and load what it shows. */
  show(target) {
    this.source = target;
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
      frame.src = target.locator?.page ? `${target.preview_url}#page=${target.locator.page}` : target.preview_url;
      frame.setAttribute('referrerpolicy', 'same-origin');
      this.body.replaceChildren(frame);
      this.say(this.words('preview.opened', { title: this.title.textContent }));
      return;
    }
    if (!type || type.includes('html')) {
      const markup = doc.createElement('div');
      markup.className = 'sf-chat-markup chat-preview__text';
      markup.append(globalThis.SF.sanitizeHtml(content ?? '', { document: doc }));
      this.body.replaceChildren(markup);
      this.mark(markup, target.locator);
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
    const reduce = doc.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => marks[0].scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }));
    this.say(`${opened}. ${this.words('preview.marked')}`);
  }

  clear() {
    this.loading++;
    this.source = null;
    this.body.replaceChildren();
    this.title.textContent = '';
    this.meta.textContent = '';
    this.tab.removeAttribute('href');
  }
}
