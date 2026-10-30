// «Новый диалог» and «Новая группа» in sf-chat-window: the window extension
// x-conversation-start, a form in the main area in place of the conversation,
// as «Мои файлы» stand there (files-view.js).
//
// The people are found by the Framework's sf-lookup, whose provider asks the
// host (recipients.search); the title is sf-input and «Создать» sf-button, its
// loading state is what a second press meets. What may be found and created is
// the host's: the form only says what the host answered. A form lives as long
// as it is shown: closing it forgets what was typed.
import {iconButton} from '../../chat-message/js/view/message.js';
import {GroupKey, checkGroup, groupLimits, searchOutcome, startOutcome} from './start-model.js';

let views = 0;

// A form cannot wait for ever (a promise the host never settles would hold it
// shut): this long without an answer is «no answer», with «Повторить». An answer
// that comes later still opens the conversation while the form stands idle.
const ANSWER_WAIT_MS = 30000;

const defined = (...tags) => Promise.all(tags.map((tag) => customElements.whenDefined(tag)));

export class StartView {
  /**
   * @param {HTMLElement} win  the sf-chat-window that shows it
   * @param {() => string} mintKey  makes a client_key
   */
  constructor(win, mintKey) {
    this.win = win;
    this.mintKey = mintKey;
    this.open = false;
    this.form = null;    // what stands on the page: {kind, sending, key, ...}
    this.opener = null;  // where the focus goes back
  }

  get ctx() { return this.win.ctx; }
  get words() { return this.win.words; }

  build(headingTag) {
    const doc = this.ctx.document;
    const id = `chat-start-${++views}`;
    const root = doc.createElement('section');
    root.className = 'chat-start';
    root.id = id;
    root.hidden = true;
    root.setAttribute('aria-labelledby', `${id}-title`);
    const head = doc.createElement('div');
    head.className = 'chat-start__head';
    const back = iconButton(this.ctx, {icon: 'arrow_back', label: this.words('start.back'), size: '1', className: 'chat-start__back'});
    back.addEventListener('click', () => this.leave());
    const title = doc.createElement(headingTag);
    title.className = 'chat-start__title';
    title.id = `${id}-title`;
    title.tabIndex = -1;
    head.append(back, title);
    const body = doc.createElement('div');
    body.className = 'chat-start__body';
    const status = doc.createElement('p');
    status.className = 'sf-chat-offscreen';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.append(head, body, status);
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      this.leave();
    });
    Object.assign(this, {root, back, title, body, status});
    return this;
  }

  // Back and Escape: not while an answer is awaited, the form is not closed
  // before it is confirmed.
  leave() {
    if (!this.form?.sending) this.win.closeStart();
  }

  say(text) {
    this.status.textContent = '';
    requestAnimationFrame(() => { this.status.textContent = text; });
  }

  // --- the form ------------------------------------------------------------

  /** A new form of this kind, private or group; the focus goes into its first field. */
  show(kind) {
    const doc = this.ctx.document;
    const words = this.words;
    const limits = groupLimits(this.win._data.limits?.group);
    const group = kind === 'group';
    // The Framework's ladder: its size 2 is the window's touch target.
    const size = globalThis.matchMedia?.('(pointer: coarse)').matches ? '2' : '1';
    const form = {kind, sending: false, done: false, key: new GroupKey(this.mintKey), limits, denied: false};
    this.form = form;
    this.title.textContent = words(group ? 'start.group' : 'start.private');

    const root = doc.createElement('form');
    root.className = 'chat-start__form';
    root.noValidate = true;
    root.addEventListener('submit', (event) => {
      event.preventDefault();
      if (group) this.submit();
    });
    const nodes = [];
    if (group) {
      form.field = doc.createElement('sf-input');
      form.field.className = 'chat-start__name';
      for (const [name, value] of Object.entries({size, label: words('start.name'), maxlength: String(limits.title_chars), autocomplete: 'off'})) form.field.setAttribute(name, value);
      form.field.toggleAttribute('required', true);
      form.field.addEventListener('input', () => this.markName(''));
      nodes.push(form.field);
    }
    const lookup = doc.createElement('sf-lookup');
    lookup.className = 'chat-start__people';
    for (const [name, value] of Object.entries({
      size, label: words(group ? 'start.members' : 'start.person'), placeholder: words('start.placeholder'),
      'min-length': String(limits.search_min), 'max-results': String(limits.search_max), maxlength: String(limits.query_chars),
    })) lookup.setAttribute(name, value);
    if (group) {
      lookup.toggleAttribute('multiple', true);
      lookup.toggleAttribute('required', true);
      lookup.setAttribute('max-items', String(limits.members_max));
    }
    lookup.addEventListener('change', (event) => this.chosen(form, event.detail));
    form.lookup = lookup;
    nodes.push(lookup);
    // The answer's line: what is wrong, and «Повторить» where trying again helps.
    form.line = doc.createElement('div');
    form.line.className = 'chat-start__line';
    form.quiet = doc.createElement('p');
    form.quiet.className = 'chat-start__quiet';
    form.quiet.hidden = true;
    nodes.push(form.line, form.quiet);
    if (group) {
      const actions = doc.createElement('div');
      actions.className = 'chat-start__actions';
      form.create = doc.createElement('sf-button');
      form.create.className = 'chat-start__create';
      form.create.setAttribute('size', size);
      form.create.setAttribute('native-type', 'submit');
      form.create.setAttribute('text', words('start.create'));
      actions.append(form.create);
      nodes.push(actions);
    }
    root.append(...nodes);
    this.body.replaceChildren(root);
    // Attributes go on at once; a property and the focus wait for the element,
    // as the Loader brings it when it is first used.
    const tags = group ? ['sf-lookup', 'sf-input', 'sf-button'] : ['sf-lookup'];
    defined(...tags).then(() => {
      if (this.form !== form) return;
      customElements.upgrade(root);
      lookup.provider = (query, options) => this.search(form, query, options);
      const me = this.win._data.me?.id;
      lookup.exclude = me === null || me === undefined ? [] : [me];
      const active = doc.activeElement;
      if (active === this.title || active === doc.body || !active) this.focusField(form.field ?? lookup);
    });
  }

  // The field's own box: sf-input's host takes no focus (it has no box of its
  // own), and a field just placed draws it a frame later.
  focusField(field) {
    this.win.afterDraw(() => field.querySelector('input'), (input) => input?.focus());
  }

  clear() {
    this.form = null;
    this.body.replaceChildren();
  }

  // sf-lookup's provider. Its signal and its own count drop what is overtaken;
  // the check here says only that nothing older moves the form's lines.
  async search(form, query, {signal} = {}) {
    const result = await this.win.request('recipients.search', {query});
    if (signal?.aborted || this.form !== form) return {items: []};
    const answer = searchOutcome(result, form.limits);
    if (answer.state === 'denied') {
      // The one line, in the form's words; the list says nothing of its own.
      form.denied = true;
      this.showLine(form, this.words('start.denied'));
      form.lookup.close();
      return {status: 'unavailable'};
    }
    if (answer.state === 'failed') {
      if (result?.reason === 'prevented') return {status: 'unavailable'};
      throw new Error('recipients.search');
    }
    if (form.denied) {
      form.denied = false;
      this.showLine(form, '');
    }
    this.noteTruncated(form, answer.truncated);
    return {items: answer.items};
  }

  // «Показаны первые 20. Уточните запрос.»: sf-lookup's own line under the field.
  noteTruncated(form, truncated) {
    const {lookup, limits} = form;
    const text = truncated ? this.win.sfWord('start-truncated', {count: limits.search_max}) : '';
    if ((lookup.getAttribute('hint') || '') === text) return;
    if (text) lookup.setAttribute('hint', text); else lookup.removeAttribute('hint');
    if (text) this.say(text);
  }

  // A choice in the field: a person chosen starts at once.
  chosen(form, {action, value} = {}) {
    if (this.form !== form) return;
    if (form.kind === 'group') {
      this.markMembers('');
      return;
    }
    this.showLine(form, '');
    if (action !== 'removed' && value) this.sendPrivate(form);
  }

  sendPrivate(form) {
    const person = form.lookup.value;
    if (form.sending || !person) return;
    form.person = person;
    this.send(form, {kind: 'private', user_id: person.value});
  }

  // «Создать»: an incomplete form says what is missing and goes to it.
  submit() {
    const form = this.form;
    if (!form || form.kind !== 'group' || form.sending) return;
    const title = String(form.field.value ?? '').trim();
    const members = form.lookup.value || [];
    const wrong = checkGroup({title, members}, form.limits);
    this.markName(wrong.title === 'required' ? this.words('start.nameRequired')
      : wrong.title === 'long' ? this.win.sfWord('start-name-long', {count: form.limits.title_chars}) : '');
    this.markMembers(wrong.members ? this.words('start.membersRequired') : '');
    if (wrong.title || wrong.members) {
      this.focusField(wrong.title ? form.field : form.lookup);
      return;
    }
    const memberIds = members.map((one) => one.value);
    this.send(form, {kind: 'group', title, member_ids: memberIds, client_key: form.key.take(title, memberIds)});
  }

  // conversation.start. The form stays until the host confirms.
  async send(form, payload) {
    form.sending = true;
    this.showLine(form, '');
    this.drawBusy(form);
    let timer = 0;
    let timedOut = false;
    const asked = this.win.request('conversation.start', payload);
    const result = await Promise.race([asked, new Promise((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve({answer: 'unavailable', reason: 'no-answer'});
      }, ANSWER_WAIT_MS);
    })]);
    clearTimeout(timer);
    if (timedOut) {
      asked.then((late) => {
        if (this.form === form && !form.sending && !form.done && startOutcome(late) === 'opened') this.opened(form, late);
      });
    }
    if (this.form !== form) return;
    const outcome = startOutcome(result);
    if (outcome === 'opened') {
      this.opened(form, result);
      return;
    }
    form.sending = false;
    this.drawBusy(form);
    this.refused(form, outcome);
  }

  opened(form, result) {
    form.done = true;
    this.win.startAnswered(result, {person: form.kind === 'private' ? form.person : null});
  }

  // What the host answered is said where it belongs; everything entered stays.
  refused(form, outcome) {
    const words = this.words;
    const group = form.kind === 'group';
    if (outcome === 'silent') return;
    if (outcome === 'denied') {
      this.showLine(form, words('start.denied'));
      this.focusField(form.field ?? form.lookup);
    } else if (outcome === 'recipient' && group) {
      this.markMembers(words('start.recipientGroup'));
      this.focusField(form.lookup);
    } else if (outcome === 'recipient') {
      this.showLine(form, words('start.recipient'));
      this.focusField(form.lookup);
    } else if (outcome === 'group' && group) {
      this.markName(words('start.groupInvalid'));
      this.focusField(form.field);
    } else if (outcome === 'conflict' && group) {
      form.key.reset();
      this.showLine(form, words('start.conflict'));
      this.focusField(form.field);
    } else {
      this.showLine(form, words(group ? 'start.groupFailed' : 'start.privateFailed'), () => (group ? this.submit() : this.sendPrivate(form)));
      form.line.querySelector('button')?.focus();
    }
  }

  // While an answer is awaited nothing entered changes and «Создать» shows it
  // waits; between people a quiet «Открываю…».
  drawBusy(form) {
    const {sending, lookup, field, create, quiet, kind} = form;
    this.back.disabled = sending;
    lookup.toggleAttribute('readonly', sending);
    field?.toggleAttribute('readonly', sending);
    create?.toggleAttribute('loading', sending);
    if (kind === 'private') {
      quiet.hidden = !sending;
      quiet.textContent = sending ? this.words('start.opening') : '';
    }
  }

  showLine(form, text, retry) {
    const doc = this.ctx.document;
    form.line.replaceChildren();
    if (!text) return;
    const box = doc.createElement('div');
    box.className = 'sf-chat-notice sf-chat-notice--failed chat-start__problem';
    box.setAttribute('role', 'alert');
    const words = doc.createElement('p');
    words.className = 'sf-chat-notice__text';
    words.textContent = text;
    box.append(words);
    if (retry) {
      const again = doc.createElement('button');
      again.type = 'button';
      again.className = 'sf-chat-notice__action';
      again.textContent = this.words('action.retry');
      again.addEventListener('click', retry);
      box.append(again);
    }
    form.line.append(box);
  }

  markName(text) {
    this.mark(this.form?.field, text);
  }

  markMembers(text) {
    this.mark(this.form?.lookup, text);
  }

  // The field's own error look and line.
  mark(field, text) {
    if (!field) return;
    field.toggleAttribute('invalid', Boolean(text));
    if (text) field.setAttribute('error-message', text); else field.removeAttribute('error-message');
  }
}
