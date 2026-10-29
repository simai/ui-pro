// simai.chat-port 1.0.0 as sf-chat-window and its hosts read it: which
// intent the window raises under which event verb, under which capability,
// and what a host may set.
//
// A plain module with no imports, so a host adapter and the package's node
// tests read the same table the element does. The contract is ui-source's
// src/core/contracts/ports/simai.chat-port/1.0.0/port.json (since 4d711d2,
// pair ui-89834691fb9d), at the revision framework.lock.json pins.
//
// Every intent goes out as one event of the window, sf-chat-window-<verb>,
// with {requestId, intent, payload} (vocabulary 1.1.5 §5: one name per
// verb; the port's payload keeps the port's own field names). Where two
// intents share a verb the payload says which (open: a conversation, a list
// or «Мои файлы»; retry: a message or a file; delete: a message or a file;
// load-more: the history or the list). The 0.3 names (chat-port:<name>,
// chat-window:<name>) follow until 2026-12-01 (aliases.json): `former` is
// the old name each intent went out as, with {request_id, ...payload}.

export const PORT = {port: 'simai.chat-port', version: '1.0.0'};

/** The port versions this window takes through connect-port. */
export const SUPPORTED_PORT_VERSIONS = ['1.0', '1.0.0'];

export const ANSWERS = ['applied', 'conflict', 'refused', 'unavailable'];

/**
 * intent -> {verb, kind, capability, former}; capability null is always
 * offered. `kind` is set where a verb carries more than one intent.
 */
export const INTENTS = {
  'conversation.open': {verb: 'open', kind: 'conversation', capability: null, former: 'chat-port:open'},
  'history.older': {verb: 'load-more', kind: 'history', capability: null, former: 'chat-port:older'},
  'message.send': {verb: 'submit', kind: null, capability: null, former: 'chat-port:send'},
  'message.retry': {verb: 'retry', kind: 'message', capability: null, former: 'chat-port:retry'},
  'message.edit': {verb: 'save', kind: null, capability: 'edit', former: 'chat-port:edit'},
  'message.delete': {verb: 'delete', kind: 'message', capability: 'delete', former: 'chat-port:delete'},
  'message.read': {verb: 'read', kind: null, capability: 'read', former: 'chat-port:read'},
  'message.rate': {verb: 'rate', kind: null, capability: 'feedback', former: 'chat-port:rate'},
  'file.retry': {verb: 'retry', kind: 'file', capability: 'files', former: 'chat-port:file-retry'},
  'proposal.decide': {verb: 'answer', kind: null, capability: 'proposals', former: 'chat-port:decide'},
  'wait.check': {verb: 'check', kind: null, capability: 'assistant', former: 'chat-port:check'},
  'wait.stop': {verb: 'stop', kind: null, capability: 'assistant', former: 'chat-port:stop'},
  'conversation.create': {verb: 'create', kind: null, capability: 'conversation-create', former: 'chat-port:create'},
  'conversation.rename': {verb: 'rename', kind: null, capability: 'conversation-manage', former: 'chat-port:rename'},
  // archived true is «В архив», false «Вернуть»: two verbs, one port intent.
  'conversation.archive': {verb: 'archive', kind: null, capability: 'conversation-manage', former: 'chat-port:archive'},
  'interlocutor.choose': {verb: 'select', kind: null, capability: 'interlocutors', former: 'chat-port:interlocutor'},
};

export const CAPABILITIES = ['assistant', 'people', 'files', 'edit', 'delete', 'feedback', 'proposals', 'conversation-create', 'conversation-manage', 'interlocutors', 'read'];

/** The port's data, as the host sets them (names as in the port). */
export const DATA = ['me', 'conversations', 'conversation', 'messages', 'history', 'feed_state', 'limits', 'interlocutors', 'notice'];

// What Mirai24's API.md does that the port 1.0.0 has no word for: the archive
// as its own list, the list's next page, files uploaded when they are picked,
// the list searched by title, a conversation pinned and «Мои файлы» (the
// person's kept files, listed and deleted). They are the window's own
// capabilities, not the port's: declared by the host with an x- name, raised
// the same way (an event, answered by the port or by answer()), and never
// offered to a host that does not declare them. The port's own «search across
// conversations» is left to its 1.1.0.
export const EXTENSION_INTENTS = {
  'conversations.view': {verb: 'open', kind: 'list', capability: 'x-archive-view', former: 'chat-window:view'},
  'conversations.more': {verb: 'load-more', kind: 'conversations', capability: 'x-conversations-paging', former: 'chat-window:more'},
  'conversations.search': {verb: 'query', kind: null, capability: 'x-conversations-search', former: 'chat-window:search'},
  'conversation.pin': {verb: 'pin', kind: null, capability: 'x-conversation-pin', former: 'chat-window:pin'},
  'file.attach': {verb: 'attach', kind: null, capability: 'x-early-upload', former: 'chat-window:attach'},
  'file.detach': {verb: 'detach', kind: null, capability: 'x-early-upload', former: 'chat-window:detach'},
  'files.list': {verb: 'open', kind: 'files', capability: 'x-my-files', former: 'chat-window:files'},
  'files.remove': {verb: 'delete', kind: 'file', capability: 'x-my-files', former: 'chat-window:file-remove'},
};

// x-brief (API.md v1.2) has no intent of its own: a host that declares it
// gives an assistant message its `brief`, and the window draws it; the answer
// goes out as an ordinary message.send.
export const EXTENSION_CAPABILITIES = ['x-archive-view', 'x-conversations-paging', 'x-conversations-search', 'x-conversation-pin', 'x-early-upload', 'x-my-files', 'x-brief'];

/** Data a host with the window's capabilities sets beside the port's. */
export const EXTENSION_DATA = ['conversation_list', 'composer_files', 'my_files'];

/** The verb an intent goes out under: conversation.archive is restore when it brings one back. */
export function verbOf(intent, payload = {}) {
  const spec = INTENTS[intent] || EXTENSION_INTENTS[intent];
  if (!spec) return '';
  if (intent === 'conversation.archive' && payload.archived === false) return 'restore';
  return spec.verb;
}

/** The 0.3 event name of a verb's detail, for the dated aliases. */
export function formerOf(detail) {
  const spec = INTENTS[detail?.intent] || EXTENSION_INTENTS[detail?.intent];
  return spec ? spec.former : '';
}
