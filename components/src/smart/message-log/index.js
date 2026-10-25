// A conversation as a scrolling column of messages, for any kind of talk: a
// person and an assistant, or people with each other. It came from simai/ui-chat
// as sf-chat-message-list and was promoted here under a neutral name (owner,
// 2026-10-25) because simai.chat needs the same reading behaviour for people,
// and a list that knew only "user" and "assistant" could not hold a third
// author, a deleted message or a message still being sent.
//
// So what a message *is* stays with the host. The log draws each one through a
// render function the host gives it (`renderMessage`), or, when none is given,
// as plain text with its author's name -- never as HTML. Who wrote a message is
// data (`author`, `own`), not a role the component interprets: the log only
// groups consecutive messages of one author into a run and tells the renderer
// where a run starts and ends, which is what an avatar beside the first message
// and a tail on the last need.
//
// What the log owns is the reading position, which is the hard part and the
// reason it is a component at all:
//   - earlier history is prepended without moving what is being read;
//   - a new message follows the bottom only if the person was already there,
//     or if it is their own;
//   - «To the latest» brings them back and can take focus there;
//   - reaching the top while there is more asks the host for it, once.
// It fetches nothing and decides nothing: every request leaves as an event.
//
// The items are built by hand and kept, not diffed. A list that re-rendered its
// messages through lit on every change would lose the scroll anchor while
// history is prepended and take focus away from a button inside a message the
// person is pressing. The frame (the earlier button, the jump button, the live
// region) is the template; the column of items is one node the template places
// and never replaces.
import SfBaseElement from "../../core/js/smart-base";
import {pageText} from "../../core/js/page-language";
import {renderMessageLogTemplate} from "./js/templates/default.js";

// Within this distance of an edge counts as being there. 96px is about two
// lines of text and a message's action row: closer than that, a person reading
// the end of the conversation is reading the end.
const NEAR_BOTTOM = 96;
// The top is "reached" a little before it is reached, so the earlier page is
// usually there by the time the person scrolls into it.
const NEAR_TOP = 240;
// A finished message is announced whole only up to this length; a screen
// reader reading a long answer in one breath is not a summary of it.
const ANNOUNCE_LIMIT = 240;

// The Framework speaks English by default and the page's language otherwise
// (src/core/js/page-language). A product corrects a word through
// SF.language.register('sf-message-log', ...), not by forking the dictionary.
const MESSAGE_LOG_TEXT = {
    en: {
        regionLabel: "Conversation",
        logLabel: "Messages",
        earlierText: "Show earlier messages",
        loadingEarlierText: "Loading earlier messages",
        latestLabel: "To the latest message",
        youText: "You",
    },
    ru: {
        regionLabel: "Переписка",
        logLabel: "Сообщения",
        earlierText: "Показать предыдущие сообщения",
        loadingEarlierText: "Загружаю предыдущие сообщения",
        latestLabel: "К последнему сообщению",
        youText: "Вы",
    },
};

const reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// What decides whether a message is drawn again. The host typically hands the
// log a fresh object for every poll, so identity says nothing; the data does.
// A message is plain data by contract (the renderer gets the nodes), so its
// JSON is its content. Keys are sorted so that the same message serialised by
// two servers in two orders is one message.
const stable = (value) => JSON.stringify(value, (key, item) => (item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((name) => [name, item[name]]))
    : item));

const keyOf = (message) => String(message?.id ?? "");

class SfMessageLog extends SfBaseElement {
    static get props() {
        return {
            templateName: {attribute: "template", default: "default"},
            hasMore: {attribute: "has-more", type: Boolean, default: false},
            // The region's accessible name. Empty: «Conversation» in the page's
            // language. A page with two logs names them apart.
            label: {default: ""},
            // `polite`: a message that arrives finished, or finishes, from
            // someone else is read out once. `off`: the host announces itself
            // (announce()) or not at all. Named for aria-live, which is what it
            // decides.
            live: {default: "polite", values: ["polite", "off"]},
        };
    }

    constructor() {
        super();
        // id -> {message, view, node, content, flags}. Insertion order is not
        // display order; the column's children are.
        this._items = new Map();
        this._loadingEarlier = false;
        this._settling = false;
        this._pendingLatest = null;
        this._announced = new Map();
        this._renderMessage = null;
        this._announceMessage = null;
        this._column = null;
    }

    // ── words ────────────────────────────────────────────────────────────────

    text(key) {
        return pageText(MESSAGE_LOG_TEXT, key, this);
    }

    get regionLabel() {
        return this.getProp("label") || this.text("regionLabel");
    }

    get hasMore() {
        return this.getProp("hasMore");
    }

    set hasMore(value) {
        this.toggleAttribute("has-more", Boolean(value));
    }

    // ── host-provided rendering ──────────────────────────────────────────────

    /**
     * (message, context) => Node | string | null. context: {view, previous,
     * next, first, last, own, index, document, log}. A string is drawn as text,
     * never parsed. Setting it redraws every message.
     */
    get renderMessage() {
        return this._renderMessage;
    }

    set renderMessage(value) {
        this._renderMessage = typeof value === "function" ? value : null;
        this.redraw();
    }

    /**
     * (message, context) => string | null: what a screen reader hears when this
     * message is finished. Called when a message arrives or changes; the same
     * words for the same message are said once.
     */
    get announceMessage() {
        return this._announceMessage;
    }

    set announceMessage(value) {
        this._announceMessage = typeof value === "function" ? value : null;
    }

    // ── the stable column ────────────────────────────────────────────────────

    get column() {
        if (!this._column) {
            const column = this.ownerDocument.createElement("div");
            column.className = "sf-message-log__column";
            // The conversation is a log; what is new is said once by the
            // standing announcer, so the log itself stays quiet. A log that
            // spoke for itself read a whole answer every time it was redrawn.
            column.setAttribute("role", "log");
            column.setAttribute("aria-live", "off");
            column.addEventListener("keydown", (event) => this.onItemKey(event));
            this._column = column;
        }
        return this._column;
    }

    get scroller() {
        return this.querySelector(":scope > .sf-message-log");
    }

    get announcer() {
        return this.querySelector(":scope > .sf-message-log .sf-message-log__announcer");
    }

    templateContext() {
        return {
            component: this,
            column: this.column,
            regionLabel: this.regionLabel,
            logLabel: this.text("logLabel"),
            earlierText: this._loadingEarlier ? this.text("loadingEarlierText") : this.text("earlierText"),
            latestLabel: this.text("latestLabel"),
            hasMore: this.hasMore,
            loadingEarlier: this._loadingEarlier,
            empty: this._items.size === 0,
            emptyContent: this.hasSlotContent("empty") ? this.getSlotContent("empty") : null,
        };
    }

    template() {
        return renderMessageLogTemplate(this.templateContext());
    }

    afterRender(changed) {
        super.afterRender?.(changed);
        this.column.setAttribute("aria-label", this.text("logLabel"));
        if (this._pendingLatest) {
            const options = this._pendingLatest;
            this._pendingLatest = null;
            this.scrollToLatest(options);
        }
        this.syncJump();
    }

    // ── the conversation ─────────────────────────────────────────────────────

    /** Replace the whole conversation and show its end. */
    setMessages(messages = [], {hasMore = false} = {}) {
        // Another conversation: nothing said about the last one stays to be
        // found, and nothing said about it is said again.
        this._announced.clear();
        const announcer = this.announcer;
        if (announcer) announcer.textContent = "";
        this._items.clear();
        this.column.replaceChildren();
        for (const message of messages) {
            if (this._items.has(keyOf(message))) continue;
            this.column.append(this.place(message, {}));
        }
        // What a conversation holds when it opens has been said already, by
        // whoever wrote it; only what changes from now on is news.
        for (const item of this._items.values()) this._announced.set(keyOf(item.message), this.announcementOf(item));
        this.syncRuns();
        this._loadingEarlier = false;
        this.hasMore = hasMore;
        this.refreshFrame("messages");
        // Until the end of the new conversation is in view, reaching the top is
        // not a request for earlier history: the column starts at the top for
        // one frame, and that frame used to ask for a page nobody wanted.
        this._settling = true;
        this.scrollToLatest({instant: true, settle: true});
    }

    /** Earlier history above, without moving what is being read. Ends the earlier request. */
    prependMessages(messages = [], {hasMore = false} = {}) {
        const scroller = this.scroller;
        const before = scroller ? scroller.scrollHeight - scroller.scrollTop : 0;
        const fragment = this.ownerDocument.createDocumentFragment();
        for (const message of messages) {
            const key = keyOf(message);
            if (this._items.has(key)) continue;
            fragment.append(this.place(message, {}));
            this._announced.set(key, this.announcementOf(this._items.get(key)));
        }
        this.column.prepend(fragment);
        this.syncRuns();
        // Measured from the bottom: what was under the reader's eyes is the same
        // distance from the end before and after the history above it grew.
        if (scroller) scroller.scrollTop = scroller.scrollHeight - before;
        this._loadingEarlier = false;
        this.hasMore = hasMore;
        this.refreshFrame("prepend");
    }

    /**
     * Add or update one message. `view` is what the host knows that the
     * message does not (a wait it stopped, the person's own rating); it reaches
     * the renderer and is kept until replaced. `replaces` names the id the
     * message had before -- a message sent with a local key that the server has
     * now numbered -- so it keeps its place instead of moving to the end.
     */
    upsert(message, view, {replaces = null} = {}) {
        const key = keyOf(message);
        if (!key) return;
        const previousKey = replaces != null && this._items.has(String(replaces)) ? String(replaces) : key;
        const existing = this._items.get(previousKey);
        const nextView = view ?? existing?.view ?? {};
        const atBottom = this.isNearBottom();
        if (existing && previousKey !== key) {
            this._items.delete(previousKey);
            this._announced.set(key, this._announced.get(previousKey));
            this._announced.delete(previousKey);
        }
        if (existing && previousKey === key && existing.fingerprint === stable([message, nextView])) {
            existing.message = message;
            return;
        }
        const node = this.place(message, nextView);
        if (existing) existing.node.replaceWith(node);
        else this.column.append(node);
        this.syncRuns();
        this.maybeAnnounce(this._items.get(key));
        this.refreshFrame("upsert");
        const followed = atBottom || (!existing && message.own === true);
        if (followed) requestAnimationFrame(() => this.scrollToLatest());
        else this.syncJump();
    }

    /** Merge into the view of a message already shown. */
    setView(id, view = {}) {
        const item = this._items.get(String(id));
        if (item) this.upsert(item.message, {...item.view, ...view});
    }

    remove(id) {
        const key = String(id);
        const item = this._items.get(key);
        if (!item) return;
        item.node.remove();
        this._items.delete(key);
        this._announced.delete(key);
        this.syncRuns();
        this.refreshFrame("remove");
    }

    /** Draw one message again, or every one: after the renderer's own inputs changed. */
    redraw(id = null) {
        const keys = id == null ? [...this._items.keys()] : [String(id)];
        for (const key of keys) {
            const item = this._items.get(key);
            if (!item) continue;
            const node = this.place(item.message, item.view);
            item.node.replaceWith(node);
        }
        this.syncRuns();
    }

    /** The messages in display order, as the host gave them. */
    get messages() {
        return [...this.column.children].map((node) => this._items.get(node.dataset.id)?.message).filter(Boolean);
    }

    setHasMore(value) {
        this.hasMore = value;
    }

    // ── items ────────────────────────────────────────────────────────────────

    place(message, view) {
        const key = keyOf(message);
        const node = this.ownerDocument.createElement("div");
        node.className = "sf-message-log__item";
        node.dataset.id = key;
        if (message.own === true) node.classList.add("sf-message-log__item--own");
        if (message.pending === true) node.setAttribute("aria-busy", "true");
        const item = {message, view: view ?? {}, node, flags: null, fingerprint: stable([message, view ?? {}])};
        this._items.set(key, item);
        return node;
    }

    // Runs are consecutive messages of one author. They are computed over the
    // whole column after every change, because one message arriving changes
    // its neighbour: the message that was the last of a run is no longer.
    // A message is drawn (or drawn again) here, when its place in its run is
    // known -- the renderer is told first and last, and an avatar that belongs
    // beside the first message of a run would otherwise be drawn beside every
    // one until the next redraw.
    syncRuns() {
        const nodes = [...this.column.children];
        const items = nodes.map((node) => this._items.get(node.dataset.id)).filter(Boolean);
        items.forEach((item, index) => {
            const previous = items[index - 1]?.message ?? null;
            const next = items[index + 1]?.message ?? null;
            const sameAuthor = (other) => other && authorOf(other) === authorOf(item.message) && (other.own === true) === (item.message.own === true);
            const flags = {
                first: !sameAuthor(previous),
                last: !sameAuthor(next),
                index,
                end: index === items.length - 1,
            };
            const changed = !item.flags || item.flags.first !== flags.first || item.flags.last !== flags.last;
            item.node.classList.toggle("sf-message-log__item--first", flags.first);
            item.node.classList.toggle("sf-message-log__item--last", flags.last);
            item.node.classList.toggle("sf-message-log__item--end", flags.end);
            item.flags = flags;
            if (changed || !item.node.firstChild) this.draw(item, previous, next);
        });
    }

    draw(item, previous, next) {
        const context = {
            view: item.view,
            previous,
            next,
            first: item.flags.first,
            last: item.flags.last,
            own: item.message.own === true,
            index: item.flags.index,
            document: this.ownerDocument,
            log: this,
        };
        let content = null;
        try {
            content = this._renderMessage ? this._renderMessage(item.message, context) : this.renderDefault(item.message, context);
        } catch (error) {
            // One message the host's renderer cannot draw must not take the
            // conversation down with it; it is reported and left as its text.
            this.reportComponentError?.(error, "render-message");
            content = this.renderDefault(item.message, context);
        }
        const node = content instanceof Node ? content : this.ownerDocument.createTextNode(content == null ? "" : String(content));
        item.node.replaceChildren(node);
    }

    // Without a renderer a message is its author and its text: enough for a
    // log of people, and the shape a renderer replaces. Text only; a host that
    // has markup draws it itself, with its own sanitiser.
    renderDefault(message, {first, own}) {
        const doc = this.ownerDocument;
        const article = doc.createElement("article");
        article.className = "sf-message-log__message";
        const name = own ? this.text("youText") : String(message.author_name ?? "");
        if (name) article.setAttribute("aria-label", name);
        if (first && name && !own) {
            const author = doc.createElement("p");
            author.className = "sf-message-log__author";
            author.textContent = name;
            article.append(author);
        }
        const bubble = doc.createElement("p");
        bubble.className = "sf-message-log__text";
        bubble.textContent = String(message.text ?? "");
        article.append(bubble);
        return article;
    }

    // ── announcing ───────────────────────────────────────────────────────────

    announcementOf(item) {
        if (!item) return "";
        const context = {view: item.view, own: item.message.own === true, log: this};
        if (this._announceMessage) {
            try {
                return String(this._announceMessage(item.message, context) ?? "");
            } catch {
                return "";
            }
        }
        // By default: a finished message from someone else, its author and its
        // words. One's own message is not news to oneself; a pending one is not
        // finished.
        if (item.message.own === true || item.message.pending === true) return "";
        const words = String(item.message.text ?? "").replace(/\s+/g, " ").trim();
        if (!words) return "";
        const author = String(item.message.author_name ?? "").trim();
        return author ? `${author}: ${words}` : words;
    }

    maybeAnnounce(item) {
        if (!item || this.getProp("live") === "off") return;
        const key = keyOf(item.message);
        const said = this.announcementOf(item);
        if (!said || this._announced.get(key) === said) return;
        this._announced.set(key, said);
        this.announce(said);
    }

    /** Say something once through the log's polite live region. */
    announce(words) {
        const announcer = this.announcer;
        if (!announcer) return;
        const whole = String(words ?? "").replace(/\s+/g, " ").trim();
        const said = whole.length > ANNOUNCE_LIMIT ? `${whole.slice(0, ANNOUNCE_LIMIT)}…` : whole;
        // A changed text is what a screen reader hears; clearing first makes a
        // second identical sentence heard as well.
        announcer.textContent = "";
        setTimeout(() => {
            announcer.textContent = said;
        }, 60);
    }

    // ── position ─────────────────────────────────────────────────────────────

    isNearBottom() {
        const scroller = this.scroller;
        if (!scroller) return true;
        return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_BOTTOM;
    }

    /** Is the end of the conversation in view? */
    isAtLatest() {
        return this.isNearBottom();
    }

    syncJump() {
        const jump = this.scroller?.querySelector(".sf-message-log__jump");
        if (jump) jump.hidden = this.isNearBottom();
    }

    onScroll() {
        this.syncJump();
        if (this._settling) return;
        if (this.hasMore && !this._loadingEarlier && (this.scroller?.scrollTop ?? Infinity) < NEAR_TOP) this.requestEarlier();
    }

    /** Ask the host for earlier history; the earlier button and reaching the top do this. */
    requestEarlier() {
        if (this._loadingEarlier || !this.hasMore) return;
        const before = this.column.firstElementChild?.dataset.id ?? null;
        this._loadingEarlier = true;
        this.refreshFrame("earlier");
        const event = new CustomEvent("sf-message-log-load-earlier", {bubbles: true, composed: true, cancelable: true, detail: {before}});
        if (!this.dispatchEvent(event)) this.earlierFailed();
    }

    /** The host could not load earlier history: the button is pressable again. */
    earlierFailed() {
        this._loadingEarlier = false;
        this.refreshFrame("earlier");
    }

    scrollToLatest({instant = false, focus = false, settle = false} = {}) {
        const scroller = this.scroller;
        if (!scroller) {
            this._pendingLatest = {instant, focus, settle};
            return;
        }
        requestAnimationFrame(() => {
            scroller.scrollTo({top: scroller.scrollHeight, behavior: instant || reducedMotion() ? "instant" : "smooth"});
            const jump = scroller.querySelector(".sf-message-log__jump");
            if (jump) jump.hidden = true;
            if (focus) this.focusItem(this.column.lastElementChild);
            if (settle) requestAnimationFrame(() => { this._settling = false; });
        });
    }

    // ── keyboard ─────────────────────────────────────────────────────────────

    // What takes focus for a message: the host's own article when it drew one,
    // else the item. It is reachable by script and by the arrows, not by Tab:
    // a conversation of three hundred messages is not three hundred Tab stops.
    focusTarget(node) {
        if (!node) return null;
        const own = node.querySelector(":scope > article, :scope > [role='article']");
        const target = own ?? node;
        if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
        return target;
    }

    focusItem(node) {
        const target = this.focusTarget(node);
        target?.focus({preventScroll: false});
        return target;
    }

    // From a focused message: arrows go to the neighbour, Home and End to the
    // first and last message loaded. Keys pressed inside a message's own
    // controls are theirs, so only a key whose target is the message counts.
    onItemKey(event) {
        const item = event.target.closest?.(".sf-message-log__item");
        if (!item || this.focusTarget(item) !== event.target) return;
        let next = null;
        if (event.key === "ArrowUp") next = item.previousElementSibling;
        if (event.key === "ArrowDown") next = item.nextElementSibling;
        if (event.key === "Home") next = this.column.firstElementChild;
        if (event.key === "End") next = this.column.lastElementChild;
        if (!next) {
            // Up from the first loaded message is a request for what is above.
            if (event.key === "ArrowUp" && !item.previousElementSibling && this.hasMore) {
                event.preventDefault();
                this.requestEarlier();
            }
            return;
        }
        event.preventDefault();
        this.focusItem(next);
    }

    // The frame is the template; the items are not in it, so a change to them
    // redraws only the buttons and the empty state around them.
    refreshFrame(reason) {
        this.requestComponentUpdate(reason);
    }
}

const authorOf = (message) => String(message?.author ?? message?.author_name ?? "");

SfMessageLog.define("sf-message-log");
