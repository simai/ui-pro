// sf-mail-library: the Library of SIMAI Email Editor -- the blocks a letter can
// take, grouped by what they are for, with category chips and a search over
// their names and purposes. A row says what the block is in the person's words
// and adds it; the element never touches a letter. It raises
// sf-mail-library-add {type} and the host decides where the block goes (after
// the selection, at the end).
//
// It came from simai/ui-mail (package/src/smart/mail-library, 0.2.0, ui-mail
// 330720b), where it was written as the first element of the editor's own
// component package; by the owner's decision D31 (2026-10-29) a product keeps
// no component set of its own, so it lives here beside the chat components,
// under its own name.
//
// The «Шапка и подвал» section holds the variants of the two places every
// letter has, the current one marked and not offered again; choosing another
// raises sf-mail-library-replace {family, type}. Like the editor's, that
// section shows with «Все» only -- a category is about content.
//
// The blocks are data, not a dependency: the host passes `items`
// ({type, title, purpose, icon, group, sample?}), `groups` ({id, title}) and
// `places` in the order they are shown, so the element works for any block
// library and knows nothing of the editor's manifest format.
//
// From its component.json (standard simai.smart-component 1.4 §3, §4, §8,
// §11): the settings are attributes and properties made by
// core/js/element-manifest.js, its words are lang/<locale>.json, and the
// actions answer outcomes.
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {renderMailLibraryTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});

const named = (one, key) => one && typeof one === "object" && typeof one[key] === "string" && one[key] !== "";

const MailLibraryElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    actions: {
        search({query} = {}) {
            this.query = String(query ?? "");
            return applied();
        },
        filter({category} = {}) {
            this.category = String(category || "all");
            return applied();
        },
        add({type} = {}) {
            const id = String(type ?? "");
            if (!this.blocks().some((item) => item.type === id)) return refused("unknown");
            this.sfEmit("add", {type: id});
            return applied();
        },
        replace({family, type} = {}) {
            const place = this.placeList().find((candidate) => candidate.family === String(family ?? ""));
            const id = String(type ?? "");
            if (!place || !place.items.some((item) => item && item.type === id)) return refused("unknown");
            // The variant the letter has now is not offered again.
            if (place.current === id) return refused("current");
            this.sfEmit("replace", {family: place.family, type: id});
            return applied();
        },
    },
});

class SfMailLibrary extends MailLibraryElement {
    static get props() {
        return {...super.props, templateName: {attribute: "template", default: "default"}};
    }

    constructor() {
        super();
        // A list set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        for (const name of ["items", "groups", "places"]) {
            if (!Object.prototype.hasOwnProperty.call(this, name)) continue;
            const early = this[name];
            delete this[name];
            this[name] = early;
        }
    }

    // [{type, title, purpose, icon, group, sample?}]: one row per block. A row
    // whose group is not in `groups` is not shown, so a host that offers fewer
    // groups offers fewer blocks, and nothing is drawn under a heading nobody
    // named.
    blocks() {
        return Array.isArray(this.items) ? this.items.filter((item) => named(item, "type")) : [];
    }

    // [{id, title}]: the groups in the order they are shown.
    groupList() {
        return Array.isArray(this.groups) ? this.groups.filter((group) => named(group, "id")) : [];
    }

    // [{family, title, current, items: [{type, title, purpose, icon}]}]: the
    // places every letter has (the header and the footer) and their variants.
    placeList() {
        return Array.isArray(this.places)
            ? this.places.filter((place) => named(place, "family") && Array.isArray(place.items))
            : [];
    }

    // 'all', or the id of one group. An id no group has shows every group, so
    // a stale filter never leaves the Library empty.
    shownCategory() {
        const value = String(this.category || "all");
        return value === "all" || this.groupList().some((group) => group.id === value) ? value : "all";
    }

    matcher() {
        const query = String(this.query ?? "").trim().toLowerCase();
        return (item) => !query || `${item.title ?? ""} ${item.purpose ?? ""} ${item.type}`.toLowerCase().includes(query);
    }

    /** The groups to draw, each with the rows the query and the category leave in it. */
    shownGroups() {
        const matches = this.matcher();
        const category = this.shownCategory();
        const items = this.blocks();
        return this.groupList()
            .filter((group) => category === "all" || group.id === category)
            .map((group) => ({...group, items: items.filter((item) => item.group === group.id && matches(item))}))
            .filter((group) => group.items.length > 0);
    }

    /** The places with the variants the query leaves; none while a category is chosen. */
    shownPlaces() {
        if (this.shownCategory() !== "all") return [];
        const matches = this.matcher();
        return this.placeList()
            .map((place) => ({...place, items: place.items.filter((item) => named(item, "type") && matches(item))}))
            .filter((place) => place.items.length > 0);
    }

    templateContext() {
        const groups = this.shownGroups();
        const places = this.shownPlaces();
        const groupList = this.groupList();
        return {
            component: this,
            query: String(this.query ?? ""),
            category: this.shownCategory(),
            chips: groupList.length > 1 ? [{id: "all", title: this.sfWord("all-text")}, ...groupList] : [],
            groups,
            places,
            nothingFound: groups.length === 0 && places.length === 0 && (this.blocks().length > 0 || this.placeList().length > 0),
            searchLabel: this.sfWord("search-label"),
            addLabel: this.sfWord("add-text"),
            categoryLabel: this.sfWord("category-label"),
            changeVariantLabel: this.sfWord("change-variant-text"),
            currentLabel: this.sfWord("current-text"),
            nothingFoundTitle: this.sfWord("nothing-found-heading"),
            nothingFoundText: this.sfWord("nothing-found-text"),
            rootClass: this.getRootClass?.() ?? "",
        };
    }

    template() {
        return renderMailLibraryTemplate(this.templateContext());
    }
}

SfMailLibrary.define("sf-mail-library");
