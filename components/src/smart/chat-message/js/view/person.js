// sf-chat-message's second template, `person` (D31 inventory §3: people.js is
// a template of the message, not a tag of its own). It came from simai/ui-chat
// (components/src/component/chat/js/people.js, ui-chat 10d376b) unchanged but
// for its imports.
//
// A conversation between people (ui-chat docs/integration/PILOT-BX-CHAT.md): a message
// of a person, grouped with its neighbours by author, the reader's own on the
// end side. The same grammar as the assistant's window (SPEC §3): text 16/24,
// meta 12/16, the bubble a capsule on one line, nested radii.
//
// The renderer draws what it is given and reports what is asked of it through
// ctx.onAction: edit | delete | retry | retry-file | edit-start | edit-cancel |
// delete-ask | delete-cancel. What a person may do comes from the message's
// own canEdit / canDelete, never from who wrote it.
//
// 1.2.0: view.conflict {deleted} -- an edit or a delete met a newer revision
// (port answer conflict): the message is drawn as it is now, with the line
// «Сообщение уже изменили» (or «уже удалили»); the editor keeps the typed
// text and offers «Оставить их» and «Заменить своим», the delete question
// asks again. message.authorAvatar is shown beside the first of a run.
import { element, text, iconButton, iconNode, renderAttachment } from './message.js';

const PENDING_WORD = { send: 'people.sending', edit: 'people.saving', delete: 'people.deleting' };
const FAILED_WORD = { send: 'people.failed', edit: 'people.failedEdit', delete: 'people.failedDelete' };

/** «Анна Смирнова» → «АС»; at most two letters, «?» for an empty name. */
export function initials(name) {
  const letters = String(name || '').split(/[\s—–-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]);
  return letters.join('').toUpperCase() || '?';
}

/** A key that stays the same for a message before and after the server knows it. */
export function messageKey(message) {
  return message.id != null ? `m${message.id}` : `l${message.local?.clientKey || ''}`;
}

function formatTime(ctx, value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(ctx.locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

/**
 * One message.
 * @param {object} view {own, first, last, showName, editing: {body}|null, askDelete}
 */
export function renderPersonMessage(ctx, message, view = {}) {
  const words = ctx.words;
  const local = message.local || null;
  const failed = local?.state === 'failed';
  const pending = local?.state === 'pending';
  const classes = ['sf-chat-person'];
  if (view.own) classes.push('sf-chat-person--own');
  if (view.first) classes.push('sf-chat-person--first');
  if (view.last) classes.push('sf-chat-person--last');
  if (message.isDeleted) classes.push('sf-chat-person--deleted');
  if (pending) classes.push('sf-chat-person--pending');
  if (failed) classes.push('sf-chat-person--failed');
  const author = view.own ? words('people.you') : (message.authorName || '');
  const root = element(ctx, 'article', classes.join(' '), {
    'data-key': messageKey(message),
    'aria-label': author,
    'aria-busy': pending ? 'true' : null,
  });

  // Others' messages carry who wrote them: initials beside the first of a
  // run, the name above it where more than two people talk.
  if (!view.own) {
    const avatar = element(ctx, 'span', 'sf-chat-person__avatar', { 'aria-hidden': 'true' });
    if (view.first) avatar.textContent = initials(message.authorName);
    // The host's picture over the initials, which stay if it does not load.
    if (view.first && message.authorAvatar) {
      const picture = element(ctx, 'img', 'sf-chat-person__picture', { src: message.authorAvatar, alt: '', loading: 'lazy', decoding: 'async' });
      picture.addEventListener('error', () => picture.remove());
      avatar.append(picture);
    }
    root.append(avatar);
  }

  const body = element(ctx, 'div', 'sf-chat-person__body');
  root.append(body);
  if (view.first && view.showName && !view.own) body.append(text(ctx, 'p', 'sf-chat-person__name', message.authorName || ''));

  if (message.isDeleted) {
    const tomb = element(ctx, 'p', 'sf-chat-person__bubble sf-chat-person__bubble--tomb');
    tomb.append(iconNode(ctx, 'block', 'sf-chat-person__tomb-icon', '1'), text(ctx, 'span', '', words('people.deleted')));
    body.append(tomb);
    // Deleted while it was being edited: the typed text stays to be copied.
    if (view.editing && view.conflict) body.append(renderConflict(ctx, { deleted: true }), renderEditor(ctx, message, view.editing, { deleted: true }));
    return root;
  }

  if (view.editing) {
    // In a conflict the message as it is now stands above the typed text.
    if (view.conflict) {
      body.append(renderConflict(ctx, view.conflict));
      if (message.body) body.append(text(ctx, 'p', 'sf-chat-person__bubble sf-chat-person__bubble--current', message.body));
    }
    body.append(renderEditor(ctx, message, view.editing, view.conflict));
  } else {
    // An edit on its way (or refused) shows the words the person wrote.
    const shown = local?.action === 'edit' && local.state !== 'sent' && local.body != null ? local.body : message.body;
    if (shown) body.append(text(ctx, 'p', 'sf-chat-person__bubble', shown));
  }

  if (message.files?.length) {
    const files = element(ctx, 'div', 'sf-chat-person__files');
    for (const file of message.files) files.append(renderPersonFile(ctx, message, file));
    body.append(files);
  }

  // The line under a message: when, «изменено», and what is happening to it.
  const meta = element(ctx, 'p', 'sf-chat-person__meta');
  const time = formatTime(ctx, message.createdAt);
  if (time) meta.append(text(ctx, 'time', '', time, { datetime: message.createdAt }));
  if (message.isEdited && !(local?.action === 'edit' && local.state !== 'sent')) meta.append(text(ctx, 'span', '', words('people.edited')));
  const action = local?.action || 'send';
  if (pending) meta.append(text(ctx, 'span', 'sf-chat-person__state', words(PENDING_WORD[action] || 'people.sending')));
  if (failed) {
    const state = element(ctx, 'span', 'sf-chat-person__state sf-chat-person__state--failed', { role: 'alert' });
    state.append(iconNode(ctx, 'error', '', '1'), text(ctx, 'span', '', words(FAILED_WORD[action] || 'people.failed')));
    const retry = text(ctx, 'button', 'sf-chat-notice__action', words('action.retry'), { type: 'button' });
    retry.addEventListener('click', () => ctx.onAction?.('retry', { clientKey: local.clientKey }));
    meta.append(state, retry);
  }
  if (meta.childNodes.length) body.append(meta);

  if (view.askDelete) {
    body.append(renderDeleteAsk(ctx, message, view.conflict));
  } else if (!view.editing && !pending && message.id != null && (message.canEdit || message.canDelete)) {
    const tools = element(ctx, 'div', 'sf-chat-person__tools', { role: 'group', 'aria-label': words('people.actions') });
    if (message.canEdit) {
      const edit = iconButton(ctx, { icon: 'edit', label: words('people.edit'), size: '1/2', className: 'sf-chat-person__edit' });
      edit.addEventListener('click', () => ctx.onAction?.('edit-start', { message }));
      tools.append(edit);
    }
    if (message.canDelete) {
      const remove = iconButton(ctx, { icon: 'delete', label: words('people.delete'), size: '1/2', className: 'sf-chat-person__delete' });
      remove.addEventListener('click', () => ctx.onAction?.('delete-ask', { message }));
      tools.append(remove);
    }
    root.append(tools);
  }
  return root;
}

// Runs once the node is in the page. A host that appends the node at once
// (ui-chat's pilot) has it placed by the next microtask; sf-chat-message hands
// it to Lit, which places it a frame later at most, so a few frames are
// waited for; a node dropped meanwhile is left alone.
function whenPlaced(node, run, frames = 3) {
  queueMicrotask(() => {
    if (node.isConnected) { run(); return; }
    if (frames <= 0) return;
    const view = node.ownerDocument.defaultView;
    const later = view?.requestAnimationFrame ? view.requestAnimationFrame.bind(view) : (next) => setTimeout(next, 16);
    later(() => whenPlaced(node, run, frames - 1));
  });
}

// The line a conflict puts over the editor or the question. It is drawn
// again with the message, so it is not a live region: the host says it
// once (sf-chat-window announces it through its log).
function renderConflict(ctx, conflict) {
  return text(ctx, 'p', 'sf-chat-person__conflict', ctx.words(conflict.deleted ? 'people.conflictDeleted' : 'people.conflict'));
}

function renderEditor(ctx, message, editing, conflict = null) {
  const words = ctx.words;
  const form = element(ctx, 'form', 'sf-chat-person__editor');
  if (conflict) form.classList.add('sf-chat-person__editor--conflict');
  const field = element(ctx, 'textarea', 'sf-chat-person__edit-field', { 'aria-label': words('people.editLabel'), rows: '1' });
  field.value = editing.body ?? message.body ?? '';
  field.addEventListener('input', () => {
    editing.body = field.value;
    field.style.blockSize = 'auto';
    field.style.blockSize = `${field.scrollHeight}px`;
  });
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); ctx.onAction?.('edit-cancel', { message }); }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
  });
  const actions = element(ctx, 'div', 'sf-chat-person__edit-actions');
  // A conflict: «Оставить их» drops the typed text, «Заменить своим» saves it
  // over the message as it is now; a deleted message can only be left.
  const cancelWord = conflict ? (conflict.deleted ? 'people.close' : 'people.keepTheirs') : 'people.cancel';
  const cancel = text(ctx, 'button', 'sf-button sf-button--size-1/2 sf-button--link sf-button--on-surface sf-chat-person__edit-cancel', words(cancelWord), { type: 'button' });
  cancel.addEventListener('click', () => ctx.onAction?.('edit-cancel', { message }));
  const save = text(ctx, 'button', 'sf-button sf-button--size-1/2 sf-button--default sf-button--primary sf-chat-person__edit-save', words(conflict ? 'people.replaceMine' : 'people.save'), { type: 'submit' });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (conflict?.deleted) return;
    const value = field.value.trim();
    if (!value || value === message.body) { ctx.onAction?.('edit-cancel', { message }); return; }
    ctx.onAction?.('edit', { message, body: value });
  });
  actions.append(cancel);
  if (!conflict?.deleted) actions.append(save);
  form.append(field, actions);
  // Placed and focused once the form is in the page.
  whenPlaced(field, () => {
    field.style.blockSize = `${field.scrollHeight}px`;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  });
  return form;
}

function renderDeleteAsk(ctx, message, conflict = null) {
  const words = ctx.words;
  const row = element(ctx, 'div', 'sf-chat-person__ask', { role: 'group', 'aria-label': words('people.deleteAsk') });
  if (conflict) row.append(renderConflict(ctx, conflict));
  row.append(text(ctx, 'span', '', words('people.deleteAsk')));
  const cancel = text(ctx, 'button', 'sf-button sf-button--size-1/2 sf-button--link sf-button--on-surface', words('people.cancel'), { type: 'button' });
  cancel.addEventListener('click', () => ctx.onAction?.('delete-cancel', { message }));
  const confirm = text(ctx, 'button', 'sf-button sf-button--size-1/2 sf-button--outline sf-button--error', words('people.delete'), { type: 'button' });
  confirm.addEventListener('click', () => ctx.onAction?.('delete', { message }));
  row.append(cancel, confirm);
  // Escape takes the question back, as «Отмена» does (1.2.0).
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    ctx.onAction?.('delete-cancel', { message });
  });
  whenPlaced(cancel, () => cancel.focus());
  return row;
}

function renderPersonFile(ctx, message, file) {
  const words = ctx.words;
  const chip = renderAttachment(ctx, {
    id: file.id ?? file.key,
    name: file.name,
    bytes: file.size,
    progress: file.state === 'uploading' ? 0.5 : null,
    error: file.state === 'failed' ? words('people.fileFailed') : null,
  });
  chip.classList.add('sf-chat-person__file');
  if (file.state === 'failed') {
    const retry = text(ctx, 'button', 'sf-chat-notice__action', words('action.retry'), { type: 'button' });
    retry.addEventListener('click', () => ctx.onAction?.('retry-file', { messageId: message.id, fileKey: file.key ?? file.id }));
    chip.append(retry);
  } else if (file.downloadUrl && file.state !== 'uploading') {
    // The whole chip opens the file: the module's protected link, as given.
    const link = element(ctx, 'a', 'sf-chat-person__file-link', { href: file.downloadUrl, 'aria-label': words('people.download', { name: file.name }), download: file.name || true });
    chip.append(link);
  }
  return chip;
}
