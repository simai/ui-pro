// A whole chat window on the host port simai.chat-port 1.0.0: the
// conversations, the open conversation, the field and whom one talks to. It
// came from simai/ui-chat (components/src/smart/chat-window, 0.3.1 on ui-chat
// 07bc988) with the D31 move (components live in the Framework or in ui-pro,
// owner 2026-10-26; the move approved 2026-10-27), last of the chat's four.
//
// It is a leaf with a declared port, as sf-data-view and sf-property-view
// are (component.json, x-decisions shape): it composes sf-thread-list,
// sf-message-log and sf-change-confirm (this package's conversation parts)
// with the chat's own sf-chat-composer, sf-chat-interlocutor and
// sf-chat-message, by tag -- the Loader brings each (rule.js) -- and gives
// them the chat's meaning through their public hooks: the log draws a
// message as an sf-chat-message (renderMessage) and says of it what the
// window decides (announceMessage); a proposal is the message's
// sf-change-confirm, answered here. It never talks to a server.
//
// The host's side. The port is handed with connect-port {port} (the base
// action, §4.1, §4.9; setHostPort its alias): an adapter {port, version,
// capabilities, raise(intent, payload)} that answers each intent with
// {answer, reason, text, data}. The host sets the port's data as settings
// (me, conversations, conversation, messages, history, feed-state, limits,
// interlocutors, notice, and the window's own conversation-list,
// composer-files, my-files) or several at once with set-data. Every intent
// is first an event of the window, sf-chat-window-<verb> {request-id,
// intent, kind, payload}, cancelable: a page that cancels it refuses it. A
// host with no port answers the event with the action settle {request-id,
// result} (the 0.3 method answer(request_id, result)), as 0.3 hosts answered chat-port:<name> -- those names follow
// until 2026-12-01 (aliases.json). An applied answer's data is applied as
// data, then settled says what the host answered.
//
// What stays here is what only the page sees: what was typed per
// conversation (never stored: U-05), which failed answer was asked again,
// where the focus goes, the passing line above the field and its undo. What
// is allowed, what is stored and what an answer says stays the host's.
//
// A capability the host does not declare (the setting capabilities, or the
// port's capabilities) is not offered, and its intent is answered
// `unavailable` here without an event. Mirai24's window needs things the
// port 1.0.0 has no word for -- the archive as a list of its own, the list's
// next page, files uploaded when picked, the list searched by title, a
// conversation pinned, «Мои файлы» and the task brief -- so they are the
// window's own capabilities (x-…, js/port.js), never in the port's name.
//
// Light DOM: the window's nodes keep the 0.3 classes (chat-shell__*,
// chat-files__*) that pages style and test, and the page adds its own
// furniture (the skip link, the side panel's buttons) into `parts` before
// it is connected.
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {pageLocale} from "../../core/js/page-language";
import {renderChatWindowTemplate} from "./js/templates/default.js";
import {stageKey, textButton} from "../chat-message/js/view/message.js";
import {FilesView} from "./js/files-view.js";
import {registerPartWords} from "./js/part-words.js";
import {
    ANSWERS, DATA, EXTENSION_DATA, EXTENSION_INTENTS, INTENTS, SUPPORTED_PORT_VERSIONS, formerOf, verbOf,
} from "./js/port.js";
import manifest from "./component.json";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

const PENDING = new Set(["queued", "running"]);
// The waits a host reports beside a pending answer; any other value (Mirai24
// sends 'none' after a failed poll) means nobody is waiting for it.
const WAITS = new Set(["stopped", "delayed", "network"]);
// Reasons the window knows and says nothing about itself: the page is told of
// an ended session by its host, an undeclared capability was never shown, a
// page that cancelled the event knows why.
const SILENT_REASONS = new Set(["session-expired", "capability-not-provided", "superseded", "prevented"]);

// The words of the 0.3 table (threads.searchEmpty) as lang/ names (threads-search-empty).
const wordName = (key) => String(key).replace(/[._]/gu, "-").replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);

// The port's data under their setting names (feed_state is the setting feed-state).
const SETTING_OF = Object.fromEntries([...DATA, ...EXTENSION_DATA].map((name) => [name, name.replace(/_/gu, "-")]));
const camel = (name) => name.replace(/[-_]([a-z])/gu, (match, letter) => letter.toUpperCase());

let requests = 0;
let windows = 0;

/** A client_key per action (port: the same key retried is one message). */
function clientKey() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((one) => one.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const keyOf = (message) => String(message.id ?? message.local?.client_key ?? "");

// The view as compared between redraws: what is being typed into «why not
// helpful» and whether the sources are open are the reader's doing, already
// on the page, not a change of the message to draw again.
const QUIET_VIEW = new Set(["draft", "sources_open", "brief_draft"]);
const viewKeyOf = (view) => JSON.stringify(view ?? null, (key, value) => (QUIET_VIEW.has(key) ? undefined : value));

// A search is asked for once typing pauses this long.
const SEARCH_DELAY_MS = 300;

// The parts the window places and calls; the conversation waits for them.
// sf-change-confirm is placed by the messages and needs nothing from the
// window but its events; sf-thread-list is brought when its panel is shown
// (a hidden side panel on a phone, ui-0edd49be08f8) and filled whenever it
// is defined.
const PARTS = ["sf-message-log", "sf-chat-message", "sf-chat-composer", "sf-chat-interlocutor"];

/**
 * A port message as sf-chat-message draws it (API.md's shape, which the view
 * was written for): kind -> role, body -> text, files -> attachments.
 * Verification and notices are read both as the port's objects and as
 * Mirai24's plain values.
 */
export function toView(message) {
    const assistant = message.kind === "assistant";
    const view = {
        id: keyOf(message),
        role: assistant ? "assistant" : "user",
        // What sf-message-log reads: who wrote it (two authors, so a question
        // and its answer are two runs), whether it is the person's own (the
        // log follows the bottom for it), and whether it is still written.
        author: assistant ? "assistant" : "user",
        own: !assistant,
        pending: assistant && PENDING.has(message.status),
        text: message.body ?? "",
        // A file the host names a download address for downloads from it.
        attachments: (message.files || []).map((file) => ({
            id: file.id ?? file.key, name: file.name, bytes: file.size ?? undefined,
            ...(file.download_url ? {href: file.download_url} : {}),
        })),
    };
    if (message.created_at) view.created_at = message.created_at;
    if (!assistant) return view;
    const verification = message.verification;
    return Object.assign(view, {
        status: message.status,
        stage: message.stage ?? null,
        html: message.html ?? null,
        sources: message.sources || [],
        verification: typeof verification === "string" ? verification : (verification?.state ?? null),
        notices: (message.notices || []).map((one) => (typeof one === "string" ? one : one?.text)).filter(Boolean),
        proposal: message.proposal ?? null,
        finished_at: message.finished_at ?? null,
        // Each only when the host gives it: a host without them draws as before.
        ...(message.feedback !== undefined ? {feedback: message.feedback} : {}),
        ...(message.summary !== undefined ? {summary: message.summary} : {}),
        ...(message.limit_resets_at !== undefined ? {limit_resets_at: message.limit_resets_at} : {}),
        // The task brief (API.md v1.2, x-brief), drawn only where it is offered.
        ...(message.brief ? {brief: message.brief} : {}),
    });
}

// The 0.3 detail of each renamed event: {request_id, ...payload} under the
// old name the intent went out as (port.js former), and the 0.3 answer fact.
function formerAdapters() {
    const adapters = {};
    const names = new Set([...Object.values(INTENTS), ...Object.values(EXTENSION_INTENTS)].map((spec) => spec.former));
    for (const name of names) {
        adapters[name] = (detail) => (detail && formerOf(detail) === name
            ? {request_id: detail["request-id"], ...(detail.payload || {})}
            : undefined);
    }
    adapters["sf-chat-window-answer"] = (detail) => (detail ? {
        request_id: detail["request-id"],
        intent: detail.intent,
        payload: detail.payload,
        answer: detail.answer,
        reason: detail.reason ?? null,
    } : undefined);
    return adapters;
}

const applied = () => ({outcome: "applied"});

const ChatWindowElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    aliases,
    actions: {
        "set-data"({data}) {
            this.applyData(data);
            return applied();
        },
        // The 0.3 answer(request_id, result) stays the element's method (a
        // host without a port calls it); the action is its manifest form.
        settle({"request-id": requestId, result}) {
            return this.answer(requestId, result) ? applied() : {outcome: "refused", reason: "unknown-request"};
        },
        "start-conversation"() {
            return this.startConversation().then(applied);
        },
        "open-conversation"({id}) {
            return this.openConversation(id).then(applied);
        },
        "focus-composer"() {
            this.focusComposer();
            return applied();
        },
        "open-files"() {
            if (!this.has("x-my-files")) return {outcome: "refused", reason: "capability-not-provided"};
            return this.openFiles().then(applied);
        },
        "close-files"({focus}) {
            this.closeFiles({focus: focus !== false});
            return applied();
        },
        "set-list-footer"({node}) {
            this.setListFooter(node);
            return applied();
        },
    },
});

class SfChatWindow extends ChatWindowElement {
    constructor() {
        super();
        this._data = {
            me: null, conversations: [], conversation: null, messages: [], history: {has_older: false},
            feed_state: "ready", limits: {}, interlocutors: [], notice: null,
            conversation_list: {archived: false, has_more: false, loading: false}, composer_files: [], my_files: null,
        };
        this._root = null;
        this._requests = new Map();  // request-id -> {intent, payload, resolve}
        this._drafts = new Map();    // draft key -> typed text, this page only
        this._retried = new Set();   // failed answers asked again: no second «Повторить»
        this._ratings = new Map();   // message key -> the rating given on this page {value, reason, note, asking, draft}
        this._sourcesOpen = new Set(); // message keys whose sources the reader opened
        this._searchTimer = null;    // the pause before a search is asked for
        this._searchStatus = false;  // the list says «nothing found» for a search
        this._repeats = new Set();   // client_keys of questions asked again (U-09)
        this._shown = new Map();     // message key -> {message, viewKey} last given to the list
        this._drawn = new Map();     // message key -> its sf-chat-message, kept across redraws
        this._features = {feedback: true, proposals: true, memory: true, brief: false};
        this._briefDrafts = new Map(); // message key -> what is chosen among a brief's questions, this page only
        this._partsReady = false;    // the parts are defined and upgraded
        this._threadsReady = false;  // sf-thread-list is defined (it may come later)
        this._held = new Set();      // what changed while they were not
        this._footer = null;         // what the page puts under the list (Mirai24: spending)
        this._files = null;          // «Мои файлы» (x-my-files), made with the shell
        this._interlocutor = null;   // whom a new conversation is with
        this._sending = 0;           // sends and decisions awaiting their answer
        this._navigating = 0;        // opens and new conversations awaiting theirs
        this._started = false;
        this._afterMessages = 0;     // the frame that marks the drawn messages
        // A value set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        for (const name of ["capabilities", ...Object.keys(SETTING_OF), ...Object.values(SETTING_OF).map(camel)]) {
            if (!Object.prototype.hasOwnProperty.call(this, name)) continue;
            const early = this[name];
            delete this[name];
            this[name] = early;
        }
    }

    // --- the host's side ---------------------------------------------------

    /** The capabilities: the setting's words and the connected port's. */
    get offered() {
        const own = String(this.getAttribute("capabilities") || "").split(/\s+/u).filter(Boolean);
        const port = this.sfPort?.capabilities;
        return new Set([...own, ...(Array.isArray(port) ? port : [])]);
    }

    get capabilities() {
        return this.getAttribute("capabilities") || "";
    }

    // The 0.3 property took a list as well as the words.
    set capabilities(value) {
        const list = typeof value === "string" ? value.split(/\s+/u) : [...(value || [])];
        this.setAttribute("capabilities", list.filter(Boolean).join(" "));
    }

    has(capability) {
        return this.offered.has(capability);
    }

    attributeChangedCallback(name, previous, next) {
        super.attributeChangedCallback?.(name, previous, next);
        if (name !== "capabilities" || previous === next) return;
        if (this._started) this.sync(new Set(["capabilities"]));
        // The entry under the list does not wait for the conversation's data.
        else this.syncFooter();
    }

    // connect-port's hook (§4.9): the port is kept by the base (sfPort); the
    // window reads its capabilities beside the setting's.
    onPortConnected(port) {
        if (!port || typeof port.raise !== "function") throw new TypeError("sf-chat-window: the port has no raise(intent, payload)");
        if (port.version && !SUPPORTED_PORT_VERSIONS.includes(String(port.version))) {
            throw new TypeError(`sf-chat-window takes simai.chat-port ${SUPPORTED_PORT_VERSIONS.join(", ")}`);
        }
        if (this._started) this.sync(new Set(["capabilities"]));
        else this.syncFooter();
    }

    /** Set several of the port's data at once; unknown keys are ignored. */
    applyData(partial = {}) {
        const changed = new Set();
        if (!partial || typeof partial !== "object") return this;
        for (const key of [...DATA, ...EXTENSION_DATA]) {
            // The port's name, or the setting's (feed-state) and its property (feedState).
            const given = [key, SETTING_OF[key], camel(SETTING_OF[key])].find((name) => Object.prototype.hasOwnProperty.call(partial, name));
            if (given === undefined) continue;
            this._data[key] = partial[given];
            changed.add(key);
        }
        if (changed.size) this.sync(changed);
        return this;
    }

    /**
     * The host's answer to an intent, for a host without a port. Must be one
     * of the port's answers; an applied answer's data is applied before the
     * intent's own follow-up runs.
     */
    answer(requestId, result) {
        const pending = this._requests.get(requestId);
        if (!pending) return false;
        if (!result || !ANSWERS.includes(result.answer)) throw new TypeError("sf-chat-window: the host answer is not one of the port answers");
        this._requests.delete(requestId);
        this.finish(requestId, pending, result);
        return true;
    }

    // An answer, from the port or from answer(): its data first, then the
    // fact, said before the window's own follow-up, which runs a microtask
    // later -- a page that closes its side panel on it does so before the
    // focus moves.
    finish(requestId, pending, result) {
        if (result.answer === "applied" && result.data && typeof result.data === "object") this.applyData(result.data);
        this.sfEmit("settled", {
            "request-id": requestId,
            intent: pending.intent,
            payload: pending.payload,
            answer: result.answer,
            reason: result.reason ?? null,
        });
        pending.resolve(result);
    }

    /** What the page wants under the list of conversations (Mirai24: spending). */
    setListFooter(node) {
        this._footer = node || null;
        this.syncFooter();
    }

    // Under the list: «Мои файлы» when the host has them, then the page's own.
    syncFooter() {
        if (!this._threadsReady) return;
        const {threads} = this.parts;
        const nodes = [this.has("x-my-files") ? this._files.entry : null, this._footer].filter(Boolean);
        if (nodes.length) threads.setSlot("footer", ...nodes); else threads.clearSlot("footer");
    }

    /** The field; from «Мои файлы» it is the way back to the conversation. */
    focusComposer(options) {
        this.closeFiles({focus: false});
        this.parts.composer.focus(options);
    }

    /** «Новый разговор», wherever the page puts the button. */
    async startConversation() {
        this.closeFiles({focus: false});
        if (this._data.conversation_list?.archived) this.showList(false);
        this._navigating++;
        const result = await this.request("conversation.create", {interlocutor: this.interlocutorId});
        this._navigating--;
        if (result.answer === "applied") this.focusComposer();
        else this.showResult(result);
    }

    async openConversation(id) {
        this.closeFiles({focus: false});
        this.notify("");
        this._navigating++;
        const result = await this.request("conversation.open", {conversation_id: id});
        this._navigating--;
        this.showResult(result, () => this.openConversation(id));
    }

    // --- requests ----------------------------------------------------------

    /**
     * Raise one intent: the event sf-chat-window-<verb> {request-id, intent,
     * kind, payload}, then the port's raise, or the host's answer(). Resolves
     * with the host's answer; an undeclared capability resolves `unavailable`
     * without asking, a cancelled event `refused`.
     */
    request(intent, payload = {}) {
        const spec = INTENTS[intent] || EXTENSION_INTENTS[intent];
        if (!spec) throw new Error(`sf-chat-window: unknown intent ${intent}`);
        if (spec.capability && !this.has(spec.capability)) return Promise.resolve({answer: "unavailable", reason: "capability-not-provided"});
        const requestId = `chat-window-${++requests}`;
        const detail = {"request-id": requestId, intent, ...(spec.kind ? {kind: spec.kind} : {}), payload};
        const port = this.sfPort;
        return new Promise((resolve) => {
            const pending = {intent, payload, resolve};
            if (!port) this._requests.set(requestId, pending);
            const allowed = this.sfEmit(verbOf(intent, payload), detail, {cancelable: true});
            if (!allowed) {
                this._requests.delete(requestId);
                resolve({answer: "refused", reason: "prevented"});
                return;
            }
            if (!port) return;
            Promise.resolve()
                .then(() => port.raise(intent, payload))
                .then((result) => (result && ANSWERS.includes(result.answer) ? result : {answer: "unavailable", reason: "port-answer"}),
                    (error) => ({answer: "unavailable", reason: error?.name === "AbortError" ? "superseded" : "port-failed"}))
                .then((result) => this.finish(requestId, pending, result));
        });
    }

    /** A refusal in the host's words, with the way to try again where there is one. */
    showResult(result, retry) {
        if (!result || result.answer === "applied") return;
        if (SILENT_REASONS.has(result.reason)) return;
        this.showInlineError(result.text || result.reason || this.words("error.load"), retry);
    }

    // --- the view's context ------------------------------------------------

    /** The context the shared drawing helpers take (chat-message js/view/message.js). */
    get ctx() {
        if (!this._ctx) {
            const documentRef = this.ownerDocument;
            const self = this;
            this._ctx = {
                document: documentRef,
                get locale() { return pageLocale(self); },
                words: (key, values = {}) => this.sfWord(wordName(key), {vars: values}),
                icon(name, {size = ""} = {}) {
                    const icon = documentRef.createElement("sf-icon");
                    icon.setAttribute("icon", name);
                    if (size) icon.setAttribute("size", size);
                    icon.setAttribute("aria-hidden", "true");
                    return icon;
                },
            };
        }
        return this._ctx;
    }

    get words() {
        return this.ctx.words;
    }

    // --- build -------------------------------------------------------------

    get parts() {
        this.root;
        return this._parts;
    }

    get root() {
        if (!this._root) this._root = this.build();
        return this._root;
    }

    templateContext() {
        return {component: this, node: this.root};
    }

    template() {
        return renderChatWindowTemplate(this.templateContext());
    }

    build() {
        const doc = this.ownerDocument;
        const words = this.words;
        const element = (tag, className, attributes = {}) => {
            const node = doc.createElement(tag);
            if (className) node.className = className;
            for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
            return node;
        };
        registerPartWords({ru, en});
        this._headingTag = Number(this.getAttribute("heading-level")) === 2 ? "h2" : "h1";
        this._files = new FilesView(this);

        // sf-chat-surface: the message's sheet sets its tokens there, so the
        // window's notices (an error's «Повторить») read as a message's do.
        const shell = element("div", "chat-shell sf-chat-surface");
        if (this.hasAttribute("embedded") && this.getAttribute("embedded") !== "false") shell.classList.add("chat-shell--embedded");
        // The list inside names itself («Разговоры»); the aside adds no second name (Q-11).
        const side = element("aside", "chat-shell__side", {id: "chat-side"});
        const sideHead = element("div", "chat-shell__side-head");
        const threads = element("sf-thread-list");
        const search = this.buildSearch(element, words);
        side.append(sideHead, search.box, threads);
        // Embedded in a page that has its own <main>, the window is a labelled region.
        const main = element(this.getAttribute("landmark") === "section" ? "section" : "main", "chat-shell__main");
        const pageTitle = element(this._headingTag, "sf-chat-offscreen chat-shell__page-title");
        const header = element("header", "chat-shell__header");
        const interlocutor = element("sf-chat-interlocutor");
        const threadTitle = element("span", "chat-shell__thread-title");
        const spacer = element("div", "chat-shell__spacer");
        header.append(interlocutor, threadTitle, spacer);
        const list = element("sf-message-log", "chat-shell__list");
        const files = this._files.build(this._headingTag);
        const composerBox = element("div", "chat-shell__composer", {id: "chat-composer", tabindex: "-1"});
        const composer = element("sf-chat-composer");
        // What happened just now (archived, restored), with its one way back;
        // and, over an archived conversation, a standing note with the way out.
        const statusLine = element("div", "chat-shell__status", {role: "status", "aria-live": "polite"});
        const archivedNote = element("div", "chat-shell__status chat-shell__status--standing");
        archivedNote.hidden = true;
        const suggestions = element("ul", "sf-chat-greeting__suggestions chat-shell__suggestions", {"aria-label": words("empty.suggestions")});
        suggestions.hidden = true;
        composerBox.append(archivedNote, statusLine, composer, suggestions);
        main.append(pageTitle, header, list, files.root, composerBox);
        shell.append(side, main);
        this._parts = {
            shell, side, sideHead, main, header, threads, list, composer, composerBox, interlocutor, pageTitle, threadTitle, statusLine, archivedNote, suggestions,
            search: search.box, searchInput: search.input, searchStatus: search.status,
        };
        this.wire();
        Promise.all(PARTS.map((tag) => customElements.whenDefined(tag))).then(() => this.partsDefined());
        return shell;
    }

    // Above the list, the search by title (x-conversations-search): the
    // Framework's input markup with a label of its own, a pause before
    // asking, Escape to clear, and what was found said aloud.
    buildSearch(element, words) {
        const box = element("div", "chat-shell__search", {role: "search", "aria-label": words("threads.search")});
        box.hidden = true;
        const field = element("label", "sf-input sf-input--size-1 sf-input--filled flex flex-col chat-shell__search-field");
        const label = element("span", "sf-chat-offscreen");
        label.textContent = words("threads.search");
        const row = element("span", "sf-input-field items-cross-center transition flex");
        const icon = element("span", "sf-input-left flex");
        icon.append(this.ctx.icon("search", {size: "1"}));
        const input = element("input", "chat-shell__search-input", {
            type: "search", maxlength: "100", autocomplete: "off", enterkeyhint: "search", placeholder: words("threads.searchPlaceholder"),
        });
        row.append(icon, input);
        field.append(label, row);
        const status = element("span", "sf-chat-offscreen", {role: "status", "aria-live": "polite"});
        box.append(field, status);
        input.addEventListener("input", () => {
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => this.search(input.value), SEARCH_DELAY_MS);
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                clearTimeout(this._searchTimer);
                this.search(input.value);
            }
            // Escape clears a search first; on an empty field it is the
            // page's (the phone's side panel closes on it).
            if (event.key === "Escape" && input.value) {
                event.preventDefault();
                event.stopPropagation();
                input.value = "";
                clearTimeout(this._searchTimer);
                this.search("");
            }
        });
        return {box, input, status};
    }

    async search(query) {
        const value = String(query ?? "").trim();
        const before = String(this._data.conversation_list?.query ?? "");
        if (value === before && !this._searchFailed) return;
        const result = await this.request("conversations.search", {query: value});
        this._searchFailed = result.answer !== "applied" && result.reason !== "superseded";
        if (result.answer !== "applied") {
            this.showResult(result, () => this.search(this.parts.searchInput.value));
            return;
        }
        // Only a search that is still the one in the field is announced.
        if (value !== this.parts.searchInput.value.trim()) return;
        const count = (this._data.conversations || []).length;
        this.parts.searchStatus.textContent = !value ? ""
            : count ? this.words("threads.found", {count}) : this.words("threads.searchEmpty", {query: value});
    }

    // The parts are defined: upgrade ours (they may have been built before
    // the definition arrived), give the log the chat's drawing and words,
    // and hand over everything the host set meanwhile.
    partsDefined() {
        const {list, composer, interlocutor} = this._parts;
        for (const part of [list, composer, interlocutor]) customElements.upgrade(part);
        list.renderMessage = (message, context) => this.drawMessage(message, context);
        list.announceMessage = (message, context) => this.sayOf(message, context);
        // Once per page; SF.language may have come after the shell was built.
        registerPartWords({ru, en});
        this._partsReady = true;
        customElements.whenDefined("sf-thread-list").then(() => this.threadsDefined());
        const held = this._held;
        this._held = new Set();
        this.sync(new Set([...held, "interlocutors", "limits", "conversations", "conversation_list", "composer_files"]));
    }

    // The list arrived (it may come after the conversation): fill it with
    // what the host set meanwhile.
    threadsDefined() {
        customElements.upgrade(this._parts.threads);
        this._threadsReady = true;
        this.syncFooter();
        this.syncThreads();
        this.syncSelected();
    }

    wire() {
        const {threads, list, composer, interlocutor} = this._parts;
        threads.addEventListener("sf-thread-list-create", () => this.startConversation());
        threads.addEventListener("sf-thread-list-open", (event) => this.openConversation(event.detail.id));
        threads.addEventListener("sf-thread-list-rename", async (event) => {
            const result = await this.request("conversation.rename", {conversation_id: event.detail.id, title: event.detail.title});
            // The list shows a new title at once; a host that did not keep it
            // gets the stored one back, as the list asks.
            if (result.answer !== "applied") this.syncThreads();
            this.showResult(result);
        });
        threads.addEventListener("sf-thread-list-archive", (event) => this.archive(event.detail.id, true));
        // The list's own actions are one set for every row; «Pin» or «Unpin»
        // is put there for the row whose menu is about to open (capture runs
        // before the list's own handlers), so each row offers the one that
        // applies.
        threads.addEventListener("click", (event) => {
            const more = event.target.closest?.(".sf-thread-list__more");
            if (more) this.rowActions(more.closest(".sf-thread-list__item")?.dataset.id);
        }, true);
        threads.addEventListener("keydown", (event) => {
            if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") this.rowActions(event.target.closest?.(".sf-thread-list__link")?.dataset.id);
        }, true);
        threads.addEventListener("sf-thread-list-apply", (event) => {
            const {id, action} = event.detail;
            if (action === "pin" || action === "unpin") this.pin(id, action === "pin");
        });
        threads.addEventListener("sf-thread-list-restore", (event) => this.archive(event.detail.id, false));
        threads.addEventListener("sf-thread-list-toggle", (event) => this.showList(event.detail.archived));
        threads.addEventListener("sf-thread-list-load-more", () => this.more());
        interlocutor.addEventListener("sf-chat-interlocutor-select", (event) => this.choose(event.detail.id));
        list.addEventListener("sf-message-log-load-more", (event) => this.older(event.detail.before));
        // A proposal's answer, from its card. Not taken (a send in flight):
        // the event is cancelled and the card is open again.
        list.addEventListener("sf-change-confirm-answer", (event) => {
            if (!this.decide(event.detail.id, event.detail.accepted ? "confirm" : "cancel")) event.preventDefault();
        });
        // What a person pressed in a message (sf-chat-message's events).
        list.addEventListener("sf-chat-message-check", (event) => {
            this.request("wait.check", {message_id: event.detail.id}).then((result) => this.showResult(result));
        });
        list.addEventListener("sf-chat-message-rate", (event) => {
            const {id, value} = event.detail;
            if (Object.prototype.hasOwnProperty.call(event.detail, "reason") || Object.prototype.hasOwnProperty.call(event.detail, "note")) {
                this.rateWhy(id, event.detail.reason ?? null, event.detail.note ?? "");
            } else {
                this.rate(id, value);
            }
        });
        list.addEventListener("sf-chat-message-cancel", (event) => {
            if (event.detail.kind === "rate") this.rateWhy(event.detail.id, null, "", {skip: true});
        });
        list.addEventListener("sf-chat-message-retry", (event) => {
            const {id, key, kind} = event.detail;
            if (kind === "file") {
                this.request("file.retry", {conversation_id: this._data.conversation?.id ?? null, message_id: id, file_key: key})
                    .then((result) => this.showResult(result));
            } else if (id != null) {
                this.askAgain(id);
            }
        });
        list.addEventListener("sf-chat-message-submit", (event) => this.answerBrief(event.detail.id, event.detail.text));
        list.addEventListener("sf-chat-message-toggle", (event) => {
            // Remembered, not redrawn: the list is open on the page already.
            if (event.detail.kind !== "sources") return;
            const key = String(event.detail.id);
            if (event.detail.open) this._sourcesOpen.add(key); else this._sourcesOpen.delete(key);
        });
        // A message drew itself (sf-chat-message renders a frame after it is
        // given its message): the last answer and the waiting controls follow.
        list.addEventListener("sf-updated", (event) => {
            if (event.target?.localName === "sf-chat-message") this.messagesDrawn();
        });
        composer.addEventListener("sf-chat-composer-submit", (event) => {
            event.preventDefault();
            // The composer's own message takes every chip with it: the ready
            // ones go as the message's files, a refused one is cleared with them.
            this.sendMessage(event.detail.text, (this._data.composer_files || []).slice(), {own: true});
        });
        composer.addEventListener("sf-chat-composer-stop", () => {
            this.request("wait.stop", {conversation_id: this._data.conversation?.id ?? null}).then((result) => this.showResult(result));
        });
        composer.addEventListener("sf-chat-composer-attach", (event) => {
            const files = event.detail.files || [];
            if (!files.length) return;
            this.request("file.attach", {files, conversation_id: this._data.conversation?.id ?? null, interlocutor: this.interlocutorId})
                .then((result) => this.showResult(result));
        });
        composer.addEventListener("sf-chat-composer-detach", async (event) => {
            const result = await this.request("file.detach", {key: event.detail.id});
            if (result.answer === "applied") composer.focus();
        });
    }

    // --- intents with a follow-up ------------------------------------------

    // `own`: the composer's message, so its text goes with it; a suggestion,
    // a retry or a brief's answer leaves what is being typed alone.
    async sendMessage(body, files = [], {own = false, repeat = false} = {}) {
        const {composer} = this.parts;
        if (composer.busy) return undefined;
        const key = clientKey();
        if (repeat) this._repeats.add(key);
        return this.deliver(key, {own, typedFor: this.draftKey}, () => this.request("message.send", {
            conversation_id: this._data.conversation?.id ?? null,
            body,
            files,
            client_key: key,
            interlocutor: this.interlocutorId,
        }));
    }

    // The same action again under its first client_key (port: one message).
    resend(key, how) {
        if (this.parts.composer.busy) return undefined;
        return this.deliver(key, how, () => this.request("message.retry", {conversation_id: this._data.conversation?.id ?? null, client_key: key}));
    }

    async deliver(key, {own, typedFor}, ask) {
        this._sending++;
        this.syncBusy();
        const result = await ask();
        this._sending--;
        if (result.answer === "applied") {
            if (own) {
                this.parts.composer.clear();
                this._drafts.delete(typedFor);
            }
        } else {
            this.showResult(result, () => this.resend(key, {own, typedFor}));
        }
        this.syncBusy();
        return result;
    }

    // A rating is sent at once and shown pressed; «Не полезно» then asks
    // why, once, in place (API.md v1.1 reason). The window keeps the rating
    // of this page, so the message drawn again still shows it.
    rate(id, value) {
        const key = String(id);
        const before = this._ratings.get(key);
        this._ratings.set(key, value === "down" ? {value, asking: true, draft: {reason: null, note: ""}} : {value});
        this.redrawRated(key, value === "down" ? ".sf-chat-reason .sf-chat-chip--choice" : "[data-rating=\"up\"]");
        this.request("message.rate", {message_id: id, value}).then((result) => {
            if (result.answer === "applied") {
                if (value === "up") this.notify(this.words("action.thanks"));
                return;
            }
            if (before) this._ratings.set(key, before); else this._ratings.delete(key);
            this.redrawRated(key, `[data-rating="${value}"]`);
            this.showResult(result);
        });
    }

    // «Отправить» sends the rating again with its reason (the server keeps
    // the last one); «Не сейчас» keeps the plain «not helpful».
    rateWhy(id, reason, note, {skip = false} = {}) {
        const key = String(id);
        const entry = this._ratings.get(key);
        if (!entry) return;
        const text = String(note || "").trim();
        if (skip || (!reason && !text)) {
            this._ratings.set(key, {value: entry.value});
            this.redrawRated(key, "[data-rating=\"down\"]");
            return;
        }
        this._ratings.set(key, {value: "down", reason, note: text || null});
        this.redrawRated(key, "[data-rating=\"down\"]");
        this.request("message.rate", {message_id: id, value: "down", reason, note: text || null}).then((result) => {
            if (result.answer === "applied") {
                this.notify(this.words("feedback.sent"));
                return;
            }
            // Not kept: the question comes back with what was chosen and typed.
            this._ratings.set(key, {value: "down", asking: true, draft: {reason, note: text}});
            this.redrawRated(key, ".sf-chat-reason .sf-chat-chip--choice");
            this.showResult(result);
        });
    }

    // The rated message is drawn again; the focus, which was in it, goes to
    // the same control in the new drawing once the message has drawn it.
    redrawRated(key, selector) {
        const {list} = this.parts;
        const hadFocus = list.contains(this.ownerDocument.activeElement);
        const before = this.articleOf(key);
        this.syncMessages(new Set(["messages"]));
        if (!hadFocus) return;
        this.afterDraw(() => {
            const article = this.articleOf(key);
            return article && article !== before ? article : null;
        }, (article) => {
            const target = article?.querySelector(`${selector}[aria-pressed="true"]`) || article?.querySelector(selector);
            target?.focus({preventScroll: true});
        });
    }

    articleOf(key) {
        return this.parts.list.querySelector(`.sf-chat-message[data-id="${CSS.escape(String(key))}"]`);
    }

    // «Закрепить» or «Открепить» for the row whose menu opens.
    rowActions(id) {
        const {threads} = this.parts;
        const conversation = id ? (this._data.conversations || []).find((one) => String(one.id) === String(id)) : null;
        const offered = conversation && this.has("x-conversation-pin") && !this._data.conversation_list?.archived;
        threads.actions = offered
            ? [conversation.pinned ? {id: "unpin", text: this.words("threads.unpin"), icon: "push_pin"} : {id: "pin", text: this.words("threads.pin"), icon: "push_pin"}]
            : [];
    }

    async pin(id, pinned) {
        const result = await this.request("conversation.pin", {conversation_id: id, pinned});
        if (result.answer !== "applied") {
            this.showResult(result);
            return;
        }
        this.notify(this.words(pinned ? "threads.pinned" : "threads.unpinned"));
        this.afterDraw(() => this.parts.threads.querySelector(`.sf-thread-list__link[data-id="${CSS.escape(String(id))}"]`), (row) => this.refocus(row));
    }

    // «Подтвердить» or «Отменить» on a proposal: the host sends exactly its
    // command (port proposal.decide). The card waits as pending until the
    // server's verdict redraws it; refused, it is open again. Returns
    // whether the answer was taken.
    decide(code, decision) {
        const message = this._data.messages.find((one) => String(one.proposal?.code) === String(code));
        if (!message || this.parts.composer.busy) return false;
        this.deciding(message, message.proposal.code, decision);
        return true;
    }

    async deciding(message, code, decision) {
        this._sending++;
        this.syncBusy();
        const result = await this.request("proposal.decide", {message_id: message.id, code, decision});
        this._sending--;
        if (result.answer !== "applied") this.cardOf(code)?.setAttribute("state", "open");
        this.syncBusy();
        this.showResult(result, () => this.decide(code, decision));
    }

    cardOf(code) {
        return this.parts.list.querySelector(`sf-change-confirm[change-id="${CSS.escape(String(code))}"]`);
    }

    // An answer to a brief goes as the person's own message would (API.md
    // v1.2: POST messages with the option's label, the answers joined, or
    // the card's «Да»), leaving what is typed in the field alone; the field
    // then has the focus, since the brief that had it is now a record.
    async answerBrief(id, text) {
        const body = String(text ?? "").trim();
        if (!body || this.parts.composer.busy) return;
        const result = await this.sendMessage(body, []);
        if (result?.answer === "applied") {
            this._briefDrafts.delete(String(id));
            this.parts.composer.focus({preventScroll: true});
        }
    }

    // «Повторить» on a failed answer: the same question with the same files,
    // shown as a note rather than a second bubble of the same words (U-09).
    askAgain(id) {
        const messages = this._data.messages;
        const at = messages.findIndex((one) => keyOf(one) === String(id));
        const question = messages.slice(0, at).reverse().find((one) => one.kind === "person");
        if (!question?.body) return;
        this._retried.add(String(id));
        this.syncMessages(new Set());
        this.sendMessage(question.body, (question.files || []).filter((one) => one.id != null), {repeat: true});
    }

    async choose(id) {
        this.closeFiles({focus: false});
        const before = this._interlocutor;
        this._interlocutor = id;
        this._navigating++;
        const result = await this.request("interlocutor.choose", {interlocutor: id});
        this._navigating--;
        if (result.answer === "applied") {
            this.sync(new Set(["interlocutor"]));
            this.focusComposer();
        } else {
            this._interlocutor = before;
            this.sync(new Set(["interlocutor"]));
            this.showResult(result);
        }
    }

    async archive(id, archived) {
        const wasArchive = Boolean(this._data.conversation_list?.archived);
        const result = await this.request("conversation.archive", {conversation_id: id, archived});
        if (result.answer !== "applied") {
            this.showResult(result);
            return;
        }
        if (archived) {
            const undo = this.notify(this.words("threads.archived"), {label: this.words("threads.restore"), run: () => this.archive(id, false)});
            // The row that had the focus is gone: the way back takes it.
            this.refocus(undo);
            return;
        }
        if (wasArchive && !this._data.conversation_list?.archived) this.focusListHead();
        this.notify(this.words("threads.restored"));
        // The list draws the restored row a frame after it is given it.
        this.afterDraw(() => this.parts.threads.querySelector(`.sf-thread-list__link[data-id="${CSS.escape(String(id))}"]`), (row) => this.refocus(row));
    }

    async showList(archived) {
        const result = await this.request("conversations.view", {archived});
        if (result.answer === "applied") {
            this.focusListHead();
            return;
        }
        if (this._threadsReady) this.parts.threads.status = "";
        this.showResult(result, () => this.showList(archived));
    }

    async more() {
        const result = await this.request("conversations.more", {archived: Boolean(this._data.conversation_list?.archived)});
        if (result.answer === "applied") return;
        this.parts.threads.moreFailed();
        this.showResult(result);
    }

    async older(before) {
        const {list} = this.parts;
        const conversation = this._data.conversation;
        if (!conversation || before == null) {
            list.earlierFailed();
            return;
        }
        this._prepended = false;
        const result = await this.request("history.older", {conversation_id: conversation.id, before_id: before});
        if (result.answer !== "applied") {
            list.earlierFailed();
            this.showResult(result);
            return;
        }
        // Nothing earlier came (all known already): the list may ask again.
        if (!this._prepended && this._data.conversation?.id === conversation.id) list.prependMessages([], {hasMore: Boolean(this._data.history?.has_older)});
    }

    focusListHead() {
        this.afterDraw(() => this.parts.threads.querySelector(".sf-thread-list__head:not([hidden]) button:not([hidden])"), (button) => button?.focus());
    }

    // The parts draw a frame or two after the data they are given; what
    // waits for a node they draw asks again until it is there, briefly, and
    // then makes do without it.
    afterDraw(find, run, frames = 10) {
        const node = find();
        if (node || frames <= 0) {
            run(node);
            return;
        }
        requestAnimationFrame(() => this.afterDraw(find, run, frames - 1));
    }

    // --- what is derived from the data -------------------------------------

    /** Whom the open conversation, or the one being started, is with. */
    get interlocutorId() {
        const conversation = this._data.conversation;
        const listed = conversation ? this._data.conversations?.find((one) => String(one.id) === String(conversation.id)) : null;
        return conversation?.interlocutor ?? listed?.interlocutor ?? this._interlocutor ?? this._data.interlocutors?.[0]?.id ?? null;
    }

    get who() {
        const id = this.interlocutorId;
        return this._data.interlocutors?.find((one) => one.id === id) ?? null;
    }

    get draftKey() {
        const conversation = this._data.conversation;
        return conversation ? String(conversation.id) : `new:${this.interlocutorId || ""}`;
    }

    sync(changed) {
        const data = this._data;
        const parts = this.parts;
        if (changed.has("conversation") || changed.has("messages") || changed.has("feed_state")) this._started = true;
        if (!this._partsReady) {
            for (const key of changed) this._held.add(key);
            return;
        }
        // The open conversation's interlocutor is the one a new conversation
        // starts with after it, as before.
        if (changed.has("conversation") && data.conversation) {
            const listed = data.conversations?.find((one) => String(one.id) === String(data.conversation.id));
            const id = data.conversation.interlocutor ?? listed?.interlocutor;
            if (id) this._interlocutor = id;
        }
        if (changed.has("limits")) this.syncLimits();
        if (changed.has("conversations") || changed.has("conversation_list") || changed.has("interlocutors") || changed.has("capabilities")) this.syncThreads();
        if (changed.has("composer_files")) this.syncFiles();
        if (changed.has("capabilities")) {
            if (!this.has("x-my-files")) this.closeFiles({focus: false});
            this.syncFooter();
        }
        if (changed.has("my_files")) this.drawFiles();
        const revoked = data.feed_state === "revoked" || data.conversation?.revoked === true;
        if (revoked) this.revoke();
        const keyChanged = this.syncDraft();
        if (keyChanged || changed.has("interlocutors") || changed.has("interlocutor") || changed.has("capabilities")) this.syncInterlocutor();
        this.syncSelected();
        parts.composer.disabled = Boolean(data.conversation && data.conversation.can_send === false) || revoked;
        this.syncMessages(changed);
        this.syncLayout();
        this.syncBusy();
        if (changed.has("notice") && data.notice?.text) {
            if (data.notice.kind === "error") this.showInlineError(data.notice.text, typeof data.notice.retry === "function" ? data.notice.retry : null);
            else this.notify(data.notice.text);
        }
    }

    // The open conversation is marked in the list -- not while «Мои файлы»
    // stand in its place: then the entry is.
    syncSelected() {
        const {threads} = this.parts;
        const data = this._data;
        const selected = data.conversation && !this._files.open ? String(data.conversation.id) : "";
        if ((threads.getAttribute("selected") || "") !== selected) {
            if (selected) threads.setAttribute("selected", selected); else threads.removeAttribute("selected");
        }
    }

    syncLimits() {
        const {composer} = this.parts;
        const limits = this._data.limits || {};
        composer.setAttribute("maxlength", String(limits.body_chars || 4000));
        composer.setAttribute("max-files", String(limits.files_per_message || 5));
        if (limits.file_bytes) composer.setAttribute("max-bytes", String(limits.file_bytes));
        else composer.removeAttribute("max-bytes");
        composer.setAttribute("accept", (limits.file_types || []).map((one) => `.${one}`).join(","));
    }

    syncThreads() {
        const {threads, search, searchInput} = this.parts;
        const searching = this.has("x-conversations-search");
        search.hidden = !searching;
        if (!searching && searchInput.value) searchInput.value = "";
        // Not defined yet: filled by threadsDefined. A property set before
        // then would hide the element's own.
        if (!this._threadsReady) return;
        const meta = this._data.conversation_list || {};
        threads.toggleAttribute("archived", Boolean(meta.archived));
        threads.toggleAttribute("no-create", !this.has("conversation-create"));
        threads.toggleAttribute("no-manage", !this.has("conversation-manage"));
        if (meta.loading) {
            threads.setThreads([], {hasMore: false});
            threads.loading = true;
            return;
        }
        const conversations = this._data.conversations || [];
        threads.loading = false;
        threads.setThreads(conversations.map((one) => this.listed(one)), {hasMore: Boolean(meta.has_more)});
        // A search that found nothing says so in place of the list, not «no
        // conversations yet»; the list's own words come back with the next one.
        const query = String(meta.query || "");
        const nothing = Boolean(query) && conversations.length === 0;
        if (nothing) threads.status = this.words("threads.searchEmpty", {query});
        else if (this._searchStatus) threads.status = "";
        this._searchStatus = nothing;
    }

    // A conversation with another assistant than the first one names it on
    // a quiet second line (U-06); with the usual one the row stays one line.
    // A pinned one says so there too, first (v1.1). The list draws a caption
    // and does not know what it says.
    listed(conversation) {
        const others = (this._data.interlocutors || []).slice(1);
        const who = others.find((one) => one.id === conversation.interlocutor)?.title;
        const caption = [conversation.pinned ? this.words("threads.pinnedCaption") : "", who || ""].filter(Boolean).join(" · ");
        return caption ? {...conversation, caption} : conversation;
    }

    syncFiles() {
        const words = this.words;
        this.parts.composer.files = (this._data.composer_files || []).map((file) => ({
            id: file.id ?? file.key,
            localId: file.key,
            name: file.name,
            bytes: file.size,
            progress: file.state === "uploading" ? (file.progress ?? 0) : null,
            error: file.state === "failed" ? (file.reason || words("error.load")) : "",
        }));
    }

    // What was typed belongs to its conversation. A conversation the host
    // made from the one being started (its first file or message) keeps it.
    syncDraft() {
        const {composer} = this.parts;
        const next = this.draftKey;
        const previous = this._draftKey;
        if (next === previous) return false;
        this._draftKey = next;
        if (previous === undefined) {
            composer.value = this._drafts.get(next) || "";
            return true;
        }
        const born = previous.startsWith("new:") && this._data.conversation && this._navigating === 0;
        if (born) {
            const text = this._drafts.get(previous);
            this._drafts.delete(previous);
            if (text) this._drafts.set(next, text);
            return true;
        }
        const text = composer.value;
        if (text.trim()) this._drafts.set(previous, text); else this._drafts.delete(previous);
        composer.value = this._drafts.get(next) || "";
        return true;
    }

    revoke() {
        this._drafts.delete(this.draftKey);
        this.parts.composer.clear();
    }

    syncInterlocutor() {
        const {composer, list, interlocutor} = this.parts;
        const who = this.who;
        const caps = who?.capabilities;
        const options = this._data.interlocutors || [];
        // Without the capability the title stays, the choice goes.
        interlocutor.options = this.has("interlocutors") ? options : (who ? [who] : []);
        interlocutor.value = this.interlocutorId || "";
        // Files go up when picked (x-early-upload): the window has no other
        // way yet, so a host with `files` alone gets no attach button.
        composer.toggleAttribute("attachments", this.has("files") && this.has("x-early-upload") && Boolean(caps ? caps.attachments : true));
        const features = {
            feedback: this.has("feedback"),
            proposals: this.has("proposals") && Boolean(caps ? caps.proposals : true),
            memory: Boolean(caps ? caps.memory : true),
            brief: this.has("x-brief"),
        };
        if (JSON.stringify(features) !== JSON.stringify(this._features)) {
            this._features = features;
            list.redraw();
            this.messagesDrawn();
        }
        // The greeting is the log's empty state.
        const greeting = this.greeting();
        if (greeting) list.setSlot("empty", greeting); else list.clearSlot("empty");
    }

    greeting() {
        const who = this.who;
        const {suggestions} = this.parts;
        if (!who) return null;
        const doc = this.ownerDocument;
        const box = doc.createElement("section");
        box.className = "sf-chat-greeting";
        this._greetingId ??= `chat-greeting-title-${++windows}`;
        const titleId = this._greetingId;
        box.setAttribute("aria-labelledby", titleId);
        const title = doc.createElement(this._headingTag);
        title.className = "sf-chat-greeting__title";
        title.id = titleId;
        title.textContent = who.greeting || who.title;
        box.append(title);
        // The suggestions sit under the field (SPEC §4.1), where the eye already is.
        suggestions.replaceChildren(...(who.suggestions || []).slice(0, 4).map((suggestion) => {
            const item = doc.createElement("li");
            const button = doc.createElement("button");
            button.type = "button";
            button.className = "sf-chat-greeting__suggestion";
            button.textContent = suggestion;
            button.addEventListener("click", () => this.sendMessage(suggestion, []));
            item.append(button);
            return item;
        }));
        return box;
    }

    viewOf(message) {
        if (message.kind === "assistant") {
            // The rating given on this page; the stored one (message.feedback)
            // is the message's own and drawn from it.
            const rating = this._ratings.get(keyOf(message));
            return {
                wait: WAITS.has(message.wait) ? message.wait : null,
                retried: this._retried.has(keyOf(message)) || undefined,
                ...(rating ? {feedback: rating} : {}),
                ...(this._sourcesOpen.has(keyOf(message)) ? {sources_open: true} : {}),
                ...this.briefView(message),
            };
        }
        if (message.local?.client_key && this._repeats.has(message.local.client_key)) return {note: "repeat"};
        if (message.command?.kind) return {note: message.command.kind, code: message.command.code || ""};
        return this.noteOf(message);
    }

    // A brief (API.md v1.2) asks only from the conversation's last message,
    // while nobody has written after it; then it is a record, with the
    // question that followed it as the answer it shows.
    briefView(message) {
        if (!message.brief || !this._features.brief) return {};
        const key = keyOf(message);
        const messages = this._data.messages || [];
        const at = messages.findIndex((one) => keyOf(one) === key);
        const next = at >= 0 ? messages[at + 1] : null;
        const live = at >= 0 && !next && !PENDING.has(message.status);
        if (!live) {
            this._briefDrafts.delete(key);
            return {brief: {live: false, answer: next?.kind === "person" ? (next.body ?? null) : null}};
        }
        if (!this._briefDrafts.has(key)) this._briefDrafts.set(key, {});
        return {brief: {live: true}, brief_draft: this._briefDrafts.get(key)};
    }

    // A question whose words are a proposal's command (API.md 1.3) was a
    // button press: it shows as a note, after a reload as well, when the
    // host no longer says which command it was (U-10).
    noteOf(message) {
        if (!message.body) return undefined;
        for (const one of this._data.messages || []) {
            const proposal = one.proposal;
            if (!proposal) continue;
            if (message.body === proposal.confirm_command) return {note: "confirm", code: proposal.code};
            if (message.body === proposal.cancel_command) return {note: "cancel", code: proposal.code};
        }
        return undefined;
    }

    // --- the log's hooks ---------------------------------------------------

    /**
     * sf-message-log's renderMessage: the message's sf-chat-message, one
     * per message and kept across redraws, so a proposal's pressed card and
     * an open «why» card stay what they are; given the message, what the
     * window knows of it (display) and what the surface offers (features).
     */
    drawMessage(message, {view} = {}) {
        const key = String(message.id);
        let drawn = this._drawn.get(key);
        if (!drawn) {
            drawn = this.ownerDocument.createElement("sf-chat-message");
            this._drawn.set(key, drawn);
        }
        drawn.features = this._features;
        drawn.display = {...(view ?? {}), busy: Boolean(this.parts.composer.busy)};
        drawn.message = message;
        return drawn;
    }

    /**
     * sf-message-log's announceMessage: what is said of a message, once per
     * change of words. While an answer is awaited, each new stage and a
     * stopped or delayed wait (Q-03); when it is done, «Ответ готов» before
     * the answer and «Ответ с оговоркой» before a partial one; a refusal, a
     * limit or an error in its own words. Footnote marks are not read out
     * (Q-07); the log cuts a long answer itself. A question is not news to
     * whoever asked it.
     */
    sayOf(message, {view} = {}) {
        if (message.role !== "assistant") return "";
        if (PENDING.has(message.status)) return this.words(view?.wait ? `status.${view.wait}` : stageKey(message));
        const words = (message.text || "").replace(/\s*\[\d+\]/gu, "").replace(/\s+/gu, " ").trim();
        const head = message.status === "completed" ? this.words("list.answered")
            : message.status === "partial" ? this.words("status.partial") : "";
        return head ? `${head}. ${words}` : words;
    }

    // The messages drew themselves: once a frame, the last answer keeps its
    // tools in sight (earlier ones show them on hover), and what may not be
    // answered while a send is out waits with the field.
    messagesDrawn() {
        if (this._afterMessages) return;
        this._afterMessages = requestAnimationFrame(() => {
            this._afterMessages = 0;
            this.markLast();
            this.syncBusy();
        });
    }

    markLast() {
        const answers = this.parts.list.querySelectorAll(".sf-chat-message--assistant");
        answers.forEach((one, index) => one.classList.toggle("sf-chat-message--last", index === answers.length - 1));
    }

    /**
     * Hand the messages to the list without redrawing what did not change: a
     * new conversation or a finished load replaces the column, earlier
     * history goes above, the rest is upserted in order.
     */
    syncMessages(changed) {
        const {list} = this.parts;
        const data = this._data;
        const listKey = data.conversation ? `c:${data.conversation.id}` : this.draftKey;
        const feed = data.feed_state;
        const reload = listKey !== this._listKey || (feed === "loading") !== (this._feed === "loading") || feed === "revoked";
        const hasMore = Boolean(data.history?.has_older);
        this._listKey = listKey;
        this._feed = feed;
        const messages = feed === "revoked" ? [] : (data.messages || []);
        if (reload) {
            this._shown.clear();
            this._drawn.clear();
            this._waiting = false;
            for (const message of messages) this._shown.set(keyOf(message), {message, viewKey: viewKeyOf(this.viewOf(message))});
            list.setMessages(messages.map((message) => this.placed(message)), {hasMore});
            this.messagesDrawn();
            return;
        }
        if (!changed.has("messages") && !changed.has("history") && changed.size) return;
        const keys = new Set(messages.map(keyOf));
        for (const key of [...this._shown.keys()]) {
            if (keys.has(key)) continue;
            list.remove(key);
            this._shown.delete(key);
            this._drawn.delete(key);
        }
        const first = messages.findIndex((one) => this._shown.has(keyOf(one)));
        if (first > 0) {
            const earlier = messages.slice(0, first);
            for (const message of earlier) this._shown.set(keyOf(message), {message, viewKey: viewKeyOf(this.viewOf(message))});
            list.prependMessages(earlier.map((message) => this.placed(message)), {hasMore});
            this._prepended = true;
        } else if (changed.has("history")) {
            list.setHasMore(hasMore);
        }
        for (const message of messages.slice(Math.max(first, 0))) {
            const key = keyOf(message);
            const view = this.viewOf(message);
            const viewKey = viewKeyOf(view);
            const shown = this._shown.get(key);
            if (shown && shown.message === message && shown.viewKey === viewKey) continue;
            this._shown.set(key, {message, viewKey});
            list.upsert(toView(message), view);
        }
        this.messagesDrawn();
    }

    // setMessages and prependMessages take bare messages; the window's own
    // knowledge of one (a repeat, a stopped wait) is given to the list after.
    placed(message) {
        const view = this.viewOf(message);
        const drawn = toView(message);
        if (view && Object.values(view).some(Boolean)) {
            queueMicrotask(() => {
                this.parts.list.setView(drawn.id, view);
                this.messagesDrawn();
            });
        }
        return drawn;
    }

    // An empty conversation puts the greeting and the field in the middle of
    // the window; the first message sends the field to the bottom.
    syncLayout() {
        if (!this._started) return;
        const data = this._data;
        const {shell, suggestions, pageTitle} = this.parts;
        const empty = !data.conversation || (data.feed_state === "ready" && (data.messages || []).length === 0);
        shell.classList.toggle("chat-shell--empty", empty && !this._files.open);
        suggestions.hidden = !empty || !suggestions.childElementCount;
        // «Мои файлы» have a heading of their own.
        pageTitle.hidden = empty || this._files.open;
        this.syncTitles();
    }

    syncTitles() {
        const {threadTitle, pageTitle, archivedNote} = this.parts;
        const conversation = this._data.conversation;
        const listed = conversation ? this._data.conversations?.find((one) => String(one.id) === String(conversation.id)) : null;
        threadTitle.textContent = conversation?.title || "";
        pageTitle.textContent = conversation?.title || this.who?.title || "";
        const archived = conversation ? Boolean(conversation.archived ?? listed?.archived) : false;
        if (archived === this._archivedShown && conversation?.id === this._archivedFor) return;
        this._archivedShown = archived;
        this._archivedFor = conversation?.id;
        archivedNote.replaceChildren();
        archivedNote.hidden = !archived;
        if (archived) {
            const text = this.ownerDocument.createElement("span");
            text.textContent = this.words("threads.archivedOpen");
            const button = textButton(this.ctx, {label: this.words("threads.restore"), appearance: "link", scheme: "primary", className: "chat-shell__status-action"});
            const id = conversation.id;
            button.addEventListener("click", () => this.archive(id, false));
            archivedNote.append(text, button);
        }
    }

    // The field waits while a send is out or an answer is awaited; when the
    // last wait of this conversation ends, the focus goes back to the field.
    syncBusy() {
        const {composer, list} = this.parts;
        const waiting = (this._data.messages || []).some((one) => one.kind === "assistant" && PENDING.has(one.status) && one.wait == null);
        const busy = this._sending > 0 || waiting;
        composer.busy = busy;
        // While a send is out or an answer awaited, no proposal can be
        // answered: its command would be one more message in a turn that is
        // not over. Nor a brief: its fieldset waits with the field.
        for (const card of list.querySelectorAll("sf-change-confirm")) card.toggleAttribute("disabled", busy);
        for (const brief of list.querySelectorAll("fieldset.sf-chat-brief[data-live]")) brief.disabled = busy;
        if (this._waiting && !waiting && this._sending === 0) composer.focus({preventScroll: true});
        this._waiting = waiting;
    }

    // --- «Мои файлы» (x-my-files) ------------------------------------------

    /** Show the person's kept files in place of the conversation. */
    openFiles() {
        if (!this.has("x-my-files")) return Promise.resolve();
        const view = this._files;
        if (!view.open) {
            view.open = true;
            view.asking = null;
            view.problem = null;
            view.root.hidden = false;
            view.entry.setAttribute("aria-current", "page");
            this.parts.shell.classList.add("chat-shell--files");
            this.syncSelected();
            this.syncLayout();
        }
        // Asked for first: a page whose side panel covers the window closes
        // it on the event, and only then can the heading take the focus.
        const loading = this.loadFiles();
        view.title.focus({preventScroll: true});
        return loading;
    }

    /** Back to the conversation; `focus` puts the person in its field. */
    closeFiles({focus = true} = {}) {
        const view = this._files;
        if (!view?.open) return;
        view.open = false;
        view.asking = null;
        view.problem = null;
        view.root.hidden = true;
        view.entry.removeAttribute("aria-current");
        this.parts.shell.classList.remove("chat-shell--files");
        this.syncSelected();
        this.syncLayout();
        if (focus) this.parts.composer.focus({preventScroll: true});
    }

    async loadFiles() {
        const view = this._files;
        view.state = "loading";
        this.drawFiles();
        const result = await this.request("files.list");
        if (!view.open) return;
        if (result.answer === "applied") {
            view.state = "ready";
            this.drawFiles();
            const count = (this._data.my_files?.files || []).length;
            view.say(count ? this.words("files.count", {count}) : this.words("files.empty"));
            return;
        }
        if (result.reason === "superseded") return;
        view.state = "error";
        view.reason = SILENT_REASONS.has(result.reason) ? "" : (result.reason || "");
        this.drawFiles();
        view.say(view.reason || this.words("files.error"));
    }

    drawFiles() {
        if (this._files?.open) this._files.draw(this._data.my_files);
    }

    /** «Удалить» confirmed: the host deletes, the server's list comes back. */
    async removeFile(id) {
        const view = this._files;
        if (view.removing != null) return;
        const files = this._data.my_files?.files || [];
        const at = files.findIndex((one) => String(one.id) === String(id));
        const name = files[at]?.name ?? "";
        view.removing = id;
        this.drawFiles();
        view.rowOf(id)?.querySelector(".chat-files__ask")?.focus();
        const result = await this.request("files.remove", {file_id: id});
        view.removing = null;
        if (result.answer === "applied") {
            view.asking = null;
            view.problem = null;
            this.drawFiles();
            view.say(this.words("files.deleted", {name}));
            // The focus goes to the row now in its place, else to the heading.
            const rows = view.body.querySelectorAll(".chat-files__item");
            const next = rows[Math.min(Math.max(at, 0), rows.length - 1)];
            (next?.querySelector(".chat-files__download, .chat-files__delete") || view.title).focus({preventScroll: true});
            return;
        }
        // Refused or not reached: the question stays with the server's words.
        view.problem = SILENT_REASONS.has(result.reason) ? null : {id, text: result.reason || this.words("error.load")};
        this.drawFiles();
        view.rowOf(id)?.querySelector(".chat-files__confirm")?.focus();
    }

    // --- passing lines -----------------------------------------------------

    // A passing line goes after a while -- but not from under a pointer or
    // the focus, and never taking the focus with it: it returns to the field
    // (Q-02). `node` is what was shown (gone once replaced), `area` where.
    expire(node, ms, remove, area = node) {
        const doc = this.ownerDocument;
        const composer = this.parts.composer;
        setTimeout(function check() {
            if (!node.isConnected) return;
            if (area.matches(":hover, :focus-within")) {
                setTimeout(check, 1000);
                return;
            }
            const hadFocus = area.contains(doc.activeElement);
            remove();
            if (hadFocus) composer.focus({preventScroll: true});
        }, ms);
    }

    /** One line above the field: what was just done and, maybe, its undo. */
    notify(message, action) {
        const {statusLine} = this.parts;
        statusLine.replaceChildren();
        if (!message) return null;
        const text = this.ownerDocument.createElement("span");
        text.textContent = message;
        statusLine.append(text);
        if (action) {
            const button = textButton(this.ctx, {label: action.label, appearance: "link", scheme: "primary", className: "chat-shell__status-action"});
            button.addEventListener("click", () => {
                this.notify("");
                action.run();
            });
            statusLine.append(button);
            // A line with an action («Вернуть») stays until the next one replaces it.
            return button;
        }
        this.expire(text, 8000, () => statusLine.replaceChildren(), statusLine);
        return null;
    }

    showInlineError(message, retry) {
        const doc = this.ownerDocument;
        const {composerBox} = this.parts;
        const box = doc.createElement("div");
        box.className = "sf-chat-notice sf-chat-notice--failed chat-shell__error";
        box.setAttribute("role", "alert");
        const text = doc.createElement("p");
        text.className = "sf-chat-notice__text";
        text.textContent = message;
        box.append(text);
        if (retry) {
            // The same quiet action as a failed answer's «Повторить».
            const button = doc.createElement("button");
            button.className = "sf-chat-notice__action";
            button.type = "button";
            button.textContent = this.words("action.retry");
            button.addEventListener("click", () => {
                box.remove();
                retry();
            });
            box.append(button);
        }
        composerBox.querySelector(".chat-shell__error")?.remove();
        composerBox.prepend(box);
        // With a retry the error stays until it is used or replaced.
        if (!retry) this.expire(box, 12000, () => box.remove());
    }

    // Where the focus goes when what held it is gone (N-2): never to the page.
    refocus(target) {
        const doc = this.ownerDocument;
        if (doc.activeElement && doc.activeElement !== doc.body && doc.activeElement.isConnected) return;
        (target?.isConnected && target.offsetParent !== null ? target : this.parts.composer).focus({preventScroll: true});
    }

    // The 0.3 details of the renamed events (aliases.json, split rows).
    sfAliasAdapters() {
        return formerAdapters();
    }
}

// The port's data as properties: setting one is set-data {[name]: value}. Each
// under its setting's property (feedState) and its 0.3 port name (feed_state).
for (const name of [...DATA, ...EXTENSION_DATA]) {
    const descriptor = {
        configurable: true,
        get() { return this._data[name]; },
        set(value) { this.applyData({[name]: value}); },
    };
    Object.defineProperty(SfChatWindow.prototype, name, descriptor);
    Object.defineProperty(SfChatWindow.prototype, camel(SETTING_OF[name]), descriptor);
}

SfChatWindow.define("sf-chat-window");

