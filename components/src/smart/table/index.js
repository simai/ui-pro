import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {settingSetters} from "./js/manifest-actions.js";
import manifest from "./component.json";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";
import {renderTableTemplate, columnStyle} from "./js/templates/default";
import {optionBadgeProps} from "../helpers/option-badge.js";
import {renderCellField, renderFilterField} from "../field-renderers/index.js";
import {html, nothing, render} from "lit";
import {ref} from "lit/directives/ref.js";
import {pageText} from "../../core/js/page-language";
import {getParent, setParentSpace} from "../helpers/dom";
import {setLoaderDragState} from "../helpers/loaderDragState";
import BundledPosition from "../../core/js/position.js";
import BundledPreferences from "../../core/js/preferences.js";

// Sized for what they hold rather than for reading, so they take no floor.
// Every word this table says, in the two languages the Framework speaks. The
// rule is the shared one -- `pageText` reads the nearest [lang] and falls back
// to the document's -- and it is here because the table said only Russian: on
// an English page the list's toolbar read «Фильтр» and «Создать» beside a
// record panel that had switched, which is the sort of thing only a language
// switch in an admin shows (owner, 2026-10-10).
//
// An attribute still wins over both: a consumer who names a word names it.

// SF.Preferences, the Framework's one store of view preferences (core
// publishes it; this bundle's copy is the fallback).
const preferences = () => globalThis.SF?.Preferences || BundledPreferences;
const tablePreferenceKey = (key) => `sf-table/${String(key).replace(/[^\w.:-]+/gu, "-")}`;
// What a cell may draw as markup rather than as an element of its own.
const LIGHT_CELL_TAGS = new Set(["sf-badge", "sf-tag", "sf-avatar"]);
const GENERAL_TABLE_PREFERENCE = "sf-table/*";
const TABLE_VIEW_DEFAULTS = Object.freeze({density: "normal", stripes: false, lines: false, singleLine: false, stickyHead: true});

// The nearest box that scrolls vertically above an element, across shadow
// roots; null when it is the page.
function verticalScroller(element) {
    for (let node = element; node; node = node.parentElement ?? node.getRootNode?.()?.host ?? null) {
        if (node === document.body || node === document.documentElement) return null;
        const style = getComputedStyle(node);
        if (/(auto|scroll|overlay)/u.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
    }
    return null;
}

// The words are the language files' (lang/<locale>.json, standard 1.3.8 §11),
// read here under the camelCase keys a product registers more languages by
// (SF.language.register("sf-table", code, {filterText: …})).
const camelWords = (words = {}) => Object.fromEntries(Object.entries(words)
    .map(([key, word]) => [key.replace(/-([a-z0-9])/gu, (_, letter) => letter.toUpperCase()), word]));
const TABLE_TEXT = {
    en: camelWords(en.runtime),
    ru: camelWords(ru.runtime),
};


const SYSTEM_COLUMN_KEYS = new Set(["select", "settings", "actions"]);

const positioning = () => globalThis.SF?.Position || BundledPosition;

// Published Composition ports (simai.composition.port-manifest.v1, sf-table@1.0.0).
const SF_TABLE_PORTS = Object.freeze({
    outputs: Object.freeze({selection: "record-ids.v1"}),
    inputs: Object.freeze({context: "record-ids.v1"}),
});
const MAX_PORT_RECORD_IDS = 1000;

function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code < 32 || code === 127) return true;
    }
    return false;
}

function checkedRecordIds(value) {
    if (!Array.isArray(value) || value.length > MAX_PORT_RECORD_IDS
        || Array.from(value).some((id) => !(
            (typeof id === "string" && id.length > 0 && id.length <= 256 && !hasControlCharacter(id))
            || Number.isSafeInteger(id)
        ))
        || new Set(Array.from(value, (id) => `${typeof id}:${id}`)).size !== value.length) {
        throw new TypeError("Record identities must be unique nonempty strings or safe integers");
    }
    return Object.freeze([...value]);
}


// Two tables on one page share nothing: ids, the settings key fallback and the
// portal are all derived from this counter, never from the component name.
let tableInstances = 0;


// Many entries (standard simai.smart-component 1.3.8 §18.4; the quality
// profile 1.3.6-1, gate 17): from this many rows the table draws only the rows
// in view and a margin around them. The row height is measured from a drawn
// row; until one is drawn it is guessed.
const WINDOW_FROM = 300;
const WINDOW_MARGIN = 20;
const WINDOW_INITIAL = 60;
const ROW_HEIGHT_GUESS = 40;
const LONG_TEXT_CELL_TYPES = new Set(['text', 'textarea', 'markdown', 'html']);

// The box a cell value is drawn in: a Smart element that is display: contents
// (sf-tag) has none of its own, so its first child is the one measured and
// folded.
function cellValueBox(item) {
    return getComputedStyle(item).display === 'contents' ? (item.firstElementChild ?? item) : item;
}

// sf-table from its component.json (standard simai.smart-component 1.3.8 §3,
// §4, §8, §11, §18): the settings are attributes and properties, the actions
// answer outcomes, the events take the vocabulary's verbs and the old names
// follow once through the dated aliases (aliases.json). The table's own props
// below keep their parsers and defaults; what they do not name is the
// manifest's.
const TableElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    aliases,
});

class SfTable extends TableElement {
    static get sfPorts() {
        return SF_TABLE_PORTS;
    }

    static get props() {
        return {
            templateName: {attribute: "template", default: "default"},
            ariaLabel: {attribute: "aria-label", default: "Data table"},
            // The row the page has open (component.json settings.current).
            current: {attribute: "current", default: ""},
            selectable: {type: Boolean, default: true},
            // Who owns the vertical scroll. `self` keeps the rows in their own
            // scroll area, which is what a host that bounds the table's height
            // wants and what every page has had so far. `page` gives the
            // vertical scroll to the document, so the head stays visible while
            // the page scrolls; the rows then scroll sideways only.
            verticalScroll: {attribute: 'vertical-scroll', default: 'self', values: ['self', 'page']},
            // How the records are drawn. `auto` is a table while the table's own
            // container is at least `list-below` pixels wide and a compact list
            // of records below that -- a phone, or a list beside an open panel;
            // `table` and `list` hold one of them whatever the width (owner,
            // 2026-10-12: one mobile view, the compact list). A table is a table
            // unless asked: sf-data-view asks for auto on a page's list.
            layout: {default: 'table', values: ['auto', 'table', 'list']},
            listBelow: {attribute: 'list-below', type: Number, default: 600},
            // How many fields a record shows under its title in the list, chosen
            // by the columns' priority (lower first).
            listFields: {attribute: 'list-fields', type: Number, default: 3},
            toolbar: {type: Boolean, default: true},
            settings: {type: Boolean, default: true},
            pagin: {type: Boolean, default: false},
            actions: {type: Boolean, default: true},
            // The row action column alone; the create button still follows actions.
            rowActions: {attribute: "row-actions", type: Boolean, default: true},
            // Rows may be dragged out of the list -- onto a folder of a tree --
            // as records (application/x-sf-records+json).
            dragRows: {attribute: "drag-rows", type: Boolean, default: false},
            // The rows can be put in another order by dragging them inside the
            // list (row-reorder, the storage schema's fields, 2026-10-16).
            rowReorder: {attribute: "row-reorder", type: Boolean, default: false},
            // A boolean cell the host lets a person write is a checkbox
            // (inline-edit; which cells, the record's `editable` says).
            inlineEdit: {attribute: "inline-edit", type: Boolean, default: false},
            // Where the row's buttons are drawn: the active row, or every row.
            rowActionsVisible: {attribute: "row-actions-visible", default: "hover"},
            // The create button and its menu of kinds, inside actions: a data view
            // turns it off for a host on port 1.10.0 that does not announce
            // create-record, so nothing is offered that nobody would answer.
            creatable: {type: Boolean, default: true},
            // The button that saves the filter as a template. A data view turns it
            // off when the host keeps no saved views: a template saved there went
            // nowhere and was gone on the next load.
            filterTemplates: {attribute: "filter-templates", type: Boolean, default: true},
            // The gear in the head of the settings column, which opens the column
            // settings. Off, the column still carries each row's menu.
            settingsMenu: {attribute: "settings-menu", type: Boolean, default: true},
            // The step of the size ladder the table's own controls take: its
            // toolbar, its row boxes and menus, its filters and context menus.
            // 1/2 is the dense admin step -- 32px controls, 14/20 text, the
            // height of the admin menu beside it -- and the rows follow.
            size: {default: "1", values: ["1/2", "1"]},
            filterText: {attribute: "filter-text", default: "Filter"},
            clearText: {attribute: "clear-text", default: "Clear"},
            searchPlaceholder: {attribute: "search-placeholder", default: "Search"},
            createText: {attribute: "create-text", default: "Create"},
            pinColumnLabel: {attribute: "pin-column-label", default: "Pin the column"},
            unpinColumnLabel: {attribute: "unpin-column-label", default: "Unpin the column"},
            paginationTotal: {
                attribute: "pagination-total",
                type: Number,
                default: 10,
            },
            paginationPageSize: {
                attribute: "pagination-page-size",
                type: Number,
                default: 10,
            },
            pageSizes: {
                attribute: "page-sizes",
                default: "10,20,30,40",
            },
            contextMenuColumns: {
                attribute: "context-menu-columns",
                type: Number,
                // One, because one is what every table has drawn since this input
                // existed: the read was bare, so neither the declared 2 nor a value
                // a host passed ever reached the menu, which fell to `?? 1`. The
                // getter below makes the input work for the first time, and the
                // default is set to the shipped behaviour so that making it work
                // changes nothing for anyone who does not ask.
                default: 1,
            },
            // A table no host keeps settings for remembers its column widths in
            // this browser (owner, 2026-10-14), under table-settings-key.
            rememberWidths: {attribute: "remember-widths", type: Boolean, default: false},
            // The key the arrangement is kept under as a view preference.
            preferencesKey: {attribute: "preferences-key", default: ""},
            tableSettingsKey: {
                attribute: "table-settings-key",
                // Empty, because the effective default was never a string at all:
                // the bare read fell through to the attribute, then the element's
                // id, then its instance id, so every table had its own key. The
                // declaration said "users" and the manifest said
                // "admin.collection" -- two different untruths about the same
                // input. Either one, read properly, would have made every table on
                // a page share one settings key and overwrite the others.
                default: "",
            },
            dataState: {
                attribute: "data-state",
                default: "auto",
                values: ["auto", "loading", "populated", "empty", "error"],
            },
            loadingText: {attribute: "loading-text", default: "Loading"},
            emptyText: {attribute: "empty-text", default: "No data"},
            errorText: {attribute: "error-text", default: "The data could not be loaded"},
            retryText: {attribute: "retry-text", default: "Try again"},
            columnMoveLabel: {
                attribute: "column-move-label",
                default: "Move the column",
            },
            filterApplyText: {
                attribute: "filter-apply-text",
                default: "Apply",
            },
            columnSearchPlaceholder: {
                attribute: "column-search-placeholder",
                default: "Search the fields",
            },
            columnSearchEmptyText: {
                attribute: "column-search-empty-text",
                default: "No field matches",
            },
        };
    }

    // The manifest's declared defaults for these two were fixed in the same
    // commit as these getters and then lost: a rebase replayed a hand-picked list
    // of source files and classified smart.manifest.json as regenerable, which is
    // true of its provenance and false of its declarations. Two pairs shipped with
    // the getters resolving one thing and the manifest declaring another. The
    // other Framework session's defaults contract -- the manifest default against
    // the value a component resolves with no attribute set -- is what catches this
    // class, and it would have caught it here.
    // Declaring a prop creates no accessor in this Framework. These two were read
    // off `this` and were undefined, which the other Framework session's new
    // contract now names. Each is written so that reading it properly preserves
    // the behaviour that shipped, rather than applying a default that never
    // applied.
    get contextMenuColumns() {
        const declared = this.getNumberAttr?.("context-menu-columns", 1) ?? 1;
        return Number.isFinite(declared) && declared > 0 ? declared : 1;
    }

    get tableSettingsKey() {
        return this.getAttribute?.("table-settings-key") || "";
    }

    constructor() {
        super();

        this._emptyContext = null;
        // One handler for every row's press, not a closure per row and render.
        this.rowPointerDown = (event) => this.handleRowPointerDown(event);
        this._windowRange = null;
        this._windowed = false;
        this._rowHeight = 0;
        // The empty state's actions: retry and create are the table's own;
        // anything else (the data view's query reset) goes on up.
        this.addEventListener("sf-empty-state-action", (event) => {
            const id = event.detail?.id;
            if (id === "retry") { event.stopPropagation(); this.requestRetry(); }
            else if (id === "create") { event.stopPropagation(); this.requestCreateIntent(); }
            else if (id === "reset-query") { event.stopPropagation(); this.resetQuery(this._emptyContext?.reset ?? "both"); }
        });
        this._portalContainer = null;
        this._instanceId = `sf-table-${++tableInstances}`;
        this._selectionPortKey = "[]";
        this._routeContext = null;
        this._querySequence = 0;
        this._pendingQuerySequence = null;
        this._abandonedQuery = false;
        this._filterOptionPages = new Map();
        this._contextViewportBound = false;
        this.contextKeyEvent = this.contextKeyEvent.bind(this);
        this.contextViewportEvent = this.contextViewportEvent.bind(this);

        this.ACTIONS_SETTINGS_ROW =
            [
                {
                    name: this.text('editActionText'),
                    id: 'edit',
                    component: {
                        type: 'icon-button',
                        props: {
                            kind: 'icon',
                            size: '1',
                            appearance: 'link',
                            scheme: 'on-surface',
                            icon: 'edit',
                            ariaLabel: this.text('editActionText'),
                            value: 'edit',
                        }
                    }
                },
                {
                    name: this.text('viewActionText'),
                    id: 'view',
                    component: {
                        type: 'icon-button',
                        props: {
                            kind: 'icon',
                            size: '1',
                            appearance: 'link',
                            scheme: 'on-surface',
                            icon: 'visibility',
                            ariaLabel: this.text('viewActionText'),
                            value: 'view',

                        }
                    }
                },
                {
                    name: this.text('deleteActionText'),
                    id: 'delete',
                    // The kit marks its own delete destructive, as the template
                    // menu already does (`danger: !isDeleted`): the row menu
                    // draws a danger entry in `error`, and a host that narrows
                    // this catalogue gets the entry back untouched, so naming
                    // delete in a host catalogue only to restore the red row is
                    // no longer the price of leaving it to the kit (Larena
                    // storage QA, 2026-10-22). The icon in the actions column
                    // says the same with `status: 'error'` (decided 2026-10-23,
                    // control/VISUAL-DECISIONS.md «Разрушительное действие
                    // строкой»): one act must not look like two on the two
                    // surfaces of one row, and with the column's default
                    // visibility at most one red icon shows at a time. The
                    // status paints, the scheme stays the family it falls back
                    // to (sf-icon-button: they cannot both paint it).
                    danger: true,
                    component: {
                        type: 'icon-button',
                        props: {
                            kind: 'icon',
                            size: '1',
                            appearance: 'link',
                            scheme: 'on-surface',
                            status: 'error',
                            icon: 'delete',
                            ariaLabel: this.text('deleteActionText'),
                            value: 'delete'
                        }
                    }
                },
            ];

        // Row actions are a system column like select and settings: always last,
        // not resizable or draggable, and never part of saved column settings.
        this.TABLE_ACTIONS_COLUMN = {
            key: "actions",
            label: this.text("actionsColumnLabel"),
            system: true,
        }

        this.TABLE_SETTINGS_COLUMN = {
            key: "settings",
            label: "settings",
            system: true,
            width: 'calc(var(--sf-text-height-1) + (var(--sf-ui-1--space-y-tightness-default) * 2) + var(--sf-b6))',
            component: {
                type: "icon-button",
                props: {
                    size: "1",
                    appearance: "link",
                    scheme: "on-surface",
                    icon: "settings",
                    ariaLabel: this.text("settingsColumnLabel"),
                    value: "settings",
                    // The gear opens the window and closes it again.
                    // One click reaches this twice (the button, then its host), so
                    // only a later click closes what this one opened.
                    '@click': (e) => {
                        const open = this.state.contextMenu?.open && this.state.contextMenu?.menu === 'table-settings';
                        if (open && e.timeStamp - (this._settingsOpenedAt ?? 0) > 200) {
                            this.closeContextMenu();
                            return;
                        }
                        if (open) return;
                        this._settingsOpenedAt = e.timeStamp;
                        this.openContextMenu(e, {menu: 'table-settings'})
                    }
                },
            },
        };
        this.contextEvent = this.contextEvent.bind(this);
        this.hoverEvents = this.hoverEvents.bind(this);
        this.outEvent = this.outEvent.bind(this);
        this._contextEventBound = false;
        this._hoverEventBound = false;
        this._columnResizeEventBound = false;
        this._headerSortableRow = null;
        this._headerSortableDetach = null;
        this._columnResizeState = null;
        this.searchChange = this.scheduleSearchChange.bind(this);
        this._searchDebounceTimer = null;
        this._searchPendingProps = null;
        this._searchHoldKey = '';
        this.refs = {
            contextMenu: this.createRef(),
            items: new Map(),
            templateForm: this.createRef(),
            renameInput: this.createRef(),
            table: this.createRef(),
            scroll: this.createRef(),
            rail: this.createRef(),
            resizeGuide: this.createRef(),
        }
        this._currentRowId = null;
        this._checkboxMeasureToken = 0;
        this._responsiveWidth = 0;
        this._responsiveObserver = null;
        this._filterTemplatesLoaded = false;
        this.tempSettings = null;
        this.state = {
            settingsChecked: false,
            bulkActions: [],
            createItems: [],
            // What the toolbar's own control offers, straight from the host.
            toolbarActions: [],
            // What is typed over the list of fields in the column settings.
            columnSettingsQuery: "",
            sort: {key: null, direction: null},

            saveInputValue: '',
            search: {
                searchActive: false,
                value: ''
            },
            contextMenu: {
                open: false,
            },
            actions: this.getActions().map((action) => Object.assign(action, {visible: true})),
            actionActive: this.getProp('actions'),
            columnSettings: {},
            selectIndeterminate: false,
            filterDataDirty: false,
            filter: {
                selectedTemplateKey: 'default',
                fields: [],
                templates: [],
                edit: {
                    rename: ''
                }
            },
        }
        this.TABLE_SELECT_COLUMN = {
            key: "select",
            label: "select",
            system: true,
            width: 'calc(var(--sf-text-height-1) + var(--sf-b6) + calc(var(--sf-px) * 2))',
            component: {
                type: "checkbox",
                props: {
                    position: 'end',
                    rootClass: 'content-main-between',
                    size: this.size,
                    '@change': (event) => {
                        const checked = Boolean(event.target.checked);
                        // Marking the page leaves no single row as the anchor a
                        // later Shift-click could extend from, so it is dropped
                        // rather than left pointing at whatever was clicked last.
                        this._selectionAnchorId = null;
                        this.set({selectIndeterminate: false, settingsChecked: checked});
                        this.updateRows((row) => ({
                            ...row,
                            select: this.getDefaultRowCell(this.TABLE_SELECT_COLUMN, {
                                ...row, selected: checked, checked,
                            }),
                        }), "select-all");
                    },
                    indeterminate: this.state.selectIndeterminate,
                    checked: this.state.settingsChecked,
                    ariaLabel: this.text("selectAllLabel"),
                },
            },
            rowComponent: {
                type: "checkbox",
                props: {
                    position: 'end',
                    rootClass: 'content-main-between',
                    size: this.size,

                },
            },
        };
    }

    // ---------- the manifest's list settings and values (§4, §18) ----------
    // Each list setting is the property its set-<name> helper writes.

    get rows() { return this.getTableData().rows || []; }

    set rows(rows) { this.setRows(Array.isArray(rows) ? rows : []); }

    get columns() { return this.getTableData().columns || []; }

    set columns(columns) { this.setColumns(Array.isArray(columns) ? columns : []); }

    get tableData() { return this.getTableData(); }

    set tableData(data) { this.setTableData(data && typeof data === "object" ? data : {}); }

    get tableSettings() { return this.getColumnSettings(); }

    set tableSettings(data) { this.setTableSettings(data && typeof data === "object" ? data : {}); }

    get bulkActions() { return this.state?.bulkActions ?? []; }

    set bulkActions(actions) { this.setBulkActions(actions); }

    get createItems() { return this.state?.createItems ?? []; }

    set createItems(items) { this.setCreateItems(items); }

    get toolbarActions() { return this.getToolbarActions(); }

    set toolbarActions(items) { this.setToolbarActions(items); }

    get filterFields() { return this.getFilterFields(); }

    set filterFields(fields) { this.setFilterFields(fields); }

    get activeFilterFields() { return this.getActiveFilterFieldKeys(); }

    set activeFilterFields(keys) { this.setActiveFilterFields(keys); }

    get templates() { return this.getFilterTemplates(); }

    set templates(data) { this.setTemplates(data); }

    // The host's echo of the order (§4.3 controlled; vocabulary 1.1.5 §2.1):
    // [{key, direction}], the main column first.
    get sort() {
        const {key, direction} = this.state?.sort ?? {};
        return key && direction ? [{key, direction}] : [];
    }

    set sort(list) {
        const first = Array.isArray(list) ? list[0] : list;
        const key = first?.key ?? first?.field ?? null;
        const direction = first?.direction ?? first?.dir ?? null;
        if (key && ["asc", "desc"].includes(direction)) this.setSort(key, direction);
        else this.setSort(null, null);
    }

    // The row the page has open: marked aria-current, not focused.
    get current() { return this._currentRowId ?? ""; }

    set current(id) {
        const value = id === null || id === undefined ? "" : String(id);
        this._currentRowId = value || null;
        if ((this.getAttribute("current") ?? "") !== value) {
            if (value) this.setAttribute("current", value);
            else this.removeAttribute("current");
        } else {
            this.requestComponentUpdate("current");
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === "current" && oldValue !== newValue) this._currentRowId = newValue || null;
        super.attributeChangedCallback?.(name, oldValue, newValue);
    }

    get selected() { return this._currentRowId ?? undefined; }

    get selection() { return this.getSelectedRecordIds(); }

    // Whether an action was called with its parameters as one object (§4.4).
    isActionParameters(value, names) {
        return value !== null && typeof value === "object" && !Array.isArray(value)
            && Object.getPrototypeOf(value) === Object.prototype && names.some((name) => Object.hasOwn(value, name));
    }

    focusRowAction({id} = {}) {
        if (id === null || id === undefined || id === "") return {outcome: "refused", reason: "empty"};
        this.focusRow(String(id), {reveal: true});
        return {outcome: "applied"};
    }

    // The old names whose detail §8 changed (split rows of aliases.json).
    sfAliasAdapters() {
        return {
            "sf-table-action-intent": (detail) => Object.freeze({action_id: detail.action, record_ids: detail.ids}),
            "sf-port-output": (detail) => Object.freeze({port: "selection", value: detail.ids}),
            onSearchEnd: (detail) => detail.search,
        };
    }

    getActions() {
        if (this.getProp('actions')) {
            return this.ACTIONS_SETTINGS_ROW.map((action) => {
                const {name, id} = action;
                return {name, id}
            })
        } else {
            return [];
        }
    }

    isSearchHoldKey(key = '') {
        return key === 'Backspace' || key === 'Delete';
    }

    clearSearchDebounce() {
        if (this._searchDebounceTimer) {
            clearTimeout(this._searchDebounceTimer);
            this._searchDebounceTimer = null;
        }
    }

    scheduleSearchChange(props = {}) {
        this._searchPendingProps = props;
        this.clearSearchDebounce();

        if (this._searchHoldKey) {
            return this;
        }

        this._searchDebounceTimer = setTimeout(() => {
            const pendingProps = this._searchPendingProps || {};
            this._searchPendingProps = null;
            this._searchDebounceTimer = null;
            this.updateSearchState(pendingProps);
        }, 500);

        return this;
    }

    handleSearchKeyDown(event) {
        if (!this.isSearchHoldKey(event?.key)) {
            return this;
        }

        this._searchHoldKey = event.key;
        this.clearSearchDebounce();
        return this;
    }

    handleSearchKeyUp(event) {
        if (!this._searchHoldKey || event?.key !== this._searchHoldKey) {
            return this;
        }

        this._searchHoldKey = '';
        if (this._searchPendingProps) {
            this.scheduleSearchChange(this._searchPendingProps);
        }

        return this;
    }

    updateSearchState(props = {}, isActiveState = true) {
        const currentSearch = this.state.search || {};

        let needUpdate = false;

        for (const [key, value] of Object.entries(props)) {
            if (!Object.is(currentSearch[key], value)) {
                needUpdate = true;
                break;
            }
        }
        if (!needUpdate) return this;
        this.set((prevState) => {
            return {
                search: {
                    ...prevState.search,
                    ...props
                }
            }
        });
        if (!isActiveState) return this;
        // Said at once, not after this render: the host's answer (a data view
        // marking the rows loading) then lands in the same frame, and a search
        // costs one render before its rows, not two (rules of the road, rule 1).
        // The old camelCase onSearchEnd is a dated alias of this name
        // (aliases.json, simai/ui-pro#1): it follows once with its old detail.
        this.emitTableEvent('search-change', {search: this.state.search.value});
        return this;
    }

    // Every event by its verb, as the manifest declares it (standard 1.3.8
    // §8): the DOM name is <tag>-<verb>, and the old names follow once
    // through the dated aliases (aliases.json), noted in SF.deprecations when
    // a listener reads them. Answers false when a listener refused a
    // cancelable request.
    emitTableEvent(verb, detail = {}, options = {}) {
        return this.sfEmit(verb, detail, options);
    }

    requestActionIntent(actionId, recordIds, options = {}) {
        // An action takes its parameters as one object too (standard 1.3.8 §4.4).
        if (this.isActionParameters?.(actionId, ["action-id", "actionId"])) {
            ({actionId, recordIds} = {actionId: actionId["action-id"] ?? actionId.actionId, recordIds: actionId["record-ids"] ?? actionId.recordIds});
        }
        if (typeof actionId !== 'string' || !actionId.trim()
            || !Array.isArray(recordIds) || recordIds.length === 0
            || Array.from(recordIds).some((id) => !(
                (typeof id === 'string' && id.length > 0) || Number.isSafeInteger(id)
            ))) {
            throw new TypeError('Action intent requires an opaque action ID and nonempty typed record IDs');
        }
        const ids = Object.freeze([...recordIds]);
        const rows = this.getTableData().rows || [];
        const revisions = {};
        for (const id of ids) {
            const revision = rows.find((row) => row?.id === id)?.revision;
            if (revision !== undefined && revision !== null) revisions[id] = revision;
        }
        // Vocabulary §5 apply (§18.3): one row's own action is scope entry, a
        // bulk one scope selection. The old sf-table-action-intent follows
        // with its {action_id, record_ids} (a split row and its adapter).
        const scope = options?.scope ?? (ids.length === 1 ? "entry" : "selection");
        this.emitTableEvent('apply', Object.freeze({action: actionId, scope, ids, revisions: Object.freeze(revisions)}));
        return {outcome: "applied"};
    }

    getSelectedRecordIds() {
        return this.getTableData().rows
            .filter((row) => row.select?.component?.props?.checked === true)
            .map((row) => row.id);
    }

    setBulkActions(actions = []) {
        if (!Array.isArray(actions) || Array.from(actions).some((action) =>
            !action || typeof action !== 'object'
            || typeof action.id !== 'string' || !action.id.trim()
            || typeof action.name !== 'string' || !action.name.trim()
            || Object.keys(action).some((key) => key !== 'id' && key !== 'name'))) {
            throw new TypeError('Bulk actions require opaque id and name only');
        }
        return this.set({bulkActions: actions.map(({id, name}) => ({id, name}))});
    }

    renderBulkActions() {
        if (!this.state.bulkActions?.length) return nothing;
        const selected = this.getSelectedRecordIds();
        return html`<div class="flex flex-wrap gap-1/3">
            ${this.state.bulkActions.map((action) => html`<sf-button
                text=${action.name} ?disabled=${selected.length === 0}
                @click=${() => {
                    const ids = this.getSelectedRecordIds();
                    if (ids.length) this.requestActionIntent(action.id, ids, {scope: "selection"});
                }}></sf-button>`)}
        </div>`;
    }

    // Items for the create split button menu. Choosing one (or the main
    // button, with item null) emits sf-table-create-intent; the host opens its form.
    setCreateItems(items = []) {
        if (!Array.isArray(items) || Array.from(items).some((item) =>
            !item || typeof item !== 'object'
            || typeof item.id !== 'string' || !item.id.trim()
            || typeof item.name !== 'string' || !item.name.trim()
            || Object.keys(item).some((key) => key !== 'id' && key !== 'name'))) {
            throw new TypeError('Create items require opaque id and name only');
        }
        return this.set({createItems: items.map(({id, name}) => ({id, name}))});
    }

    requestCreateIntent(itemId = null) {
        if (this.isActionParameters?.(itemId, ["item-id", "itemId"])) itemId = itemId["item-id"] ?? itemId.itemId ?? null;
        if (itemId !== null && !this.state.createItems.some((item) => item.id === itemId)) {
            throw new TypeError(`sf-table has no create item ${String(itemId)}`);
        }
        this.emitTableEvent('create', Object.freeze({item: itemId}));
        return {outcome: "applied"};
    }

    // The actions of the view itself, set by the host: the toolbar's control is
    // a menu of them. Round three took it off column settings, which the gear
    // in the head already owns, and gave it the job the Bitrix-like tables give
    // it -- everything the page used to carry as its own buttons.
    setToolbarActions(items = []) {
        if (!Array.isArray(items) || Array.from(items).some((item) =>
            !item || typeof item !== 'object'
            || typeof item.id !== 'string' || !item.id.trim()
            || typeof item.label !== 'string' || !item.label.trim()
            || (item.icon != null && typeof item.icon !== 'string')
            || (item.href != null && !this.isSameSiteHref(item.href))
            || Object.keys(item).some((key) => !['id', 'label', 'icon', 'href'].includes(key)))) {
            throw new TypeError('Toolbar actions require id and label, and an optional icon and same-site href');
        }
        return this.set({
            toolbarActions: items.map(({id, label, icon, href}) => ({
                id, label, ...(icon ? {icon} : {}), ...(href ? {href} : {}),
            })),
        });
    }

    getToolbarActions() {
        return (this.state.toolbarActions || []).map((item) => ({...item}));
    }

    // A link out of the table may only go to this same site. A host that sends
    // another origin is sending the person somewhere the table cannot vouch for.
    isSameSiteHref(href = "") {
        const value = String(href ?? "").trim();
        if (!value || value.startsWith("//")) return false;
        try {
            return new URL(value, document.baseURI).origin === new URL(document.baseURI).origin;
        } catch {
            return false;
        }
    }

    // The event carries the id, and an item with an href also goes there. The
    // event is cancelable, so a host that routes its own pages keeps the view
    // on the page: it calls preventDefault and navigates itself.
    requestToolbarAction(actionId) {
        const action = this.getToolbarActions().find((item) => item.id === actionId);
        if (!action) {
            throw new TypeError(`sf-table has no toolbar action ${String(actionId)}`);
        }
        const allowed = this.emitTableEvent('toolbar-action', Object.freeze({action: action.id, href: action.href ?? null}), {cancelable: true});
        if (allowed && action.href && this.isSameSiteHref(action.href)) {
            window.location.assign(action.href);
        }

        return this;
    }

    renderToolbarActionsContextMenu(data) {
        const {x, y} = data;
        // The standard menu's entries, not link buttons: a link button in a
        // menu drew centred text on a light block that looked like no other
        // menu in the admin (owner, 2026-10-13).
        const actions = this.getToolbarActions();
        const entries = actions.map((action) => ({
            id: String(action.id),
            text: action.label,
            ...(action.icon ? {icon: action.icon} : {}),
        }));
        const select = (event) => {
            const action = actions.find((item) => String(item.id) === event.detail?.id);
            this.closeContextMenu();
            if (action) this.requestToolbarAction(action.id);
        };
        return html`
            <sf-context-menu
                    size=${this.size === "1/2" ? "1/2" : "1"}
                    :key=${x + y}
                    aria-label=${this.getContextMenuLabel({...data, menu: 'toolbar-actions'})}
                    style="
            position: fixed;
            left: ${x}px;
            inset-block-start: calc(${y}px + calc(var(--sf-focus-outline-width) * 2));
            z-index: var(--sf-table-context-menu--z-index, var(--sf-z-index-9));
          "
                    data-context-main-menu
                    .entries=${entries}
                    @sf-context-menu-select=${select}
            ></sf-context-menu>
        `;
    }

    // The list has no column heads to sort by, so its sort is a menu: the host's
    // own order, then each sortable column one way and the other. Choosing one
    // raises sf-table-sort-change exactly as a head does.
    renderListSortContextMenu(data) {
        const {x, y} = data;
        const current = this.state.sort || {};
        const choose = (key, direction) => {
            this.closeContextMenu();
            this.setSort(key, direction);
            this.emitTableEvent('sort-change', Object.freeze({key, direction}));
        };
        const choices = new Map();
        const option = (text, key, direction) => {
            const id = `${key ?? ''}:${direction ?? ''}`;
            choices.set(id, [key, direction]);
            return {id, text, kind: 'radio', checked: current.key === key && current.direction === direction};
        };
        const select = (event) => {
            const choice = choices.get(event.detail?.id);
            if (choice) choose(...choice);
        };
        const sortable = this.getColumns().filter((column) => column?.sortable && !column.system
            && !["select", "settings", "actions"].includes(column.key));
        const items = [
            option(this.text('sortNone'), null, null),
            ...sortable.flatMap((column) => [
                option(`${column.label ?? column.key}, ${this.text('sortAscending')}`, column.key, 'asc'),
                option(`${column.label ?? column.key}, ${this.text('sortDescending')}`, column.key, 'desc'),
            ]),
        ];
        return html`
            <sf-context-menu
                    size=${this.size === "1/2" ? "1/2" : "1"}
                    :key=${x + y}
                    aria-label=${this.getContextMenuLabel({...data, menu: 'list-sort'})}
                    style="
            position: fixed;
            left: ${x}px;
            inset-block-start: calc(${y}px + calc(var(--sf-focus-outline-width) * 2));
            z-index: var(--sf-table-context-menu--z-index, var(--sf-z-index-9));
          "
                    data-context-main-menu
                    .entries=${items}
                    @sf-context-menu-select=${select}
            ></sf-context-menu>
        `;
    }

    renderCreateContextMenu(data) {
        const {x, y} = data;
        const createItems = this.state.createItems;
        const entries = createItems.map((item) => ({id: String(item.id), text: item.name}));
        const select = (event) => {
            const item = createItems.find((entry) => String(entry.id) === event.detail?.id);
            this.closeContextMenu();
            if (item) this.requestCreateIntent(item.id);
        };
        return html`
            <sf-context-menu
                    size=${this.size === "1/2" ? "1/2" : "1"}
                    :key=${x + y}
                    aria-label=${this.getContextMenuLabel({...data, menu: 'create'})}
                    style="
            position: fixed;
            left: ${x}px;
            inset-block-start: calc(${y}px + calc(var(--sf-focus-outline-width) * 2));
            z-index: var(--sf-table-context-menu--z-index, var(--sf-z-index-9));
          "
                    data-context-main-menu
                    .entries=${entries}
                    @sf-context-menu-select=${select}
            ></sf-context-menu>
        `;
    }

    // Sorting reports intent only: the table marks the header and emits
    // sf-table-sort-change; the host reorders or reloads the rows.
    getSort() {
        return {...this.state.sort};
    }

    setSort(key = null, direction = null) {
        if (this.isActionParameters?.(key, ["key", "direction"])) ({key = null, direction = null} = key);
        if (key === null || direction === null) {
            this.set({sort: {key: null, direction: null}});
            return {outcome: "applied"};
        }
        if (typeof key !== 'string' || !key || !['asc', 'desc'].includes(direction)) {
            throw new TypeError('Sort requires a column key and direction asc or desc');
        }
        this.set({sort: {key, direction}});
        return {outcome: "applied"};
    }

    toggleSort(key) {
        const current = this.state.sort || {};
        const direction = current.key !== key ? 'asc'
            : current.direction === 'asc' ? 'desc'
            : current.direction === 'desc' ? null
            : 'asc';
        this.setSort(direction ? key : null, direction);
        return this.emitTableEvent('sort-change', Object.freeze({key, direction}));
    }

    // Pointer capture sends the click that ends a column drag or resize to the
    // header cell; that click must not also sort the column.
    suppressNextHeaderClick() {
        this._suppressHeaderClick = true;
        setTimeout(() => {
            this._suppressHeaderClick = false;
        }, 0);
    }

    handleHeaderSortClick(event, column = {}) {
        if (column.sortable !== true || column.system || this._suppressHeaderClick) return;
        const target = event.composedPath?.()[0] || event.target;
        // A click on the width strip is not a click on the header's own title.
        if (target instanceof Element && target.closest('.sf-table-column-resizer')) return;
        this.toggleSort(column.key);
    }

    // Emits the selection output once per change of the explicit selection.
    syncSelectionPort() {
        if (!this._isMounted) return this;
        const ids = this.getSelectedRecordIds();
        const key = JSON.stringify(ids.map((id) => [typeof id, id]));
        if (key === this._selectionPortKey) return this;
        this._selectionPortKey = key;
        // Vocabulary §5 select {ids} (§18.2); the composition port's
        // sf-port-output {port: selection, value} follows once (a split row).
        this.emitTableEvent("select", Object.freeze({ids: Object.freeze([...ids])}));
        return this;
    }

    // One row's box has been marked. A plain click marks that row; Shift+click
    // marks every row between the last one marked and this one, with the value
    // the clicked box just took, which is what makes unmarking a range work too.
    applyRowSelection(rowId, checked, {range = false} = {}) {
        const rows = this.getTableData().rows;
        const sameRow = (row, id) => String(row?.id ?? "") === String(id ?? "");
        const index = rows.findIndex((row) => sameRow(row, rowId));
        if (index < 0) return this;
        const anchorIndex = range && this._selectionAnchorId != null
            ? rows.findIndex((row) => sameRow(row, this._selectionAnchorId))
            : -1;
        const from = anchorIndex < 0 ? index : Math.min(anchorIndex, index);
        const to = anchorIndex < 0 ? index : Math.max(anchorIndex, index);
        // The page box is cleared first: a row cell asks `settingsChecked`
        // whether it is marked, so leaving it set would mark the rows this call
        // is unmarking back again.
        this.set({settingsChecked: false});
        this.updateRows((row, position) => (position < from || position > to ? row : {
            ...row,
            selected: checked,
            checked,
            select: this.getDefaultRowCell(this.TABLE_SELECT_COLUMN, {...row, selected: checked, checked}),
        }), range && anchorIndex >= 0 ? "select-range" : "select-row");
        this._selectionAnchorId = rowId;
        return this.syncSelectAllState();
    }

    // The page box answers for the rows under it: all of them, some of them, or
    // none. It is computed from the rows rather than counted as rows are
    // clicked, so appended rows and a replaced page cannot drift from it.
    syncSelectAllState() {
        const count = this.getSelectedRecordIds().length;
        const total = this.getTableData().rows.length;
        return this.set({
            settingsChecked: total > 0 && count === total,
            selectIndeterminate: count > 0 && count < total,
        });
    }

    // What a pointer press has to settle before the click arrives: whether a
    // range is being extended, and that the press must not start a text
    // selection. A Shift-click or a second click otherwise selects the text of
    // every row it passes over, which is what the host reported.
    handleRowPointerDown(event) {
        this._selectRangeModifier = event?.shiftKey === true;
        if (event?.shiftKey === true || event?.detail > 1) {
            event.preventDefault?.();
        }
        return this;
    }

    // Controls inside a row answer for themselves. A click on a box, a row
    // menu, a link, a button or a field is that control's click, and neither
    // focuses the row nor opens the record.
    isRowControlTarget(target) {
        if (!(target instanceof Element)) return false;
        return Boolean(target.closest(
            'td[data-key="select"], td[data-key="settings"], a[href], button, input, select, textarea,'
            + ' [role="button"], [role="link"], sf-checkbox, sf-dropdown, sf-button, sf-icon-button',
        ));
    }

    // A single click makes the row the current one — wherever in the row it
    // lands. It does not mark it: marking is the box's job, and a click that did
    // both would let a stray click destroy a selection the person had built up.
    //
    // The first version skipped a click on anything interactive, which read
    // well until a consumer's cells turned out to be links: clicking the only
    // content a cell has left the row unmarked as current, and the rule looked
    // broken rather than careful. A control still does its own work — a link
    // still follows, a box still marks — and the row moving under the pointer
    // takes nothing away from that. Only opening the record stays off limits
    // from a control.
    handleRowClick(event, row, index = -1) {
        this.focusRow(this.getRowKey(row, index));
        this.openReferenceFromCell(event, row);
        return this;
    }

    // A value that points at another record -- a person, a file, a related
    // record -- opens that record in the page's panel instead of loading a page
    // (owner, 2026-10-14): the table asks with sf-table-reference-open and the
    // data view raises record.open {field, value, href}. A click with a
    // modifier or the middle button still follows the address, so a new tab is
    // one keystroke away; a host that cannot open it gets the address.
    openReferenceFromCell(event, row) {
        if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target?.closest?.("a[href]");
        const cell = link?.closest?.("td[data-key]");
        if (!link || !cell || !this.contains(cell)) return;
        const field = cell.dataset.key;
        const value = row?.[field];
        const href = link.getAttribute("href");
        if (!href || href.startsWith("#") || link.target === "_blank" || link.hasAttribute("download")) return;
        const asked = this.emitTableEvent("reference-open", {recordId: row?.id ?? null, field, value: value ?? null, href}, {cancelable: true});
        // Only a listener that takes it (cancels the event) keeps the page.
        if (!asked) event.preventDefault();
    }

    // Which row this is, for the purpose of being the current one. The rest of
    // the template already keys a row by `id`, then `value`, then its position,
    // because the table is given rows keyed all three ways; the current row
    // followed `id` alone, so in a view whose rows carry another key a click
    // marked nothing and looked broken. Opening a record still needs a real id
    // — there is nothing to open without one.
    getRowKey(row, index = -1) {
        const value = row?.id ?? row?.value;
        if (value !== undefined && value !== null && String(value) !== "") {
            return String(value);
        }

        return index >= 0 ? `index:${index}` : "";
    }

    // Whether a row's action buttons are drawn: always when the host asks
    // (row-actions-visible="always"), else in the row under the pointer, the
    // row holding the focus and the current row.
    actionsShownFor(row) {
        if (this.getAttribute("row-actions-visible") === "always") return true;
        const key = String(row?.id ?? row?.value ?? "");
        if (!key) return true;
        return key === this._pointerRowKey || key === this._focusRowKey || String(this._currentRowId ?? "") === key;
    }

    setActionsRow(kind, key) {
        const field = kind === "focus" ? "_focusRowKey" : "_pointerRowKey";
        const next = key ? String(key) : null;
        if (this[field] === next) return;
        this[field] = next;
        // The buttons of one row, not the table's layout: no measuring after it.
        this._layoutUnchanged = true;
        this.requestComponentUpdate("row-actions");
    }

    bindRowActionsEvents(table) {
        if (!table || this._rowActionsTable === table) return;
        this._rowActionsAbort?.abort();
        this._rowActionsAbort = new AbortController();
        this._rowActionsTable = table;
        const {signal} = this._rowActionsAbort;
        const rowKey = (target) => target?.closest?.("tbody tr[data-row-id]")?.dataset.rowId ?? null;
        table.addEventListener("pointerover", (event) => this.setActionsRow("pointer", rowKey(event.target)), {signal});
        // A dragged row carries its record, or every selected record when it is
        // one of them (owner, 2026-10-15, the file manager): a tree that
        // accepts records says where they were dropped.
        table.addEventListener("dragstart", (event) => {
            const key = rowKey(event.target);
            if (!key || !this.hasAttribute("drag-rows") || !event.dataTransfer) return;
            const selected = this.getSelectedRecordIds?.() ?? [];
            const ids = selected.map(String).includes(key) ? selected.map(String) : [key];
            const source = this.getAttribute("preferences-key") || this.getAttribute("table-settings-key") || this.id || null;
            event.dataTransfer.setData("application/x-sf-records+json", JSON.stringify({ids, source}));
            event.dataTransfer.setData("text/plain", ids.join(", "));
            event.dataTransfer.effectAllowed = "copyMove";
            this.emitTableEvent("rows-drag", Object.freeze({ids, source}));
        }, {signal});
        // Reordering inside the list: a row dragged over another goes before
        // it, or after it from its lower half; the drop says which rows moved
        // and the row they now stand before (null: the end). The host decides.
        const reorder = () => this.getAttribute("row-reorder") === "true";
        const dropMark = (row, after) => {
            for (const marked of table.querySelectorAll("tbody tr[data-sf-drop-before], tbody tr[data-sf-drop-after]")) {
                marked.removeAttribute("data-sf-drop-before");
                marked.removeAttribute("data-sf-drop-after");
            }
            if (row) row.setAttribute(after ? "data-sf-drop-after" : "data-sf-drop-before", "");
        };
        const dropTarget = (event) => {
            const row = event.target?.closest?.("tbody tr[data-row-id]");
            if (!row) return null;
            const box = row.getBoundingClientRect();
            return {row, after: event.clientY > box.top + box.height / 2};
        };
        table.addEventListener("dragstart", (event) => {
            const key = rowKey(event.target);
            if (!key || !reorder() || !event.dataTransfer) return;
            this._reorderDrag = [key];
            event.dataTransfer.setData("application/x-sf-row-order", key);
            event.dataTransfer.effectAllowed = "move";
        }, {signal});
        table.addEventListener("dragover", (event) => {
            if (!this._reorderDrag || !reorder()) return;
            const target = dropTarget(event);
            if (!target) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            dropMark(target.row, target.after);
        }, {signal});
        table.addEventListener("drop", (event) => {
            if (!this._reorderDrag || !reorder()) return;
            const target = dropTarget(event);
            dropMark(null);
            const ids = this._reorderDrag;
            this._reorderDrag = null;
            if (!target) return;
            event.preventDefault();
            const keys = [...table.querySelectorAll("tbody tr[data-row-id]")].map((row) => row.dataset.rowId);
            const at = keys.indexOf(target.row.dataset.rowId) + (target.after ? 1 : 0);
            const rest = keys.slice(at).filter((key) => !ids.includes(key));
            const before = rest[0] ?? null;
            const now = keys.filter((key) => !ids.includes(key));
            const place = before === null ? now.length : now.indexOf(before);
            const order = [...now.slice(0, place), ...ids, ...now.slice(place)];
            if (order.join("\u0000") === keys.join("\u0000")) return;
            this.emitTableEvent("move", Object.freeze({ids: [...ids], before, order}));
        }, {signal});
        table.addEventListener("dragend", () => {
            this._reorderDrag = null;
            dropMark(null);
        }, {signal});
        table.addEventListener("pointerleave", () => this.setActionsRow("pointer", null), {signal});
        table.addEventListener("focusin", (event) => this.setActionsRow("focus", rowKey(event.target)), {signal});
        table.addEventListener("focusout", (event) => {
            if (!table.contains(event.relatedTarget)) this.setActionsRow("focus", null);
        }, {signal});
    }

    isCurrentRow(row, index = -1) {
        const key = this.getRowKey(row, index);
        return key !== "" && String(this._currentRowId ?? "") === key;
    }

    // ---------- many entries (§18.4) ----------

    // The rows drawn now, when the list is long enough to be windowed: the
    // range, and the heights of the spacers that stand for the rest.
    windowSlice(rows = []) {
        const count = rows.length;
        if (count < WINDOW_FROM || this.isList) {
            this._windowed = false;
            this._windowCount = count;
            return null;
        }
        this._windowed = true;
        this._windowCount = count;
        const height = this._rowHeight || ROW_HEIGHT_GUESS;
        const range = this.clampWindow(this._windowRange ?? {first: 0, last: WINDOW_INITIAL - 1}, count);
        this._windowRange = range;
        return {
            first: range.first,
            last: range.last,
            before: range.first * height,
            after: Math.max(0, count - 1 - range.last) * height,
        };
    }

    clampWindow({first = 0, last = 0} = {}, count = 0) {
        const lastIndex = Math.max(0, count - 1);
        const from = Math.min(Math.max(0, Math.floor(first)), lastIndex);
        const to = Math.min(Math.max(from, Math.floor(last)), lastIndex);
        return {first: from, last: to};
    }

    // aria-rowcount of a windowed table: every row, the head's included.
    windowRowCount() {
        return this._windowed ? String((this._windowCount ?? 0) + 1) : null;
    }

    // Which rows a person can see: the body's place against the viewport and
    // the table's own scroll box, in row heights.
    seenRows(count) {
        const body = this.refs.table?.value?.tBodies?.[0];
        if (!body || !count) return null;
        const box = body.getBoundingClientRect();
        let top = 0;
        let bottom = globalThis.innerHeight || document.documentElement.clientHeight || 0;
        const scroll = this.refs.scroll?.value;
        if (scroll) {
            const clip = scroll.getBoundingClientRect();
            top = Math.max(top, clip.top);
            bottom = Math.min(bottom, clip.bottom);
        }
        const height = this._rowHeight || ROW_HEIGHT_GUESS;
        const lastIndex = count - 1;
        const first = Math.min(lastIndex, Math.max(0, Math.floor((top - box.top) / height)));
        const last = Math.min(lastIndex, Math.max(first, Math.ceil((bottom - box.top) / height)));
        return {first, last};
    }

    // After a render and on every scroll: measure a drawn row, and move the
    // range when the rows in view come near its edge. Answers whether the
    // range moved.
    syncWindow() {
        if (!this._windowed) return false;
        const table = this.refs.table?.value;
        const drawn = table?.querySelectorAll?.("tbody tr[data-row-id]") ?? [];
        let moved = false;
        if (drawn.length) {
            // The average of the drawn rows: a row of two lines among rows of
            // one does not throw the spacers off.
            const first = drawn[0].getBoundingClientRect();
            const last = drawn[drawn.length - 1].getBoundingClientRect();
            const height = (last.bottom - first.top) / drawn.length;
            if (height > 0 && Math.abs(height - (this._rowHeight || 0)) > 0.5) {
                this._rowHeight = height;
                moved = true;
            }
        }
        const count = this._windowCount ?? 0;
        const seen = this.seenRows(count);
        if (!seen) return false;
        const range = this._windowRange ?? {first: 0, last: WINDOW_INITIAL - 1};
        const lowEdge = range.first > 0 ? range.first + WINDOW_MARGIN / 2 : 0;
        const highEdge = range.last < count - 1 ? range.last - WINDOW_MARGIN / 2 : count - 1;
        if (seen.first < lowEdge || seen.last > highEdge) {
            this._windowRange = this.clampWindow({first: seen.first - WINDOW_MARGIN, last: seen.last + WINDOW_MARGIN}, count);
            moved = true;
        }
        if (!moved) return false;
        this._windowOnly = true;
        this.requestComponentUpdate("window");
        const {first, last} = this._windowRange;
        if (this._reportedWindow !== `${first}-${last}`) {
            this._reportedWindow = `${first}-${last}`;
            this.emitTableEvent("window", {first, last});
        }
        return true;
    }

    bindWindowScroll() {
        if (this._windowScrollAbort) return;
        this._windowScrollAbort = new AbortController();
        const signal = this._windowScrollAbort.signal;
        const onScroll = () => {
            if (!this._windowed || this._windowFrame) return;
            this._windowFrame = requestAnimationFrame(() => {
                this._windowFrame = 0;
                if (this.isConnected) this.syncWindow();
            });
        };
        // Any scroll box between the rows and the page moves them: listened
        // once, in the capture phase, on the document.
        document.addEventListener("scroll", onScroll, {capture: true, passive: true, signal});
        globalThis.addEventListener?.("resize", onScroll, {passive: true, signal});
    }

    unbindWindowScroll() {
        this._windowScrollAbort?.abort();
        this._windowScrollAbort = null;
        if (this._windowFrame) cancelAnimationFrame(this._windowFrame);
        this._windowFrame = 0;
    }

    // A cell that only shows a value is class markup (§18.4): what kind of
    // markup this one is, or null for a cell the full renderer draws.
    rowMarkupCell(row, column) {
        const key = column?.key;
        if (!key || !row) return null;
        const size = this.size === "1/2" ? "1/2" : "1";
        if (key === "select") {
            const cell = row.select?.component;
            if (cell?.type !== "checkbox" || typeof cell.props?.["@change"] !== "function") return null;
            return {kind: "box", size, checked: cell.props.checked === true, value: String(cell.props.value ?? row.id ?? ""),
                label: cell.props.ariaLabel ?? "", change: cell.props["@change"]};
        }
        if (key === "settings") {
            const cell = row.settings?.component;
            if (cell?.type !== "icon-button" || cell.props?.icon !== "menu" || typeof cell.props?.["@click"] !== "function") return null;
            return {kind: "menu", size, label: cell.props.ariaLabel ?? this.text("menuLabel"), click: cell.props["@click"]};
        }
        // The actions cell keeps one kind whether its buttons show or not: a
        // row whose arrangement changes is drawn anew, and the focus that
        // brought the buttons in would leave with the old row.
        if (column.system || column.component || column.renderer === "link" || column.role === "title") return null;
        if (this.isTree() || row.path || this.cellEditable(row, column)) return null;
        const value = row[key];
        if (value === null || typeof value === "undefined") return {kind: "empty"};
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
        if (LONG_TEXT_CELL_TYPES.has(column.propertyType ?? column.property_type ?? column.type) && typeof value !== "boolean") {
            const text = String(value);
            return {kind: "text", className: "sf-table-cell-clip", text, title: text};
        }
        const typed = this.getTypedCellValue(column, value);
        if (typed !== null && typeof typed !== "undefined") {
            if (typeof typed !== "string" && typeof typed !== "number") return null;
            return {kind: "text", className: "sf-table-cell-bare", text: String(typed)};
        }
        if (typeof value === "boolean") return null;
        const text = String(value);
        return {kind: "text", className: "sf-table-cell-text", text, title: text.length > 80 ? text : null};
    }

    // The rows a keyboard walks: the drawn and the undrawn, never a «show
    // more» line.
    keyboardRows() {
        return (this.getTableData().rows || []).filter((row) => row && !row.__tree?.more);
    }

    // The current row is marked in the page rather than through state. Going
    // through state re-rendered the rows on every click, and a render between a
    // box's click and its change event swallowed the change — one click on a
    // row was enough to lose a Shift-range selection. The field is read back by
    // the template, so a later render keeps the mark.
    focusRow(rowId, {reveal = false} = {}) {
        // The action focus-row {id} (component.json) answers an outcome.
        if (rowId && typeof rowId === "object") return this.focusRowAction(rowId);
        if (rowId == null || rowId === "") return this;
        this._currentRowId = String(rowId);
        const table = this.refs.table?.value;
        if (!table) return this;
        const selector = `tbody tr[data-row-id="${String(rowId).replace(/"/gu, '\\"')}"]`;
        for (const marked of table.querySelectorAll("tbody tr[data-current]")) {
            marked.removeAttribute("data-current");
        }
        const row = table.querySelector(selector);
        if (!row && this._windowed) {
            // A row outside the drawn range: the range moves to it, and the row
            // takes the focus once it is drawn (§18.4).
            const rows = this.getTableData().rows || [];
            const index = rows.findIndex((one, at) => this.getRowKey(one, at) === String(rowId));
            if (index >= 0) {
                this._windowRange = this.clampWindow({first: index - WINDOW_MARGIN, last: index + WINDOW_MARGIN}, rows.length);
                this._pendingFocusRow = String(rowId);
                this._windowOnly = true;
                this.requestComponentUpdate("window");
            }
            return this;
        }
        row?.setAttribute("data-current", "");
        // At once, not smoothly: a page that scrolls smoothly would move the
        // window back to where it passes before it arrives.
        if (reveal) row?.scrollIntoView?.({block: "nearest", behavior: "instant"});
        row?.focus?.({preventScroll: true});
        return this;
    }

    // A double click opens the record, and only when the record says it can be
    // opened: the row has to offer the view action. Without it the double click
    // does nothing at all — silently, because a person double-clicking a row
    // that cannot be opened has not made a mistake worth a message.
    canOpenRow(row) {
        return Array.isArray(row?.actions) && row.actions.includes("view");
    }

    handleRowOpen(event, row) {
        if (this.isRowControlTarget(event?.target) || !this.canOpenRow(row)) return this;
        const id = row?.id;
        if (id == null) return this;
        return this.requestActionIntent("view", [id]);
    }

    // The keyboard reaches the same two answers as the pointer: Enter opens the
    // row, Space marks it. Without them the row would be focusable and mute,
    // and marking would be reachable only by pointing at the box.
    // ─── the tree (data view port 1.8.0) ─────────────────────────────────────
    // A table is a tree when its rows carry __tree, which the data view writes
    // from the host's levels. The table only draws it and says what a person
    // asked for; which nodes exist and what opening one means is the view's.
    // Read for every cell of a draw: answered once per list (the rows array is
    // replaced, never edited in place).
    isTree() {
        const rows = this.getTableData?.().rows ?? [];
        if (this._treeMemo?.rows !== rows) this._treeMemo = {rows, tree: rows.some((row) => row?.__tree)};
        return this._treeMemo.tree;
    }

    // The column a tree hangs from: the one the host marked as the title, or
    // the first column that holds data.
    treeColumnKey(columns = this.getColumns()) {
        if (!this.isTree()) return null;
        const data = columns.filter((column) => column?.key && !["select", "settings", "actions"].includes(column.key) && !column.system);
        return (data.find((column) => column.role === "title") ?? data[0])?.key ?? null;
    }

    toggleTreeRow(row) {
        if (this.isActionParameters?.(row, ["row"]) && !row.__tree) row = row.row;
        if (!row?.__tree?.hasChildren) return {outcome: "refused", reason: "no-children"};
        this.emitTableEvent("expand", Object.freeze({id: row.id, expanded: row.__tree.expanded === true}));
        return {outcome: "applied"};
    }

    requestTreeMore(row) {
        if (this.isActionParameters?.(row, ["row"]) && !row.__tree) row = row.row;
        if (!row?.__tree?.more) return {outcome: "refused", reason: "no-more"};
        this.emitTableEvent("load-more", Object.freeze({direction: "after", parent: row.__tree.parent, cursor: row.__tree.cursor ?? null}));
        return {outcome: "applied"};
    }

    handleRowKeydown(event, row) {
        if (event?.target !== event?.currentTarget) return this;
        // A treegrid row: the right arrow opens a closed node, the left arrow
        // closes an open one.
        if (row?.__tree?.hasChildren && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
            const open = row.__tree.expanded === true;
            if ((event.key === "ArrowRight") !== open) {
                event.preventDefault?.();
                return this.toggleTreeRow(row);
            }
        }
        if (event.key === "Enter") {
            return this.handleRowOpen({target: event.currentTarget}, row);
        }
        // The arrows, Home and End move between rows, drawn or not (§4.6,
        // §18.4): a row outside the window is drawn and then focused.
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && !event.altKey && !event.metaKey && !event.ctrlKey) {
            const rows = this.keyboardRows();
            const at = rows.findIndex((one) => String(one?.id ?? one?.value) === String(row?.id ?? row?.value));
            const to = {ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: rows.length - 1}[event.key];
            if (at >= 0 && to >= 0 && to < rows.length && to !== at) {
                event.preventDefault?.();
                this.focusRow(this.getRowKey(rows[to], to), {reveal: true});
            }
            return this;
        }
        if (event.key === " " || event.key === "Spacebar") {
            event.preventDefault?.();
            const checked = row?.select?.component?.props?.checked !== true;
            return this.applyRowSelection(row?.id, checked, {range: event.shiftKey === true});
        }
        return this;
    }

    clearSelection() {
        this._selectionAnchorId = null;
        this.set({settingsChecked: false, selectIndeterminate: false});
        if (!this.getSelectedRecordIds().length) return {outcome: "applied"};
        this.updateRows((row) => ({
            ...row,
            selected: false,
            checked: false,
            select: this.getDefaultRowCell(this.TABLE_SELECT_COLUMN, {...row, selected: false, checked: false}),
        }), "select-clear");
        return {outcome: "applied"};
    }

    // Composition input port. Only declared ports are accepted; the table never
    // resolves a relation itself. It asks the host through a typed query intent.
    sfPortInput(port, value, meta = {}) {
        if (!Object.hasOwn(SF_TABLE_PORTS.inputs, port)) {
            throw new TypeError(`sf-table has no input port ${String(port)}`);
        }
        const recordIds = checkedRecordIds(value);
        const sequence = Number.isSafeInteger(meta?.sequence) && meta.sequence > this._querySequence
            ? meta.sequence
            : this._querySequence + 1;
        this._routeContext = Object.freeze({record_ids: recordIds});
        this._querySequence = sequence;
        this.clearSelection();
        this.requestContextQuery(sequence);
        return undefined;
    }

    requestContextQuery(sequence) {
        this._pendingQuerySequence = sequence;
        this._abandonedQuery = false;
        this.setDataState("loading");
        return this.emitTableEvent("query", Object.freeze({
            reason: "context",
            context: this._routeContext,
            sequence,
        }));
    }

    onConnected() {
        super.onConnected();
        // The content widths are read once the rows are drawn, and a font or
        // a component's stylesheet that arrives after that makes the same
        // content wider: columns measured before it stayed narrow and their
        // values wrapped onto two lines until something re-rendered the table
        // (owner, 2026-10-14: «after I changed the sort it was right»). The
        // Loader brings a part's stylesheet when the page first uses it, and
        // fonts load late, so both send the widths to be read again.
        if (!this._lateLayoutAbort) {
            this._lateLayoutAbort = new AbortController();
            const signal = this._lateLayoutAbort.signal;
            const again = () => {
                if (this._lateLayoutFrame) return;
                this._lateLayoutFrame = requestAnimationFrame(() => {
                    this._lateLayoutFrame = 0;
                    if (this.isConnected && this.measureContentWidths()) this.widthsChanged();
                });
            };
            document.fonts?.addEventListener?.("loadingdone", again, {signal});
            document.fonts?.ready?.then?.(() => { if (!signal.aborted) again(); });
            document.addEventListener("load", (event) => {
                if (event.target?.localName === "link" && /stylesheet/u.test(event.target.rel)) again();
            }, {capture: true, signal});
        }
        if (typeof ResizeObserver !== "undefined" && !this._responsiveObserver) {
            this._responsiveObserver = new ResizeObserver(([entry]) => {
                const width = Math.floor(entry.contentRect.width);
                if (width > 0 && width !== this._responsiveWidth) {
                    this._responsiveWidth = width;
                    this.requestComponentUpdate("responsive-columns");
                }
                this.measurePinnedColumns();
            });
            // SfBaseElement is display: contents, so its own box has no width.
            // Observe the nearest visible container instead of the custom tag.
            const candidates = [this.querySelector('.sf-table'), this.parentElement, this.getRootNode()?.host];
            const target = candidates.find((element) => element?.getBoundingClientRect?.().width > 0)
                ?? candidates.find(Boolean) ?? this;
            this._responsiveObserver.observe(target);
        }
        if (this._abandonedQuery && this._routeContext) {
            this._querySequence += 1;
            this.requestContextQuery(this._querySequence);
        }
    }

    // Latest result wins: only the answer to the newest pending context query
    // is applied, and at most once.
    applyQueryResult(sequence, rows) {
        if (this.isActionParameters?.(sequence, ["sequence", "rows"])) ({sequence, rows} = sequence);
        if (!Number.isSafeInteger(sequence) || sequence !== this._pendingQuerySequence || !Array.isArray(rows)) {
            return {outcome: "refused", reason: "stale"};
        }
        this._pendingQuerySequence = null;
        this.setRows(rows);
        this.setDataState("auto");
        return {outcome: "applied"};
    }

    getQueryContext() {
        return this._routeContext;
    }

    getItemRef(id) {
        if (!this.refs.items.has(id)) {
            this.refs.items.set(id, this.createRef());
        }

        return this.refs.items.get(id);
    }

    // The table had its own copy of this, which created an element on every
    // render; the base's one keeps the element a position in the template
    // already has. Nothing else about the call changes.

    setIndeterminate() {
        const checked = this.state.data.rows.filter((row) => {
            return row.select.component.props.checked;
        })
        return checked.length;
    }


    getTableData() {
        const data = this.state?.data;

        return data && typeof data === "object"
            ? data
            : {
                columns: [],
                rows: [],
            };
    }

    isContextMenuEvent(event) {
        const target = event?.target;

        if (!(target instanceof Node)) {
            return false;
        }

        const portal = this._portalContainer;
        if (portal instanceof Node && (portal === target || portal.contains(target))) {
            return true;
        }

        const contextMenu = this.refs?.contextMenu?.value;
        if (!(contextMenu instanceof Node)) {
            return false;
        }

        if (contextMenu === target || contextMenu.contains(target)) {
            return true;
        }

        return event.composedPath?.().includes(contextMenu) || false;
    }

    contextEvent(event) {
        if (this.isContextMenuEvent(event)) {
            return;
        }

        // Nothing in the column settings window is pending any more -- the pin,
        // the tick and the order each apply as they are made -- so a click away
        // has nothing of theirs to lose. What it still drops is the filter form
        // a person was filling in, which is a query rather than a setting.
        this.tempSettings = null;
        this.closeContextMenu(false);
    }

    splitItemsByColumns(items = [], columnCount = 1) {
        const normalizedItems = Array.isArray(items) ? items : [];
        const normalizedColumnCount = Math.max(1, Number(columnCount) || 1);
        const itemsPerColumn = Math.ceil(
            normalizedItems.length / normalizedColumnCount,
        );

        if (!itemsPerColumn) {
            return [];
        }

        return Array.from({length: normalizedColumnCount}, (_, index) =>
            normalizedItems.slice(
                index * itemsPerColumn,
                (index + 1) * itemsPerColumn,
            ),
        ).filter((columnItems) => columnItems.length);
    }

    getPendingFilterState(filter = this.state?.filter || {}) {
        const tempFilter = this.tempSettings?.filter || {};
        const hasTempSelectedTemplateKey =
            Object.prototype.hasOwnProperty.call(
                tempFilter,
                "selectedTemplateKey",
            );

        return {
            ...filter,
            ...tempFilter,
            selectedTemplateKey:
                hasTempSelectedTemplateKey
                    ? tempFilter.selectedTemplateKey
                    : filter.selectedTemplateKey,
            templates: tempFilter.templates || filter.templates || [],
        };
    }

    getSortedFilterTemplates(filter = this.state?.filter || {}) {
        const templates = this.getFilterTemplates(filter);

        return templates
            .map((template, sourceIndex) => ({
                ...template,
                sourceIndex,
                order:
                    typeof template.order === "number"
                        ? template.order
                        : sourceIndex,
            }))
            .sort((left, right) => {
                if (Boolean(left.pinned) !== Boolean(right.pinned)) {
                    return left.pinned ? -1 : 1;
                }

                if (left.order !== right.order) {
                    return left.order - right.order;
                }

                return left.sourceIndex - right.sourceIndex;
            });
    }

    changeTempFilterTemplateSettings(key, patch = {}) {
        if (!key) return;

        const currentFilter = this.getPendingFilterState();
        const templates = this.getFilterTemplates(currentFilter).map((template) => {
                for (const [k, v] of Object.entries(patch)) {
                    template[k] = key === template.key ? v : !v;
                }
                return template;
            }
        );

        this.tempSettings = {
            ...(this.tempSettings || {}),
            filter: {
                ...(this.tempSettings?.filter || {}),
                selectedTemplateKey: currentFilter.selectedTemplateKey,
                templates,
            },
        };
        this.requestComponentUpdate("temp-filter-template");
    }

    patchTempFilterTemplateSettings(key, patch = {}) {
        if (!key) return;

        const currentFilter = this.getPendingFilterState();
        const templates = this.getFilterTemplates(currentFilter).map((template) =>
            template.key === key
                ? {
                    ...template,
                    ...(typeof patch === "function" ? patch(template) : patch),
                }
                : template,
        );

        this.tempSettings = {
            ...(this.tempSettings || {}),
            filter: {
                ...(this.tempSettings?.filter || {}),
                selectedTemplateKey: currentFilter.selectedTemplateKey,
                templates,
            },
        };
        this.requestComponentUpdate("temp-filter-template");
    }

    selectTempFilterTemplate(key) {
        if (!key) return;

        const currentFilter = this.getPendingFilterState();
        const templates = this.getFilterTemplates(currentFilter).map(
            (template) => ({
                ...template,
                selected: template.key === key,
            }),
        );

        this.tempSettings = {
            ...(this.tempSettings || {}),
            filter: {
                ...(this.tempSettings?.filter || {}),
                selectedTemplateKey: key,
                templates,
            },
        };
        this.requestComponentUpdate("temp-filter-template");
    }

    normalizeFilterTemplate(template = {}, sourceIndex = 0) {
        const key = template.key || `filter_template_${sourceIndex + 1}`;
        const data = template.data && typeof template.data === "object"
            ? template.data
            : {};

        return {
            ...template,
            key,
            label: template.label || data.template_name || key,
            data: {
                ...data,
                values: {...(data.values || {})},
                tags: {...(data.tags || {})},
            },
        };
    }

    getFilterTemplates(filter = this.state?.filter || {}) {
        const templates = (filter.templates || []).map((template, index) =>
            this.normalizeFilterTemplate(template, index),
        );

        if (templates.length) {
            return templates;
        }

        return [
            this.normalizeFilterTemplate({
                key: filter.selectedTemplateKey || "default",
                label: this.text("defaultTemplateText"),
                selected: true,
                order: 0,
                data: {},
            }),
        ];
    }

    getFilterTemplateByKey(key, filter = this.state?.filter || {}) {
        if (!key || !filter) return null;

        return (
            this.getFilterTemplates(filter).find(
                (template) => template.key === key,
            ) || null
        );
    }

    getSelectedFilterTemplate(filter = this.state?.filter || {}) {
        const templates = this.getFilterTemplates(filter);
        const hasSelectedTemplateKey =
            Object.prototype.hasOwnProperty.call(
                filter,
                "selectedTemplateKey",
            );

        if (hasSelectedTemplateKey && filter.selectedTemplateKey === "") {
            return null;
        }

        const selectedKey =
            filter.selectedTemplateKey ||
            templates.find((template) => template.selected)?.key ||
            templates[0]?.key ||
            "";

        return (
            this.getFilterTemplateByKey(selectedKey, {
                ...filter,
                templates,
            }) ||
            templates[0] ||
            null
        );
    }

    getCurrentFilterValues(filter = this.state?.filter || {}) {
        const selectedTemplate = this.getSelectedFilterTemplate(filter);
        return {...(selectedTemplate?.data?.values || {})};
    }

    getCurrentFilterTags(filter = this.state?.filter || {}) {
        const selectedTemplate = this.getSelectedFilterTemplate(filter);
        return {...(selectedTemplate?.data?.tags || {})};
    }

    normalizeFilterDataForCompare(value) {
        if (Array.isArray(value)) {
            return value.map((item) => this.normalizeFilterDataForCompare(item));
        }

        if (value && typeof value === "object") {
            return Object.keys(value)
                .sort()
                .reduce((result, key) => ({
                    ...result,
                    [key]: this.normalizeFilterDataForCompare(value[key]),
                }), {});
        }

        return value;
    }

    isSameFilterData(current, next) {
        return JSON.stringify(this.normalizeFilterDataForCompare(current || {})) ===
            JSON.stringify(this.normalizeFilterDataForCompare(next || {}));
    }

    getMergedFilterDraftData(
        filter = this.state?.filter || {},
        tempFilter = this.tempSettings?.filter || {},
    ) {
        const baseFilter = this.getPendingFilterState({
            ...filter,
            selectedTemplateKey:
                Object.prototype.hasOwnProperty.call(
                    tempFilter,
                    "selectedTemplateKey",
                )
                    ? tempFilter.selectedTemplateKey
                    : filter.selectedTemplateKey,
            templates: tempFilter.templates || filter.templates || [],
        });
        const currentTags = this.getCurrentFilterTags(baseFilter);
        const currentValues = this.getCurrentFilterValues(baseFilter);
        const tags = tempFilter.replaceTags
            ? {...(tempFilter.tags || {})}
            : {
                ...currentTags,
                ...(tempFilter.tags || {}),
            };
        const values = tempFilter.replaceValues
            ? {...(tempFilter.values || {})}
            : {
                ...currentValues,
                ...(tempFilter.values || {}),
            };

        Object.entries(tempFilter.values || {}).forEach(([key, value]) => {
            if (!this.isEmptyFilterEntry(value)) {
                return;
            }

            delete values[key];
            delete tags[key];
        });

        return {
            filter: baseFilter,
            tags,
            values,
        };
    }

    hasPendingFilterDataChanges(filter = this.state?.filter || {}) {
        const tempFilter = this.tempSettings?.filter;

        if (
            !tempFilter ||
            (
                !Object.prototype.hasOwnProperty.call(tempFilter, "tags") &&
                !Object.prototype.hasOwnProperty.call(tempFilter, "values") &&
                !tempFilter.replaceTags &&
                !tempFilter.replaceValues
            )
        ) {
            return false;
        }

        const draft = this.getMergedFilterDraftData(filter, tempFilter);

        return !this.isSameFilterData(
            this.getCurrentFilterTags(draft.filter),
            draft.tags,
        ) || !this.isSameFilterData(
            this.getCurrentFilterValues(draft.filter),
            draft.values,
        );
    }

    // The filter window waits for its button, so a draft and a live query look
    // alike -- the same confusion the pins had, in the window where waiting is
    // the right behaviour. This counts what a press would change, by field: a
    // field whose tag was switched on or off, or whose value or operator
    // differs. Fields are what a person reads as conditions.
    countPendingFilterConditionChanges(filter = this.state?.filter || {}) {
        const tempFilter = this.tempSettings?.filter;
        if (!tempFilter) return 0;

        const draft = this.getMergedFilterDraftData(filter, tempFilter);
        const current = {
            tags: this.getCurrentFilterTags(draft.filter),
            values: this.getCurrentFilterValues(draft.filter),
        };
        const same = (left, right) => this.isSameFilterData(left, right);
        const keys = new Set([
            ...Object.keys(current.tags || {}),
            ...Object.keys(draft.tags || {}),
            ...Object.keys(current.values || {}),
            ...Object.keys(draft.values || {}),
        ]);

        let changed = 0;
        for (const key of keys) {
            const wasActive = Boolean((current.tags || {})[key]?.active);
            const willBeActive = Boolean((draft.tags || {})[key]?.active);
            if (wasActive !== willBeActive) {
                changed += 1;
                continue;
            }
            if (!same((current.values || {})[key], (draft.values || {})[key])) {
                changed += 1;
            }
        }

        return changed;
    }

    hasUnsavedFilterDataChanges() {
        return Boolean(
            this.state?.filterDataDirty &&
            this.getSelectedFilterTemplate(this.state?.filter || {}),
        );
    }

    saveCurrentFilterTemplateData() {
        const template = this.getSelectedFilterTemplate(
            this.state?.filter || {},
        );

        if (!template) {
            return this;
        }

        return this.set({
            filterDataDirty: false,
        }, () => {
            this.dispatchFilterTemplateSave(
                template.key,
                this.state.filter,
                this.getFilterTemplateByKey(template.key),
            );
        });
    }

    mergeObjectDeep(target = {}, patch = {}) {
        return Object.entries(patch || {}).reduce(
            (result, [key, value]) => {
                const currentValue = result[key];
                const shouldMerge =
                    value &&
                    typeof value === "object" &&
                    !Array.isArray(value) &&
                    currentValue &&
                    typeof currentValue === "object" &&
                    !Array.isArray(currentValue);

                return {
                    ...result,
                    [key]: shouldMerge
                        ? this.mergeObjectDeep(currentValue, value)
                        : value,
                };
            },
            {...(target || {})},
        );
    }

    patchFilterTemplateByKey(key, filter = this.state.filter, props = {}) {
        if (!key || !filter) return {
            filter,
            template: null,
        };

        let patchedTemplate = null;
        const nextFilter = {
            ...filter,
            templates: this.getFilterTemplates(filter).map((template) => {
                if (key !== template.key) {
                    return template;
                }

                const nextPatch =
                    typeof props === "function" ? props(template) : props;
                patchedTemplate = this.mergeObjectDeep(template, nextPatch);
                return patchedTemplate;
            }),
        };

        return {
            filter: nextFilter,
            template: patchedTemplate,
        };
    }

    createFilterTemplatePatchState(filter, options = {}) {
        const nextState = {
            filter,
        };

        if (Object.prototype.hasOwnProperty.call(options, "saveInputValue")) {
            nextState.saveInputValue = options.saveInputValue;
        }

        return nextState;
    }

    // Which fields the filter is showing, in the order the host gave them.
    // These are the chips a person adds under "Поля": without them a saved view
    // came back with the fields it was saved without.
    getActiveFilterFieldKeys(filter = this.state?.filter || {}) {
        const tags = this.getCurrentFilterTags(filter);
        const order = this.getFilterFields().map((field) => field?.key);
        const chosen = Object.keys(tags).filter((key) => tags[key]?.active);
        return [
            ...order.filter((key) => chosen.includes(key)),
            ...chosen.filter((key) => !order.includes(key)),
        ];
    }

    // Puts those fields back. The template keeps every other part of itself;
    // only which fields are shown is replaced, because that is what was saved.
    setActiveFilterFields(keys = [], filter = this.state?.filter || {}) {
        if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string' || !key.trim())) {
            throw new TypeError('Filter field keys must be nonempty strings');
        }
        const template = this.getSelectedFilterTemplate(filter);
        if (!template?.key) return this;
        const fields = this.getFilterFields();
        const current = this.getCurrentFilterTags(filter);
        const tags = {};
        for (const key of Object.keys(current)) {
            tags[key] = {...current[key], active: false};
        }
        for (const key of keys) {
            const field = fields.find((item) => item?.key === key);
            tags[key] = {
                ...(current[key] || {}),
                active: true,
                label: field?.label ?? current[key]?.label ?? key,
                control: field?.filter?.control || field?.type || field?.dataType
                    || current[key]?.control || 'text',
            };
        }
        const patched = this.patchFilterTemplateByKey(template.key, filter, (item) => ({
            ...item,
            data: {...(item.data || {}), tags},
        }));

        return this.set({filter: patched.filter});
    }

    // The port passes `settings` through as it is, so the chosen fields ride
    // there. Every save path goes through here: the form's own Save is the one
    // the consumer uses, and it used to send a template without them.
    withFilterFieldSettings(detail, filter = this.state?.filter || {}) {
        if (Array.isArray(detail)) {
            return detail.map((item) => this.withFilterFieldSettings(item, filter));
        }
        if (!detail || typeof detail !== 'object') return detail;
        const fields = Array.isArray(detail.data?.tags)
            ? []
            : Object.keys(detail.data?.tags || {}).filter((key) => detail.data.tags[key]?.active);
        return {
            ...detail,
            settings: {
                ...(detail.settings || {}),
                filter_fields: fields.length ? fields : this.getActiveFilterFieldKeys(filter),
            },
        };
    }

    dispatchFilterTemplateSave(key, filter, template = null) {
        const detail = this.withFilterFieldSettings(
            template || this.getFilterTemplateByKey(key, filter),
            filter,
        );
        this.emitTableEvent('template-save', detail);

        return this;
    }

    getChangedFilterTemplates(prevFilter = {}, nextFilter = {}, keys = []) {
        const prevTemplates = new Map(
            this.getFilterTemplates(prevFilter).map((template) => [
                template.key,
                template,
            ]),
        );

        return this.getFilterTemplates(nextFilter).filter((template) => {
            const prevTemplate = prevTemplates.get(template.key);

            if (!prevTemplate) {
                return true;
            }

            return keys.some((key) => !Object.is(prevTemplate[key], template[key]));
        });
    }

    dispatchFilterTemplatesSave(templates = []) {
        const filteredTemplates = templates.filter((template) => template?.key);

        if (!filteredTemplates.length) {
            return this;
        }

        const detail = this.withFilterFieldSettings(
            filteredTemplates.length === 1 ? filteredTemplates[0] : filteredTemplates,
        );
        this.emitTableEvent('template-save', detail);

        return this;
    }

    saveFilterTemplatePatch(
        key,
        props = {},
        options = {},
        filter = this.state.filter,
    ) {
        if (!key || !filter) return this;

        const patched = this.patchFilterTemplateByKey(key, filter, props);
        const nextFilter = {
            ...patched.filter,
            ...(options.filterPatch || {}),
        };

        return this.set(
            () => this.createFilterTemplatePatchState(nextFilter, options),
            () => {
                if (options.dispatch !== false) {
                    this.dispatchFilterTemplateSave(
                        key,
                        nextFilter,
                        patched.template,
                    );
                }
            },
        );
    }

    setDefaultFilterTemplate(key) {
        if (!key) return this;


        return this.set((prevState) => {
            const currentFilter = prevState.filter || {};
            const filter = {
                ...currentFilter,
                templates: this.getFilterTemplates(currentFilter).map(
                    (template) => ({
                        ...template,
                        default: template.key === key,
                    }),
                ),
            };


            return {filter};
        });
    }

    patchFilterTemplateData(filter = {}, patch = {}) {
        const filterRest = {...filter};
        delete filterRest.tags;
        delete filterRest.values;

        const templates = this.getFilterTemplates(filterRest);
        const selectedTemplate = this.getSelectedFilterTemplate({
            ...filterRest,
            templates,
        });

        if (!selectedTemplate) {
            return {
                ...filterRest,
                templates,
            };
        }
        const nextValues = Object.prototype.hasOwnProperty.call(patch, "values")
            ? patch.values || {}
            : selectedTemplate.data?.values || {};
        const nextTags = Object.prototype.hasOwnProperty.call(patch, "tags")
            ? patch.tags || {}
            : selectedTemplate.data?.tags || {};
        const nextTemplates = templates.map((template) =>
            template.key === selectedTemplate.key
                ? {
                    ...template,
                    data: {
                        ...(template.data || {}),
                        ...(patch.data || {}),
                        values: nextValues,
                        tags: nextTags,
                    },
                }
                : template,
        );

        return {
            ...filterRest,
            selectedTemplateKey: selectedTemplate.key,
            templates: nextTemplates,
        };
    }

    getFilterPayload(filter = this.state?.filter || {}) {
        const selectedTemplate = this.getSelectedFilterTemplate(filter);

        return {
            ...(selectedTemplate?.data || {}),
            templateKey: selectedTemplate?.key || "",
            templateLabel: selectedTemplate?.label || "",
            values: this.getCurrentFilterValues(filter),
            tags: this.getCurrentFilterTags(filter),
        };
    }

    selectFilterTemplate(key) {
        if (!key || this.state?.filter?.selectedTemplateKey === key) {
            return this;
        }

        this.set((prevState) => {
            const currentFilter = prevState.filter || {};
            const nextFilter = {
                ...currentFilter,
                selectedTemplateKey: key,
                templates: (prevState.filter?.templates || []).map(
                    (template) => ({
                        ...template,
                        selected: template.key === key,
                    }),
                ),
            };
            const selectedTemplate =
                this.getFilterTemplateByKey(key, nextFilter) ||
                nextFilter.templates[0] ||
                null;
            return {
                filter: nextFilter,
                saveInputValue: selectedTemplate?.label || "",
            };
        });

        return this;
    }

    // The table's lists are reordered with the Framework's sf-sortable (owner,
    // 2026-10-13): a pointer, a finger or the keyboard, a silhouette where the
    // row lands, the steps announced. A pinned row moves among pinned rows and
    // a loose one among loose ones, so each group is a list of its own and a
    // drag cannot silently unpin anything. What a list asks for arrives as
    // sf-sortable-intent; the order is computed from keys and the window is
    // drawn again from it -- the rows are lit's, not moved by hand.
    static reorderedKeys(list, item, index) {
        const keys = [...list.querySelectorAll('[data-sf-sortable-item]')]
            .filter((node) => node.closest('sf-sortable') === list)
            .map((node) => node.getAttribute('data-sf-sortable-item'))
            .filter((key) => key !== item);
        keys.splice(Math.max(0, Math.min(index, keys.length)), 0, item);
        return keys;
    }

    onFilterTemplateIntent(event) {
        const list = event.target;
        const {item, index} = event.detail ?? {};
        if (!(list instanceof Element) || !item) return;
        const keys = SfTable.reorderedKeys(list, item, index);
        const group = list.getAttribute('data-group') === 'pinned' ? 'pinned' : 'normal';
        const orderedByGroup = {pinned: new Map(), normal: new Map()};
        keys.forEach((key, at) => orderedByGroup[group].set(key, at));
        this.syncFilterTemplateOrder(orderedByGroup);
    }

    // A column list may be narrowed by the search: the move is placed against
    // the shown neighbours, and the columns the search hides keep their places.
    onColumnSettingsIntent(event) {
        const list = event.target;
        const {item, index} = event.detail ?? {};
        if (!(list instanceof Element) || !item) return;
        const pinnedGroup = list.getAttribute('data-group') === 'pinned';
        const shown = SfTable.reorderedKeys(list, item, index);
        const at = shown.indexOf(item);
        const columns = this.getColumnItems().filter((column) => column?.key && !column.system);
        const groupKeys = columns.filter((column) => this.isColumnPinned(column) === pinnedGroup).map((column) => column.key)
            .filter((key) => key !== item);
        const before = shown[at + 1];
        const after = shown[at - 1];
        let place = before !== undefined ? groupKeys.indexOf(before) : -1;
        if (place === -1) place = after !== undefined ? groupKeys.indexOf(after) + 1 : groupKeys.length;
        groupKeys.splice(place === -1 ? groupKeys.length : place, 0, item);
        const otherKeys = columns.filter((column) => this.isColumnPinned(column) !== pinnedGroup).map((column) => column.key);
        const ordered = pinnedGroup ? [...groupKeys, ...otherKeys] : [...otherKeys, ...groupKeys];
        ordered.forEach((key, position) => this.patchTempColumnSettings(key, {order: (position + 1) * 10}));
        this.requestComponentUpdate('column-order');
        // The consumer's owner read the drag as applying at once, because the
        // list redraws from the draft; it does, as every control in the window.
        this.commitColumnSettings('column-order');
    }

    syncFilterTemplateOrder(orderedByGroup) {
        const currentFilter = this.getPendingFilterState();
        const templates = this.getFilterTemplates(currentFilter).map(
            (template, sourceIndex) => {
                const group = template.pinned ? "pinned" : "normal";
                const nextOrder = orderedByGroup[group].get(template.key);

                if (typeof nextOrder !== "number") {
                    return template;
                }

                return {
                    ...template,
                    order: nextOrder,
                    sourceIndex,
                };
            },
        );

        this.tempSettings = {
            ...(this.tempSettings || {}),
            filter: {
                ...(this.tempSettings?.filter || {}),
                selectedTemplateKey: currentFilter.selectedTemplateKey,
                templates: templates.sort((left, right) => {
                    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
                        return left.pinned ? -1 : 1;
                    }

                    if (left.order !== right.order) {
                        return left.order - right.order;
                    }

                    return left.sourceIndex - right.sourceIndex;
                }),
            },
        };
        this.requestComponentUpdate("temp-filter-template-order");
    }


    // Whether there is room for every data column to be readable.
    //
    // A floor cannot be a width: write one on a column and it becomes the
    // width, so a cell that needs more wraps and a typed row grows -- measured
    // at 81px against 57 where the typed-cells probe watches it. And a minimum
    // on a cell is ignored in a fixed layout. So the floor is applied only when
    // it is actually needed: while there is room the columns share it as they
    // always have, and when there is not they stop at the floor and the box
    // scrolls, which is what the consumer asked for (Larena, 2026-10-06).
    get columnsAreCramped() {
        // The box that would do the scrolling is the one to measure. The
        // responsive observer's width is what it last saw, and in an embedded
        // list it had seen nothing at all -- it reported 0 while the columns
        // were 77px wide and wrapping their headings over four lines (owner,
        // 2026-10-09).
        const width = this.refs.scroll?.value?.clientWidth || this._responsiveWidth;
        if (!width) return false;
        const columns = this.getColumns?.() ?? [];
        const floored = columns.filter((column) => this.columnTakesFloor(column));
        if (!floored.length) return false;
        const host = this.querySelector(".sf-table") ?? this;
        const raw = globalThis.getComputedStyle?.(host)
            ?.getPropertyValue("--sf-table--column-min-inline-size")?.trim();
        if (!raw) return false;
        const root = Number.parseFloat(globalThis.getComputedStyle?.(document.documentElement)?.fontSize) || 16;
        const floor = raw.endsWith("rem") ? Number.parseFloat(raw) * root : Number.parseFloat(raw);
        if (!Number.isFinite(floor) || floor <= 0) return false;
        // What the columns that are not floored already take, measured rather
        // than assumed: the select box, the gear, the actions.
        // The actions column counts at its declared width, never more: measured,
        // it had already swallowed the room the data columns were denied, and
        // the measurement made the denial permanent.
        const taken = [...this.querySelectorAll("thead th")]
            .filter((cell) => !floored.some((column) => column.key === cell.dataset.key))
            .reduce((total, cell) => total + (cell.dataset.key === "actions"
                ? Math.min(cell.getBoundingClientRect().width, floor)
                : cell.getBoundingClientRect().width), 0);
        return width - taken < floored.length * floor;
    }

    // The actions column as wide as its buttons: each a size-1 icon button, the
    // same measure the settings column is given, with the cell's padding once.
    // Whether the records are a compact list rather than a table: chosen by the
    // width of the box the table sits in, which is what a list beside an open
    // panel is narrow in, not the window.
    get isList() {
        const layout = this.getProp?.("layout") ?? "table";
        if (layout === "list") return true;
        if (layout === "table") return false;
        const below = Number(this.getProp?.("listBelow")) || 600;
        return this._responsiveWidth > 0 && this._responsiveWidth < below;
    }

    get actionsColumnWidth() {
        const inline = (this.ACTIONS_SETTINGS_ROW ?? []).filter((action) => action?.inline !== false).length;
        if (!inline) return "";
        return `calc(${inline} * (var(--sf-text-height-1) + var(--sf-ui-1--space-y-tightness-default) * 2)`
            + ` + ${inline - 1} * var(--sf-space-1\\/3) + var(--sf-b6))`;
    }

    // Each data column as wide as its content wants on one line -- the heading
    // and the values shown -- up to a cap, read from the laid-out table: for a
    // moment the table is laid out by its content at its widest (auto layout,
    // max-content), the headings are measured, and the layout goes back. The
    // columns used to share the room equally and stop at a floor, so a long
    // value wrapped in a column a short one did not need (owner, 2026-10-13).
    // A width the host or the person set wins; what does not fit scrolls.
    measureContentWidths() {
        const table = this.refs.table?.value;
        if (!(table instanceof HTMLTableElement) || !table.isConnected) return false;
        if (this._columnResizeState || this.columnDragActive) return false;
        // The skeleton and an empty or failed list say nothing about the content,
        // and rows kept on screen while the next ones load are the old ones: a
        // measurement of them is thrown away when the answer comes (owner,
        // 2026-10-15, a sort measured the table twice).
        if (table.querySelector('tbody[data-state]') || table.querySelector('tbody[data-busy]') || !table.querySelector('tbody tr td')) return false;
        const measured = new Map();
        let whole = 0;
        table.classList.add('sf-table-measuring');
        // Measured before the table's own stylesheet has come, the measuring
        // class does nothing, the fixed layout squeezes every column to a
        // letter's width, and those widths were applied and held until the
        // sheet arrived (owner, 2026-10-15, frame by frame). Not measured then:
        // the stylesheet's arrival measures again.
        if (getComputedStyle(table).tableLayout !== 'auto') {
            table.classList.remove('sf-table-measuring');
            return false;
        }
        try {
            whole = table.getBoundingClientRect().width;
            for (const cell of table.querySelectorAll('thead th[data-key]')) {
                const key = cell.dataset.key;
                if (SYSTEM_COLUMN_KEYS.has(key)) continue;
                measured.set(key, Math.ceil(cell.getBoundingClientRect().width));
            }
        } finally {
            table.classList.remove('sf-table-measuring');
        }
        // Room to spare: the content is narrower than the box. A fixed table
        // shares the spare room between every column with a width, the box and
        // the menu columns too, so a list of one data column showed it some
        // 330px in, after two wide empty columns (Larena, 2026-10-14). The last
        // data column is then left without a width and takes the spare room.
        const box = table.parentElement?.clientWidth ?? 0;
        const surplus = box > 0 && whole > 0 && whole < box;
        const surplusChanged = surplus !== Boolean(this._contentSurplus);
        this._contentSurplus = surplus;
        // A cell drawn by an element whose module is still on the way -- the
        // Loader brings parts when a page first uses them -- is empty when this
        // runs, and its column was measured a few pixels wide and kept so:
        // record links broke inside words in a 45px column (Larena,
        // 2026-10-13). Measure again once those elements are drawn.
        this.remeasureWhenDrawn(table);
        const previous = this._contentWidths ?? new Map();
        const changed = measured.size !== previous.size
            || [...measured].some(([key, width]) => Math.abs((previous.get(key) ?? 0) - width) > 2);
        if (changed) this._contentWidths = measured;
        return changed || surplusChanged;
    }

    // In pixels, capped here rather than with min() in the column's width: a
    // fixed-layout table read min(784px, 20rem) as no fixed width at all and
    // gave that column the whole of the table's spare room.
    // Folds the values of a multi-value cell that do not fit its line into
    // «+N» (see renderCellValues in the template).
    fitCellValues() {
        // A value that is an element not yet drawn -- its module still on the
        // way, as the Loader brings parts when they are first used -- has no
        // width yet, so the line is measured again once it has one.
        const pending = new Set();
        for (const item of this.querySelectorAll('tbody .sf-table-cell-values > :not(.sf-table-cell-more)')) {
            if (item.localName.includes('-') && (!customElements.get(item.localName) || !cellValueBox(item).getBoundingClientRect().width)) {
                pending.add(item.localName);
            }
        }
        if (pending.size && (this._fitRetries ?? 0) < 3) {
            this._fitRetries = (this._fitRetries ?? 0) + 1;
            const token = (this._fitToken = (this._fitToken ?? 0) + 1);
            Promise.all([...pending].map((name) => customElements.whenDefined(name)))
                .then(() => new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle))))
                .then(() => { if (token === this._fitToken && this.isConnected) this.fitCellValues(); });
        } else if (!pending.size) {
            this._fitRetries = 0;
        }
        for (const box of this.querySelectorAll('tbody .sf-table-cell-values')) {
            const more = box.querySelector(':scope > .sf-table-cell-more');
            const items = [...box.children].filter((child) => child !== more);
            for (const item of items) cellValueBox(item).classList.remove('sf-table-cell-folded');
            if (!more) continue;
            more.hidden = true;
            more.removeAttribute('title');
            if (box.scrollWidth <= box.clientWidth + 1) continue;
            // Room for the counter first, then values leave from the end until
            // the rest and the counter fit.
            more.hidden = false;
            more.textContent = `+${items.length}`;
            const folded = [];
            for (let at = items.length - 1; at > 0 && box.scrollWidth > box.clientWidth + 1; at -= 1) {
                cellValueBox(items[at]).classList.add('sf-table-cell-folded');
                folded.unshift(items[at]);
                more.textContent = `+${folded.length}`;
            }
            if (!folded.length) {
                more.hidden = true;
                continue;
            }
            more.title = folded.map((item) => item.textContent.trim()).filter(Boolean).join(', ');
        }
    }

    remeasureWhenDrawn(table) {
        const pending = new Set();
        for (const element of table.querySelectorAll('tbody td *')) {
            if (!element.localName.includes('-')) continue;
            if (!customElements.get(element.localName) || !element.childElementCount) pending.add(element.localName);
        }
        if (!pending.size) {
            this._remeasureTries = 0;
            return;
        }
        if ((this._remeasureTries ?? 0) >= 3) return;
        this._remeasureTries = (this._remeasureTries ?? 0) + 1;
        const token = (this._remeasureToken = (this._remeasureToken ?? 0) + 1);
        Promise.all([...pending].map((name) => customElements.whenDefined(name)))
            .then(() => new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle))))
            .then(() => {
                if (token !== this._remeasureToken || !this.isConnected) return;
                if (this.measureContentWidths()) this.widthsChanged();
            });
    }

    // New widths after a render: written onto the columns, and what reads
    // widths -- folded values, pinned offsets, the rail -- read again.
    widthsChanged() {
        this.applyColumnWidths();
        this.fitCellValues();
        this.measurePinnedColumns();
        if (this.hasAttribute("data-sf-page-scroll")) this.syncRail();
    }

    applyColumnWidths() {
        const table = this.refs.table?.value;
        if (!(table instanceof HTMLTableElement)) return;
        const columns = new Map((this.getColumns?.() ?? []).map((column) => [String(column?.key), column]));
        for (const col of table.querySelectorAll(':scope > colgroup > col[data-key]')) {
            const column = columns.get(col.dataset.key);
            if (!column) continue;
            const style = columnStyle(this, column);
            if ((col.getAttribute('style') ?? '') !== style) {
                if (style) col.setAttribute('style', style);
                else col.removeAttribute('style');
            }
        }
        table.classList.toggle('sf-table-content-sized', this.hasContentWidths);
        table.classList.toggle('w-max', !this.hasContentWidths);
    }

    contentWidth(column) {
        const width = this._contentWidths?.get(column?.key);
        if (!width) return '';
        if (this._contentSurplus && column?.key === this.spareRoomColumnKey()) return '';
        return `${Math.min(width, this.columnWidthCap())}px`;
    }

    // The column that takes the spare room: the last data column nobody sized.
    spareRoomColumnKey() {
        const columns = this.getColumns?.() ?? [];
        for (let at = columns.length - 1; at >= 0; at -= 1) {
            const column = columns[at];
            if (!column?.key || SYSTEM_COLUMN_KEYS.has(column.key)) continue;
            if (column.colWidth ?? column.width ?? column.size) return null;
            return column.key;
        }
        return null;
    }

    get hasContentWidths() {
        return Boolean(this._contentWidths?.size);
    }

    columnWidthCap() {
        const raw = getComputedStyle(this).getPropertyValue('--sf-table--column-max-inline-size').trim();
        const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value) || value <= 0) return 320;
        return raw.endsWith('rem') ? value * root : value;
    }

    columnTakesFloor(column) {
        if (!column?.key || SYSTEM_COLUMN_KEYS.has(column.key)) return false;
        return !(column.colWidth ?? column.width ?? column.size ?? column.min_width ?? column.minWidth);
    }

    getSystemColumns() {
        const columns = [];
        const props = this.getPropsContext();
        if (props.selectable) {
            columns.push(this.getSelectColumn());
        }
        if (props.settings) {
            columns.push(this.TABLE_SETTINGS_COLUMN);
        }
        if (props.actions && props.rowActions && this.state.actionActive) {
            columns.push(this.TABLE_ACTIONS_COLUMN);
        }

        return columns;
    }

    setTemplates(data) {
        const nextTemplates = Object.values(data || {}).map((template, index) =>
            this.normalizeFilterTemplate(template, index),
        );

        return this.set((prevState) => {
            const currentFilter = prevState.filter || {};
            const templatesByKey = new Map();

            this.getFilterTemplates(currentFilter).forEach((template) => {
                templatesByKey.set(template.key, template);
            });

            nextTemplates.forEach((template) => {
                templatesByKey.set(template.key, {
                    ...(templatesByKey.get(template.key) || {}),
                    ...template,
                });
            });

            const templates = Array.from(templatesByKey.values());
            const hasCurrentSelectedTemplateKey =
                Object.prototype.hasOwnProperty.call(
                    currentFilter,
                    "selectedTemplateKey",
                );
            const defaultTemplate = templates.find(
                (template) => template.default === true,
            );
            const incomingSelectedKey =
                nextTemplates.find((template) => template?.selected)?.key;
            const fallbackSelectedKey =
                defaultTemplate?.key || templates[0]?.key || "";
            const selectedTemplateKey = this._filterTemplatesLoaded
                ? incomingSelectedKey ??
                (hasCurrentSelectedTemplateKey
                    ? currentFilter.selectedTemplateKey
                    : fallbackSelectedKey)
                : incomingSelectedKey ?? fallbackSelectedKey;

            const nextFilter = {
                ...currentFilter,
                selectedTemplateKey,
                templates: templates.map((template) => ({
                    ...template,
                    selected: template.key === selectedTemplateKey,
                })),
            };

            const selectedTemplate =
                selectedTemplateKey === ""
                    ? null
                    : this.getFilterTemplateByKey(selectedTemplateKey, {
                        ...nextFilter,
                        templates,
                    }) ||
                    templates[0] ||
                    null;

            this._filterTemplatesLoaded = true;

            return {
                filter: nextFilter,
                saveInputValue: selectedTemplate?.label || "",
            };
        });
    }

    // The identity of this instance: the author's id when there is one, its own
    // counter otherwise. Never the component name, so a second table on the page
    // cannot inherit the first one's ids or preferences.
    getInstanceId() {
        return this.id || this._instanceId;
    }

    getColumnResizerId(columnKey) {
        return `${this.getInstanceId()}--column-resizer--${columnKey}`;
    }

    getTableSettingsKey() {
        return (
            this.tableSettingsKey ||
            this.getAttribute?.("table-settings-key") ||
            this.id ||
            this.getInstanceId()
        );
    }

    normalizeTableSettings(data = {}, tableSettingsKey = this.getTableSettingsKey()) {
        const settingsMap =
            data?.tableSettings &&
            typeof data.tableSettings === "object" &&
            !Array.isArray(data.tableSettings) &&
            !data.tableSettings.columnSettings
                ? data.tableSettings
                : null;
        const source =
            data?.item ||
            settingsMap?.[tableSettingsKey] ||
            data?.tableSettings ||
            data?.settings ||
            data ||
            {};
        const columnSettings =
            source?.columnSettings ||
            data?.columnSettings ||
            {};

        return {
            ...source,
            columnSettings:
                columnSettings &&
                typeof columnSettings === "object" &&
                !Array.isArray(columnSettings)
                    ? columnSettings
                    : {},
        };
    }

    setTableSettings(data = {}, reason = "table-settings-load", tableSettingsKey = this.getTableSettingsKey()) {
        const settings = this.normalizeTableSettings(data, tableSettingsKey);
        return this.setColumnSettings(settings.columnSettings, reason, false);
    }

    getContextMenuLabel(data = {}) {
        switch (data.menu || data.type) {
            case 'filter-favorites':
                return this.text('contextSaveTemplateLabel');
            case 'filter-settings':
                return this.text('contextFilterSettingsLabel');
            case 'filter-template-actions':
                return `${this.text('contextTemplateActionsLabel')}: ${data.template?.label || data.template?.key || ''}`.trim();
            case 'tag-settings': {
                const fieldKey = data.fieldKey || '';
                const field = this.getFilterField(fieldKey);
                const label = field?.label || this.getCurrentFilterTags()?.[fieldKey]?.label || fieldKey;
                return `${this.text('contextFieldFilterLabel')}: ${label || this.text('fieldWordText')}`;
            }
            case 'row-settings':
                return this.text('contextRowActionsLabel');
            case 'create':
                return this.text('contextCreateOptionsLabel');
            case 'list-sort':
                return this.text('sortLabel');
            case 'toolbar-actions':
                return this.text('contextViewActionsLabel');
            case 'table-settings':
            default:
                return this.text('contextTableSettingsLabel');
        }
    }

    renderFilterFavoritesContextMenu(data) {
        const {
            x,
            y,
            position,
        } = data;
        const template = this.getSelectedFilterTemplate();
        return html`
            <sf-context-menu
                    size=${this.size === "1/2" ? "1/2" : "1"}
                    :key=${x + y + this._renderToken}
                    aria-label=${this.getContextMenuLabel({...data, menu: 'filter-favorites'})}
                    style="
            position: fixed;
            left: ${x}px;
            inset-block-start: calc(${y}px + calc(var(--sf-focus-outline-width) * 2));
            z-index: var(--sf-table-context-menu--z-index, var(--sf-z-index-9));
          "
                    root-class="sf-table-context-menu ${this.size === "1/2" ? "sf-table-context-menu--dense " : ""}flex flex-col"
                    data-context-main-menu
                    position="${position || ""}"
            >
                <div class="flex flex-col flex-1 gap-2" slot="content">
                    <div class="sf-table-context-top"><span class="sf-text-2 bold">Сохранение шаблона</span></div>
                    <div class="sf-table-context-main">
                        <form ${ref(this.refs.templateForm)} id="save_template" class="flex flex-col gap-1/2">
                            <sf-input
                                    size=${this.size}
                                    appearance="filled"
                                    placeholder="${this.text('templateNamePlaceholder')}"
                                    value="${this.state.saveInputValue}"
                                    name="template_name"
                                    @change=${(e) => {
                                        this.set({
                                            saveInputValue: e.target.value
                                        })
                                    }}
                                    @input=${(e) => {
                                        this.set({
                                            saveInputValue: e.target.value
                                        })
                                    }}
                            ></sf-input>
                            <div class="flex flex-col gap-1/2">
                                <sf-checkbox size=${this.size}
                                        name="template_default"
                                        position="end"
                                        root-class="content-main-between"
                                        value="1"
                                        ?checked=${template.data.template_default}
                                        label="${this.text('makeDefaultLabel')}"
                                ></sf-checkbox>
                                <sf-checkbox size=${this.size}
                                        name="template_save_for_all"
                                        position="end"
                                        root-class="content-main-between"
                                        value="1"
                                        ?checked=${template.data.template_save_for_all}
                                        label="${this.text('saveForEveryoneLabel')}"
                                ></sf-checkbox>
                        </form>
                    </div>
                </div>
                <div class="sf-table-context-bottom sf-context-menu-footer">
                    <sf-button size=${this.size} @click="${() => {
                        this.tempSettings = null;
                        this.requestComponentUpdate('table')
                    }
                    }" appearance="outline" scheme="on-surface" root-class="flex-1"
                               text="${this.text('resetText')}"></sf-button>
                    <sf-button size=${this.size}
                            ?disabled=${this.state.saveInputValue.length === 0}
                            @click="${() => {
                                this.saveFilterTemplate();
                            }}" root-class="flex-1" text="${this.text('applyText')}"></sf-button>
                </div>
                </div>
            </sf-context-menu>
        `;
    }

    saveFilterTemplate() {
        const form = this.refs.templateForm.value;
        if (!form) return false;
        const formData = Object.fromEntries(new FormData(form));
        const {templates} = this.state.filter;
        const prevTemplate = templates.filter((template) => {
            return template.label === formData.template_name;
        })?.[0]
        const values = this.getCurrentFilterValues();
        const tags = this.getCurrentFilterTags();
        let template = {
            key: prevTemplate ? prevTemplate.key : `filter_template_${templates.length + 1}`,
            label: formData.template_name,
            selected: true,
            data: {
                ...formData,
                values,
                tags
            }
        };

        const detail = this.withFilterFieldSettings(template);
        this.emitTableEvent('template-save', detail);
        this.tempSettings = null;
        this.closeContextMenu();
    }

    renderRowSettingsContextMenu(data) {
        const {
            x,
            y,
            position,
            transform,
            items = this.getActionRowItems(data.row || {}).map((action) => ({
                component: "sf-button",
                props: {
                    appearance: "link",
                    scheme: "on-surface",
                    text: action.name,
                    "@click": (event) => {
                        const handler = action.component.props["@click"] || action.component.props.onClick;
                        handler?.(event);
                        this.closeContextMenu();
                    },
                },
            })),
        } = data;
        let pos = `translateY(calc(${transform !== undefined ? transform : -50}%))`;
        if (position) {
            switch (position) {
                case "left-bottom":
                case "right-bottom":
                    pos = `translateY(calc(${transform !== undefined ? transform : -100}% + var(--sf-context-menu-tail-corner-offset)))`;
                    break;
            }
        }
        return html`
            <sf-context-menu
                    size=${this.size === "1/2" ? "1/2" : "1"}
                    :key=${x + y}
                    aria-label=${this.getContextMenuLabel({...data, menu: 'row-settings'})}
                    style="
            position: fixed;
            left: calc(${x}px + var(--sf-context-menu-tail-corner-offset));
            inset-block-start: ${y}px;
            transform: ${pos};
            z-index: var(--sf-table-context-menu--z-index, var(--sf-z-index-9));
          "
                    .entries=${items.map((item, at) => {
                        // The standard menu's rows (owner, 2026-10-14): these were
                        // link buttons, the one menu of the table drawn otherwise.
                        const props = item.props || item.component?.props || {};
                        return {
                            id: String(at),
                            text: props.text ?? item.name ?? "",
                            icon: props.iconLeft ?? props.iconStart ?? props.icon ?? undefined,
                            danger: props.scheme === "error" || item.danger === true,
                            disabled: Boolean(props.disabled),
                        };
                    })}
                    @sf-context-menu-select=${(event) => {
                        const item = items[Number(event.detail?.id)];
                        const props = item?.props || item?.component?.props || {};
                        const handler = props["@click"] ?? props.onClick;
                        if (typeof handler === "function") handler({currentTarget: event.target, target: event.target, preventDefault() {}, stopPropagation() {}});
                        this.closeContextMenu();
                    }}
                    position="${position || "left"}"
            >
            </sf-context-menu>
        `;
    }

    getColumnItems() {
        const dataColumns = this.getTableData().columns || [];
        const originalIndexByKey = new Map(
            dataColumns.map((column, index) => [column?.key, index]),
        );
        const getOrder = (column) => {
            const order = column?.order;

            return order !== null &&
            typeof order !== "undefined" &&
            order !== "" &&
            Number.isFinite(Number(order))
                ? Number(order)
                : originalIndexByKey.get(column?.key) ?? 0;
        };

        return dataColumns
            .map((column) => {
                const settings = this.getColumnSetting(column?.key);
                const nextColumn = {
                    ...column,
                    ...settings,
                };

                if (settings.width) {
                    nextColumn.colWidth = settings.width;
                }

                return nextColumn;
            })
            .sort((left, right) => {
                // The list reads like the table: the pinned group first, then
                // the rest of the visible columns, then the hidden ones. Sorting
                // by order alone put the hidden columns wherever their stored
                // order happened to fall — a consumer opened the settings and
                // found eight columns it had never shown standing above its own,
                // with the pinned one in the middle.
                const group = (column) => {
                    if (this.isColumnPinned(column)) return 0;
                    return this.isColumnVisible(column) ? 1 : 2;
                };
                const leftGroup = group(left);
                const rightGroup = group(right);

                if (leftGroup !== rightGroup) {
                    return leftGroup - rightGroup;
                }

                const leftOrder = getOrder(left);
                const rightOrder = getOrder(right);

                if (leftOrder === rightOrder) {
                    return (
                        (originalIndexByKey.get(left.key) ?? 0) -
                        (originalIndexByKey.get(right.key) ?? 0)
                    );
                }

                return leftOrder - rightOrder;
            });
    }

    // Whether a column is shown. The answer the person is editing right now
    // wins, then what the host has stored, then what the column itself says.
    isColumnVisible(column) {
        if (!column?.key) return false;
        const pending = this.tempSettings?.cols?.[column.key];
        const setting = this.getColumnSetting(column.key) || {};

        return pending?.visible ?? setting.visible ?? column.visible !== false;
    }

    // The person's and the host's column settings, merged. It is asked for
    // hundreds of times in one draw -- every column, every pinned cell -- so
    // the merge is made once per change of either source and read from the
    // memo while drawing (simai/ui-pro#1). Both sources are replaced, never
    // edited in place, so their identity says when they changed.
    getColumnSettings() {
        const dataSettings = this.getTableData().columnSettings;
        const stateSettings = this.state?.columnSettings;
        const memo = this._columnSettingsMemo;
        if (memo && memo.data === dataSettings && memo.state === stateSettings) return memo.value;
        const value = this.mergedColumnSettings(dataSettings, stateSettings);
        this._columnSettingsMemo = {data: dataSettings, state: stateSettings, value};
        return value;
    }

    mergedColumnSettings(dataSettings, stateSettings) {
        const normalizedDataSettings =
            dataSettings && typeof dataSettings === "object" && !Array.isArray(dataSettings)
                ? dataSettings
                : {};
        const normalizedStateSettings =
            stateSettings && typeof stateSettings === "object" && !Array.isArray(stateSettings)
                ? stateSettings
                : {};

        return {
            ...normalizedDataSettings,
            ...normalizedStateSettings,
        };
    }

    getColumnSetting(columnKey) {
        if (!columnKey) return {};

        const settings = this.getColumnSettings()?.[columnKey];

        return settings && typeof settings === "object" && !Array.isArray(settings)
            ? settings
            : {};
    }

    normalizeColumnSetting(settings = {}) {
        const nextSettings = {};

        Object.entries(settings || {}).forEach(([key, value]) => {
            if (typeof value === "undefined") {
                return;
            }

            if (key === "colWidth") {
                nextSettings.width = value;
                return;
            }

            nextSettings[key] = value;
        });

        if (
            typeof nextSettings.order !== "undefined" &&
            nextSettings.order !== null &&
            nextSettings.order !== ""
        ) {
            nextSettings.order = Number(nextSettings.order);
        }

        return nextSettings;
    }

    mergeColumnSettings(currentSettings = {}, patch = {}) {
        const nextSettings = {...(currentSettings || {})};

        Object.entries(patch || {}).forEach(([columnKey, columnPatch]) => {
            if (!columnKey || !columnPatch || typeof columnPatch !== "object") {
                return;
            }

            nextSettings[columnKey] = this.normalizeColumnSetting({
                ...(nextSettings[columnKey] || {}),
                ...columnPatch,
            });
        });

        return nextSettings;
    }

    // The person asked for the default columns back. The component names no
    // defaults of its own — it says the layer should go, and the host answers
    // with whatever it considers default for this view.
    requestColumnSettingsReset() {
        // The person's arrangement goes from the preference too.
        if (this.viewPreferenceKey) {
            const {columnSettings, widths, ...rest} = preferences()?.read(this.viewPreferenceKey) ?? {};
            preferences()?.write(this.viewPreferenceKey, rest);
        }
        return this.emitTableEvent("column-settings-reset", Object.freeze({
            target: "personal",
            tableSettingsKey: this.getTableSettingsKey?.() ?? null,
        }));
    }

    emitColumnSettingsChange(reason = "column-settings") {
        if (reason !== "preferences" && this.viewPreferenceKey) {
            this.writeTablePreference(this.viewPreferenceKey, {columnSettings: this.getColumnSettings()});
        }
        const detail = {
            reason,
            columnSettings: this.getColumnSettings(),
            tableSettingsKey: this.getTableSettingsKey()
        };

        // Vocabulary §5 save {kind: columns}; sf-table-column-settings-change,
        // sf-table:column-settings-change and onColumnSettingsChange follow
        // once each with the same fields (detail-adds rows).
        this.emitTableEvent('save', {kind: "columns", ...detail});

        return this;
    }

    setColumnSettings(settings = {}, reason = "column-settings", emit = true) {
        const nextSettings =
            typeof settings === "function"
                ? settings(this.getColumnSettings())
                : settings;
        return this.set(
            {
                columnSettings:
                    nextSettings && typeof nextSettings === "object"
                        ? nextSettings
                        : {},
            },
            reason,
            () => emit ? this.emitColumnSettingsChange(reason) : false,
        );
    }

    patchColumnSettings(columnKey, patch = {}, reason = "column-settings") {
        if (!columnKey) return this;

        const currentSetting = this.getColumnSetting(columnKey);
        const nextPatch =
            typeof patch === "function" ? patch(currentSetting) : patch;

        return this.patchColumnSettingsBatch(
            {
                [columnKey]: nextPatch || {},
            },
            reason,
        );
    }

    patchColumnSettingsBatch(patch = {}, reason = "column-settings") {
        const currentSettings = this.getColumnSettings();
        const nextSettings = this.mergeColumnSettings(currentSettings, patch);

        if (JSON.stringify(currentSettings) === JSON.stringify(nextSettings)) {
            return this;
        }

        return this.setColumnSettings(nextSettings, reason);
    }

    getFilterFields() {
        const fields = this.state?.filter?.fields;
        return Array.isArray(fields) ? fields : [];
    }

    // Whether the toolbar offers a filter at all: when the host gave fields to
    // filter by or saved templates to choose from, or a filter is already on.
    // Without them the button opened a panel of templates and fields with no
    // value to set, which read as broken (documentation trial 6; owner and
    // Larena, 2026-10-18).
    offersFilter(activeCount = 0) {
        const templates = this.state?.filter?.templates;
        return this.getFilterFields().length > 0
            || (Array.isArray(templates) && templates.length > 0)
            || activeCount > 0;
    }

    getFilterField(fieldKey) {
        if (!fieldKey) return null;

        return this.getFilterFields().find((field) => field?.key === fieldKey) || null;
    }

    setFilterFields(fields = [], reason = "filter-fields") {
        for (const page of this._filterOptionPages.values()) {
            page.controller?.abort();
            clearTimeout(page.searchTimer);
        }
        this._filterOptionPages.clear();
        return this.set(
            (prevState) => ({
                filter: {
                    ...(prevState.filter || {}),
                    fields: Array.isArray(fields) ? fields : [],
                },
            }),
            reason,
        );
    }

    patchTempColumnSettings(columnKey, patch = {}) {
        if (!columnKey) return;

        this.tempSettings = {
            ...(this.tempSettings || {}),
            cols: {
                ...(this.tempSettings?.cols || {}),
                [columnKey]: {
                    ...(this.tempSettings?.cols?.[columnKey] || {}),
                    ...(typeof patch === "function" ? patch() : patch),
                },
            },
        };
    }

    patchTempFilterTagSettings(columnKey, patch = {}) {
        if (!columnKey) return;

        this.tempSettings = {
            ...(this.tempSettings || {}),
            filter: {
                ...(this.tempSettings?.filter || {}),
                tags: {
                    ...(this.tempSettings?.filter?.tags || {}),
                    [columnKey]: {
                        ...(this.tempSettings?.filter?.tags?.[columnKey] || {}),
                        ...(typeof patch === "function" ? patch() : patch),
                    },
                },
            },
        };
        // The same defect the pins had: a patch is a plain property, so nothing
        // redrew and anything reading the draft kept the state it was drawn
        // with -- here the button that says how many conditions are pending.
        // Switching a condition on is a checkbox, so a redraw costs nothing a
        // person can feel.
        this.requestComponentUpdate('filter-tag');
    }

    patchTempFilterValue(fieldKey, patch = {}) {
        if (!fieldKey) return;

        const currentValues = this.getCurrentFilterValues(
            this.getPendingFilterState(),
        );
        const currentValue =
            this.tempSettings?.filter?.values?.[fieldKey] ||
            currentValues[fieldKey] ||
            {};
        const nextPatch =
            typeof patch === "function" ? patch(currentValue) : patch;
        const nextValue = {
            ...currentValue,
            ...(nextPatch || {}),
        };

        const isSameValue = (current, next) => {
            if (!Array.isArray(current) || !Array.isArray(next)) {
                return Object.is(current, next);
            }

            if (current.length !== next.length) {
                return false;
            }

            return current.every((item, index) => Object.is(item, next[index]));
        };
        const changed = Object.keys(nextValue).some(
            (key) => !isSameValue(currentValue[key], nextValue[key]),
        );

        if (!changed) {
            return;
        }

        this.tempSettings = {
            ...(this.tempSettings || {}),
            filter: {
                ...(this.tempSettings?.filter || {}),
                values: {
                    ...(this.tempSettings?.filter?.values || {}),
                    [fieldKey]: nextValue,
                },
            },
        };
        this.requestComponentUpdate('temp-filter-value');
    }

    isEmptyFilterValue(value) {
        if (value === null || typeof value === "undefined") {
            return true;
        }

        if (Array.isArray(value)) {
            return value.every((item) => this.isEmptyFilterValue(item));
        }

        if (typeof value === "string") {
            return value.trim() === "";
        }

        if (value && typeof value === "object") {
            return Object.values(value).every((item) => this.isEmptyFilterValue(item));
        }

        return false;
    }

    isEmptyFilterEntry(entry) {
        if (!entry || typeof entry !== "object") {
            return this.isEmptyFilterValue(entry);
        }

        if (Object.prototype.hasOwnProperty.call(entry, "values")) {
            return this.isEmptyFilterValue(entry.values);
        }

        if (Object.prototype.hasOwnProperty.call(entry, "value")) {
            return this.isEmptyFilterValue(entry.value);
        }

        return Object.entries(entry)
            .filter(([key]) => !["operator", "control", "type"].includes(key))
            .every(([, value]) => this.isEmptyFilterValue(value));
    }

    mergeFilterState(prevFilter = {}, tempFilter = {}) {
        const {
            filter,
            tags,
            values,
        } = this.getMergedFilterDraftData(prevFilter, tempFilter);

        return this.patchFilterTemplateData(filter, {
            tags,
            values,
        });
    }

    // What the person typed over the list of fields. Kept in state so the list
    // and the field agree after a render; there can be hundreds of fields and
    // scrolling for one is not an answer.
    setColumnSettingsQuery(value = "") {
        return this.set({columnSettingsQuery: String(value ?? "")});
    }

    // Case and ё/е are not differences a person means when searching.
    matchesColumnQuery(label = "", query = "") {
        const normalise = (value) => String(value ?? "").toLowerCase().replace(/ё/gu, "е");
        const needle = normalise(query).trim();
        if (!needle) return true;

        return normalise(label).includes(needle);
    }

    getColumnCheckboxItems(options = {}) {
        const {
            checked,
            onChange,
            refPrefix = "column",
        } = options;

        const {pin = false, handle = false, query = "", group = ""} = options;
        // A group is one of the two sortable lists: the pinned columns -- the
        // system ones among them, offered nothing -- or the loose ones.
        const inGroup = (col) => !group
            || (group === 'pinned' ? (col.system || this.isColumnPinned(col)) : (!col.system && !this.isColumnPinned(col)));

        return this.getColumnItems().filter(
            (col) => inGroup(col) && (!pin || col.system || this.matchesColumnQuery(col.label, query)),
        ).map((col) => {
            const itemRef = this.getItemRef(`${refPrefix}:${col.key}`) || false;
            const isChecked = typeof checked === "function" ? Boolean(checked(col)) : Boolean(checked);
            const box = html`
                <sf-checkbox
                    size=${this.size}
                    label=${col.label}
                    position="end"
                    root-class="content-main-between"
                    ?checked=${isChecked}
                    ${ref(itemRef)}
                    @change=${event => onChange?.(col, event)}
                ></sf-checkbox>
            `;
            if (!pin || col.system) {
                return box;
            }
            // The pin sits beside the visibility box, because both are answers
            // about the same column. The box and the row menu are always pinned
            // and are offered nothing.
            const pinned = this.isColumnPinned(col);

            return html`
                <div class="sf-table-column-option flex items-cross-center gap-1/3"
                     data-column-key=${col.key}
                     data-sf-sortable-item=${col.key}
                     data-pinned=${pinned ? "1" : "0"}>
                    ${handle
                        ? html`<sf-icon-button
                                size="1/2"
                                appearance="link"
                                scheme="on-surface"
                                icon="drag_indicator"
                                data-move
                                data-sf-sortable-handle
                                root-class="sf-table-column-move cursor-grab"
                                aria-label=${`${this.text("columnMoveLabel", "column-move-label")}: ${col.label || col.key}`}
                            ></sf-icon-button>`
                        : nothing}
                    <span class="flex-1 min-w-0">${box}</span>
                    <!-- A pinned column's pin is filled and a loose one's is
                         outlined, the way a pinned filter template already
                         shows itself. Colour alone had to carry the state, and
                         the two schemes are close enough that a person reading
                         a list of twenty pins could not tell which were set. -->
                    <sf-icon-button
                        size="1/2"
                        appearance="link"
                        scheme=${pinned ? "primary" : "on-surface"}
                        ?filled=${pinned}
                        icon="push_pin"
                        title=${pinned ? this.text("unpinColumnLabel", "unpin-column-label") : this.text("pinColumnLabel", "pin-column-label")}
                        aria-label=${pinned ? this.text("unpinColumnLabel", "unpin-column-label") : this.text("pinColumnLabel", "pin-column-label")}
                        aria-pressed=${pinned ? "true" : "false"}
                        @click=${() => this.toggleColumnPinned(col)}
                    ></sf-icon-button>
                </div>
            `;
        });
    }

    // «Сбросить» in the column settings: the state the window opened with,
    // applied at once and announced once -- not the host's defaults, which is
    // what the filter window's own Reset asks for.
    restoreColumnSettingsOnOpen(reason = 'column-settings-restore') {
        const columnSettings = JSON.parse(JSON.stringify(this._columnSettingsOnOpen || {}));
        this.tempSettings = null;
        this.set(
            (prevState) => ({...prevState, columnSettings}),
            reason,
            () => this.emitColumnSettingsChange(reason),
        );

        return this;
    }

    // What «Применить» did, as a method, so a control that applies on the spot
    // does exactly the same thing rather than its own version of it.
    commitColumnSettings(reason = 'table-settings') {
        const tempSettings = this.tempSettings || {};
        const {cols: tempColumns, ...rest} = tempSettings;
        if (!tempColumns) return this;

        const columnSettings = this.mergeColumnSettings(
            this.getColumnSettings(),
            tempColumns,
        );
        this.tempSettings = Object.keys(rest).length ? rest : null;
        this.set(
            (prevState) => ({...prevState, columnSettings}),
            reason,
            () => this.emitColumnSettingsChange(reason),
        );

        return this;
    }

    // Pinning a column puts it at the end of the pinned block, unpinning it at
    // the start of the loose ones — the place a person expects what they just
    // moved to be, rather than wherever its old order number happens to land it.
    toggleColumnPinned(col) {
        if (!col?.key || col.system) return this;
        const next = !this.isColumnPinned(col);
        const columns = this.getColumnItems().filter((column) => column?.key && !column.system);
        const orders = columns.map((column, index) => {
            const pending = this.tempSettings?.cols?.[column.key];
            const setting = this.getColumnSetting(column.key) || {};
            const value = Number(pending?.order ?? setting.order ?? column.order);
            return Number.isFinite(value) ? value : (index + 1) * 10;
        });
        const group = columns
            .map((column, index) => ({column, order: orders[index]}))
            .filter((entry) => entry.column.key !== col.key
                && this.isColumnPinned(entry.column) === next);
        const order = next
            ? Math.max(0, ...group.map((entry) => entry.order)) + 10
            // Never below 0: the host refuses a negative order, and a loose
            // column already at 0 made an unpin send -10 and fail.
            : Math.max(0, Math.min(...group.map((entry) => entry.order), 10) - 10);

        this.patchTempColumnSettings(col.key, {pinned: next, order});
        // The patch is a plain property, so nothing re-rendered and the pin kept
        // the state it was drawn with: every pin read aria-pressed="false", a
        // press looked like it had done nothing, and the only visible effect was
        // the row moving into the pinned group on some later render.
        this.requestComponentUpdate('column-pin');
        // A pin applies on the spot and reaches the host, by the consumer
        // owner's decision of 2026-10-05. Before it, a press wrote a draft that
        // a click outside the window threw away without saying so, and with the
        // window's own buttons below the fold that read as "pins do not work".
        this.commitColumnSettings('column-pin');

        return this;
    }

    // Two sortable lists, one under the other: the pinned rows, then the
    // loose ones. Each is a group of its own, so a row stays in its group.
    renderSortableGroups(pinnedRows, looseRows, {name, label, onIntent}) {
        const list = (group, rows) => (rows.length ? html`<sf-sortable
                group=${`${name}-${group}`}
                data-group=${group}
                label=${label}
                class="flex flex-col gap-1/3"
                @sf-sortable-intent=${onIntent}>${rows}</sf-sortable>` : nothing);
        return html`${list('pinned', pinnedRows)}${list('loose', looseRows)}`;
    }

    getTableColsData(group = '') {
        return this.getColumnCheckboxItems({
            group,
            pin: true,
            handle: true,
            query: this.state.columnSettingsQuery || "",
            refPrefix: "table-column",
            checked: (col) => this.isColumnVisible(col),
            onChange: (col, event) => {
                this.patchTempColumnSettings(col.key, {
                    visible: Boolean(event.target?.checked),
                });
                // Everything in this window applies at once, by the consumer
                // owner's decision of 2026-10-05, so a click outside loses
                // nothing and no «Применить» is left to press.
                this.commitColumnSettings('column-visibility');
            },
        });
    }

    getFilterTagColsData() {
        const fields = this.getFilterFields().filter(
            (field) => field?.filter?.enabled !== false,
        );
        const items = fields.length ? fields : this.getColumnItems();

        return items.map((field) => {
            const pending = this.tempSettings?.filter?.tags?.[field.key];
            const current = this.getCurrentFilterTags(
                this.getPendingFilterState(),
            )?.[field.key];
            const data = {
                type: "checkbox",
                props: {
                    size: this.size,
                    label: field.label,
                    position: 'end',
                    rootClass: 'content-main-between',
                    checked: pending?.active ?? current?.active ?? false,
                    ':ref': this.getItemRef(`filter-tag-column:${field.key}`) || false,
                    '@change': (event) => {
                        this.patchTempFilterTagSettings(field.key, {
                            active: Boolean(event.target?.checked),
                            label: field.label,
                            control: field.filter?.control || field.type || field.dataType || 'text',
                        });
                    },
                }
            }
            return this.renderSmartElement(data.type, data.props);
        });
    }

    getFilterControlValue(fieldKey) {
        return {
            ...(this.getCurrentFilterValues()?.[fieldKey] || {}),
            ...(this.tempSettings?.filter?.values?.[fieldKey] || {}),
        };
    }

    getFilterOptions(field = {}) {
        const filter = field.filter || {};
        const source = filter.optionsSource || {};

        if (source.type === 'endpoint') {
            const page = this.getEndpointFilterPage(field);
            const selected = new Set(this.getFilterControlValue(field.key).values || []);
            const options = new Map();
            for (const option of [...(page?.selected || []), ...(page?.items || [])]) {
                if (typeof option?.value === 'string' && typeof option?.label === 'string') {
                    if (selected.has(option.value) || (page?.items || []).includes(option)) {
                        options.set(option.value, option);
                    }
                }
            }
            return [...options.values()];
        }

        if (Array.isArray(filter.options)) {
            return filter.options;
        }

        if (Array.isArray(source.items)) {
            return source.items;
        }

        return [];
    }

    getEndpointFilterPage(field = {}) {
        const source = field.filter?.optionsSource;
        if (source?.type !== 'endpoint' || typeof source.url !== 'string' || !source.url.trim() || !field.key) {
            return null;
        }
        let page = this._filterOptionPages.get(field.key);
        if (!page || page.url !== source.url) {
            page?.controller?.abort();
            page = {url: source.url, items: [], selected: [], nextCursor: null, status: 'idle', sequence: 0, searchable: false};
            this._filterOptionPages.set(field.key, page);
            queueMicrotask(() => {
                if (this.isConnected && this._filterOptionPages.get(field.key) === page) {
                    this.loadEndpointFilterPage(field);
                }
            });
        }
        return page;
    }

    async loadEndpointFilterPage(field = {}, cursor = null, search = '') {
        const page = this.getEndpointFilterPage(field);
        if (!page || !this.isConnected) return false;
        let url;
        try {
            url = new URL(page.url, globalThis.location?.href);
            if (url.origin !== globalThis.location?.origin) throw new TypeError('filter_options_cross_origin');
        } catch {
            page.status = 'error';
            this.requestComponentUpdate('filter-options');
            return false;
        }
        page.controller?.abort();
        const controller = new AbortController();
        const sequence = ++page.sequence;
        page.controller = controller;
        page.status = 'loading';
        url.searchParams.set('limit', '50');
        url.searchParams.set('sequence', String(sequence));
        if (cursor) url.searchParams.set('cursor', cursor);
        else url.searchParams.delete('cursor');
        if (search && page.searchable) url.searchParams.set('search', search);
        else url.searchParams.delete('search');
        url.searchParams.delete('selected_values[]');
        for (const value of this.getFilterControlValue(field.key).values || []) {
            if (typeof value === 'string') url.searchParams.append('selected_values[]', value);
        }
        this.requestComponentUpdate('filter-options');
        try {
            const response = await fetch(url, {credentials: 'same-origin', signal: controller.signal, headers: {Accept: 'application/json'}});
            const answer = await response.json();
            if (page.sequence !== sequence || this._filterOptionPages.get(field.key) !== page || !this.isConnected) return false;
            if (!response.ok || answer?.status !== 'ok' || answer.sequence !== sequence
                || !Array.isArray(answer.items) || !Array.isArray(answer.selected)
                || (answer.next_cursor !== null && typeof answer.next_cursor !== 'string')) {
                throw new TypeError('filter_options_answer_invalid');
            }
            const clean = (items) => items.filter((item) => typeof item?.value === 'string' && item.value
                && typeof item?.label === 'string' && item.label).map(({value, label}) => ({value, label}));
            const merged = new Map((cursor ? page.items : []).map((item) => [item.value, item]));
            for (const item of clean(answer.items)) merged.set(item.value, item);
            page.items = [...merged.values()];
            page.selected = clean(answer.selected);
            page.nextCursor = answer.next_cursor;
            page.searchable = answer.searchable === true;
            page.status = 'ready';
            this.requestComponentUpdate('filter-options');
            return true;
        } catch (error) {
            if (page.sequence !== sequence || error?.name === 'AbortError') return false;
            page.status = 'error';
            this.requestComponentUpdate('filter-options');
            return false;
        }
    }

    getFilterOptionSearch(fieldKey) {
        if (!fieldKey) return '';
        return this.tempSettings?.filterSearch?.[fieldKey] || '';
    }

    patchTempFilterOptionSearch(fieldKey, value = '') {
        if (!fieldKey) return;

        this.tempSettings = {
            ...(this.tempSettings || {}),
            filterSearch: {
                ...(this.tempSettings?.filterSearch || {}),
                [fieldKey]: String(value || ''),
            },
        };
        this.requestComponentUpdate('filter-option-search');

        const field = this.getFilterField(fieldKey);
        const page = field && this.getEndpointFilterPage(field);
        if (page?.searchable) {
            clearTimeout(page.searchTimer);
            page.searchTimer = setTimeout(() => this.loadEndpointFilterPage(field, null, String(value || '').trim()), 200);
        }

    }

    filterUpdate() {
        return this.getFilterPayload();
    }

    getFilterOptionSearchKeys(field = {}) {
        const keys = field.filter?.searchKeys || field.filter?.optionSearchKeys;

        if (Array.isArray(keys) && keys.length) {
            return keys;
        }

        return ['label', 'title', 'name', 'text', 'value', 'id'];
    }

    getObjectPathValue(source = {}, path = '') {
        return String(path || '')
            .split('.')
            .filter(Boolean)
            .reduce((value, key) => {
                if (value === null || typeof value === 'undefined') {
                    return '';
                }

                return value[key];
            }, source);
    }

    normalizeFilterSearchValue(value = '') {
        return String(value || '').trim().toLowerCase();
    }

    optionMatchesSearch(option = {}, search = '', keys = []) {
        const query = this.normalizeFilterSearchValue(search);

        if (!query) return true;

        return keys.some((key) => {
            const value = this.getObjectPathValue(option, key);
            return this.normalizeFilterSearchValue(value).includes(query);
        });
    }

    getVisibleFilterOptions(field = {}) {
        const options = this.getFilterOptions(field);
        const search = this.getFilterOptionSearch(field.key);

        if (!search) {
            return options;
        }

        const keys = this.getFilterOptionSearchKeys(field);
        return options.filter((option) =>
            this.optionMatchesSearch(option, search, keys),
        );
    }

    // A cell for a column that names a property type: the Framework's renderer
    // for that type, or nothing, in which case the value renders as itself. A
    // host that passes its own component never reaches here -- the escape hatch
    // is that the host's choice is consulted first, by the template.
    // The set answers with a cell value in the shape a host would pass -- a
    // string, an object with a component, or a list of those -- so the template
    // renders it through the path it already had. The set adds no second way to
    // draw a cell.
    // A boolean cell the host lets this person write: the table is told it
    // may (inline-edit) and the record names the field in `editable`.
    cellEditable(row = {}, column = {}) {
        if (this.getAttribute("inline-edit") !== "true") return false;
        if ((column.propertyType ?? column.property_type ?? column.type) !== "boolean") return false;
        return Array.isArray(row.editable) && row.editable.map(String).includes(String(column.key));
    }

    cellPending(row = {}, column = {}) {
        return this._pendingCells?.has(`${this.getRowKey(row)}\u0000${column.key}`) === true;
    }

    // A checkbox pressed: the cell waits for the host, which answers with the
    // record as it now is, or not, and then the row is drawn from what it says.
    setCellValue(row = {}, column = {}, value) {
        const id = this.getRowKey(row);
        this._pendingCells ??= new Set();
        this._pendingCells.add(`${id}\u0000${column.key}`);
        this.requestComponentUpdate("cell-pending");
        this.emitTableEvent("cell-set", Object.freeze({
            id: row.id ?? id, key: column.key, value,
            revision: row._revision ?? row.revision ?? null,
        }));
    }

    clearCellPending(id, key) {
        if (this._pendingCells?.delete(`${id}\u0000${key}`)) this.requestComponentUpdate("cell-pending");
    }

    // The box shows what the host holds again. A render cannot do it: the
    // value it would draw is the one it drew before the click, so nothing
    // changes for it, while the box itself was toggled by the click.
    resetCellControl(id, key, value) {
        const escape = (text) => String(text).replace(/"/gu, '\\"');
        const box = this.querySelector(`tbody tr[data-row-id="${escape(id)}"] [data-cell-edit="${escape(key)}"]`);
        if (!box) return;
        const checked = value === true;
        box.checked = checked;
        box.toggleAttribute("checked", checked);
        const input = box.querySelector("input");
        if (input) input.checked = checked;
    }

    getTypedCellValue(column = {}, value) {
        // The host is passed so `formatFieldValue` is reachable from a cell. It
        // was reachable from the record panel and not from the list -- the
        // panel hands the renderer set its port, the table handed it nothing --
        // so the same date read «25 сентября 2026» in a card and
        // «2026-09-25T07:12:00+03:00» in a row, and a consumer had no way to
        // change the second. The set still refuses to guess a format; this only
        // lets the host say one (admin polygon, 2026-10-10).
        return renderCellField(column, value, this.cellHost ?? null);
    }

    // The filter controls were the Framework's only type-aware rendering, and
    // Larena's request asks for one renderer set shared by the record view and
    // the table's cells. Keeping these here as well would have made two maps
    // for one question, so they moved into src/smart/field-renderers and this
    // asks the set. The host interface is small on purpose: the set renders,
    // the table owns the state.
    renderFilterControl(field = {}) {
        return renderFilterField(field, {
            // The filter controls take this size: the host built here had none,
            // so the search field in a field's window stayed at 1 beside
            // buttons at 1/2.
            size: this.size,
            getFilterControlValue: (key) => this.getFilterControlValue(key),
            patchTempFilterValue: (key, patch) => this.patchTempFilterValue(key, patch),
            getFilterOperatorLabel: (operator) => this.getFilterOperatorLabel(operator),
            getFilterOptionSearch: (key) => this.getFilterOptionSearch(key),
            patchTempFilterOptionSearch: (key, search) => this.patchTempFilterOptionSearch(key, search),
            getVisibleFilterOptions: (item) => this.getVisibleFilterOptions(item),
            renderFilterOption: (item, option) => this.renderFilterOption(item, option),
            getEndpointFilterPage: (item) => this.getEndpointFilterPage(item),
            loadEndpointFilterPage: (item, cursor, search) => this.loadEndpointFilterPage(item, cursor, search),
        });
    }

    renderFilterOption(field = {}, option = {}, selected = new Set()) {
        const value = option.value ?? option.id ?? option.key ?? option.label ?? option.title;
        const label = option.label || option.title || String(value || '');
        const badge = field.filter?.optionRenderer === 'badge' ? optionBadgeProps(option) : null;

        return html`
            <div
                    ${ref(this.getItemRef(option.label))}
                    class="flex items-cross-center gap-1/2 content-main-between">
                <div class="flex items-cross-center gap-1/2 min-w-0">
                    ${badge ? html`
                        <sf-badge
                                appearance="tonal"
                                scheme=${badge.scheme}
                                root-style=${badge.rootStyle || nothing}
                                icon=${option.icon || nothing}
                                text=${label}
                        ></sf-badge>
                    ` : html`
                        ${this.renderFilterOptionVisual(field, option)}
                        <span class="sf-text-1 truncate">${label}</span>
                    `}
                </div>
                <sf-checkbox
                        size=${this.size}
                        position="end"
                        root-class="content-main-between"
                        ?checked=${selected.has(value)}
                        @change=${(event) => {
                            const nextSelected = new Set(selected);
                            if (event.target?.checked) {
                                nextSelected.add(value);
                            } else {
                                nextSelected.delete(value);
                            }
                            this.patchTempFilterValue(field.key, {
                                values: Array.from(nextSelected),
                                operator: field.filter?.defaultOperator || 'in',
                            });
                        }}
                ></sf-checkbox>
            </div>
        `;
    }

    renderFilterOptionVisual(field = {}, option = {}) {
        // A colour from the field's palette is shown as its swatch.
        if (field.filter?.optionRenderer === 'swatch' && option.color) {
            return html`<span class="sf-table-filter-swatch" aria-hidden="true" style=${`background-color: ${option.color}`}></span>`;
        }
        if (field.filter?.optionRenderer !== 'avatar-checkbox') {
            return '';
        }

        if (option.imageUrl) {
            return html`
                <sf-avatar
                        size=${this.size}
                        image-url="${option.imageUrl}"
                        title="${option.title || option.label || ''}"
                ></sf-avatar>
            `;
        }

        return html`
            <sf-avatar
                    size=${this.size}
                    title="${option.avatarText || option.title || option.label || ''}"
            ></sf-avatar>
        `;
    }

    getFilterOperatorLabel(operator) {
        const keys = {
            eq: 'operatorEq', gt: 'operatorGt', gte: 'operatorGte',
            lt: 'operatorLt', lte: 'operatorLte', between: 'operatorBetween',
            contains: 'operatorContains', startsWith: 'operatorStartsWith',
            any: 'operatorAny', today: 'operatorToday', week: 'operatorWeek',
            month: 'operatorMonth', in: 'operatorIn',
        };

        // An operator nobody has a word for is shown as it is stored, which is
        // better than a blank and says what to add.
        return keys[operator] ? this.text(keys[operator]) : operator;
    }


    renderFilterSettingsContextMenu(data) {
        const {
            x,
            y,
            position,
            columnCount,
            columnsCount,
            transform,
        } = data;
        let pos = `translateX(${transform !== undefined ? transform : 0}%)`;
        const pendingFilter = this.getPendingFilterState();
        // What a press would change, so the button can say it. The button is
        // already a filled primary one, so an extra fill or ring would say
        // nothing: the count is the marked state, and with nothing pending the
        // button reads exactly as it did before. sf-button carries no `filled`
        // property -- that belongs to the icon button -- so setting one would
        // have been an attribute nobody reads.
        const pendingConditions = this.countPendingFilterConditionChanges();
        const selectedTemplateKey = pendingFilter.selectedTemplateKey;
        const sortedTemplates = this.getSortedFilterTemplates(pendingFilter);
        const sortTemplates = sortedTemplates.map((col) => {
            let component;
            const isActiveEdit = this.state.filter.rename === col.key;
            if (this.state.filter.rename !== col.key) {
                const data = {
                    type: "radio",
                    props: {
                        size: this.size,
                        // A template the host gave no name is the view as it
                        // stands: it is named so, not drawn as an empty row
                        // (owner, 2026-10-14).
                        label: col.label || this.text('untitledTemplateText'),
                        name: 'filter_templates',
                        checked: selectedTemplateKey
                            ? selectedTemplateKey === col.key
                            : col.selected || false,
                        '@change': () => {
                            this.selectTempFilterTemplate(col.key);
                        }
                    }
                }
                component = this.renderSmartElement(data.type, data.props);
            } else {
                component = html`
                    <div class="flex items-cross-center gap-1/4 flex-1">
                        <sf-input size=${this.size} ${ref(this.refs.renameInput)} root-class="flex-1"
                                  default-value="${col.label}"></sf-input>
                        <div class="flex items-cross-center flex-none">
                            <sf-icon-button size=${this.size} segment="start" appearance="outline" scheme="on-surface" @click="${() => {
                                this.set((prevState) => ({
                                    filter: {
                                        ...(prevState.filter || {}),
                                        rename: '',
                                    },
                                }));
                            }}"
                                            icon="close"></sf-icon-button>
                            <sf-icon-button size=${this.size} segment="end" icon="check" @click="${() => {
                                const name = this.refs.renameInput.value?.value;
                                this.saveFilterTemplatePatch(col.key, {
                                    label: name,
                                }, {
                                    filterPatch: {
                                        rename: '',
                                    },
                                    saveInputValue: name,
                                });

                            }}"></sf-icon-button>
                        </div>
                    </div>`
            }

            return html`
                <div
                        :key=${col.key}
                        ${ref(this.getItemRef(col.label))}
                        class="sf-settings-context-menu-item flex items-cross-center flex-1 gap-1/3 ${col.deleted ? 'opacity-3' : ''}"
                        data-filter-template-key="${col.key}"
                        data-sf-sortable-item=${col.key}
                        data-pinned="${col.pinned ? "1" : "0"}"
                >
                    ${!isActiveEdit ? html`
                        <sf-icon-button size=${this.size}
                                id="${this.getInstanceId()}--template-move--${col.key}"
                                appearance="link"
                                data-move
                                data-sf-sortable-handle
                                scheme="on-surface"
                                aria-label=${`${this.text("templateMoveLabel")}: ${col.label}`}
                                icon="drag_indicator"
                                root-class="cursor-move"
                        ></sf-icon-button>` : nothing}
                    ${component}
                    ${!isActiveEdit ? html`
                        <div class="flex items-cross-center m-inline-start-auto gap-1/3">
                            <sf-icon-button
                                    appearance="link"
                                    data-keep
                                    size="1/3"
                                    scheme="on-surface"
                                    aria-label=${`${this.text("templatePinLabel")}: ${col.label}`}
                                    ?filled="${col.pinned}"
                                    root-class="${col.pinned ? 'sf-button-pinned' : ''}"
                                    icon="keep"
                                    @click=${() => {
                                        this.patchTempFilterTemplateSettings(col.key, {
                                            pinned: !col.pinned,
                                        });
                                    }}
                            ></sf-icon-button>
                            <sf-icon-button size=${this.size}
                                    appearance="link"
                                    data-settings
                                    data-context-submenu-anchor="${col.key}"
                                    scheme="on-surface"
                                    aria-label=${`${this.text("templateActionsLabel")}: ${col.label}`}
                                    icon="more_vert"
                                    @click=${(event) => {
                                        this.openContextSubmenu(event, {
                                            type: 'filter-template-actions',
                                            template: col,
                                        });
                                    }}
                            ></sf-icon-button>
                        </div>` : nothing}
                </div>`;
        })
        const menuColumnCount =
            columnCount ?? columnsCount ?? this.contextMenuColumns ?? 1;
        const colsData = this.getFilterTagColsData()
        const columnGroups = this.splitItemsByColumns(colsData, menuColumnCount);
        let contextItems = `${this.text('templatesTabText')}|${this.text('fieldsTabText')}`;
        return html`
            <sf-context-menu
                    size=${this.size === "1/2" ? "1/2" : "1"}
                    :key=${x + y + this._renderToken}
                    aria-label=${this.getContextMenuLabel({...data, menu: 'filter-settings'})}
                    style="
            position: fixed;
            left: ${x}px;
            inset-block-start: calc(${y}px + calc(var(--sf-focus-outline-width) * 2));
            transform: ${pos};
            z-index: var(--sf-table-context-menu--z-index, var(--sf-z-index-9));
            --sf-table-context-menu--max-block-size: calc(100dvh - ${y}px - var(--sf-space-4));
          "
                    root-class="sf-table-context-menu ${this.size === "1/2" ? "sf-table-context-menu--dense " : ""}flex flex-col"
                    position="${position || ""}"
                    role="dialog"
                    tabs=${contextItems}
                    active-tab=${this._filterTab === 'fields' ? '1' : '0'}
                    closable
                    @sf-context-menu-tab=${(event) => {
                        event.stopPropagation();
                        this._filterTab = event.detail?.index === 1 ? 'fields' : 'templates';
                        this.requestComponentUpdate('filter-tab');
                    }}
                    @sf-context-menu-close=${(event) => {
                        event.stopPropagation();
                        this.closeContextMenu();
                    }}
            >
                <!-- The Framework's panel with tabs (owner, 2026-10-15): the
                     tabs stay while the rows scroll, the buttons stay at the
                     bottom, and the window keeps its width -- it grew under
                     the pointer when «Применить (2)» got longer. -->
                <div class="sf-table-context-body flex flex-col flex-1" slot="content">
                    ${this._filterTab !== 'fields' ? html`
                            <div
                                    class="sf-context-menu-columns flex flex-col gap-1/4 overflow-auto flex-1"
                                    data-filter-template-list
                            >
                                ${this.renderSortableGroups(
                                    sortTemplates.filter((_, at) => sortedTemplates[at].pinned),
                                    sortTemplates.filter((_, at) => !sortedTemplates[at].pinned),
                                    {name: 'filter-templates', label: this.text('templatesTabText'),
                                     onIntent: (event) => this.onFilterTemplateIntent(event)},
                                )}
                            </div>` : html`
                            <div class="sf-context-menu-columns flex flex-1 gap-1 overflow-auto">
                                ${columnGroups.map(
                                        (group) => html`
                                            <div class="flex flex-col gap-1 flex-1">
                                                ${group}
                                            </div>
                                        `,
                                )}
                            </div>`}
                </div>
                        <sf-button slot="footer" size=${this.size} @click="${() => {
                            // Reset means the defaults, not "forget what I just
                            // typed here": the draft goes, and the host is asked
                            // to clear the person's own layer — order, widths,
                            // visibility and pinning — because the defaults are
                            // the host's to decide, not this component's.
                            this.tempSettings = null;
                            this.requestComponentUpdate('table');
                            this.requestColumnSettingsReset();
                        }
                        }" appearance="outline" scheme="on-surface" root-class="flex-1"
                                   text="${this.text('resetText')}"></sf-button>
                        <sf-button slot="footer" size=${this.size} @click="${() => {
                            const tempFilter = this.tempSettings?.filter;

                            if (tempFilter) {
                                let changedTemplates = [];
                                let deletedKeys = [];
                                let selectedKey = null;
                                this.set((prevState) => {
                                    const hasDataChanges =
                                            this.hasPendingFilterDataChanges(
                                                    prevState.filter || {},
                                            );
                                    const filter = this.mergeFilterState(
                                            prevState.filter || {},
                                            tempFilter,
                                    );
                                    const selectedTemplate =
                                            this.getSelectedFilterTemplate(filter);
                                    changedTemplates = tempFilter.templates
                                            ? this.getChangedFilterTemplates(
                                                    prevState.filter || {},
                                                    filter,
                                                    ['order', 'pinned', 'deleted', 'selected', 'default'],
                                            )
                                            : [];
                                    deletedKeys = filter.templates
                                            .filter((template) => template.deleted && template.key)
                                            .map((template) => template.key);
                                    filter.templates = filter.templates.filter(el => !el.deleted)
                                    const previousKey =
                                            this.getSelectedFilterTemplate(prevState.filter || {})?.key || null;
                                    selectedKey = selectedTemplate?.key && selectedTemplate.key !== previousKey
                                            ? selectedTemplate.key
                                            : null;
                                    return {
                                        filter,
                                        filterDataDirty:
                                                prevState.filterDataDirty ||
                                                hasDataChanges,
                                        saveInputValue:
                                                selectedTemplate?.label || "",
                                    };
                                }, () => {
                                    if (changedTemplates.length) {
                                        this.dispatchFilterTemplatesSave(changedTemplates);
                                    }
                                    for (const key of deletedKeys) {
                                        this.emitTableEvent('template-delete', Object.freeze({key}));
                                    }
                                    if (selectedKey) {
                                        this.emitTableEvent('template-select',
                                                Object.freeze({key: selectedKey}));
                                    }
                                });
                            }

                            this.tempSettings = null;
                            this.closeContextMenu();
                        }}" root-class="flex-1"
                                   aria-label=${pendingConditions
                                       ? `${this.text("filterApplyText", "filter-apply-text")}: ${pendingConditions}`
                                       : this.text("filterApplyText", "filter-apply-text")}
                                   text=${pendingConditions
                                       ? `${this.text("filterApplyText", "filter-apply-text")} (${pendingConditions})`
                                       : this.text("filterApplyText", "filter-apply-text")}></sf-button>
            </sf-context-menu>
        `;
    }

    renderTagsSettingsContextMenu(data) {
        const {
            x,
            y,
            position,
            fieldKey,
        } = data;
        const field = this.getFilterField(fieldKey) || {
            key: fieldKey,
            label: this.getCurrentFilterTags()?.[fieldKey]?.label || fieldKey || '',
            filter: {
                control: this.getCurrentFilterTags()?.[fieldKey]?.control || 'text',
            },
        };
        return html`
            <sf-context-menu
                    size=${this.size === "1/2" ? "1/2" : "1"}
                    :key=${x + y + this._renderToken}
                    aria-label=${this.getContextMenuLabel({...data, menu: 'tag-settings'})}
                    style="
            position: fixed;
            left: ${x}px;
            inset-block-start: calc(${y}px + calc(var(--sf-focus-outline-width) * 2));
            z-index: var(--sf-table-context-menu--z-index, var(--sf-z-index-9));
          "
                    root-class="sf-table-context-menu ${this.size === "1/2" ? "sf-table-context-menu--dense " : ""}flex flex-col"
                    position="${position || ""}"
            >
                <div class="flex flex-col flex-1 ${this.size === "1/2" ? "p-top-1" : "p-top-3"}" slot="content">
                    <div class="sf-table-context-main">
                        <div class="sf-table-tags-search flex flex-col">
                            <div class="flex flex-col ${this.size === "1/2" ? "p-bottom-1" : "p-bottom-3"}">
                                ${this.renderFilterControl(field)}
                            </div>
                        </div>
                    </div>
                    <div class="sf-table-context-bottom sf-context-menu-footer">
                        <sf-button size=${this.size} @click="${() => {
                            this.tempSettings = null;
                            this.requestComponentUpdate('table')
                        }
                        }" appearance="outline" scheme="on-surface" root-class="flex-1"
                                   text="${this.text('resetText')}"></sf-button>
                        <sf-button size=${this.size} @click="${() => {
                            const tempFilter = this.tempSettings?.filter;

                            if (tempFilter) {
                                this.set((prevState) => {
                                    const hasDataChanges =
                                            this.hasPendingFilterDataChanges(
                                                    prevState.filter || {},
                                            );

                                    return {
                                        filter: this.mergeFilterState(
                                                prevState.filter || {},
                                                tempFilter,
                                        ),
                                        filterDataDirty:
                                                prevState.filterDataDirty ||
                                                hasDataChanges,
                                    };
                                }, () => {
                                    const detail = this.filterUpdate();
                                    this.emitTableEvent('filter-change', detail);
                                });
                            }

                            this.tempSettings = null;
                            this.closeContextMenu();
                        }}" root-class="flex-1" text="${this.text('applyText')}"></sf-button>
                    </div>
                </div>
            </sf-context-menu>
        `;
    }

    removeFilterTag(id = null) {
        if (id) {
            this.tempSettings = null;
            this.set((prevState) => {
                const prevFilter = prevState.filter || {};
                const tags = {...this.getCurrentFilterTags(prevFilter)};
                const values = {...this.getCurrentFilterValues(prevFilter)};

                delete tags[id];
                delete values[id];

                return {
                    filter: this.patchFilterTemplateData(prevFilter, {
                        tags,
                        values,
                    }),
                    filterDataDirty: true,
                };
            }, () => {
                const detail = this.filterUpdate();
                this.emitTableEvent('filter-change', detail);
            });
            return this;
        }

        this.tempSettings = null;
        this.set((prevState) => {
            const prevFilter = prevState.filter || {};

            return {
                filter: {
                    ...prevFilter,
                    selectedTemplateKey: "",
                    templates: this.getFilterTemplates(prevFilter).map(
                        (template) => ({
                            ...template,
                            selected: false,
                        }),
                    ),
                },
                saveInputValue: "",
                filterDataDirty: false,
            };

        }, () => {
            const detail = this.filterUpdate();
            this.emitTableEvent('filter-change', detail);
        });

        return this;
    }

    renderTableSettingsContextMenu(data) {
        const {
            x,
            y,
            position,
            transform,
            columnCount,
            columnsCount,
        } = data;
        let pos = `translateX(${transform !== undefined ? transform : 0}%)`;
        const menuColumnCount =
            columnCount ?? columnsCount ?? this.contextMenuColumns ?? 1;
        const cols = this.getTableColsData()
        const pinnedCols = this.getTableColsData('pinned');
        const looseCols = this.getTableColsData('loose');
        const query = this.state.columnSettingsQuery || "";
        // The settings window is about the columns. Its "Actions" tab was asked
        // to go on 2026-10-02: row actions are offered in the row's own menu and
        // bulk actions in the band under the table, so a third place to find
        // them taught nobody anything.
        return html`
            <sf-context-menu
                    size=${this.size === "1/2" ? "1/2" : "1"}
                    :key=${x + y + this._renderToken}
                    aria-label=${this.getContextMenuLabel({...data, menu: 'table-settings'})}
                    style="
            position: fixed;
            left: ${x}px;
            inset-block-start: calc(${y}px + calc(var(--sf-focus-outline-width) * 2));
            transform: ${pos};
            z-index: var(--sf-table-context-menu--z-index, var(--sf-z-index-9));
            --sf-table-context-menu--max-block-size: calc(100dvh - ${y}px - var(--sf-space-4));
          "
                    root-class="sf-table-context-menu ${this.size === "1/2" ? "sf-table-context-menu--dense " : ""}flex flex-col"
                    position="${position || ""}"
                    role="dialog"
                    tabs=${`${this.text('settingsFieldsTab')}|${this.text('settingsViewTab')}`}
                    active-tab=${this._settingsTab === 'view' ? '1' : '0'}
                    closable
                    @sf-context-menu-tab=${(event) => {
                        event.stopPropagation();
                        this._settingsTab = event.detail?.index === 1 ? 'view' : 'fields';
                        this.requestComponentUpdate('settings-tab');
                    }}
                    @sf-context-menu-close=${(event) => {
                        event.stopPropagation();
                        this.closeContextMenu();
                    }}
            >
                <!-- Two tabs (owner, 2026-10-14) in the Framework's panel
                     (2026-10-15): its head -- the tabs and the way out --
                     stays while the rows scroll, and its width is its own.
                     Esc, a click outside and the gear again close it too. -->
                <div class="sf-table-context-body flex flex-col flex-1" slot="content">
                    ${this._settingsTab === 'view' ? this.renderTableViewSettings() : html`
                    <!-- The search: a site can have hundreds of fields, and
                         scrolling for one is not an answer. -->
                    <label class="sf-table-column-search flex flex-col">
                        <sf-input
                            size=${this.size}
                            appearance="bordered"
                            root-class="sf-table-column-search-input"
                            name="sf_table_column_search"
                            .value=${query}
                            placeholder=${this.text("columnSearchPlaceholder", "column-search-placeholder")}
                            aria-label=${this.text("columnSearchPlaceholder", "column-search-placeholder")}
                            @input=${(event) => this.setColumnSettingsQuery(event.target?.value ?? "")}
                        ></sf-input>
                    </label>
                    <div class="sf-context-menu-columns flex flex-col flex-1 gap-1/3 overflow-auto"
                         data-column-settings-list>
                        ${cols.length
                            ? this.renderSortableGroups(pinnedCols, looseCols, {name: 'table-columns',
                                label: this.text('settingsColumnLabel'),
                                onIntent: (event) => this.onColumnSettingsIntent(event)})
                            : html`<div class="sf-table-column-empty p-1 color-on-surface-variant">
                                ${this.text("columnSearchEmptyText", "column-search-empty-text")}
                            </div>`}
                    </div>
                    `}
                </div>
                <!-- «Применить» went with the consumer owner's decision of
                     2026-10-05: every control in this window applies as it is
                     pressed. «Сбросить» is the way back -- for the fields, the
                     settings as they stood when the window was opened; for the
                     view, the defaults. -->
                <!-- One button that stays, its words and act following the
                     tab: the panel took its footer once, at the start. -->
                <sf-button slot="footer" size=${this.size} appearance="outline" scheme="on-surface" root-class="flex-1"
                           text=${this._settingsTab === 'view' ? this.text('viewReset') : this.text('resetText')}
                           @click=${() => (this._settingsTab === 'view' ? this.resetTableView() : this.restoreColumnSettingsOnOpen())}></sf-button>
            </sf-context-menu>
        `;
    }

    // The gear's «Вид»: the rows' density as a radio list, three switches, and
    // whether a change is for this table or for all the person's tables.
    renderTableViewSettings() {
        const view = this.tableView;
        const size = this.size === "1/2" ? "1/2" : "1";
        const everywhere = this._viewEverywhere === true;
        const row = (label, control) => html`<div class="sf-table-settings-row">${control}<span>${label}</span></div>`;
        const density = ["compact", "normal", "spacious"];
        const label = {compact: "viewDensityCompact", normal: "viewDensityNormal", spacious: "viewDensitySpacious"};
        const check = (field, text) => html`<label class="sf-table-settings-row" data-view-option=${field}>
            <sf-checkbox size=${size} ?checked=${view[field] === true}
                         @change=${(event) => this.setTableView({[field]: Boolean(event.target?.checked ?? event.detail?.checked)}, {everywhere})}></sf-checkbox>
            <span>${this.text(text)}</span></label>`;
        return html`
            <div class="sf-table-view-settings flex flex-col flex-1 gap-1/3" data-table-view-settings>
                <div class="sf-table-settings-heading">${this.text('viewDensity')}</div>
                <div role="radiogroup" aria-label=${this.text('viewDensity')} class="flex flex-col">
                    ${density.map((value) => html`<label class="sf-table-settings-row" data-view-density=${value}>
                        <sf-radio size=${size} name=${`${this.getInstanceId()}-density`} value=${value} ?checked=${view.density === value}
                                  @change=${() => this.setTableView({density: value}, {everywhere})}></sf-radio>
                        <span>${this.text(label[value])}</span></label>`)}
                </div>
                ${check("stripes", "viewStripes")}
                ${check("lines", "viewLines")}
                ${check("singleLine", "viewSingleLine")}
                ${this.getAttribute("vertical-scroll") === "page" ? check("stickyHead", "viewStickyHead") : nothing}
                ${this.viewPreferenceKey ? html`<div class="sf-table-settings-separator" role="separator"></div>
                    ${row(this.text('viewEverywhere'), html`<sf-checkbox size=${size} data-view-everywhere ?checked=${everywhere}
                        @change=${(event) => { this._viewEverywhere = Boolean(event.target?.checked ?? event.detail?.checked); this.requestComponentUpdate('view-everywhere'); }}></sf-checkbox>`)}` : nothing}
            </div>`;
    }

    renderMainContextMenu(data) {
        const menu = data.menu || data.menuType || data.contextMenu;

        switch (menu) {
            case 'row-settings':
                return this.renderRowSettingsContextMenu(data);
            case 'create':
                return this.renderCreateContextMenu(data);
            case 'list-sort':
                return this.renderListSortContextMenu(data);
            case 'toolbar-actions':
                return this.renderToolbarActionsContextMenu(data);
            case 'filter-favorites':
                return this.renderFilterFavoritesContextMenu(data);
            case 'filter-settings':
                return this.renderFilterSettingsContextMenu(data);
            case 'table-settings':
                return this.renderTableSettingsContextMenu(data);
            case 'tag-settings':
                return this.renderTagsSettingsContextMenu(data);
            default:
                return data.type === 'left'
                    ? this.renderRowSettingsContextMenu(data)
                    : this.renderTableSettingsContextMenu(data);
        }
    }

    renderTemplateActionsContextSubmenu(data) {
        const {
            x,
            y,
            position,
            transform,
            template = {},
        } = data;
        let pos = `translateY(${transform !== undefined ? transform : 0}%)`;
        const temp = this.getFilterTemplateByKey(template.key, this.tempSettings?.filter || null);
        let isDeleted = (temp || template).deleted;
        const isDefaultTemplate = (temp || template).default === true;
        return html`
            <sf-context-menu
                    size=${this.size === "1/2" ? "1/2" : "1"}
                    :key=${`${template.key || ''}-${x}-${y}`}
                    aria-label=${this.getContextMenuLabel({...data, type: 'filter-template-actions'})}
                    style="
          position: fixed;
        left: calc(${x}px + var(--sf-context-menu-tail-corner-offset));
            inset-block-start: ${y}px;
          z-index: var(--sf-table-context-submenu--z-index, var(--sf-z-index-9));
          transform: ${pos}
        "
                    data-context-submenu
                    root-class="sf-table-context-submenu flex flex-col"
                    position="${position || "right"}"
                    .entries=${[
                        // The standard menu's rows (owner, 2026-10-14), not link
                        // buttons; a delete is marked as one, a restore is not.
                        {id: 'rename', text: this.text('renameText'), icon: 'edit'},
                        {id: 'default', text: isDefaultTemplate ? this.text('defaultTemplateText') : this.text('makeDefaultLabel'),
                            icon: isDefaultTemplate ? 'remove' : 'check'},
                        {id: 'delete', text: isDeleted ? this.text('restoreText') : this.text('deleteActionText'),
                            icon: isDeleted ? 'restore_from_trash' : 'delete', danger: !isDeleted, keepOpen: true},
                    ]}
                    @sf-context-menu-select=${(event) => {
                        const id = event.detail?.id;
                        if (id === 'rename') {
                            this.set((prevState) => ({
                                filter: {
                                    ...(prevState.filter || {}),
                                    rename: template.key,
                                },
                                contextMenu: {
                                    ...(prevState.contextMenu || {}),
                                    submenu: null,
                                },
                            }));
                        } else if (id === 'default') {
                            this.changeTempFilterTemplateSettings(template.key, {
                                default: !template.default,
                            });
                            this.closeContextSubmenu();
                        } else if (id === 'delete') {
                            this.patchTempFilterTemplateSettings(template.key, {
                                deleted: !isDeleted,
                            });
                        }
                    }}
            >
            </sf-context-menu>
        `;
    }

    renderContextSubmenu(data) {
        switch (data?.type) {
            case 'filter-template-actions':
                return this.renderTemplateActionsContextSubmenu(data);
            default:
                return nothing;
        }
    }

    renderContextMenu(data) {
        // The windows' lists are reordered with sf-sortable, fetched when a
        // window first opens rather than with every page.
        if (data?.open) globalThis.SF?.Loader?.ensureSmartElementLoaded?.("sf-sortable");
        if (!data?.open) {
            render(null, this.getPortalContainer());
            this.hidePortal();
            return nothing;
        }

        render(
            html`
                <div
                        class="sf-table-context-layer"
                        data-sf-sheet=${this.isList && ["filter-settings", "tag-settings"].includes(data.menu) ? "" : nothing}
                        ${ref(this.refs.contextMenu)}
                        @click=${(event) => this.handleContextLayerClick(event)}
                >
                    ${this.renderMainContextMenu(data)}
                    ${data.submenu?.open ? this.renderContextSubmenu(data.submenu) : nothing}
                    ${this.isList && ["filter-settings", "tag-settings"].includes(data.menu) ? html`
                        <div class="sf-table-sheet-close">
                            <sf-icon-button size=${this.size} appearance="link" scheme="on-surface"
                                            icon="close" aria-label=${this.text('closeText')}
                                            @click=${() => this.closeContextMenu()}></sf-icon-button>
                        </div>` : nothing}
                </div>
            `,
            this.getPortalContainer(),
        );
        this.showPortal();
        this.bindContextEvent();
        this.bindContextViewport();
        requestAnimationFrame(() => {
            this.clampContextMenusToViewport();
            // The menu lives in the portal, not in this element's own tree.
            this.redrawWhenComponentsUpgrade(this.getPortalContainer());
        });
        return nothing;
    }

    getActionItems() {
        return this.state.actions.map((action) => {
            const data = {
                type: "checkbox",
                props: {
                    size: this.size,
                    label: action.name,
                    position: 'end',
                    rootClass: 'content-main-between',
                    checked: action.visible,
                    "@change": (e) => {
                        let actionActive = false;
                        let arr = this.tempSettings && this.tempSettings.actions ? this.tempSettings.actions : this.state.actions;
                        const items = arr.map((item) => {
                            let visible = item.id === action.id ? e.target.checked : item.visible;
                            if (visible) {
                                actionActive = true;
                            }
                            return {
                                ...item,
                                visible: visible
                            }
                        })
                        this.tempSettings = {
                            ...(this.tempSettings || {}),
                            actionActive,
                            actions: items,
                        };
                    }
                }
            }
            return this.renderSmartElement(data.type, data.props);
        })
    }

    hoverEvents(e) {
        if (this._columnResizeState || this.columnDragActive) {
            return;
        }

        const th = e.target.closest('th');

        if (!th) {
            return;
        }
        const wrap = th.querySelector('.sidebar-resizer');
        if (!wrap) {
            return;
        }
        th.classList.add('hover');
        // The line belongs to the handle, not to the header. Shown on any
        // header hover it read as if the column were already being resized, and
        // it crossed the rows whenever the pointer merely passed over a title.
        if (this.getColumnResizeHandle(e.target)) {
            this.showColumnResizeGuide(th);
        } else {
            this.hideColumnResizeGuide();
        }
    }

    outEvent(e) {
        if (this._columnResizeState || this.columnDragActive) {
            return;
        }

        const th = e.target.closest('th');

        if (!th) {
            return;
        }
        const wrap = th.querySelector('.sidebar-resizer');
        if (!wrap) {
            return;
        }
        th.classList.remove('hover');
        this.hideColumnResizeGuide();
    }

    /**
     * The line that shows where a column edge will land runs through the rows
     * only, from the bottom of the head to the last row. A head cell cannot draw
     * it: a pseudo-element of a `th` has no way to reach into the body, and the
     * body's height is not known to CSS. So it is one element in the scroll
     * area, placed against the edge being dragged.
     */
    showColumnResizeGuide(th) {
        const guide = this.refs.resizeGuide?.value;
        const scroll = this.refs.scroll?.value;
        const table = this.refs.table?.value;
        if (!guide || !scroll || !th || !table) {
            return;
        }
        const head = table.querySelector('thead');
        const body = table.querySelector('tbody');
        if (!head || !body) {
            this.hideColumnResizeGuide();
            return;
        }
        const area = scroll.getBoundingClientRect();
        const cell = th.getBoundingClientRect();
        const headBox = head.getBoundingClientRect();
        const bodyBox = body.getBoundingClientRect();
        if (bodyBox.height <= 0) {
            this.hideColumnResizeGuide();
            return;
        }
        // The line continues the header's separator, so it is placed on that
        // separator rather than on the cell's outer edge: the separator is the
        // cell's own border, which occupies the last pixels inside the box.
        //
        // Nothing here is rounded. Rounding to whole pixels put the line beside
        // the separator whenever the cell's edge fell on a fraction -- which is
        // what a column width in rem or a root size of 87.5% produces, and what
        // the consumer measured as one pixel aside.
        const border = parseFloat(getComputedStyle(th).borderInlineEndWidth) || 0;
        const inlineStart = this.isRightToLeft()
            ? cell.left - area.left + scroll.scrollLeft
            : cell.right - area.left + scroll.scrollLeft - border;
        guide.style.insetInlineStart = `${inlineStart}px`;
        guide.style.insetBlockStart = `${headBox.bottom - area.top + scroll.scrollTop}px`;
        guide.style.blockSize = `${bodyBox.height}px`;
        guide.hidden = false;
    }

    hideColumnResizeGuide() {
        const guide = this.refs.resizeGuide?.value;
        if (guide) {
            guide.hidden = true;
        }
    }

    isRightToLeft() {
        return getComputedStyle(this).direction === 'rtl';
    }


    bindHoverEvent() {
        if (this._hoverEventBound) return;
        this._hoverEventBound = true;
        const table = this.refs.table?.value;
        table?.addEventListener('mouseover', this.hoverEvents);
        table?.addEventListener('mouseout', this.outEvent);
        //
        // this.addEventListener('mouseout', () => {
        //     this.querySelectorAll('.hover')
        //         .forEach(el => el.classList.remove('hover'));
        // });
    }

    unBindHoverEvent() {
        if (!this._hoverEventBound) {
            return;
        }
        const table = this.refs.table?.value;
        table?.removeEventListener('mouseover', this.hoverEvents);
        table?.removeEventListener('mouseout', this.outEvent);
        this._hoverEventBound = false;
    }

    // A column's edge is the Framework's resize gesture (SF.Resizer.attach,
    // owner 2026-10-14) -- the same drag, keys and double click as a panel's
    // edge: the table says what the width is the width of and keeps it in the
    // column settings, as it did.
    bindColumnResizeEvent() {
        const table = this.refs.table?.value;
        if (!table || this._columnResizeTable === table) return;
        const attach = globalThis.SF?.Resizer?.attach;
        if (typeof attach !== 'function') {
            globalThis.SF?.Loader?.ensureSmartElementLoaded?.('sf-resizer');
            customElements.whenDefined('sf-resizer').then(() => { if (this.isConnected) this.bindColumnResizeEvent(); });
            return;
        }
        this._columnResizeDetach?.();
        this._columnResizeTable = table;
        this._columnResizeDetach = attach(table, {
            handles: '.sf-table-column-resizer',
            session: (handle) => this.columnResizeSession(handle),
        });
    }

    unbindColumnResizeEvent() {
        this._columnResizeDetach?.();
        this._columnResizeDetach = null;
        this._columnResizeTable = null;
    }

    columnResizeSession(handle) {
        const th = handle?.closest?.('th');
        const key = th?.dataset?.key;
        const column = key ? this.getColumns().find((item) => item?.key === key) : null;
        if (!th || !column || column.system || column.resizable === false) return null;
        const table = this.refs.table?.value;
        const col = table?.querySelector(`col[data-key="${this.escapeColumnKey(key)}"]`);
        const state = {key, th, col, frozenWidths: null, dragging: false};
        const clear = () => {
            this._columnResizeState = null;
            th.style.width = '';
        };
        return {
            measure: () => th.getBoundingClientRect().width,
            limits: () => {
                const {minWidth, maxWidth} = this.getColumnResizeLimits(column, th.getBoundingClientRect().width);
                return {min: minWidth, max: maxWidth};
            },
            direction: () => (table && getComputedStyle(table).direction === 'rtl' ? -1 : 1),
            step: this.resolveCssLength(getComputedStyle(this).getPropertyValue('--sf-space-1'), 16),
            start: () => {
                state.dragging = true;
                this._columnResizeState = state;
                setLoaderDragState(true);
                document.documentElement.classList.add('sf-table-column-resizing');
            },
            apply: (width) => {
                state.frozenWidths ??= this.freezeColumnsWidthForResize(table);
                this._columnResizeState = state;
                if (col) col.style.width = `${width}px`;
                th.style.width = `${width}px`;
                // The line is placed from the cell's own edge, so it moves in the
                // same frame the edge does.
                this.showColumnResizeGuide(th);
                return width;
            },
            commit: (width) => {
                const frozen = state.frozenWidths ?? {};
                clear();
                this.applyColumnResizeWidths(key, width, frozen);
            },
            end: () => {
                document.documentElement.classList.remove('sf-table-column-resizing');
                setLoaderDragState(false);
                this.suppressNextHeaderClick();
                // The drag is over before the line goes: hidden while the
                // state still said «resizing», it stayed on the edge.
                clear();
                this.hideColumnResizeGuide();
            },
            // Back to the width the column has by itself: its content's, or
            // the one the host declared.
            reset: () => {
                clear();
                this.resetColumnWidth(key);
            },
        };
    }

    // The browser's memory of the widths, for a table that asks for it with
    // remember-widths: no host keeps its settings, so a reload lost them.
    // The widths are part of the table's view preference (SF.Preferences):
    // under preferences-key, or with remember-widths under the table's own key.
    get rememberedWidthsKey() {
        if (this.viewPreferenceKey) return this.viewPreferenceKey;
        if (!this.hasAttribute("remember-widths")) return "";
        return tablePreferenceKey(this.getTableSettingsKey() || this.id || globalThis.location?.pathname || "table");
    }

    readRememberedWidths() {
        const key = this.rememberedWidthsKey;
        if (!key) return {};
        const widths = preferences()?.read(key)?.widths;
        return widths && typeof widths === "object" ? widths : {};
    }

    writeTablePreference(key, patch) {
        if (!key) return;
        preferences()?.write(key, {...(preferences()?.read(key) ?? {}), v: 1, ...patch});
    }

    storeRememberedWidths(widths = {}) {
        this.writeTablePreference(this.rememberedWidthsKey, {widths: {...this.readRememberedWidths(), ...widths}});
    }

    forgetRememberedWidth(column) {
        const widths = this.readRememberedWidths();
        delete widths[column];
        this.writeTablePreference(this.rememberedWidthsKey, {widths});
    }

    // How this person arranged this table -- order, visibility, pinning,
    // widths (owner, 2026-10-14): kept under preferences-key (or the table's
    // table-settings-key when the host names one), read before the first
    // paint so the skeleton is already in that order, and written each time
    // the person changes it.
    get viewPreferenceKey() {
        const key = this.getAttribute("preferences-key") || this.getAttribute("table-settings-key") || "";
        return key ? tablePreferenceKey(key) : "";
    }

    applyTablePreference(value, {render = false} = {}) {
        const kept = value?.columnSettings;
        if (!kept || typeof kept !== "object") return false;
        // On the host's columns, not on what is drawn: a value that no longer
        // names a column returns it to the host's settings. Merged onto the
        // drawn state, a dropped key kept its old width or visibility on this
        // device until a reload (docs trial 5).
        const host = this.getTableData().columnSettings;
        const base = host && typeof host === "object" && !Array.isArray(host) ? host : {};
        const next = this.mergeColumnSettings(base, kept);
        if (render) this.setColumnSettings(next, "preferences", false);
        else this.state.columnSettings = next;
        return true;
    }

    connectTablePreference() {
        const key = this.viewPreferenceKey;
        if (key === this._preferenceKeyBound) return;
        this._preferenceUnsubscribe?.();
        this._preferenceKeyBound = key;
        this._preferenceUnsubscribe = null;
        this.applyTableView();
        if (!key) return;
        this.applyTablePreference(preferences()?.read(key));
        // The host's value, when it differs from this browser's, arrives later.
        const own = preferences()?.subscribe(key, (value) => {
            if (value) this.applyTablePreference(value, {render: true});
            // SF.Preferences.remove() from page code: back to the columns as the
            // host gave them, drawn now (docs trial 4: the table kept the
            // removed arrangement until a reload).
            else {
                const host = this.getTableData().columnSettings;
                this.setColumnSettings(host && typeof host === "object" && !Array.isArray(host) ? {...host} : {}, "preferences", false);
            }
            this.applyTableView();
        });
        const general = preferences()?.subscribe(GENERAL_TABLE_PREFERENCE, () => this.applyTableView());
        this._preferenceUnsubscribe = () => { own?.(); general?.(); };
    }

    // How the table looks for this person (the gear's «Вид», owner
    // 2026-10-14): density, alternate rows, lines between columns, text on
    // one line. Their tables' preference (sf-table/*) lies under this table's.
    get tableView() {
        const key = this.viewPreferenceKey;
        const general = preferences()?.read(GENERAL_TABLE_PREFERENCE)?.view ?? {};
        const own = key ? preferences()?.read(key)?.view ?? {} : this._sessionView ?? {};
        return {...TABLE_VIEW_DEFAULTS, ...general, ...own};
    }

    applyTableView() {
        const view = this.tableView;
        const flag = (name, on) => (on ? this.setAttribute(name, "") : this.removeAttribute(name));
        if (view.density === "normal") this.removeAttribute("data-sf-view-density");
        else this.setAttribute("data-sf-view-density", view.density);
        flag("data-sf-view-stripes", view.stripes === true);
        flag("data-sf-view-lines", view.lines === true);
        flag("data-sf-view-single-line", view.singleLine === true);
        const page = this.getAttribute("vertical-scroll") === "page" && !this.isList;
        flag("data-sf-page-scroll", page);
        flag("data-sf-sticky-head", page && view.stickyHead !== false);
    }

    // The head held under the toolbar while what scrolls -- the page, or a
    // box around the table -- scrolls past it (page mode): moved down by as
    // much as the table's top has gone above the line, never past its last
    // row. A sticky head cannot do it, because the area it sits in scrolls
    // sideways and so is a scroll container of its own.
    syncStickyHead() {
        const table = this.refs.table?.value;
        const head = table?.tHead;
        if (!head) return;
        const held = this.hasAttribute("data-sf-sticky-head");
        let delta = 0;
        if (held && table.isConnected) {
            const scroller = verticalScroller(this.refs.scroll?.value?.parentElement ?? this);
            const top = scroller ? scroller.getBoundingClientRect().top : 0;
            const toolbar = this.querySelector(":scope > .sf-table > .sf-table-toolbar");
            const line = Math.max(top, toolbar ? toolbar.getBoundingClientRect().bottom : top);
            const box = table.getBoundingClientRect();
            const room = box.height - head.offsetHeight;
            delta = Math.round(Math.min(Math.max(line - box.top, 0), Math.max(room, 0)));
        }
        head.style.transform = delta ? `translateY(${delta}px)` : "";
        this.toggleAttribute("data-sf-head-stuck", delta > 0);
    }

    // The rail under the area is its sideways bar: as wide as what the area
    // scrolls, shown only when there is something to scroll, and each follows
    // the other.
    syncRail() {
        const rail = this.refs.rail?.value;
        const scroll = this.refs.scroll?.value;
        if (!rail || !scroll) return;
        const wide = scroll.scrollWidth > scroll.clientWidth + 1;
        rail.hidden = !wide;
        const track = rail.firstElementChild;
        if (track) track.style.inlineSize = `${scroll.scrollWidth}px`;
        if (rail._sfBound !== scroll) {
            rail._sfBound = scroll;
            let following = false;
            const follow = (from, to) => () => {
                if (following) return;
                following = true;
                to.scrollLeft = from.scrollLeft;
                following = false;
            };
            scroll.addEventListener("scroll", follow(scroll, rail), {passive: true});
            rail.addEventListener("scroll", follow(rail, scroll), {passive: true});
            // The columns take their widths after a render (content widths,
            // late fonts): the rail follows the table's size, not the render.
            this._railObserver?.disconnect();
            if (typeof ResizeObserver !== "undefined") {
                this._railObserver = new ResizeObserver(() => this.syncRail());
                this._railObserver.observe(scroll);
                if (this.refs.table?.value) this._railObserver.observe(this.refs.table.value);
            }
        }
        if (wide) rail.scrollLeft = scroll.scrollLeft;
    }

    bindPageScroll() {
        if (this._pageScrollAbort) return;
        this._pageScrollAbort = new AbortController();
        const {signal} = this._pageScrollAbort;
        const again = () => {
            if (this._pageScrollFrame) return;
            this._pageScrollFrame = requestAnimationFrame(() => {
                this._pageScrollFrame = 0;
                if (this.isConnected) this.syncStickyHead();
            });
        };
        document.addEventListener("scroll", again, {capture: true, passive: true, signal});
        globalThis.addEventListener("resize", () => { again(); this.syncRail(); }, {passive: true, signal});
    }

    unbindPageScroll() {
        this._railObserver?.disconnect();
        this._railObserver = null;
        const rail = this.refs.rail?.value;
        if (rail) rail._sfBound = null;
        this._pageScrollAbort?.abort();
        this._pageScrollAbort = null;
        cancelAnimationFrame(this._pageScrollFrame ?? 0);
        this._pageScrollFrame = 0;
    }

    // One option changed. «Для всех моих таблиц» writes it to the person's
    // tables and takes it off this one, so this one follows them.
    setTableView(patch = {}, {everywhere = false} = {}) {
        const key = this.viewPreferenceKey;
        if (everywhere || !key) {
            if (everywhere) {
                const general = preferences()?.read(GENERAL_TABLE_PREFERENCE) ?? {};
                preferences()?.write(GENERAL_TABLE_PREFERENCE, {...general, v: 1, view: {...(general.view ?? {}), ...patch}});
            }
            if (key) {
                const own = {...(preferences()?.read(key)?.view ?? {})};
                for (const field of Object.keys(patch)) delete own[field];
                this.writeTablePreference(key, {view: own});
            } else if (!everywhere) {
                this._sessionView = {...(this._sessionView ?? {}), ...patch};
            }
        } else {
            this.writeTablePreference(key, {view: {...(preferences()?.read(key)?.view ?? {}), ...patch}});
        }
        this.applyTableView();
        this.requestComponentUpdate("table-view");
        this.emitTableEvent("view-change", Object.freeze({view: this.tableView, everywhere}));
        return this;
    }

    resetTableView() {
        const key = this.viewPreferenceKey;
        if (key) this.writeTablePreference(key, {view: {}});
        this._sessionView = null;
        this.applyTableView();
        this.requestComponentUpdate("table-view");
        return this;
    }

    // The remembered widths of the columns the table now has, as settings.
    restoreRememberedWidths() {
        const widths = this.readRememberedWidths();
        const keys = new Set((this.getColumns?.() ?? []).map((column) => column?.key));
        const patch = Object.fromEntries(Object.entries(widths)
            .filter(([column, width]) => keys.has(column) && typeof width === "string")
            .map(([column, width]) => [column, {width}]));
        if (Object.keys(patch).length) this.patchColumnSettingsBatch(patch, "column-widths-restore");
    }

    resetColumnWidth(key) {
        if (!key) return this;
        this.forgetRememberedWidth(key);
        return this.patchColumnSettingsBatch({[key]: {width: null}}, 'column-resize-reset');
    }

    // A heading is dragged with the Framework's sortable in its column mode
    // (SF.Sortable.attach, owner 2026-10-13): the column is dimmed in every row,
    // an outline the width of the column and the height of the table stands
    // where it will go, a pinned column moves among pinned ones and a loose one
    // among loose ones, and the click a drop ends with does not sort. The
    // table's own drag -- nine hundred lines moving cells between lit's part
    // markers and putting them back -- is gone. Keyboard reordering is the
    // column settings list.
    get columnDragActive() {
        return document.documentElement.hasAttribute('data-sf-sortable-active');
    }

    bindColumnDragEvent() {
        const table = this.refs.table?.value;
        const row = table?.tHead?.rows?.[0];
        if (!row || this._headerSortableRow === row) return;
        const attach = globalThis.SF?.Sortable?.attach;
        if (typeof attach !== 'function') {
            // sf-sortable is a lazy relation: fetched when first needed.
            globalThis.SF?.Loader?.ensureSmartElementLoaded?.('sf-sortable');
            customElements.whenDefined('sf-sortable').then(() => {
                if (this.isConnected) this.bindColumnDragEvent();
            });
            return;
        }
        this._headerSortableDetach?.();
        this._headerSortableRow = row;
        this._headerSortableDetach = attach(row, {
            items: 'th[data-key]',
            extent: table,
            // A column moving shows the line it will stand at, between two
            // columns (owner, 2026-10-14): the outline of the place it would
            // take read as a column already there.
            preview: 'line',
            label: this.text('settingsColumnLabel'),
            groupOf: (th) => this.headerColumnGroup(th.dataset.key),
            canStart: (event, th) => !this._columnResizeState && !this.getColumnResizeHandle(event.target)
                && ['pinned', 'loose'].includes(this.headerColumnGroup(th.dataset.key)),
            cellsOf: (th) => [...table.rows].map((tr) => tr.cells[th.cellIndex]).filter(Boolean),
            onIntent: (detail) => this.onHeaderColumnIntent(detail),
        });
    }

    unbindColumnDragEvent() {
        this._headerSortableDetach?.();
        this._headerSortableDetach = null;
        this._headerSortableRow = null;
    }

    // Which group a heading moves in: the system columns and a column marked
    // draggable: false do not move; a pinned column moves among pinned ones.
    headerColumnGroup(key) {
        if (this.getSystemColumns().some((column) => String(column.key) === key)) return 'system';
        const column = this.getColumns().find((item) => String(item.key) === key);
        if (!column || column.system || column.draggable === false) return 'fixed';
        return this.isColumnPinned(column) ? 'pinned' : 'loose';
    }

    // The order a heading drop asks for: the column at its place among the
    // shown columns of its group, the others where they are.
    onHeaderColumnIntent({item, index, group}) {
        const table = this.refs.table?.value;
        const shown = [...(table?.tHead?.rows?.[0]?.cells ?? [])]
            .map((cell) => cell.dataset?.key)
            .filter((key) => key && ['pinned', 'loose', 'fixed'].includes(this.headerColumnGroup(key)));
        const peers = shown.filter((key) => key !== item && this.headerColumnGroup(key) === group);
        const rest = shown.filter((key) => key !== item);
        const before = peers[index];
        const after = peers[index - 1];
        const at = before !== undefined ? rest.indexOf(before) : (after !== undefined ? rest.indexOf(after) + 1 : rest.length);
        rest.splice(at, 0, item);
        if (rest.join('|') === shown.join('|')) return this;
        return this.applyColumnOrder(rest, {});
    }

    getColumnResizeHandle(target) {
        if (!(target instanceof Element)) {
            return null;
        }

        // The handle is found by the attribute it carries, not by a prefix of its
        // id. The id is built from the instance, so it never began with
        // `column_resizer_`: pointerdown on the handle was not recognised as a
        // resize and fell through to the column-move handler, which is why
        // dragging the edge moved the column instead of changing its width.
        return target.closest('[data-sf-column-resizer]');
    }

    parseColumnSize(value, fallback = null) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string') {
            const normalized = value.trim();

            if (/^-?\d+(\.\d+)?px$/.test(normalized)) {
                return parseFloat(normalized);
            }
        }

        return fallback;
    }

    resolveCssLength(value, fallback = 0) {
        const normalized = String(value || '').trim();
        const match = normalized.match(/^(-?\d+(?:\.\d+)?)(px|rem|em)$/);

        if (!match) {
            return fallback;
        }

        const amount = Number(match[1]);
        const unit = match[2];

        if (unit === 'px') {
            return amount;
        }

        const reference = unit === 'rem' ? document.documentElement : this;
        const fontSize = parseFloat(getComputedStyle(reference).fontSize);
        return Number.isFinite(fontSize) ? amount * fontSize : fallback;
    }

    getColumnResizeLimits(column = {}, fallbackWidth = 0) {
        const semanticMinWidth = this.resolveCssLength(
            getComputedStyle(this).getPropertyValue('--sf-c4'),
            fallbackWidth,
        );
        const minWidth =
            this.parseColumnSize(column.minWidth, null) ??
            semanticMinWidth;
        const maxWidth = this.parseColumnSize(column.maxWidth, Infinity);

        return {
            minWidth,
            maxWidth: Math.max(maxWidth, minWidth),
        };
    }

    hasColumnSize(column = {}) {
        return [
            column.colWidth,
            column.width,
            column.size,
        ].some(
            (value) =>
                value !== null &&
                typeof value !== 'undefined' &&
                String(value).trim() !== '',
        );
    }

    escapeColumnKey(key) {
        const value = String(key || '');

        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(value);
        }

        return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    freezeColumnsWidthForResize(table) {
        const frozenWidths = {};
        const columns = this.getColumns();

        columns.forEach((column) => {
            if (!column?.key) {
                return;
            }

            const key = String(column.key);
            const escapedKey = this.escapeColumnKey(key);
            const th = table?.querySelector(`th[data-key="${escapedKey}"]`);
            const col = table?.querySelector(`col[data-key="${escapedKey}"]`);
            const width = th?.getBoundingClientRect?.().width || 0;

            if (!width) {
                return;
            }

            const nextWidth = `${Math.round(width)}px`;

            if (col) {
                col.style.width = nextWidth;
            }

            if (!column.system && !this.hasColumnSize(column)) {
                frozenWidths[key] = nextWidth;
            }
        });

        return frozenWidths;
    }

    applyColumnResizeWidths(key, width, frozenWidths = {}) {
        if (!key) {
            return this;
        }

        const nextWidths = {
            ...(frozenWidths || {}),
            [key]: `${Math.round(width)}px`,
        };
        this.storeRememberedWidths(nextWidths);
        const settingsPatch = Object.fromEntries(
            Object.entries(nextWidths).map(([columnKey, columnWidth]) => [
                columnKey,
                {
                    width: columnWidth,
                },
            ]),
        );

        return this.patchColumnSettingsBatch(
            settingsPatch,
            'column-resize',
        );
    }

    reorderColumnDomByKeys(table, userKeys = []) {
        if (!table || !Array.isArray(userKeys) || !userKeys.length) {
            return;
        }

        const moveKeyedChildren = (container, selector) => {
            if (!container) {
                return;
            }

            const userKeySet = new Set(userKeys);
            let insertAfter = null;

            for (const child of Array.from(container.children || [])) {
                const childKey = child?.dataset?.key;

                if (childKey && userKeySet.has(childKey)) {
                    break;
                }

                if (childKey) {
                    insertAfter = child;
                }
            }

            userKeys.forEach((key) => {
                const escapedKey = this.escapeColumnKey(key);
                const child = container.querySelector(
                    `${selector}[data-key="${escapedKey}"]`,
                );

                if (child) {
                    container.insertBefore(
                        child,
                        insertAfter?.nextSibling || container.firstChild,
                    );
                    insertAfter = child;
                }
            });
        };

        moveKeyedChildren(table.querySelector('colgroup'), 'col');
        moveKeyedChildren(table.tHead?.rows?.[0], 'th');
        Array.from(table.tBodies || []).forEach((tbody) => {
            Array.from(tbody.rows || []).forEach((row) => {
                moveKeyedChildren(row, 'td');
            });
        });
    }

    applyColumnOrder(userKeys = [], frozenWidths = {}) {
        // Moving a column rearranges the columns the person can see, among the
        // places those columns already occupy. Numbering every draggable
        // column from ten upward instead renumbered the hidden ones too, and a
        // hidden column has no place on screen to be numbered from, so they
        // came out ahead of everything: a consumer dropped one column one place
        // to the left and found its nine visible columns pushed behind seven it
        // had never shown. Hidden columns keep their order, so they keep their
        // place between the visible ones when they are shown again.
        if (!Array.isArray(userKeys) || !userKeys.length) {
            return this;
        }

        const settingsPatch = {};
        const slots = this.getColumnOrderSlots(userKeys);

        userKeys.forEach((key, index) => {
            settingsPatch[key] = {
                order: slots[index],
            };

            if (frozenWidths?.[key]) {
                settingsPatch[key].width = frozenWidths[key];
            }
        });

        return this.patchColumnSettingsBatch(
            settingsPatch,
            'column-drag',
        );
    }

    // The places the moved columns already occupy, in order. A column whose
    // order nobody has ever set takes the place its position gives it, so a
    // first move on an untouched layout still numbers in tens.
    getColumnOrderSlots(userKeys = []) {
        const all = (this.getTableData().columns || []).filter((column) => column?.key && !column.system);
        const effective = (column, index) => {
            const setting = this.getColumnSetting(column.key) || {};
            const value = setting.order ?? column.order;
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : (index + 1) * 10;
        };
        const current = new Map(all.map((column, index) => [String(column.key), effective(column, index)]));
        const taken = userKeys
            .map((key) => current.get(String(key)))
            .filter((value) => Number.isFinite(value))
            .sort((left, right) => left - right);
        // Two columns can share a place when a host sends the same order twice.
        // Then the places are rebuilt from the positions, which cannot collide.
        const distinct = new Set(taken);
        if (taken.length !== userKeys.length || distinct.size !== taken.length) {
            return userKeys.map((_, index) => (index + 1) * 10);
        }

        return taken;
    }

    setColumnResizeClasses(th, delta = 0) {
        if (!th) return;

        th.classList.add('is-resizing');
        th.classList.toggle('is-resizing-forward', delta >= 0);
        th.classList.toggle('is-resizing-backward', delta < 0);
        // The line follows the edge while it is dragged, not only on hover.
        this.showColumnResizeGuide(th);
        // Resizing a pinned column moves every pinned column after it.
        this.measurePinnedColumns();
    }

    clearColumnResizeClasses(th) {
        if (!th) return;

        th.classList.remove(
            'is-resizing',
            'is-resizing-forward',
            'is-resizing-backward',
        );
        this.hideColumnResizeGuide();
        this.measurePinnedColumns();
    }

    bindContextEvent() {
        if (this._contextEventBound) {
            return;
        }

        document.addEventListener("click", this.contextEvent);
        document.addEventListener("keydown", this.contextKeyEvent);
        this._contextEventBound = true;
    }

    unbindContextEvent() {
        if (!this._contextEventBound) {
            return;
        }

        document.removeEventListener("click", this.contextEvent);
        document.removeEventListener("keydown", this.contextKeyEvent);
        this._contextEventBound = false;
    }

    contextKeyEvent(event) {
        if (event.key !== 'Escape' || !this.state.contextMenu?.open) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.closeContextMenu(true);
    }

    // The table's windows -- filter, field popovers, settings, menus -- are
    // drawn in the page's top layer from inside the table, not moved to the end
    // of the body. Moved out, a window was not clipped by the table's scroll
    // box, but it lost everything the table gives what it holds: its size (the
    // filter opened a step larger than a table at 1/2), its language, its theme,
    // the variables its containers set (owner, 2026-10-13). In the top layer it
    // stays where it belongs and is still drawn above everything, unclipped.
    //
    // The container is a form of its own, before the table's rendered content:
    // inside a page's form a filter field would be submitted with it and Enter
    // in one would send the page's form; and before the content, so a re-render
    // of the table never takes it away. Its fields' own change and input stop
    // at it: they are the table's business, not the page's.
    getPortalContainer() {
        if (this._portalContainer?.isConnected) {
            return this._portalContainer;
        }

        const portal = document.createElement("form");
        portal.className = "sf-table-portal";
        portal.noValidate = true;
        portal.dataset.tableSettingsKey = this.getTableSettingsKey();
        portal.dataset.sfInstance = this.getInstanceId();
        if (typeof portal.showPopover === "function") portal.setAttribute("popover", "manual");
        portal.addEventListener("submit", (event) => event.preventDefault());
        for (const type of ["change", "input"]) {
            portal.addEventListener(type, (event) => event.stopPropagation());
        }
        this.insertBefore(portal, this.firstChild);
        this._portalContainer = portal;

        return portal;
    }

    // The top layer is entered while a window is open and left when none is.
    showPortal() {
        const portal = this._portalContainer;
        if (!portal?.isConnected || typeof portal.showPopover !== "function") return;
        if (!portal.matches(":popover-open")) portal.showPopover();
    }

    hidePortal() {
        const portal = this._portalContainer;
        if (!portal?.isConnected || typeof portal.hidePopover !== "function") return;
        if (portal.matches(":popover-open")) portal.hidePopover();
    }

    getVisualViewportRect() {
        const viewport = window.visualViewport;

        return {
            left: viewport?.offsetLeft || 0,
            top: viewport?.offsetTop || 0,
            right: (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth),
            bottom: (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight),
        };
    }

    clampContextMenusToViewport() {
        const portal = this._portalContainer;

        if (!portal?.isConnected) {
            return;
        }

        const viewport = this.getVisualViewportRect();
        const rootStyle = getComputedStyle(document.documentElement);
        const inset = parseFloat(rootStyle.getPropertyValue('--sf-space-1/3')) || 0;

        const anchored = new Set();
        portal.querySelectorAll('sf-context-menu').forEach((menu) => {
            if (this.anchorContextMenu(menu, viewport, inset)) {
                anchored.add(menu);
                return;
            }
            const availableInlineSize = Math.max(
                0,
                viewport.right - viewport.left - inset * 2,
            );
            const availableBlockSize = Math.max(
                0,
                viewport.bottom - viewport.top - inset * 2,
            );
            // Both names: the stylesheet reads the second one, and only the
            // first was written here, so a menu placed by click coordinates
            // never received the cap this line means to give it.
            menu.style.setProperty(
                '--sf-table-context-menu--available-inline-size',
                `${availableInlineSize}px`,
            );
            menu.style.setProperty(
                '--sf-context-menu-available-inline-size',
                `${availableInlineSize}px`,
            );
            menu.style.setProperty(
                '--sf-context-menu-available-block-size',
                `${availableBlockSize}px`,
            );
            menu.style.translate = '';
            const surface = menu.querySelector(':scope > .sf-context-menu') || menu;
            const rect = surface.getBoundingClientRect();
            let offsetX = 0;
            let offsetY = 0;

            if (rect.left < viewport.left + inset) {
                offsetX = viewport.left + inset - rect.left;
            } else if (rect.right > viewport.right - inset) {
                offsetX = viewport.right - inset - rect.right;
            }

            if (rect.top < viewport.top + inset) {
                offsetY = viewport.top + inset - rect.top;
            } else if (rect.bottom > viewport.bottom - inset) {
                offsetY = viewport.bottom - inset - rect.bottom;
            }

            if (offsetX || offsetY) {
                menu.style.translate = `${offsetX}px ${offsetY}px`;
            }
        });
        for (const [menu, entry] of this._contextPositions || []) {
            if (!anchored.has(menu)) {
                entry.controller.stop();
                this._contextPositions.delete(menu);
            }
        }
    }

    // Placement of an open menu relative to the element it was opened from:
    // menus with a tail (row actions, template actions) open beside it, the
    // others below it. null keeps the static click-coordinate placement.
    // Cells re-render their controls, so an opener can be replaced while its
    // menu is open. Remember where it sits (row cell, header, toolbar id) to
    // find its replacement.
    describeContextAnchor(anchor) {
        if (!(anchor instanceof Element)) return null;
        const host = anchor.closest('[data-item], th[data-key], [id]');
        if (!host || !this.contains(host)) return null;
        const selector = host.dataset.item !== undefined
            ? `[data-item="${this.escapeColumnKey(host.dataset.item)}"]`
            : host.matches('th[data-key]')
                ? `th[data-key="${this.escapeColumnKey(host.dataset.key)}"]`
                : `[id="${this.escapeColumnKey(host.id)}"]`;
        const tag = anchor.tagName.toLowerCase();
        return {selector, tag, index: host === anchor ? -1 : Array.from(host.querySelectorAll(tag)).indexOf(anchor)};
    }

    resolveContextAnchor(data) {
        if (data?.anchor instanceof Element && data.anchor.isConnected) return data.anchor;
        const ref = data?.anchorRef;
        const host = ref ? this.querySelector(ref.selector) : null;
        const anchor = host && (ref.index < 0 ? host : host.querySelectorAll(ref.tag)[ref.index]);
        if (!anchor) return null;
        data.anchor = anchor;
        return anchor;
    }

    // Menus opened from a control at the end of a row align to that control's
    // end edge, so they open under the button instead of hanging past it over
    // the next column. The consumer measured a menu whose left edge matched the
    // button's left and whose right edge stood 34 to 124px beyond it.
    getContextMenuPlacement(menu) {
        const isSubmenu = menu.hasAttribute('data-context-submenu');
        const data = isSubmenu ? this.state.contextMenu?.submenu : this.state.contextMenu;
        const anchor = this.resolveContextAnchor(data);
        if (!anchor) return null;
        const position = String(data.position || (isSubmenu || data.type === 'left' ? 'left' : ''));
        const family = /^(left|right)(-top|-bottom)?$/.exec(position);
        if (!family) {
            // A menu belonging to a control at the end of its row aligns to that
            // control's end edge; otherwise it hangs past the button and over
            // whatever is beside it. The create arrow and the view's actions are
            // both such controls.
            const toTheEnd = ['create', 'toolbar-actions'].includes(data.menu);
            return {anchor, side: 'block-end', align: toTheEnd ? 'end' : 'start', tail: null};
        }
        const suffix = family[2] || '';
        return {
            anchor,
            side: family[1] === 'left' ? 'inline-end' : 'inline-start',
            align: suffix === '-top' ? 'start' : suffix === '-bottom' ? 'end' : 'center',
            tail: suffix,
        };
    }

    // Shared Framework geometry (SF.Position): the menu flips when its side
    // does not fit, shifts inside the viewport and follows its opener while
    // the page scrolls. Sizes are written to the rendered surface, not the
    // boxless host, so they never re-render the menu over this placement.
    anchorContextMenu(menu, viewport, inset) {
        const placement = this.getContextMenuPlacement(menu);
        if (!placement) return false;
        const surface = menu.querySelector(':scope > .sf-context-menu');
        if (!surface) return false;
        this._contextPositions = this._contextPositions || new Map();
        const current = this._contextPositions.get(menu);
        // SF.Position writes an inline max-width from the free space, which
        // would override the menu's stylesheet cap; keep that cap in the width.
        const cssCap = current?.cssCap ?? (parseFloat(getComputedStyle(surface).maxWidth) || Infinity);
        const inlineSize = `${Math.max(0, Math.min(viewport.right - viewport.left - inset * 2, cssCap))}px`;
        surface.style.setProperty('--sf-table-context-menu--available-inline-size', inlineSize);
        surface.style.setProperty('--sf-context-menu-available-inline-size', inlineSize);
        const key = `${placement.side}|${placement.align}`;
        if (current && current.anchor === placement.anchor && current.surface === surface && current.key === key) {
            current.controller.update();
            return true;
        }
        current?.controller.stop();
        surface.style.transform = 'none';
        surface.style.translate = 'none';
        surface.style.setProperty('--sf-context-menu-available-block-size', `${Math.max(0, viewport.bottom - viewport.top - inset * 2)}px`);
        const Position = positioning();
        const gap = placement.tail === null
            ? Position.resolveLength('calc(var(--sf-focus-outline-width) * 2)', surface)
            : Position.resolveLength('var(--sf-context-menu-tail-corner-offset)', surface);
        const anchorBox = placement.anchor.getBoundingClientRect();
        const controller = Position.anchor(placement.anchor, surface, {
            side: placement.side,
            align: placement.align,
            offset: gap,
            alignmentOffset: placement.align === 'center' || placement.tail === null
                ? 0
                : Math.max(0, anchorBox.height / 2 - gap),
            padding: inset,
            fitHeight: false,
            onPosition: ({side}) => {
                const box = placement.anchor.getBoundingClientRect();
                const view = this.getVisualViewportRect();
                const blockSize = side === 'block-end'
                    ? view.bottom - inset - box.bottom - gap
                    : side === 'block-start'
                        ? box.top - gap - inset - view.top
                        : view.bottom - view.top - inset * 2;
                const value = `${Math.max(0, Math.floor(blockSize))}px`;
                if (surface.style.getPropertyValue('--sf-context-menu-available-block-size') !== value) {
                    surface.style.setProperty('--sf-context-menu-available-block-size', value);
                }
                if (placement.tail !== null) {
                    const next = `${side === 'inline-end' ? 'left' : 'right'}${placement.tail}`;
                    if (menu.getAttribute('position') !== next) menu.setAttribute('position', next);
                }
            },
        });
        this._contextPositions.set(menu, {controller, anchor: placement.anchor, surface, key, cssCap});
        // The first placement is measured before the webfont has arrived, and
        // the cap written then is the cap of a narrower menu. The positioner
        // watches the box, but a font swap is cheap to wait for by name.
        document.fonts?.ready?.then(() => {
            if (this._contextPositions?.get(menu)?.controller === controller) controller.update();
        }).catch(() => {});
        return true;
    }

    stopContextMenuPositions() {
        for (const entry of this._contextPositions?.values() || []) entry.controller.stop();
        this._contextPositions?.clear();
    }

    contextViewportEvent() {
        requestAnimationFrame(() => this.clampContextMenusToViewport());
    }

    bindContextViewport() {
        if (this._contextViewportBound) {
            return;
        }

        window.addEventListener('resize', this.contextViewportEvent);
        window.visualViewport?.addEventListener('resize', this.contextViewportEvent);
        window.visualViewport?.addEventListener('scroll', this.contextViewportEvent);
        this._contextViewportBound = true;
    }

    unbindContextViewport() {
        if (!this._contextViewportBound) {
            return;
        }

        window.removeEventListener('resize', this.contextViewportEvent);
        window.visualViewport?.removeEventListener('resize', this.contextViewportEvent);
        window.visualViewport?.removeEventListener('scroll', this.contextViewportEvent);
        this._contextViewportBound = false;
    }


    openContextMenu(event, opts = {}) {
        this.closeContextMenu(false);
        this.contextTarget?.classList.remove("active");
        const target =
            event.currentTarget instanceof Element
                ? event.currentTarget
                : event.target instanceof Element
                  ? event.target
                  : null;

        if (!target) {
            return;
        }

        // Custom-element hosts use display:contents and have no positioning box.
        // Anchor to the native control on the event path within this opener.
        const nativeTarget = (event.composedPath?.() || [])
            .filter(node => node instanceof Element)
            .map(node => node.closest?.('button, input, select, textarea, a[href], [role="button"]'))
            .find(node => node && (node === target || target.contains(node)));
        // Without a native control (for example a clicked sf-tag), anchor to the
        // first rendered box inside the opener instead of its boxless host.
        const hasBox = (node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0;
        };
        const boxedTarget = nativeTarget || hasBox(target)
            ? target
            : Array.from((target.shadowRoot || target).querySelectorAll?.('*') || []).find(hasBox) || target;
        this.contextTarget = nativeTarget || boxedTarget;
        this.contextTarget.classList.add("active");
        // A chip opens its menu from the label button but anchors to the chip.
        let anchor = (opts.anchorSelector && this.contextTarget.closest?.(opts.anchorSelector)) || this.contextTarget;
        let pos = anchor.getBoundingClientRect();
        event.preventDefault();
        event.stopPropagation();
        let data = {
            open: true,
            id: this.contextTarget,
            ...opts
        }
        let tempData = {};
        switch (opts.type) {
            case 'left':
                tempData = {
                    x: pos.left + pos.width,
                    y: pos.y + pos.height / 2,
                }
                break;
            case 'bottom': {
                let parent = null;
                if (opts.parent) {
                    parent = getParent(event.target);
                    pos = parent.getBoundingClientRect();
                    anchor = parent;
                }
                tempData = {
                    x: pos.left,
                    y: pos.y + pos.height,
                }
                break;
            }
            default:
                tempData = {
                    x: pos.left,
                    y: pos.y + pos.height,
                }
        }
        data = {
            ...data,
            ...tempData,
            anchor,
            anchorRef: this.describeContextAnchor(anchor),
        }
        // What «Сбросить» returns to in the column settings window: the settings
        // as they stood when it was opened. Everything in that window applies on
        // the spot now, so without this there is nothing to go back to.
        if (data.menu === 'table-settings') {
            this._columnSettingsOnOpen = JSON.parse(JSON.stringify(this.getColumnSettings() || {}));
        }
        this.set({
            contextMenu: {...data}
        });
    }

    // The element to anchor to: the native control the event passed through,
    // else the first box inside the opener, else the opener itself. A Framework
    // control's host element is display:contents and has no box of its own.
    resolveBoxedAnchor(event, target) {
        if (!(target instanceof Element)) return target;
        const hasBox = (node) => {
            const rect = node?.getBoundingClientRect?.();
            return Boolean(rect) && (rect.width > 0 || rect.height > 0);
        };
        const native = (event?.composedPath?.() || [])
            .filter((node) => node instanceof Element)
            .map((node) => node.closest?.('button, input, select, textarea, a[href], [role="button"]'))
            .find((node) => node && (node === target || target.contains(node)));
        if (native && hasBox(native)) return native;
        if (hasBox(target)) return target;
        const inside = Array.from((target.shadowRoot || target).querySelectorAll?.('*') || []).find(hasBox);
        return inside || target;
    }

    // A context menu renders Framework elements, and a page may open one before
    // their modules have arrived -- the consumer saw a template row with its
    // handle and its menu but no radio and no name, and the window's tabs
    // rendering as one list, because sf-radio and sf-tabs were not upgraded yet.
    // Nothing redrew when they were. This asks once per element and redraws when
    // it is defined; an element already defined costs nothing.
    redrawWhenComponentsUpgrade(root = this) {
        if (!root?.querySelectorAll) return this;
        this._awaitedComponents = this._awaitedComponents || new Set();
        const names = new Set(
            Array.from(root.querySelectorAll('*'))
                .map((node) => node.tagName.toLowerCase())
                .filter((name) => name.includes('-') && !customElements.get(name)),
        );
        for (const name of names) {
            if (this._awaitedComponents.has(name)) continue;
            this._awaitedComponents.add(name);
            customElements.whenDefined(name).then(() => {
                this.requestComponentUpdate('component-upgrade');
            }).catch(() => {});
        }

        return this;
    }

    openContextSubmenu(event, opts = {}) {
        event.preventDefault();
        event.stopPropagation();

        const target = event.target instanceof Element ? event.target : null;
        const anchorTarget =
            event.currentTarget instanceof Element ? event.currentTarget : target;

        if (!anchorTarget) {
            return;
        }

        // The opener is usually an sf-icon-button, whose host is display:contents
        // and has no box at all: anchoring to it put the menu at the top left of
        // the viewport, which the clamp then pushed to the window's edge -- the
        // consumer saw it open far from its button, over the admin menu. The
        // native control on the event path is the thing with a box.
        const boxed = this.resolveBoxedAnchor(event, anchorTarget);
        const rect = boxed.getBoundingClientRect();
        const anchorKey =
            opts.anchorKey ||
            opts.template?.key ||
            anchorTarget.dataset?.contextSubmenuAnchor ||
            "";

        if (
            anchorKey &&
            this.state.contextMenu?.submenu?.open &&
            this.state.contextMenu.submenu.anchorKey === anchorKey
        ) {
            this.closeContextSubmenu();
            return;
        }

        const data = {
            open: true,
            type: opts.type,
            anchorKey,
            x: rect.left + rect.width,
            y: rect.y + rect.height / 2,
            position: opts.position || 'left',
            transform: -50,
            ...opts,
            anchor: boxed,
            anchorRef: this.describeContextAnchor(boxed),
        };

        this.set((state) => ({
            contextMenu: {
                ...(state.contextMenu || {}),
                submenu: data,
            },
        }));
    }

    handleContextLayerClick(event) {
        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        if (target.closest("[data-context-submenu]")) {
            return;
        }

        if (target.closest("[data-context-submenu-anchor]")) {
            return;
        }

        if (
            this.state.contextMenu?.submenu?.open &&
            !target.closest("[data-context-main-menu]")
        ) {
            this.closeContextSubmenu();
        }
    }

    closeContextSubmenu() {
        this.set((state) => ({
            contextMenu: {
                ...(state.contextMenu || {}),
                submenu: null,
            },
        }));
    }

    // Every element the table draws goes through here -- its own controls,
    // the row menus, the select boxes, a host's row actions -- and each was
    // written for the ladder's step 1. A table at another step draws them at
    // its own: a size of 1 becomes the table's. An element that names no size
    // keeps its own default -- a badge's is 1/3, a tag's 1/2 -- which a table at
    // a smaller step would otherwise have grown.
    // A value in a cell that is only shown -- a badge, a tag, an avatar -- is
    // drawn as its component's own markup, from a detached instance of the
    // component, instead of as an element of its own (owner, 2026-10-15: a
    // page of rows held four hundred elements, each rendering itself, and a
    // sort built them all). The classes, so the look, are the component's;
    // anything interactive, or a component not defined yet, stays an element.
    renderCellElement(type, props = {}) {
        const tag = `sf-${String(type ?? "").replace(/^sf-/u, "")}`;
        const shown = LIGHT_CELL_TAGS.has(tag)
            && props.interactive !== true && props.closable !== true && props.type !== "checkbox"
            && !Object.keys(props).some((key) => key.startsWith("@") || /^on[A-Z]/u.test(key));
        const Element = shown ? customElements.get(tag) : null;
        if (!Element) return this.renderSmartElement(type, props);
        this._lightCells ??= new Map();
        let element = this._lightCells.get(tag);
        if (!element) {
            element = document.createElement(tag);
            this._lightCells.set(tag, element);
        }
        if (typeof element.template !== "function") return this.renderSmartElement(type, props);
        for (const name of [...element.getAttributeNames()]) element.removeAttribute(name);
        const size = this.size !== "1" && String(props.size) === "1" ? this.size : props.size;
        for (const [key, value] of Object.entries({...props, ...(size !== undefined ? {size} : {})})) {
            if (value === undefined || value === null || value === false) continue;
            const attribute = key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
            if (typeof value === "object" || typeof value === "function") element[key] = value;
            else element.setAttribute(attribute, value === true ? "" : String(value));
        }
        try {
            return element.template();
        } catch {
            return this.renderSmartElement(type, props);
        }
    }

    renderSmartElement(type, props = {}) {
        const size = this.size;
        if (size !== "1" && props && String(props.size) === "1") {
            return super.renderSmartElement(type, {...props, size});
        }
        return super.renderSmartElement(type, props);
    }

    get size() {
        return this.getEnumAttr("size", ["1/2", "1"], "1");
    }

    getSelectColumn() {
        return {
            ...this.TABLE_SELECT_COLUMN,
            component: {
                ...this.TABLE_SELECT_COLUMN.component,
                props: {
                    ...(this.TABLE_SELECT_COLUMN.component?.props || {}),
                    checked: Boolean(this.state?.settingsChecked),
                    indeterminate: Boolean(this.state?.selectIndeterminate),
                },
            },
        };
    }

    getColumns() {
        const dataColumns = this.getTableData().columns || [];
        const systemColumns = this.getSystemColumns();
        const systemKeys = new Set(systemColumns.map((column) => column.key));
        const rightSystemKeys = new Set(['actions']);
        const originalIndexByKey = new Map(
            dataColumns.map((column, index) => [column?.key, index]),
        );
        const userColumns = dataColumns
            .filter((column) => column?.key && !systemKeys.has(column.key))
            .map((column) => {
                const settings = this.getColumnSetting(column.key);
                const nextColumn = {
                    ...column,
                    ...settings,
                };

                if (settings.width) {
                    nextColumn.colWidth = settings.width;
                }

                return nextColumn;
            })
            .sort((left, right) => {
                const getOrder = (column) => {
                    const order = column?.order;

                    return order !== null &&
                    typeof order !== "undefined" &&
                    order !== "" &&
                    Number.isFinite(Number(order))
                        ? Number(order)
                        : originalIndexByKey.get(column?.key) ?? 0;
                };
                const leftOrder =
                    getOrder(left);
                const rightOrder =
                    getOrder(right);

                if (leftOrder === rightOrder) {
                    return (
                        (originalIndexByKey.get(left.key) ?? 0) -
                        (originalIndexByKey.get(right.key) ?? 0)
                    );
                }

                return leftOrder - rightOrder;
            });
        const leftSystemColumns = systemColumns.filter(
            (column) => !rightSystemKeys.has(column?.key),
        );
        const rightSystemColumns = systemColumns.filter((column) =>
            rightSystemKeys.has(column?.key),
        );

        // Pinned columns stand right after the box and the row menu, each group
        // in its own order. The partition is stable, so pinning changes which
        // group a column is in and nothing else about where it sits.
        const pinnedUserColumns = userColumns.filter((column) => this.isColumnPinned(column));
        const looseUserColumns = userColumns.filter((column) => !this.isColumnPinned(column));
        const columns = [
            ...leftSystemColumns,
            ...pinnedUserColumns,
            ...looseUserColumns,
            ...rightSystemColumns,
        ].filter((column) => column?.visible !== false);
        const width = this._responsiveWidth || this.clientWidth || 0;
        // The list chooses its own fields by priority and wants every column to
        // choose from; dropping columns that do not fit is the table's answer.
        if (this.isList || !width || !userColumns.some((column) => column.priority !== undefined)) return columns;
        const columnWidth = (column) => {
            const value = column.min_width ?? column.minWidth ?? column.width;
            const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
            return Number.isFinite(parsed) && parsed > 0 ? parsed : (column.system ? 48 : 160);
        };
        const retained = new Set(columns);
        let needed = columns.reduce((sum, column) => sum + columnWidth(column), 0);
        const removable = userColumns.filter((column) => column.visible !== false)
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        for (const column of removable) {
            if (needed <= width || retained.size <= systemColumns.length + 1) break;
            retained.delete(column);
            needed -= columnWidth(column);
        }
        return columns.filter((column) => retained.has(column));
    }

    // The columns that stay in place while the rows scroll sideways: the box,
    // the row menu, and the column the host marked as the record's title. The
    // host declares the title with `role: "title"` on the column rather than
    // the table guessing the first text column — a guess breaks on a page whose
    // first column is an icon or a flag, and the host already knows which
    // column leads the record.
    // Whether a column is pinned. The person decides, through the toggle in the
    // column settings, and the answer is stored beside the order and the width;
    // the column the host marked as the record's title starts pinned, because
    // that is the column a reader names a row by. The box and the row menu are
    // always pinned and are not offered a toggle.
    isColumnPinned(column) {
        if (!column?.key) return false;
        if (column.key === "select" || column.key === "settings") return true;
        if (column.system) return false;
        const pending = this.tempSettings?.cols?.[column.key];
        const setting = this.getColumnSetting(column.key) || {};
        const chosen = pending?.pinned ?? setting.pinned ?? column.pinned;
        if (typeof chosen === "boolean") return chosen;

        return column.role === "title";
    }

    getPinnedColumnKeys(columns = this.getColumns()) {
        return columns
            .filter((column) => column?.key && this.isColumnPinned(column))
            .map((column) => column.key);
    }

    isPinnedColumn(column) {
        if (!column?.key) return false;
        if (["start", "end"].includes(column.sticky)) return true;
        return this.isColumnPinned(column);
    }

    // A pinned cell's offset is read from the page, not from the declared
    // widths. The box and the row menu declare their widths as `calc()` over
    // tokens, which no arithmetic here can resolve, and a column the person has
    // resized no longer has the width its description names. The measured
    // offsets are published as custom properties, so the cells themselves only
    // ever name a property.
    getStickyCellStyle(columns, index) {
        const column = columns[index];
        const pinned = this.isPinnedColumn(column);
        if (!pinned) return "";
        const side = ["start", "end"].includes(column.sticky) ? column.sticky : "start";
        // Only the placing is inline. The colour is a rule, because a pinned
        // cell has to carry the colour of the row it is in: painting it here
        // beat every row state and left the pinned columns white under a
        // selected or hovered row.
        return `position: sticky; inset-inline-${side}: var(--sf-table-pin-${column.key}, 0px); z-index: 2;`;
    }

    measurePinnedColumns() {
        const table = this.refs.table?.value;
        const scroll = this.refs.scroll?.value;
        if (!table) return this;
        const keys = this.getPinnedColumnKeys();
        const head = table.querySelector("thead tr");
        let offset = 0;
        for (const key of keys) {
            table.style.setProperty(`--sf-table-pin-${key}`, `${Math.round(offset)}px`);
            const cell = head?.querySelector(`th[data-key="${key}"]`);
            offset += cell ? cell.getBoundingClientRect().width : 0;
        }
        const last = keys[keys.length - 1];
        for (const cell of table.querySelectorAll("[data-sf-pin-edge]")) {
            cell.removeAttribute("data-sf-pin-edge");
        }
        if (last) {
            for (const cell of table.querySelectorAll(`[data-key="${last}"]`)) {
                cell.setAttribute("data-sf-pin-edge", "");
            }
        }
        // The shadow only means something once something is hidden behind the
        // pinned block, so it follows the scroll position. In a right-to-left
        // table the browser reports that position as a negative number.
        if (scroll) {
            const scrolled = Math.abs(scroll.scrollLeft) > 0;
            if (scrolled) scroll.setAttribute("data-sf-pin-scrolled", "");
            else scroll.removeAttribute("data-sf-pin-scrolled");
        }
        return this;
    }

    bindPinnedColumnScroll() {
        const scroll = this.refs.scroll?.value;
        if (!scroll || this._pinnedScrollBound === scroll) return this;
        this._pinnedScrollBound = scroll;
        scroll.addEventListener("scroll", () => this.measurePinnedColumns(), {passive: true});
        return this;
    }

    // A row's select box has no visible label: the row is the label. A reader
    // moving through the column hears each box by the row's first data cell,
    // instead of a run of unnamed checkboxes it cannot tell apart.
    getRowSelectLabel(row) {
        const batch = this._labelColumnBatch;
        const column = batch && "column" in batch
            ? batch.column
            : this.getColumnItems().find((item) => item?.key && !item.system && item.key !== "select" && item.key !== "settings");
        if (batch) batch.column = column;
        const raw = column ? row?.[column.key] : undefined;
        const value = raw !== null && typeof raw === "object" ? (raw.text ?? raw.label ?? raw.value ?? "") : raw;
        const text = String(value ?? "").trim() || String(row?.id ?? "").trim();
        return text ? `${this.text("selectRowLabel")}: ${text}` : this.text("selectRowLabel");
    }

    createRowComponentCell(component, props = {}) {
        if (!component?.type) {
            return null;
        }

        return {
            component: {
                type: component.type,
                props: {
                    ...(component.props || {}),
                    ...props,
                },
            },
        };
    }

    // The row's menu is the Framework's standard menu (owner, 2026-10-12): it
    // opens below its button and start-aligned, in the top layer, and a group
    // of the host's row_actions is a real submenu rather than a second menu
    // swapped in over the first. What a choice does is unchanged -- an intent
    // for the row, or the action's own handler where it has one.
    async openRowMenu(event, row = {}) {
        const anchor = event?.currentTarget?.querySelector?.("button")
            ?? event?.target?.closest?.("button")
            ?? event?.currentTarget;
        if (!(anchor instanceof Element)) return null;
        const selection = Array.isArray(row.actions) && row.actions.every((item) => typeof item === "string")
            ? row.actions
            : null;
        const items = this.getActionRowItems(row);
        const iconOf = (action) => action?.icon ?? action?.component?.props?.icon ?? undefined;
        const entries = items.map((action) => (Array.isArray(action.members)
            ? {
                id: action.id, text: action.name, icon: iconOf(action),
                submenu: action.members
                    .filter((member) => !selection || selection.includes(member.id))
                    .map((member) => ({id: member.id, text: member.name, icon: iconOf(member), danger: member.danger === true})),
            }
            : {id: action.id, text: action.name, icon: iconOf(action), danger: action.danger === true}));
        // The standard menu is a lazy relation of the table: fetched after the
        // page is ready, and asked for here if a press comes first.
        if (!customElements.get("sf-context-menu")) {
            globalThis.SF?.Loader?.ensurePlugin?.("cl-context-menu");
            await Promise.race([customElements.whenDefined("sf-context-menu"), new Promise((settle) => setTimeout(settle, 3000))]);
        }
        const menu = this.rowMenu();
        menu.setAttribute("aria-label", this.getContextMenuLabel({row, menu: "row-settings"}));
        menu.entries = entries;
        this._rowMenuContext = {row, items, anchor};
        return menu.toggleFor(anchor);
    }

    rowMenu() {
        if (this._rowMenu?.isConnected) return this._rowMenu;
        const menu = document.createElement("sf-context-menu");
        menu.setAttribute("popup", "");
        menu.dataset.sfTableMenu = "row";
        menu.addEventListener("sf-context-menu-select", (event) => {
            const context = this._rowMenuContext;
            if (!context) return;
            const id = event.detail?.id;
            const {row, items, anchor} = context;
            const action = items.find((item) => item.id === id);
            const member = action ? null : items.flatMap((item) => item.members ?? []).find((item) => item.id === id);
            if (member) {
                this.requestActionIntent(member.id, [row.id]);
                return;
            }
            const handler = action?.component?.props?.["@click"] ?? action?.component?.props?.onClick;
            if (typeof handler === "function") handler({currentTarget: anchor, target: anchor, preventDefault() {}, stopPropagation() {}});
            else if (action) this.requestActionIntent(action.id, [row.id]);
        });
        (this.closest("dialog[open]") || document.body).append(menu);
        this._rowMenu = menu;
        return menu;
    }

    // Which of the table's actions this row offers, and in what shape.
    //
    // `row.actions` is read twice over a row's life and means two things. From
    // a host it is ids -- `["view"]`, the data view port's word for which
    // actions apply to this record -- and that is what selects from the table's
    // own list. Once the cell is built it holds the built items, and the
    // template calls this again with them, so the filter was asking whether an
    // array of objects includes a string. It never does: every action was
    // filtered out and the «Действия» column drew an empty container in every
    // row of every list, page lists included. A consumer reported it on an
    // embedded one, which is only where they happened to be looking (owner,
    // 2026-10-09).
    //
    // Ids select. Anything else is already the selection and is not filtered
    // again.
    // The same items for the same row, so a render finds the elements it made
    // last time rather than new ones.
    //
    // A re-query brings new row objects for the same records, so a cache held
    // on the row produced new items every time and lit rebuilt every actions
    // cell -- which is exactly what tests/browser/table-round-3 exists to
    // refuse: it used to tear every cell out and build it again, and the
    // control a person was using went with them. The key is what the cell
    // actually depends on: the row, the ids it offers, and the list those ids
    // select from (owner, 2026-10-09).
    rowActionItems(row = {}) {
        const ids = Array.isArray(row?.actions)
            && row.actions.every((item) => typeof item === "string")
            ? row.actions.join(",")
            : "*";
        const list = this.ACTIONS_SETTINGS_ROW ?? [];
        const listKey = list.map((action) => action?.id ?? "").join(",");
        if (this._rowActionListKey !== listKey) {
            this._rowActionListKey = listKey;
            this._rowActionItems = new Map();
        }
        const key = `${row?.id ?? ""}|${ids}`;
        if (!this._rowActionItems) this._rowActionItems = new Map();
        if (!this._rowActionItems.has(key)) {
            this._rowActionItems.set(key, this.getActionRowItems(row));
        }
        return this._rowActionItems.get(key);
    }

    getActionRowItems(row = {}, actions = this.ACTIONS_SETTINGS_ROW) {
        const selection = Array.isArray(row.actions)
            && row.actions.every((item) => typeof item === "string")
            ? row.actions
            : null;
        // A group (the host's row_actions, port 1.8.0) is offered when the
        // record allows any of its members, and opens a submenu of exactly
        // those: «Опубликовать › ru» on a row drafted in ru, not in en.
        const allowedMembers = (action) => (action.members || [])
            .filter((member) => !selection || selection.includes(member.id));
        return actions.filter((action) => (Array.isArray(action.members)
            ? allowedMembers(action).length > 0
            : !selection || selection.includes(action.id))).map((action) => {
            if (Array.isArray(action.members)) {
                const members = allowedMembers(action);
                const props = {...(action.component?.props || {})};
                props["@click"] = (event) => this.openContextMenu(event, {
                    type: "left", row, action, menu: "row-settings",
                    items: members.map((member) => ({
                        component: "sf-button",
                        props: {
                            appearance: "link",
                            scheme: member.danger ? "error" : "on-surface",
                            text: member.name,
                            "@click": () => {
                                this.requestActionIntent(member.id, [row.id]);
                                this.closeContextMenu();
                            },
                        },
                    })),
                });
                return {...action, component: {...(action.component || {}), props}};
            }
            const component = action.component || {};
            const props = {
                ...(action.props || {}),
                ...(component.props || {}),
            };
            const menu = action.menu || props.menu;
            const hasClickHandler =
                typeof props["@click"] === "function" ||
                typeof props.onClick === "function";

            if (menu && !hasClickHandler) {
                props["@click"] = (event) => {
                    const menuOptions =
                        menu && typeof menu === "object"
                            ? menu
                            : {menu};

                    this.openContextMenu(event, {
                        type: "left",
                        row,
                        action,
                        ...menuOptions,
                    });
                };
            } else if (!hasClickHandler) {
                props["@click"] = () => this.requestActionIntent(action.id, [row.id]);
            }

            return {
                ...action,
                component: {
                    ...component,
                    props,
                },
            };
        });
    }

    getDefaultRowCell(column, row) {
        if (!column?.key) {
            return null;
        }
        if (column.key === "select") {
            return this.createRowComponentCell(column.rowComponent, {
                checked: this.state.settingsChecked ? true : Boolean(row?.selected || row?.checked),
                value: row?.id ?? row?.value ?? "",
                ariaLabel: this.getRowSelectLabel(row),
                "@change": (event) => {
                    this.applyRowSelection(row.id, Boolean(event.target.checked), {
                        range: this._selectRangeModifier === true,
                    });
                },
            });
        }

        if (column.key === "settings") {
            return this.createRowComponentCell(column.rowComponent || {
                type: "icon-button",
                props: {
                    size: "1",
                    appearance: "link",
                    scheme: "on-surface",
                    icon: "menu",
                    ariaLabel: this.text("menuLabel"),
                    value: "menu",
                    "@click": (e) => this.openRowMenu(e, row),
                },
            });
        }
        if (column.key === 'actions') {
            return this.getActionRowItems(row);
        }

        return null;
    }

    normalizeRow(row = {}, systemColumns = this.getSystemColumns()) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
            return row;
        }
        // A row that already carries its system cells is kept as it is: a
        // change of one row copies that row alone, not the ten thousand others
        // (standard 1.3.8 §18.4, gate 17 «one entry changed»).
        if (systemColumns.every((column) => !column?.key || column.visible === false || typeof row[column.key] !== "undefined")) {
            return row;
        }

        const nextRow = {...row};

        systemColumns.forEach((column) => {

            if (!column?.key || typeof nextRow[column.key] !== "undefined" || column.visible === false) {
                return;
            }

            const cell = this.getDefaultRowCell(column, nextRow);
            if (cell) {
                nextRow[column.key] = cell;
            }
        });

        return nextRow;
    }

    // The system columns and the column a box is named by are read once for
    // the whole list, not once per row: ten thousand rows asked for them ten
    // thousand times (simai/ui-pro#2).
    normalizeRows(rows = []) {
        if (!Array.isArray(rows)) return [];
        const systemColumns = this.getSystemColumns();
        this._labelColumnBatch = {};
        try {
            return rows.map((row) => this.normalizeRow(row, systemColumns));
        } finally {
            this._labelColumnBatch = null;
        }
    }

    setTableData(patch = {}, reason = "data") {
        const currentData = this.getTableData();
        const nextPatch =
            typeof patch === "function" ? patch(currentData) : patch;

        if (!nextPatch || typeof nextPatch !== "object") {
            return this;
        }

        const result = this.set(
            {
                data: {
                    ...currentData,
                    ...nextPatch,
                },
            },
            reason,
        );
        this.syncSelectionPort();
        // New rows are new selection: a tree that redrew its rows after a bulk
        // write left the page box half-ticked over rows none of which were.
        if (Object.prototype.hasOwnProperty.call(nextPatch, "rows")) this.syncSelectAllState();
        return result;
    }

    setColumns(columns = [], reason = "columns") {
        const currentColumns = this.getTableData().columns || [];
        const nextColumns =
            typeof columns === "function" ? columns(currentColumns) : columns;

        const result = this.setTableData(
            {
                columns: Array.isArray(nextColumns) ? nextColumns : [],
            },
            reason,
        );
        if (this.rememberedWidthsKey) this.restoreRememberedWidths();
        return result;
    }

    addColumns(columns = []) {
        const nextColumns = Array.isArray(columns) ? columns : [columns];

        return this.setColumns((currentColumns) => [
            ...currentColumns,
            ...nextColumns.filter(Boolean),
        ]);
    }

    updateColumn(columnKey, patch = {}, reason = "columns") {
        if (!columnKey) {
            return this;
        }

        return this.setColumns(
            (columns) =>
                columns.map((column, index) => {
                    if (!column || column.key !== columnKey) {
                        return column;
                    }

                    const nextPatch =
                        typeof patch === "function" ? patch(column, index) : patch;

                    return {
                        ...column,
                        ...(nextPatch || {}),
                    };
                }),
            reason,
        );
    }

    setRows(rows = [], reason = "rows") {
        const currentRows = this.getTableData().rows || [];
        const nextRows = typeof rows === "function" ? rows(currentRows) : rows;
        return this.setTableData(
            {
                rows: this.normalizeRows(nextRows),
            },
            reason,
        );
    }

    addRows(rows = [], reason = "rows") {
        if (this.isActionParameters?.(rows, ["rows"])) rows = rows.rows ?? [];
        const nextRows = Array.isArray(rows) ? rows : [rows];

        this.setRows((currentRows) => [
            ...currentRows,
            ...nextRows.filter(Boolean),
        ], reason);
        return {outcome: "applied"};
    }

    updateRowsByKey(key, value, patch = {}, reason = "rows") {
        if (!key) {
            return this;
        }

        const patchRow = typeof patch === "function"
            ? patch
            : (row) => ({
                ...row,
                ...(patch || {}),
            });

        return this.setRows((rows) =>
                rows.map((row, index) => {
                    if (!row || row[key] !== value) {
                        return row;
                    }

                    const nextRow = patchRow(row, index);

                    return nextRow && typeof nextRow === "object" ? nextRow : row;
                }),
            reason,
        );
    }

    // One entry changed: that row is drawn again in place, and the widths
    // measured from the content are kept (standard 1.3.8 §18.4, gate 17 «one
    // entry changed ≤ 50 ms whatever the count»).
    updateRowByKey(key, value, patch = {}, reason = "row") {
        this._entryOnly = true;
        return this.updateRowsByKey(key, value, patch, reason);
    }

    updateRows(patch = {}, reason = "rows") {
        const patchRow = typeof patch === "function"
            ? patch
            : (row) => ({
                ...row,
                ...(patch || {}),
            });

        return this.setRows((rows) =>
                rows.map((row, index) => {
                    const nextRow = patchRow(row, index);

                    return nextRow && typeof nextRow === "object" ? nextRow : row;
                }),
            reason,
        );
    }

    updateRowCell(rowKey, rowValue, cellKey, patch = {}, reason = "cell") {
        if (!cellKey) {
            return this;
        }

        return this.updateRowsByKey(
            rowKey,
            rowValue,
            (row) => {
                const currentCell =
                    row && row[cellKey] && typeof row[cellKey] === "object"
                        ? row[cellKey]
                        : {};
                const nextCellPatch =
                    typeof patch === "function" ? patch(currentCell, row) : patch;

                return {
                    ...row,
                    [cellKey]: {
                        ...currentCell,
                        ...(nextCellPatch || {}),
                    },
                };
            },
            reason,
        );
    }

    updateRowCellProps(rowKey, rowValue, cellKey, props = {}, reason = "cell-props") {
        return this.updateRowCell(
            rowKey,
            rowValue,
            cellKey,
            (cell) => ({
                component: {
                    ...(cell.component || {}),
                    props: {
                        ...(cell.component?.props || {}),
                        ...(typeof props === "function"
                            ? props(cell.component?.props || {}, cell)
                            : props || {}),
                    },
                },
            }),
            reason,
        );
    }

    closeContextMenu(restoreFocus = true) {
        const trigger = this.contextTarget;
        this.set({
            contextMenu: {
                open: false,
            }
        });
        this.stopContextMenuPositions();
        render(null, this.getPortalContainer());
        this.hidePortal();
        if (this.refs.contextMenu) {
            this.refs.contextMenu.value = null;
        }
        this.unbindContextEvent();
        this.unbindContextViewport();
        this.contextTarget?.classList.remove("active");
        this.contextTarget = null;

        if (restoreFocus && trigger?.isConnected && typeof trigger.focus === 'function') {
            requestAnimationFrame(() => trigger.focus());
        }
    }

    get templateName() {
        return this.getAttribute("template") || "default";
    }

    // The vocabulary's data state is `ready`; `populated` is read as its
    // alias (standard 1.3.8 gate 26), and the template keeps drawing it.
    get dataState() {
        const state = this.getEnumAttr(
            'data-state',
            ['loading', 'ready', 'populated', 'empty', 'error'],
            'auto',
        );
        return state === 'ready' ? 'populated' : state;
    }

    setDataState(state = 'auto') {
        const named = state === 'ready' ? 'populated' : state;
        const normalized = ['loading', 'populated', 'empty', 'error'].includes(named)
            ? named
            : 'auto';

        if (normalized === 'auto') {
            this.removeAttribute('data-state');
        } else {
            this.setAttribute('data-state', normalized);
        }

        return this;
    }

    requestRetry() {
        this.emitTableEvent('refresh', {});
        return {outcome: "applied"};
    }

    // Why there are no rows, as a data view knows it: {kind: 'no-access' |
    // 'nothing-found' | 'no-data', reset: 'search' | 'filters' | 'both',
    // headingLevel, message}. `message` is the host's own sentence for a list
    // it refused or could not give; it is the brick's title, drawn as text. A table on its own knows only no data and could not load.
    get emptyContext() {
        return this._emptyContext;
    }

    set emptyContext(value) {
        this._emptyContext = value && typeof value === "object" ? {...value} : null;
        this.requestComponentUpdate("empty-context");
    }

    // What «Сбросить поиск и фильтры» does: the table's own search and filter
    // are emptied, and each says so the way a person's edit would.
    resetQuery(scope = "both") {
        if (scope !== "search") this.removeFilterTag();
        if (scope !== "filters") {
            this.clearSearchDebounce();
            this._searchPendingProps = null;
            // A search the table did not hold (the view's own, or a host's) is
            // still cleared: the event goes either way.
            if (this.state.search?.value) this.updateSearchState({value: ""});
            else this.emitTableEvent("search-change", {search: ""});
        }
        return this;
    }

    // The brick for a table without rows: its reason, its words and its one
    // action. The host's empty-text and error-text are the titles they always
    // were; the rest are the brick's own words in the page language.
    emptyBrick(dataState) {
        const context = this._emptyContext ?? {};
        const size = this.size === "1/2" ? "1/2" : "1";
        const headingLevel = String(context.headingLevel ?? 3);
        const message = typeof context.message === "string" ? context.message.trim() : "";
        if (dataState === "error") {
            return {kind: "error", size, headingLevel, title: message || this.getAttribute("error-text") || "", text: "", live: context.caused ? "alert" : "auto",
                actions: [{id: "retry", text: this.text("retryText", "retry-text"), appearance: "outline"}]};
        }
        const kind = ["no-access", "nothing-found"].includes(context.kind) ? context.kind : "no-data";
        if (kind === "no-access") return {kind, size, headingLevel, title: message, text: "", actions: []};
        if (kind === "nothing-found") {
            const key = {search: "resetSearchText", filters: "resetFiltersText"}[context.reset] ?? "resetBothText";
            return {kind, size, headingLevel, title: "", text: "",
                actions: [{id: "reset-query", text: this.text(key), appearance: "outline"}]};
        }
        const creatable = this.getBooleanAttr("actions", true) && this.getBooleanAttr("creatable", true);
        return {kind, size, headingLevel, title: this.getAttribute("empty-text") || "", text: "",
            actions: creatable ? [{id: "create", text: this.text("createText", "create-text")}] : []};
    }

    disconnectedCallback() {
        this.unbindWindowScroll();
        // The row menu lives beside the page, not inside the table: it goes
        // with the table that made it.
        this._rowMenu?.close?.({restoreFocus: false});
        this._rowMenu?.remove();
        this._rowMenu = null;
        for (const page of this._filterOptionPages.values()) {
            page.controller?.abort();
            clearTimeout(page.searchTimer);
        }
        this._filterOptionPages.clear();
        this._responsiveObserver?.disconnect();
        this._responsiveObserver = null;
        this._responsiveWidth = 0;
        this._preferenceUnsubscribe?.();
        this._preferenceUnsubscribe = null;
        this._preferenceKeyBound = undefined;
        this._rowActionsAbort?.abort();
        this._rowActionsAbort = null;
        this._rowActionsTable = null;
        this.unbindPageScroll();
        this._lateLayoutAbort?.abort();
        this._lateLayoutAbort = null;
        cancelAnimationFrame(this._lateLayoutFrame ?? 0);
        this._lateLayoutFrame = 0;
        this.clearSearchDebounce();
        this._searchPendingProps = null;
        this._searchHoldKey = '';
        this.stopContextMenuPositions();
        this.unbindContextEvent();
        this.unbindContextViewport();
        this.unBindHoverEvent();
        this.unbindColumnResizeEvent();
        this.unbindColumnDragEvent();
        this.tempSettings = null;
        this._selectionPortKey = "[]";
        // A removed table abandons its pending answer; a remount asks again.
        this._abandonedQuery = this._pendingQuerySequence !== null;
        this._pendingQuerySequence = null;
        this.state.contextMenu = {open: false};
        this.state.settingsChecked = false;
        this.state.selectIndeterminate = false;
        const data = this.getTableData();
        this.state.data = {...data, rows: data.rows.map((row) => ({
            ...row,
            selected: false,
            checked: false,
            ...(row.select?.component ? {select: {
                ...row.select,
                component: {...row.select.component, props: {
                    ...row.select.component.props, checked: false,
                }},
            }} : {}),
        }))};
        if (this.refs.contextMenu) {
            this.refs.contextMenu.value = null;
        }
        this.contextTarget?.classList?.remove('active');
        this.contextTarget = null;
        if (this._portalContainer) {
            render(null, this._portalContainer);
            this._portalContainer.remove();
            this._portalContainer = null;
        }
        super.disconnectedCallback();
    }

    /**
     * One of this table's words, in the page's language. An attribute wins over
     * both languages, because a consumer who names a word has named it.
     *
     * The declared default is the English one, so a component read through its
     * props alone still says something sensible; the context below overrides
     * every text key with this, which is what makes the Russian reachable. A
     * key left out of that override would quietly fall back to English on a
     * Russian page -- which is exactly how three labels in the record panel's
     * head came to read «Close» beside «В избранное».
     */
    text(key, attribute) {
        return (attribute && this.getAttribute(attribute)) || pageText(TABLE_TEXT, key, this);
    }

    templateContext() {
        this._renderedCramped = this.columnsAreCramped;
        const props = this.getPropsContext();

        return this.createTemplateContext({
            ...props,
            component: this,
            list: this.isList,
            rootClass: this.getRootClass(),
            rootStyle: this.getRootStyle(),
            filterText: this.text("filterText", "filter-text"),
            clearText: this.text("clearText", "clear-text"),
            searchPlaceholder: this.text("searchPlaceholder", "search-placeholder"),
            createText: this.text("createText", "create-text"),
            pinColumnLabel: this.text("pinColumnLabel", "pin-column-label"),
            unpinColumnLabel: this.text("unpinColumnLabel", "unpin-column-label"),
            loadingText: this.text("loadingText", "loading-text"),
            emptyText: this.text("emptyText", "empty-text"),
            errorText: this.text("errorText", "error-text"),
            retryText: this.text("retryText", "retry-text"),
            columnMoveLabel: this.text("columnMoveLabel", "column-move-label"),
            filterApplyText: this.text("filterApplyText", "filter-apply-text"),
            columnSearchPlaceholder: this.text("columnSearchPlaceholder", "column-search-placeholder"),
            columnSearchEmptyText: this.text("columnSearchEmptyText", "column-search-empty-text"),
        });
    }

    setCheckboxHeight() {
        if (!this.refs.items.size) return;
        const measureToken = ++this._checkboxMeasureToken;
        requestAnimationFrame(() => {
            if (!this.isConnected || measureToken !== this._checkboxMeasureToken) {
                return;
            }

            const parentSpace = setParentSpace(this.refs.items);
            if (!parentSpace) {
                return;
            }

            const {item, gap, parent} = parentSpace;
            this.parentGap = gap;
            const itemHeight = item.tagName.toLowerCase().startsWith('sf-')
                ? item.children[0]?.clientHeight
                : item.clientHeight;
            if (!itemHeight) {
                return;
            }
            const itemSize = parent.dataset.size || 8;
            const parentHeight = (itemHeight + gap) * itemSize;

            if (parent.clientHeight <= parentHeight) {
                return false;
            }
            parent.setAttribute('style', `height: ${parentHeight}px; overflow: auto;`)
        })
    }


    beforeRender() {
        super.beforeRender();
        this.connectTablePreference();
        this.applyTableView();
        this._checkboxMeasureToken++;
        this.refs.items = new Map();
    }

    afterRender() {
        this.bindRowActionsEvents(this.refs.table?.value);
        if (this._windowed) this.bindWindowScroll();
        // A row the keyboard asked for outside the drawn range is drawn now:
        // it is focused and scrolled into view, and the scroll that brings
        // moves the range around it -- not the place the page was at before.
        if (this._pendingFocusRow) {
            const id = this._pendingFocusRow;
            this._pendingFocusRow = null;
            this._windowOnly = false;
            this._entryOnly = false;
            this.focusRow(id, {reveal: true});
            return;
        }
        // A render that only moved the window, or changed one entry, draws
        // rows of the same columns: their values are folded, no width is
        // measured again.
        if (this._windowOnly || this._entryOnly) {
            this._windowOnly = false;
            this._entryOnly = false;
            this._layoutUnchanged = false;
            this.fitCellValues();
            this.measurePinnedColumns();
            this.syncWindow();
            return;
        }
        // A render that only moved a row's buttons changed no width.
        if (this._layoutUnchanged) {
            this._layoutUnchanged = false;
            return;
        }
        // Content widths first: they change the widths everything below reads.
        // Written straight onto the columns: a render for them drew every row
        // and every value in it again (owner, 2026-10-15).
        if (this.measureContentWidths()) this.applyColumnWidths();
        this._contentRetries = 0;
        this.fitCellValues();
        this.measurePinnedColumns();
        if (this.hasAttribute("data-sf-page-scroll")) {
            this.bindPageScroll();
            this.syncRail();
            this.syncStickyHead();
        } else {
            this.unbindPageScroll();
            const head = this.refs.table?.value?.tHead;
            if (head?.style.transform) head.style.transform = "";
        }
        // Whether the columns are cramped is read from the laid-out table, so
        // the first render guesses: before layout the actions column and the
        // floors are not yet where they will be. When the answer after the
        // render is not the one the render used, render once more.
        // Twice at most in a row, so a width that sits on the edge cannot keep
        // the table re-rendering.
        if (this.columnsAreCramped !== this._renderedCramped && (this._crampedRetries ?? 0) < 2) {
            this._crampedRetries = (this._crampedRetries ?? 0) + 1;
            this.requestComponentUpdate("cramped-columns");
        } else {
            this._crampedRetries = 0;
        }
        this.bindPinnedColumnScroll();
        this.setCheckboxHeight();
        this.bindHoverEvent();
        this.bindColumnResizeEvent();
        this.bindColumnDragEvent();
        this.syncWindow();
    }

    template() {
        return renderTableTemplate(this.templateContext());
    }
}

settingSetters(SfTable, manifest);
SfTable.define("sf-table");
