// sf-mail-inspector: the right panel of SIMAI Email Editor as a form drawn from
// data. A heading with the actions on what is being edited, the path of levels,
// tabs, accordion sections, and every field the editor has: text, several
// lines, a link, a number, a choice, a switch, a group of fields, an image and a
// list of items.
//
// It knows no letter, no block manifest and no store. The host passes the form
// in the person's language -- each field's value, error, hint and placeholder --
// hears what the person did and passes the form back; the element changes
// nothing and validates nothing. The contents of a tab with `slot` are the
// host's own panel.
//
// Typed text: a field being typed in is never written to, and a field whose
// value the host did not take keeps the typed text for as long as the host
// passes `error`. So the attribute `value` holds still while there is typed
// text (a new attribute would make sf-input write it over what came since), and
// afterRender() writes what a field must show only when it differs.
//
// From its component.json (standard simai.smart-component 1.4 §3, §4, §8,
// §11): the settings are attributes and properties made by
// core/js/element-manifest.js, its words are lang/<locale>.json, and the actions
// answer outcomes.
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {instancePath, partId} from "../../core/js/instance-path";
import {renderMailInspectorTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});

const TEXT_KINDS = new Set(["text", "multiline", "link", "number"]);
const text = (value) => (value === null || value === undefined ? "" : String(value));
const imageKey = (value) => (value ? `${value.value ?? ""}|${value.href ?? ""}` : "");

/** A short, stable name for a list: sf-sortable's group is at most 32 characters. */
const groupOf = (path) => {
    let hash = 5381;
    for (const character of String(path)) hash = (hash * 33 + character.charCodeAt(0)) % 4294967296;
    return `items-${hash.toString(36)}`;
};

const MailInspectorElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    actions: {
        // Not `remove`: that is the DOM's own method, and the element would take itself off the page.
        delete() {
            if (!this.headActionList().includes("delete")) return refused("unknown");
            this.sfEmit("delete", {});
            return applied();
        },
        duplicate() {
            if (!this.headActionList().includes("duplicate")) return refused("unknown");
            this.sfEmit("duplicate", {});
            return applied();
        },
        replace() {
            if (!this.headActionList().includes("replace")) return refused("unknown");
            this.sfEmit("replace", {});
            return applied();
        },
        "level-up"() {
            if (!this.levelList().length) return refused("top");
            this.sfEmit("level", {index: this.levelList().length - 2});
            return applied();
        },
        "go-to-level"({index} = {}) {
            const at = Number(index);
            if (!Number.isInteger(at) || at < 0 || at >= this.levelList().length) return refused("unknown");
            this.sfEmit("level", {index: at});
            return applied();
        },
        "open-tab"({id} = {}) {
            const wanted = text(id);
            if (!this.tabList().some((tab) => tab.id === wanted)) return refused("unknown");
            this.sfEmit("tab", {id: wanted});
            return applied();
        },
        "toggle-section"({key} = {}) {
            const wanted = text(key);
            if (!this.sectionList().some((section) => section.key === wanted)) return refused("unknown");
            const closed = new Set(this.closedKeys());
            const open = closed.has(wanted);
            if (open) closed.delete(wanted);
            else closed.add(wanted);
            this.closedSections = [...closed];
            this.sfEmit("toggle", {key: wanted, open});
            return applied();
        },
        "item-toggle"({path, index} = {}) {
            const list = this.listField(path);
            if (!list) return refused("unknown");
            const at = Number(index);
            if (!this.itemsOf(list)[at]) return refused("unknown");
            const open = list.open !== at;
            this.sfEmit("item-toggle", {path: list.path, index: at, open});
            return applied();
        },
        "item-add"({path} = {}) {
            const list = this.listField(path);
            if (!list) return refused("unknown");
            if (this.isFull(list)) return refused("full");
            this.focusAfter = {path: list.path, index: this.itemsOf(list).length, generation: this.generation};
            this.sfEmit("item-add", {path: list.path});
            return applied();
        },
        // Any item goes anywhere in its list: nothing in a list is pinned.
        "item-move"({path, index, to, by} = {}) {
            const list = this.listField(path);
            if (!list) return refused("unknown");
            const items = this.itemsOf(list);
            const from = Number(index);
            if (!items[from]) return refused("unknown");
            const wanted = to !== undefined && to !== null ? Number(to) : from + Number(by ?? 0);
            const target = Math.min(items.length - 1, Math.max(0, wanted));
            if (!Number.isInteger(target) || target === from) return refused("unchanged");
            this.focusAfter = {path: list.path, index: target, generation: this.generation};
            this.sfEmit("item-move", {path: list.path, from, to: target});
            return applied();
        },
        "item-duplicate"({path, index} = {}) {
            const list = this.listField(path);
            if (!list) return refused("unknown");
            const at = Number(index);
            if (!this.itemsOf(list)[at]) return refused("unknown");
            if (this.isFull(list)) return refused("full");
            this.focusAfter = {path: list.path, index: at + 1, generation: this.generation};
            this.sfEmit("item-duplicate", {path: list.path, index: at});
            return applied();
        },
        "item-delete"({path, index} = {}) {
            const list = this.listField(path);
            if (!list) return refused("unknown");
            const items = this.itemsOf(list);
            const at = Number(index);
            if (!items[at]) return refused("unknown");
            if (this.isLeast(list)) return refused("least");
            this.focusAfter = {path: list.path, index: Math.min(at, items.length - 2), generation: this.generation};
            this.sfEmit("item-delete", {path: list.path, index: at});
            return applied();
        },
        "focus-item"({path, index} = {}) {
            if (!path) return refused("unknown");
            this.focusAfter = {path: String(path), index: Number(index), generation: this.generation - 1};
            this.requestComponentUpdate("focus-item");
            return applied();
        },
    },
});

class SfMailInspector extends MailInspectorElement {
    static get props() {
        return {...super.props, templateName: {attribute: "template", default: "default"}};
    }

    constructor() {
        super();
        // A list set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        for (const name of ["levels", "headActions", "tabs", "sections", "closedSections", "notice"]) {
            if (Object.prototype.hasOwnProperty.call(this, name)) {
                const early = this[name];
                delete this[name];
                this[name] = early;
            }
        }
        // By path: {text, answered}. What the person typed that the host has not settled.
        this.typed = new Map();
        // By path: the attribute `value` while there is typed text.
        this.heldValues = new Map();
        // By path: what the element itself says at an image field.
        this.ownErrors = new Map();
        // Paths whose image the person just chose; the field previews it until the host answers.
        this.attaching = new Set();
        this.fields = new Map();
        this.generation = 0;
        this.seenSections = null;
        this.seenKey = null;
        this.seenTab = null;
        this.focusAfter = null;
        this.menuFor = null;
        this.said = "";
    }

    levelList() {
        return Array.isArray(this.levels) ? this.levels.filter((level) => level && typeof level.text === "string") : [];
    }

    headActionList() {
        return Array.isArray(this.headActions) ? this.headActions.map(String) : [];
    }

    tabList() {
        return Array.isArray(this.tabs) ? this.tabs.filter((tab) => tab && typeof tab.id === "string" && tab.id) : [];
    }

    sectionList() {
        return Array.isArray(this.sections) ? this.sections.filter((section) => section && typeof section.key === "string" && section.key) : [];
    }

    closedKeys() {
        return Array.isArray(this.closedSections) ? this.closedSections.map(String) : [];
    }

    itemsOf(list) {
        return Array.isArray(list?.items) ? list.items.filter(Boolean) : [];
    }

    isFull(list) {
        return Number.isFinite(list.max) && this.itemsOf(list).length >= list.max;
    }

    isLeast(list) {
        return Number.isFinite(list.min) && this.itemsOf(list).length <= list.min;
    }

    listField(path) {
        const field = this.fields.get(text(path));
        return field?.kind === "items" ? field : null;
    }

    /** Every field that is drawn, by path: a group's, and an open item's. */
    indexFields() {
        this.fields = new Map();
        const walk = (fields) => {
            for (const field of Array.isArray(fields) ? fields : []) {
                if (!field) continue;
                if (typeof field.path === "string") this.fields.set(field.path, field);
                if (field.kind === "group") for (const row of Array.isArray(field.rows) ? field.rows : []) walk(row);
                if (field.kind === "items") walk(this.itemsOf(field)[Number(field.open)]?.fields);
            }
        };
        for (const section of this.sectionList()) walk(section.fields);
    }

    fieldNode(path) {
        return this.querySelector(`[data-path="${CSS.escape(path)}"]`);
    }

    holdsFocus(path) {
        return Boolean(this.fieldNode(path)?.contains(document.activeElement));
    }

    /**
     * New data from the host. What was typed for another form goes with its key.
     * Typed text stays while the host passes an error and while the person is
     * still in the field; otherwise the host's value is what the field shows.
     */
    takeData() {
        const key = text(this.formKey);
        if (key !== this.seenKey) {
            this.seenKey = key;
            this.typed.clear();
            this.heldValues.clear();
            this.ownErrors.clear();
            this.attaching.clear();
        }
        if (this.sections === this.seenSections) return;
        this.seenSections = this.sections;
        this.generation += 1;
        this.indexFields();
        for (const [path, entry] of this.typed) {
            const field = this.fields.get(path);
            // Not drawn now (a closed item): it comes back with the field.
            if (!field || field.error) continue;
            if (this.holdsFocus(path)) entry.answered = true;
            else this.typed.delete(path);
        }
        for (const path of this.attaching) {
            const field = this.fields.get(path);
            const node = this.fieldNode(path);
            if (!field || field.error || imageKey(node?.value) === imageKey(field.value)) this.attaching.delete(path);
        }
    }

    /** The attribute `value`: it holds still while the field has typed text. */
    valueAttribute(field) {
        const value = text(field.value);
        if (!this.typed.has(field.path)) this.heldValues.set(field.path, value);
        return this.heldValues.get(field.path) ?? value;
    }

    isDraft(field) {
        return Boolean(field.error) && this.typed.has(field.path);
    }

    errorOf(field) {
        return field.error || this.ownErrors.get(field.path) || "";
    }

    onFieldInput(path, node) {
        const raw = node.value;
        this.typed.set(path, {text: raw, answered: false});
        this.sfEmit("change", {path, value: raw, typed: true});
    }

    // Leaving a field the host has answered for: it now shows the host's value.
    onFieldLeave(path) {
        requestAnimationFrame(() => {
            const entry = this.typed.get(path);
            if (!entry || !entry.answered || this.holdsFocus(path) || this.fields.get(path)?.error) return;
            this.typed.delete(path);
            this.requestComponentUpdate("left-field");
        });
    }

    onChoice(path, event) {
        const value = event.detail?.value;
        if (typeof value !== "string") return;
        this.sfEmit("change", {path, value, typed: false});
    }

    onImageChoice(path, event) {
        const value = event.detail?.value;
        if (typeof value !== "string" || !value) return;
        this.ownErrors.delete(path);
        this.sfEmit("change", {path, value, typed: false});
        // A list that offers an action, not a value: it reads as not chosen again.
        const node = event.currentTarget;
        requestAnimationFrame(() => node.setAttribute?.("value", ""));
    }

    onSwitch(path, node) {
        this.sfEmit("change", {path, value: Boolean(node.isChecked?.()), typed: false});
    }

    onAttach(path, event) {
        event.stopPropagation();
        const {files, file} = event.detail ?? {};
        const list = Array.isArray(files) && files.length ? files : file ? [file] : [];
        if (!list.length) return;
        this.ownErrors.delete(path);
        this.attaching.add(path);
        this.sfEmit("attach", {path, files: list});
        this.requestComponentUpdate("attach");
    }

    // A required image can be replaced, not removed: the field offers «Убрать»
    // all the same, so the element puts the image back and says why.
    onDetach(path, event) {
        event.stopPropagation();
        const field = this.fields.get(path);
        this.attaching.delete(path);
        if (field?.required) {
            this.ownErrors.set(path, this.sfWord("image-required-text"));
            this.requestComponentUpdate("image-required");
            event.currentTarget.value = field.value ?? null;
            return;
        }
        this.ownErrors.delete(path);
        this.sfEmit("detach", {path});
        this.requestComponentUpdate("detach");
    }

    onRejected(path, event) {
        event.stopPropagation();
        this.ownErrors.set(path, this.sfWord("image-formats-text"));
        this.requestComponentUpdate("image-rejected");
    }

    onLevelPress(event) {
        event.stopPropagation();
        this.goToLevel({index: event.detail?.index});
    }

    // Escape goes one level up, unless a list, a menu, a window or a drag has it.
    onKeydown(event) {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        const target = event.target;
        if (target.closest?.("sf-modal, .sf-modal, sf-dropdown, sf-context-menu, [role=\"listbox\"], [role=\"menu\"]")) return;
        if (document.documentElement.dataset.sfPopoverOpen || document.querySelector("sf-modal[open], [role=\"menu\"]:popover-open, [data-sf-sortable-state=\"dragging\"]")) return;
        const body = target.closest?.("[data-item-body]");
        const answer = this.levelUp();
        if (answer.outcome !== "applied") return;
        event.preventDefault();
        event.stopPropagation();
        // The field that holds the focus goes with the item: the focus stays on the item.
        if (body) this.focusAfter = {path: body.dataset.itemList, index: Number(body.dataset.itemBody), generation: this.generation};
    }

    onTabChange(event) {
        if (event.target !== event.currentTarget) return;
        event.stopPropagation();
        const tab = this.tabList()[event.detail?.current];
        if (!tab) return;
        // sf-tabs has shown it already; `tab` follows, so the host can name another.
        this.seenTab = tab.id;
        this.tab = tab.id;
        this.sfEmit("tab", {id: tab.id});
    }

    // sf-sortable only asks; the list's own redraw comes with the data the host passes.
    onSortableMove(path, event) {
        event.stopPropagation();
        const {item, index} = event.detail ?? {};
        this.itemMove({path, index: Number(String(item).replace("item-", "")), to: index});
    }

    onToggleKeydown(path, index, event) {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            this.openItemMenu(path, index, event.currentTarget.closest("[data-item]")?.querySelector("sf-icon-button"));
            return;
        }
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        event.preventDefault();
        event.stopPropagation();
        const answer = this.itemMove({path, index, by: event.key === "ArrowUp" ? -1 : 1});
        if (answer.outcome !== "applied") return;
        const total = this.itemsOf(this.listField(path)).length;
        this.said = this.sfWord("item-moved-text", {vars: {n: this.focusAfter.index + 1, total}});
        this.requestComponentUpdate("said");
    }

    get menu() {
        return this.querySelector(".sf-mail-inspector-menu");
    }

    menuEntries(list, index) {
        const total = this.itemsOf(list).length;
        return [
            {id: "up", text: this.sfWord("up-text"), icon: "arrow_upward", shortcut: "Alt+↑", disabled: index === 0},
            {id: "down", text: this.sfWord("down-text"), icon: "arrow_downward", shortcut: "Alt+↓", disabled: index === total - 1},
            {id: "duplicate", text: this.sfWord("duplicate-text"), icon: "content_copy", disabled: this.isFull(list)},
            {type: "separator"},
            {id: "remove", text: this.sfWord("delete-text"), icon: "delete", danger: true, disabled: this.isLeast(list)},
        ];
    }

    /** The ⋯ of an item: one menu, filled for the item it was opened from. */
    openItemMenu(path, index, anchor) {
        const list = this.listField(path);
        const menu = this.menu;
        if (!list || !menu) return;
        this.menuFor = {path, index};
        const native = anchor?.querySelector?.("button") ?? anchor;
        // The Loader brings sf-context-menu when the page is ready (the rule
        // fetches it lazily); a press before that waits for it.
        customElements.whenDefined("sf-context-menu").then(() => {
            menu.entries = this.menuEntries(list, index);
            menu.toggleFor(native);
        });
    }

    onMenuSelect(detail = {}) {
        const choice = String(detail.id ?? detail.entry?.id ?? "");
        const asked = this.menuFor;
        if (!choice || !asked) return;
        // The menu gives focus back to ⋯ first; the host's answer then moves it where it belongs.
        setTimeout(() => {
            if (choice === "up") this.itemMove({...asked, by: -1});
            else if (choice === "down") this.itemMove({...asked, by: 1});
            else if (choice === "duplicate") this.itemDuplicate(asked);
            else if (choice === "remove") this.itemDelete(asked);
        }, 0);
    }

    /** After the draw: what a field must show, and where the focus goes. */
    afterRender(changed) {
        const result = super.afterRender?.(changed);
        for (const [path, field] of this.fields) {
            const node = this.fieldNode(path);
            if (!node) continue;
            if (TEXT_KINDS.has(field.kind)) {
                const shown = this.typed.get(path)?.text ?? text(field.value);
                if (node.value !== shown) node.value = shown;
            } else if (field.kind === "select") {
                if (node.getAttribute("value") !== text(field.value)) node.setAttribute("value", text(field.value));
            } else if (field.kind === "switch") {
                if (node.isChecked && node.isChecked() !== Boolean(field.value)) node.setChecked?.(Boolean(field.value));
            } else if (field.kind === "image") {
                const well = node.matches("sf-image-field") ? node : node.querySelector("sf-image-field");
                if (well && !this.attaching.has(path) && imageKey(well.value) !== imageKey(field.value)) well.value = field.value ?? null;
            }
        }
        this.syncTab();
        const asked = this.focusAfter;
        if (asked && asked.generation < this.generation) {
            this.focusAfter = null;
            this.querySelector(`[data-items="${CSS.escape(asked.path)}"] [data-toggle="${asked.index}"]`)?.focus();
        }
        return result;
    }

    // The tab the host names; a press has already moved sf-tabs.
    syncTab() {
        const wanted = text(this.tab);
        if (wanted === this.seenTab) return;
        this.seenTab = wanted;
        const at = this.tabList().findIndex((tab) => tab.id === wanted);
        const node = this.querySelector(":scope sf-tabs.sf-mail-inspector-tabs");
        if (at >= 0 && node?.goTo && Number(node.activeIndex) !== at) node.goTo(at);
    }

    templateContext() {
        this.takeData();
        const closed = new Set(this.closedKeys());
        const path = instancePath(this, {kind: "sf-mail-inspector"});
        const tabs = this.tabList();
        return {
            component: this,
            heading: text(this.heading),
            headingIcon: text(this.headingIcon),
            levels: this.levelList(),
            actions: this.headActionList(),
            notice: this.notice && this.notice.text ? this.notice : null,
            formKey: text(this.formKey),
            tabs,
            tabIndex: Math.max(0, tabs.findIndex((tab) => tab.id === text(this.tab))),
            tabsKey: tabs.map((tab) => `${tab.id}:${tab.slot ?? ""}`).join("|"),
            sections: this.sectionList().map((section, index) => ({
                ...section,
                isOpen: !closed.has(section.key),
                triggerId: partId(path, `trigger-${index}`),
                panelId: partId(path, `panel-${index}`),
            })),
            words: {
                path: this.sfWord("path-label"),
                duplicate: this.sfWord("duplicate-text"),
                delete: this.sfWord("delete-text"),
                replace: this.sfWord("replace-text"),
                add: this.sfWord("item-add-text"),
                imageEmpty: this.sfWord("image-empty-text"),
            },
            itemActionsLabel: (label) => this.sfWord("item-actions-label", {vars: {label}}),
            groupOf,
            said: this.said,
            rootClass: this.getRootClass?.() ?? "",
        };
    }

    template() {
        return renderMailInspectorTemplate(this.templateContext());
    }
}

SfMailInspector.define("sf-mail-inspector");
