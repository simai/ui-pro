// «Участники» in sf-chat-window: the window extension x-members, read only in
// this version: who is in an open group and with which role, in place of the
// conversation. Asked for when it opens (members.list), all in one answer, up
// to 500 rows, so a row is plain markup (the avatars' class markup, no element
// per row) and the sheet lets the browser skip the rows out of view.
import {iconButton, textButton} from '../../chat-message/js/view/message.js';
import {initialsOf, memberRow} from './start-model.js';

let views = 0;

export class MembersView {
  /** @param {HTMLElement} win  the sf-chat-window that shows it */
  constructor(win) {
    this.win = win;
    this.open = false;
    this.state = 'idle';     // idle | loading | ready | denied | error
    this.members = [];
    this.conversation = null; // whose members are being shown
    this.asked = 0;           // the latest request: an older answer is dropped
    this.opener = null;
  }

  get ctx() { return this.win.ctx; }
  get words() { return this.win.words; }

  build(headingTag) {
    const ctx = this.ctx;
    const doc = ctx.document;
    const id = `chat-members-${++views}`;
    this.headingLevel = Number(headingTag.slice(1));
    const command = textButton(ctx, {label: this.words('members.open'), appearance: 'ghost', scheme: 'on-surface', icon: 'group', className: 'chat-shell__members-open'});
    command.hidden = true;
    command.setAttribute('aria-controls', id);
    command.addEventListener('click', () => this.win.openMembers({opener: command}));
    const root = doc.createElement('section');
    root.className = 'chat-members';
    root.id = id;
    root.hidden = true;
    root.setAttribute('aria-labelledby', `${id}-title`);
    const head = doc.createElement('div');
    head.className = 'chat-members__head';
    const back = iconButton(ctx, {icon: 'arrow_back', label: this.words('members.back'), size: '1', className: 'chat-members__back'});
    back.addEventListener('click', () => this.win.closeMembers());
    const title = doc.createElement(headingTag);
    title.className = 'chat-members__title';
    title.id = `${id}-title`;
    title.tabIndex = -1;
    title.textContent = this.words('members.open');
    const count = doc.createElement('span');
    count.className = 'chat-members__count';
    head.append(back, title, count);
    const body = doc.createElement('div');
    body.className = 'chat-members__body';
    const status = doc.createElement('p');
    status.className = 'sf-chat-offscreen';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.append(head, body, status);
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      this.win.closeMembers();
    });
    root.addEventListener('sf-empty-state-action', () => this.win.loadMembers());
    Object.assign(this, {command, root, title, count, body, status});
    return this;
  }

  say(text) {
    this.status.textContent = '';
    requestAnimationFrame(() => { this.status.textContent = text; });
  }

  countText(count) {
    return this.win.sfWord('members-count', {count});
  }

  draw() {
    const doc = this.ctx.document;
    this.body.setAttribute('aria-busy', String(this.state === 'loading'));
    this.count.textContent = this.state === 'ready' ? this.countText(this.members.length) : '';
    if (this.state === 'loading') {
      this.body.replaceChildren(this.line(this.words('members.loading')));
      return;
    }
    if (this.state === 'denied') {
      // Only this: why is the host's and is not said.
      this.body.replaceChildren(this.line(this.words('members.denied')));
      return;
    }
    if (this.state === 'error') {
      const state = doc.createElement('sf-empty-state');
      state.setAttribute('kind', 'error');
      state.setAttribute('size', '1');
      state.setAttribute('heading', this.words('members.failed'));
      state.setAttribute('text', this.words('error.load'));
      state.setAttribute('heading-level', String(Math.min(6, this.headingLevel + 1)));
      state.setAttribute('live', 'off');
      this.body.replaceChildren(state);
      return;
    }
    const list = doc.createElement('ul');
    list.className = 'chat-members__list';
    list.setAttribute('aria-labelledby', this.title.id);
    const rows = doc.createDocumentFragment();
    for (const one of this.members) rows.append(this.row(memberRow(one)));
    list.append(rows);
    this.body.replaceChildren(list);
  }

  line(text) {
    const line = this.ctx.document.createElement('p');
    line.className = 'chat-members__line';
    line.textContent = text;
    return line;
  }

  row({id, name, role}) {
    const doc = this.ctx.document;
    const item = doc.createElement('li');
    item.className = 'chat-members__row';
    item.dataset.id = String(id);
    const avatar = doc.createElement('span');
    avatar.className = 'sf-avatar sf-avatar--size-1/2 sf-avatar--text inline-flex flex-none items-cross-center content-main-center overflow-hidden';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initialsOf(name);
    const label = doc.createElement('span');
    label.className = 'chat-members__name';
    label.textContent = name;
    label.title = name;
    item.append(avatar, label);
    if (role) {
      const word = doc.createElement('span');
      word.className = 'chat-members__role';
      word.textContent = this.words(role);
      item.append(word);
    }
    return item;
  }
}
