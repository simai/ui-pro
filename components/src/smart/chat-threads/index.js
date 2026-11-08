// A person's conversations, newest first. It came from simai/ui-chat as
// sf-chat-thread-list and was promoted here under a neutral name (owner,
// 2026-10-25): an assistant's conversations and the chats between people in
// simai.chat are the same list -- a title, a quiet second line, how many are
// unread, which one is open, a few things one can do to a row.
//
// What a conversation is stays with the host. A thread is data: an id, a title,
// when it last changed, and optionally a caption (who it is with, the last
// message), an unread count, where the work in it is, and an avatar. The list
// draws exactly that and interprets none of it.
//
// 2.0.0 (owner, 2026-11-06, q-3b313e2246): the rows are the Framework's
// sf-list 1.1. A thread becomes its item -- title the text, caption the
// supporting line, updated-at the date, unread the count, activity a badge,
// avatar and pinned as they are -- and the list's events become this list's.
// The groups by day, the pinned ones first, one Tab stop and the arrows,
// renaming in place, the row's menu and the next page are sf-list's. What stays
// here is what is around the rows: starting a conversation, the archive and
// the way back, a sentence in place of the rows, the footer.
//
// With `archived` it shows the archive instead: a way back, no «New
// conversation», «Restore» instead of «Archive». Which list it holds is the
// host's call. `no-create` takes «New conversation» away, `no-manage` a row's
// actions and `no-archive` the archive: what a host does not offer is not shown.
// `create-commands` (1.5.0) stand in for the one «New conversation».
//
// From its component.json (standard simai.smart-component 1.3.8 §3, §4, §8,
// §11, §18): the settings are attributes and properties made by
// core/js/element-manifest.js, its words are lang/<locale>.json, the actions
// answer outcomes, and the events take the vocabulary's verbs (open, restore,
// apply, toggle); the old names sf-thread-list-select, -unarchive, -action and
// -view follow until 2026-12-01 (aliases.json).
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {noteDeprecated} from "../../core/js/deprecations";
import {renderThreadListTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

// A title longer than this is not a title; the field stops there, as the
// server that stores it most likely does.
const TITLE_LIMIT = 120;

// Where the work in a conversation is, as a badge of the row: its word and
// the tone of the Framework's status set (sf-badge's own activity marks).
const ACTIVITY_TONES = {running: "neutral", waiting: "warning", done: "success", stopped: "neutral", failed: "error"};
// The host's own row actions, apart from the list's own archive and restore.
const OWN = "host:";

const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});

// The 1.0 forms a host still writes, read until the aliases' day and noted
// (§16 item 20): a setter that became a setting, an entry field in snake case
// that became kebab-case (§18.1).
const legacy = (kind, from, to) => noteDeprecated({
    component: "sf-chat-threads", tag: "sf-chat-threads", kind, from, to,
    since: aliases.since, remove_after: aliases.remove_after,
});

// One conversation as the list holds it: id a string, the fields kebab-case.
const normalThread = (thread) => {
    const {updated_at: updatedAt, ...rest} = thread;
    const out = {...rest, id: String(thread.id)};
    if (out["updated-at"] === undefined && updatedAt !== undefined) {
        legacy("entry-field", "updated_at", "updated-at");
        out["updated-at"] = updatedAt;
    }
    if (thread.avatar && typeof thread.avatar === "object") {
        const {image_url: imageUrl, ...avatar} = thread.avatar;
        if (avatar["image-url"] === undefined && imageUrl !== undefined) {
            legacy("entry-field", "avatar.image_url", "avatar.image-url");
            avatar["image-url"] = imageUrl;
        }
        out.avatar = avatar;
    }
    return out;
};

// set-threads(list, {hasMore}) is the 1.0 call; set-threads({threads,
// has-more}) the manifest's (§4.4: one object in declared order).
const pageArguments = (first, second) => {
    if (first && !Array.isArray(first) && typeof first === "object" && Array.isArray(first.threads)) {
        return {threads: first.threads, hasMore: Boolean(first["has-more"] ?? first.hasMore)};
    }
    return {threads: Array.isArray(first) ? first : [], hasMore: Boolean(second?.hasMore ?? second?.["has-more"])};
};

const ThreadListElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    aliases,
});

// Newest first by the last change; a thread without a readable date goes last
// rather than first, where an unknown date would otherwise sort a string.
const byUpdated = (a, b) => {
    const left = Date.parse(a["updated-at"] ?? "");
    const right = Date.parse(b["updated-at"] ?? "");
    return (Number.isFinite(right) ? right : -Infinity) - (Number.isFinite(left) ? left : -Infinity);
};


class SfThreadList extends ThreadListElement {
    static get props() {
        return {...super.props, templateName: {attribute: "template", default: "default"}};
    }

    constructor() {
        super();
        this._threads = [];
        this._actions = [];
        this._createCommands = [];
        // The rows given to sf-list: written to it after a draw, as a page
        // (setItems ends its page request), once per change.
        this._version = 0;
        this._given = -1;
        // A value set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        for (const name of ["threads", "actions", "createCommands"]) {
            if (!Object.prototype.hasOwnProperty.call(this, name)) continue;
            const early = this[name];
            delete this[name];
            this[name] = early;
        }
    }

    // ── words ────────────────────────────────────────────────────────────────

    text(key, vars = {}) {
        return this.sfWord(key, {vars});
    }

    // ── state the host sets ──────────────────────────────────────────────────

    // A printed skeleton (data-sf-first-paint="skeleton") stays until the host
    // gives the threads (standard 1.3.8 §5.4): the first render then draws them
    // over it in one frame. An empty list given is an answer too -- the empty
    // state draws -- where the base's test counts it as not yet given.
    sfAwaitingData() {
        return this.getAttribute("data-sf-first-paint") === "skeleton" && !this._sfDataGiven;
    }

    /** The conversations shown, newest first, as the host gave them (§18.4: entries by id). */
    get threads() {
        return this._threads.map((thread) => ({...thread}));
    }

    set threads(value) {
        this._sfDataGiven = true;
        const archived = this.archived;
        this._threads = (Array.isArray(value) ? value : [])
            .filter((thread) => thread && thread.id != null && Boolean(thread.archived) === archived)
            .map(normalThread);
        this._version += 1;
        this.requestComponentUpdate("threads");
    }

    /**
     * Row actions of the host's own, after «Rename» and «Archive»: [{id, text,
     * icon?}]. Chosen, one leaves as sf-chat-threads-apply {action, scope: entry, ids}.
     */
    get actions() {
        return this._actions.map((action) => ({...action}));
    }

    set actions(value) {
        this._actions = Array.isArray(value)
            ? value.filter((action) => action && action.id && action.text).map((action) => ({...action, id: String(action.id)}))
            : [];
        // The menu is built when it opens: a host that sets its actions just
        // before (sf-chat-window's «Pin» or «Unpin» for that row) is heard.
        const list = this.list;
        if (list) list.actions = this.rowActions();
        this.requestComponentUpdate("actions");
    }

    /**
     * The commands in the head in place of «New conversation»: [{id, text,
     * icon?}]. Pressed, one leaves as sf-chat-threads-create {kind: id}.
     */
    get createCommands() {
        return this._createCommands.map((command) => ({...command}));
    }

    set createCommands(value) {
        this._createCommands = Array.isArray(value)
            ? value.filter((command) => command && command.id && command.text).map((command) => ({...command, id: String(command.id)}))
            : [];
        this.requestComponentUpdate("create-commands");
    }

    /** The rows: the Framework's sf-list inside the navigation. */
    get list() {
        return this.querySelector(":scope > .sf-thread-list > .sf-thread-list__scroller > .sf-thread-list__rows");
    }

    // ── actions (§4.4) ───────────────────────────────────────────────────────

    /** The whole list and whether more follows, together; ends a page request. */
    setThreads(first = [], second = {}) {
        const {threads, hasMore} = pageArguments(first, second);
        this.threads = threads;
        if (this.loading) this.loading = false;
        this.hasMore = hasMore;
        return applied();
    }

    appendThreads(first = [], second = {}) {
        const {threads, hasMore} = pageArguments(first, second);
        const known = new Set(this._threads.map((thread) => thread.id));
        return this.setThreads([...this._threads, ...threads.filter((thread) => thread && !known.has(String(thread.id)))], {hasMore});
    }

    /** A new or changed conversation moves to where its date puts it. */
    upsert(params) {
        const thread = params?.thread && typeof params.thread === "object" && params.id === undefined ? params.thread : params;
        if (!thread || thread.id == null) return refused("no-id");
        const id = String(thread.id);
        const rest = this._threads.filter((one) => one.id !== id);
        return this.setThreads([normalThread(thread), ...rest].sort(byUpdated), {hasMore: this.hasMore});
    }

    removeThread(params) {
        const id = String(params?.id ?? params);
        if (!this._threads.some((thread) => thread.id === id)) return refused("unknown");
        return this.setThreads(this._threads.filter((thread) => thread.id !== id), {hasMore: this.hasMore});
    }

    /** The 1.0 setter of `loading`; noted. */
    setLoading(loading) {
        legacy("action", "setLoading", "loading");
        this.loading = Boolean(loading);
        if (this.loading) this.status = "";
        return applied();
    }

    /** The 1.0 setter of `status`; noted. */
    setStatus(message) {
        legacy("action", "setStatus", "status");
        this.status = String(message ?? "");
        return applied();
    }

    /** The next page could not be loaded: reaching the end asks again. */
    moreFailed() {
        this.list?.moreFailed?.();
        return applied();
    }

    /** Rename in place, as F2 does. */
    rename(params) {
        const id = String(params?.id ?? params ?? "");
        if (this.getProp("noManage")) return refused("no-manage");
        if (!this._threads.some((thread) => thread.id === id)) return refused("unknown");
        return this.list?.rename?.(id) ?? refused("unknown");
    }

    /** Open the row's actions, as the «⋯» button and Shift+F10 do. */
    openMenu(params, anchor = null) {
        const id = String(params?.id ?? params ?? "");
        if (this.getProp("noManage")) return refused("no-manage");
        if (!this._threads.some((thread) => thread.id === id)) return refused("unknown");
        return this.list?.openMenu?.(id, anchor) ?? refused("unknown");
    }

    // ── what is drawn ────────────────────────────────────────────────────────

    // The row's menu after the list's own «Rename»: Archive or Restore, then
    // the host's own.
    rowActions() {
        if (this.getProp("noManage")) return [];
        return [
            ...(this.getProp("noArchive") ? [] : [this.archived
                ? {id: "restore", text: this.sfWord("unarchive-text"), icon: "unarchive"}
                : {id: "archive", text: this.sfWord("archive-text"), icon: "archive"}]),
            ...this._actions.map((action) => ({id: `${OWN}${action.id}`, text: action.text, ...(action.icon ? {icon: action.icon} : {})})),
        ];
    }

    // A thread as sf-list's item. Only the activity words the badge knows
    // draw a mark: an unknown one draws none rather than a badge with no state.
    itemOf(thread) {
        const unread = Number(thread.unread) > 0 ? Math.floor(Number(thread.unread)) : 0;
        const tone = ACTIVITY_TONES[thread.activity];
        const avatar = thread.avatar && typeof thread.avatar === "object" ? thread.avatar : null;
        return {
            id: thread.id,
            text: String(thread.title ?? ""),
            ...(thread.caption ? {supporting: String(thread.caption)} : {}),
            ...(thread["updated-at"] ? {date: thread["updated-at"]} : {}),
            ...(thread.pinned === true ? {pinned: true} : {}),
            ...(avatar ? {avatar} : {}),
            ...(unread ? {count: unread} : {}),
            ...(tone ? {badge: {text: this.sfWord(`activity-${thread.activity}`), tone}} : {}),
        };
    }

    templateContext() {
        const archived = this.archived;
        return {
            component: this,
            // The setting's own words win; without them the word follows what
            // is shown, the conversations or the archive.
            label: this.getAttribute("label") || this.sfWord(archived ? "archive-view" : "label"),
            archived,
            canCreate: !archived && !this.getProp("noCreate"),
            createCommands: this._createCommands,
            canArchive: !this.getProp("noArchive"),
            manage: !this.getProp("noManage"),
            loading: this.loading,
            hasMore: this.hasMore,
            grouped: this.getProp("groupBy") !== "none",
            selected: this.selected ?? "",
            rowActions: this.rowActions(),
            status: this.status,
            empty: this._threads.length === 0,
            emptyText: this.sfWord(archived ? "archive-empty-text" : "empty-text"),
            createText: this.sfWord("create-text"),
            backText: this.sfWord("back-text"),
            archiveView: this.sfWord("archive-view"),
            hasFooter: this.hasSlotContent("footer"),
            footer: this.hasSlotContent("footer") ? this.getSlotContent("footer") : null,
        };
    }

    template() {
        return renderThreadListTemplate(this.templateContext());
    }

    // The rows go to sf-list as a page once they change: setItems ends the
    // list's own page request, as setThreads ends this one. Before sf-list is
    // defined they are its property, taken when it upgrades.
    afterRender(changed) {
        super.afterRender?.(changed);
        const list = this.list;
        if (!list || this._given === this._version) return;
        this._given = this._version;
        const items = this._threads.map((thread) => this.itemOf(thread));
        if (typeof list.setItems === "function") list.setItems(items, {hasMore: this.hasMore});
        else list.items = items;
    }

    // ── what a person does ───────────────────────────────────────────────────

    create(kind) {
        this.sfEmit("create", kind ? {kind} : {});
    }

    // A press asks for the conversation (selected is controlled, §4.3): the
    // host opens it and writes selected back.
    open(id) {
        this.sfEmit("open", {id: String(id)});
    }

    showArchive(archived) {
        this.sfEmit("toggle", {archived: Boolean(archived)});
    }

    // sf-list's events are this list's own: they stop at it and leave as
    // sf-chat-threads-*, the names a host listens to.
    onListOpen(event) {
        event.stopPropagation();
        this.open(event.detail?.id);
    }

    // Shown at once; the host that cannot keep it says so by upserting the
    // conversation with its old title. A title stops at TITLE_LIMIT.
    onListRename(event) {
        event.stopPropagation();
        const id = String(event.detail?.id ?? "");
        const thread = this._threads.find((one) => one.id === id);
        const title = String(event.detail?.text ?? "").trim().slice(0, TITLE_LIMIT);
        if (!thread || !title) return;
        if (title !== event.detail.text) this.list?.upsert?.({...this.itemOf(thread), text: title});
        thread.title = title;
        this.sfEmit("rename", {id, title});
    }

    // Vocabulary §5: archive and restore take ids; a row's own action is
    // apply {action, scope: entry, ids} (§18.3). id stays for the 1.0 names.
    onListApply(event) {
        event.stopPropagation();
        const id = String(event.detail?.ids?.[0] ?? "");
        const action = String(event.detail?.action ?? "");
        if (!id || !action) return;
        if (action === "archive") this.sfEmit("archive", {ids: [id], id});
        else if (action === "restore") this.sfEmit("restore", {ids: [id], id});
        else if (action.startsWith(OWN)) this.sfEmit("apply", {action: action.slice(OWN.length), scope: "entry", ids: [id], id});
    }

    onListMore(event) {
        event.stopPropagation();
        this.sfEmit("load-more", {direction: "after"});
    }
}

SfThreadList.define("sf-chat-threads");
