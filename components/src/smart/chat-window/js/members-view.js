// «Участники» in sf-chat-window: the window extension x-members, who is in an
// open group and with which role, in place of the conversation. Asked for when
// it opens (members.list), all in one answer, up to 500 rows, so a row is plain
// markup (the avatars' class markup, no element per row) and the sheet lets the
// browser skip the rows out of view.
//
// With x-members-manage (1.9.0) the same view manages the group: «Добавить» and
// «Выйти» in its head, and on a row a «⋯» that opens one strip under that row at
// a time (role, remove, hand over), so 500 rows carry one button each, not three.
// What is offered is what the host's flags say (js/members-model.js); what cannot
// be taken back is asked in place first, with what follows from it.
import {iconButton, textButton} from '../../chat-message/js/view/message.js';
import {groupLimits, initialsOf, memberRow, personItem} from './start-model.js';
import {ASSIGNABLE_ROLES, CONFIRMED, excludeOf, headActions, memberOutcome, rowActions} from './members-model.js';

let views = 0;

const defined = (...tags) => Promise.all(tags.map((tag) => customElements.whenDefined(tag)));

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
    this.strip = null;        // the row whose strip is open: {id, ask} (ask: an action asked about)
    this.adding = false;      // the add box stands under the head
    this.pending = new Set(); // what is on its way: 'add', 'leave', or a row's id
    this.problem = null;      // the last refusal's line: {word, retry}
  }

  get ctx() { return this.win.ctx; }
  get words() { return this.win.words; }
  get managing() { return this.win.has('x-members-manage'); }

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
    // «Добавить» and «Выйти»: only with x-members-manage and the conversation's flags.
    const tools = doc.createElement('div');
    tools.className = 'chat-members__tools';
    head.append(back, title, count, tools);
    const line = doc.createElement('div');
    line.className = 'chat-members__problem';
    const add = doc.createElement('div');
    add.className = 'chat-members__add';
    add.hidden = true;
    const body = doc.createElement('div');
    body.className = 'chat-members__body';
    const status = doc.createElement('p');
    status.className = 'sf-chat-offscreen';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.append(head, line, add, body, status);
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      // A strip or the add box goes first; then the view.
      if (this.strip) return this.closeStrip({focus: true});
      if (this.adding) return this.closeAdd({focus: true});
      this.win.closeMembers();
    });
    root.addEventListener('sf-empty-state-action', () => this.win.loadMembers());
    Object.assign(this, {command, root, title, count, tools, line, add, body, status});
    return this;
  }

  /** Forget what was being done: the view closed or shows another group. */
  reset() {
    this.strip = null;
    this.adding = false;
    this.pending.clear();
    this.problem = null;
    this.add.hidden = true;
    this.add.replaceChildren();
    this.line.replaceChildren();
    this.tools.replaceChildren();
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
    this.drawTools();
    this.drawProblem();
    if (this.state === 'loading') {
      this.body.replaceChildren(this.lineOf(this.words('members.loading')));
      return;
    }
    if (this.state === 'denied') {
      // Only this: why is the host's and is not said.
      this.body.replaceChildren(this.lineOf(this.words('members.denied')));
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
    for (const one of this.members) rows.append(this.row(one));
    list.append(rows);
    this.body.replaceChildren(list);
  }

  lineOf(text) {
    const line = this.ctx.document.createElement('p');
    line.className = 'chat-members__line';
    line.textContent = text;
    return line;
  }

  // --- the head: «Добавить», «Выйти» -------------------------------------------

  drawTools() {
    this.tools.replaceChildren();
    if (!this.managing || this.state !== 'ready') return;
    const offered = headActions(this.win._data.conversation);
    if (offered.includes('add')) {
      const add = textButton(this.ctx, {label: this.words('members.add'), appearance: 'ghost', scheme: 'primary', icon: 'person_add', className: 'chat-members__tool chat-members__add-open'});
      add.setAttribute('aria-expanded', String(this.adding));
      this.busy(add, this.pending.has('add'));
      add.addEventListener('click', () => (this.adding ? this.closeAdd({focus: false}) : this.openAdd()));
      this.tools.append(add);
    }
    if (offered.includes('leave')) {
      const leave = textButton(this.ctx, {label: this.words('members.leave'), appearance: 'ghost', scheme: 'on-surface', icon: 'logout', className: 'chat-members__tool chat-members__leave'});
      this.busy(leave, this.pending.has('leave'));
      leave.addEventListener('click', () => this.ask('leave', null));
      this.tools.append(leave);
    }
  }

  // A pressed button waits for its answer; a second press sends nothing.
  busy(button, on) {
    button.toggleAttribute('aria-busy', on);
    button.classList.toggle('chat-members__busy', on);
    if (on) button.setAttribute('aria-disabled', 'true'); else button.removeAttribute('aria-disabled');
  }

  // --- a row and its strip ------------------------------------------------------

  row(one) {
    const doc = this.ctx.document;
    const {id, name, role} = memberRow(one);
    const item = doc.createElement('li');
    item.className = 'chat-members__row';
    item.dataset.id = String(id);
    const line = doc.createElement('div');
    line.className = 'chat-members__who';
    const avatar = doc.createElement('span');
    avatar.className = 'sf-avatar sf-avatar--size-1/2 sf-avatar--text inline-flex flex-none items-cross-center content-main-center overflow-hidden';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initialsOf(name);
    const label = doc.createElement('span');
    label.className = 'chat-members__name';
    label.textContent = name;
    label.title = name;
    line.append(avatar, label);
    if (role) {
      const word = doc.createElement('span');
      word.className = 'chat-members__role';
      word.textContent = this.words(role);
      line.append(word);
    }
    item.append(line);
    const actions = this.managing ? rowActions(one) : [];
    if (actions.length) {
      const open = String(this.strip?.id) === String(id);
      const more = iconButton(this.ctx, {icon: 'more_horiz', label: this.win.sfWord('members-actions', {vars: {name}}), size: '1', className: 'chat-members__more'});
      more.setAttribute('aria-expanded', String(open));
      this.busy(more, this.pending.has(String(id)));
      more.addEventListener('click', () => (open ? this.closeStrip({focus: true}) : this.openStrip(one)));
      line.append(more);
      if (open) item.append(this.stripOf(one, actions));
    }
    return item;
  }

  openStrip(one) {
    if (this.pending.has(String(one.id))) return;
    this.strip = {id: one.id, ask: null};
    this.redraw(() => this.stripNode()?.querySelector('button'));
  }

  closeStrip({focus = false} = {}) {
    const id = this.strip?.id;
    this.strip = null;
    this.redraw(focus ? () => this.moreOf(id) : null);
  }

  // The strip under a row: the actions its flags allow, or the question asked.
  stripOf(one, actions) {
    const doc = this.ctx.document;
    const strip = doc.createElement('div');
    strip.className = 'chat-members__strip';
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', this.win.sfWord('members-actions', {vars: {name: one.name ?? ''}}));
    const waiting = this.pending.has(String(one.id));
    if (this.strip.ask) {
      strip.append(...this.question(this.strip.ask, one));
      return strip;
    }
    if (actions.includes('role')) {
      const roles = doc.createElement('div');
      roles.className = 'chat-members__roles';
      roles.setAttribute('role', 'group');
      roles.setAttribute('aria-label', this.words('members.role-change'));
      for (const role of ASSIGNABLE_ROLES) {
        const current = one.role === role;
        const button = textButton(this.ctx, {label: this.words(`members.role.${role}`), appearance: current ? 'tonal' : 'ghost', scheme: 'on-surface', className: 'chat-members__role-pick'});
        button.setAttribute('aria-pressed', String(current));
        this.busy(button, waiting);
        if (!current) button.addEventListener('click', () => this.act('member.role', one, {role}));
        roles.append(button);
      }
      strip.append(roles);
    }
    if (actions.includes('remove')) {
      const remove = textButton(this.ctx, {label: this.words('members.remove'), appearance: 'ghost', scheme: 'primary', className: 'chat-members__remove'});
      this.busy(remove, waiting);
      remove.addEventListener('click', () => this.ask('remove', one));
      strip.append(remove);
    }
    if (actions.includes('transfer')) {
      const transfer = textButton(this.ctx, {label: this.words('members.transfer'), appearance: 'ghost', scheme: 'on-surface', className: 'chat-members__transfer'});
      this.busy(transfer, waiting);
      transfer.addEventListener('click', () => this.ask('transfer', one));
      strip.append(transfer);
    }
    return strip;
  }

  // In place, as the question before deleting a message: what, what follows, yes or no.
  question(action, one) {
    const doc = this.ctx.document;
    const text = doc.createElement('p');
    text.className = 'chat-members__ask';
    const what = doc.createElement('strong');
    what.textContent = this.words(`members.ask-${action}`);
    const then = doc.createElement('span');
    then.textContent = this.words(`members.then-${action}`);
    text.append(what, ' ', then);
    const yes = textButton(this.ctx, {label: this.words(`members.yes-${action}`), appearance: 'default', scheme: 'primary', className: 'chat-members__yes'});
    const no = textButton(this.ctx, {label: this.words('members.cancel'), appearance: 'ghost', scheme: 'on-surface', className: 'chat-members__no'});
    const waiting = this.pending.has(action === 'leave' ? 'leave' : String(one?.id));
    this.busy(yes, waiting);
    const intent = {remove: 'member.remove', transfer: 'member.transfer', leave: 'member.leave'}[action];
    yes.addEventListener('click', () => this.act(intent, one));
    no.addEventListener('click', () => (action === 'leave' ? this.closeLeave() : this.closeStrip({focus: true})));
    const row = doc.createElement('div');
    row.className = 'chat-members__ask-row';
    row.append(yes, no);
    return [text, row];
  }

  ask(action, one) {
    if (!CONFIRMED.includes(action)) return;
    if (action === 'leave') {
      this.strip = {id: null, ask: 'leave'};
      this.drawLeave();
      this.focusIn(this.root.querySelector('.chat-members__leave-ask .chat-members__no'));
      return;
    }
    this.strip = {id: one.id, ask: action};
    this.redraw(() => this.stripNode()?.querySelector('.chat-members__no'));
  }

  // «Выйти» asks under the head, not under a row: it is the reader's own row.
  drawLeave() {
    this.root.querySelector('.chat-members__leave-ask')?.remove();
    if (this.strip?.ask !== 'leave') return;
    const box = this.ctx.document.createElement('div');
    box.className = 'chat-members__strip chat-members__leave-ask';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', this.words('members.leave'));
    box.append(...this.question('leave', null));
    this.line.before(box);
  }

  closeLeave() {
    this.strip = null;
    this.drawLeave();
    this.focusIn(this.tools.querySelector('.chat-members__leave'));
  }

  // --- adding: the same people picker as a new group ---------------------------

  openAdd() {
    if (this.pending.has('add')) return;
    this.adding = true;
    const doc = this.ctx.document;
    const warn = doc.createElement('p');
    warn.className = 'chat-members__warn';
    warn.textContent = this.words('members.add-warning');
    const lookup = doc.createElement('sf-lookup');
    lookup.className = 'chat-members__people';
    const limits = groupLimits(this.win._data.limits?.group);
    for (const [name, value] of Object.entries({
      size: '1', label: this.words('members.add-label'), placeholder: this.words('start.placeholder'),
      'min-length': String(limits.search_min), 'max-results': String(limits.search_max), maxlength: String(limits.query_chars),
    })) lookup.setAttribute(name, value);
    lookup.addEventListener('change', (event) => {
      const item = event.detail?.item ?? event.detail?.value;
      const id = item?.value ?? item?.id;
      if (event.detail?.action === 'removed' || id === undefined || id === null) return;
      this.act('member.add', {id, name: item.label ?? ''});
    });
    const done = textButton(this.ctx, {label: this.words('members.add-done'), appearance: 'ghost', scheme: 'on-surface', className: 'chat-members__add-done'});
    done.addEventListener('click', () => this.closeAdd({focus: true}));
    this.add.replaceChildren(warn, lookup, done);
    this.add.hidden = false;
    this.drawTools();
    defined('sf-lookup').then(() => {
      if (!this.adding || !lookup.isConnected) return;
      customElements.upgrade(this.add);
      lookup.provider = (query, options) => this.search(query, options);
      lookup.exclude = excludeOf(this.members, this.win._data.me?.id);
      this.win.afterDraw(() => lookup.querySelector('input'), (input) => input?.focus());
    });
  }

  closeAdd({focus = false} = {}) {
    this.adding = false;
    this.add.hidden = true;
    this.add.replaceChildren();
    this.drawTools();
    if (focus) this.focusIn(this.tools.querySelector('.chat-members__add-open'));
  }

  async search(query, {signal} = {}) {
    const result = await this.win.request('recipients.search', {query});
    if (signal?.aborted || !this.adding) return {items: []};
    if (result?.answer !== 'applied') return {status: 'unavailable'};
    const given = Array.isArray(result.data?.items) ? result.data.items : [];
    return {items: given.filter((one) => one && one.id !== null && one.id !== undefined).map(personItem)};
  }

  // --- one action, its answer ---------------------------------------------------

  async act(intent, one, extra = {}) {
    const key = intent === 'member.add' ? 'add' : intent === 'member.leave' ? 'leave' : String(one?.id);
    if (this.pending.has(key)) return;
    this.pending.add(key);
    this.problem = null;
    this.redraw();
    const conversation = this.win._data.conversation?.id ?? null;
    const payload = intent === 'member.leave'
      ? {conversation_id: conversation}
      : {conversation_id: conversation, user_id: one?.id, ...extra};
    const asked = this.asked;
    const result = await this.win.request(intent, payload);
    this.pending.delete(key);
    if (!this.open || asked !== this.asked) return;
    const outcome = memberOutcome(intent, result);
    if (outcome.state === 'left') {
      this.say(this.words('members.left'));
      this.win.leftGroup();
      return;
    }
    if (outcome.state === 'removed') {
      const gone = String(outcome.id ?? one?.id);
      this.members = this.members.filter((member) => String(member.id) !== gone);
      this.strip = null;
      this.redraw(() => this.title);
      this.say(this.win.sfWord('members-removed', {vars: {name: one?.name ?? ''}}));
      return;
    }
    if (outcome.state === 'roster') {
      if (outcome.participants) this.members = outcome.participants;
      if (intent !== 'member.add') this.strip = null;
      this.redraw(intent === 'member.add' ? null : () => this.moreOf(one?.id) ?? this.title);
      if (intent === 'member.add') {
        const lookup = this.add.querySelector('sf-lookup');
        if (lookup) {
          lookup.value = null;
          lookup.exclude = excludeOf(this.members, this.win._data.me?.id);
        }
        this.say(this.win.sfWord('members-added', {vars: {name: one?.name ?? ''}}));
      } else {
        this.say(this.words(intent === 'member.transfer' ? 'members.transferred' : 'members.role-changed'));
      }
      return;
    }
    if (!outcome.word) {
      this.redraw();
      return;
    }
    this.problem = {word: outcome.word, retry: outcome.retry ? () => this.act(intent, one, extra) : null};
    if (intent === 'member.leave') this.strip = null;
    this.redraw();
    this.say(this.words(outcome.word));
    if (outcome.reload) this.win.loadMembers();
  }

  drawProblem() {
    this.line.replaceChildren();
    if (!this.problem) return;
    const doc = this.ctx.document;
    const box = doc.createElement('div');
    box.className = 'sf-chat-notice sf-chat-notice--failed chat-members__notice';
    box.setAttribute('role', 'alert');
    const words = doc.createElement('p');
    words.className = 'sf-chat-notice__text';
    words.textContent = this.words(this.problem.word);
    box.append(words);
    if (this.problem.retry) {
      const again = doc.createElement('button');
      again.type = 'button';
      again.className = 'sf-chat-notice__action';
      again.textContent = this.words('action.retry');
      again.addEventListener('click', this.problem.retry);
      box.append(again);
    }
    this.line.append(box);
  }

  // --- drawing again, keeping the focus where it belongs ------------------------

  redraw(focusOn = null) {
    const scroller = this.root;
    const top = scroller.scrollTop;
    this.draw();
    this.drawLeave();
    scroller.scrollTop = top;
    if (focusOn) this.focusIn(focusOn());
  }

  focusIn(node) {
    if (node && typeof node.focus === 'function') node.focus({preventScroll: false});
  }

  rowNode(id) {
    return id === null || id === undefined ? null : this.body.querySelector(`.chat-members__row[data-id="${CSS.escape(String(id))}"]`);
  }

  moreOf(id) {
    return this.rowNode(id)?.querySelector('.chat-members__more') ?? null;
  }

  stripNode() {
    return this.rowNode(this.strip?.id)?.querySelector('.chat-members__strip') ?? null;
  }
}
