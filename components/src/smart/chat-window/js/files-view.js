// «Мои файлы» in sf-chat-window: the window extension x-my-files (Mirai24
// API.md v1.1 §1.5), shown in the main area in place of the conversation.
//
// The host gives `my_files` {files, used_bytes, quota_bytes}; each file has
// the host's own download address, and the window never builds one. The
// window asks for the list when the view opens (open {kind: files}) and for a
// delete when it is confirmed (delete {kind: file}); how much is used and
// whether a delete is allowed is the server's, shown as it comes.
//
// Framework parts: the usage is sf-progress-bar, an empty list and a list that
// did not load are sf-empty-state (its «Повторить»), the actions are sf-button
// markup (a real <a download> for «Скачать»). The rows are plain markup (the
// Framework's repeats-are-light-markup), and «Удалить» asks in its row rather
// than in sf-modal, which renders its content as copied HTML in a portal
// (SPEC §6, no_fit).
//
// Moved with the window from simai/ui-chat (D31 step 6); the drawing helpers
// and formatBytes are sf-chat-message's (js/view/message.js), imported by
// relative path as the message imports the composer's chip.
import {formatBytes, iconButton, iconNode, textButton} from '../../chat-message/js/view/message.js';

let views = 0;

export class FilesView {
  /** @param {HTMLElement} win  the sf-chat-window that shows it */
  constructor(win) {
    this.win = win;
    this.open = false;
    this.state = 'idle';     // idle | loading | ready | error
    this.reason = '';        // the server's words for a list that did not load
    this.asking = null;      // the id of the file whose delete is being asked
    this.removing = null;    // the id of the file being deleted
    this.problem = null;     // {id, text}: a delete the server refused
  }

  get ctx() { return this.win.ctx; }
  get words() { return this.win.words; }

  /**
   * The entry under the conversations (the list's footer, after «Архив», in
   * the list's own row style) and the view for the main area.
   */
  build(headingTag) {
    const ctx = this.ctx;
    const doc = ctx.document;
    const id = `chat-files-${++views}`;
    this.headingLevel = Number(headingTag.slice(1));

    const entry = doc.createElement('button');
    entry.type = 'button';
    entry.className = 'sf-thread-list__command chat-files__entry';
    entry.dataset.action = 'my-files';
    entry.setAttribute('aria-controls', id);
    const label = doc.createElement('span');
    label.textContent = this.words('files.entry');
    entry.append(iconNode(ctx, 'folder_open', '', '2'), label);
    entry.addEventListener('click', () => this.win.openFiles());

    const root = doc.createElement('section');
    root.className = 'chat-files';
    root.id = id;
    root.hidden = true;
    root.setAttribute('aria-labelledby', `${id}-title`);
    const head = doc.createElement('div');
    head.className = 'chat-files__head';
    const back = iconButton(ctx, { icon: 'arrow_back', label: this.words('files.back'), size: '1' });
    back.classList.add('chat-files__back');
    back.addEventListener('click', () => this.win.closeFiles());
    const title = doc.createElement(headingTag);
    title.className = 'chat-files__title';
    title.id = `${id}-title`;
    title.tabIndex = -1;
    title.textContent = this.words('files.title');
    head.append(back, title);

    const usage = doc.createElement('div');
    usage.className = 'chat-files__usage';
    usage.hidden = true;
    const used = doc.createElement('p');
    used.className = 'chat-files__used';
    const bar = doc.createElement('sf-progress-bar');
    bar.className = 'chat-files__bar';
    bar.setAttribute('size', '1/2');
    bar.setAttribute('label', this.words('files.usage'));
    usage.append(used, bar);

    const body = doc.createElement('div');
    body.className = 'chat-files__body';
    // What happened, said once: the count after a load, a delete done.
    const status = doc.createElement('p');
    status.className = 'sf-chat-offscreen';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.append(head, usage, body, status);

    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.asking != null && !this.removing) this.cancelAsk();
      else this.win.closeFiles();
    });
    root.addEventListener('sf-empty-state-action', () => this.win.loadFiles());

    Object.assign(this, { entry, root, title, usage, used, bar, body, status });
    return this;
  }

  say(text) {
    // Emptied first, so the same words twice are said twice.
    this.status.textContent = '';
    requestAnimationFrame(() => { this.status.textContent = text; });
  }

  // --- drawing -----------------------------------------------------------------

  draw(data) {
    const ctx = this.ctx;
    const doc = ctx.document;
    this.body.setAttribute('aria-busy', String(this.state === 'loading'));
    if (this.state === 'loading' && !data) {
      this.usage.hidden = true;
      const line = doc.createElement('p');
      line.className = 'chat-files__loading';
      line.textContent = this.words('files.loading');
      this.body.replaceChildren(line);
      return;
    }
    if (this.state === 'error') {
      this.usage.hidden = true;
      this.body.replaceChildren(this.emptyState('error', this.words('files.error'), this.reason || this.words('error.load')));
      return;
    }
    if (!data) { this.body.replaceChildren(); return; }
    this.drawUsage(data);
    const files = data.files || [];
    if (!files.length) {
      this.body.replaceChildren(this.emptyState('no-data', this.words('files.empty'), this.words('files.emptyText'), 'folder_open'));
      return;
    }
    const list = doc.createElement('ul');
    list.className = 'chat-files__list';
    list.setAttribute('aria-labelledby', this.title.id);
    list.append(...files.map((file) => this.row(file)));
    this.body.replaceChildren(list);
  }

  emptyState(kind, title, text, icon = '') {
    const state = this.ctx.document.createElement('sf-empty-state');
    state.setAttribute('kind', kind);
    state.setAttribute('size', '1');
    state.setAttribute('title', title);
    state.setAttribute('text', text);
    state.setAttribute('heading-level', String(Math.min(6, this.headingLevel + 1)));
    if (icon) state.setAttribute('icon', icon);
    // The error is said by the view (its status), not twice.
    state.setAttribute('live', 'off');
    return state;
  }

  // «Занято 12,4 МБ из 1 ГБ» and the bar: the server's numbers, read.
  drawUsage(data) {
    const { locale } = this.ctx;
    const used = Number(data.used_bytes);
    const quota = Number(data.quota_bytes);
    if (!Number.isFinite(used)) { this.usage.hidden = true; return; }
    this.usage.hidden = false;
    const usedText = formatBytes(used, this.words, locale);
    const text = Number.isFinite(quota) && quota > 0
      ? this.words('files.used', { used: usedText, quota: formatBytes(quota, this.words, locale) })
      : usedText;
    this.used.textContent = text;
    this.bar.hidden = !(Number.isFinite(quota) && quota > 0);
    if (this.bar.hidden) return;
    const percent = Math.min(100, Math.max(0, (used / quota) * 100));
    this.bar.setAttribute('value', String(Number(percent.toFixed(1))));
    this.bar.setAttribute('value-text', text);
  }

  row(file) {
    const ctx = this.ctx;
    const doc = ctx.document;
    const words = this.words;
    const item = doc.createElement('li');
    item.className = 'chat-files__item';
    item.dataset.id = String(file.id);
    const icon = doc.createElement('span');
    icon.className = 'chat-files__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.append(iconNode(ctx, 'description', '', '2'));
    const text = doc.createElement('div');
    text.className = 'chat-files__text';
    const name = doc.createElement('span');
    name.className = 'chat-files__name';
    name.title = file.name;
    name.textContent = file.name;
    const meta = doc.createElement('span');
    meta.className = 'chat-files__meta';
    const facts = [file.size != null ? formatBytes(file.size, words, ctx.locale) : '', this.date(file.created_at)].filter(Boolean);
    const plain = doc.createElement('span');
    plain.textContent = facts.join(' · ');
    meta.append(plain);
    if (file.saved_to_base) {
      const saved = doc.createElement('span');
      saved.className = 'chat-files__saved';
      saved.append(iconNode(ctx, 'library_add_check', '', '1'), doc.createTextNode(words('files.saved')));
      meta.append(saved);
    }
    text.append(name, meta);
    item.append(icon, text);

    const asking = String(this.asking) === String(file.id);
    if (!asking) {
      item.append(this.actions(file));
      return item;
    }
    item.classList.add('chat-files__item--asking');
    item.append(this.question(file));
    return item;
  }

  actions(file) {
    const ctx = this.ctx;
    const doc = ctx.document;
    const words = this.words;
    const actions = doc.createElement('div');
    actions.className = 'chat-files__actions';
    if (file.download_url) {
      const download = doc.createElement('a');
      download.className = 'sf-button sf-button--size-1/2 sf-button--ghost sf-button--on-surface flex items-cross-center content-main-center chat-files__download';
      download.href = file.download_url;
      download.setAttribute('download', file.name || '');
      download.setAttribute('aria-label', words('files.downloadLabel', { name: file.name }));
      const label = doc.createElement('span');
      label.className = 'sf-button-text-container';
      label.textContent = words('files.download');
      download.append(iconNode(ctx, 'download', '', '1'), label);
      actions.append(download);
    }
    const remove = textButton(ctx, { label: words('files.delete'), appearance: 'ghost', scheme: 'on-surface', icon: 'delete', className: 'chat-files__delete' });
    remove.setAttribute('aria-label', words('files.deleteLabel', { name: file.name }));
    remove.addEventListener('click', () => this.ask(file.id));
    actions.append(remove);
    return actions;
  }

  // The delete asked in its row: what goes and what stays, then the answer.
  question(file) {
    const ctx = this.ctx;
    const doc = ctx.document;
    const words = this.words;
    const busy = String(this.removing) === String(file.id);
    const box = doc.createElement('div');
    box.className = 'chat-files__ask';
    box.tabIndex = -1;
    box.setAttribute('role', 'group');
    const askId = `${this.root.id}-ask`;
    box.setAttribute('aria-labelledby', askId);
    const question = doc.createElement('p');
    question.className = 'chat-files__question';
    question.id = askId;
    question.textContent = words('files.deleteAsk', { name: file.name });
    box.append(question);
    if (this.problem && String(this.problem.id) === String(file.id)) {
      const problem = doc.createElement('p');
      problem.className = 'chat-files__problem';
      problem.setAttribute('role', 'alert');
      problem.textContent = this.problem.text;
      box.append(problem);
    }
    const buttons = doc.createElement('div');
    buttons.className = 'chat-files__ask-actions';
    const confirm = textButton(ctx, { label: busy ? words('files.deleting') : words('files.delete'), appearance: 'default', scheme: 'error', className: 'chat-files__confirm' });
    const cancel = textButton(ctx, { label: words('files.cancel'), appearance: 'ghost', scheme: 'on-surface', className: 'chat-files__cancel' });
    confirm.disabled = busy;
    cancel.disabled = busy;
    confirm.addEventListener('click', () => this.win.removeFile(file.id));
    cancel.addEventListener('click', () => this.cancelAsk());
    buttons.append(confirm, cancel);
    box.append(buttons);
    return box;
  }

  date(value) {
    const date = new Date(value);
    if (value == null || Number.isNaN(date.getTime())) return '';
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat(this.ctx.locale, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(date);
  }

  // --- asking -------------------------------------------------------------------

  ask(id) {
    this.asking = id;
    this.problem = null;
    this.win.drawFiles();
    // «Отмена» first: a delete is never one press of Enter away.
    this.rowOf(id)?.querySelector('.chat-files__cancel')?.focus();
  }

  cancelAsk() {
    const id = this.asking;
    this.asking = null;
    this.problem = null;
    this.win.drawFiles();
    this.rowOf(id)?.querySelector('.chat-files__delete')?.focus();
  }

  rowOf(id) {
    if (id == null) return null;
    return this.body.querySelector(`.chat-files__item[data-id="${CSS.escape(String(id))}"]`);
  }
}
