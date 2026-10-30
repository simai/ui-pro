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
// is first an event of the window, sf-chat-window-<verb> {requestId,
// intent, kind, payload}, cancelable: a page that cancels it refuses it. A
// host with no port answers the event with the action settle {requestId,
// result} (the 0.3 method answer(request_id, result)), as 0.3 hosts answered chat-port:<name> -- those names follow
// until 2026-12-01 (aliases.json). An applied answer's data is applied as
// data, then settled says what the host answered.
//
// What stays here is what only the page sees: what was typed per
// conversation (never stored: U-05), which failed answer was asked again,
// where the focus goes, the passing line above the field and its undo, the
// questions asked while an answer was awaited (the queue, 1.1.0), the
// search within the open conversation (1.1.0) and the source preview beside
// it (1.2.0), and, between people (1.3.0), which message is being edited or
// asked about, where the unread part began and what was last reported read.
// What is allowed, what is stored and what an answer says stays the host's.
//
// A capability the host does not declare (the setting capabilities, or the
// port's capabilities) is not offered, and its intent is answered
// `unavailable` here without an event. Mirai24's window needs things the
// port 1.0.0 has no word for -- the archive as a list of its own, the list's
// next page, files uploaded when picked, the list searched by title, a
// conversation pinned, «Мои файлы» and the task brief -- so they are the
// window's own capabilities (x-…, js/port.js), never in the port's name. So are
// a new conversation or group with the people found for it (1.4.0,
// x-conversation-start, js/start-view.js) and a group's members, read only
// (1.4.0, x-members, js/members-view.js).
//
// Light DOM: the window's nodes keep the 0.3 classes (chat-shell__*,
// chat-files__*) that pages style and test, and the page adds its own
// furniture (the skip link, the side panel's buttons) into `parts` before
// it is connected.
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {pageLocale} from "../../core/js/page-language";
import {renderChatWindowTemplate} from "./js/templates/default.js";
import {iconButton, stageKey, stepsSay, textButton} from "../chat-message/js/view/message.js";
import {PROPOSED_MESSAGE_FIELDS} from "../chat-message/js/view/proposed.js";
import {FilesView} from "./js/files-view.js";
import {MembersView} from "./js/members-view.js";
import {StartView} from "./js/start-view.js";
import {hasMembers} from "./js/start-model.js";
import {PREVIEW_DOCK_MIN, PreviewView} from "./js/preview-view.js";
import {registerPartWords} from "./js/part-words.js";
import {compareRevisions, keyOf, runsOf, toPersonView, unreadKeyOf} from "./js/people.js";
import {
    ANSWERS, DATA, EXTENSION_DATA, EXTENSION_INTENTS, INTENTS, SUPPORTED_PORT_VERSIONS, formerOf, kindOf, verbOf,
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
let queued = 0;

/** A client_key per action (port: the same key retried is one message). */
function clientKey() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((one) => one.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


// The view as compared between redraws: what is being typed into «why not
// helpful» and whether the sources are open are the reader's doing, already
// on the page, not a change of the message to draw again.
// An edit's typed text (editing.body) is the reader's too.
const QUIET_VIEW = new Set(["draft", "sources_open", "steps_open", "brief_draft", "body"]);
const viewKeyOf = (view) => JSON.stringify(view ?? null, (key, value) => (QUIET_VIEW.has(key) ? undefined : value));

// Between people (1.3.0): the last message seen is reported at most this often.
const READ_EVERY_MS = 2000;

// A search is asked for once typing pauses this long.
const SEARCH_DELAY_MS = 300;

// An answer that ended so lets the queue go on; any other end holds it.
const ANSWERED = new Set(["completed", "partial"]);
// Why a held queue was not sent (queue-held-<reason>): an answer's status,
// a wait that is not over, a send that did not go, a conversation left.
const HELD_REASON = {
    failed: "failed", limit: "limit", refused: "refused", withheld: "refused",
    stopped: "stopped", unfinished: "unfinished", unsent: "unsent", left: "left",
};

// The text a search in the conversation reads: a question's bubble, an
// answer's body, a person's message; not its buttons, its hidden sources,
// the stage of an answer still written or what only a screen reader hears.
const FOUND_IN = ".sf-chat-message__bubble, .sf-chat-message__body, .sf-chat-person__bubble";
const NOT_FOUND_IN = "button, sup, [hidden], [aria-hidden=\"true\"], [aria-busy=\"true\"], .sf-chat-offscreen, .sr-only, .sf-chat-sources, fieldset, .sf-chat-person__bubble--tomb";
const BLOCKS = "p, li, div, pre, td, th, h1, h2, h3, h4, h5, h6, blockquote";
// The CSS Custom Highlight names the sheet paints (default.css).
const HIGHLIGHT = "sf-chat-window-found";
const HIGHLIGHT_CURRENT = "sf-chat-window-found-current";

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
export function toView(message, {people = false, edit = false, remove = false, acting = null} = {}) {
    const assistant = message.kind === "assistant";
    if (people && !assistant) return toPersonView(message, {edit, remove, acting});
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
        // An answer's files (API.md v1.3, proposed) may add their type and
        // a preview address.
        attachments: (message.files || []).map((file) => ({
            id: file.id ?? file.key, name: file.name, bytes: file.size ?? undefined,
            ...(file.download_url ? {href: file.download_url} : {}),
            ...(file.mime ? {mime: file.mime} : {}),
            ...(file.preview_url ? {preview_url: file.preview_url} : {}),
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
        // The fields proposed as API.md v1.3 (steps), as they come; the view
        // reads them (chat-message js/view/proposed.js).
        ...Object.fromEntries(PROPOSED_MESSAGE_FIELDS.filter((name) => message[name] !== undefined).map((name) => [name, message[name]])),
    });
}

// The 0.3 detail of each renamed event: {request_id, ...payload} under the
// old name the intent went out as (port.js former), and the 0.3 answer fact.
function formerAdapters() {
    const adapters = {};
    const names = new Set([...Object.values(INTENTS), ...Object.values(EXTENSION_INTENTS)].map((spec) => spec.former).filter(Boolean));
    for (const name of names) {
        adapters[name] = (detail) => (detail && formerOf(detail) === name
            ? {request_id: detail.requestId, ...(detail.payload || {})}
            : undefined);
    }
    adapters["sf-chat-window-answer"] = (detail) => (detail ? {
        request_id: detail.requestId,
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
        // requestId is the 1.4 name; "request-id" the 1.0 one, kept with the
        // dated event names (until 2026-12-01).
        settle({requestId, "request-id": former, result}) {
            return this.answer(requestId ?? former, result) ? applied() : {outcome: "refused", reason: "unknown-request"};
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
        "open-find"({query} = {}) {
            this.openFind({query});
            return applied();
        },
        "close-find"({focus} = {}) {
            this.closeFind({focus: focus !== false});
            return applied();
        },
        "open-preview"({source} = {}) {
            return this.openPreview(source) ? applied() : {outcome: "refused", reason: "not-shown"};
        },
        "close-preview"({focus} = {}) {
            this.closePreview({focus: focus !== false});
            return applied();
        },
        "open-start"({kind} = {}) {
            if (!this.has("x-conversation-start")) return {outcome: "refused", reason: "capability-not-provided"};
            this.openStart({kind});
            return applied();
        },
        "close-start"({focus} = {}) {
            this.closeStart({focus: focus !== false});
            return applied();
        },
        "open-members"() {
            if (!this.has("x-members")) return {outcome: "refused", reason: "capability-not-provided"};
            return this.openMembers() ? applied() : {outcome: "refused", reason: "no-members"};
        },
        "close-members"({focus} = {}) {
            this.closeMembers({focus: focus !== false});
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
        this._requests = new Map();  // requestId -> {intent, payload, resolve}
        this._drafts = new Map();    // draft key -> typed text, this page only
        this._retried = new Set();   // failed answers asked again: no second «Повторить»
        this._ratings = new Map();   // message key -> the rating given on this page {value, reason, note, asking, draft}
        this._sourcesOpen = new Set(); // message keys whose sources the reader opened
        this._stepsOpen = new Map();   // message key -> whether the reader opened or closed its steps
        this._preview = null;          // the source preview (1.2.0), made with the shell
        this._pressed = null;          // the last control pressed in the log: a preview's way back
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
        this._start = null;          // the form of a new conversation (x-conversation-start), too
        this._members = null;        // a group's members (x-members), too
        this._pairNames = new Map(); // conversation id -> the person chosen, while the host names no title
        this._interlocutor = null;   // whom a new conversation is with
        this._sending = 0;           // sends and decisions awaiting their answer
        this._navigating = 0;        // opens and new conversations awaiting theirs
        this._started = false;
        this._afterMessages = 0;     // the frame that marks the drawn messages
        this._queues = new Map();    // draft key -> {items: [{id, text, key}], held}, this page only
        this._busy = false;          // the field waited at the last look
        this._sendFailed = false;    // the last send was not taken
        this._find = {open: false, ranges: [], at: -1, opener: null, timer: null, said: ""};
        // Between people (1.3.0), this page only, per message key: the
        // editor ({draft: {body}, revision, conflict, clientKey}), the delete
        // question ({revision, conflict, clientKey}), an edit or a delete on
        // its way ({action, state, clientKey, body}).
        this._editing = new Map();
        this._asking = new Map();
        this._acting = new Map();
        this._runs = null;            // {of: messages, map: key -> {first, last, showName}}
        this._unread = null;          // {listKey, key, revealing}: where «Новые» stands
        this._read = {conversation: null, id: null, timer: 0};
        this._readAt = 0;
        this._mode = undefined;       // the people capabilities the messages were drawn with
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
        if (name === "no-queue" && previous !== next) {
            if (this._partsReady) this.parts.composer.queue = !this.noQueue;
            return;
        }
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
        // conversation.start's data wait for the form, which may be gone (startAnswered).
        if (result.answer === "applied" && result.data && typeof result.data === "object" && pending.intent !== "conversation.start") this.applyData(result.data);
        this.sfEmit("settled", {
            requestId,
            "request-id": requestId,  // the 1.0 spelling, until 2026-12-01
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
        this.closeViews();
        this.parts.composer.focus(options);
    }

    /** «Новый разговор», wherever the page puts the button. */
    async startConversation() {
        this.closeViews();
        this.closePreview({focus: false});
        if (this._data.conversation_list?.archived) this.showList(false);
        this._navigating++;
        const result = await this.request("conversation.create", {interlocutor: this.interlocutorId});
        this._navigating--;
        if (result.answer === "applied") this.focusComposer();
        else this.showResult(result);
    }

    async openConversation(id) {
        this.closeViews();
        this.closePreview({focus: false});
        this.notify("");
        this._navigating++;
        const result = await this.request("conversation.open", {conversation_id: id});
        this._navigating--;
        this.showResult(result, () => this.openConversation(id));
    }

    // --- requests ----------------------------------------------------------

    /**
     * Raise one intent: the event sf-chat-window-<verb> {requestId, intent,
     * kind, payload}, then the port's raise, or the host's answer(). Resolves
     * with the host's answer; an undeclared capability resolves `unavailable`
     * without asking, a cancelled event `refused`.
     */
    request(intent, payload = {}) {
        const spec = INTENTS[intent] || EXTENSION_INTENTS[intent];
        if (!spec) throw new Error(`sf-chat-window: unknown intent ${intent}`);
        if (spec.capability && !this.has(spec.capability)) return Promise.resolve({answer: "unavailable", reason: "capability-not-provided"});
        const requestId = `chat-window-${++requests}`;
        // requestId is the carried name (standard 1.4: camelCase); "request-id"
        // is the 1.0 spelling, sent beside it until 2026-12-01.
        const kind = kindOf(intent, payload);
        const detail = {requestId, "request-id": requestId, intent, ...(kind ? {kind} : {}), payload};
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
        this._start = new StartView(this, clientKey);
        this._members = new MembersView(this);
        this._preview = new PreviewView(this);

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
        const start = this._start.build(this._headingTag);
        const members = this._members.build(this._headingTag);
        header.append(interlocutor, threadTitle, spacer, members.command);
        const find = this.buildFind(element, words);
        const list = element("sf-message-log", "chat-shell__list");
        const files = this._files.build(this._headingTag);
        const preview = this._preview.build(this._headingTag);
        const composerBox = element("div", "chat-shell__composer", {id: "chat-composer", tabindex: "-1"});
        const composer = element("sf-chat-composer");
        // What happened just now (archived, restored), with its one way back;
        // and, over an archived conversation, a standing note with the way out.
        const statusLine = element("div", "chat-shell__status", {role: "status", "aria-live": "polite"});
        const archivedNote = element("div", "chat-shell__status chat-shell__status--standing");
        archivedNote.hidden = true;
        const suggestions = element("ul", "sf-chat-greeting__suggestions chat-shell__suggestions", {"aria-label": words("empty.suggestions")});
        suggestions.hidden = true;
        // What was asked while an answer was awaited, over the field.
        const queue = element("div", "chat-shell__queue");
        queue.hidden = true;
        const queueHeld = element("p", "chat-shell__queue-held");
        const queueList = element("ul", "chat-shell__queue-list", {"aria-label": words("queue.label")});
        const queueSaid = element("span", "sf-chat-offscreen", {role: "status", "aria-live": "polite"});
        queue.append(queueHeld, queueList, queueSaid);
        composerBox.append(archivedNote, statusLine, queue, composer, suggestions);
        main.append(pageTitle, header, find.box, list, files.root, start.root, members.root, composerBox);
        shell.append(side, main, preview.root);
        this._parts = {
            shell, side, sideHead, main, header, threads, list, composer, composerBox, interlocutor, pageTitle, threadTitle, statusLine, archivedNote, suggestions,
            search: search.box, searchInput: search.input, searchStatus: search.status,
            find: find.box, findInput: find.input, findCount: find.count, findStatus: find.status, findPrevious: find.previous, findNext: find.next,
            queue, queueHeld, queueList, queueSaid,
            preview: preview.root,
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

    // --- search in the conversation (1.1.0) -------------------------------

    // Above the log, the search within the open conversation: the
    // Framework's input markup, «N из M», up and down, and close. It reads
    // only what is loaded and asks the host nothing.
    buildFind(element, words) {
        const box = element("div", "chat-shell__find", {role: "search", "aria-label": words("find.label")});
        box.hidden = true;
        const field = element("label", "sf-input sf-input--size-1 sf-input--filled flex flex-col chat-shell__find-field");
        const label = element("span", "sf-chat-offscreen");
        label.textContent = words("find.label");
        const row = element("span", "sf-input-field items-cross-center transition flex");
        const icon = element("span", "sf-input-left flex");
        icon.append(this.ctx.icon("search", {size: "1"}));
        const input = element("input", "chat-shell__find-input", {
            type: "search", maxlength: "100", autocomplete: "off", enterkeyhint: "search", placeholder: words("find.placeholder"),
        });
        // «N из M» is seen; the status says it, a pause after typing.
        const count = element("span", "chat-shell__find-count", {"aria-hidden": "true"});
        row.append(icon, input, count);
        field.append(label, row);
        const previous = iconButton(this.ctx, {icon: "keyboard_arrow_up", label: words("find.previous"), size: "1", className: "chat-shell__find-previous"});
        const next = iconButton(this.ctx, {icon: "keyboard_arrow_down", label: words("find.next"), size: "1", className: "chat-shell__find-next"});
        const close = iconButton(this.ctx, {icon: "close", label: words("find.close"), size: "1", className: "chat-shell__find-close"});
        const status = element("span", "sf-chat-offscreen", {role: "status", "aria-live": "polite"});
        box.append(field, previous, next, close, status);
        input.addEventListener("input", () => this.find({say: "later"}));
        previous.addEventListener("click", () => this.moveFind(-1));
        next.addEventListener("click", () => this.moveFind(1));
        close.addEventListener("click", () => this.closeFind());
        box.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && event.target === input) {
                event.preventDefault();
                // Enter goes up, to what was said earlier; Shift+Enter down.
                this.moveFind(event.shiftKey ? 1 : -1);
            }
            // Escape clears the search first, then closes it (as the
            // search above the list clears first).
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (input.value) {
                    input.value = "";
                    input.focus();
                    this.find({say: "now"});
                } else {
                    this.closeFind();
                }
            }
        });
        return {box, input, count, status, previous, next};
    }

    /** Open the search in the conversation (the page's button, Ctrl/Cmd+F); `query` searches at once. */
    openFind({query} = {}) {
        const {find, findInput} = this.parts;
        const state = this._find;
        if (!state.open) {
            this.closeViews();
            const active = this.ownerDocument.activeElement;
            state.open = true;
            state.opener = active && active !== this.ownerDocument.body ? active : null;
            find.hidden = false;
            this.sfHostState("data-find-open", true);
            this.sfEmit("toggle", {kind: "find", open: true});
        }
        if (query !== undefined && query !== null) findInput.value = String(query);
        findInput.focus();
        findInput.select();
        this.find({say: "now"});
    }

    /** Close it: the marks go, and the focus returns to what opened it (else the field). */
    closeFind({focus = true} = {}) {
        const state = this._find;
        if (!state.open) return;
        const {find, findInput, composer} = this.parts;
        const hadFocus = find.contains(this.ownerDocument.activeElement);
        state.open = false;
        clearTimeout(state.timer);
        findInput.value = "";
        this.find();
        find.hidden = true;
        this.sfHostState("data-find-open", false);
        this.sfEmit("toggle", {kind: "find", open: false});
        const opener = state.opener;
        state.opener = null;
        if (!focus && !hadFocus) return;
        (opener?.isConnected && opener.offsetParent !== null && !find.contains(opener) ? opener : composer).focus({preventScroll: true});
    }

    /**
     * Search the drawn messages for what is typed, case aside, and mark what
     * was found. The current match starts at the last one, nearest the end of
     * the conversation; `keep` keeps it where it was (the messages were drawn
     * again), `say` says the count now or after a pause.
     */
    find({keep = false, say = ""} = {}) {
        const state = this._find;
        const {findInput, findCount, findStatus, findPrevious, findNext} = this.parts;
        const query = state.open ? findInput.value.trim().toLowerCase() : "";
        // A message drawn again has new nodes: the current match is found
        // again by its message and its place in it.
        const before = keep ? this.placeOf(state.ranges, state.at) : null;
        state.ranges = query ? this.rangesOf(query) : [];
        const count = state.ranges.length;
        const again = before ? state.ranges.findIndex((range, index) => {
            const place = this.placeOf(state.ranges, index);
            return place?.id === before.id && place.nth === before.nth;
        }) : -1;
        state.at = again === -1 ? count - 1 : again;
        findPrevious.disabled = count === 0;
        findNext.disabled = count === 0;
        findCount.textContent = !query ? "" : count ? this.words("find.count", {index: state.at + 1, count}) : this.words("find.none");
        this.markFound({scroll: !keep});
        clearTimeout(state.timer);
        if (!query) {
            findStatus.textContent = "";
            state.said = "";
            return;
        }
        if (say === "now") this.sayFound();
        else if (say === "later") state.timer = setTimeout(() => this.sayFound(), SEARCH_DELAY_MS);
    }

    /** Which message a match is in ({id}) and which of its matches it is ({nth}). */
    placeOf(ranges, index) {
        const id = (range) => range?.startContainer.parentElement?.closest("[data-id]")?.dataset.id ?? null;
        const own = id(ranges[index]);
        if (own === null) return null;
        let nth = 0;
        for (let at = index - 1; at >= 0 && id(ranges[at]) === own; at--) nth++;
        return {id: own, nth};
    }

    sayFound() {
        const state = this._find;
        const text = this.parts.findCount.textContent;
        if (!state.open || text === state.said) return;
        state.said = text;
        this.parts.findStatus.textContent = text;
    }

    /** Up (-1, earlier) or down (+1, later), round at the ends. */
    moveFind(step) {
        const state = this._find;
        const count = state.ranges.length;
        if (!count) return;
        state.at = (state.at + step + count) % count;
        this.parts.findCount.textContent = this.words("find.count", {index: state.at + 1, count});
        this.markFound({scroll: true});
        this.sayFound();
    }

    // Every match of a message's readable text, in the order of the page. A
    // message's text nodes are read as one line, so a match may cross an
    // inline mark (<strong>); a block's edge stays a break.
    rangesOf(query) {
        const ranges = [];
        const doc = this.ownerDocument;
        for (const root of this.parts.list.querySelectorAll(FOUND_IN)) {
            if (root.parentElement?.closest(FOUND_IN)) continue;
            const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => (node.parentElement?.closest(NOT_FOUND_IN) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
            });
            const pieces = [];
            let text = "";
            let block = null;
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const own = node.parentElement?.closest(BLOCKS);
                if (pieces.length && own !== block) text += "\n";
                block = own;
                pieces.push({node, at: text.length});
                text += node.data;
            }
            const lower = text.toLowerCase();
            // Lower case that changes a length would misplace the marks.
            if (lower.length !== text.length) continue;
            const place = (offset) => {
                let piece = pieces[0];
                for (const one of pieces) {
                    if (one.at > offset) break;
                    piece = one;
                }
                return [piece.node, Math.min(offset - piece.at, piece.node.data.length)];
            };
            for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, at + query.length)) {
                const range = doc.createRange();
                range.setStart(...place(at));
                range.setEnd(...place(at + query.length));
                ranges.push(range);
            }
        }
        return ranges;
    }

    // The marks: the CSS Custom Highlight API where the browser has it (no
    // node of a message is touched); without it, the message holding the
    // current match is outlined. The current match is brought into view.
    markFound({scroll = false} = {}) {
        const state = this._find;
        const current = state.ranges[state.at] ?? null;
        const highlights = globalThis.CSS?.highlights;
        if (highlights && typeof Highlight === "function") {
            // One window searches at a time; another's marks are left alone.
            if (state.ranges.length) {
                state.all = new Highlight(...state.ranges);
                state.current = new Highlight(...(current ? [current] : []));
                highlights.set(HIGHLIGHT, state.all);
                highlights.set(HIGHLIGHT_CURRENT, state.current);
            } else {
                if (state.all && highlights.get(HIGHLIGHT) === state.all) highlights.delete(HIGHLIGHT);
                if (state.current && highlights.get(HIGHLIGHT_CURRENT) === state.current) highlights.delete(HIGHLIGHT_CURRENT);
                state.all = null;
                state.current = null;
            }
        }
        const article = current?.startContainer.parentElement?.closest(".sf-chat-message, .sf-chat-person") ?? null;
        for (const one of this.parts.list.querySelectorAll(".chat-shell__found")) if (one !== article) one.classList.remove("chat-shell__found");
        article?.classList.add("chat-shell__found");
        if (scroll && current) this.bringIntoView(current);
    }

    bringIntoView(range) {
        const scroller = this.parts.list.scroller;
        const box = range.getBoundingClientRect();
        if (!scroller || !box.height) return;
        const view = scroller.getBoundingClientRect();
        if (box.top >= view.top && box.bottom <= view.bottom) return;
        scroller.scrollTop += box.top - view.top - (view.height - box.height) / 2;
    }

    // The parts are defined: upgrade ours (they may have been built before
    // the definition arrived), give the log the chat's drawing and words,
    // and hand over everything the host set meanwhile.
    partsDefined() {
        const {list, composer, interlocutor} = this._parts;
        for (const part of [list, composer, interlocutor]) customElements.upgrade(part);
        composer.queue = !this.noQueue;
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
        const {shell, threads, list, composer, interlocutor} = this._parts;
        // Ctrl/Cmd+F while the focus is in the window searches the conversation
        // (as Mod+K opens the inline editor's link); outside it the page's find is untouched.
        shell.addEventListener("keydown", (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
            if (event.code !== "KeyF" && event.key?.toLowerCase() !== "f") return;
            if (!this._data.conversation || this.covered) return;
            event.preventDefault();
            this.openFind();
        });
        // A command of the list's (kind) is a form of ours; else the one create button.
        threads.addEventListener("sf-thread-list-create", (event) => {
            const kind = event.detail?.kind;
            if (!kind) {
                this.startConversation();
                return;
            }
            this.openStart({kind, opener: threads.querySelector(`.sf-thread-list__command[data-action="create:${CSS.escape(kind)}"]`)});
        });
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
            // A person's message the host reports not done (local.state
            // failed), by its client_key (template person).
            if (kind === undefined && id === undefined && key != null) {
                this.retryLocal(key);
                return;
            }
            if (kind === "file") {
                this.request("file.retry", {conversation_id: this._data.conversation?.id ?? null, message_id: id, file_key: key})
                    .then((result) => this.showResult(result));
            } else if (id != null) {
                this.askAgain(id);
            }
        });
        list.addEventListener("sf-chat-message-submit", (event) => this.answerBrief(event.detail.id, event.detail.text));
        list.addEventListener("sf-chat-message-save", (event) => this.saveEdit(event.detail.id, event.detail.values?.body));
        list.addEventListener("sf-chat-message-delete", (event) => this.deleteMessage(event.detail.ids?.[0]));
        // The last message seen at the bottom is reported read (scroll does
        // not bubble; it is caught on its way down).
        list.addEventListener("scroll", () => this.maybeRead(), true);
        list.addEventListener("sf-chat-message-toggle", (event) => {
            // Between people (1.3.0): the editor and the delete question.
            if (event.detail.kind === "edit" || event.detail.kind === "delete") {
                this.peopleToggle(event.detail.id, event.detail.kind, Boolean(event.detail.open));
                return;
            }
            // Remembered, not redrawn: the list is open on the page already.
            const key = String(event.detail.id);
            if (event.detail.kind === "steps") this._stepsOpen.set(key, Boolean(event.detail.open));
            if (event.detail.kind !== "sources") return;
            if (event.detail.open) this._sourcesOpen.add(key); else this._sourcesOpen.delete(key);
        });
        // A source's or a file's preview (API.md v1.3): shown here, the
        // message's event is cancelled, so its footnote does not open the
        // list as well; a page that cancels the window's open keeps the list.
        list.addEventListener("click", (event) => {
            this._pressed = event.target.closest?.("button, a") ?? null;
        }, true);
        list.addEventListener("sf-chat-message-open", (event) => {
            if (event.detail?.kind !== "preview") return;
            const pressed = this._pressed && event.target.contains(this._pressed) ? this._pressed : null;
            if (this.openPreview(event.detail.source, {opener: pressed ?? this.ownerDocument.activeElement})) event.preventDefault();
        });
        // A message drew itself (sf-chat-message renders a frame after it is
        // given its message): the last answer and the waiting controls follow.
        list.addEventListener("sf-updated", (event) => {
            if (event.target?.localName === "sf-chat-message") this.messagesDrawn();
        });
        composer.addEventListener("sf-chat-composer-submit", (event) => {
            event.preventDefault();
            // Asked while an answer is awaited: it waits its turn over the field.
            if (composer.busy && !this.noQueue && !(this._data.composer_files || []).length) {
                this.enqueue(event.detail.text);
                return;
            }
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
    // `key`: a queued question keeps the client_key of its first try.
    async sendMessage(body, files = [], {own = false, repeat = false, queued = false, key = clientKey()} = {}) {
        const {composer} = this.parts;
        if (composer.busy) return undefined;
        if (repeat) this._repeats.add(key);
        return this.deliver(key, {own, queued, typedFor: this.draftKey}, () => this.request("message.send", {
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

    async deliver(key, {own, queued = false, typedFor}, ask) {
        this._sending++;
        this.syncBusy();
        const result = await ask();
        this._sending--;
        this._sendFailed = result.answer !== "applied";
        if (result.answer === "applied") {
            if (own) {
                this.parts.composer.clear();
                this._drafts.delete(typedFor);
            }
        } else {
            // A queued question goes back to its card, with «Отправить» there.
            this.showResult(result, queued ? undefined : () => this.resend(key, {own, typedFor}));
        }
        this.syncBusy();
        return result;
    }

    // --- the queue (1.1.0) --------------------------------------------------

    // A question asked while an answer is awaited waits over the field, in
    // its conversation, and goes when the answer is over -- one at a time,
    // each after its own answer. An answer that ended otherwise (an error, a
    // limit, a refusal, a stopped wait) holds the queue: each card can then be
    // sent or taken away by hand. Only this page knows of it.

    queueOf(key = this.draftKey) {
        if (!this._queues.has(key)) this._queues.set(key, {items: [], held: null});
        return this._queues.get(key);
    }

    enqueue(text) {
        const body = String(text ?? "").trim();
        if (!body) return;
        const queue = this.queueOf();
        queue.items.push({id: `queued-${++queued}`, text: body, key: null});
        this.parts.composer.clear();
        this._drafts.delete(this.draftKey);
        this.drawQueue();
        this.sayQueue(this.words("queue.added"));
    }

    // The busy field let go: what the answer's end means for the queue.
    answerEnded() {
        const queue = this._queues.get(this.draftKey);
        if (!queue?.items.length || queue.held || this.parts.composer.busy) return;
        const end = this.lastEnd();
        if (end === "waiting") return;
        if (end !== "answered") {
            this.holdQueue(queue, end);
            return;
        }
        this.sendQueued(queue, queue.items[0]);
    }

    /**
     * How the last turn ended: answered, still waiting for an answer to begin,
     * or why not (unsent, the answer's status, a stopped or unfinished wait).
     * Without an assistant a question taken is a turn over.
     */
    lastEnd() {
        if (this._sendFailed) return "unsent";
        const messages = this._data.messages || [];
        let asked = -1;
        messages.forEach((one, index) => { if (one.kind !== "assistant") asked = index; });
        const answer = messages.slice(asked + 1).reverse().find((one) => one.kind === "assistant");
        if (!answer) return this.has("assistant") ? "waiting" : "answered";
        if (ANSWERED.has(answer.status)) return "answered";
        if (PENDING.has(answer.status)) return answer.wait === "stopped" ? "stopped" : "unfinished";
        return HELD_REASON[answer.status] ? answer.status : "failed";
    }

    holdQueue(queue, reason) {
        queue.held = HELD_REASON[reason] || "failed";
        this.drawQueue();
        this.sayQueue(this.words(`queue.held.${queue.held}`));
    }

    async sendQueued(queue, item) {
        const at = queue.items.indexOf(item);
        if (at === -1 || this.parts.composer.busy) return;
        queue.items.splice(at, 1);
        queue.held = null;
        const key = item.key;
        item.key ??= clientKey();
        this.drawQueue();
        // A try that did not come back is tried again under its own key (port: one message).
        const result = key
            ? await this.resend(key, {own: false, queued: true, typedFor: this.draftKey})
            : await this.sendMessage(item.text, [], {queued: true, key: item.key});
        if (!result || result.answer === "applied") return;
        queue.items.unshift(item);
        this.holdQueue(queue, "unsent");
    }

    // «Изменить»: back into the field, before what is typed there.
    editQueued(queue, item) {
        this.dropQueued(queue, item);
        const {composer} = this.parts;
        composer.value = [item.text, composer.value].filter((one) => one.trim()).join("\n");
        composer.focus();
    }

    // «Убрать»: the focus goes to the card in its place, else to the field.
    removeQueued(queue, item) {
        const at = this.dropQueued(queue, item);
        const cards = this.parts.queueList.querySelectorAll(".chat-shell__queued-remove");
        const next = cards[Math.min(at, cards.length - 1)];
        (next || this.parts.composer).focus();
    }

    dropQueued(queue, item) {
        const at = queue.items.indexOf(item);
        if (at !== -1) queue.items.splice(at, 1);
        if (!queue.items.length) queue.held = null;
        this.drawQueue();
        return Math.max(at, 0);
    }

    sayQueue(text) {
        const {queueSaid} = this.parts;
        // The same words twice are said twice.
        queueSaid.textContent = "";
        requestAnimationFrame(() => { queueSaid.textContent = text; });
    }

    /** The open conversation's queue over the field: a card per question. */
    drawQueue() {
        if (!this._partsReady) return;
        const {queue: box, queueHeld, queueList, composer} = this.parts;
        const queue = this._queues.get(this.draftKey);
        const items = queue?.items || [];
        box.hidden = !items.length;
        queueHeld.textContent = items.length && queue.held ? this.words(`queue.held.${queue.held}`) : "";
        queueHeld.hidden = !queueHeld.textContent;
        const doc = this.ownerDocument;
        const hadFocus = queueList.contains(doc.activeElement) ? doc.activeElement : null;
        const focusClass = hadFocus ? [...hadFocus.classList].find((name) => name.startsWith("chat-shell__queued-")) : null;
        const focusId = hadFocus?.closest("[data-queued]")?.dataset.queued;
        queueList.replaceChildren(...items.map((item) => {
            const card = doc.createElement("li");
            card.className = "chat-shell__queued";
            card.dataset.queued = item.id;
            const textId = `chat-${item.id}`;
            const label = doc.createElement("span");
            label.className = "chat-shell__queued-label";
            label.textContent = this.words(queue.held ? "queue.unsent" : "queue.label");
            const text = doc.createElement("p");
            text.className = "chat-shell__queued-text";
            text.id = textId;
            text.textContent = item.text;
            text.title = item.text;
            const actions = doc.createElement("span");
            actions.className = "chat-shell__queued-actions";
            const button = (word, className, run) => {
                const one = textButton(this.ctx, {label: this.words(word), appearance: "link", scheme: "primary", className: `chat-shell__queued-${className}`});
                one.setAttribute("aria-describedby", textId);
                one.addEventListener("click", run);
                actions.append(one);
                return one;
            };
            if (queue.held) button("queue.send", "send", () => this.sendQueued(queue, item)).disabled = Boolean(composer.busy);
            button("queue.edit", "edit", () => this.editQueued(queue, item));
            button("queue.remove", "remove", () => this.removeQueued(queue, item));
            card.append(label, text, actions);
            return card;
        }));
        // A card drawn again keeps the focus where it was.
        if (focusId && focusClass) queueList.querySelector(`[data-queued="${CSS.escape(focusId)}"] .${focusClass}`)?.focus({preventScroll: true});
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
        this.closeViews();
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
        this.syncViews();
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
        const selected = data.conversation && !this._files.open && !this._start.open ? String(data.conversation.id) : "";
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
        const starting = this.has("x-conversation-start");
        threads.toggleAttribute("no-create", !this.has("conversation-create") && !starting);
        // The two commands stand in for the one button; words once, set when it changes.
        if (starting !== Boolean(threads.createCommands.length)) {
            threads.createCommands = starting ? [
                {id: "private", text: this.words("start.private"), icon: "person_add"},
                {id: "group", text: this.words("start.group"), icon: "group_add"},
            ] : [];
        }
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
    // A pinned one is sf-thread-list's own (1.3.0: pinned: true leads under
    // «Закреплённые» with its «Закреплён» line), so it is not said again here.
    listed(conversation) {
        const others = (this._data.interlocutors || []).slice(1);
        const who = others.find((one) => one.id === conversation.interlocutor)?.title;
        const entry = {...conversation, pinned: Boolean(conversation.pinned)};
        return who ? {...entry, caption: who} : entry;
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
            // So does what was asked in it meanwhile.
            const queue = this._queues.get(previous);
            this._queues.delete(previous);
            if (queue) this._queues.set(next, queue);
            this.drawQueue();
            return true;
        }
        const text = composer.value;
        if (text.trim()) this._drafts.set(previous, text); else this._drafts.delete(previous);
        composer.value = this._drafts.get(next) || "";
        // A source's preview belongs to the conversation it was opened from.
        this.closePreview({focus: false});
        // A queue waits with its conversation; come back to it, it is held
        // unless its answer is still awaited (syncBusy lets it go on then).
        const queue = this._queues.get(next);
        if (queue?.items.length && !queue.held) queue.held = "left";
        this.drawQueue();
        return true;
    }

    revoke() {
        this._drafts.delete(this.draftKey);
        this._queues.delete(this.draftKey);
        this.drawQueue();
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
        // Between people the field asks for a message, not a question (1.3.0).
        if (this.has("people")) {
            composer.setAttribute("placeholder", this.words("people.placeholder"));
            this._placeholder = true;
        } else if (this._placeholder) {
            composer.removeAttribute("placeholder");
            this._placeholder = false;
        }
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
        const view = this.ownViewOf(message);
        // «Новые» (1.3.0, capability read): before the first unread message.
        if (this._unread?.key && this._unread.listKey === this._listKey && this._unread.key === keyOf(message)) return {...(view || {}), divider: "unread"};
        return view;
    }

    ownViewOf(message) {
        if (message.kind !== "assistant" && this.has("people")) return this.personViewOf(message);
        if (message.kind === "assistant") {
            // The rating given on this page; the stored one (message.feedback)
            // is the message's own and drawn from it.
            const rating = this._ratings.get(keyOf(message));
            return {
                wait: WAITS.has(message.wait) ? message.wait : null,
                retried: this._retried.has(keyOf(message)) || undefined,
                ...(rating ? {feedback: rating} : {}),
                ...(this._sourcesOpen.has(keyOf(message)) ? {sources_open: true} : {}),
                ...(this._stepsOpen.has(keyOf(message)) ? {steps_open: this._stepsOpen.get(keyOf(message))} : {}),
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
        // Between people (1.3.0) a person's message is the template person.
        if (message.template === "person") drawn.setAttribute("template", "person");
        else if (drawn.hasAttribute("template")) drawn.removeAttribute("template");
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
        // Between people: another's new or changed message, with its author.
        if (message.template === "person") {
            const words = String(message.text || "").replace(/\s+/gu, " ").trim();
            if (message.own || message.isDeleted || !words) return "";
            return message.authorName ? `${message.authorName}: ${words}` : words;
        }
        if (message.role !== "assistant") return "";
        if (PENDING.has(message.status)) {
            if (view?.wait) return this.words(`status.${view.wait}`);
            // With steps (API.md v1.3): the step at work, never the ticking time.
            return stepsSay(this.ctx, message) || this.words(stageKey(message));
        }
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
            // What is found follows the messages drawn again.
            if (this._find.open && this.parts.findInput.value.trim()) this.find({keep: true});
            this.maybeRead();
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
        // The capabilities between people draw a message otherwise: all again.
        const mode = ["people", "edit", "delete", "read"].map((one) => (this.has(one) ? one : "")).join(" ");
        const reload = listKey !== this._listKey || (feed === "loading") !== (this._feed === "loading") || feed === "revoked" || mode !== this._mode;
        const hasMore = Boolean(data.history?.has_older);
        if (listKey !== this._listKey) this.leavePeople();
        this._listKey = listKey;
        this._feed = feed;
        this._mode = mode;
        const messages = feed === "revoked" ? [] : (data.messages || []);
        const unread = this.findUnread(listKey, feed, messages);
        if (reload) {
            this._shown.clear();
            this._drawn.clear();
            this._waiting = false;
            for (const message of messages) this._shown.set(keyOf(message), {message, viewKey: viewKeyOf(this.viewOf(message))});
            list.setMessages(messages.map((message) => this.placed(message)), {hasMore});
            this.messagesDrawn();
            if (unread) this.revealUnread();
            return;
        }
        // Between people the conversation's type decides whether names show.
        const people = this.has("people") && (changed.has("conversation") || changed.has("conversations"));
        if (!changed.has("messages") && !changed.has("history") && !people && changed.size) return;
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
            list.upsert(this.drawable(message), view);
        }
        this.messagesDrawn();
        if (unread) this.revealUnread();
    }

    // setMessages and prependMessages take bare messages; the window's own
    // knowledge of one (a repeat, a stopped wait) is given to the list after.
    placed(message) {
        const view = this.viewOf(message);
        const drawn = this.drawable(message);
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
        shell.classList.toggle("chat-shell--empty", empty && !this.covered);
        suggestions.hidden = !empty || !suggestions.childElementCount;
        // «Мои файлы» and the like have a heading of their own.
        pageTitle.hidden = empty || this.covered;
        this.syncTitles();
    }

    syncTitles() {
        const {threadTitle, pageTitle, archivedNote} = this.parts;
        const conversation = this._data.conversation;
        const listed = conversation ? this._data.conversations?.find((one) => String(one.id) === String(conversation.id)) : null;
        // A private conversation may come without a title (x-conversation-start):
        // the name is the list's, or until it comes the person who was chosen.
        const named = conversation && this.has("x-conversation-start") ? (listed?.title || this._pairNames.get(String(conversation.id)) || "") : "";
        threadTitle.textContent = conversation?.title || named;
        pageTitle.textContent = conversation?.title || named || this.who?.title || "";
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
        // The queue: back in a conversation whose answer is still awaited, it
        // goes on; when the field lets go, the answer's end decides.
        const queue = this._queues.get(this.draftKey);
        if (busy && queue?.held === "left") {
            queue.held = null;
            this.drawQueue();
        }
        if (busy === this._busy) return;
        this._busy = busy;
        this.drawQueue();
        if (!busy) queueMicrotask(() => this.answerEnded());
    }

    // --- between people (1.3.0) -------------------------------------------

    // With the capability people a person's message is the template person:
    // its author, the reader's own on the end side, runs of one author, and
    // edit (edit) and delete (delete) where the host's can_edit and
    // can_delete allow. Without it every message draws as before: Mirai24's
    // questions are kind person with own true, drawn as questions.

    /** The message as the log is given it: toView, between people with the window's state. */
    drawable(message) {
        if (message.kind === "assistant" || !this.has("people")) return toView(message);
        return toView(message, {
            people: true, edit: this.has("edit"), remove: this.has("delete"), acting: this._acting.get(keyOf(message)) ?? null,
        });
    }

    // What the window knows of a person's message: its place in its run,
    // whether it is the reader's, and the editor or the question open on it.
    personViewOf(message) {
        const key = keyOf(message);
        const run = this.runsOf().get(key) ?? {first: true, last: true, showName: false};
        const view = {own: message.author?.own === true, first: run.first, last: run.last, showName: run.showName};
        const acting = this._acting.get(key);
        // An edit or a delete on its way is in the view's key, so its line redraws.
        if (acting) view.acting = `${acting.action}:${acting.state}`;
        const editing = this._editing.get(key);
        const asking = this._asking.get(key);
        if (editing && !acting) {
            view.editing = editing.draft;
            if (editing.conflict) view.conflict = {deleted: Boolean(message.is_deleted)};
        } else if (asking && !acting && !message.is_deleted) {
            view.askDelete = true;
            if (asking.conflict) view.conflict = {deleted: false};
        }
        return view;
    }

    // Runs of one author (js/people.js), counted again when the messages change.
    runsOf() {
        const messages = this._data.messages || [];
        const conversation = this._data.conversation;
        const listed = conversation ? this._data.conversations?.find((one) => String(one.id) === String(conversation.id)) : null;
        const type = conversation?.type ?? listed?.type ?? null;
        if (this._runs?.of !== messages || this._runs.type !== type) this._runs = {of: messages, type, map: runsOf(messages, {type})};
        return this._runs.map;
    }

    // Another conversation: what was open on the last one's messages goes.
    leavePeople() {
        this._editing.clear();
        this._asking.clear();
        this._acting.clear();
        this._unread = null;
    }

    /**
     * Where «Новые» stands, decided once when a conversation's messages first
     * come (capability read): the port names no last read message, so it is
     * the listed conversation's unread_count counted back from the end over
     * others' messages. It stays put until another conversation opens.
     */
    findUnread(listKey, feed, messages) {
        if (!this.has("read") || this._unread?.listKey === listKey) return false;
        const conversation = this._data.conversation;
        if (!conversation || feed !== "ready" || !messages.length) return false;
        const listed = this._data.conversations?.find((one) => String(one.id) === String(conversation.id));
        const key = unreadKeyOf(messages, listed?.unread_count);
        this._unread = {listKey, key, revealing: Boolean(key)};
        return Boolean(key);
    }

    // The log opens at its end; when the unread part begins above what is
    // in view, «Новые» is brought to the top instead, and the reading is
    // reported only once the end is reached.
    revealUnread() {
        const state = this._unread;
        const {list} = this.parts;
        let last = null;
        let still = 0;
        const run = (frames) => {
            if (this._unread !== state) return;
            const divider = list.querySelector(".sf-chat-divider");
            const scroller = list.scroller;
            // The log is still finding its end (it follows each message drawn
            // at the bottom): the move waits until it rests.
            const top = scroller?.scrollTop ?? null;
            still = top !== null && top === last ? still + 1 : 0;
            last = top;
            if ((!divider || still < 2) && frames > 0) {
                requestAnimationFrame(() => run(frames - 1));
                return;
            }
            if (divider && scroller) {
                const above = divider.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
                if (above < 0) scroller.scrollTo({top: scroller.scrollTop + above, behavior: "instant"});
            }
            state.revealing = false;
            this.maybeRead();
        };
        requestAnimationFrame(() => run(60));
    }

    /**
     * Report the last message read (message.read, capability read) when it
     * has been in view at the bottom of a visible page: at most once in
     * READ_EVERY_MS, and only for a message later than the one reported.
     */
    maybeRead() {
        if (!this._partsReady || !this.has("read")) return;
        const data = this._data;
        const conversation = data.conversation;
        if (!conversation || data.feed_state !== "ready" || conversation.revoked === true || this._unread?.revealing) return;
        const messages = data.messages || [];
        let lastAt = messages.length - 1;
        while (lastAt >= 0 && messages[lastAt].id == null) lastAt--;
        if (lastAt < 0) return;
        const last = messages[lastAt];
        const state = this._read;
        if (state.conversation !== String(conversation.id)) {
            clearTimeout(state.timer);
            this._read = {conversation: String(conversation.id), id: null, timer: 0};
            return this.maybeRead();
        }
        if (state.id !== null) {
            if (state.id === String(last.id)) return;
            const sentAt = messages.findIndex((one) => String(one.id) === state.id);
            if (sentAt >= lastAt) return;
        }
        if (!this.lastSeen()) return;
        const wait = this._readAt + READ_EVERY_MS - Date.now();
        if (wait > 0) {
            if (!state.timer) state.timer = setTimeout(() => { state.timer = 0; this.maybeRead(); }, wait);
            return;
        }
        const before = state.id;
        state.id = String(last.id);
        this._readAt = Date.now();
        this.request("message.read", {conversation_id: conversation.id, message_id: last.id}).then((result) => {
            // Not taken: the same message may be reported again later.
            if (result.answer !== "applied" && this._read === state && state.id === String(last.id)) state.id = before;
        });
    }

    // The end of the conversation is on the screen: the log at its bottom,
    // shown (not under «Мои файлы» or a preview sheet), the page visible.
    lastSeen() {
        const {list, main} = this.parts;
        const scroller = list.scroller;
        if (!scroller || !scroller.clientHeight || this.covered || main.inert) return false;
        if (this.ownerDocument.visibilityState === "hidden") return false;
        return list.isAtLatest();
    }

    connectedCallback() {
        super.connectedCallback?.();
        this._onVisible ??= () => this.maybeRead();
        this.ownerDocument.addEventListener("visibilitychange", this._onVisible);
    }

    disconnectedCallback() {
        this.ownerDocument.removeEventListener("visibilitychange", this._onVisible);
        clearTimeout(this._read.timer);
        this._read.timer = 0;
        super.disconnectedCallback?.();
    }

    messageOf(id) {
        return (this._data.messages || []).find((one) => keyOf(one) === String(id)) ?? null;
    }

    // «Изменить» opens the editor in the message's place (one untouched
    // editor at a time), «Удалить» the question; closing either gives the
    // focus back to its button.
    peopleToggle(id, kind, open) {
        const key = String(id);
        const message = this.messageOf(key);
        if (!message || !this.has("people")) return;
        if (!open) {
            if (kind === "edit") this._editing.delete(key); else this._asking.delete(key);
            this.redrawPerson(key, kind === "edit" ? ".sf-chat-person__edit" : ".sf-chat-person__delete");
            return;
        }
        if (this._acting.has(key) || message.is_deleted) return;
        const flag = kind === "edit" ? "can_edit" : "can_delete";
        if (!this.has(kind) || message[flag] !== true) return;
        for (const [other, entry] of this._editing) {
            const shown = this.messageOf(other);
            if (other !== key && !entry.conflict && entry.draft.body === (shown?.body ?? "")) this._editing.delete(other);
        }
        for (const other of [...this._asking.keys()]) if (other !== key) this._asking.delete(other);
        if (kind === "edit") {
            this._asking.delete(key);
            if (!this._editing.has(key)) this._editing.set(key, {draft: {body: message.body ?? ""}, revision: message.revision ?? null, conflict: null, clientKey: null});
        } else {
            this._editing.delete(key);
            this._asking.set(key, {revision: message.revision ?? null, conflict: false, clientKey: null});
        }
        this.redrawPerson(key);
    }

    /**
     * Save an edit: message.edit {conversation_id, message_id, revision,
     * body, client_key} against the revision the editor was opened on (or,
     * after a conflict, «Заменить своим», the current one). Applied: the
     * host's message (data.message) is merged, newer revision winning.
     * Conflict: the current message (answer.current) is merged and shown, the
     * typed text stays in the editor. Refused or unavailable: the editor
     * stays with the text and the reason is shown; saving again is the same
     * action under the same client_key.
     */
    async saveEdit(id, typed) {
        const key = String(id);
        const entry = this._editing.get(key);
        const message = this.messageOf(key);
        const body = String(typed ?? "").trim();
        if (!entry || !message || !body || this._acting.has(key)) return;
        entry.draft.body = body;
        const revision = entry.revision;
        if (!entry.clientKey || entry.sentRevision !== revision || entry.sentBody !== body) entry.clientKey = clientKey();
        entry.sentRevision = revision;
        entry.sentBody = body;
        this._acting.set(key, {action: "edit", state: "pending", clientKey: entry.clientKey, body});
        this.redrawPerson(key, null);
        const result = await this.request("message.edit", {
            conversation_id: this._data.conversation?.id ?? null, message_id: message.id, revision, body, client_key: entry.clientKey,
        });
        this._acting.delete(key);
        if (this._editing.get(key) !== entry) return;
        if (result.answer === "applied") {
            this._editing.delete(key);
            const given = result.data?.message;
            if (given) this.mergeMessage(given);
            else if (!result.data?.messages) this.mergeMessage({...(this.messageOf(key) ?? message), body, is_edited: true}, {same: true});
            this.redrawPerson(key, ".sf-chat-person__edit");
            return;
        }
        if (result.answer === "conflict") {
            this.conflict(key, entry, result.current);
            return;
        }
        this.redrawPerson(key, ".sf-chat-person__edit-field");
        this.showResult(result);
    }

    // A conflict: the current message is merged and drawn with the line «Сообщение
    // уже изменили»; the next save goes against its revision («Заменить своим»).
    conflict(key, entry, current) {
        if (current && typeof current === "object") this.mergeMessage(current);
        const now = this.messageOf(key);
        entry.conflict = true;
        entry.revision = now?.revision ?? entry.revision;
        const deleted = Boolean(now?.is_deleted);
        this.parts.list.announce(this.words(deleted ? "people.conflictDeleted" : "people.conflict"));
        this.redrawPerson(key, deleted ? ".sf-chat-person__edit-cancel" : ".sf-chat-person__edit-field", {reveal: true});
    }

    /**
     * Delete after the question: message.delete {conversation_id,
     * message_id, revision, client_key}. Applied: the tombstone keeps the
     * message's place (data.message, else drawn here until the host's own
     * comes). Conflict: the current message is shown, the question asks again
     * against it. Refused: the question stays with the reason.
     */
    async deleteMessage(id) {
        const key = String(id ?? "");
        const asking = this._asking.get(key);
        const message = this.messageOf(key);
        if (!asking || !message || this._acting.has(key)) return;
        const revision = asking.revision;
        if (!asking.clientKey || asking.sentRevision !== revision) asking.clientKey = clientKey();
        asking.sentRevision = revision;
        this._acting.set(key, {action: "delete", state: "pending", clientKey: asking.clientKey, body: null});
        this.redrawPerson(key, null);
        const result = await this.request("message.delete", {
            conversation_id: this._data.conversation?.id ?? null, message_id: message.id, revision, client_key: asking.clientKey,
        });
        this._acting.delete(key);
        if (this._asking.get(key) !== asking) return;
        if (result.answer === "applied") {
            this._asking.delete(key);
            const given = result.data?.message;
            if (given) this.mergeMessage(given);
            else if (!result.data?.messages) this.mergeMessage({...(this.messageOf(key) ?? message), body: "", files: [], is_deleted: true, can_edit: false, can_delete: false}, {same: true});
            this.redrawPerson(key, "article");
            return;
        }
        if (result.answer === "conflict") {
            if (result.current && typeof result.current === "object") this.mergeMessage(result.current);
            const now = this.messageOf(key);
            if (!now || now.is_deleted) {
                this._asking.delete(key);
                this.redrawPerson(key, "article");
                return;
            }
            asking.conflict = true;
            asking.revision = now.revision ?? revision;
            this.parts.list.announce(this.words("people.conflict"));
            this.redrawPerson(key, ".sf-chat-person__ask .sf-button--error", {reveal: true});
            return;
        }
        this.redrawPerson(key, ".sf-chat-person__ask button");
        this.showResult(result);
    }

    // «Повторить» on a person's message the host reports failed (local):
    // a send goes again as one (message.retry under its key), any other
    // action through message.retry as well.
    retryLocal(key) {
        const message = (this._data.messages || []).find((one) => one.local?.client_key === key);
        if (message?.local?.action === "send" || !message) {
            this.resend(key, {own: false, typedFor: this.draftKey});
            return;
        }
        this.request("message.retry", {conversation_id: this._data.conversation?.id ?? null, client_key: key}).then((result) => this.showResult(result));
    }

    /**
     * One message from an answer into the feed, by id, the newer revision
     * winning (port: messages are merged so); `same` lets one of the same
     * revision replace it (the window's own drawing until the host's comes).
     * A message the feed does not hold is the host's to add.
     */
    mergeMessage(next, {same = false} = {}) {
        if (!next || next.id == null) return;
        const messages = this._data.messages || [];
        const at = messages.findIndex((one) => one.id != null && String(one.id) === String(next.id));
        if (at === -1) return;
        const order = compareRevisions(messages[at].revision, next.revision);
        if (order > 0 || (order === 0 && !same && messages[at].revision != null)) return;
        const list = messages.slice();
        list[at] = next;
        this.applyData({messages: list});
    }

    // The message drawn again; the focus, if it was in the conversation or
    // nowhere, goes to `selector` inside it once it is drawn. `reveal` brings
    // the whole message into view (a conflict's line stands above the field).
    redrawPerson(key, selector = null, {reveal = false} = {}) {
        const {list} = this.parts;
        const doc = this.ownerDocument;
        const item = () => list.querySelector(`.sf-message-log__item[data-id="${CSS.escape(String(key))}"]`);
        const before = item()?.querySelector("article") ?? null;
        const hadFocus = list.contains(doc.activeElement) || doc.activeElement === doc.body || !doc.activeElement;
        this.syncMessages(new Set(["messages"]));
        if (!selector || !hadFocus) return;
        this.afterDraw(() => {
            const article = item()?.querySelector("article");
            return article && article !== before ? article : null;
        }, (article) => {
            const target = selector === "article" ? null : article?.querySelector(selector);
            if (target) target.focus({preventScroll: true});
            else if (item()) list.focusItem(item());
            // After the editor placed its own focus (a frame at most).
            if (reveal && article) requestAnimationFrame(() => requestAnimationFrame(() => article.scrollIntoView({block: "nearest"})));
        });
    }

    // --- «Мои файлы» (x-my-files) ------------------------------------------

    /** Show the person's kept files in place of the conversation. */
    openFiles() {
        if (!this.has("x-my-files")) return Promise.resolve();
        const view = this._files;
        if (!view.open) {
            this.closeFind({focus: false});
            this.closePreview({focus: false});
            this.closeStart({focus: false});
            this.closeMembers({focus: false});
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

    // --- in place of the conversation --------------------------------------

    /** Something stands where the conversation stands: its log is out of sight. */
    get covered() {
        return Boolean(this._files?.open || this._start?.open || this._members?.open);
    }

    /** Whatever stands in the conversation's place steps aside, the focus left to the caller. */
    closeViews() {
        this.closeFiles({focus: false});
        this.closeStart({focus: false});
        this.closeMembers({focus: false});
    }

    // Back to what opened a view; a command the page has hidden meanwhile (a side
    // panel closed on a phone) takes no focus, and then the field does.
    returnFocus(opener) {
        const {composer} = this.parts;
        if (!opener?.isConnected) {
            composer.focus({preventScroll: true});
            return;
        }
        opener.focus({preventScroll: true});
        if (this.ownerDocument.activeElement !== opener) composer.focus({preventScroll: true});
    }

    // What the capabilities and the open conversation allow now.
    syncViews() {
        const members = this._members;
        const allowed = this.membersOffered;
        if (members.open && (!allowed || members.conversation !== String(this._data.conversation.id))) this.closeMembers({focus: false});
        if (this._start.open && !this.has("x-conversation-start")) this.closeStart({focus: false});
        members.command.hidden = !allowed || this.covered;
    }

    /** The open conversation is a group or a channel, and the host shows its members. */
    get membersOffered() {
        const conversation = this._data.conversation;
        if (!conversation || !this.has("x-members")) return false;
        const listed = this._data.conversations?.find((one) => String(one.id) === String(conversation.id));
        return hasMembers(conversation.type ?? listed?.type);
    }

    // --- a new conversation or group (x-conversation-start) ------------------

    /** The form in place of the conversation: kind private or group. */
    openStart(asked = {}) {
        const {kind, opener = null} = typeof asked === "string" ? {kind: asked} : (asked ?? {});
        if (!this.has("x-conversation-start")) return false;
        const view = this._start;
        if (view.form?.sending) return false;
        const form = kind === "group" ? "group" : "private";
        this.closeFind({focus: false});
        this.closePreview({focus: false});
        this.closeFiles({focus: false});
        this.closeMembers({focus: false});
        const active = this.ownerDocument.activeElement;
        const from = opener ?? (active && active !== this.ownerDocument.body && !view.root.contains(active) ? active : null);
        view.opener = from ?? view.opener;
        if (!view.open) {
            view.open = true;
            view.root.hidden = false;
            this.parts.shell.classList.add("chat-shell--start");
            this.sfHostState("data-start-open", true);
        }
        // Said first: a page whose side panel covers the window closes it on
        // the event, and only then can the form take the focus.
        this.sfEmit("toggle", {kind: "start", open: true, form});
        this.syncSelected();
        this.syncLayout();
        this.syncViews();
        view.show(form);
        view.title.focus({preventScroll: true});
        return true;
    }

    /** Close the form, what was typed with it; `focus` returns to what opened it. */
    closeStart({focus = true} = {}) {
        const view = this._start;
        if (!view?.open) return;
        const hadFocus = view.root.contains(this.ownerDocument.activeElement);
        view.open = false;
        view.root.hidden = true;
        view.clear();
        this.parts.shell.classList.remove("chat-shell--start");
        this.sfHostState("data-start-open", false);
        this.sfEmit("toggle", {kind: "start", open: false});
        this.syncSelected();
        this.syncLayout();
        this.syncViews();
        const {opener} = view;
        view.opener = null;
        if (focus || hadFocus) this.returnFocus(opener);
    }

    /**
     * The host confirmed conversation.start: the form closes and its answer's
     * data are applied. With no messages among them, and another conversation
     * than the open one, the window opens it as the list would
     * (conversation.open), so an existing one comes with its history; the list
     * is the host's to give, before or after.
     */
    async startAnswered(result, {person = null} = {}) {
        const data = result.data && typeof result.data === "object" ? result.data : {};
        const given = data.conversation;
        this._navigating++;
        this.closeStart({focus: false});
        if (given && person?.label) this._pairNames.set(String(given.id), person.label);
        if (this._data.conversation_list?.archived) this.showList(false);
        const other = given && String(this._data.conversation?.id) !== String(given.id);
        if (other && data.messages === undefined) {
            this.applyData({...data, messages: [], history: {has_older: false}, feed_state: "loading"});
            const opened = await this.request("conversation.open", {conversation_id: given.id});
            const left = this._data.feed_state === "loading" && String(this._data.conversation?.id) === String(given.id);
            if (left && (opened.answer !== "applied" || opened.data?.messages !== undefined)) this.applyData({feed_state: "ready"});
            this.showResult(opened, () => this.openConversation(given.id));
        } else if (Object.keys(data).length) {
            this.applyData(data);
        }
        this._navigating--;
        this.focusComposer();
    }

    // --- a group's members (x-members) ---------------------------------------

    /** Who is in the open group, in place of the conversation. */
    openMembers({opener = null} = {}) {
        const view = this._members;
        const id = this._data.conversation?.id;
        if (!this.membersOffered) return false;
        if (!view.open) {
            this.closeFind({focus: false});
            this.closePreview({focus: false});
            this.closeFiles({focus: false});
            this.closeStart({focus: false});
            const active = this.ownerDocument.activeElement;
            view.opener = opener ?? (active && active !== this.ownerDocument.body ? active : null);
            view.open = true;
            view.conversation = String(id);
            view.members = [];
            view.root.hidden = false;
            this.parts.shell.classList.add("chat-shell--members");
            this.sfHostState("data-members-open", true);
            this.sfEmit("toggle", {kind: "members", open: true});
            this.syncLayout();
            this.syncViews();
        }
        this.loadMembers();
        view.title.focus({preventScroll: true});
        return true;
    }

    closeMembers({focus = true} = {}) {
        const view = this._members;
        if (!view?.open) return;
        const hadFocus = view.root.contains(this.ownerDocument.activeElement);
        view.open = false;
        view.asked++;
        view.state = "idle";
        view.members = [];
        view.root.hidden = true;
        view.body.replaceChildren();
        this.parts.shell.classList.remove("chat-shell--members");
        this.sfHostState("data-members-open", false);
        this.sfEmit("toggle", {kind: "members", open: false});
        this.syncLayout();
        this.syncViews();
        const {opener} = view;
        view.opener = null;
        if (focus || hadFocus) this.returnFocus(opener);
    }

    // members.list, when the view opens; only the latest answer is drawn.
    async loadMembers() {
        const view = this._members;
        const asked = ++view.asked;
        view.state = "loading";
        view.draw();
        const result = await this.request("members.list", {conversation_id: this._data.conversation?.id ?? null});
        if (!view.open || asked !== view.asked) return;
        if (result.answer === "applied") {
            view.state = "ready";
            view.members = Array.isArray(result.data?.participants) ? result.data.participants : [];
            view.draw();
            view.say(view.countText(view.members.length));
            return;
        }
        view.state = result.answer === "refused" ? "denied" : "error";
        view.draw();
        view.say(this.words(view.state === "denied" ? "members.denied" : "members.failed"));
    }

    // --- the source preview (1.2.0) -----------------------------------------

    /**
     * Show a source (or an answer's file) beside the conversation: {title,
     * kind, preview_url, locator, mime, n?}. Only a same-origin preview_url
     * is shown; the page may cancel the window's open {kind: preview}.
     * Answers whether it is shown. `opener` is where the focus goes back.
     */
    openPreview(source, {opener = null} = {}) {
        const view = this._preview;
        const target = view?.targetOf(source);
        if (!target) return false;
        const requestId = `chat-window-${++requests}`;
        const allowed = this.sfEmit("open", {
            requestId, "request-id": requestId, intent: "preview.open", kind: "preview", payload: {source: target},
        }, {cancelable: true});
        if (!allowed) return false;
        const active = this.ownerDocument.activeElement;
        const from = opener ?? (active && active !== this.ownerDocument.body ? active : null);
        if (!view.open) {
            this.closeViews();
            view.open = true;
            view.root.hidden = false;
            this.parts.shell.classList.add("chat-shell--preview");
            this.sfHostState("data-preview-open", true);
            this.sfEmit("toggle", {kind: "preview", open: true});
            this.watchPreviewRoom();
        }
        // The way back: the node pressed, or, when its message was drawn
        // again meanwhile, the same footnote or title in the new drawing.
        view.opener = from && !view.root.contains(from) ? from : view.opener;
        view.openerFinder = this.findAgain(from);
        this.placePreview();
        view.show(target);
        view.title.focus({preventScroll: true});
        return true;
    }

    /** Close it; `focus` returns the focus to what opened it (else the field). */
    closePreview({focus = true} = {}) {
        const view = this._preview;
        if (!view?.open) return;
        const hadFocus = view.root.contains(this.ownerDocument.activeElement);
        view.open = false;
        view.root.hidden = true;
        view.clear();
        this.parts.shell.classList.remove("chat-shell--preview", "chat-shell--preview-sheet");
        this.parts.main.inert = false;
        this.sfHostState("data-preview-open", false);
        this.sfEmit("toggle", {kind: "preview", open: false});
        this._previewRoom?.disconnect();
        this._previewRoom = null;
        const opener = view.opener?.isConnected ? view.opener : view.openerFinder?.();
        view.opener = null;
        view.openerFinder = null;
        if (!focus && !hadFocus) return;
        (opener?.isConnected && opener.offsetParent !== null ? opener : this.parts.composer).focus({preventScroll: true});
    }

    // A footnote or a source's title found again by its message and place.
    findAgain(node) {
        const message = node?.closest?.(".sf-chat-message[data-id]");
        if (!message) return null;
        const id = message.getAttribute("data-id");
        const controls = node.getAttribute("aria-controls");
        const cls = [...node.classList].find((one) => /^sf-chat-(footnote|sources__preview|deliverable__preview)$/u.test(one));
        const index = cls ? [...message.querySelectorAll(`.${cls}`)].indexOf(node) : -1;
        return () => {
            const again = [...this.parts.list.querySelectorAll(".sf-chat-message[data-id]")].find((one) => one.getAttribute("data-id") === id);
            if (!again) return null;
            if (controls && cls === "sf-chat-footnote") return again.querySelector(`.sf-chat-footnote[aria-controls="${CSS.escape(controls)}"]`);
            return cls && index >= 0 ? again.querySelectorAll(`.${cls}`)[index] ?? null : null;
        };
    }

    // Beside the conversation while it keeps PREVIEW_DOCK_MIN of room (the
    // window less its docked side panel); a sheet over it otherwise, with
    // the conversation inert behind it.
    placePreview() {
        const {shell, side, main} = this.parts;
        if (!this._preview?.open) return;
        const width = shell.getBoundingClientRect().width;
        const docked = side && getComputedStyle(side).position !== "fixed" && !shell.classList.contains("chat-shell--side-hidden");
        const room = width - (docked ? side.getBoundingClientRect().width : 0);
        const sheet = room < PREVIEW_DOCK_MIN;
        shell.classList.toggle("chat-shell--preview-sheet", sheet);
        main.inert = sheet;
    }

    watchPreviewRoom() {
        if (this._previewRoom || typeof ResizeObserver !== "function") return;
        this._previewRoom = new ResizeObserver(() => this.placePreview());
        this._previewRoom.observe(this.parts.shell);
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

