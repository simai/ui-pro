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
// A message that grows -- an assistant's reply arriving in parts -- is a stream
// (standard simai.smart-component 1.3.8 §10.8, vocabulary 1.1.5 §5.2): the
// entry carries `growing` while the other side writes it, and the log reports
// begun, one chunk per change it draws, and exactly one of completed, failed or
// cancelled. cancel {id} stops drawing the growth at once and ends the stream
// cancelled; telling the other side to stop is the host's (the chat's stop).
//
// The items are built by hand and kept, not diffed by lit. A changed message is
// drawn again *in place* (§18.4): its item element stays, and while the focus
// or a selection is inside it the new drawing is laid over the old nodes
// instead of replacing them, so a button the person is on keeps the focus
// through every chunk. The frame (the earlier button, the jump button, the
// live region) is the template; the column of items is one node the template
// places and never replaces.
//
// From its component.json (§3, §4, §8, §11, §18.4): the settings are
// attributes and properties made by core/js/element-manifest.js, the words are
// lang/<locale>.json, the actions answer outcomes; the old name
// sf-message-log-load-earlier follows load-more until 2026-12-01 (aliases.json).
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {noteDeprecated} from "../../core/js/deprecations";
import {renderMessageLogTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

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

const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});

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

// The 1.0 spellings a host still writes, read until the aliases' day and
// noted (§16 item 20, §18.1).
const legacy = (kind, from, to) => noteDeprecated({
    component: "sf-message-log", tag: "sf-message-log", kind, from, to,
    since: aliases.since, remove_after: aliases.remove_after,
});

// Vocabulary 1.1.5 §2.2: `growing` -- the other side is still writing this
// entry. `pending` was its 1.0 name in this component.
const isGrowing = (message) => {
    if (typeof message?.growing === "boolean") return message.growing;
    if (message?.pending === true) {
        legacy("entry-field", "pending", "growing");
        return true;
    }
    return false;
};

const authorName = (message) => {
    if (message?.["author-name"] !== undefined) return String(message["author-name"] ?? "");
    if (message?.author_name !== undefined) {
        legacy("entry-field", "author_name", "author-name");
        return String(message.author_name ?? "");
    }
    return "";
};

const authorOf = (message) => String(message?.author ?? authorName(message));

// `wait` (the chat's word, vocabulary §5.1): delayed | stopped | network |
// none; a null wait is none.
const waitOf = (message, view) => {
    const value = view?.wait ?? message?.wait ?? null;
    return value === null || value === undefined || value === "" ? "none" : String(value);
};

// How a stream ended, read from the entry the host gave last: stopped is
// cancelled, an error is failed, anything else is completed.
const endOf = (message, view) => {
    if (waitOf(message, view) === "stopped") return {fact: "cancelled"};
    const error = message?.error;
    if (error || message?.status === "failed" || message?.status === "error") {
        return {
            fact: "failed",
            reason: String((error && typeof error === "object" ? error.reason : error) || message?.reason || "failed"),
            message: String((error && typeof error === "object" ? error.message : "") || message?.message || ""),
        };
    }
    return {fact: "completed"};
};

// Lays a new drawing over the nodes already shown, keeping every node whose
// place and kind did not change -- the one with the focus among them. Text
// is written, attributes are brought level, extra nodes go, missing ones come.
function overlay(target, source) {
    if (target.nodeType !== source.nodeType || target.nodeName !== source.nodeName) {
        target.replaceWith(source);
        return;
    }
    if (target.nodeType === 3 || target.nodeType === 8) {
        if (target.data !== source.data) target.data = source.data;
        return;
    }
    if (target.nodeType === 1) {
        for (const {name} of [...target.attributes]) if (!source.hasAttribute(name)) target.removeAttribute(name);
        for (const {name, value} of [...source.attributes]) if (target.getAttribute(name) !== value) target.setAttribute(name, value);
        if ("value" in target && "value" in source && target.value !== source.value && target !== target.ownerDocument.activeElement) target.value = source.value;
    }
    const kept = [...target.childNodes];
    const given = [...source.childNodes];
    given.forEach((node, index) => {
        if (kept[index]) overlay(kept[index], node);
        else target.append(node);
    });
    for (const extra of kept.slice(given.length)) extra.remove();
}

const LogElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    aliases,
});

class SfMessageLog extends LogElement {
    static get props() {
        return {...super.props, templateName: {attribute: "template", default: "default"}};
    }

    constructor() {
        super();
        // id -> {message, view, node, flags, fingerprint}. Insertion order is
        // not display order; the column's children are.
        this._items = new Map();
        // id -> {cancelled}: the streams that have begun and not ended.
        this._streams = new Map();
        this._loadingEarlier = false;
        this._settling = false;
        this._pendingLatest = null;
        this._announced = new Map();
        this._renderMessage = null;
        this._announceMessage = null;
        this._column = null;
        if (Object.prototype.hasOwnProperty.call(this, "messages")) {
            const early = this.messages;
            delete this.messages;
            this.messages = early;
        }
    }

    // ── words ────────────────────────────────────────────────────────────────

    get regionLabel() {
        return this.getAttribute("label") || this.sfWord("region-label");
    }

    // ── host-provided rendering ──────────────────────────────────────────────

    /**
     * (message, context) => Node | string | null. context: {view, previous,
     * next, first, last, own, growing, index, document, log}. A string is drawn
     * as text, never parsed. Setting it redraws every message.
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
            logLabel: this.sfWord("log-label"),
            earlierText: this._loadingEarlier ? this.sfWord("loading-earlier-text") : this.sfWord("earlier-text"),
            latestLabel: this.sfWord("latest-label"),
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
        this.column.setAttribute("aria-label", this.sfWord("log-label"));
        if (this._pendingLatest) {
            const options = this._pendingLatest;
            this._pendingLatest = null;
            this.scrollToLatest(options);
        }
        this.syncJump();
    }

    // ── the conversation as a setting (§18.4) ────────────────────────────────

    /** The messages in display order, as the host gave them. */
    get messages() {
        return [...this.column.children].map((node) => this._items.get(node.dataset.id)?.message).filter(Boolean);
    }

    /**
     * The whole conversation, as a binding carries it. Compared by key with
     * what is shown: an entry that left is taken off, a new or changed one is
     * drawn in its place (changed by `changes`: revision or content), the rest
     * keep their nodes. An empty log takes it as setMessages does.
     */
    set messages(value) {
        const list = (Array.isArray(value) ? value : []).filter((message) => keyOf(message));
        if (!this._items.size) {
            this.setMessages(list, {hasMore: this.hasMore});
            return;
        }
        const wanted = new Set(list.map(keyOf));
        for (const key of [...this._items.keys()]) if (!wanted.has(key)) this.detach({id: key});
        let previous = null;
        for (const message of list) {
            const key = keyOf(message);
            if (this._items.has(key)) this.upsert(message);
            else this.insertAfter(message, previous);
            previous = this._items.get(key)?.node ?? previous;
        }
    }

    // A new entry the setting carries in the middle of what is shown stands
    // where the list puts it, not at the end.
    insertAfter(message, previousNode) {
        const atEnd = !previousNode || previousNode === this.column.lastElementChild;
        if (atEnd) {
            this.upsert(message);
            return;
        }
        const node = this.place(message, {});
        previousNode.after(node);
        this.syncRuns();
        this.track(this._items.get(keyOf(message)), null);
        this.maybeAnnounce(this._items.get(keyOf(message)));
        this.refreshFrame("insert");
    }

    // Two entries are the same message by `changes` (§18.4): revision -- the
    // host raises it with every change, a growing entry with every chunk -- or
    // content, the entry's fields and its view. An entry without a revision
    // is compared by content either way.
    same(existing, message, view) {
        // A stream's end is never an equal write, whatever the revision says.
        if (isGrowing(message) !== isGrowing(existing.message)) return false;
        if (this.changes === "revision" && message?.revision !== undefined && existing.message?.revision !== undefined) {
            return String(message.revision) === String(existing.message.revision) && stable(view) === stable(existing.view);
        }
        return existing.fingerprint === stable([message, view]);
    }

    // ── actions (§4.4) ───────────────────────────────────────────────────────


    // A printed skeleton (data-sf-first-paint="skeleton") stays until the host
    // gives the messages (standard 1.3.8 §5.4): the first render then draws them
    // over it in one frame. An empty list given is an answer too -- the empty
    // state draws -- where the base's test counts it as not yet given.
    sfAwaitingData() {
        return this.getAttribute("data-sf-first-paint") === "skeleton" && !this._sfDataGiven;
    }

    /** Replace the whole conversation and show its end. */
    setMessages(messages = [], options = {}) {
        this._sfDataGiven = true;
        if (messages && !Array.isArray(messages) && Array.isArray(messages.messages)) {
            options = messages.options ?? {};
            messages = messages.messages;
        }
        // Another conversation: nothing said about the last one stays to be
        // found, and nothing said about it is said again.
        this._announced.clear();
        const announcer = this.announcer;
        if (announcer) announcer.textContent = "";
        for (const key of this._streams.keys()) this.endStream(key, {fact: "cancelled"});
        this._items.clear();
        this.column.replaceChildren();
        for (const message of Array.isArray(messages) ? messages : []) {
            if (!keyOf(message) || this._items.has(keyOf(message))) continue;
            this.column.append(this.place(message, {}));
        }
        // What a conversation holds when it opens has been said already, by
        // whoever wrote it; only what changes from now on is news.
        for (const item of this._items.values()) {
            this._announced.set(keyOf(item.message), this.announcementOf(item));
            this.track(item, null);
        }
        this.syncRuns();
        this._loadingEarlier = false;
        this.hasMore = Boolean(options?.hasMore ?? options?.["has-more"]);
        this.refreshFrame("messages");
        // Until the end of the new conversation is in view, reaching the top is
        // not a request for earlier history: the column starts at the top for
        // one frame, and that frame used to ask for a page nobody wanted.
        this._settling = true;
        this.scrollToLatest({instant: true, settle: true});
        return applied();
    }

    /** Earlier history above, without moving what is being read. Ends the earlier request. */
    prependMessages(messages = [], options = {}) {
        if (messages && !Array.isArray(messages) && Array.isArray(messages.messages)) {
            options = messages.options ?? {};
            messages = messages.messages;
        }
        const scroller = this.scroller;
        const before = scroller ? scroller.scrollHeight - scroller.scrollTop : 0;
        const fragment = this.ownerDocument.createDocumentFragment();
        for (const message of Array.isArray(messages) ? messages : []) {
            const key = keyOf(message);
            if (!key || this._items.has(key)) continue;
            fragment.append(this.place(message, {}));
            this._announced.set(key, this.announcementOf(this._items.get(key)));
        }
        this.column.prepend(fragment);
        this.syncRuns();
        // Measured from the bottom: what was under the reader's eyes is the same
        // distance from the end before and after the history above it grew.
        if (scroller) scroller.scrollTop = scroller.scrollHeight - before;
        this._loadingEarlier = false;
        this.hasMore = Boolean(options?.hasMore ?? options?.["has-more"]);
        this.refreshFrame("prepend");
        return applied();
    }

    /**
     * Add or update one message. `view` is what the host knows that the
     * message does not (a wait it stopped, the person's own rating); it reaches
     * the renderer and is kept until replaced. `replaces` names the id the
     * message had before -- a message sent with a local key that the server has
     * now numbered -- so it keeps its place instead of moving to the end.
     */
    upsert(message, view, {replaces = null} = {}) {
        if (message && message.message && typeof message.message === "object" && message.id === undefined) {
            ({message, view, options: {replaces = null} = {}} = message);
        }
        const key = keyOf(message);
        if (!key) return refused("no-id");
        const previousKey = replaces != null && this._items.has(String(replaces)) ? String(replaces) : key;
        const existing = this._items.get(previousKey);
        const stream = this._streams.get(previousKey);
        // A stream the person cancelled draws nothing more of it, its end
        // included: what they stopped at stays (vocabulary §5.1, the server may
        // still finish the reply). A write after the end is drawn as any is.
        if (existing && stream?.cancelled) {
            if (!isGrowing(message)) this._streams.delete(previousKey);
            return refused("cancelled");
        }
        const nextView = view ?? existing?.view ?? {};
        const atBottom = this.isNearBottom();
        if (existing && previousKey !== key) {
            this._items.delete(previousKey);
            this._announced.set(key, this._announced.get(previousKey));
            this._announced.delete(previousKey);
            if (stream) {
                this._streams.delete(previousKey);
                this._streams.set(key, stream);
            }
            existing.node.dataset.id = key;
            this._items.set(key, existing);
        }
        if (existing && this.same(existing, message, nextView)) {
            existing.message = message;
            return applied();
        }
        const before = existing ? {message: existing.message, view: existing.view} : null;
        if (existing) {
            existing.message = message;
            existing.view = nextView;
            existing.fingerprint = stable([message, nextView]);
            this.syncItem(existing);
            // In place (§18.4): the item element stays, only its drawing changes.
            this.draw(existing, ...this.neighbours(existing));
            this.syncRuns();
        } else {
            this.column.append(this.place(message, nextView));
            this.syncRuns();
        }
        const item = this._items.get(key);
        this.track(item, before);
        this.maybeAnnounce(item);
        this.refreshFrame("upsert");
        const followed = atBottom || (!existing && message.own === true);
        if (followed) requestAnimationFrame(() => this.scrollToLatest());
        else this.syncJump();
        return applied();
    }

    /** Merge into the view of a message already shown. */
    setView(id, view = {}) {
        if (id && typeof id === "object") ({id, view = {}} = id);
        const item = this._items.get(String(id));
        if (!item) return refused("unknown");
        return this.upsert(item.message, {...item.view, ...view});
    }

    /** Take one message off. A stream it was ends cancelled. */
    detach(params) {
        const key = String(params && typeof params === "object" ? params.id : params);
        const item = this._items.get(key);
        if (!item) return refused("unknown");
        if (this._streams.has(key)) this.endStream(key, {fact: "cancelled"});
        item.node.remove();
        this._items.delete(key);
        this._announced.delete(key);
        this.syncRuns();
        this.refreshFrame("detach");
        return applied();
    }

    // remove(id) was 1.0's detach. Without an argument it is the browser's
    // own Element.remove(): the element leaves the page.
    remove(...args) {
        if (!args.length) return super.remove();
        legacy("action", "remove", "detach");
        return this.detach({id: args[0]});
    }

    /**
     * Stop drawing a growing message (vocabulary §5.2 cancel {id}): what the
     * person sees stays where it is, its busy mark goes, and the stream ends
     * cancelled now. Telling the other side to stop writing is the host's.
     */
    cancel(params) {
        const key = String(params && typeof params === "object" ? params.id : params ?? "");
        const stream = this._streams.get(key);
        if (!stream) return refused(this._items.has(key) ? "not-growing" : "unknown");
        if (stream.cancelled) return refused("cancelled");
        stream.cancelled = true;
        const item = this._items.get(key);
        if (item) {
            item.view = {...item.view, wait: "stopped"};
            item.fingerprint = stable([item.message, item.view]);
            item.node.removeAttribute("aria-busy");
            this.draw(item, ...this.neighbours(item));
        }
        this.sfEmit("cancelled", {id: key});
        return applied();
    }

    /** Draw one message, or every one, again: after the renderer's own inputs changed. */
    redraw(params = null) {
        const id = params && typeof params === "object" ? params.id : params;
        const keys = id == null ? [...this._items.keys()] : [String(id)];
        for (const key of keys) {
            const item = this._items.get(key);
            if (item) this.draw(item, ...this.neighbours(item));
        }
        this.syncRuns();
        return applied();
    }

    /** The 1.0 setter of has-more. */
    setHasMore(value) {
        this.hasMore = Boolean(value);
        return applied();
    }

    // ── streams (§10.8, vocabulary §5.2) ─────────────────────────────────────

    // After an entry arrived or changed: a growing entry not yet followed has
    // begun; a followed one that changed is a chunk; one that stopped growing
    // has ended. A stream the person cancelled has ended already.
    track(item, before) {
        if (!item) return;
        const key = keyOf(item.message);
        const growing = isGrowing(item.message);
        const stream = this._streams.get(key);
        if (!stream) {
            if (!growing) return;
            this._streams.set(key, {cancelled: false, chunks: 0});
            this.sfEmit("begun", {id: key});
            return;
        }
        if (growing) {
            if (before && !stream.cancelled) {
                stream.chunks += 1;
                const detail = {id: key};
                if (item.message.revision !== undefined) detail.revision = item.message.revision;
                this.sfEmit("chunk", detail);
            }
            return;
        }
        if (stream.cancelled) {
            this._streams.delete(key);
            return;
        }
        this.endStream(key, endOf(item.message, item.view));
    }

    endStream(key, {fact, reason, message}) {
        const stream = this._streams.get(key);
        if (!stream) return;
        this._streams.delete(key);
        if (stream.cancelled) return;
        if (fact === "failed") this.sfEmit("failed", {id: key, reason: reason || "failed", message: message || ""});
        else if (fact === "cancelled") this.sfEmit("cancelled", {id: key});
        else this.sfEmit("completed", {id: key});
    }

    // ── items ────────────────────────────────────────────────────────────────

    place(message, view) {
        const key = keyOf(message);
        const node = this.ownerDocument.createElement("div");
        node.className = "sf-message-log__item";
        node.dataset.id = key;
        const item = {message, view: view ?? {}, node, flags: null, fingerprint: stable([message, view ?? {}])};
        this._items.set(key, item);
        this.syncItem(item);
        return node;
    }

    // What the item element itself says: whose side it is on, and whether the
    // other side is still writing it (aria-busy, vocabulary §2.2 growing).
    syncItem(item) {
        item.node.classList.toggle("sf-message-log__item--own", item.message.own === true);
        const busy = isGrowing(item.message) && !this._streams.get(keyOf(item.message))?.cancelled;
        if (busy) item.node.setAttribute("aria-busy", "true");
        else item.node.removeAttribute("aria-busy");
    }

    neighbours(item) {
        return [
            this._items.get(item.node.previousElementSibling?.dataset.id)?.message ?? null,
            this._items.get(item.node.nextElementSibling?.dataset.id)?.message ?? null,
        ];
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
        if (!item.flags) return;
        const context = {
            view: item.view,
            previous,
            next,
            first: item.flags.first,
            last: item.flags.last,
            own: item.message.own === true,
            growing: isGrowing(item.message),
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
        const shown = item.node.firstChild;
        // The person is inside this message -- the focus on its button, a
        // selection in its text: the new drawing is laid over the old nodes,
        // which stay, and the focus and the selection with them (§18.4).
        const active = this.ownerDocument.activeElement;
        const selection = this.ownerDocument.getSelection?.();
        const inside = (active && active !== item.node && item.node.contains(active))
            || (selection && selection.rangeCount > 0 && !selection.isCollapsed && item.node.contains(selection.anchorNode));
        if (shown && inside && item.node.childNodes.length === 1 && !(node instanceof DocumentFragment)) overlay(shown, node);
        else item.node.replaceChildren(node);
    }

    // Without a renderer a message is its author and its text: enough for a
    // log of people, and the shape a renderer replaces. Text only; a host that
    // has markup draws it itself, with its own sanitiser.
    renderDefault(message, {first, own}) {
        const doc = this.ownerDocument;
        const article = doc.createElement("article");
        article.className = "sf-message-log__message";
        const name = own ? this.sfWord("you-text") : authorName(message);
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
        // words. One's own message is not news to oneself; a growing one is not
        // finished.
        if (item.message.own === true || isGrowing(item.message)) return "";
        const words = String(item.message.text ?? "").replace(/\s+/g, " ").trim();
        if (!words) return "";
        const author = authorName(item.message).trim();
        return author ? `${author}: ${words}` : words;
    }

    maybeAnnounce(item) {
        if (!item || this.live === "off") return;
        const key = keyOf(item.message);
        const said = this.announcementOf(item);
        if (!said || this._announced.get(key) === said) return;
        this._announced.set(key, said);
        this.announce(said);
    }

    /** Say something once through the log's polite live region. */
    announce(params) {
        const words = params && typeof params === "object" ? params.text : params;
        const announcer = this.announcer;
        if (!announcer) return refused("not-drawn");
        const whole = String(words ?? "").replace(/\s+/g, " ").trim();
        const said = whole.length > ANNOUNCE_LIMIT ? `${whole.slice(0, ANNOUNCE_LIMIT)}…` : whole;
        // A changed text is what a screen reader hears; clearing first makes a
        // second identical sentence heard as well.
        announcer.textContent = "";
        setTimeout(() => {
            announcer.textContent = said;
        }, 60);
        return applied();
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
        if (this._loadingEarlier) return refused("loading");
        if (!this.hasMore) return refused("no-more");
        const before = this.column.firstElementChild?.dataset.id ?? null;
        this._loadingEarlier = true;
        this.refreshFrame("earlier");
        // Vocabulary §5 load-more {direction: before}; `before` names the first
        // message shown, as 1.0's sf-message-log-load-earlier did.
        if (!this.sfEmit("load-more", {direction: "before", before})) {
            this.earlierFailed();
            return refused("prevented");
        }
        return applied();
    }

    /** The host could not load earlier history: the button is pressable again. */
    earlierFailed() {
        this._loadingEarlier = false;
        this.refreshFrame("earlier");
        return applied();
    }

    scrollToLatest(params = {}) {
        const {instant = false, focus = false, settle = false} = params?.options ?? params ?? {};
        const scroller = this.scroller;
        if (!scroller) {
            this._pendingLatest = {instant, focus, settle};
            return applied();
        }
        requestAnimationFrame(() => {
            scroller.scrollTo({top: scroller.scrollHeight, behavior: instant || reducedMotion() ? "instant" : "smooth"});
            const jump = scroller.querySelector(".sf-message-log__jump");
            if (jump) jump.hidden = true;
            if (focus) this.focusItem(this.column.lastElementChild);
            if (settle) requestAnimationFrame(() => { this._settling = false; });
        });
        return applied();
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

SfMessageLog.define("sf-message-log");
