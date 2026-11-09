// sf-message-log 2.0.0: a dated alias of SIMAI Framework's sf-list-feed
// (duplication audit 2026-11-03 A-6; sets split plan 2026-11-05, section 3,
// S2). The feed's behaviour -- the reading position, runs, streams, redraw in
// place, announcing, the keyboard -- moved to the Framework as sf-list-feed
// (taken over from this component's 1.2.5 whole), and this element is now its
// heir under the former tag, until 2027-01-01:
//
//   - the element is a subclass of the class that defines sf-list-feed, so it
//     draws the feed's markup (.sf-list-feed, .sf-list-feed__item, ...) and its
//     stylesheet, with the feed's public variables (--sf-list-feed-*);
//     the five former public variables (--sf-message-log-*) still feed them
//     (js/templates/default.css);
//   - the former names keep working: messages, setMessages and
//     prependMessages, renderMessage and announceMessage, setHasMore and
//     isNearBottom, the server's island {"messages": [...]}, the entry fields
//     pending and author_name (1.0 spellings, until 2026-12-01), remove(id);
//     every event the feed sends (sf-list-feed-load-more, -begun, -chunk,
//     -completed, -failed, -cancelled) also goes out under its former name
//     sf-message-log-* with the same detail and one shared cancel
//     (aliases.json, installed by the Smart base);
//   - its words stay the conversation's (lang/), under the feed's keys;
//   - the first <sf-message-log> a page connects is noted in SF.deprecations
//     and named once on the console, as every dated tag alias is.
//
// The Framework's sf-list-feed is the one source: this bundle carries none of
// its code. The rule relates cl-list-feed, so the Loader fetches the feed with
// this element; the subclass is defined once the feed is.
import {noteTagAlias, registerTagAliasRows} from "../../core/js/tag-aliases.js";
import {noteDeprecated} from "../../core/js/deprecations";
import {pageWord} from "../../core/js/page-language.js";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";
import "./js/templates/default.css";

const TAG = "sf-message-log";
const TO = "sf-list-feed";
const SINCE = "2026-11-05";
const REMOVE_AFTER = "2027-01-01";
const ROW = Object.freeze({from: TAG, to: TO, since: SINCE, remove_after: REMOVE_AFTER});
// The 1.0 spellings this component still took (aliases of 2026-10-27).
const LEGACY_SINCE = "2026-10-27";
const LEGACY_REMOVE_AFTER = "2026-12-01";

const legacy = (kind, from, to) => noteDeprecated({
    component: TAG,
    tag: TAG,
    kind,
    from,
    to,
    since: LEGACY_SINCE,
    remove_after: LEGACY_REMOVE_AFTER,
});

const former = (kind, from, to) => noteDeprecated({
    component: TAG,
    tag: TAG,
    kind,
    from,
    to,
    since: SINCE,
    remove_after: REMOVE_AFTER,
});

// An entry in the feed's spelling: `growing` for 1.0's `pending`,
// `author-name` for 1.0's `author_name`. Anything else is the host's and
// passes through.
function entryOf(message) {
    if (!message || typeof message !== "object") return message;
    let entry = message;
    if (typeof message.growing !== "boolean" && message.pending === true) {
        legacy("entry-field", "pending", "growing");
        entry = {...entry, growing: true};
    }
    if (message["author-name"] === undefined && message.author_name !== undefined) {
        legacy("entry-field", "author_name", "author-name");
        entry = {...entry, "author-name": message.author_name};
    }
    return entry;
}

const entriesOf = (list) => (Array.isArray(list) ? list.map(entryOf) : list);

// The object form of an action (standard §4.4): one plain object that names
// declared parameters only, at least one, is the parameters in order --
// setMessages({messages}) is setMessages(messages), upsert({message}) is
// upsert(message). Anything else (a list, an entry, the fields in order) goes
// through as it came. The feed's runtime does this for the feed's own methods;
// these three are this element's.
const objectForm = (args, names) => {
    const [first] = args;
    if (args.length !== 1 || !first || typeof first !== "object" || Array.isArray(first)
        || Object.getPrototypeOf(first) !== Object.prototype) return args;
    const given = Object.keys(first);
    if (!given.length || !given.every((key) => names.includes(key))) return args;
    return names.map((name) => first[name]);
};

// The conversation's own words («Переписка», «Сообщения»), not the feed's
// («Лента», «Записи»): the keys are the feed's, so a word a page registered
// for either tag still wins (the two tags share one entry, canonicalTag).
const WORDS = {en: {...en.runtime}, ru: {...ru.runtime}};

function defineMessageLog(Feed) {
    const registry = globalThis.customElements;
    if (!Feed || !registry || registry.get(TAG)) return;

    class SfMessageLog extends Feed {
        static get aliases() {
            return aliases;
        }

        constructor() {
            super();
            // A value set as a property before the element was defined is an
            // own property that would hide the accessor; it is taken through it.
            for (const name of ["messages", "renderMessage", "announceMessage"]) {
                if (!Object.prototype.hasOwnProperty.call(this, name)) continue;
                const early = this[name];
                delete this[name];
                this[name] = early;
            }
        }

        sfWord(key, {count, vars} = {}) {
            return pageWord(WORDS, key, this, {component: TAG, source: "en", count, vars});
        }

        // A server printed 1.x's island, {"messages": [...]}: the feed reads
        // {"items": [...]}. The island is read once, before the first render.
        sfReadIsland() {
            const island = Array.from(this.children ?? []).find((child) => child.localName === "script"
                && child.hasAttribute("data-sf-settings") && /^application\/json$/iu.test(child.type));
            if (island) {
                try {
                    const data = JSON.parse(island.textContent || "{}");
                    if (data && typeof data === "object" && !Array.isArray(data) && "messages" in data) {
                        former("setting", "messages", "items");
                        const {messages, ...rest} = data;
                        island.textContent = JSON.stringify("items" in rest ? rest : {...rest, items: entriesOf(messages)});
                    }
                } catch {
                    // Not JSON: the feed says so.
                }
            }
            return super.sfReadIsland?.();
        }

        connectedCallback() {
            noteTagAlias(ROW);
            super.connectedCallback?.();
        }

        get messages() {
            return this.items;
        }

        set messages(value) {
            former("setting", "messages", "items");
            this.items = entriesOf(value);
        }

        get renderMessage() {
            return this.renderItem;
        }

        set renderMessage(value) {
            former("property", "renderMessage", "renderItem");
            this.renderItem = value;
        }

        get announceMessage() {
            return this.announceItem;
        }

        set announceMessage(value) {
            former("property", "announceMessage", "announceItem");
            this.announceItem = value;
        }

        setMessages(...args) {
            const [messages = [], options = {}] = objectForm(args, ["messages", "options"]);
            former("action", "setMessages", "setItems");
            return this.setItems(entriesOf(messages), options);
        }

        prependMessages(...args) {
            const [messages = [], options = {}] = objectForm(args, ["messages", "options"]);
            former("action", "prependMessages", "prependItems");
            return this.prependItems(entriesOf(messages), options);
        }

        // 1.x's own methods the feed does not keep: the has-more setting, and
        // isAtLatest under its internal name.
        setHasMore(value) {
            former("action", "setHasMore", "has-more");
            this.hasMore = Boolean(value);
            return {outcome: "applied"};
        }

        isNearBottom() {
            former("action", "isNearBottom", "isAtLatest");
            return this.isAtLatest();
        }

        upsert(...args) {
            const [message, ...rest] = objectForm(args, ["message", "view", "options"]);
            return super.upsert(entryOf(message), ...rest);
        }

        // remove(id) was 1.0's detach. Without an argument it is the browser's
        // own Element.remove(): the element leaves the page.
        remove(...args) {
            if (!args.length) return super.remove();
            legacy("action", "remove", "detach");
            return this.detach({id: args[0]});
        }
    }

    Object.defineProperty(SfMessageLog, "sfTagAliasOf", {value: TO});
    registry.define(TAG, SfMessageLog);
}

registerTagAliasRows([ROW]);
const registry = globalThis.customElements;
if (registry) {
    const defined = registry.get(TO);
    if (defined) defineMessageLog(defined);
    else {
        registry.whenDefined(TO).then(defineMessageLog);
        // The rule relates cl-list-feed; a page whose Loader has not fetched
        // it yet (the element came before its rule) asks for it here.
        globalThis.SF?.Loader?.ensure?.([TO], {timeout: Infinity});
    }
}
