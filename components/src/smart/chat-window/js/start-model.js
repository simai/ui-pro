// sf-chat-window's new conversation and group (x-conversation-start) and the
// read-only member list (x-members), without a document: what the host's data
// and answers mean. Plain functions of their arguments, so the views
// (start-view.js, members-view.js) and the package's node tests read them alike.

// The host's numbers (limits.group), these when it gives none. They are this
// window's defaults for the host it was made for, not the Framework's.
// query_chars: the longest search the field takes.
export const GROUP_LIMITS = Object.freeze({title_chars: 120, members_max: 49, search_min: 2, search_max: 20, query_chars: 80});

/** limits.group read: a whole positive number from the host, else the default. */
export function groupLimits(group) {
  const given = group && typeof group === 'object' ? group : {};
  const read = (name) => {
    const number = Math.trunc(Number(given[name]));
    return Number.isFinite(number) && number > 0 ? number : GROUP_LIMITS[name];
  };
  return Object.fromEntries(Object.keys(GROUP_LIMITS).map((name) => [name, read(name)]));
}

/** Up to two initials of a name, for the plain avatar markup. */
export function initialsOf(name) {
  const words = String(name ?? '').trim().split(/\s+/u).filter(Boolean);
  return words.slice(0, 2).map((word) => [...word][0].toUpperCase()).join('');
}

/** A found person as sf-lookup's item: only the id and the name are read. */
export function personItem(person) {
  const name = String(person?.name ?? '');
  const initials = initialsOf(name);
  return {value: person?.id, label: name, ...(initials ? {avatar: {initials}} : {})};
}

/**
 * An answer to recipients.search: {state: 'denied'} when the search is refused
 * access-denied (the module's disabled directory and missing rights are one
 * answer), {state: 'items', items, truncated} when applied (truncated: as many
 * came as may come, which does not mean more exist), else {state: 'failed'}.
 */
export function searchOutcome(result, limits = GROUP_LIMITS) {
  if (result?.answer === 'refused' && result.reason === 'access-denied') return {state: 'denied'};
  if (result?.answer !== 'applied') return {state: 'failed', reason: result?.reason ?? null};
  const given = Array.isArray(result.data?.items) ? result.data.items : [];
  const items = given.filter((one) => one && one.id !== null && one.id !== undefined).map(personItem);
  return {state: 'items', items, truncated: given.length >= limits.search_max};
}

/**
 * An answer to conversation.start: opened, or which of the form's lines it is.
 * silent: the page itself cancelled the event, or the answer was superseded.
 */
export function startOutcome(result) {
  if (result?.answer === 'applied') return 'opened';
  const reason = result?.reason ?? null;
  if (reason === 'prevented' || reason === 'superseded') return 'silent';
  if (result?.answer === 'conflict' || reason === 'conflict') return 'conflict';
  if (result?.answer === 'refused' && reason === 'access-denied') return 'denied';
  if (result?.answer === 'refused' && reason === 'invalid-recipient') return 'recipient';
  if (result?.answer === 'refused' && reason === 'invalid-group') return 'group';
  return 'retry';
}

/** What is wrong with a group's form: {title: ''|'required'|'long', members: ''|'required'}. */
export function checkGroup({title = '', members = []} = {}, limits = GROUP_LIMITS) {
  const trimmed = String(title).trim();
  return {
    title: !trimmed ? 'required' : [...trimmed].length > limits.title_chars ? 'long' : '',
    members: members.length ? '' : 'required',
  };
}

/**
 * The client_key of a group's form. The same title and members keep their key,
 * so a retry after a lost answer is one group; a changed form takes a new one,
 * and so does the next press after the host's conflict (reset). `mint` makes a
 * key.
 */
export class GroupKey {
  constructor(mint) {
    this.mint = mint;
    this.key = null;
    this.form = null;
  }

  take(title, memberIds) {
    const form = JSON.stringify([title, memberIds]);
    if (!this.key || this.form !== form) {
      this.key = this.mint();
      this.form = form;
    }
    return this.key;
  }

  reset() {
    this.key = null;
    this.form = null;
  }
}

// The roles the window has words for; any other shows no label.
export const MEMBER_ROLES = Object.freeze(['owner', 'manager', 'member', 'observer']);

/** The word of a member's role, or '' for a role it does not know. */
export const roleWord = (role) => (MEMBER_ROLES.includes(role) ? `members.role.${role}` : '');

/** A member as drawn: only the id, the name and the role are read. */
export const memberRow = (one) => ({id: one?.id, name: String(one?.name ?? ''), role: roleWord(one?.role)});

/** Which conversations have members to show: a group or a channel, never a private one. */
export const hasMembers = (type) => type === 'group' || type === 'channel';
