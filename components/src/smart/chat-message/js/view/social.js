// What people do with a message, in either template (1.4.0, sf-chat-window's
// x-reactions and x-reply): the quote it answers, the reactions under it, the
// tools a hover or a focus shows, the picker of six, and the delete question,
// which a document may ask too. Plain DOM like the rest of the view, and it
// asks the host through ctx.onAction: react {id, emoji, on} | reply {id} |
// quote {id, target} | picker {id, open} | edit-start | delete-ask. Nothing here
// is drawn unless the display says so (canReact, canReply) or the message has
// reply_to or reactions, so a message without them draws as it did.
import {element, iconButton, text} from './message.js';

/** The six a reaction is chosen from. */
export const REACTION_EMOJI = ['👍', '❤️', '😂', '🎉', '👀', '✅'];

// Runs once the node is in the page. A host that appends the node at once
// (ui-chat's pilot) has it placed by the next microtask; sf-chat-message hands
// it to Lit, which places it a frame later at most, so a few frames are
// waited for; a node dropped meanwhile is left alone.
export function whenPlaced(node, run, frames = 3) {
  queueMicrotask(() => {
    if (node.isConnected) { run(); return; }
    if (frames <= 0) return;
    const view = node.ownerDocument.defaultView;
    const later = view?.requestAnimationFrame ? view.requestAnimationFrame.bind(view) : (next) => setTimeout(next, 16);
    later(() => whenPlaced(node, run, frames - 1));
  });
}

/**
 * What a message answers (message.reply_to {id, author: {name}, text}): the
 * author and one line, a side rule, a button that asks the host to show the
 * original. view.replyLoaded false: nothing moves and the title says why;
 * view.replyDeleted or reply_to.is_deleted: «Сообщение удалено».
 * @returns {HTMLElement|null}
 */
export function renderQuote(ctx, message, view = {}) {
  const reply = message.reply_to;
  if (!reply || typeof reply !== 'object') return null;
  const words = ctx.words;
  const deleted = view.replyDeleted === true || reply.is_deleted === true;
  const name = String(reply.author?.name ?? '');
  const line = deleted ? words('people.deleted') : String(reply.text ?? '');
  const loaded = view.replyLoaded !== false;
  const label = words(loaded ? 'reply.quote' : 'reply.quoteAway', {name, text: line});
  const quote = element(ctx, 'button', 'sf-chat-quote', {
    type: 'button', 'aria-label': label, title: words(loaded ? 'reply.show' : 'reply.notLoaded'), 'aria-disabled': loaded ? null : 'true',
  });
  if (name) quote.append(text(ctx, 'span', 'sf-chat-quote__name', name));
  quote.append(text(ctx, 'span', 'sf-chat-quote__text', line));
  quote.addEventListener('click', () => {
    if (loaded) ctx.onAction?.('quote', {id: message.id, target: reply.id});
  });
  return quote;
}

const reactionsOf = (message) => (Array.isArray(message.reactions) ? message.reactions : [])
  .filter((one) => one && typeof one.emoji === 'string' && one.emoji && Number(one.count) > 0);

/**
 * The reactions under a message: one pill each, pressed when it is the
 * reader's, named in words. Not optimistic: the count is the host's, and while
 * the host is asked (view.reacting, the emoji) that pill says it is waiting and
 * takes no second press; a first reaction waits on a pill with no number.
 * @returns {HTMLElement|null}
 */
export function renderReactions(ctx, message, view = {}) {
  const words = ctx.words;
  const list = reactionsOf(message);
  const waiting = view.reacting ?? null;
  if (waiting && !list.some((one) => one.emoji === waiting)) list.push({emoji: waiting, count: 0, mine: false});
  if (!list.length) return null;
  const root = element(ctx, 'div', 'sf-chat-reactions', {role: 'group', 'aria-label': words('reactions.label')});
  for (const one of list) {
    const count = Math.floor(Number(one.count)) || 0;
    const mine = one.mine === true;
    const pending = waiting === one.emoji;
    const pill = element(ctx, 'button', `sf-chat-reaction${mine ? ' sf-chat-reaction--mine' : ''}${pending ? ' sf-chat-reaction--pending' : ''}`, {
      type: 'button',
      'data-emoji': one.emoji,
      'aria-pressed': String(mine),
      'aria-label': count ? words(mine ? 'reactions.pillMine' : 'reactions.pill', {emoji: one.emoji, count}) : words('reactions.choice', {emoji: one.emoji}),
      'aria-busy': pending ? 'true' : null,
      'aria-disabled': waiting || !view.canReact ? 'true' : null,
    });
    pill.append(text(ctx, 'span', 'sf-chat-reaction__emoji', one.emoji, {'aria-hidden': 'true'}));
    if (count) pill.append(text(ctx, 'span', 'sf-chat-reaction__count', String(count), {'aria-hidden': 'true'}));
    pill.addEventListener('click', () => {
      if (waiting || !view.canReact) return;
      ctx.onAction?.('react', {id: message.id, emoji: one.emoji, on: !mine});
    });
    root.append(pill);
  }
  return root;
}

// «⋯»: edit and delete in the Framework's menu, made on the first press and
// waiting for the element, which the Loader brings lazily (the rule).
function openMore(ctx, message, holder, anchor, {edit, remove}) {
  let menu = holder.querySelector('sf-context-menu');
  if (!menu) {
    menu = element(ctx, 'sf-context-menu', 'sf-chat-tools__menu', {popup: true, 'aria-label': ctx.words('people.actions')});
    menu.addEventListener('sf-context-menu-select', (event) => {
      event.stopPropagation();
      const id = event.detail?.id ?? event.detail?.value;
      if (id === 'edit') ctx.onAction?.('edit-start', {message});
      if (id === 'delete') ctx.onAction?.('delete-ask', {message});
    });
    holder.append(menu);
  }
  const entries = [
    ...(edit ? [{id: 'edit', text: ctx.words('people.edit'), icon: 'edit'}] : []),
    ...(remove ? [{id: 'delete', text: ctx.words('people.delete'), icon: 'delete'}] : []),
  ];
  ctx.document.defaultView.customElements.whenDefined('sf-context-menu').then(() => {
    menu.entries = entries;
    menu.toggleFor(anchor);
  });
}

/**
 * At most three tools: reply, reaction, «⋯» with edit and delete where allowed.
 * Shown as person.js shows its own: on hover or focus where a pointer hovers,
 * always on touch, at least 44 px under a finger.
 * @returns {HTMLElement|null}
 */
export function renderTools(ctx, message, view = {}, {edit = false, remove = false} = {}) {
  const words = ctx.words;
  const reply = Boolean(view.canReply);
  const react = Boolean(view.canReact);
  if (!reply && !react && !edit && !remove) return null;
  const tools = element(ctx, 'div', 'sf-chat-tools', {role: 'group', 'aria-label': words('people.actions')});
  if (reply) {
    const button = iconButton(ctx, {icon: 'reply', label: words('reply.action'), size: '1/2', className: 'sf-chat-tools__reply'});
    button.addEventListener('click', () => ctx.onAction?.('reply', {id: message.id}));
    tools.append(button);
  }
  if (react) {
    const button = iconButton(ctx, {icon: 'add_reaction', label: words('reactions.add'), size: '1/2', className: 'sf-chat-tools__react'});
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', String(Boolean(view.picker)));
    button.addEventListener('click', () => ctx.onAction?.('picker', {id: message.id, open: !view.picker}));
    tools.append(button);
  }
  if (edit || remove) {
    const more = iconButton(ctx, {icon: 'more_horiz', label: words('tools.more'), size: '1/2', className: 'sf-chat-tools__more'});
    more.setAttribute('aria-haspopup', 'menu');
    more.addEventListener('click', () => openMore(ctx, message, tools, more, {edit, remove}));
    tools.append(more);
  }
  return tools;
}

/**
 * The picker of six over the tools, one of them pressed when it is the
 * reader's. Escape closes it and the focus goes back to its tool (the host
 * draws the message again without it); a press elsewhere closes it too.
 */
export function renderPicker(ctx, message, view = {}) {
  const words = ctx.words;
  const mine = new Set(reactionsOf(message).filter((one) => one.mine === true).map((one) => one.emoji));
  const picker = element(ctx, 'div', 'sf-chat-picker', {role: 'group', 'aria-label': words('reactions.choose')});
  const buttons = REACTION_EMOJI.map((emoji) => {
    const on = mine.has(emoji);
    const button = text(ctx, 'button', 'sf-chat-picker__emoji', emoji, {
      type: 'button', 'data-emoji': emoji, 'aria-label': words('reactions.choice', {emoji}), 'aria-pressed': String(on),
    });
    button.addEventListener('click', () => ctx.onAction?.('react', {id: message.id, emoji, on: !on}));
    return button;
  });
  picker.append(...buttons);
  const close = (quiet) => ctx.onAction?.('picker', {id: message.id, open: false, quiet});
  picker.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(false);
      return;
    }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const rtl = ctx.document.defaultView.getComputedStyle(picker).direction === 'rtl';
    const step = (event.key === 'ArrowRight') !== rtl ? 1 : -1;
    event.preventDefault();
    buttons[(buttons.indexOf(event.target) + step + buttons.length) % buttons.length]?.focus();
  });
  // A press on its own tool is the tool's: it closes the picker by itself.
  whenPlaced(picker, () => {
    const documentRef = ctx.document;
    const away = (event) => {
      if (!picker.isConnected) { documentRef.removeEventListener('pointerdown', away, true); return; }
      if (picker.contains(event.target) || event.target.closest?.('.sf-chat-tools__react')) return;
      documentRef.removeEventListener('pointerdown', away, true);
      close(true);
    };
    documentRef.addEventListener('pointerdown', away, true);
    // Opened at the top of the feed it would be cut off: it stands under the tools.
    const scroller = picker.closest('.sf-message-log');
    const top = scroller ? scroller.getBoundingClientRect().top : 0;
    if (picker.getBoundingClientRect().top < top) picker.classList.add('sf-chat-picker--below');
    buttons[0].focus({preventScroll: true});
  });
  return picker;
}

// The line a conflict puts over the editor or the question. It is drawn
// again with the message, so it is not a live region: the host says it
// once (sf-chat-window announces it through its log).
export function renderConflict(ctx, conflict) {
  return text(ctx, 'p', 'sf-chat-person__conflict', ctx.words(conflict.deleted ? 'people.conflictDeleted' : 'people.conflict'));
}

export function renderDeleteAsk(ctx, message, conflict = null) {
  const words = ctx.words;
  const row = element(ctx, 'div', 'sf-chat-person__ask', {role: 'group', 'aria-label': words('people.deleteAsk')});
  if (conflict) row.append(renderConflict(ctx, conflict));
  row.append(text(ctx, 'span', '', words('people.deleteAsk')));
  const cancel = text(ctx, 'button', 'sf-button sf-button--size-1/2 sf-button--link sf-button--on-surface', words('people.cancel'), {type: 'button'});
  cancel.addEventListener('click', () => ctx.onAction?.('delete-cancel', {message}));
  const confirm = text(ctx, 'button', 'sf-button sf-button--size-1/2 sf-button--outline sf-button--error', words('people.delete'), {type: 'button'});
  confirm.addEventListener('click', () => ctx.onAction?.('delete', {message}));
  row.append(cancel, confirm);
  // Escape takes the question back, as «Отмена» does (1.2.0).
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    ctx.onAction?.('delete-cancel', {message});
  });
  whenPlaced(cancel, () => cancel.focus());
  return row;
}
