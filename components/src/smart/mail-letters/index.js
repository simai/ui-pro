// sf-mail-letters: the letters of SIMAI Email Editor -- every letter a person
// has, with a search by name, an order, and what each row offers: «Открыть»
// and, under ⋯, a copy, a rename and a delete. The element holds no letter and
// stores nothing: the host passes `letters` and hears what the person chose.
//
// It came from simai/ui-mail (package/src/smart/mail-letters, 0.1.0, ui-mail
// 750be03), the letters page the editor draws in src/ui/app.ts (drawLibrary)
// as an element; by the owner's decision D31 (2026-10-29) a product keeps no
// component set of its own, so it lives here, under its own name.
//
// A row says when the letter changed in words -- «5 минут назад» -- from the
// `at` of the letter and the page's language, through Intl.RelativeTimeFormat,
// and how many blocks it has through Intl.PluralRules (the word blocks-text of
// lang/<locale>.json, one form per plural category): «1 блок», «4 блока»,
// «7 блоков». The host passes the moment and the count, not the sentence: the
// same letter reads right in RU and in EN without the host knowing either.
//
// From its component.json (standard simai.smart-component 1.4 §3, §4, §8,
// §11): the settings are attributes and properties made by
// core/js/element-manifest.js, its words are lang/<locale>.json, the actions
// answer outcomes.
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {pageLocale} from "../../core/js/page-language";
import {renderMailLettersTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

const ORDERS = ["changed", "title"];
const CHOICES = ["open", "copy", "rename", "delete", "create"];
// The longest unit first: the moment is worded in the largest unit it fills.
const STEPS = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];

const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});

const MailLettersElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    actions: {
        search({query} = {}) {
            this.query = String(query ?? "");
            return applied();
        },
        sort({order} = {}) {
            if (!ORDERS.includes(order)) return refused("unknown");
            this.order = order;
            return applied();
        },
        choose({action, id} = {}) {
            return this.chooseFor(action, id);
        },
    },
});

class SfMailLetters extends MailLettersElement {
    static get props() {
        return {...super.props, templateName: {attribute: "template", default: "default"}};
    }

    constructor() {
        super();
        // A list set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        if (Object.prototype.hasOwnProperty.call(this, "letters")) {
            const early = this.letters;
            delete this.letters;
            this.letters = early;
        }
        this.menuFor = "";
    }

    // [{id, title, at, blocks}]: one row per letter. `at` is a moment (an ISO
    // string or anything Date reads); the row words it in the page's language.
    letterList() {
        return Array.isArray(this.letters)
            ? this.letters.filter((letter) => letter && typeof letter.id === "string" && letter.id)
            : [];
    }

    locale() {
        return pageLocale(this) || "ru";
    }

    /**
     * «7 блоков», «4 блока», «1 блок»: the count in the page's language, the
     * form picked by Intl.PluralRules. An element that wrote one form for every
     * number said «4 блоков», which is wrong; the probe holds all three forms.
     */
    blocksText(count) {
        if (count === undefined || count === null || count === "" || Number.isNaN(Number(count))) return "";
        return this.sfWord("blocks-text", {count: Number(count)});
    }

    /** «5 минут назад»: the moment in the page's language, or '' when there is none. */
    when(at) {
        const moment = at ? new Date(at) : null;
        if (!moment || Number.isNaN(moment.getTime())) return "";
        const seconds = Math.round((moment.getTime() - Date.now()) / 1000);
        const format = new Intl.RelativeTimeFormat(this.locale(), {numeric: "auto"});
        for (const [unit, size] of STEPS) {
            if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
        }
        return format.format(seconds, "second");
    }

    /** The rows the search leaves, in the chosen order. */
    shownLetters() {
        const query = String(this.query ?? "").trim().toLowerCase();
        const locale = this.locale();
        const byTitle = this.order === "title";
        return this.letterList()
            .filter((letter) => !query || String(letter.title ?? "").toLowerCase().includes(query))
            .sort((one, two) => (byTitle
                ? String(one.title ?? "").localeCompare(String(two.title ?? ""), locale)
                : String(two.at ?? "").localeCompare(String(one.at ?? ""))));
    }

    /** Say what the person chose: open, copy, rename, delete, or a new letter. */
    chooseFor(action, id) {
        if (!CHOICES.includes(action)) return refused("unknown");
        if (action === "create") {
            this.sfEmit("create", {});
            return applied();
        }
        const letter = this.letterList().find((one) => one.id === String(id ?? ""));
        if (!letter) return refused("unknown");
        // The letter open in the editor is not offered to be opened again.
        if (action === "open" && letter.id === String(this.current ?? "")) return refused("current");
        this.sfEmit(action, action === "delete" ? {ids: [letter.id], id: letter.id} : {id: letter.id});
        return applied();
    }

    onOrderChange(event) {
        const value = event?.detail?.value ?? event?.target?.value;
        // A change that bubbles from inside the dropdown (its own field) is
        // not an order.
        if (ORDERS.includes(value) && value !== this.order) this.sort({order: value});
    }

    menuEntries() {
        return [
            {id: "copy", text: this.sfWord("copy-text"), icon: "file_copy"},
            {id: "rename", text: this.sfWord("rename-text"), icon: "edit"},
            {id: "delete", text: this.sfWord("delete-text"), icon: "delete", danger: true},
        ];
    }

    get menu() {
        return this.querySelector(".sf-mail-letters-menu");
    }

    /** The ⋯ of a row: one menu, filled for the row it was opened from. */
    openMenu(id, anchor) {
        const menu = this.menu;
        if (!menu) return refused("unavailable");
        this.menuFor = String(id);
        const native = anchor?.querySelector?.("button") ?? anchor;
        // The Loader brings sf-context-menu when the page is ready (the rule
        // fetches it lazily); a press before that waits for it.
        customElements.whenDefined("sf-context-menu").then(() => {
            menu.entries = this.menuEntries();
            menu.toggleFor(native);
        });
        return applied();
    }

    // The menu answers for the row it was opened from, whatever is redrawn
    // meanwhile: the id is remembered, not read back out of the markup.
    onMenuSelect(detail = {}) {
        const action = String(detail.id ?? detail.entry?.id ?? "");
        if (!action || !this.menuFor) return;
        this.chooseFor(action, this.menuFor);
    }

    templateContext() {
        const all = this.letterList();
        const current = String(this.current ?? "");
        const letters = this.shownLetters().map((letter) => ({
            ...letter,
            when: this.when(letter.at),
            blocksText: this.blocksText(letter.blocks),
            isCurrent: letter.id === current,
            actionsLabel: this.sfWord("actions-label", {vars: {title: String(letter.title ?? "")}}),
        }));
        const searched = letters.length === 0 && all.length > 0;
        return {
            component: this,
            query: String(this.query ?? ""),
            order: this.order,
            letters,
            // Nothing at all, or nothing for this search: an empty state says which.
            empty: letters.length === 0 ? (searched ? "nothing-found" : "no-data") : null,
            searchLabel: this.sfWord("search-label"),
            orderLabel: this.sfWord("order-label"),
            orderOptions: [
                {value: "changed", text: this.sfWord("order-changed-text")},
                {value: "title", text: this.sfWord("order-title-text")},
            ],
            openLabel: this.sfWord("open-text"),
            createLabel: this.sfWord("create-text"),
            currentLabel: this.sfWord("current-text"),
            emptyTitle: this.sfWord(searched ? "nothing-found-heading" : "empty-heading"),
            emptyText: this.sfWord(searched ? "nothing-found-text" : "empty-text"),
            rootClass: this.getRootClass?.() ?? "",
        };
    }

    template() {
        return renderMailLettersTemplate(this.templateContext());
    }
}

SfMailLetters.define("sf-mail-letters");
