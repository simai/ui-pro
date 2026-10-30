// sf-mail-structure: the structure of a letter in SIMAI Email Editor -- the
// letter's own settings, one row per block in the letter's order, and a way to
// add a block. A row chooses its block, moves by its handle or by keys, offers
// a copy and a removal under ⋯, and a point between rows asks for a new block
// in that place. The two places every letter has (header, footer) are pinned:
// they do not move, nothing lands outside them, and their ⋯ offers another
// variant instead.
//
// It holds no letter. The host passes `rows` and `selected`, hears what the
// person asked for and passes the rows back; a drop or an insertion that aims
// beyond a pinned place is told as the nearest place it can have.
//
// Written for ui-mail's editor by the owner's decision D31 (2026-10-29): a
// product keeps no component set of its own. From its component.json (standard
// simai.smart-component 1.4 §3, §4, §8, §11): the settings are attributes and
// properties made by core/js/element-manifest.js, its words are
// lang/<locale>.json, and the actions answer outcomes.
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {renderMailStructureTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});

const MailStructureElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    actions: {
        select({id} = {}) {
            const wanted = String(id ?? "");
            if (wanted && !this.rowOf(wanted)) return refused("unknown");
            this.sfEmit("select", {id: wanted});
            return applied();
        },
        move({id, index, by} = {}) {
            const row = this.rowOf(id);
            if (!row) return refused("unknown");
            if (row.family) return this.pinnedRefusal();
            const at = this.rowList().indexOf(row);
            const wanted = Number.isFinite(Number(index)) && index !== undefined && index !== null ? Number(index) : at + Number(by ?? 0);
            const to = this.clamped(wanted, this.rowList().length - 1);
            if (to === at) return refused("unchanged");
            this.sfEmit("move", {id: row.id, index: to});
            return applied();
        },
        insert({type, index} = {}) {
            const kind = String(type ?? "");
            if (!this.kinds().some((item) => item.value === kind)) return refused("unknown");
            this.sfEmit("insert", {type: kind, index: this.clamped(Number(index ?? this.rowList().length), this.rowList().length)});
            return applied();
        },
        add() {
            this.sfEmit("add", {});
            return applied();
        },
        duplicate({id} = {}) {
            const row = this.rowOf(id);
            if (!row) return refused("unknown");
            if (row.family) return this.pinnedRefusal();
            this.sfEmit("duplicate", {id: row.id});
            return applied();
        },
        remove({id} = {}) {
            const row = this.rowOf(id);
            if (!row) return refused("unknown");
            if (row.family) return this.pinnedRefusal();
            this.sfEmit("delete", {ids: [row.id], id: row.id});
            return applied();
        },
        replace({id} = {}) {
            const row = this.rowOf(id);
            if (!row) return refused("unknown");
            if (!row.family) return refused("not-pinned");
            this.sfEmit("replace", {family: row.family});
            return applied();
        },
    },
});

class SfMailStructure extends MailStructureElement {
    static get props() {
        return {...super.props, templateName: {attribute: "template", default: "default"}};
    }

    constructor() {
        super();
        // A list set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        for (const name of ["rows", "inserterItems"]) {
            if (Object.prototype.hasOwnProperty.call(this, name)) {
                const early = this[name];
                delete this[name];
                this[name] = early;
            }
        }
        this.menuFor = "";
        this.stop = "";
        this.notice = "";
    }

    // [{id, title, summary, icon, family}]: one row per block, in the letter's
    // order. `family` marks a place every letter has ("header", "footer").
    rowList() {
        return Array.isArray(this.rows) ? this.rows.filter((row) => row && typeof row.id === "string" && row.id) : [];
    }

    rowOf(id) {
        return this.rowList().find((row) => row.id === String(id ?? ""));
    }

    /** The kinds an insertion point offers, without the headings between them. */
    kinds() {
        return Array.isArray(this.inserterItems) ? this.inserterItems.filter((item) => item && item.value) : [];
    }

    /**
     * The nearest place a block can have: nothing goes before a pinned header
     * or after a pinned footer, so a place beyond them lands next to them.
     */
    clamped(index, last) {
        const rows = this.rowList();
        const lowest = rows[0]?.family === "header" ? 1 : 0;
        const highest = rows.at(-1)?.family === "footer" ? last - 1 : last;
        return Math.min(highest, Math.max(lowest, index));
    }

    pinnedRefusal() {
        this.notice = this.sfWord("pinned-text");
        this.requestUpdate();
        return refused("pinned");
    }

    get menu() {
        return this.querySelector(".sf-mail-structure-menu");
    }

    menuEntries(row) {
        if (row.family) return [{id: "replace", text: this.sfWord("replace-text"), icon: "swap_horiz"}];
        const rows = this.rowList();
        const at = rows.indexOf(row);
        return [
            {id: "up", text: this.sfWord("up-text"), icon: "arrow_upward", shortcut: "Alt+↑", disabled: this.clamped(at - 1, rows.length - 1) === at},
            {id: "down", text: this.sfWord("down-text"), icon: "arrow_downward", shortcut: "Alt+↓", disabled: this.clamped(at + 1, rows.length - 1) === at},
            {id: "duplicate", text: this.sfWord("duplicate-text"), icon: "content_copy"},
            {type: "separator"},
            {id: "remove", text: this.sfWord("delete-text"), icon: "delete", shortcut: "Delete", danger: true},
        ];
    }

    /** The ⋯ of a row: one menu, filled for the row it was opened from. */
    openMenu(id, anchor) {
        const row = this.rowOf(id);
        const menu = this.menu;
        if (!row || !menu) return;
        this.menuFor = row.id;
        const native = anchor?.querySelector?.("button") ?? anchor;
        // The Loader brings sf-context-menu when the page is ready (the rule
        // fetches it lazily); a press before that waits for it.
        customElements.whenDefined("sf-context-menu").then(() => {
            menu.entries = this.menuEntries(row);
            menu.toggleFor(native);
        });
    }

    // The menu answers for the row it was opened from, whatever is redrawn
    // meanwhile: the id is remembered, not read back out of the markup.
    onMenuSelect(detail = {}) {
        const choice = String(detail.id ?? detail.entry?.id ?? "");
        const id = this.menuFor;
        if (!choice || !id) return;
        if (choice === "up") this.move({id, by: -1});
        else if (choice === "down") this.move({id, by: 1});
        else if (choice === "duplicate") this.duplicate({id});
        else if (choice === "remove") this.remove({id});
        else if (choice === "replace") this.replace({id});
    }

    onRowClick(event, id) {
        if (event.target.closest?.("sf-icon-button")) return;
        this.select({id});
    }

    /** The one tab stop of the list: the chosen row, else the last focused, else the first. */
    tabStop() {
        const rows = this.rowList();
        const selected = String(this.selected ?? "");
        if (rows.some((row) => row.id === selected)) return selected;
        if (rows.some((row) => row.id === this.stop)) return this.stop;
        return rows[0]?.id ?? "";
    }

    onRowKeydown(event, id) {
        // A key on the row's own ⋯ or a held row is not the list's.
        if (event.target !== event.currentTarget) return;
        const row = this.rowOf(id);
        if (!row) return;
        const stopped = () => {
            event.preventDefault();
            event.stopPropagation();
        };
        const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
        if ((event.key === "Enter" || event.key === " ") && !event.altKey) {
            stopped();
            this.sfEmit("select", {id, keyboard: true});
        } else if (event.altKey && vertical) {
            stopped();
            this.move({id, by: event.key === "ArrowUp" ? -1 : 1});
        } else if (vertical || event.key === "Home" || event.key === "End") {
            stopped();
            const rows = this.rowList();
            const at = rows.indexOf(row);
            const to = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : at + (event.key === "ArrowUp" ? -1 : 1);
            this.focusRow(rows[Math.max(0, Math.min(rows.length - 1, to))]?.id);
        } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            stopped();
            this.openMenu(id, event.currentTarget.querySelector("sf-icon-button"));
        } else if (event.key === "Delete" || event.key === "Backspace") {
            stopped();
            this.remove({id});
        }
    }

    focusRow(id) {
        if (!id) return;
        this.stop = id;
        this.requestUpdate();
        this.updateComplete.then(() => this.querySelector(`[data-sf-sortable-item="${CSS.escape(id)}"]`)?.focus());
    }

    // sf-sortable only asks; a pinned row refuses, a drop beyond a pinned place
    // lands next to it. The list's own redraw comes with the rows the host passes.
    onSortableMove(event) {
        event.stopPropagation();
        const {item, index} = event.detail ?? {};
        const row = this.rowOf(item);
        if (!row) return;
        if (row.family) {
            this.pinnedRefusal();
            return;
        }
        this.move({id: item, index});
    }

    onSortableInsert(event) {
        event.stopPropagation();
        const {index, item} = event.detail ?? {};
        // Cancelling keeps the inserter open, which only a synchronous answer can do.
        if (this.insert({type: item, index}).outcome !== "applied") event.preventDefault();
    }

    templateContext() {
        const rows = this.rowList();
        const selected = String(this.selected ?? "");
        const stop = this.tabStop();
        const empty = !rows.some((row) => !row.family);
        return {
            component: this,
            rows: rows.map((row) => ({
                ...row,
                isSelected: row.id === selected,
                isStop: row.id === stop,
                actionsLabel: this.sfWord("actions-label", {vars: {title: String(row.title ?? "")}}),
            })),
            kinds: Array.isArray(this.inserterItems) ? this.inserterItems : [],
            settingsSelected: !selected,
            empty,
            // The card stands where the first content block will go, before the footer.
            emptyBefore: empty ? rows.find((row) => row.family === "footer")?.id ?? "" : "",
            noticeText: this.notice,
            listLabel: this.sfWord("list-label"),
            settingsLabel: this.sfWord("settings-text"),
            addLabel: this.sfWord("add-text"),
            emptyTitle: this.sfWord("empty-heading"),
            emptyText: this.sfWord("empty-text"),
            pinnedLabel: this.sfWord("pinned-text"),
            rootClass: this.getRootClass?.() ?? "",
        };
    }

    template() {
        return renderMailStructureTemplate(this.templateContext());
    }
}

SfMailStructure.define("sf-mail-structure");
