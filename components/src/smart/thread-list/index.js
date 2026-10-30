// A person's conversations, newest first. It came from simai/ui-chat as
// sf-chat-thread-list and was promoted here under a neutral name (owner,
// 2026-10-25): an assistant's conversations and the chats between people in
// simai.chat are the same list -- a title, a quiet second line, how many are
// unread, which one is open, a few things one can do to a row.
//
// What a conversation is stays with the host. A thread is data: an id, a title,
// when it last changed, and optionally a caption (who it is with, the last
// message), an unread count and an avatar. The list draws exactly that and
// interprets none of it; which assistant a conversation is with, or whether
// a caption is a preview of the last message, is the host's sentence.
//
// It owns the arrangement and nothing else:
//   - grouping by the day of the last change in the person's own time zone
//     («Today», «Yesterday», «Earlier»), or no grouping (group-by="none");
//   - which row is open (`selected`), told by more than a tint;
//   - one Tab stop for the whole list, arrows between rows;
//   - renaming in place, and the row's actions in the Framework's menu;
//   - asking for the next page when its end comes into view.
// It never fetches anything: every request leaves as an event.
//
// Keyboard: arrows, Home and End move between conversations, Enter opens, F2
// renames, Shift+F10 or the menu key opens the row's actions.
//
// With `archived` it shows the archive instead: a way back, no «New
// conversation», «Restore» instead of «Archive». Which list it holds is the
// host's call. `no-create` takes «New conversation» away, `no-manage` a row's
// actions and `no-archive` the archive: what a host does not offer is not shown.
// `create-commands` (1.5.0) stand in for the one «New conversation»: several
// ways to start (a dialogue, a group), each its own row-like command, and a press
// says which: create {kind: id}. Without them nothing changes.
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

// A pinned conversation leads, under its own heading, before the days
// (Mirai24 API v1.1: `pinned` on an entry; owner, 2026-10-28).
const GROUPS = ["pinned", "today", "yesterday", "earlier"];
// A title longer than this is not a title; the field stops there, as the
// server that stores it most likely does.
const TITLE_LIMIT = 120;
// The next page is asked for this far before the end of the list is in view.
const MORE_MARGIN = "200px";

const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});

// The 1.0 forms a host still writes, read until the aliases' day and noted
// (§16 item 20): a setter that became a setting, an entry field in snake case
// that became kebab-case (§18.1).
const legacy = (kind, from, to) => noteDeprecated({
    component: "sf-thread-list", tag: "sf-thread-list", kind, from, to,
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

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

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
        this._loadingMore = false;
        this._editing = null;
        this._tabStop = null;
        this._restoreFocus = false;
        this._menuFor = null;
        this._observer = null;
        this._observed = null;
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
        this.requestComponentUpdate("threads");
    }

    /**
     * Row actions of the host's own, after «Rename» and «Archive»: [{id, text,
     * icon?}]. Chosen, one leaves as sf-thread-list-apply {action, scope: entry, ids}.
     */
    get actions() {
        return this._actions.map((action) => ({...action}));
    }

    set actions(value) {
        this._actions = Array.isArray(value)
            ? value.filter((action) => action && action.id && action.text).map((action) => ({...action}))
            : [];
    }

    /**
     * The commands in the head in place of «New conversation»: [{id, text,
     * icon?}]. Pressed, one leaves as sf-thread-list-create {kind: id}.
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

    // ── actions (§4.4) ───────────────────────────────────────────────────────

    /** The whole list and whether more follows, together; ends a page request. */
    setThreads(first = [], second = {}) {
        const {threads, hasMore} = pageArguments(first, second);
        this.threads = threads;
        this._loadingMore = false;
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
        this._loadingMore = false;
        return applied();
    }

    // ── what is drawn ────────────────────────────────────────────────────────

    groupOf(thread, today) {
        if (thread.pinned === true) return "pinned";
        const date = new Date(thread["updated-at"]);
        if (Number.isNaN(date.getTime())) return "earlier";
        if (dayKey(date) === dayKey(today)) return "today";
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        return dayKey(date) === dayKey(yesterday) ? "yesterday" : "earlier";
    }

    groups() {
        // Without groups the pinned ones still lead, in their own order.
        if (this.getProp("groupBy") === "none") {
            const pinned = this._threads.filter((thread) => thread.pinned === true);
            return [{key: "all", heading: "", threads: [...pinned, ...this._threads.filter((thread) => thread.pinned !== true)]}];
        }
        const today = new Date();
        const byGroup = new Map(GROUPS.map((key) => [key, []]));
        for (const thread of this._threads) byGroup.get(this.groupOf(thread, today)).push(thread);
        return GROUPS.filter((key) => byGroup.get(key).length)
            .map((key) => ({key, heading: this.sfWord(key), threads: byGroup.get(key)}));
    }

    // Exactly one conversation is in the Tab order: the one last moved to, else
    // the open one, else the first.
    tabStop() {
        const ids = this._threads.map((thread) => thread.id);
        if (this._tabStop && ids.includes(this._tabStop)) return this._tabStop;
        if (this.selected && ids.includes(this.selected)) return this.selected;
        return ids[0] ?? null;
    }

    templateContext() {
        const archived = this.archived;
        const manage = !this.getProp("noManage");
        const loading = this.loading;
        const empty = !loading && this._threads.length === 0;
        return {
            component: this,
            // The setting's own words win; without them the word follows what
            // is shown, the conversations or the archive.
            label: this.getAttribute("label") || this.sfWord(archived ? "archive-view" : "label"),
            archived,
            canCreate: !archived && !this.getProp("noCreate"),
            createCommands: this._createCommands,
            canArchive: !this.getProp("noArchive"),
            manage,
            loading,
            loadingText: this.sfWord("loading-text"),
            groups: this.groups(),
            grouped: this.getProp("groupBy") !== "none",
            selected: this.selected,
            tabStop: this.tabStop(),
            editing: this._editing,
            status: this.status || (empty ? this.sfWord(archived ? "archive-empty-text" : "empty-text") : ""),
            createText: this.sfWord("create-text"),
            backText: this.sfWord("back-text"),
            archiveView: this.sfWord("archive-view"),
            renameLabel: this.sfWord("rename-label"),
            untitledText: this.sfWord("untitled-text"),
            pinnedText: this.sfWord("pinned-text"),
            actionsLabel: (title) => this.text("actions-label", {title}),
            unreadLabel: (count) => this.text("unread-label", {count}),
            hasFooter: this.hasSlotContent("footer"),
            footer: this.hasSlotContent("footer") ? this.getSlotContent("footer") : null,
            titleLimit: TITLE_LIMIT,
        };
    }

    template() {
        return renderThreadListTemplate(this.templateContext());
    }

    afterRender(changed) {
        super.afterRender?.(changed);
        this.observeEnd();
        if (this._editing) {
            const input = this.querySelector(".sf-thread-list__rename");
            if (input && !input.dataset.focused) {
                input.dataset.focused = "true";
                input.focus();
                input.select();
            }
            return;
        }
        if (this._restoreFocus) {
            this._restoreFocus = false;
            this.linkFor(this.tabStop())?.focus();
        }
    }

    // has-more turning on while the end is already in view is a request for
    // the next page: the end is watched again, and a watch that starts on a
    // visible end reports it at once.
    attributeChangedCallback(name, previous, next) {
        super.attributeChangedCallback?.(name, previous, next);
        if (name === "has-more" && next !== null && previous === null) {
            this._observer?.disconnect();
            this._observed = null;
            this.requestComponentUpdate("has-more");
        }
    }

    onDisconnected() {
        this._observer?.disconnect();
        this._observer = null;
        this._observed = null;
        super.onDisconnected?.();
    }

    // The end of the list asks for the next page when it comes within reach of
    // the scroller, never from a scroll handler that fires sixty times a second.
    observeEnd() {
        const scroller = this.querySelector(".sf-thread-list__scroller");
        const sentinel = this.querySelector(".sf-thread-list__sentinel");
        if (!scroller || !sentinel || this._observed === sentinel || typeof IntersectionObserver !== "function") return;
        this._observer?.disconnect();
        this._observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) this.requestMore();
        }, {root: scroller, rootMargin: MORE_MARGIN});
        this._observer.observe(sentinel);
        this._observed = sentinel;
    }

    requestMore() {
        if (this._loadingMore || this.loading || !this.hasMore) return;
        this._loadingMore = true;
        this.sfEmit("load-more", {direction: "after"});
    }

    links() {
        return [...this.querySelectorAll(".sf-thread-list__link")];
    }

    linkFor(id) {
        if (!id) return null;
        return this.links().find((link) => link.dataset.id === id) ?? null;
    }

    // ── what a person does ───────────────────────────────────────────────────

    create(kind) {
        this.sfEmit("create", kind ? {kind} : {});
    }

    // A press asks for the conversation (selected is controlled, §4.3): the
    // host opens it and writes selected back.
    open(id) {
        this._tabStop = id;
        this.sfEmit("open", {id});
    }

    showArchive(archived) {
        this.sfEmit("toggle", {archived: Boolean(archived)});
    }

    onKey(event) {
        const link = event.target.closest?.(".sf-thread-list__link");
        if (!link) return;
        const links = this.links();
        const at = links.indexOf(link);
        let next = null;
        if (event.key === "ArrowDown") next = links[Math.min(at + 1, links.length - 1)];
        if (event.key === "ArrowUp") next = links[Math.max(at - 1, 0)];
        if (event.key === "Home") next = links[0];
        if (event.key === "End") next = links.at(-1);
        if (next) {
            event.preventDefault();
            this.moveTabStop(next);
            return;
        }
        if (this.getProp("noManage")) return;
        if (event.key === "F2") {
            event.preventDefault();
            this.rename(link.dataset.id);
            return;
        }
        if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
            event.preventDefault();
            this.openMenu(link.dataset.id, link.closest(".sf-thread-list__item")?.querySelector(".sf-thread-list__more") ?? link);
        }
    }

    moveTabStop(link) {
        this._tabStop = link.dataset.id;
        for (const one of this.links()) one.tabIndex = one === link ? 0 : -1;
        link.focus();
    }

    /** Open the row's actions, as the «⋯» button and Shift+F10 do. */
    openMenu(params, anchorGiven = null) {
        const id = String(params?.id ?? params ?? "");
        const thread = this._threads.find((one) => one.id === id);
        const menu = this.querySelector(".sf-thread-list__menu");
        if (this.getProp("noManage")) return refused("no-manage");
        if (!thread || !menu) return refused("unknown");
        const item = [...this.querySelectorAll(".sf-thread-list__item")].find((one) => one.dataset.id === id);
        const anchor = anchorGiven instanceof Element ? anchorGiven : item?.querySelector(".sf-thread-list__more") ?? item ?? this;
        this._menuFor = id;
        menu.setAttribute("aria-label", this.text("actions-label", {title: thread.title || this.sfWord("untitled-text")}));
        menu.entries = [
            {id: "rename", text: this.sfWord("rename-text"), icon: "edit", shortcut: "F2"},
            ...(this.getProp("noArchive") ? [] : [this.archived
                ? {id: "unarchive", text: this.sfWord("unarchive-text"), icon: "unarchive"}
                : {id: "archive", text: this.sfWord("archive-text"), icon: "archive"}]),
            ...this._actions.map((action) => ({id: `action:${action.id}`, text: action.text, ...(action.icon ? {icon: action.icon} : {})})),
        ];
        // The Loader brings sf-context-menu when the page is ready (the rule
        // fetches it lazily); a press before that waits for it.
        customElements.whenDefined("sf-context-menu").then(() => menu.toggleFor(anchor));
        return applied();
    }

    onMenu(detail = {}) {
        const id = this._menuFor;
        const choice = String(detail.id ?? detail.entry?.id ?? "");
        if (!id || !choice) return;
        if (choice === "rename") setTimeout(() => this.rename(id), 0);
        // Vocabulary §5: archive and restore take ids; a row's own action is
        // apply {action, scope: entry, ids} (§18.3). id stays for the 1.0 names.
        else if (choice === "archive") this.sfEmit("archive", {ids: [id], id});
        else if (choice === "unarchive") this.sfEmit("restore", {ids: [id], id});
        else if (choice.startsWith("action:")) this.sfEmit("apply", {action: choice.slice("action:".length), scope: "entry", ids: [id], id});
    }

    /** Rename in place: Enter keeps, Escape gives up, leaving the field keeps. */
    rename(params) {
        const id = String(params?.id ?? params ?? "");
        if (this.getProp("noManage")) return refused("no-manage");
        if (!this._threads.some((thread) => thread.id === id)) return refused("unknown");
        this._editing = id;
        this.requestComponentUpdate("rename");
        return applied();
    }

    finishRename(keep, input) {
        const id = this._editing;
        if (!id) return;
        this._editing = null;
        const thread = this._threads.find((one) => one.id === id);
        const title = String(input?.value ?? "").trim().slice(0, TITLE_LIMIT);
        this._tabStop = id;
        this._restoreFocus = true;
        if (keep && thread && title && title !== thread.title) {
            // Shown at once; the host that cannot keep it says so by upserting
            // the conversation with its old title.
            thread.title = title;
            this.sfEmit("rename", {id, title});
        }
        this.requestComponentUpdate("rename");
    }
}

SfThreadList.define("sf-thread-list");
