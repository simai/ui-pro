// Managing a group's members (x-members-manage, 1.9.0): what a row and the view
// offer and what an answer means, as plain functions of the host's data, so the
// view and the package's tests read them alike.
//
// Every button comes from a flag the host gave, never from a table of roles of
// the window's own: the module decides who may remove, change a role or hand the
// group over (canRemove, canChangeRole, canTransfer on a row; can_manage and
// can_leave on the conversation). No flag, no button.

/** The roles a role change may give: the owner is made by handing over, not chosen. */
export const ASSIGNABLE_ROLES = Object.freeze(['manager', 'member', 'observer']);

/** The intents of x-members-manage. */
export const MEMBER_INTENTS = Object.freeze(['member.add', 'member.remove', 'member.role', 'member.transfer', 'member.leave']);

/** What a row offers, from its own flags: role, remove, transfer, in that order. */
export function rowActions(member) {
  const actions = [];
  if (member?.canChangeRole === true) actions.push('role');
  if (member?.canRemove === true) actions.push('remove');
  if (member?.canTransfer === true) actions.push('transfer');
  return actions;
}

/** What the view's head offers, from the open conversation's own flags. */
export function headActions(conversation) {
  const actions = [];
  if (conversation?.can_manage === true) actions.push('add');
  if (conversation?.can_leave === true) actions.push('leave');
  return actions;
}

/** Of the actions, those asked before they go: what cannot be taken back in a click. */
export const CONFIRMED = Object.freeze(['remove', 'transfer', 'leave']);

/**
 * An answer to one of the intents, as the view acts on it:
 *  {state: 'roster', participants}  add, role, transfer: the whole roster again;
 *  {state: 'removed', id}           remove: that row goes, the roster is not asked for;
 *  {state: 'left'}                  leave: the conversation is no longer the reader's;
 *  {state: 'line', word, retry, reload}  a refusal or a failure, said in one line.
 * `reload`: the flags were stale (access-denied), so the roster is asked for again.
 */
export function memberOutcome(intent, result = {}) {
  if (result?.answer === 'applied') {
    const data = result.data || {};
    if (intent === 'member.leave') return {state: 'left'};
    if (intent === 'member.remove') return {state: 'removed', id: data.removed_user_id ?? null};
    return {state: 'roster', participants: Array.isArray(data.participants) ? data.participants : null};
  }
  const reason = result?.reason ?? '';
  if (reason === 'owner-transfer-required') return {state: 'line', word: 'members.leave-owner', retry: false, reload: false};
  if (reason === 'group-full') return {state: 'line', word: 'members.full', retry: false, reload: false};
  if (reason === 'invalid-recipient') return {state: 'line', word: 'members.add-invalid', retry: false, reload: false};
  if (reason === 'access-denied' || reason === 'not-found') return {state: 'line', word: 'members.denied-action', retry: false, reload: true};
  if (reason === 'prevented') return {state: 'line', word: '', retry: false, reload: false};
  return {state: 'line', word: 'members.failed-action', retry: true, reload: false};
}

/** Those already in, and the reader: not offered again when adding. */
export const excludeOf = (members, me) => [...(members || []).map((one) => one?.id), ...(me === null || me === undefined ? [] : [me])]
  .filter((id) => id !== null && id !== undefined);
