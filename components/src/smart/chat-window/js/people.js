// sf-chat-window between people (1.3.0, capability people): what a port
// message is for sf-chat-message's template person, which messages run
// together, where the unread part begins and which revision is newer. Plain
// functions of the port's data (simai.chat-port 1.0 message fields only), so
// the window and its tests read them alike.

/** A message's key in the log: its id, or a send's client_key before it has one. */
export const keyOf = (message) => String(message.id ?? message.local?.client_key ?? "");

// One author's messages this close together, on one day, are one run.
export const RUN_GAP_MS = 5 * 60 * 1000;

/**
 * A person's message as the template person draws it: who wrote it
 * (author.name, avatar_url), whether it is the reader's own (author.own), its
 * time, «изменено», a tombstone, its files and, where the host's can_edit and
 * can_delete and the window's capabilities (`edit`, `remove`) allow, edit and
 * delete. `acting` is an edit or a delete of this page on its way ({action,
 * state, clientKey, body}); the host's own local (a send not yet stored) is
 * read when there is none. `author`, `own` and `text` are what sf-message-log
 * and the window's announcer read.
 */
export function toPersonView(message, {edit = false, remove = false, acting = null} = {}) {
    const author = message.author || {};
    const local = acting ?? (message.local ? {
        clientKey: message.local.client_key, action: message.local.action, state: message.local.state, body: message.local.body ?? null,
    } : null);
    const stored = message.id != null && message.is_deleted !== true && local?.state !== "pending";
    const deleted = message.is_deleted === true;
    const view = {
        id: keyOf(message),
        role: "user",
        template: "person",
        author: `person:${author.id ?? ""}`,
        own: author.own === true,
        pending: false,
        text: deleted ? "" : (message.body ?? ""),
        body: deleted ? "" : (message.body ?? ""),
        authorName: author.name ?? "",
        isEdited: message.is_edited === true,
        isDeleted: deleted,
        canEdit: edit && stored && message.can_edit === true,
        canDelete: remove && stored && message.can_delete === true,
        files: deleted ? [] : (message.files || []).map((file) => ({
            id: file.id, key: file.key, name: file.name, size: file.size ?? null, state: file.state ?? "ready",
            ...(file.download_url ? {downloadUrl: file.download_url} : {}),
        })),
    };
    if (author.avatar_url) view.authorAvatar = author.avatar_url;
    if (message.created_at) {
        view.createdAt = message.created_at;
        view.created_at = message.created_at;
    }
    if (local) view.local = local;
    return view;
}

// Both times on one day (the reader's) and within RUN_GAP_MS; without a time
// the author alone decides.
function near(a, b) {
    if (!a || !b) return true;
    const one = new Date(a);
    const two = new Date(b);
    if (Number.isNaN(one.getTime()) || Number.isNaN(two.getTime())) return true;
    return one.toDateString() === two.toDateString() && Math.abs(two - one) <= RUN_GAP_MS;
}

function sameRun(a, b) {
    return Boolean(a && b) && a.kind !== "assistant" && b.kind !== "assistant"
        && String(a.author?.id ?? "") === String(b.author?.id ?? "") && (a.author?.own === true) === (b.author?.own === true)
        && near(a.created_at, b.created_at);
}

/**
 * Runs of one author over the feed, key -> {first, last, showName}: the same
 * author.id (and own), a person's message each, on one day and within
 * RUN_GAP_MS of the one before. An assistant's message, another author, a
 * changed day or a longer pause starts a new run. The name is shown above
 * others' messages unless the conversation (`type`) is private.
 */
export function runsOf(messages = [], {type = null} = {}) {
    const map = new Map();
    messages.forEach((message, index) => {
        if (message.kind === "assistant") return;
        map.set(keyOf(message), {
            first: !sameRun(messages[index - 1], message),
            last: !sameRun(message, messages[index + 1]),
            showName: type !== "private" && message.author?.own !== true,
        });
    });
    return map;
}

/**
 * The key of the first unread message, or null. The port 1.0 names no last
 * read message, only a conversation's unread_count: it is counted back from
 * the end over others' messages (the reader's own are never unread).
 */
export function unreadKeyOf(messages = [], count = 0) {
    let left = Math.max(0, Math.floor(Number(count) || 0));
    let key = null;
    for (let at = messages.length - 1; at >= 0 && left > 0; at--) {
        if (messages[at].author?.own === true) continue;
        key = keyOf(messages[at]);
        left--;
    }
    return key;
}

/** Which revision is newer: -1 when `b` is, 1 when `a` is, 0 the same (numbers as numbers). */
export function compareRevisions(a, b) {
    if (a == null || b == null) return a == null ? (b == null ? 0 : -1) : 1;
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return Math.sign(x - y);
    return String(a) === String(b) ? 0 : -1;
}
