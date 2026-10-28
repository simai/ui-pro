// Who a conversation is with. It came from simai/ui-chat (D31: components live
// in the Framework or in ui-pro, owner 2026-10-26; the move approved
// 2026-10-27), where a chat window placed it in its header.
//
// The list is the server's (Mirai24 bootstrap.interlocutors); this only shows
// it and reports a choice. A conversation belongs to one interlocutor, so
// choosing another one is a request for a new conversation, which the host
// makes; the element never changes `value` itself.
//
// One interlocutor is a name, not a choice: the button is disabled and says
// nothing about a menu. A conversation with one the server no longer lists
// (Mirai24 v1.1: the administrator's assistant gone into the personal one,
// its old threads kept) is named by the word «Помощник», never by an empty line.
//
// It is a thin element over the Framework's sf-context-menu: radio rows, the
// current one checked, the person's own interlocutors first and the knowledge
// bases' under their heading once both are there, and the menu's search from
// eight of them.
//
// From its component.json (standard simai.smart-component 1.3.9 §3, §4, §8,
// §11): the settings and the value are attributes and properties made by
// core/js/element-manifest.js, its words are lang/<locale>.json, the actions
// answer outcomes, and the choice is the vocabulary's `select {id}`; the old
// name sf-chat-interlocutor follows until 2026-12-01 (aliases.json).
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {instancePath, partId} from "../../core/js/instance-path";
import {renderChatInterlocutorTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

// From this many, the menu gets a search field.
const SEARCH_FROM = 8;

const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});

// One interlocutor as the element holds it: id a string, the title text.
const normalOption = (one) => ({
    ...one,
    id: String(one?.id ?? ""),
    title: String(one?.title ?? ""),
});

const ChatInterlocutorElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    aliases,
    actions: {
        "set-options"({options}) {
            this.options = options;
            return applied();
        },
        open() {
            return this.openMenu();
        },
    },
});

class SfChatInterlocutor extends ChatInterlocutorElement {
    static get props() {
        return {...super.props, templateName: {attribute: "template", default: "default"}};
    }

    constructor() {
        super();
        // A value set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        for (const name of ["options", "value"]) {
            if (!Object.prototype.hasOwnProperty.call(this, name)) continue;
            const early = this[name];
            delete this[name];
            this[name] = early;
        }
    }

    /** The interlocutors as given, ids as strings; anything else is none. */
    get list() {
        const options = this.options;
        return Array.isArray(options) ? options.filter((one) => one && typeof one === "object").map(normalOption) : [];
    }

    get single() {
        return this.list.length < 2;
    }

    // The description's id is the element's path (§7.1.1), never a counter.
    get noteId() {
        return partId(instancePath(this, {kind: "sf-chat-interlocutor"}), "note");
    }

    templateContext() {
        const value = String(this.value ?? "");
        const current = this.list.find((one) => one.id === value);
        const title = current?.title || (value ? this.sfWord("assistant-text") : "");
        const single = this.single;
        return {
            component: this,
            title,
            label: current?.title ? this.sfWord("button-label", {vars: {title}}) : title,
            single,
            noteId: this.noteId,
            note: single ? "" : this.sfWord("change-text"),
            menuLabel: this.sfWord("menu-label"),
        };
    }

    template() {
        return renderChatInterlocutorTemplate(this.templateContext());
    }

    get button() {
        return this.querySelector(".sf-chat-interlocutor__button");
    }

    get menu() {
        return this.querySelector(".sf-chat-interlocutor__menu");
    }

    /** The menu's rows: radio entries, the person's own first, then the bases'. */
    entries() {
        const value = String(this.value ?? "");
        const row = (one) => ({id: one.id, text: one.title, kind: "radio", checked: one.id === value});
        const list = this.list;
        const own = list.filter((one) => one.kind !== "knowledge");
        const bases = list.filter((one) => one.kind === "knowledge");
        const grouped = own.length && bases.length;
        return [
            ...(grouped ? [{type: "heading", text: this.sfWord("group-own-text")}] : []),
            ...own.map(row),
            ...(grouped ? [{type: "heading", text: this.sfWord("group-knowledge-text")}] : []),
            ...bases.map(row),
            {type: "separator"},
            {type: "heading", text: this.sfWord("change-text")},
        ];
    }

    openMenu() {
        if (this.single) return refused("single");
        const menu = this.menu;
        const button = this.button;
        if (!menu || !button) return refused("unavailable");
        menu.search = this.list.length >= SEARCH_FROM
            ? {placeholder: this.sfWord("search-placeholder"), empty: this.sfWord("search-empty-text")}
            : null;
        menu.entries = this.entries();
        // The Loader brings sf-context-menu when the page is ready (the rule
        // fetches it lazily); a press before that waits for it.
        customElements.whenDefined("sf-context-menu").then(() => menu.toggleFor(button));
        return applied();
    }

    onMenuSelect(detail = {}) {
        const id = String(detail.id ?? detail.entry?.id ?? "");
        if (id && id !== String(this.value ?? "")) this.sfEmit("select", {id}, {cancelable: true});
    }
}

SfChatInterlocutor.define("sf-chat-interlocutor");
