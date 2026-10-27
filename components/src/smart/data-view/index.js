// A composition shell. The host owns access, storage and query semantics;
// this element owns the browser lifecycle and projects answers into its slots.
import "../table/index.js";
import "../pagination/index.js";
// The notice is a toast, so the composite carries it the way it carries the
// table and the page row.
import "../toast/index.js";
import {pageText} from "../../core/js/page-language";
import {elementFromManifest} from "../../core/js/element-manifest";
import {installAliases} from "../../core/js/aliases.js";
import {answerActions, settingSetters} from "../table/js/manifest-actions.js";
import manifest from "./component.json";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";
import BundledPreferences from "../../core/js/preferences.js";
import {acceptLevel, collapse, createTree, expandKnown, hasLevel, knownRecords, markLoading, visibleRows} from "./js/tree.js";
const LISTENED = Object.freeze([
    "sf-table-search-change", "sf-table-filter-change", "sf-table-sort-change", "sf-table-save",
    "sf-table-apply", "sf-table-refresh", "sf-table-select", "sf-table-column-settings-reset",
    "sf-table-expand", "sf-table-load-more", "sf-table-reference-open", "sf-table-cell-set", "sf-table-move",
    "sf-pagination-change", "sf-pagination-size-change", "sf-pagination-apply", "sf-pagination-load-more",
    "sf-pagination-selection-clear", "sf-pagination-count", "sf-pagination-action-change",
    "sf-pagination-action-for-all-change", "sf-data-view-saved-view-intent",
]);
// The table's and the page row's events by their names since standard 1.3.8
// (vocabulary 1.1.5): the old names they still send until 2026-12-01 are not
// listened to, so each act is taken once.
const EVENTS = Object.freeze({
    "sf-table-query": "query.change",
    "sf-table-template-select": "view.open",
    "sf-table-template-save": "view.save",
    "sf-table-template-delete": "view.delete",
    "sf-table-create": "view.create_record",
});

let instanceNumber = 0;
// Every port version this composite accepts, in one place. The list used to be
// written inline in the guard, and two versions were published — 1.3.0 for a
// host that does not count, 1.4.0 for personal pinning — while the guard still
// named 1.2.0 as the newest it would take. A host moving to either would have
// been refused outright by the component that asked it to move. The contract
// test beside this file now compares the list with the manifest.
// The port speaks snake_case and the table reads camelCase, and the translation
// is this view's job: a column that named its property_type reached the table
// under a name nothing read, so the cell drew the stored value. Both names are
// kept -- the port's, because that is what the host sent and what a consumer
// reading the DOM expects, and the component's, because that is what the shared
// renderer set asks for.
const COLUMN_PRESENTATION = {
    property_type: "propertyType",
    min_width: "minWidth",
};

// The sentence a host answer carries for a person (port answer `message`):
// a non-empty string, trimmed; anything else is no message.
function hostMessage(answer) {
    return typeof answer?.message === "string" ? answer.message.trim() : "";
}

// Whether a refused list was refused for access rather than for the query
// (Larena acceptance, 2026-10-22: a search longer than the host's limit,
// refused as query_invalid, drew «Нет доступа» and took the toolbar away, so
// the search could not be shortened without reloading). The port's reason is
// free text a host may extend (simai.dataview-port 1.12.0 answer.reason) and the
// contract names one access reason, `forbidden`; it has no class for the rest.
// Access is read from the code: `forbidden`, `access_denied`, `scope_denied`,
// and a host's own prefixed form of the last two (`storage_page_scope_denied`,
// `registered_list_access_denied`). A refusal without a reason stays a refusal
// of access, as every refused list was before. Any other reason is about the
// query: the person keeps the toolbar and the query to correct it.
const ACCESS_REFUSALS = new Set(["forbidden", "access_denied", "scope_denied"]);
function isAccessRefusal(reason) {
    if (reason == null || reason === "") return true;
    // Larena writes the codes with underscores; ui-admin's reference host with
    // hyphens (access-denied, stand 24 U2): both are the same refusal.
    const code = String(reason).replace(/-/gu, "_");
    return ACCESS_REFUSALS.has(code) || code.endsWith("_access_denied") || code.endsWith("_scope_denied");
}

function projectColumn(column) {
    const projected = copy(column);
    for (const [sent, read] of Object.entries(COLUMN_PRESENTATION)) {
        if (projected[sent] !== undefined && projected[read] === undefined) {
            projected[read] = projected[sent];
        }
    }
    return projected;
}

const SUPPORTED_PORT_VERSIONS = ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0", "1.6.0", "1.7.0", "1.8.0", "1.9.0", "1.10.0", "1.11.0", "1.12.0"];

// Creating a record and saving personal column settings became capabilities in
// port 1.10.0. A host that declares an earlier version was offered both without
// announcing them and keeps that; a host on 1.10.0 is offered them only when it
// announces them, so a page is never given a control nobody would answer.
const BASELINE_UNTIL_1_10 = new Set(["create-record", "personal-column-settings"]);
const portAtLeast = (version, minimum) => {
    const parts = (value) => String(value ?? "").split(".").map((part) => Number.parseInt(part, 10) || 0);
    const [a, b] = [parts(version), parts(minimum)];
    for (let index = 0; index < 3; index += 1) {
        if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
    }
    return true;
};
// The words are the language files' (lang/<locale>.json, standard 1.3.8 §11),
// read under the camelCase keys a product registers more languages by.
const camelWords = (words = {}) => Object.fromEntries(Object.entries(words)
    .map(([key, word]) => [key.replace(/-([a-z0-9])/gu, (_, letter) => letter.toUpperCase()), word]));
const DATA_VIEW_TEXT = {
    en: camelWords(en.runtime),
    ru: camelWords(ru.runtime),
};

// The parts this element draws itself and a consumer can leave out. `status` is
// absent on purpose and cannot be switched off: a list that could not say a load
// failed would be a list that looks empty when it is broken, and an embedded one
// with a row cap and no chrome is exactly where someone would be tempted to
// remove it. `bulk` and `notice` are host slots that render nothing when empty,
// so switching them would be theatre.
// `select` and `settings` are the table's two chrome columns rather than parts of
// this element, and they are named here because they are furniture of the same
// kind: a checkbox column exists to feed a bulk band and a gear column exists to
// reach column settings, and an embedded list has neither. Named explicitly
// instead of inferred from the toolbar, so a consumer who does want a selection
// in an embedded list can ask for it -- `chrome="select"` -- rather than having to
// turn the whole toolbar back on to get a checkbox.
// Words the view passes on to the table and the pagination it draws.
const TABLE_LABELS = ["column-search-placeholder", "column-search-empty-text", "column-move-label", "filter-apply-text"];
const PAGINATION_LABELS = ["show-more-text", "selected-label", "total-label", "pages-label", "first-label",
    "previous-label", "page-label", "next-label", "last-label", "page-field-label", "action-choose-label",
    "actions-label", "actions-region-label", "clear-selection-label", "page-size-label"];
const LABEL_ATTRIBUTES = [...TABLE_LABELS, ...PAGINATION_LABELS, "pagination-aria-label"];

const CHROME_PARTS = ["toolbar", "pagination", "select", "settings"];

// Writes that cannot have changed a row, so the view does not re-query after
// them. Opening a record changes nothing either; the rest of the settings layer
// is the person's own view of the same rows.
const ANSWER_ONLY = new Set(["node.targets"]);
const TREE_INTENTS = new Set(["tree.expand", "node.targets", "node.move"]);

const NO_REFRESH_AFTER = new Set([
    "record.open",
    "tree.expand",
    "node.targets",
    "settings.save_personal",
    "settings.save_shared",
]);
const copy = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

// Whether a filter value holds anything: an empty string, list or object is
// no filter.
// SF.Preferences: the view's sort and page size are the person's (owner,
// 2026-10-14), kept under the same key as the table's arrangement.
const preferences = () => globalThis.SF?.Preferences || BundledPreferences;
const viewPreferenceKey = (key) => `sf-table/${String(key).replace(/[^\w.:-]+/gu, "-")}`;

function hasValue(value) {
    if (value === null || value === undefined || value === "" || value === false) return false;
    if (Array.isArray(value)) return value.some(hasValue);
    if (typeof value === "object") return Object.values(value).some(hasValue);
    return true;
}

// sf-data-view from its component.json (standard simai.smart-component 1.3.8
// §3, §4, §8, §11): a leaf over plain HTMLElement (it draws into its own
// shadow root), its settings and values made by core/js/element-manifest.js,
// its actions answering outcomes (../table/js/manifest-actions.js), its events by the
// vocabulary's verbs with the old names as dated aliases (aliases.json).
class PlainElement extends HTMLElement {
    connectedCallback() {}
}
const DataViewElement = elementFromManifest(manifest, {base: PlainElement, lang: {en, ru}, source: "ru", aliases});

// The vocabulary's data state (§3) for the view's own words for it.
const DATA_STATES = {loading: "loading", populated: "ready", empty: "empty", error: "error", "no-access": "refused", unavailable: "unavailable"};

class SfDataView extends DataViewElement {
    constructor() {
        super();
        this.instanceId = `sf-data-view-${++instanceNumber}`;
        this.query = {filters: {}, search: "", sort: [], page: 1, per_page: 25};
        this.records = [];
        // The tree, when the host answers in levels (port 1.8.0): mode is
        // tree, flat or flattened as the last answer said, null before one.
        this.treeMode = null;
        this.tree = createTree();
        this._treeAppend = new Set();
        this.treeSequence = 0;
        // The host's labels and groups for its own action ids (row_actions).
        this.rowActionCatalog = [];
        this.continuing = false;
        this.appended = null;
        this.columns = [];
        this.total = 0;
        // Whether the host counts. It is answered by the answers themselves: a
        // total means there is a number, no total means there is a link. There
        // is no mode attribute, because a view whose host stops counting should
        // not need a host to be reconfigured as well.
        this.countKnown = true;
        // A host may answer an estimate (`total_exact: false`): the number is
        // shown, but as «~N», and nothing is applied under the filter on it.
        this.totalExact = true;
        this.hasNext = false;
        this.countedQuery = null;
        this.savedViews = [];
        this.columnSettings = null;
        this.sequence = 0;
        this.epoch = 0;
        this.pending = null;
        this.hostPort = null;
        // Whether a projection has arrived. Until one has, the counts the host
        // wrote in the markup are left alone.
        this._answered = false;
        this._bound = (event) => this._onEvent(event);
        this._seenEvents = new WeakSet();
        this.attachShadow({mode: "open"});
        this.shadowRoot.innerHTML = `
          <style>
            :host { display: block; }
            [part="layout"] { display: grid; gap: var(--sf-data-view-gap, var(--sf-space-3)); }
            [part="toolbar"] { display: flex; flex-wrap: wrap; gap: var(--sf-data-view-toolbar-gap, var(--sf-space-2)); }
            /* Hidden means hidden: the toolbar's own display beat the hidden
               attribute, and a related list in a record panel (chrome="")
               showed the bare fallback search above its rows (Larena,
               2026-10-14). */
            [hidden] { display: none !important; }
            /* Files from the computer over a view that takes them (accept-files):
               a dashed zone over the list says where they go. */
            [part="drop"] {
              position: absolute; inset: 0; z-index: 20;
              display: grid; place-items: center;
              border: var(--sf-focus--width, 2px) dashed var(--sf-data-view-drop-border-color, var(--sf-primary));
              border-radius: var(--sf-radius--surface);
              background: var(--sf-data-view-drop-background-color, color-mix(in srgb, var(--sf-primary-container) 80%, transparent));
              color: var(--sf-data-view-drop-color, var(--sf-on-primary-container));
              font: var(--sf-font-weight-medium) var(--sf-text-size-1) / var(--sf-text-height-1) var(--sf-text--family);
              pointer-events: none;
            }
            /* What the view is doing is announced, not laid out. It used to be
               a line above the table, which said "Нет данных" over a table
               whose own body says the same, and pushed everything down by its
               height every time a search found nothing. */
            [part="status"] {
              position: absolute;
              inline-size: var(--sf-px);
              block-size: var(--sf-px);
              margin: calc(var(--sf-px) * -1);
              padding: 0;
              overflow: hidden;
              clip-path: inset(50%);
              white-space: nowrap;
              border: 0;
            }
            /* A notice is a message about an action. It used to float over the
               top of the card, which moved nothing but covered the search, the
               create button and the filters -- the consumer was right that this
               is worse than a shifted table. It stands in the corner of the
               window now, over the page and over none of the controls, and it
               goes away by itself. Slotted from the light DOM because the
               Framework's styles -- sf-toast's among them -- do not cross a
               shadow boundary. */
            slot[name="notice"]::slotted(*) {
              position: fixed;
              inset-block-end: var(--sf-space-3);
              inset-inline-end: var(--sf-space-3);
              max-inline-size: var(--sf-g0);
              /* One above the menus: they share the top step, and a refusal
                 answering a menu choice opened under the menu that asked. */
              z-index: calc(var(--sf-z-index-9, 90) + 1);
            }
            /* The band of bulk controls is the last strip of the card and holds
               the bottom of the window while the card runs past it. It is
               slotted rather than built in here: the Framework's own styles do
               not cross a shadow boundary, so the band lives in the light DOM
               where they reach it, and this layout is what contains it. */
            slot[name="bulk"]::slotted(*) {
              position: sticky;
              inset-block-end: 0;
              z-index: var(--sf-z-index-3, 30);
            }
          </style>
          <section part="layout" style="position: relative">
            <div part="toolbar"><slot name="toolbar">
              <label>Поиск <input type="search" data-search></label>
              <!-- Saved views are offered only when the host says it keeps them.
                   They were offered always, and a host that claims neither
                   saved-views nor shared-saved-views answers every one of these
                   with capability-not-provided -- so «Сохранить вид» could do
                   nothing but refuse, which is not a control, it is a trap. The
                   owner met them on a page whose host claims only row-actions
                   (owner, 2026-10-09). -->
              <span data-saved-views hidden>
                <label>Вид <select data-view><option value="">Текущий</option></select></label>
                <label>Название вида <input type="text" data-view-name></label>
                <button type="button" data-save>Сохранить вид</button>
                <button type="button" data-delete>Удалить вид</button>
              </span>
            </slot></div>
            <div part="status" role="status" aria-live="polite" hidden></div>
            <div part="drop" hidden></div>
            <slot name="content"><sf-table toolbar="false"></sf-table></slot>
            <slot name="show-all"></slot>
            <slot name="pagination"><sf-pagination top="false" bottom="false"></sf-pagination></slot>
            <slot name="bulk"></slot>
            <slot name="notice"></slot>
            <slot name="dialog"></slot>
          </section>`;
    }

    // ---------- the manifest's values and settings (§4) ----------

    get total() { return this._total ?? 0; }

    set total(value) { this._total = value; }

    // The vocabulary's data state of the list (§3): ready for populated,
    // refused for no access.
    get state() {
        if (this._queryRefused) return "refused";
        return DATA_STATES[this._dataState] ?? "idle";
    }

    // The row the page has open, marked in the table (aria-current).
    get current() { return this._current ?? ""; }

    set current(id) {
        this._current = id === null || id === undefined ? "" : String(id);
        if (this.table) this.table.current = this._current;
    }

    get selected() { return this._current || undefined; }

    // The actions offered for the marked rows, [{id, label}] (component.json
    // settings.bulk-actions). A page writes them on its page row's markup
    // (actions="publish:Опубликовать|…"); an assembly that places the bare view
    // gives them here, their words from its language file (§11.3), and the view
    // hands them to its page row.
    get bulkActions() { return this._bulkActions ?? []; }

    set bulkActions(list) {
        this._bulkActions = Array.isArray(list) ? list.filter((item) => item && (item.id ?? item.value)) : [];
        this._applyBulkActions();
    }

    _applyBulkActions() {
        const pagination = this.pagination;
        if (!pagination || !this._bulkActions?.length) return;
        const clean = (text) => String(text ?? "").replace(/[|:]/gu, " ").trim();
        const markup = this._bulkActions.map((item) => `${clean(item.id ?? item.value)}:${clean(item.label ?? item.text ?? item.id ?? item.value)}`).join("|");
        if (pagination.getAttribute("actions") !== markup) pagination.setAttribute("actions", markup);
    }

    get selection() { return this.table?.selection ?? []; }

    get table() {
        const slot = this.shadowRoot.querySelector('slot[name="content"]');
        return slot.assignedElements().find((element) => element.matches("sf-table"))
            ?? slot.querySelector("sf-table");
    }

    // The band of bulk controls, kept in the light DOM so the Framework styles
    // reach it, and assigned to the layout's own slot so the card contains it.
    get bulkBand() {
        if (this._bulkBand?.isConnected) return this._bulkBand;
        const existing = this.querySelector(':scope > [slot="bulk"]');
        this._bulkBand = existing ?? document.createElement("div");
        this._bulkBand.setAttribute("slot", "bulk");
        this._bulkBand.classList.add("sf-pagination-actions", "flex", "items-cross-center");
        this._bulkBand.setAttribute("role", "region");
        if (!this._bulkBand.isConnected) this.append(this._bulkBand);
        return this._bulkBand;
    }

    // The show-all row, in the light DOM for the same reason the bulk band and the
    // notice are: the Framework's stylesheets do not cross a shadow boundary, so a
    // control drawn inside the shadow comes out as a native grey button. A consumer
    // reported exactly that beside «5 of 61», and it is the same trap that had an
    // embedded table showing its icon ligatures as text.
    get showAllBand() {
        if (this._showAll?.isConnected) return this._showAll;
        const existing = this.querySelector(':scope > [slot="show-all"]');
        this._showAll = existing ?? document.createElement("div");
        this._showAll.setAttribute("slot", "show-all");
        this._showAll.classList.add("flex", "items-cross-center", "gap-1/3");
        // The click is listened for on the band rather than on this element. A
        // listener on the element would see every click inside it, and the handler
        // below branches on [data-save] and [data-delete] as well -- a row that
        // happened to carry one of those would have reached the wrong branch.
        if (this._showAll.getAttribute("data-sf-bound") !== "1") {
            this._showAll.setAttribute("data-sf-bound", "1");
            this._showAll.addEventListener("click", this._bound);
        }
        if (!this._showAll.isConnected) this.append(this._showAll);
        return this._showAll;
    }

    // The notice: one alert at a time, in the light DOM so the Framework's own
    // styles reach it, assigned to the layout's slot so the card holds it.
    get noticeBand() {
        if (this._notice?.isConnected) return this._notice;
        const existing = this.querySelector(':scope > [slot="notice"]');
        this._notice = existing ?? document.createElement("div");
        this._notice.setAttribute("slot", "notice");
        if (!this._notice.isConnected) this.append(this._notice);
        return this._notice;
    }

    // What a reason code says to a person. A host that sends its own `message`
    // is believed; a reason this component knows is translated; anything else
    // is a plain sentence, with the code kept in the title for the people who
    // read codes. A code is never the message: the consumer saw
    // `minimal_cms_action_rejected` where a sentence belonged.
    _noticeText(answer = {}) {
        const message = hostMessage(answer);
        if (message) return message;
        // The host's own sentence wins; these are what to say when it sent
        // none. They follow the page's language like every other word.
        const keys = {
            "action-not-allowed": "noticeActionNotAllowed",
            "capability-not-provided": "noticeCapabilityNotProvided",
            "port-not-connected": "noticePortNotConnected",
            "saved-view-levels-require-port-1.1.0": "noticeSavedViewLevels",
            // The rest of the reasons simai.dataview-port 1.12.0 lists: each
            // has its own words rather than the answer's general one.
            "confirm_required": "noticeConfirmRequired",
            "not-confirmed": "noticeNotConfirmed",
            "no-base-revision": "noticeNoBaseRevision",
            "record_invalid": "noticeRecordInvalid",
            "forbidden": "noticeForbidden",
            "stale-revision": "noticeStaleRevision",
        };
        if (keys[answer.reason]) return pageText(DATA_VIEW_TEXT, keys[answer.reason], this);
        const byAnswer = {
            conflict: "noticeConflict",
            refused: "noticeRefused",
            unavailable: "noticeUnavailable",
        }[answer.answer];
        return pageText(DATA_VIEW_TEXT, byAnswer ?? "noticeFailed", this);
    }

    // Shown over the card, not in it. `role` follows what happened: an error is
    // an alert, a refusal is a message.
    notify(text, {kind = "error", code = ""} = {}) {
        // The page's one notification area (SF.notify, Framework
        // ui-82fc0ba882ba): the view's messages go where every other message
        // goes, and a notification centre records them from sf-notification
        // (owner, 2026-10-13). A clear closes the view's last message there.
        // A Framework without SF.notify keeps the band over the card.
        if (typeof globalThis.SF?.notify === "function") {
            if (!text) {
                this._notifyHandle?.close?.();
                this._notifyHandle = null;
                return this;
            }
            this._notifyHandle = globalThis.SF.notify({
                status: kind === "error" ? "error" : "warning",
                title: text,
                // Long enough to read a sentence, as the band's was.
                duration: 7000,
                source: code ? `sf-data-view:${code}` : "sf-data-view",
                key: code ? `sf-data-view:${code}` : undefined,
            });
            return this;
        }
        const band = this.noticeBand;
        band.replaceChildren();
        if (!text) {
            band.remove();
            this._notice = null;
            return this;
        }
        const toast = document.createElement("sf-toast");
        toast.setAttribute("status", kind === "error" ? "error" : "warning");
        toast.setAttribute("closable", "true");
        toast.setAttribute("close-label", pageText(DATA_VIEW_TEXT, "closeNoticeLabel", this));
        toast.setAttribute("role", kind === "error" ? "alert" : "status");
        toast.setAttribute("heading", text);
        // Long enough to read a sentence, and it can be closed at once. A
        // message that stays until it is dismissed ends up covering something,
        // which is how the overlay before it went wrong.
        toast.setAttribute("duration", "7000");
        // The code is for the people who read codes, and they read it in the
        // inspector: shown as a second line it was a raw identifier under a
        // sentence, which the owner read as noise (2026-10-12).
        if (code) toast.setAttribute("data-sf-code", code);
        // Closed, not asked to close: sf-toast-close is the cancelable request now.
        toast.addEventListener("sf-toast-closed", () => this.notify(""));
        band.append(toast);
        return this;
    }

    get pagination() {
        const slot = this.shadowRoot.querySelector('slot[name="pagination"]');
        return slot.assignedElements().find((element) => element.matches("sf-pagination"))
            ?? slot.querySelector("sf-pagination");
    }

    // Files from the computer dropped on the view (accept-files, owner
    // 2026-10-15, the file manager) are the host's to upload: the view says
    // so with sf-data-view-files-drop {files}. They do not go through the
    // port, whose payloads are JSON.
    _bindFileDrop() {
        if (this._fileDropBound) return;
        this._fileDropBound = true;
        const zone = () => this.shadowRoot.querySelector('[part="drop"]');
        const carriesFiles = (event) => this.hasAttribute("accept-files") && [...(event.dataTransfer?.types ?? [])].includes("Files");
        const show = (on) => {
            const node = zone();
            if (!node) return;
            node.textContent = pageText(DATA_VIEW_TEXT, "dropFiles", this);
            node.hidden = !on;
        };
        this.addEventListener("dragover", (event) => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            show(true);
        });
        this.addEventListener("dragleave", (event) => {
            if (!this.contains(event.relatedTarget) && !this.shadowRoot.contains(event.relatedTarget)) show(false);
        });
        this.addEventListener("drop", (event) => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            show(false);
            const files = [...event.dataTransfer.files];
            if (files.length) this.dispatchEvent(new CustomEvent("sf-data-view-files-drop", {bubbles: true, composed: true, detail: {files}}));
        });
    }

    // A view placed with no table and no page row of the page's own (an
    // assembly places the bare tag) makes them as its light children, slotted,
    // where the page's stylesheets reach them: the fallbacks inside the shadow
    // root are drawn without the table's sheet. The documented markup gives
    // them, and then nothing is made.
    _ownParts() {
        if (!this.querySelector(':scope > sf-table[slot="content"], :scope > [slot="content"]')) {
            const table = document.createElement("sf-table");
            table.slot = "content";
            table.setAttribute("aria-label", pageText(DATA_VIEW_TEXT, "recordsLabel", this));
            table.toggleAttribute("data-sf-view-made", true);
            this.append(table);
        }
        if (!this.querySelector(':scope > [slot="pagination"]')) {
            const pagination = document.createElement("sf-pagination");
            pagination.slot = "pagination";
            pagination.setAttribute("top", "false");
            pagination.setAttribute("bottom", "false");
            pagination.toggleAttribute("data-sf-view-made", true);
            this.append(pagination);
        }
        this._applyBulkActions();
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.getAttribute("data-sf-instance")) this._ownParts();
        // Dated aliases (§16.20), installed once per element as the Smart base does.
        if (!this.__sfAliases) this.__sfAliases = installAliases(this, aliases, {tag: this.localName, adapters: {}});
        this._bindFileDrop();
        this.epoch += 1;
        // The key reaches the table before its first paint.
        this._applyPreferences();
        this._controller = new AbortController();
        const events = [
            ...Object.keys(EVENTS), ...LISTENED,
        ];
        for (const name of events) this.shadowRoot.addEventListener(name, this._bound);
        for (const name of events) this.addEventListener(name, this._bound);
        this.shadowRoot.querySelector("[data-search]").addEventListener("change", this._bound);
        this.shadowRoot.querySelector("[data-view]").addEventListener("change", this._bound);
        this.shadowRoot.querySelector("[data-save]").addEventListener("click", this._bound);
        this.shadowRoot.querySelector("[data-delete]").addEventListener("click", this._bound);
        this._renderProjection();
        if (this.hostPort) this.refresh("connected");
        else this._requestHostPort();
    }

    // A component that takes a host port can also ask for one, so a consumer who
    // composes it inside something else does not have to find the element and call
    // a method on it. Raised once per connection and only while there is no port;
    // `setHostPort` is what answers it, synchronously or later. The name is the
    // shared convention rather than one of this element's own: the next composite
    // that takes a host port raises the same event, and a host answers them all
    // the same way.
    _requestHostPort() {
        if (this.hostPort || this._portRequested) return false;
        this._portRequested = true;
        this.dispatchEvent(new CustomEvent("sf-host-port-request", {
            bubbles: true,
            composed: true,
            detail: {component: this, context: {owner: this.portOwner, record: this.portRecord, group: this.portGroup}},
        }));
        return true;
    }

    // What a host needs to know to answer: which composite is asking and about
    // what. Set by whatever embedded this element; absent on a page list, which is
    // asking about nothing but itself.
    get portOwner() {
        return this.getAttribute("port-owner") || null;
    }

    get portRecord() {
        return this.getAttribute("port-record") || null;
    }

    get portGroup() {
        return this.getAttribute("port-group") || null;
    }

    disconnectedCallback() {
        this.epoch += 1;
        // Once per connection, so an element moved in the DOM asks again. Without
        // this reset a list re-attached into a different host would sit portless
        // and silent, which looks exactly like a host that chose not to answer.
        this._portRequested = false;
        this._controller?.abort();
        this._controller = null;
        const events = [
            ...Object.keys(EVENTS), ...LISTENED,
        ];
        for (const name of events) this.shadowRoot.removeEventListener(name, this._bound);
        for (const name of events) this.removeEventListener(name, this._bound);
        this.shadowRoot.querySelector("[data-search]").removeEventListener("change", this._bound);
        this.shadowRoot.querySelector("[data-view]").removeEventListener("change", this._bound);
        this.shadowRoot.querySelector("[data-save]").removeEventListener("click", this._bound);
        this.shadowRoot.querySelector("[data-delete]").removeEventListener("click", this._bound);
        this.pending = null;
    }

    // A host adapter exposes raise(intent, payload, {signal}). No transport is implied.
    // Which of this element's own parts render. A list and not a boolean, because
    // a boolean would have to mean «all of it or none», and an embedded list wants
    // its rows without a search box while a page list wants both. The names are
    // the ones this element already publishes as parts and slots, so nothing here
    // gives an existing thing a second name -- `sf-table` keeps its own `toolbar`
    // and `sf-pagination` keeps `top`/`bottom`.
    get chrome() {
        const declared = this.getAttribute("chrome");
        if (declared === null) return [...CHROME_PARTS];
        return declared.split(/\s+/u).filter((part) => CHROME_PARTS.includes(part));
    }

    renders(part) {
        return this.chrome.includes(part);
    }

    // How many rows an embedded list draws at most. Zero is no cap, which is what
    // a page list is. Not `limit`, which reads like a query limit the host owns,
    // and not `page-size`, which the pagination and the table already use for the
    // host's paging -- a cap is what this element shows of a page it already has.
    get rowCap() {
        const declared = Number.parseInt(this.getAttribute("row-cap") ?? "", 10);
        return Number.isFinite(declared) && declared > 0 ? declared : 0;
    }

    get cappedRecords() {
        // A tree is drawn whole, as far as it is open: the cap is a list's.
        if (this.treeMode === "tree") return visibleRows(this.tree);
        const cap = this.rowCap;
        return cap ? this.records.slice(0, cap) : this.records;
    }

    get capHidesRows() {
        const cap = this.rowCap;
        return Boolean(cap) && (this.records.length > cap || this.hasNext === true);
    }

    // The whole list is the host's to open. The component has no address to build
    // one from, and a route it guessed would send a person to a page the product
    // may not have. The query travels so the full view opens on the records the
    // person was looking at rather than on an unfiltered collection.
    openList(reason = "row-cap") {
        if (!this.hostPort) return Promise.resolve({answer: "unavailable", reason: "port-not-connected"});
        return this._raise("list.open", {
            reason,
            query: {search: this.query.search ?? "", filters: {...(this.query.filters ?? {})}},
        });
    }

    // The presentation attributes are observed, because they are read when the
    // projection runs and nothing re-ran it. A consumer rendering this element
    // through a template sets its attributes after it is in the document, so the
    // first projection saw no `chrome` at all and drew the full page chrome -- a
    // consumer reported the fallback «Поиск / Сохранить вид» form standing inside a
    // group that had asked for no chrome, until data arrived and projected again.
    // The step of the size ladder the view's controls take, handed to the table,
    // the page row and the selection band: 1, or the admin's dense 1/2, where the
    // view stands beside the admin menu's 32px rows (owner, 2026-10-13).
    get size() {
        return this.getAttribute("size") === "1/2" ? "1/2" : "1";
    }

    static get observedAttributes() {
        return ["chrome", "row-cap", "aria-label", "size", "preferences-key", ...LABEL_ATTRIBUTES];
    }

    // The words of the table and the pagination the view draws itself, written
    // on the view and passed on: a host that let the view draw its own table
    // had no way to word it, so a list inside the CMS settings spoke the
    // fallback words (Larena, 2026-10-13). A word the view is not given is left
    // to the part's own default; one that is removed is removed there too.
    _forwardLabels() {
        this._forwarded ??= new Set();
        const pass = (target, from, to = from) => {
            if (!target?.setAttribute) return;
            const value = this.getAttribute(from);
            const key = `${target.localName}:${to}`;
            if (value === null) {
                if (this._forwarded.delete(key)) target.removeAttribute(to);
                return;
            }
            target.setAttribute(to, value);
            this._forwarded.add(key);
        };
        for (const name of TABLE_LABELS) pass(this.table, name);
        for (const name of PAGINATION_LABELS) pass(this.pagination, name);
        pass(this.pagination, "pagination-aria-label", "aria-label");
    }

    attributeChangedCallback(name, previous, next) {
        if (previous === next || !this.isConnected) return;
        if (name === "preferences-key") this._applyPreferences();
        this._renderProjection();
    }

    setHostPort(host) {
        if (!host || typeof host.raise !== "function" || !SUPPORTED_PORT_VERSIONS.includes(host.version)) {
            throw new TypeError(
                `sf-data-view requires a declared dataview host port: ${SUPPORTED_PORT_VERSIONS.join(", ")}`,
            );
        }
        this.hostPort = host;
        if (this.isConnected) this.refresh("host-connected");
        return this;
    }

    // `message` is for the live region only: it is announced, never laid out.
    _setState(state, message = "") {
        this._dataState = state;
        this.setAttribute("data-state", state);
        this.setAttribute("aria-busy", state === "loading" ? "true" : "false");
        if (this.table && state === "empty") this.table.emptyContext = this._emptyContext();
        // A load the person caused -- a search or a filter they set -- that
        // fails is an alert; any other failed load is said politely.
        if (this.table && state === "error") {
            this.table.emptyContext = {caused: ["search", "filter"].includes(this._queryReason),
                ...(this._queryMessage ? {message: this._queryMessage} : {})};
        }
        this.table?.setDataState?.(state);
        // A failed or refused list has nothing to count: the page row goes with
        // it until a list comes back (docs trial 4: «Всего: 10» over an error).
        const pageRow = this.shadowRoot.querySelector('slot[name="pagination"]');
        if (pageRow && ["error", "no-access"].includes(state)) pageRow.hidden = true;
        const status = this.shadowRoot.querySelector('[part="status"]');
        status.hidden = !message;
        status.textContent = message;
        this.dispatchEvent(new CustomEvent("sf-data-view-state", {
            bubbles: true, composed: true, detail: {state, message, instance_id: this.instanceId},
        }));
    }

    // Why the list is empty, from what the view already knows (owner,
    // 2026-10-14): the host refused the query -- no access; a search or a
    // filter is on -- nothing found, and what a reset would clear; otherwise
    // no data. The table draws it.
    _emptyContext() {
        if (this._queryRefused) return this._queryMessage ? {kind: "no-access", message: this._queryMessage} : {kind: "no-access"};
        const search = String(this.query.search ?? "").trim() !== "";
        const filters = hasValue(this.query.filters);
        if (search || filters) return {kind: "nothing-found", reset: search && filters ? "both" : search ? "search" : "filters"};
        return {kind: "no-data"};
    }

    // Whether the host offers a capability: announced, or -- for the two that
    // were baseline before port 1.10.0 -- implied by an earlier version.
    hostOffers(capability) {
        const port = this.hostPort;
        if (!port) return false;
        if (port.capabilities?.includes?.(capability)) return true;
        return BASELINE_UNTIL_1_10.has(capability) && !portAtLeast(port.version, "1.10.0");
    }

    async _raise(intent, payload, {query = false} = {}) {
        if (!this.hostPort) {
            if (query) this._queryMessage = "";
            this._setState("error", pageText(DATA_VIEW_TEXT, "statePortNotConnected", this));
            this.notify(pageText(DATA_VIEW_TEXT, "noticePortNotConnected", this));
            return {answer: "unavailable", reason: "port-not-connected"};
        }
        const capability = {
            "view.open": "saved-views", "view.save": "saved-views", "view.delete": "saved-views",
            "view.save_shared": "shared-saved-views",
            "settings.save_shared": "shared-column-settings", "bulk.apply_under_filter": "bulk-under-filter",
            "record.open": "row-actions", "record.mutate": "row-actions",
            "tree.expand": "tree", "node.targets": "tree-move", "node.move": "tree-move",
            "view.create_record": "create-record", "settings.save_personal": "personal-column-settings",
            "record.reorder": "row-reorder", "record.set": "inline-edit",
        }[intent];
        if (capability && !this.hostOffers(capability)) {
            const answer = {answer: "unavailable", reason: "capability-not-provided"};
            this._showAnswer(intent, answer);
            return answer;
        }
        // The tree's intents are announced as the one event the port names
        // for them, so a page can watch them without standing in the way.
        if (TREE_INTENTS.has(intent)) {
            // sf-data-view-tree; the old sf-table-tree-intent follows once (aliases.json).
            this.sfEmit("tree", {intent, payload: copy(payload)});
        }
        const epoch = this.epoch;
        const sequence = query ? payload.sequence : null;
        try {
            const answer = await this.hostPort.raise(intent, copy(payload), {signal: this._controller?.signal});
            if (!this.isConnected || epoch !== this.epoch || (query && sequence !== this.sequence)) return null;
            if (!answer || !["applied", "conflict", "refused", "unavailable"].includes(answer.answer)) {
                throw new TypeError("Host answer is not a declared port answer");
            }
            if (query && answer.sequence != null && answer.sequence !== sequence) return null;
            if (query) this.pending = null;
            // Refused for access: «no access», without the toolbar. Refused for
            // the query: the query stays on screen to be corrected (isAccessRefusal).
            if (query) this._queryRefused = answer.answer === "refused" && isAccessRefusal(answer.reason);
            // The host's own sentence for a list it cannot give or will not
            // give (Larena, 2026-10-21: «Список готовится…» while a large
            // storage's read model is built). It is shown as the state's own
            // words, as text: it is the host's, and never markup.
            if (query) this._queryMessage = ["refused", "unavailable"].includes(answer.answer) ? hostMessage(answer) : "";
            // A write the host confirms first (port 1.8.0): it answered with what
            // it is about to do and a digest of it. The person reads it; if they
            // confirm, the same intent goes again with the digest, which the
            // host checks against the write it described.
            if (!query && answer.answer === "refused" && answer.reason === "confirm_required"
                && answer.data?.confirm?.digest && !payload?.confirm) {
                await this._ensureElements(["sf-button"]);
                const confirmed = await this._dialog({
                    title: pageText(DATA_VIEW_TEXT, "confirmTitle", this),
                    text: String(answer.data.confirm.summary ?? ""),
                    apply: pageText(DATA_VIEW_TEXT, "confirmApply", this),
                });
                if (!confirmed) return {answer: "refused", reason: "not-confirmed"};
                return this._raise(intent, {...payload, confirm: String(answer.data.confirm.digest)});
            }
            if (answer.answer === "applied") {
                // Where a node may go is an answer to a question, not a view of
                // the list: it is read by the move dialog and changes no rows.
                if (ANSWER_ONLY.has(intent)) {
                    // nothing to project
                } else if (!query && this._isRecordPatch(answer.data)) this._applyRecordPatch(answer.data.records);
                else if (answer.data) this.applyProjection(answer.data);
                if (query && !answer.data) throw new TypeError("Applied query has no data");
                if (intent === "view.open") this.refresh("view-switch");
                // A write that changed no record cannot have changed the rows.
                // Column settings — order, width, visibility, pinning — used to
                // fall into this branch and re-query the whole page, so moving a
                // column reloaded the view and flashed a loader at the person.
                if (!query && !answer.data && !NO_REFRESH_AFTER.has(intent)) this.refresh("after-write");
                // What the write changed for the rest of the page goes out on
                // the page host's outputs (simai.interface-fragment, effects);
                // the page's routes take it to whoever listens.
                if (Array.isArray(answer.effects) && answer.effects.length) globalThis.SF?.Composition?.publishEffects?.(answer.effects, {origin: this});
            } else if (query && answer.answer === "refused" && !this._queryRefused) {
                // A query the host would not answer as asked -- a search
                // longer than it takes, a filter it does not allow. The rows of
                // the last answer do not answer this query, so they go; the
                // toolbar, the search the person typed and the filters stay,
                // and the state says what went wrong: the host's sentence as
                // text, or the view's own words. No notice over it: the state
                // and the live region already say it.
                this.records = [];
                this.appended = null;
                this.total = 0;
                this.countKnown = false;
                this._renderProjection();
                // The brick's title as well as the live region: the table's own
                // «could not load» would say the wrong thing about a query.
                if (!this._queryMessage) this._queryMessage = pageText(DATA_VIEW_TEXT, "stateQueryFailed", this);
                this._setState("error", this._queryMessage);
                this._showAnswer(intent, answer, {stated: true});
                return answer;
            } else if (query && answer.answer === "refused") {
                // A refused list shows nothing it had: the rows of the last
                // allowed answer stayed under «no access» (docs trial 4).
                this.records = [];
                this.appended = null;
                this.total = 0;
                this.countKnown = false;
                this._renderProjection();
            } else if (query && answer.answer === "unavailable") {
                // A host that says why the list is not there is believed, and
                // its sentence is the state: the error brick and the live
                // region say it, and no error notice says something else over
                // it. Without one, the general words and the notice as before.
                this._setState("error", this._queryMessage || pageText(DATA_VIEW_TEXT, "stateUnavailable", this));
                if (!this._queryMessage) this.notify(pageText(DATA_VIEW_TEXT, "noticeFetchFailed", this), {code: answer.reason || ""});
            }
            this._showAnswer(intent, answer);
            return answer;
        } catch (error) {
            if (!this.isConnected || epoch !== this.epoch) return null;
            const answer = {answer: "unavailable", reason: error?.message || "port-error"};
            if (query) {
                this._queryMessage = "";
                this._setState("error", pageText(DATA_VIEW_TEXT, "stateLoadFailed", this));
                this.notify(pageText(DATA_VIEW_TEXT, "noticeLoadFailed", this), {code: answer.reason || ""});
            }
            this._showAnswer(intent, answer);
            return answer;
        }
    }

    _showAnswer(intent, answer, {stated = false} = {}) {
        if (!stated && ["conflict", "refused"].includes(answer.answer)
            || (answer.answer === "unavailable" && intent !== "query.change")) {
            const text = this._noticeText(answer);
            this._setState(this.records.length ? "populated" : "empty", text);
            this.notify(text, {kind: answer.answer === "conflict" ? "warning" : "error", code: answer.reason || ""});
        }
        this.dispatchEvent(new CustomEvent("sf-data-view-answer", {
            bubbles: true, composed: true, detail: {intent, ...copy(answer), instance_id: this.instanceId},
        }));
    }

    // The key the person's view of this list is kept under: the host names
    // it (preferences-key, e.g. the collection). The table takes the same.
    get preferencesKey() {
        const key = this.getAttribute("preferences-key") || "";
        return key ? viewPreferenceKey(key) : "";
    }

    // Before the first query: the person's sort and page size, so the rows
    // come in their order the first time rather than after a click.
    // A list page scrolls as a page (owner, 2026-10-15): the view's table is in
    // page mode unless the host chose its mode itself.
    _tableScrollMode(table) {
        if (typeof table?.hasAttribute !== "function" || typeof table.setAttribute !== "function") return;
        if (!table.hasAttribute("data-sf-host-vertical-scroll")) {
            table.setAttribute("data-sf-host-vertical-scroll", table.getAttribute("vertical-scroll") ?? "");
        }
        if (!table.getAttribute("data-sf-host-vertical-scroll")) table.setAttribute("vertical-scroll", "page");
    }

    _applyPreferences() {
        this._tableScrollMode(this.table);
        const key = this.preferencesKey;
        if (key === this._preferencesApplied) return;
        this._preferencesApplied = key;
        const table = this.table;
        if (table && key && !table.getAttribute("preferences-key")) table.setAttribute("preferences-key", this.getAttribute("preferences-key"));
        const kept = key ? preferences()?.read(key) : null;
        if (!kept) return;
        if (Array.isArray(kept.sort) && !this.query.sort?.length) this.query.sort = copy(kept.sort);
        if (Number.isInteger(kept.pageSize) && kept.pageSize > 0) this.query.per_page = kept.pageSize;
    }

    _keepPreference(patch) {
        const key = this.preferencesKey;
        if (!key) return;
        preferences()?.write(key, {...(preferences()?.read(key) ?? {}), v: 1, ...patch});
    }

    refresh(reason = "refresh") {
        if (!this.isConnected) return Promise.resolve(null);
        this._applyPreferences();
        const sequence = ++this.sequence;
        this.pending = sequence;
        this._queryReason = reason;
        // Show more continues the list; every other reason replaces it. The
        // answer carries no reason of its own, so it is remembered here.
        this.continuing = reason === "show-more";
        // Continuing the list is answered inside the button that asked for it.
        // The table is not loading — the rows on screen stay exactly as they
        // are — so it neither dims them nor replaces them with a loader.
        if (this.continuing) {
            this.pagination?.setState?.({showMoreBusy: true});
        } else {
            this._setState("loading", pageText(DATA_VIEW_TEXT, "stateLoading", this));
        }
        return this._raise("query.change", {sequence, query: copy(this.query), reason}, {query: true});
    }

    _syncSearchBoxes(value) {
        const text = String(value ?? "");
        const own = this.shadowRoot?.querySelector("input[data-search]");
        if (own && own.value !== text && this.shadowRoot.activeElement !== own) own.value = text;
        const table = this.table;
        if (table?.updateSearchState && (table.state?.search?.value ?? "") !== text && !table.contains(document.activeElement)) {
            table.updateSearchState({value: text}, false);
        }
    }

    changeQuery(patch, reason = "query-change") {
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("Query patch must be an object");
        this.query = {...this.query, ...copy(patch)};
        if (!["page-change", "page-size-change", "show-more"].includes(reason)) this.query.page = 1;
        return this.refresh(reason);
    }

    applyProjection(data) {
        if (!data || typeof data !== "object") throw new TypeError("Port data must be an object");
        if (Array.isArray(data.row_actions)) this.rowActionCatalog = copy(data.row_actions);
        // One node's children: they go under it, and nothing else about the
        // view changes -- not the query, not the count, not the columns.
        const tree = data.tree && typeof data.tree === "object" ? data.tree : null;
        if (tree?.mode === "tree" && tree.parent !== null && tree.parent !== undefined && Array.isArray(data.records)) {
            const parent = String(tree.parent);
            acceptLevel(this.tree, {
                parent, records: copy(data.records), hasNext: tree.has_next === true,
                cursor: tree.cursor ?? null, append: this._treeAppend.delete(parent),
            });
            this.records = knownRecords(this.tree);
            this._renderProjection();
            return;
        }
        // An answer without records is no new shape of the list (a settings
        // write, a saved view): the mode stays what the last list said.
        if (tree) this.treeMode = tree.mode ?? null;
        else if (Array.isArray(data.records)) this.treeMode = null;
        if (this.treeMode === "tree" && Array.isArray(data.records)) {
            const reopen = [...this.tree.expanded];
            acceptLevel(this.tree, {
                records: copy(data.records), hasNext: tree.has_next === true,
                cursor: tree.cursor ?? null, append: this.continuing && this.records.length > 0,
            });
            this.records = knownRecords(this.tree);
            this.appended = null;
            // Branches a person had open stay open: their children are asked
            // for again, since a re-read may have changed them.
            for (const id of reopen) {
                if (this.tree.nodes.get(id)?.has_children === true && !hasLevel(this.tree, id)) this.expandNode(id);
            }
        } else if (Array.isArray(data.records)) {
            const next = copy(data.records);
            // A continuation keeps what is already shown and adds to it, and
            // keeps it by identity: a record the port repeats is not duplicated.
            if (this.continuing && this.records.length) {
                const known = new Set(this.records.map((record) => record.id));
                this.appended = next.filter((record) => !known.has(record.id));
                this.records = [...this.records, ...this.appended];
            } else {
                this.appended = null;
                this.records = next;
            }
        }
        if (Array.isArray(data.columns)) this.columns = data.columns.map(projectColumn);
        if (Number.isSafeInteger(data.total) && data.total >= 0) {
            this.total = data.total;
            this.countKnown = true;
        } else if (typeof data.has_next === "boolean") {
            this.hasNext = data.has_next;
            // A number already answered for this very query stays on screen.
            // Paging and Show more do not take it away — only a query that
            // changes what is being counted does.
            this.countKnown = this.countedQuery !== null && this.countedQuery === this._countKey();
        }
        if (Number.isSafeInteger(data.total)) this.totalExact = data.total_exact !== false;
        this._answered = true;
        if (Array.isArray(data.saved_views)) this.savedViews = copy(data.saved_views);
        if (data.column_settings) this.columnSettings = copy(data.column_settings);
        if (data.echo) {
            const echo = data.echo;
            this.query = {
                ...this.query, filters: copy(echo.filters_chosen ?? echo.filters ?? {}),
                search: echo.search ?? "", sort: copy(echo.sort ?? []),
                page: echo.page ?? 1, per_page: echo.per_page ?? 25,
            };
        }
        // The search box says what the list is searched for, whoever set it: a
        // changeQuery({search}) from page code filtered the rows and left the
        // box empty (docs trial 5). Written silently -- it is not a new search.
        this._syncSearchBoxes(this.query.search ?? "");
        this._renderProjection();
        this._restoreOpenedView();
        // The empty result is shown by the table, in its own body. The view only
        // announces it, so a search that finds nothing moves nothing.
        this._setState(this.records.length ? "populated" : "empty", this.records.length ? "" : pageText(DATA_VIEW_TEXT, "emptyText", this));
        this.notify("");
    }

    // What a count belongs to. Search, filters and page size change what the
    // number would be; a page does not.
    _countKey() {
        return JSON.stringify([this.query.search ?? "", this.query.filters ?? {}, this.query.per_page ?? 25]);
    }

    // What the band shows and what it does. The words and the action list stay
    // the host's, set on the pagination as they always were; the band only reads
    // them, so a host configures one element and sees the band in the card.
    _renderBulkBand() {
        const pagination = this.pagination;
        const table = this.table;
        const selected = table?.getSelectedRecordIds?.() ?? [];
        const actions = pagination?.actions ?? [];
        if (!pagination || !selected.length || !actions.length) {
            if (this._bulkBand?.isConnected) this._bulkBand.remove();
            this._bulkBand = null;
            return this;
        }
        const band = this.bulkBand;
        band.setAttribute("aria-label", pagination.actionsRegionLabel ?? "");
        const action = pagination.action ?? "";
        const total = pagination.countKnown === false ? null : pagination.total;
        const forAllLabel = total == null
            ? pagination.actionForAllLabel
            : `${pagination.actionForAllLabel} (${this._shownTotal(total)})`;
        const chosen = (node, name, value) => {
            if (value == null || value === false) node.removeAttribute(name);
            else node.setAttribute(name, value === true ? "" : String(value));
        };
        const parts = {};
        if (!band.childElementCount) {
            band.innerHTML = `
                <span class="sf-pagination-actions-count" data-sf-bulk="count"></span>
                <span class="sf-pagination-actions-separator" aria-hidden="true"></span>
                <sf-dropdown data-sf-bulk="actions" size="1" appearance="outlined" search="false" mode="select"></sf-dropdown>
                <sf-button data-sf-bulk="apply" size="1" appearance="default" scheme="primary"></sf-button>
                <span class="sf-pagination-actions-separator" aria-hidden="true" data-sf-bulk="for-all-separator"></span>
                <sf-checkbox data-sf-bulk="for-all"></sf-checkbox>
                <sf-icon-button data-sf-bulk="clear" class="sf-pagination-actions-clear" size="1" appearance="link" scheme="on-surface" icon="close"></sf-icon-button>`;
            band.querySelector('[data-sf-bulk="apply"]')
                .addEventListener("click", () => this.applyBulkAction());
            band.querySelector('[data-sf-bulk="actions"]')
                .addEventListener("change", (event) => pagination.setAction?.(event.detail?.value ?? ""));
            band.querySelector('[data-sf-bulk="for-all"]')
                .addEventListener("change", (event) => pagination.setActionForAll?.(Boolean(event.target?.checked)));
            band.querySelector('[data-sf-bulk="clear"]')
                .addEventListener("click", () => this.clearSelection());
        }
        for (const node of band.querySelectorAll("[data-sf-bulk]")) {
            parts[node.dataset.sfBulk] = node;
            if (node.localName.startsWith("sf-")) chosen(node, "size", this.size);
        }
        parts.count.textContent = `${pagination.selectedLabel} ${selected.length}`;
        chosen(parts.actions, "value", action);
        chosen(parts.actions, "placeholder", pagination.actionChooseLabel);
        chosen(parts.actions, "aria-label", pagination.actionsLabel);
        parts.actions.options = [
            {type: "text", size: this.size, text: pagination.actionChooseLabel, value: "", selected: !action},
            ...actions.map((item) => ({
                type: "text", size: this.size, text: item.text, value: item.value,
                selected: item.value === action, disabled: Boolean(item.disabled),
            })),
        ];
        chosen(parts.apply, "text", pagination.actionApplyText);
        chosen(parts.apply, "disabled", !action);
        chosen(parts["for-all"], "label", forAllLabel);
        chosen(parts["for-all"], "checked", Boolean(pagination.actionForAll));
        parts["for-all"].hidden = !pagination.showActionForAll;
        // Its separator goes with it, or the band ends on a rule before the
        // close button.
        parts["for-all-separator"].hidden = !pagination.showActionForAll;
        chosen(parts.clear, "title", pagination.clearSelectionLabel);
        chosen(parts.clear, "aria-label", pagination.clearSelectionLabel);

        return this;
    }

    // Apply is the band's only write, and it goes the same way it went from the
    // page row: under the filter when For-all is ticked, over the marked rows
    // otherwise.
    applyBulkAction() {
        const pagination = this.pagination;
        const action = pagination?.action;
        if (!action) return undefined;
        if (pagination.actionForAll) return this.applyUnderFilter(action, this.total);
        return this._action(
            {action_id: action, record_ids: this.table?.getSelectedRecordIds?.() ?? []},
            {selectedBulk: true},
        );
    }

    clearSelection() {
        this.table?.clearSelection?.();
        this.pagination?.setState?.({selectedCount: 0});
        return this._renderBulkBand();
    }

    // One record, changed in place. A write that touches a row does not need
    // the page re-queried and the body rebuilt: the host answers with the
    // record it changed, or the page calls this itself, and only that row is
    // written. A full projection is still a full projection.
    updateRecord(id, patch = {}) {
        const key = String(id);
        if (this.treeMode === "tree") {
            const known = this.tree.nodes.get(key);
            if (!known || !patch || typeof patch !== "object") return false;
            this.tree.nodes.set(key, {...known, ...copy(patch), id: known.id});
            this.records = knownRecords(this.tree);
            this.table?.setRows?.(visibleRows(this.tree));
            this._renderBulkBand();
            return true;
        }
        const index = this.records.findIndex((record) => String(record?.id) === key);
        if (index < 0 || !patch || typeof patch !== "object") return false;
        const next = {...this.records[index], ...copy(patch), id: this.records[index].id};
        this.records = [...this.records.slice(0, index), next, ...this.records.slice(index + 1)];
        this.table?.updateRowByKey?.("id", this.records[index].id, {...next}, "record-update");
        this._renderBulkBand();
        return true;
    }

    // ─── the tree (port 1.8.0) ───────────────────────────────────────────────
    // Opening a node shows the children the view already has, or asks the host
    // for them; closing it is the view's own business. A node is opened only
    // when the host said it has children.
    expandNode(id) {
        const key = String(id);
        const node = this.tree.nodes.get(key);
        if (!node || node.has_children !== true) return null;
        if (hasLevel(this.tree, key)) {
            expandKnown(this.tree, key);
            this._renderTreeRows();
            return null;
        }
        markLoading(this.tree, key);
        this._renderTreeRows();
        return this._raise("tree.expand", {id: node.id, cursor: null, sequence: ++this.treeSequence});
    }

    collapseNode(id) {
        collapse(this.tree, id);
        this._renderTreeRows();
    }

    // The next page of one level: of the roots through the query, as a list
    // pages, and of a node's children through tree.expand with its cursor.
    loadMoreNodes(parent, cursor) {
        if (parent === null || parent === undefined || parent === "") {
            return this.changeQuery({page: this.query.page + 1}, "show-more");
        }
        const key = String(parent);
        this._treeAppend.add(key);
        const node = this.tree.nodes.get(key);
        return this._raise("tree.expand", {id: node?.id ?? parent, cursor: cursor ?? null, sequence: ++this.treeSequence});
    }

    // Where a node may go is the host's: it is asked first, and only the places
    // it names are offered -- the top level when it allows that, and the first
    // or last place among the new siblings when it allows reordering.
    async openMoveDialog(record) {
        const answer = await this._raise("node.targets", {id: record.id});
        if (answer?.answer !== "applied") return answer;
        const targets = answer.data?.move_targets ?? {};
        const parents = Array.isArray(targets.parents) ? targets.parents : [];
        const options = [
            ...(targets.root ? [{id: null, label: pageText(DATA_VIEW_TEXT, "moveRoot", this), path: []}] : []),
            ...parents.filter((parent) => String(parent.id) !== String(record.id)),
        ];
        if (!options.length) {
            this.notify(pageText(DATA_VIEW_TEXT, "moveNoTargets", this), {kind: "warning"});
            return {answer: "refused", reason: "no-targets"};
        }
        const label = String(record.title ?? record.label ?? record.name ?? record.id);
        // The choices are sf-radio, which nothing else on the page may have
        // asked for: a Loader that scans the light DOM never meets the
        // dialog's (Larena: an empty choice list, 2026-10-12). Asked for here,
        // and waited for briefly; the dialog opens either way.
        await this._ensureElements(["sf-radio", "sf-button"]);
        const chosen = await this._dialog({
            title: pageText(DATA_VIEW_TEXT, "moveTitle", this).replace("{label}", label),
            apply: pageText(DATA_VIEW_TEXT, "moveApply", this),
            options,
            reorder: targets.reorder === true,
        });
        if (!chosen) return null;
        return this._raise("node.move", {
            id: record.id, parent: chosen.parent, index: chosen.index,
            ...(record.revision !== undefined ? {revision: record.revision} : {}),
        });
    }

    async _ensureElements(tags) {
        const loader = globalThis.SF?.Loader;
        await Promise.all(tags.map((tag) => {
            if (customElements.get(tag)) return null;
            loader?.ensureSmartElementLoaded?.(tag);
            return Promise.race([
                customElements.whenDefined(tag),
                new Promise((settle) => setTimeout(settle, 3000)),
            ]);
        }));
    }

    // One small dialog for both the move and the confirmation: a native
    // <dialog> in the light DOM, where the Framework's styles reach it, shown
    // modal so it holds the focus and Escape closes it. Resolves with what was
    // chosen, true for a plain confirmation, or null.
    _dialog({title, text = "", apply, options = null, reorder = false}) {
        const dialog = document.createElement("dialog");
        dialog.slot = "dialog";
        // No layout utility on the dialog itself: one that sets display would
        // beat the browser's own hiding of a closed dialog.
        dialog.className = "sf-data-view-dialog";
        dialog.setAttribute("aria-label", title);
        dialog.style.cssText = "max-inline-size: min(var(--sf-g4), calc(100vw - 2 * var(--sf-space-3)));"
            + "padding: var(--sf-space-3); border: 0; border-radius: var(--sf-radius--surface);"
            + "background-color: var(--sf-elevation-3--surface); box-shadow: var(--sf-elevation-3--shadow);"
            + "color: var(--sf-on-surface);";
        const heading = document.createElement("h2");
        heading.className = "sf-text-2 font-semibold m-0";
        heading.textContent = title;
        // The places can be many; the list scrolls and the title and the
        // buttons stay where they are.
        const content = document.createElement("div");
        content.className = "flex flex-col gap-3";
        content.style.cssText = "max-block-size: calc(100dvh - 4 * var(--sf-space-3));";
        dialog.append(content);
        content.append(heading);
        if (text) {
            const body = document.createElement("p");
            body.className = "sf-text-1 m-0";
            body.textContent = text;
            content.append(body);
        }
        const name = `${this.instanceId}-move`;
        if (options) {
            const list = document.createElement("div");
            list.setAttribute("role", "radiogroup");
            list.setAttribute("aria-label", title);
            list.className = "flex flex-col gap-1";
            list.style.cssText = "overflow-y: auto; min-block-size: 0; flex: 1 1 auto;";
            options.forEach((option, index) => {
                const radio = document.createElement("sf-radio");
                radio.setAttribute("name", name);
                radio.setAttribute("value", option.id === null ? "" : String(option.id));
                radio.setAttribute("label", String(option.label));
                if (Array.isArray(option.path) && option.path.length) radio.setAttribute("description", option.path.join(" / "));
                if (index === 0) radio.setAttribute("checked", "");
                list.append(radio);
            });
            content.append(list);
            if (reorder) {
                const placeList = document.createElement("div");
                placeList.setAttribute("role", "radiogroup");
                placeList.setAttribute("aria-label", pageText(DATA_VIEW_TEXT, "movePlace", this));
                placeList.className = "flex gap-2";
                for (const [value, key] of [["last", "moveLast"], ["first", "moveFirst"]]) {
                    const radio = document.createElement("sf-radio");
                    radio.setAttribute("name", `${name}-place`);
                    radio.setAttribute("value", value);
                    radio.setAttribute("label", pageText(DATA_VIEW_TEXT, key, this));
                    if (value === "last") radio.setAttribute("checked", "");
                    placeList.append(radio);
                }
                content.append(placeList);
            }
        }
        const footer = document.createElement("div");
        footer.className = "flex justify-end gap-2";
        const cancel = document.createElement("sf-button");
        cancel.setAttribute("appearance", "outline");
        cancel.setAttribute("text", pageText(DATA_VIEW_TEXT, "cancel", this));
        const confirm = document.createElement("sf-button");
        confirm.setAttribute("text", apply);
        confirm.dataset.apply = "";
        footer.append(cancel, confirm);
        content.append(footer);
        this.append(dialog);
        const checked = (radioName) => [...dialog.querySelectorAll(`sf-radio[name="${radioName}"]`)]
            .find((radio) => radio.checked === true || radio.hasAttribute("checked") && radio.checked !== false);
        return new Promise((settle) => {
            const finish = (value) => {
                dialog.close();
                dialog.remove();
                settle(value);
            };
            cancel.addEventListener("click", () => finish(null));
            dialog.addEventListener("cancel", (event) => {
                event.preventDefault();
                finish(null);
            });
            confirm.addEventListener("click", () => {
                if (!options) return finish(true);
                const parentRadio = checked(name);
                const value = parentRadio?.getAttribute("value") ?? "";
                const option = options.find((item) => (item.id === null ? "" : String(item.id)) === value) ?? options[0];
                const place = reorder ? checked(`${name}-place`)?.getAttribute("value") : "last";
                return finish({parent: option.id, index: place === "first" ? 0 : null});
            });
            dialog.showModal();
        });
    }

    _renderTreeRows() {
        this.records = knownRecords(this.tree);
        this.table?.setRows?.(visibleRows(this.tree));
    }

    // An answer that carries records and nothing else is a patch of those
    // records, not a new page: it has no echo of the query, no total and no
    // columns, so there is nothing to lay out again.
    _isRecordPatch(data) {
        return Boolean(data)
            && Array.isArray(data.records)
            && !data.echo && data.total == null && !data.columns
            && !data.saved_views && !data.column_settings && !data.tree;
    }

    // A checkable cell (record.set, capability inline-edit): the host answers
    // with the record as it now is, asks to confirm first (a change that
    // rewrites records), or refuses; the row is then drawn from what it said.
    async setCell({id, key, value, revision} = {}) {
        if (id == null || !key) return null;
        const record = this.records.find((entry) => String(entry.id) === String(id));
        const answer = await this._raise("record.set", {
            record_id: id, key, value,
            revision: revision ?? record?._revision ?? record?.revision ?? null,
        });
        this.table?.clearCellPending?.(String(id), key);
        // Anything but applied leaves the record as it was, and the box shows
        // the value the host still holds.
        if (answer?.answer !== "applied") {
            const held = this.records.find((entry) => String(entry.id) === String(id));
            this.table?.resetCellControl?.(String(id), key, held?.[key]);
        }
        return answer;
    }

    // Rows dragged into another order (record.reorder, capability
    // row-reorder). Shown in the new order at once; a refusal or a conflict
    // puts the old order back.
    async reorderRows({ids = [], before = null, order = null} = {}) {
        if (!ids.length) return null;
        const previous = this.records;
        if (Array.isArray(order)) {
            const byId = new Map(this.records.map((record) => [String(record.id), record]));
            const placed = order.map((key) => byId.get(String(key))).filter(Boolean);
            if (placed.length === this.records.length) {
                this.records = placed;
                this._renderProjection();
            }
        }
        const first = previous.find((record) => ids.map(String).includes(String(record.id)));
        const answer = await this._raise("record.reorder", {
            record_ids: [...ids], before, revision: first?._revision ?? first?.revision ?? null,
        });
        if (answer?.answer !== "applied") {
            this.records = previous;
            this._renderProjection();
        }
        return answer;
    }

    _applyRecordPatch(records = []) {
        let applied = 0;
        for (const record of records) {
            if (record && record.id != null && this.updateRecord(record.id, record)) applied += 1;
        }
        // A record the page does not hold cannot be patched into it; that is a
        // new row, and only a query knows where it belongs.
        if (applied !== records.length) this.refresh("record-unknown");
        else this.notify("");
        return applied;
    }

    // The catalogue of row actions the table names in its own constructor --
    // the eye for «view», the pencil for «edit». It is captured once and kept,
    // because the projection writes its own narrowed list onto the very same
    // property: reading that list back would make the narrowed list the
    // catalogue, which is what the single read guarded against.
    //
    // The capture used to be one `??=` read of the table's own property with an
    // empty list behind it, which is where the defect was.
    // A list the view draws itself stands in the shadow template, so it is in
    // the tree before sf-table is defined, and an element that has not upgraded
    // carries no ACTIONS_SETTINGS_ROW at all: `[]` was cached, and `??=` never
    // looked again, because `[]` is not nullish. From then on every id was
    // unknown -- the warning below fired and «view» came out as a generic word
    // instead of the eye, on every list (Larena storage QA, 2026-10-22). So the
    // capture looks again while it holds nothing, and the list this view wrote
    // is remembered so it is never taken for the table's own.
    _captureRowActions(table) {
        if (this._knownRowActions?.length) return this._knownRowActions;
        const own = table?.ACTIONS_SETTINGS_ROW;
        const named = Array.isArray(own) && own.length > 0 && own !== this._projectedRowActions;
        this._knownRowActions = named ? own : [];
        if (!named) this._awaitRowActions();
        return this._knownRowActions;
    }

    // Waited for once, and the projection drawn again when the definition
    // lands: on a page whose list has settled nothing else would make the view
    // draw, and the catalogue can only be read from an upgraded element. The
    // Loader is told which tag is wanted, as it is for the move dialog's own
    // elements.
    _awaitRowActions() {
        if (this._awaitingRowActions) return;
        this._awaitingRowActions = true;
        globalThis.SF?.Loader?.ensureSmartElementLoaded?.("sf-table");
        // Read off globalThis and asked for softly: a stand that renders this
        // view over a document of its own need not keep a registry, and a view
        // that cannot wait simply keeps the fallback words.
        const defined = globalThis.customElements?.whenDefined?.("sf-table");
        defined?.then?.(() => {
            if (this.isConnected) this._renderProjection();
        });
    }

    _renderProjection() {
        if (this._current !== undefined && this.table && this.table.current !== this._current) this.table.current = this._current;
        // The saved-view controls appear when the host keeps saved views and
        // not before: this is the only place that runs both when a host is set
        // and when data arrives, which is when the answer can have changed.
        const savedViews = this.shadowRoot?.querySelector?.("[data-saved-views]");
        if (savedViews) {
            savedViews.hidden = !this.hostPort?.capabilities?.includes?.("saved-views");
        }
        this.pagination?.setState?.({showMoreBusy: false});
        // The page row no longer carries the band: the card does, so the strip
        // can hold the bottom of the window without the row coming along. The
        // attribute is written rather than put through setState, which clears a
        // false value by removing the attribute — and a removed `bottom` means
        // the default, which is to draw the band.
        this.pagination?.setAttribute?.("bottom", "false");
        this.pagination?.setAttribute?.("size", this.size);
        this._forwardLabels();
        const table = this.table;
        if (table) {
            // The two chrome columns. Written as attributes rather than left to the
            // table's own defaults, which are both on: an embedded list rendered a
            // checkbox column with «select all rows» and a gear column, and both
            // read as leftovers from a page table -- there is no bulk band and no
            // toolbar in an embedded list for either of them to lead to.
            // A refused list offers nothing to do with it: no selection, no
            // «Создать», no search or filter over rows the person may not see
            // (docs trial 5: they stayed active under «no access»). The
            // author's own toolbar setting comes back with the access.
            const refused = this._queryRefused === true;
            if (!table.hasAttribute?.("data-sf-host-toolbar")) table.setAttribute("data-sf-host-toolbar", table.getAttribute?.("toolbar") ?? "");
            const authorToolbar = table.getAttribute?.("data-sf-host-toolbar");
            if (refused) table.setAttribute("toolbar", "false");
            else if (authorToolbar) table.setAttribute("toolbar", authorToolbar);
            else table.removeAttribute?.("toolbar");
            table.setAttribute("selectable", this.renders("select") && !refused ? "true" : "false");
            // A page's list becomes the compact list on a narrow container; an
            // embedded one (no toolbar) stays a table, and a layout the host
            // wrote on its table is the host's.
            if (!table.hasAttribute?.("data-sf-host-layout")) {
                table.setAttribute("data-sf-host-layout", table.getAttribute?.("layout") ?? "");
            }
            if (!table.getAttribute?.("data-sf-host-layout")) {
                table.setAttribute("layout", this.renders("toolbar") ? "auto" : "table");
            }
            table.setAttribute("size", this.size);
            this._tableScrollMode(table);
            table.setAttribute("settings", this.renders("settings") ? "true" : "false");
            // The column settings, without the column: it also carries each
            // row's menu, which is the host's row-actions, not this.
            table.setAttribute("settings-menu", this.hostOffers("personal-column-settings") ? "true" : "false");
            table.setAttribute("creatable", this.hostOffers("create-record") && !refused ? "true" : "false");
            table.setAttribute("row-reorder", this.hostOffers("row-reorder") && this.treeMode !== "tree" ? "true" : "false");
            table.setAttribute("inline-edit", this.hostOffers("inline-edit") ? "true" : "false");
            // A filter template is a saved view the table keeps by itself; in a
            // view it went nowhere, so it is offered where the host keeps views.
            table.setAttribute("filter-templates", this.hostOffers("saved-views") ? "true" : "false");
            // Row actions are the host's to claim. The intent was already
            // refused without the capability -- answered «unavailable» without
            // the host being called -- but the column and its buttons were drawn
            // all the same, so a person could press an action nothing would ever
            // apply. A view does not show a control the host has not claimed,
            // which is the same rule the saved-view controls already follow
            // (admin polygon, 2026-10-10).
            // A table the host wrote row-actions="false" on keeps it: the host has
            // put every action in its own row menu and still claims the
            // capability, because its menu raises record.open and record.mutate
            // through the port (Larena, 2026-10-12). What the table carried
            // before the view first touched it is the host's word.
            if (!table.hasAttribute?.("data-sf-host-row-actions")) {
                table.setAttribute("data-sf-host-row-actions", table.getAttribute?.("row-actions") ?? "");
            }
            const hostSaysNo = table.getAttribute?.("data-sf-host-row-actions") === "false";
            table.setAttribute(
                "row-actions",
                !hostSaysNo && this.hostPort?.capabilities?.includes("row-actions") ? "true" : "false",
            );
            // The accessible name of a list the host did not slot in. The fallback
            // table carries a name of its own, which is right for a page list and
            // wrong inside a group called «Счета»: it would announce «Записи».
            // Only the fallback is renamed -- a table a host slotted in keeps the
            // name the host gave it.
            const slot = this.shadowRoot.querySelector('slot[name="content"]');
            const own = this.getAttribute("aria-label");
            if (own && slot && !slot.assignedElements().length) table.setAttribute("aria-label", own);
            const allowed = new Set(this.records.flatMap((record) => Array.isArray(record.actions) ? record.actions : []));
            // The catalogue is read once and kept, from an element that has
            // upgraded: narrowing the table's own list in place is destructive,
            // and so is capturing from an element that has nothing to read yet.
            // Both left the catalogue empty, and from then on every id the host
            // named was unknown -- «view» came out as a link labelled "view"
            // instead of the eye, and in a narrow column the label broke
            // mid-word and set the row height. _captureRowActions above.
            const known = this._captureRowActions(table);
            // The host's own actions are named by its catalogue (row_actions,
            // port 1.8.0); an action the catalogue groups is offered once, as
            // the group, with a submenu of the members a record allows. Which
            // members a row shows is still that record's actions alone.
            const catalog = new Map(this.rowActionCatalog.map((entry) => [entry.id, entry]));
            // In a tree, move and create are the view's own actions and named
            // by it, unless the host's catalogue names them.
            const treeActions = this.treeMode === "tree"
                ? {
                    move: pageText(DATA_VIEW_TEXT, "moveAction", this),
                    ...(this.hostOffers("create-record") ? {create: pageText(DATA_VIEW_TEXT, "createChildAction", this)} : {}),
                }
                : {};
            const single = (id) => {
                const entry = catalog.get(id) ?? (treeActions[id] ? {id, label: treeActions[id]} : null);
                if (entry) {
                    return {
                        id, name: entry.label, danger: entry.danger === true, inline: false,
                        component: {type: "button", props: {text: entry.label, appearance: "link", ...(entry.icon ? {icon: entry.icon} : {})}},
                    };
                }
                // An id the host's catalogue does not name gets a word, not its
                // raw id clipped in the column, and the host is told (docs trial 4).
                const found = known.find((action) => action.id === id);
                if (found) return found;
                console.warn(`[sf-data-view] row action «${id}» has no row_actions entry; name it in the host's catalogue.`);
                const label = pageText(DATA_VIEW_TEXT, "unnamedAction", this);
                return {id, name: label, inline: false, component: {type: "button", props: {text: label, appearance: "link", title: id}}};
            };
            const groups = new Map();
            const listed = [];
            for (const id of allowed) {
                const group = catalog.get(id)?.group;
                if (!group) {
                    listed.push(single(id));
                    continue;
                }
                if (!groups.has(group)) {
                    const label = catalog.get(id).group_label ?? group;
                    const entry = {id: `group:${group}`, name: label, members: [], inline: false,
                        component: {type: "button", props: {text: label, appearance: "link"}}};
                    groups.set(group, entry);
                    listed.push(entry);
                }
                groups.get(group).members.push(single(id));
            }
            table.ACTIONS_SETTINGS_ROW = listed;
            // Remembered by identity, so the capture never reads this narrowed
            // list back as the table's own catalogue.
            this._projectedRowActions = listed;
            // A list whose every action lives in the row menu has no actions
            // column to draw.
            if (listed.length && listed.every((action) => action.inline === false)) {
                table.setAttribute("row-actions", "false");
            }
            // The port the list is holding, handed to the table for one thing:
            // the renderer set asks a host how to format a value, and a cell had
            // no host to ask. Only the formatting is read from it -- the table
            // raises its intents as it always has and the view re-raises them.
            table.cellHost = this.hostPort ?? null;
            table.setColumns?.(this.columns);
            if (Array.isArray(this.appended)) {
                // Appending leaves the rows already on screen untouched, so a
                // row that was checked stays checked: the checkbox state lives
                // on the row itself.
                table.addRows?.(this.appended);
            } else {
                table.setRows?.(this.cappedRecords);
            }
            const first = this.query.sort[0];
            table.setSort?.(first?.key ?? null, first?.direction ?? null);
            table.setTemplates?.(Object.fromEntries(this.savedViews.map((view) => [view.key, view])));
        }
        const pagination = this.pagination;
        // Before the first answer there is no count to write. Writing one anyway
        // put «Всего: 0» under a heading that already said 450: the host's own
        // total in the markup was overwritten with this element's initial zero.
        const counted = this._answered
            ? {total: this.total, countKnown: this.countKnown, totalExact: this.totalExact, hasNext: this.hasNext}
            : {};
        // The page size in force is one of the sizes offered: 25 by default
        // against the pager's 10/20/30/40 showed a size the select could not
        // name (docs trial 4). An author's own page-sizes is kept, the size added.
        const sizes = String(pagination?.getAttribute?.("page-sizes") ?? "10,20,30,40").split(/[\s,]+/u).map(Number).filter((size) => Number.isInteger(size) && size > 0);
        const perPage = Number(this.query.per_page);
        if (pagination && Number.isInteger(perPage) && perPage > 0 && !sizes.includes(perPage)) {
            pagination.setAttribute("page-sizes", [...sizes, perPage].sort((a, b) => a - b).join(","));
        }
        pagination?.setState?.({
            current: this.query.page,
            pageSize: this.query.per_page,
            ...counted,
            canCount: Boolean(this.hostPort?.capabilities?.includes("count-on-request")),
            counting: false,
        });
        // The parts a consumer left out. Hidden rather than removed, so turning one
        // back on does not rebuild the shadow tree and lose what a host slotted
        // into it.
        // The shadow template is written once and cannot carry a language: it
        // is built before the element is anywhere. These two are named here,
        // where the page is readable.
        const layout = this.shadowRoot.querySelector('[part="layout"]');
        // The author's name for the view, when it has one: the generic «Представление
        // данных» replaced it (docs trial 4).
        if (layout) layout.setAttribute("aria-label", this.getAttribute("aria-label") || pageText(DATA_VIEW_TEXT, "layoutLabel", this));
        const fallbackTable = this.shadowRoot.querySelector('slot[name="content"] > sf-table');
        if (fallbackTable && !fallbackTable.getAttribute("aria-label")) {
            fallbackTable.setAttribute("aria-label", pageText(DATA_VIEW_TEXT, "recordsLabel", this));
        }
        const toolbar = this.shadowRoot.querySelector('[part="toolbar"]');
        // A slotted table that draws its own toolbar (search, filter) needs no
        // second one: the view's fallback search stood beside the table's, two
        // searches in the documented minimal markup (docs trial 4).
        const slottedTable = this.querySelector(':scope > sf-table[slot="content"]');
        const authorToolbar = slottedTable?.getAttribute("data-sf-host-toolbar") ?? slottedTable?.getAttribute("toolbar");
        const tableHasToolbar = Boolean(slottedTable) && authorToolbar !== "false";
        const ownToolbar = this.querySelector(':scope > [slot="toolbar"]');
        if (toolbar) toolbar.hidden = !this.renders("toolbar") || (tableHasToolbar && !ownToolbar) || this._queryRefused === true;
        const pageRow = this.shadowRoot.querySelector('slot[name="pagination"]');
        // A tree has no pages: a level that is long ends in Show more, and the
        // host gives no total for the page row to count. Nor is there a page
        // row before the first answer or when there is no list to page: it
        // said «Всего: 10» over a loading, failed or refused list (docs trial 4).
        const nothingToCount = !this._answered || this._queryRefused || ["error", "no-access"].includes(this.getAttribute("data-state"));
        if (pageRow) pageRow.hidden = !this.renders("pagination") || this.treeMode === "tree" || nothingToCount;
        if (!this.capHidesRows) {
            if (this._showAll?.isConnected) this._showAll.remove();
            this._showAll = null;
        } else {
            const band = this.showAllBand;
            let button = band.querySelector("[data-show-all]");
            if (!button) {
                button = document.createElement("sf-button");
                button.setAttribute("data-show-all", "");
                button.setAttribute("appearance", "link");
                button.setAttribute("size", "1");
                band.append(button);
            }
            button.setAttribute("text", pageText(DATA_VIEW_TEXT, "showAll", this));
            let count = band.querySelector("[data-show-count]");
            if (!count) {
                count = document.createElement("span");
                count.setAttribute("data-show-count", "");
                band.append(count);
            }
            // «N of M» only when the host has already said M. A count fetched to
            // decide what a link says would spend the host's query on this
            // element's own layout.
            count.textContent = this.countKnown
                ? pageText(DATA_VIEW_TEXT, "ofTotal", this)
                    .replace("{shown}", String(this.cappedRecords.length))
                    .replace("{total}", this._shownTotal(this.total))
                : "";
        }
        const search = this.shadowRoot.querySelector("[data-search]");
        if (search && search.value !== this.query.search) search.value = this.query.search;
        const select = this.shadowRoot.querySelector("[data-view]");
        if (select) {
            const previous = select.value;
            select.replaceChildren(new Option(pageText(DATA_VIEW_TEXT, "currentViewText", this), ""), ...this.savedViews.map((view) => new Option(view.label, view.key)));
            select.value = this.savedViews.some((view) => view.key === previous) ? previous : "";
        }
    }

    saveView({key, label, level = "personal", revision, roles, layout, settings} = {}) {
        if (!key || !label) throw new TypeError("Saved view needs key and label");
        if (!["personal", "shared"].includes(level)) throw new TypeError("Only personal and shared views can be written");
        // Shared views came with port 1.1.0 and stay in every later edition: the
        // test was for 1.1.0 exactly, so 1.2.0 onwards refused them.
        const [major, minor] = String(this.hostPort?.version ?? "0.0.0").split(".").map(Number);
        if (level === "shared" && !(major > 1 || (major === 1 && minor >= 1))) {
            return Promise.resolve({answer: "unavailable", reason: "saved-view-levels-require-port-1.1.0"});
        }
        return this._raise(level === "shared" ? "view.save_shared" : "view.save", {
            key, label, revision, query: copy(this.query),
            roles: copy(roles ?? {}), layout: copy(layout ?? {columns: this.columns}),
            settings: copy(settings ?? this.columnSettings ?? {}),
            ...(level === "shared" ? {target: "shared"} : {}),
        });
    }

    deleteView(key) { return this._raise("view.delete", {key}); }
    // Which view was opened, so its own settings can be put back when the
    // answer arrives: the fields the filter was showing are saved with it.
    openView(key) {
        this._openedView = key;
        return this._raise("view.open", {key});
    }

    // The part of a saved view that belongs to the table rather than to the
    // query: which filter fields it was showing.
    _restoreOpenedView() {
        const key = this._openedView;
        if (!key) return this;
        const view = this.savedViews.find((candidate) => candidate?.key === key);
        if (!view) return this;
        this._openedView = null;
        const fields = view.settings?.filter_fields;
        if (Array.isArray(fields)) {
            this.table?.setActiveFilterFields?.(fields.filter((item) => typeof item === "string"));
        }
        return this;
    }
    saveColumnSettings(columnSettings, {shared = false, base_revision} = {}) {
        const layer = shared ? "shared" : "personal";
        // The port's target.revision is the base when the host sent no layer of
        // that kind yet: the first personal save had none, and a column drag
        // threw an uncaught TypeError that never reached the host (docs trial 4).
        const target = this.columnSettings?.target;
        const targetRevision = target && (target.kind ?? target.target ?? target) === layer ? target.revision : (target?.revision ?? null);
        const revision = base_revision ?? this.columnSettings?.layers?.[layer]?.revision ?? targetRevision;
        if (revision == null) {
            this._showAnswer(shared ? "settings.save_shared" : "settings.save_personal", {answer: "unavailable", reason: "no-base-revision"});
            return Promise.resolve({answer: "unavailable", reason: "no-base-revision"});
        }
        return this._raise(shared ? "settings.save_shared" : "settings.save_personal", {
            columnSettings: copy(columnSettings), base_revision: revision, ...(shared ? {target: "shared"} : {}),
        }).then((answer) => {
            // A conflict means the layer moved on: the revision this view holds
            // is stale, and every later change conflicted with it until a reload
            // (docs trial 5). The view takes the layer's current revision when
            // the host names it, and otherwise reads the list again, whose
            // answer carries the column settings as they are now.
            // The conflict carries current_revision (and the layer's columns)
            // beside answer, as port 1.12.0 states and every host gives it;
            // data.* is read too, for a host that followed 1.10.0's words.
            if (answer?.answer === "conflict") {
                const current = answer.current_revision ?? answer.data?.current_revision;
                const columns = answer.columns ?? answer.data?.columns;
                if (answer.data?.column_settings) this.columnSettings = copy(answer.data.column_settings);
                else if (current != null) {
                    const layers = {...(this.columnSettings?.layers ?? {})};
                    layers[layer] = {...(layers[layer] ?? {}), revision: current, ...(columns ? {columns: copy(columns)} : {})};
                    this.columnSettings = {...(this.columnSettings ?? {}), layers};
                } else this.refresh("settings-conflict");
            }
            return answer;
        });
    }

    // Resetting the person's layer is a write of nothing against its revision,
    // which is exactly what the port calls a reset: "a write against its
    // revision, never a deletion". The empty object matters — the host owns the
    // defaults, and writing this component's idea of them (everything visible,
    // no widths, nothing pinned) would overwrite them.
    resetColumnSettings() {
        return this.saveColumnSettings({}, {});
    }

    // An estimate reads «~N» wherever this element writes the number itself.
    _shownTotal(total) {
        return this.totalExact ? String(total) : `~${total}`;
    }

    applyUnderFilter(actionId, confirmedTotal) {
        // An estimate is not a number anyone can confirm: count first.
        if (!this.totalExact) {
            return this.count("action-for-all").then((answer) => (this.totalExact && answer?.answer === "applied"
                ? this.applyUnderFilter(actionId, this.total)
                : answer));
        }
        if (!Number.isSafeInteger(confirmedTotal) || confirmedTotal !== this.total) {
            throw new TypeError("Confirm the current total before a filter-wide action");
        }
        // A count that moved meanwhile is a conflict carrying the current total
        // (vocabulary §3.1): the page row shows that number at once, so the
        // person confirms what is there now, not what was.
        return this._raise("bulk.apply_under_filter", {
            action_id: actionId, filters: copy(this.query.filters), confirmed_total: confirmedTotal,
        }).then((answer) => {
            const current = answer?.current_total ?? answer?.data?.total;
            if (answer?.answer === "conflict" && Number.isSafeInteger(current) && current >= 0) {
                this.total = current;
                this.totalExact = true;
                this.pagination?.setState?.({total: current, countKnown: true, totalExact: true});
                this._renderBulkBand();
            }
            return answer;
        });
    }

    // The number, asked for on its own. The view resumes whatever wanted it:
    // showing it, jumping to the last page, or an action under the filter that
    // has to name a confirmed total. A refusal puts the view back where it was
    // and says so — a for-all box left ticked over a number nobody has would be
    // a promise the view cannot keep.
    async count(reason = "total") {
        const requested = this._countKey();
        const answer = await this._raise("query.count", {
            query: {search: this.query.search ?? "", filters: copy(this.query.filters ?? {})},
            reason,
        });
        const total = answer?.data?.total;
        if (answer?.answer !== "applied" || !Number.isSafeInteger(total) || total < 0) {
            this.pagination?.setState?.({counting: false});
            if (reason === "action-for-all") this.pagination?.setState?.({actionForAll: false});
            return answer;
        }
        // The query may have moved on while the host was counting; a number
        // belonging to a query nobody is looking at any more is not shown.
        if (requested !== this._countKey()) {
            this.pagination?.setState?.({counting: false});
            return answer;
        }
        this.total = total;
        this.countKnown = true;
        this.totalExact = answer.data.total_exact !== false;
        this.countedQuery = requested;
        this.pagination?.setState?.({counting: false, countKnown: true, totalExact: this.totalExact, total});
        if (reason === "last-page") this.pagination?.lastPage?.();
        return answer;
    }

    _action(detail, {selectedBulk = false} = {}) {
        const ids = detail?.record_ids;
        if (!Array.isArray(ids) || !ids.length || typeof detail.action_id !== "string") return;
        const chosen = ids.map((id) => this.records.find((record) => record.id === id));
        // In a tree two of a record's actions are the view's own: move opens
        // the choice of the places the host offers, create makes a node under
        // it. Each is offered only when the record lists it.
        if (this.treeMode === "tree" && !selectedBulk && ids.length === 1 && chosen[0]?.actions?.includes(detail.action_id)) {
            if (detail.action_id === "move") return this.openMoveDialog(chosen[0]);
            if (detail.action_id === "create") return this._raise("view.create_record", {item: null, parent: chosen[0].id});
        }
        // A selected-bulk action has its own ID and permission in the host, even
        // when just one row is selected. The host checks the whole batch.
        if (chosen.some((record) => !record)
            || (!selectedBulk && ids.length === 1 && !chosen[0].actions?.includes(detail.action_id))) {
            this._showAnswer("record.mutate", {answer: "refused", reason: "action-not-allowed"});
            return;
        }
        // Opening a record is a request a page or an assembly takes
        // (vocabulary §5 open {id}): sf-data-view-open, then the host's
        // record.open unless a listener refused it (preventDefault).
        if (!selectedBulk && ids.length === 1 && detail.action_id === "view") {
            const allowed = this.sfEmit("open", {id: ids[0]}, {cancelable: true});
            return allowed ? this._raise("record.open", detail) : null;
        }
        const revisions = Object.fromEntries(chosen.map((record) => [String(record.id), record.revision]));
        const written = this._raise(selectedBulk || ids.length > 1 ? "bulk.apply_selected" : "record.mutate", {...detail, revisions});
        // The fact a screen closes a deleted record on (vocabulary §4: a
        // fact after applied): sf-data-view-deleted {ids}.
        if (detail.action_id === "delete") {
            return Promise.resolve(written).then((answer) => {
                if (answer?.answer === "applied") this.sfEmit("deleted", {ids: [...ids]});
                return answer;
            });
        }
        return written;
    }

    // A value pointing at another record opens it in the host's panel without
    // loading a page (owner, 2026-10-14). Taken only when the host opens
    // records; when its answer is not an opening, the address is followed, so
    // the click still goes somewhere.
    _openReference(event) {
        if (!this.hostPort || !this.hostOffers("row-actions")) return;
        event.preventDefault();
        // The table's detail is camelCase on the element (standard 1.3.8 §3.2);
        // the port's payload is snake_case.
        const {href, recordId, record_id: recordIdBefore, ...detail} = event.detail ?? {};
        return this._raise("record.open", {...detail, record_id: recordId ?? recordIdBefore ?? null, href}).then((answer) => {
            if (!["applied", "accepted", "opened"].includes(answer?.answer) && href) globalThis.location?.assign?.(href);
        });
    }

    _onEvent(event) {
        if (this._seenEvents.has(event)) return;
        this._seenEvents.add(event);
        // The port's event for a shared saved view (view.save_shared): a page
        // raises it on the view itself, so it is taken before the rule that
        // ignores the view's own events. It was declared and never listened to.
        if (event.type === "sf-data-view-saved-view-intent") {
            if (event.currentTarget !== this) return;
            const view = event.detail ?? {};
            return this.saveView({key: view.key, label: view.label ?? view.key, revision: view.revision, level: "shared", roles: view.roles});
        }
        if (event.target === this || event.target?.closest?.("sf-data-view") !== this && !this.shadowRoot.contains(event.target)) return;
        // An event crossing the shadow boundary is observed once, at the shadow root.
        if (event.currentTarget === this && this.shadowRoot.contains(event.target)) return;
        if (event.type === "change" && event.target.matches?.("[data-search]")) return this.changeQuery({search: event.target.value}, "search");
        if (event.type === "change" && event.target.matches?.("[data-view]")) return event.target.value && this.openView(event.target.value);
        if (event.type === "click" && event.target.matches?.("[data-show-all]")) return this.openList("row-cap");
        if (event.type === "click" && event.target.matches?.("[data-save]")) {
            const label = this.shadowRoot.querySelector("[data-view-name]")?.value?.trim();
            if (label) return this.saveView({key: label, label});
        }
        if (event.type === "click" && event.target.matches?.("[data-delete]")) {
            const key = this.shadowRoot.querySelector("[data-view]").value;
            if (key) return this.deleteView(key);
        }
        if (event.type === "sf-table-cell-set") return this.setCell(event.detail ?? {});
        if (event.type === "sf-table-move") return this.reorderRows(event.detail ?? {});
        if (event.type === "sf-table-search-change") {
            const search = typeof event.detail === "object" && event.detail !== null ? event.detail.search : event.detail;
            return this.changeQuery({search: String(search ?? "")}, "search");
        }
        if (event.type === "sf-table-filter-change") return this.changeQuery({filters: copy(event.detail?.filters ?? event.detail?.values ?? event.detail ?? {})}, "filter");
        if (event.type === "sf-table-sort-change") {
            const sort = event.detail?.direction ? [copy(event.detail)] : [];
            this._keepPreference({sort});
            return this.changeQuery({sort}, "sort");
        }
        if (event.type === "sf-pagination-change") return this.changeQuery({page: event.detail?.current}, "page-change");
        if (event.type === "sf-pagination-size-change") {
            const size = event.detail?.["page-size"];
            if (Number.isInteger(size)) this._keepPreference({pageSize: size});
            // Another page size reads the list from its first page.
            return this.changeQuery({per_page: size, page: 1}, "page-size-change");
        }
        if (event.type === "sf-pagination-load-more") return this.changeQuery({page: this.query.page + 1}, "show-more");
        if (event.type === "sf-pagination-count") return this.count(event.detail?.reason ?? "total");
        if (event.type === "sf-table-column-settings-reset") return this.resetColumnSettings();
        // The panel's cross says the selection is over. The rows hold it, so
        // the view passes the word on rather than tracking a copy of its own.
        if (event.type === "sf-pagination-selection-clear") return this.clearSelection();
        if (event.type === "sf-pagination-action-change" || event.type === "sf-pagination-action-for-all-change") {
            // The chooser and For-all live in the band now; the pagination still
            // holds their state, so the band is redrawn when it changes.
            this._renderBulkBand();
            return undefined;
        }
        if (event.type === "sf-table-refresh") return this.refresh("retry");
        if (event.type === "sf-table-reference-open") return this._openReference(event);
        if (event.type === "sf-table-expand") {
            const id = event.detail?.id;
            return event.detail?.expanded ? this.collapseNode(id) : this.expandNode(id);
        }
        if (event.type === "sf-table-load-more") return this.loadMoreNodes(event.detail?.parent, event.detail?.cursor);
        if (event.type === "sf-table-apply") return this._action({action_id: event.detail?.action, record_ids: event.detail?.ids}, {selectedBulk: event.detail?.scope === "selection"});
        if (event.type === "sf-table-save") {
            return this.saveColumnSettings(event.detail?.columnSettings ?? event.detail, {
                shared: event.detail?.target === "shared", base_revision: event.detail?.base_revision,
            });
        }
        if (event.type === "sf-pagination-apply") {
            if (event.detail?.scope === "filter") return this.applyUnderFilter(event.detail.action, event.detail.total);
            return this._action({action_id: event.detail?.action, record_ids: this.table?.getSelectedRecordIds?.() ?? []}, {selectedBulk: true});
        }
        if (event.type === "sf-table-select") {
            this.pagination?.setState?.({selectedCount: event.detail?.ids?.length ?? 0});
            this._renderBulkBand();
            return;
        }
        const intent = EVENTS[event.type];
        if (intent === "query.change") return this.refresh("table-context");
        if (intent === "view.save") {
            // Reordering or pinning on the templates tab sends every changed
            // template at once, as an array: each one is its own save (it threw
            // «Saved view needs key and label» on the array itself).
            const save = (view = {}) => this.saveView({key: view.key, label: view.label ?? view.name ?? view.key, revision: view.revision,
                level: view.level ?? "personal", roles: view.roles, layout: view.layout, settings: view.settings});
            const detail = event.detail ?? {};
            return Array.isArray(detail) ? Promise.all(detail.filter((view) => view?.key).map(save)) : save(detail);
        }
        if (intent) return this._raise(intent, copy(event.detail ?? {}));
    }
}

// Not a Smart base element, so it carries the same brand by hand: quiet when
// the component arrives twice, loud when something else holds the tag.
SfDataView.sfElementBrand = "simai.smart-base.v1";
answerActions(SfDataView, manifest);
settingSetters(SfDataView, manifest);
const definedDataView = customElements.get("sf-data-view");
if (!definedDataView) customElements.define("sf-data-view", SfDataView);
else if (definedDataView.sfElementBrand !== SfDataView.sfElementBrand) {
    console.warn("SfDataView.define(): sf-data-view is already defined", definedDataView);
}
export default SfDataView;
