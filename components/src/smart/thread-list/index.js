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
import SfBaseElement from "../../core/js/smart-base";
import {pageText} from "../../core/js/page-language";
import {renderThreadListTemplate} from "./js/templates/default.js";

const GROUPS = ["today", "yesterday", "earlier"];
// A title longer than this is not a title; the field stops there, as the
// server that stores it most likely does.
const TITLE_LIMIT = 120;
// The next page is asked for this far before the end of the list is in view.
const MORE_MARGIN = "200px";

// The Framework speaks English by default and the page's language otherwise. A
// product that calls them «chats» rather than «conversations» says so once,
// through SF.language.register('sf-thread-list', 'ru', {createText: 'Новый чат'}).
const THREAD_LIST_TEXT = {
    en: {
        label: "Conversations",
        createText: "New conversation",
        today: "Today",
        yesterday: "Yesterday",
        earlier: "Earlier",
        actionsLabel: "Actions for “{title}”",
        renameText: "Rename",
        renameLabel: "New name",
        archiveText: "Archive",
        unarchiveText: "Restore from archive",
        archiveView: "Archive",
        backText: "Back to conversations",
        emptyText: "No conversations yet",
        archiveEmptyText: "The archive is empty",
        loadingText: "Loading conversations",
        untitledText: "Untitled",
        unreadLabel: "{count} unread",
    },
    ru: {
        label: "Разговоры",
        createText: "Новый разговор",
        today: "Сегодня",
        yesterday: "Вчера",
        earlier: "Раньше",
        actionsLabel: "Действия с «{title}»",
        renameText: "Переименовать",
        renameLabel: "Новое название",
        archiveText: "В архив",
        unarchiveText: "Вернуть из архива",
        archiveView: "Архив",
        backText: "К разговорам",
        emptyText: "Разговоров пока нет",
        archiveEmptyText: "В архиве пусто",
        loadingText: "Загружаю разговоры",
        untitledText: "Без названия",
        unreadLabel: "Непрочитанных: {count}",
    },
};

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// Newest first by the last change; a thread without a readable date goes last
// rather than first, where an unknown date would otherwise sort a string.
const byUpdated = (a, b) => {
    const left = Date.parse(a.updated_at ?? "");
    const right = Date.parse(b.updated_at ?? "");
    return (Number.isFinite(right) ? right : -Infinity) - (Number.isFinite(left) ? left : -Infinity);
};

class SfThreadList extends SfBaseElement {
    static get props() {
        return {
            templateName: {attribute: "template", default: "default"},
            selected: {default: ""},
            hasMore: {attribute: "has-more", type: Boolean, default: false},
            archived: {type: Boolean, default: false},
            noCreate: {attribute: "no-create", type: Boolean, default: false},
            noManage: {attribute: "no-manage", type: Boolean, default: false},
            // No archive at all: no way to it, and no «Archive» among a row's
            // actions. A people's chat may have none.
            noArchive: {attribute: "no-archive", type: Boolean, default: false},
            groupBy: {attribute: "group-by", default: "day", values: ["day", "none"]},
            // The navigation's accessible name. Empty: «Conversations», or
            // «Archive» while the archive is shown, in the page's language.
            label: {default: ""},
        };
    }

    constructor() {
        super();
        this._threads = [];
        this._actions = [];
        this._loadingMore = false;
        this._loading = false;
        this._status = "";
        this._editing = null;
        this._tabStop = null;
        this._restoreFocus = false;
        this._menuFor = null;
        this._observer = null;
        this._observed = null;
    }

    // ── words ────────────────────────────────────────────────────────────────

    text(key, values = {}) {
        const words = pageText(THREAD_LIST_TEXT, key, this);
        return words.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
    }

    // ── state the host sets ──────────────────────────────────────────────────

    get selected() {
        return this.getProp("selected") || "";
    }

    set selected(id) {
        if (id) this.setAttribute("selected", String(id));
        else this.removeAttribute("selected");
    }

    get archived() {
        return this.getProp("archived");
    }

    set archived(value) {
        this.toggleAttribute("archived", Boolean(value));
    }

    get hasMore() {
        return this.getProp("hasMore");
    }

    set hasMore(value) {
        this.toggleAttribute("has-more", Boolean(value));
    }

    /** The conversations shown, newest first, as the host gave them. */
    get threads() {
        return this._threads.map((thread) => ({...thread}));
    }

    /**
     * Row actions of the host's own, after «Rename» and «Archive»: [{id, text,
     * icon?}]. Chosen, one leaves as sf-thread-list-action {id, action}.
     */
    get actions() {
        return this._actions.map((action) => ({...action}));
    }

    set actions(value) {
        this._actions = Array.isArray(value)
            ? value.filter((action) => action && action.id && action.text).map((action) => ({...action}))
            : [];
    }

    setThreads(threads = [], {hasMore = false} = {}) {
        const archived = this.archived;
        this._threads = threads
            .filter((thread) => thread && thread.id != null && Boolean(thread.archived) === archived)
            .map((thread) => ({...thread, id: String(thread.id)}));
        this._loading = false;
        this._loadingMore = false;
        this.hasMore = hasMore;
        this.requestComponentUpdate("threads");
    }

    appendThreads(threads = [], {hasMore = false} = {}) {
        const known = new Set(this._threads.map((thread) => thread.id));
        this.setThreads([...this._threads, ...threads.filter((thread) => thread && !known.has(String(thread.id)))], {hasMore});
    }

    /** A new or changed conversation moves to where its date puts it. */
    upsert(thread) {
        if (!thread || thread.id == null) return;
        const id = String(thread.id);
        const rest = this._threads.filter((one) => one.id !== id);
        this.setThreads([{...thread, id}, ...rest].sort(byUpdated), {hasMore: this.hasMore});
    }

    removeThread(id) {
        this.setThreads(this._threads.filter((thread) => thread.id !== String(id)), {hasMore: this.hasMore});
    }

    /** While the first page loads: the shape of the list instead of words. */
    setLoading(loading) {
        this._loading = Boolean(loading);
        if (this._loading) this._status = "";
        this.requestComponentUpdate("loading");
    }

    /** A sentence in place of the list (an error the host could not recover from); empty clears it. */
    setStatus(message) {
        this._status = String(message ?? "");
        this.requestComponentUpdate("status");
    }

    /** The next page could not be loaded: reaching the end asks again. */
    moreFailed() {
        this._loadingMore = false;
    }

    // ── what is drawn ────────────────────────────────────────────────────────

    groupOf(thread, today) {
        const date = new Date(thread.updated_at);
        if (Number.isNaN(date.getTime())) return "earlier";
        if (dayKey(date) === dayKey(today)) return "today";
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        return dayKey(date) === dayKey(yesterday) ? "yesterday" : "earlier";
    }

    groups() {
        if (this.getProp("groupBy") === "none") return [{key: "all", heading: "", threads: this._threads}];
        const today = new Date();
        const byGroup = new Map(GROUPS.map((key) => [key, []]));
        for (const thread of this._threads) byGroup.get(this.groupOf(thread, today)).push(thread);
        return GROUPS.filter((key) => byGroup.get(key).length)
            .map((key) => ({key, heading: this.text(key), threads: byGroup.get(key)}));
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
        const empty = !this._loading && this._threads.length === 0;
        return {
            component: this,
            label: this.getProp("label") || this.text(archived ? "archiveView" : "label"),
            archived,
            canCreate: !archived && !this.getProp("noCreate"),
            canArchive: !this.getProp("noArchive"),
            manage,
            loading: this._loading,
            loadingText: this.text("loadingText"),
            groups: this.groups(),
            grouped: this.getProp("groupBy") !== "none",
            selected: this.selected,
            tabStop: this.tabStop(),
            editing: this._editing,
            status: this._status || (empty ? this.text(archived ? "archiveEmptyText" : "emptyText") : ""),
            createText: this.text("createText"),
            backText: this.text("backText"),
            archiveView: this.text("archiveView"),
            renameLabel: this.text("renameLabel"),
            untitledText: this.text("untitledText"),
            actionsLabel: (title) => this.text("actionsLabel", {title}),
            unreadLabel: (count) => this.text("unreadLabel", {count}),
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
        if (this._loadingMore || this._loading || !this.hasMore) return;
        this._loadingMore = true;
        this.emit("sf-thread-list-load-more");
    }

    emit(name, detail = {}) {
        return this.dispatchEvent(new CustomEvent(name, {bubbles: true, composed: true, cancelable: true, detail}));
    }

    links() {
        return [...this.querySelectorAll(".sf-thread-list__link")];
    }

    linkFor(id) {
        if (!id) return null;
        return this.links().find((link) => link.dataset.id === id) ?? null;
    }

    // ── what a person does ───────────────────────────────────────────────────

    create() {
        this.emit("sf-thread-list-create");
    }

    open(id) {
        this._tabStop = id;
        this.emit("sf-thread-list-select", {id});
    }

    showArchive(archived) {
        this.emit("sf-thread-list-view", {archived: Boolean(archived)});
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
    openMenu(id, anchor) {
        const thread = this._threads.find((one) => one.id === id);
        const menu = this.querySelector(".sf-thread-list__menu");
        if (!thread || !menu || this.getProp("noManage")) return;
        this._menuFor = id;
        menu.setAttribute("aria-label", this.text("actionsLabel", {title: thread.title || this.text("untitledText")}));
        menu.entries = [
            {id: "rename", text: this.text("renameText"), icon: "edit", shortcut: "F2"},
            ...(this.getProp("noArchive") ? [] : [this.archived
                ? {id: "unarchive", text: this.text("unarchiveText"), icon: "unarchive"}
                : {id: "archive", text: this.text("archiveText"), icon: "archive"}]),
            ...this._actions.map((action) => ({id: `action:${action.id}`, text: action.text, ...(action.icon ? {icon: action.icon} : {})})),
        ];
        // The Loader brings sf-context-menu when the page is ready (the rule
        // fetches it lazily); a press before that waits for it.
        customElements.whenDefined("sf-context-menu").then(() => menu.toggleFor(anchor));
    }

    onMenu(detail = {}) {
        const id = this._menuFor;
        const choice = String(detail.id ?? detail.entry?.id ?? "");
        if (!id || !choice) return;
        if (choice === "rename") setTimeout(() => this.rename(id), 0);
        else if (choice === "archive") this.emit("sf-thread-list-archive", {id});
        else if (choice === "unarchive") this.emit("sf-thread-list-unarchive", {id});
        else if (choice.startsWith("action:")) this.emit("sf-thread-list-action", {id, action: choice.slice("action:".length)});
    }

    /** Rename in place: Enter keeps, Escape gives up, leaving the field keeps. */
    rename(id) {
        if (this.getProp("noManage") || !this._threads.some((thread) => thread.id === String(id))) return;
        this._editing = String(id);
        this.requestComponentUpdate("rename");
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
            this.emit("sf-thread-list-rename", {id, title});
        }
        this.requestComponentUpdate("rename");
    }
}

SfThreadList.define("sf-thread-list");
