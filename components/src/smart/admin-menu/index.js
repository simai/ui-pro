import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {noteDeprecated} from "../../core/js/deprecations";
import manifest from "./component.json";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";
import {renderAdminMenuTemplate} from "./js/templates/default";
import {html, render} from "lit";
import {setParentSpace} from "../helpers/dom";
import {bindSortableDrag} from "../helpers/draggable";
import BundledPosition from "../../core/js/position.js";
import {pageText} from "../../core/js/page-language";
import {
    NavigationController,
    NAVIGATION_PORT,
    SUPPORTED_NAVIGATION_VERSIONS,
} from "./js/navigation/controller";
import {renderNavigationTemplate} from "./js/navigation/template";
import {wordsOf} from "./js/words.js";

// Prefer the helper Core published; an isolated bundle uses its own copy.
const positioning = () => globalThis.SF?.Position || BundledPosition;

const contextPortalOwners = new WeakMap();

function isAdminMenuItemNode(node) {
    return (
        node?.nodeType === Node.ELEMENT_NODE &&
        node?.tagName?.toLowerCase?.() === "sf-admin-menu-item"
    );
}

function getDirectLabel(node) {
    return Array.from(node?.childNodes || [])
        .filter((child) => !isAdminMenuItemNode(child))
        .map((child) => child.textContent || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeSlot(value = "") {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();

    return ["bottom", "footer"].includes(normalized) ? "bottom" : "main";
}

function normalizeItemType(node) {
    const type = String(node?.getAttribute?.("type") || "")
        .trim()
        .toLowerCase();

    return node?.hasAttribute?.("divider") ||
    type === "divider" ||
    type === "separator"
        ? "divider"
        : "item";
}

function createPanelId(path = []) {
    return `admin-menu-${path.join("-") || "root"}`;
}

function parseOrder(value, fallback = 0) {
    if (value === null || typeof value === "undefined" || value === "") {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function sortItemsByOrder(items = []) {
    return [...items].sort((left, right) => {
        if (left.order !== right.order) {
            return left.order - right.order;
        }

        return left.sourceIndex - right.sourceIndex;
    });
}

const LEGACY_MENU_SETTINGS_STORAGE_KEY = "main-menu-settings";
const MENU_TRANSLATIONS = wordsOf({
    save: "save",
    hide: "hide",
    show: "show",
    settingsTitle: "settings-title",
    searchPlaceholder: "search-placeholder",
    toggleLabel: "toggle-label",
    searchLabel: "search-label",
    searchKeysHint: "search-keys-hint",
});

// What the person typed, compared the way a person means it: case does not
// matter, ё reads as е, and the end of a word is dropped so that "роль" finds
// "Роли" and "платёж" finds "Платежи". The truncation is crude — it is not a
// morphology — but it is the rule the consumer's owner approved, and a crude
// rule that always behaves the same way is easier to live with than a clever
// one that sometimes does not.
const normalizeSearchWord = (value = "") =>
    String(value || "").toLowerCase().replace(/ё/gu, "е");
const searchStem = (query = "") => {
    const word = normalizeSearchWord(query).trim();
    if (word.length < 4) return word;

    return word.slice(0, word.length - (word.length > 5 ? 2 : 1));
};
// Only an address inside this site is followed. A host result naming another
// origin is dropped rather than rendered as a link nobody vetted.
const isSameSiteHref = (href = "") => {
    const value = String(href ?? "").trim();
    if (!value || value.startsWith("//")) return false;
    try {
        const resolved = new URL(value, document.baseURI);
        return resolved.origin === new URL(document.baseURI).origin;
    } catch {
        return false;
    }
};

// The shared rule rather than a second copy of it. This read only the
// document's lang; `pageText` reads the nearest [lang] first, which is what
// every other component does and what src/core/js/page-language exists to make
// true -- «one rule for every component, so a page never mixes the two because
// two components looked in different places».
function documentMenuText(key, node) {
    return pageText(MENU_TRANSLATIONS, key, node ?? globalThis.document?.documentElement ?? null);
}

function isSameSettings(left = {}, right = {}) {
    const keys = new Set([
        ...Object.keys(left || {}),
        ...Object.keys(right || {}),
    ]);

    for (const key of keys) {
        if (!Object.is(left?.[key], right?.[key])) {
            return false;
        }
    }

    return true;
}

// From its component.json (standard simai.smart-component 1.3.8 §3, §4, §8,
// §11): the settings are declared there and their words are lang/<locale>.json
// (js/words.js makes the menu's dictionaries from them); the class keeps its
// own reading of each setting (props below), which the manifest's agree with.
// The events take the vocabulary's verbs: what a person asks of the host is
// sf-admin-menu-<verb> (open, toggle, save, query, create, rename, delete,
// reset, refresh, sign-out) instead of one sf-admin-menu-intent, which follows
// each of them until 2026-12-01 (aliases.json, split by the detail's intent).
const AdminMenuElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    aliases,
});

class SfAdminMenu extends AdminMenuElement {
    static get props() {
        return {
            ...super.props,
            templateName: {attribute: "template", default: "default"},
            brand: {default: ""},
            logo: {default: ""},
            logoHref: {attribute: "logo-href", default: "#"},
            ariaLabel: {attribute: "aria-label", default: "Admin menu"},
            searchable: {type: Boolean, default: false},
            collapsible: {type: Boolean, default: false},
            settings: {type: Boolean, default: true},
            settingsTitle: {default: documentMenuText("settingsTitle")},
            compact: {type: Boolean, default: false},
            persistenceMode: {
                attribute: "persistence-mode",
                default: "local",
            },
            settingsMode: {attribute: "settings-mode", default: "user"},
            settingsRevision: {
                attribute: "settings-revision",
                type: Number,
                default: 0,
            },
            systemSettingsRevision: {
                attribute: "system-settings-revision",
                type: Number,
                default: 0,
            },
            allowSystemSettings: {
                attribute: "allow-system-settings",
                type: Boolean,
                default: false,
            },
            searchPlaceholder: {
                attribute: "search-placeholder",
                default: documentMenuText("searchPlaceholder"),
            },
            // The search as a panel instead of a row. The default is what every
            // page already has, so nothing moves under a host that says nothing.
            searchMode: {attribute: "search-mode", default: "row"},
            searchLabel: {
                attribute: "search-label",
                default: documentMenuText("searchLabel"),
            },
            // The panel's own title. `search-label` is the magnifier's accessible
            // name and usually a sentence with the shortcut in it, which is not
            // a title; a host that wants its own word for the panel sets this.
            searchTitle: {attribute: "search-title", default: ""},
            searchShortcut: {attribute: "search-shortcut", default: "mod+k"},
            searchHint: {attribute: "search-hint", default: ""},
            searchKeysHint: {
                attribute: "search-keys-hint",
                default: documentMenuText("searchKeysHint"),
            },
            count: 0,
            toggleLabel: {attribute: "toggle-label", default: documentMenuText("toggleLabel")},
            panelClass: {attribute: "panel-class", default: ""},
            rootClass: {default: ""},
        };
    }

    constructor() {
        super();
        this.refs = {
            mainPanel: this.createRef(),
            menuPanel: this.createRef(),
            contextMenu: this.createRef(),
            items: new Map(),
        };
        this.createdItems = [];
        this._itemObserver = null;
        this.parentGap = 0;
        this.contextTarget = null;
        this._itemsData = [];
        this._itemHeightCache = new Map();
        this.resizeObserver = null;
        this._adminMenuInitToken = 0;
        this._searchSequence = 0;
        this._searchRequestId = null;
        this._searchDebounce = null;
        this._panels = {};
        this.debounce = (callback, delay = 300) => {
            let timerId;

            return (...args) => {
                clearTimeout(timerId);

                timerId = setTimeout(() => {
                    callback.apply(this, args);
                }, delay);
            };
        };
        this.search = this.debounce(this.startSearch);
        this.menuSettings = {};
        this._settingsBaseline = {};
        this._itemsBaseline = [];
        this._layoutSettings = {};
        this._layoutBaseline = {};
        this._compactBaseline = false;
        this._settingsStorageError = "";
        this._settingsStorageWarningIssued = false;
        this.contextEvent = this.contextEvent.bind(this);
        this.contextKeyEvent = this.contextKeyEvent.bind(this);
        this.contextFocusEvent = this.contextFocusEvent.bind(this);
        this._contextEventBound = false;
        this._contextOpenToken = 0;
        this._contextPortal = null;
        this._contextReturnFocus = null;
        this._contextReadyHandler = null;
        this._contextTriggerAttributes = null;
        this._contextGeometryFrame = null;
        this._contextSizeObserver = null;
        this._contextSizeTarget = null;
        this._contextScrollPositions = new Map();
        this._panelReturnFocus = new Map();
        this._navigationFocusToken = 0;
        this.scheduleContextGeometry = this.scheduleContextGeometry.bind(this);
        this.contextScrollEvent = this.contextScrollEvent.bind(this);
        this.addEventListener("sf-after-render", (event) => {
            if (event.target !== this && event.target.closest?.("sf-admin-menu") === this) {
                this.syncContextTriggers();
            }
        });
        this.state = {
            panels: {},
            menuSettings: false,
            openSearch: false,
            searchQuery: "",
            searchResults: [],
            // What the host has answered for the query on screen, whether an
            // answer is still on its way, and which result the keyboard is on.
            searchGroups: [],
            // What the host offers before anything is typed, as a recent list.
            searchRecent: [],
            searchPending: false,
            searchActiveId: "",
            visible: {},
            hasHidden: false,
            open: false,
            settingsStatus: "idle",
            settingsError: "",
        };
    }

    translate(key) {
        return documentMenuText(key);
    }

    connectedCallback() {
        // A printed JSON island first (standard 1.3.8 §5.4): the settings read
        // below, before the base's connect, may be in it (recent-results).
        this.sfReadIsland();
        this._reflectOpen();
        // The navigation shell, when a host answers with its port. Asked before
        // anything else, because the answer decides which menu this is: with a
        // navigation port none of the `items` menu's listeners, observers or
        // settings baseline exist, and two menus' behaviours in one element
        // would be two answers to one key.
        this._requestHostPort();
        // Reconnected after a move: the port is kept, the controller that
        // listened on the document is not.
        if (this.hostPort && !this._navigation) this._navigation = new NavigationController(this, this.hostPort);
        if (this._navigation) {
            super.connectedCallback();
            this._navigation.load("connected");
            return;
        }
        this.bindSearchShortcut();
        this.observeItemChildren();
        this.menuSettings = this.getMainMenuSettings();
        this.captureInitialItems();
        this.commitSettingsBaseline();

        this.set({
            panels: {
                ...this._panels,
            },
        });
        super.connectedCallback();
        this.whenRendered(() => {
            this.emitCompactChange("connected");
        }, {next: true});
    }

    disconnectedCallback() {
        // Once per connection, so an element moved in the DOM asks again.
        this._portRequested = false;
        if (this._navigation) {
            // The port stays with the element: moved in the DOM, it reconnects
            // to the same host rather than asking a second time.
            this._navigation.dispose();
            this._navigation = null;
            super.disconnectedCallback();
            return;
        }
        this.unbindSearchShortcut();
        this.unbindContextEvent();
        this.closeContextMenu({restoreFocus: false});
        this.disconnectItemObserver();
        this.resizeObserver?.disconnect?.();
        this.resizeObserver = null;
        this._adminMenuInitToken++;
        this._navigationFocusToken++;
        this._panelReturnFocus.clear();
        super.disconnectedCallback();
    }

    itemNodeToData(node, path = []) {
        const sourceIndex = path[path.length - 1] || 0;
        const type = normalizeItemType(node);
        const children =
            type === "divider"
                ? []
                : sortItemsByOrder(
                    Array.from(node?.children || [])
                        .filter(isAdminMenuItemNode)
                        .map((child, index) =>
                            this.itemNodeToData(child, [...path, index]),
                        ),
                );
        const label =
            node.getAttribute("label") ||
            node.getAttribute("text") ||
            node.getAttribute("title") ||
            getDirectLabel(node);

        const data = {
            type,
            label,
            leftIcon: node.getAttribute("left-icon") || "",
            rightIcon: node.getAttribute("right-icon") || "",
            href: node.getAttribute("href") || "",
            target: node.getAttribute("target") || "",
            rel: node.getAttribute("rel") || "",
            badge: node.getAttribute("badge") || "",
            value: node.getAttribute("value") || "",
            hidden: node.hasAttribute("hidden"),
            placeholder:
                type === "divider" ? false : node.getAttribute("placeholder") || true,
            order: parseOrder(node.getAttribute("order"), sourceIndex),
            sourceIndex,
            slot: normalizeSlot(
                node.getAttribute("slot") || node.getAttribute("position"),
            ),
            activePanels: {},
            active: node.hasAttribute("active"),
            current: node.hasAttribute("current"),
            disabled: node.hasAttribute("disabled"),
            children,
            itemId:
                node.getAttribute("item-id") ||
                node.getAttribute("panelId") ||
                createPanelId(path),
            panelId:
                node.getAttribute("item-id") ||
                node.getAttribute("panelId") ||
                createPanelId(path),
        };
        return this.applyMenuItemSettings(data);
    }

    getMenuItemSettings(panelId) {
        if (
            !panelId ||
            !this.menuSettings ||
            typeof this.menuSettings !== "object"
        ) {
            return {};
        }

        const settings = this.menuSettings[panelId];
        return settings && typeof settings === "object" ? settings : {};
    }

    applyMenuItemSettings(item = {}) {
        const settings = this.getMenuItemSettings(item.panelId);
        if (!Object.keys(settings).length) {
            return item;
        }

        return {
            ...item,
            ...settings,
            panelId: item.panelId,
            children: item.children,
        };
    }

    patchMenuItemSettings(panelId, patch = {}, options = {}) {
        if (!panelId) return {};

        const currentSettings =
            this.menuSettings && typeof this.menuSettings === "object"
                ? this.menuSettings
                : {};
        const currentItemSettings = this.getMenuItemSettings(panelId);
        const nextPatch =
            typeof patch === "function" ? patch(currentItemSettings) : patch;
        const nextItemSettings = {
            ...currentItemSettings,
            ...(nextPatch || {}),
        };

        if (isSameSettings(currentItemSettings, nextItemSettings)) {
            return currentItemSettings;
        }

        this.menuSettings = {
            ...currentSettings,
            [panelId]: nextItemSettings,
        };

        if (options.persist === true && this.isLocalPersistence()) {
            this.persistMenuSettings();
        }

        return nextItemSettings;
    }

    removeMenuItemSettings(panelId, keys = null, options = {}) {
        if (!panelId || !this.menuSettings?.[panelId]) {
            return {};
        }

        if (!keys) {
            const {[panelId]: removed, ...rest} = this.menuSettings;
            this.menuSettings = rest;
            if (options.persist === true && this.isLocalPersistence()) {
                this.persistMenuSettings();
            }
            return removed || {};
        }

        const keysList = Array.isArray(keys) ? keys : [keys];
        const nextItemSettings = {...this.menuSettings[panelId]};
        keysList.forEach((key) => {
            delete nextItemSettings[key];
        });

        if (isSameSettings(this.menuSettings[panelId], nextItemSettings)) {
            return this.menuSettings[panelId];
        }

        this.menuSettings = {
            ...this.menuSettings,
            [panelId]: nextItemSettings,
        };

        if (options.persist === true && this.isLocalPersistence()) {
            this.persistMenuSettings();
        }

        return nextItemSettings;
    }

    persistMenuSettings() {
        if (!this.isLocalPersistence()) return false;

        try {
            const nextValue = JSON.stringify(this.menuSettings || {});
            const storageKey = this.getMenuSettingsStorageKey();
            const storage = window.localStorage;
            if (storage.getItem(storageKey) === nextValue) {
                this._settingsStorageError = "";
                return false;
            }

            storage.setItem(storageKey, nextValue);
            this._settingsStorageError = "";
            return true;
        } catch (error) {
            this.handleSettingsStorageError(error, true);
            return false;
        }
    }

    clearMenuSettingsStorage() {
        try {
            const storage = window.localStorage;
            storage.removeItem(this.getMenuSettingsStorageKey());
            storage.removeItem(LEGACY_MENU_SETTINGS_STORAGE_KEY);
            this._settingsStorageError = "";
            return true;
        } catch (error) {
            this.handleSettingsStorageError(error, true);
            return false;
        }
    }

    handleSettingsStorageError(error, expose = false) {
        this._settingsStorageError = "settings_storage_failed";
        if (!this._settingsStorageWarningIssued) {
            this._settingsStorageWarningIssued = true;
            console.warn("SF AdminMenu: browser settings storage is unavailable", error);
        }
        if (expose) {
            this.set({
                settingsStatus: "error",
                settingsError: "",
            }, "settingsStorageError");
        }
    }

    createDivider() {
        const divider = document.createElement("sf-admin-menu-item");
        divider.setAttribute("type", "divider");
        const data = this.itemNodeToData(divider, [
            `custom-divider-${this._itemsData.length + 1}`,
        ]);
        this.createdItems.push(data);
        this._itemsData = [data, ...this._itemsData];
        this.requestComponentUpdate("createDivider");
    }

    findItemByPanelId(panelId, items = this._itemsData) {
        if (!panelId) return null;

        for (const item of items || []) {
            if (item.panelId === panelId) {
                return item;
            }

            const child = this.findItemByPanelId(panelId, item.children || []);
            if (child) {
                return child;
            }
        }

        return null;
    }

    updateItemByPanelId(panelId, updater, items = this._itemsData) {
        return (items || []).map((item) => {
            if (item.panelId === panelId) {
                return updater(item);
            }

            if (item.children?.length) {
                return {
                    ...item,
                    children: this.updateItemByPanelId(panelId, updater, item.children),
                };
            }

            return item;
        });
    }

    mapItems(updater, items = this._itemsData) {
        return (items || []).map((item) => {
            const nextItem = updater(item);

            return {
                ...nextItem,
                children: nextItem.children?.length
                    ? this.mapItems(updater, nextItem.children)
                    : nextItem.children,
            };
        });
    }

    toggleHidden() {
        const visible = {...(this.state.visible || {})};

        this._itemsData = this.mapItems((item) => {
            const isStoredHidden =
                this.getMenuItemSettings(item.panelId).hidden === true;
            const isTempVisible = visible[item.panelId]?.temp === true;

            if (!isStoredHidden && !isTempVisible) {
                return item;
            }

            const nextTemp = !isTempVisible;

            visible[item.panelId] = {
                ...(visible[item.panelId] || {}),
                temp: nextTemp,
            };

            return {
                ...item,
                hidden: isStoredHidden && !nextTemp,
            };
        });

        this.set({visible}, "toggleHidden");
    }

    toggleItemVisibility(item, visibility) {
        const li = item.closest("li");
        const {panelId} = li.dataset;
        this.patchMenuItemSettings(panelId, {hidden: !visibility});
        this._itemsData = this.updateItemByPanelId(panelId, (el) => ({
            ...el,
            hidden: !visibility,
        }));
        const visible = {...(this.state.visible || {})};
        if (!visibility) {
            delete visible[panelId];
        } else {
            visible[panelId] = {visible: true};
        }
        this.closeContextMenu();
        this.set({visible}, "toggleItemVisibility");
    }

    deleteItem(item) {
        const li = item.closest("li");
        const {panelId} = li.dataset;
        this._itemsData = this._itemsData.filter((el) => el.panelId !== panelId);
        this.closeContextMenu();
        this.requestComponentUpdate("deleteItem");
    }

    isSearchPanelMode() {
        return this.getProp("searchMode") === "panel";
    }

    // The shortcut opens the search from anywhere on the page. It is an
    // attribute so a host can change it, and an empty one turns it off — a
    // Framework component has no business holding a page-wide key hostage.
    parseSearchShortcut(value = this.getProp("searchShortcut")) {
        const text = String(value ?? "").trim().toLowerCase();
        if (!text) return null;
        const parts = text.split("+").map((part) => part.trim()).filter(Boolean);
        const key = parts.pop() || "";
        if (!key) return null;

        return {
            key,
            mod: parts.includes("mod"),
            ctrl: parts.includes("ctrl"),
            meta: parts.includes("meta") || parts.includes("cmd"),
            shift: parts.includes("shift"),
            alt: parts.includes("alt"),
        };
    }

    bindSearchShortcut() {
        if (this._searchShortcutBound) return this;
        this._searchShortcutBound = (event) => this.handleSearchShortcut(event);
        document.addEventListener("keydown", this._searchShortcutBound);
        return this;
    }

    unbindSearchShortcut() {
        if (!this._searchShortcutBound) return this;
        document.removeEventListener("keydown", this._searchShortcutBound);
        this._searchShortcutBound = null;
        return this;
    }

    handleSearchShortcut(event) {
        if (!this.isSearchPanelMode()) return this;
        const shortcut = this.parseSearchShortcut();
        if (!shortcut) return this;
        if (String(event.key || "").toLowerCase() !== shortcut.key) return this;
        const modifier = shortcut.mod
            ? event.ctrlKey || event.metaKey
            : (!shortcut.ctrl || event.ctrlKey) && (!shortcut.meta || event.metaKey);
        if (!modifier) return this;
        if (shortcut.shift && !event.shiftKey) return this;
        if (shortcut.alt && !event.altKey) return this;
        event.preventDefault();

        return this.openSearchPanel();
    }

    openSearchPanel() {
        if (!this.isSearchPanelMode()) return this;
        const opener = this.getSearchToggle();
        if (opener) this._panelReturnFocus.set("search_panel", opener);
        this._searchOpenedCompact = this.getProp("compact") !== false;
        if (this._searchOpenedCompact) this.setCompact(false, "search");
        this.set((state) => ({
            openSearch: true,
            panels: {
                ...(state.panels || {}),
                search_panel: {...(state.panels?.search_panel || {}), open: true},
            },
        }));
        this.scheduleNavigationFocus(() => this.getSearchInput());

        return this;
    }

    closeSearchPanel() {
        this.clearSearchDebounce();
        this._searchRequestId = null;
        this.set((state) => ({
            openSearch: false,
            searchQuery: "",
            searchResults: [],
            searchGroups: [],
            searchPending: false,
            searchActiveId: "",
            panels: {
                ...(state.panels || {}),
                search_panel: {...(state.panels?.search_panel || {}), open: false},
            },
        }));
        // The panel is wide, so a collapsed menu was expanded to carry it.
        // Closing gives that menu back the way it was found.
        if (this._searchOpenedCompact) {
            this._searchOpenedCompact = false;
            this.setCompact(true, "search-close");
        }
        const returnFocus = this._panelReturnFocus.get("search_panel");
        this._panelReturnFocus.delete("search_panel");
        this.scheduleNavigationFocus(() => this.getSearchReturnTarget(returnFocus));

        return this;
    }

    // Where the panel gives the focus back. The opener first; then the
    // magnifier. Both of those live in the main menu, which is inert while a
    // submenu is open — then the place the user is actually standing in is that
    // submenu, so its back row takes the focus rather than nothing at all.
    getSearchReturnTarget(returnFocus = null) {
        if (this.isAvailableNavigationTarget(returnFocus)) return returnFocus;
        const toggle = this.getSearchToggle();
        if (this.isAvailableNavigationTarget(toggle)) return toggle;
        const panels = [...this.querySelectorAll(".sf-admin-menu-panel-sub.open")];
        for (let index = panels.length - 1; index >= 0; index -= 1) {
            const back = panels[index].querySelector(".sf-admin-menu-back");
            if (this.isAvailableNavigationTarget(back)) return back;
        }

        return null;
    }

    getSearchToggle() {
        return this.querySelector('[data-sf-admin-search-toggle]');
    }

    normalizeSearchText(text = "") {
        return String(text || "")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();
    }

    flattenMenuItems(items = [], parentPath = [], parentPanels = []) {
        return items.flatMap((item) => {
            if (item.hidden || item.type === "divider") {
                return [];
            }

            const path = [...parentPath, item.label].filter(Boolean);
            const panelPath = [...parentPanels];
            const current = {
                ...item,
                path,
                panelPath,
                searchText: this.normalizeSearchText(path.join(" ")),
                searchLabel: this.normalizeSearchText(item.label),
            };
            const childPanels = item.children?.length
                ? [...panelPath, item.panelId]
                : panelPath;

            return [
                current,
                ...this.flattenMenuItems(item.children || [], path, childPanels),
            ];
        });
    }

    scoreSearchItem(item, query) {
        if (!query) return 0;
        if (item.searchLabel === query) return 100;
        if (item.searchLabel.startsWith(query)) return 90;
        if (item.searchLabel.includes(query)) return 70;
        if (item.searchText.includes(query)) return 40;

        return 0;
    }

    getSearchResults(text = "") {
        const query = this.normalizeSearchText(text);
        if (!query) return [];

        return this.flattenMenuItems(this._itemsData)
            .map((item) => ({
                ...item,
                score: this.scoreSearchItem(item, query),
            }))
            .filter((item) => item.score > 0 && !item.disabled)
            .sort((left, right) => {
                if (right.score !== left.score) return right.score - left.score;
                return left.path.join(" ").localeCompare(right.path.join(" "));
            })
            .slice(0, 20);
    }

    // What the field calls on every keystroke. Both templates have called this
    // since the row was added, and nothing answered: `search` was never defined,
    // so typing in the row raised a TypeError and searched nothing. It is one
    // line, and it is the only way into searching from the page.
    search(text = "") {
        return this.startSearch(text);
    }

    clearSearchDebounce() {
        if (this._searchDebounce) {
            clearTimeout(this._searchDebounce);
            this._searchDebounce = null;
        }
        return this;
    }

    // The menu's own answer: its sections, including the nested ones, each with
    // the section it sits in and the part that matched, so the panel can show
    // where a result lives and what it matched on.
    getSectionResults(text = "") {
        const stem = searchStem(text);
        if (!stem) return [];

        return this.flattenMenuItems(this._itemsData)
            .filter((item) => !item.disabled && item.label)
            .map((item) => {
                const label = String(item.label || "");
                const index = normalizeSearchWord(label).indexOf(stem);
                if (index < 0) return null;
                const parentPath = item.path.slice(0, -1);

                return {
                    ...item,
                    parentLabel: parentPath[parentPath.length - 1] || "",
                    match: {start: index, length: stem.length},
                };
            })
            .filter(Boolean)
            .slice(0, 20);
    }

    // The host's answer, for the query it was asked about and no other. An
    // answer to a query the person has moved on from is dropped: it would
    // otherwise replace what they are reading with results for something they
    // typed two keystrokes ago.
    setSearchResults(requestId, groups = []) {
        if (!requestId || requestId !== this._searchRequestId) return false;
        this.set({searchGroups: this.cleanSearchGroups(groups), searchPending: false});
        this.syncSearchSelection();

        return true;
    }

    // What the host offers an empty field: a recent list, named by the host,
    // standing until it sets another. It is not an answer to a query, so it has
    // no request id -- but it is read the same way and cleaned the same way.
    // The panel's recent results before a query (the setting recent-results,
    // §4.4: a writable setting, no set- action). setRecentResults is its 1.0
    // setter, kept until 2026-12-01 and noted.
    get recentResults() {
        return this.state?.searchRecent ?? [];
    }

    set recentResults(groups) {
        this.set({searchRecent: this.cleanSearchGroups(groups)});
        this.syncSearchSelection();
    }

    setRecentResults(groups = []) {
        noteDeprecated({
            component: "sf-admin-menu", tag: "sf-admin-menu", kind: "action", from: "setRecentResults", to: "recentResults",
            since: aliases.since, remove_after: aliases.remove_after,
        });
        this.recentResults = groups;
        return true;
    }

    // sf-admin-menu-intent, the 1.0 name of every request to the host, is
    // made from the request it follows: {intent, payload}. A request the port
    // did not raise (a settings reset, the menu's own search) has none.
    sfAliasAdapters() {
        return {
            "sf-admin-menu-intent": (detail) => (detail && detail.intent ? {intent: detail.intent, payload: detail.payload} : undefined),
        };
    }

    cleanSearchGroups(groups = []) {
        return (Array.isArray(groups) ? groups : [])
            .map((group) => ({
                key: String(group?.key ?? ""),
                label: String(group?.label ?? ""),
                more: group?.more && isSameSiteHref(group.more.href)
                    ? {text: String(group.more.text ?? ""), href: String(group.more.href)}
                    : null,
                items: (Array.isArray(group?.items) ? group.items : [])
                    .filter((item) => item && isSameSiteHref(item.href))
                    .map((item) => ({
                        text: String(item.text ?? ""),
                        subtext: item.subtext == null ? "" : String(item.subtext),
                        icon: item.icon == null ? "" : String(item.icon),
                        href: String(item.href),
                    })),
            }))
            .filter((group) => group.items.length);
    }

    // Asking the host is a separate step from searching the menu: the sections
    // answer at once, the host answers when it can, and the panel says which
    // part it is still waiting for.
    requestHostSearch(query) {
        this.clearSearchDebounce();
        if (!query) {
            this._searchRequestId = null;
            this.set({searchGroups: [], searchPending: false});
            return this;
        }
        this._searchDebounce = setTimeout(() => {
            this._searchDebounce = null;
            const requestId = `search-${++this._searchSequence}`;
            this._searchRequestId = requestId;
            this.set({searchPending: true});
            // Vocabulary §5 query; sf-admin-menu-search, the 1.0 name, follows
            // it for kind menu until 2026-12-01.
            this.sfEmit("query", Object.freeze({kind: "menu", query, requestId}));
        }, 250);

        return this;
    }

    startSearch(text = "") {
        const query = String(text || "").trim();

        // In panel mode the panel is already open and stays open: the query
        // only changes what is in it, and an empty query shows whatever the
        // host offers for an empty query rather than closing on the person.
        if (this.isSearchPanelMode()) {
            this.set({
                searchQuery: query,
                searchResults: this.getSectionResults(query),
                searchActiveId: "",
            });
            this.requestHostSearch(query);
            this.syncSearchSelection();

            return this.state.searchResults;
        }

        if (!query.length) {
            this.set((state) => ({
                openSearch: false,
                searchQuery: "",
                searchResults: [],
                panels: {
                    ...(state.panels || {}),
                    search_panel: {
                        ...(state.panels?.search_panel || {}),
                        open: false,
                    },
                },
            }));
            return false;
        }

        const searchResults = this.getSearchResults(query);
        const activeElement = document.activeElement;
        if (activeElement && this.contains(activeElement)) {
            this._panelReturnFocus.set("search_panel", activeElement);
        }
        this.set((state) => ({
            openSearch: true,
            searchQuery: query,
            searchResults,
            panels: {
                ...(state.panels || {}),
                search_panel: {
                    ...(state.panels?.search_panel || {}),
                    open: true,
                },
            },
        }));
        return searchResults;
    }

    // Every row the keyboard can land on, in the order they are read: the
    // sections the menu found, then each group the host sent.
    getSearchSelectables() {
        if (!this.state.searchQuery) {
            return (this.state.searchRecent || []).flatMap((group, groupIndex) =>
                group.items.map((item, index) => ({
                    id: `sf-admin-search-recent-${groupIndex}-${index}`,
                    kind: "host",
                    item,
                })),
            );
        }
        const sections = (this.state.searchResults || []).map((item, index) => ({
            id: `sf-admin-search-section-${index}`,
            kind: "section",
            item,
        }));
        const hosted = (this.state.searchGroups || []).flatMap((group, groupIndex) =>
            group.items.map((item, index) => ({
                id: `sf-admin-search-${groupIndex}-${index}`,
                kind: "host",
                item,
            })),
        );

        return [...sections, ...hosted];
    }

    // The selection follows the rows: it stays where it is while that row is
    // still there, and otherwise lands on the first one. A selection pointing at
    // a row that no longer exists would leave Enter doing nothing.
    syncSearchSelection() {
        const rows = this.getSearchSelectables();
        const current = this.state.searchActiveId;
        if (!rows.length) {
            if (current) this.set({searchActiveId: ""});
            return this;
        }
        if (!rows.some((row) => row.id === current)) {
            this.set({searchActiveId: rows[0].id});
        }

        return this;
    }

    moveSearchSelection(step = 1) {
        const rows = this.getSearchSelectables();
        if (!rows.length) return this;
        const index = rows.findIndex((row) => row.id === this.state.searchActiveId);
        const next = (index + step + rows.length) % rows.length;
        this.set({searchActiveId: rows[next].id});
        this.scrollSearchSelectionIntoView();

        return this;
    }

    scrollSearchSelectionIntoView() {
        const id = this.state.searchActiveId;
        if (!id) return this;
        requestAnimationFrame(() => {
            this.querySelector(`[id="${id}"]`)?.scrollIntoView?.({block: "nearest"});
        });

        return this;
    }

    activateSearchSelection() {
        const row = this.getSearchSelectables().find((entry) => entry.id === this.state.searchActiveId);
        if (!row) return this;
        if (row.kind === "host") {
            window.location.assign(row.item.href);
            return this;
        }
        if (row.item.children?.length) {
            return this.openSearchResult(row.item);
        }
        const trigger = this.getPanelTrigger(row.item.panelId) ?? this.querySelector(
            `[data-sf-admin-item="${row.item.panelId}"]`,
        );
        trigger?.click?.();

        return this;
    }

    // The field answers the keys a combobox is expected to answer, and nothing
    // else: the arrows move the selection, Enter opens it, Escape leaves.
    handleSearchKeydown(event) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            return this.moveSearchSelection(1);
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            return this.moveSearchSelection(-1);
        }
        if (event.key === "Enter") {
            event.preventDefault();
            return this.activateSearchSelection();
        }
        if (event.key === "Escape") {
            event.preventDefault();
            return this.closeSearchPanel();
        }

        return this;
    }

    openSearchResult(item, event = null) {
        if (!item) return;

        if (item.children?.length) {
            event?.preventDefault?.();
            const returnFocus = this.getPanelTrigger(item.panelId);
            if (returnFocus) {
                this._panelReturnFocus.set(item.panelId, returnFocus);
            }
            const nextPanels = {...(this.state.panels || {})};

            Object.keys(nextPanels).forEach((panelId) => {
                if (panelId === "search_panel") return;
                nextPanels[panelId] = {
                    ...(nextPanels[panelId] || {}),
                    open: false,
                };
            });

            [...(item.panelPath || []), item.panelId].forEach((panelId) => {
                nextPanels[panelId] = {
                    ...(nextPanels[panelId] || {}),
                    open: true,
                };
            });
            nextPanels.search_panel = {
                ...(nextPanels.search_panel || {}),
                open: false,
            };

            this.set({
                panels: nextPanels,
                openSearch: false,
            });
            this.scheduleNavigationFocus(() =>
                this.getPanelBackButton(item.panelId),
            );
        }
    }

    observeItemChildren() {
        if (this._itemObserver) return;

        this._itemObserver = new MutationObserver((mutations) => {
            const hasNewItems = mutations.some((mutation) =>
                Array.from(mutation.addedNodes || []).some(isAdminMenuItemNode),
            );

            if (!hasNewItems || !this.captureInitialItems()) return;

            this.requestComponentUpdate("items");
        });

        this._itemObserver.observe(this, {childList: true});
    }

    toggleMenuSettings() {
        const opening = !this.state.menuSettings;
        if (opening) {
            this.commitSettingsBaseline();
        }
        this.set((prevState) => {
            const {menuSettings} = prevState;
            return {
                menuSettings: !menuSettings,
                visible: {},
                hasHidden: false,
            };
        });
        if (opening && !this.isLocalPersistence()) {
            this.refreshSettings();
        }
    }

    cancelMenuSettings() {
        this.menuSettings = structuredClone(this._settingsBaseline || {});
        this._itemsData = structuredClone(this._itemsBaseline || []);
        this._layoutSettings = structuredClone(this._layoutBaseline || {});
        this.setCompact(this._compactBaseline, "settings-cancel");
        this.closeContextMenu();
        this.set({
            menuSettings: false,
            visible: {},
            hasHidden: false,
            settingsStatus: "idle",
            settingsError: "",
        }, "cancelMenuSettings");
        this.emitSettingsEvent("settings-cancel", {
            target: this.getSettingsMode(),
            base_revision: this.getSettingsRevision(),
        });
    }

    resetMenuSettings() {
        if (this.isLocalPersistence()) {
            if (!this.clearMenuSettingsStorage()) return;
            this.menuSettings = {};
            this._itemsData = this.mapItems((item) => ({
                ...item,
                hidden: false,
                order: item.sourceIndex,
            }));
            this.commitSettingsBaseline();
            this.closeContextMenu();
            this.set({
                settingsStatus: "success",
                settingsError: "",
            }, "resetMenuSettings");
            return;
        }

        this.set({settingsStatus: "saving", settingsError: ""}, "resetMenuSettings");
        // Vocabulary §5 reset; sf-admin-menu-settings-reset, the 1.0 name,
        // follows it for kind settings until 2026-12-01.
        this.emitSettingsEvent("reset", {
            kind: "settings",
            target: this.getSettingsMode(),
            base_revision: this.getSettingsRevision(),
        });
    }

    selectSettingsMode(mode) {
        if (this.isLocalPersistence()) return;
        const nextMode = mode === "system" && this.getProp("allowSystemSettings")
            ? "system"
            : "user";
        if (nextMode === this.getSettingsMode()) return;
        this.setState({settingsMode: nextMode});
        this.set({settingsStatus: "saving", settingsError: ""}, "settingsMode");
        this.emitSettingsEvent("settings-mode-change", {
            target: nextMode,
        });
    }

    refreshSettings() {
        if (this.isLocalPersistence()) return;
        this.set({settingsStatus: "saving", settingsError: ""}, "refreshSettings");
        this.emitSettingsEvent("settings-refresh", {
            target: this.getSettingsMode(),
            base_revision: this.getSettingsRevision(),
            profile: this.buildSettingsProfile(),
        });
    }

    disconnectItemObserver() {
        this._itemObserver?.disconnect?.();
        this._itemObserver = null;
    }

    toggleCompact() {
        this.setCompact(!this.getProp("compact"), "toggle");
    }

    setCompact(compact, source = "api") {
        const nextCompact = Boolean(compact);
        const changed = nextCompact !== Boolean(this.getProp("compact"));
        if (changed) {
            this.setState({compact: nextCompact});
        }
        this.emitCompactChange(source);
        return changed;
    }

    emitCompactChange(source = "api") {
        this.emitSettingsEvent("compact-change", {
            compact: Boolean(this.getProp("compact")),
            source,
        });
    }

    toggleOpen() {
        this.set((prevState) => {
            const {open} = prevState;
            return {
                open: !open,
            };
        });
    }

    getItemRef(id) {
        if (!this.refs.items.has(id)) {
            this.refs.items.set(id, this.createRef());
        }

        return this.refs.items.get(id);
    }

    updateMenuItemHeight() {
        const visibleItem = [...this.refs.items.entries()].find(([id, refValue]) => {
            const value = this.getMenuItemElement(id, refValue);

            return (
                value &&
                !value.classList.contains("hidden") &&
                !value.classList.contains("sf-admin-menu-divider-wrap")
            );
        });
        const visibleItemElement = visibleItem
            ? this.getMenuItemElement(visibleItem[0], visibleItem[1])
            : null;
        const nextHeight =
            visibleItemElement?.offsetHeight || this.menuItemHeight || 0;

        if (nextHeight && nextHeight !== this.menuItemHeight) {
            this.menuItemHeight = nextHeight;
        }

        return this.menuItemHeight;
    }

    saveNewItemsData() {
        this.createdItems.forEach((item) => {
            const created = this.findItemByPanelId(item.panelId);
            this.patchMenuItemSettings(item.panelId, {
                created: true,
                type: created.type,
                order: created.order,
            });
        });
        this.createdItems = [];
    }

    saveMenuSettings() {
        this.saveNewItemsData();
        if (this.isLocalPersistence()) {
            this.persistMenuSettings();
            if (this._settingsStorageError) return;
            this.commitSettingsBaseline();
            this.closeContextMenu();
            this.toggleMenuSettings();
            this.set({settingsStatus: "success", settingsError: ""}, "saveMenuSettings");
            return;
        }

        this.set({settingsStatus: "saving", settingsError: ""}, "saveMenuSettings");
        this.emitSettingsEvent("settings-save", {
            target: this.getSettingsMode(),
            base_revision: this.getSettingsRevision(),
            profile: this.buildSettingsProfile(),
        });
    }

    applySettingsResult(result = {}) {
        const target = result.target === "system" ? "system" : "user";
        const revision = Number(result.revision);
        if (Number.isFinite(revision)) {
            this.setState(target === "system"
                ? {systemSettingsRevision: revision}
                : {settingsRevision: revision});
        }
        if (result.profile && typeof result.profile === "object") {
            this.menuSettings = this.profileItemsToSettings(result.profile.items || {});
            this._layoutSettings = {...(result.profile.layout || {})};
        }
        if (Array.isArray(result.tree)) {
            this._itemsData = result.tree.map((node, index) =>
                this.externalNodeToData(node, index),
            );
            this._panels = this.buildPanels(this._itemsData, {});
        }
        if (typeof result.compact === "boolean") {
            this.setCompact(result.compact, "settings-result");
        }
        this.commitSettingsBaseline();
        this.closeContextMenu();
        this.set({
            menuSettings: false,
            settingsStatus: "success",
            settingsError: "",
        }, "applySettingsResult");
    }

    applySettingsError(error = {}) {
        const status = error?.status === 409 || error?.error === "revision_conflict"
            ? "conflict"
            : "error";
        this.set({
            settingsStatus: status,
            settingsError: typeof error?.message === "string"
                ? error.message
                : "",
        }, "applySettingsError");
    }

    applyExternalSettingsState(state = {}, target = "user") {
        const profile = state?.profiles?.[target]?.profile || {};
        const revision = Number(state?.profiles?.[target]?.revision || 0);
        this.menuSettings = this.profileItemsToSettings(profile.items || {});
        this._layoutSettings = {...(profile.layout || {})};
        const systemCompact = state?.profiles?.system?.profile?.layout?.compact;
        const userCompact = state?.profiles?.user?.profile?.layout?.compact;
        const resolvedCompact = target === "system"
            ? Boolean(systemCompact ?? false)
            : Boolean(userCompact ?? systemCompact ?? false);
        const tree = state?.trees?.[target];
        this._itemsData = Array.isArray(tree)
            ? tree.map((node, index) => this.externalNodeToData(node, index))
            : this.mapItems((item) => this.applyMenuItemSettings({...item, hidden: false}));
        this._panels = this.buildPanels(this._itemsData, {});
        this.setState(target === "system"
            ? {settingsMode: "system", systemSettingsRevision: revision}
            : {settingsMode: "user", settingsRevision: revision});
        this.setCompact(resolvedCompact, "settings-state");
        this.commitSettingsBaseline();
        this.set({settingsStatus: "idle", settingsError: ""}, "applyExternalSettingsState");
    }

    buildSettingsProfile() {
        const items = {};
        const collect = (menuItems = []) => {
            menuItems.forEach((item) => {
                if (item.type !== "divider" && item.itemId) {
                    const delta = this.getMenuItemSettings(item.panelId);
                    const normalized = {};
                    if (Number.isFinite(delta.order)) normalized.order = delta.order;
                    if (typeof delta.hidden === "boolean") normalized.hidden = delta.hidden;
                    if (typeof delta.pinned === "boolean") normalized.pinned = delta.pinned;
                    if (Object.keys(normalized).length) items[item.itemId] = normalized;
                }
                collect(item.children || []);
            });
        };
        collect(this._itemsData);
        const layout = {};
        const compact = Boolean(this.getProp("compact"));
        if (typeof this._layoutSettings?.compact === "boolean" || compact !== this._compactBaseline) {
            layout.compact = compact;
        }
        return {
            schema_version: 1,
            items,
            layout,
        };
    }

    profileItemsToSettings(items = {}) {
        return Object.fromEntries(
            Object.entries(items || {}).map(([itemId, delta]) => [
                itemId,
                {...(delta || {})},
            ]),
        );
    }

    externalNodeToData(node = {}, sourceIndex = 0) {
        const itemId = String(node.id || "");
        const item = {
            type: "item",
            itemId,
            panelId: itemId,
            label: String(node.label || ""),
            leftIcon: String(node.icon || ""),
            rightIcon: "",
            href: String(node.href || ""),
            target: "",
            rel: "",
            badge: String(node.badge || ""),
            value: "",
            hidden: node.hidden === true,
            placeholder: true,
            order: Number.isFinite(Number(node.order)) ? Number(node.order) : sourceIndex,
            sourceIndex,
            slot: normalizeSlot(node.slot),
            activePanels: {},
            active: node.active === true,
            current: node.current === true,
            disabled: node.disabled === true,
            children: Array.isArray(node.children)
                ? node.children.map((child, index) => this.externalNodeToData(child, index))
                : [],
        };
        return this.applyMenuItemSettings(item);
    }

    commitSettingsBaseline() {
        this._settingsBaseline = structuredClone(this.menuSettings || {});
        this._itemsBaseline = structuredClone(this._itemsData || []);
        this._layoutBaseline = structuredClone(this._layoutSettings || {});
        this._compactBaseline = Boolean(this.getProp("compact"));
    }

    // A settings event by its verb (§8). The revision is the manifest's
    // base-revision, baseRevision on the element (§3.2); base_revision, its 1.0
    // spelling, stays in the detail until 2026-12-01.
    emitSettingsEvent(verb, detail = {}) {
        const revision = "base_revision" in detail ? {baseRevision: detail.base_revision} : {};
        this.sfEmit(verb, {...detail, ...revision});
    }

    isLocalPersistence() {
        return this.getProp("persistenceMode") !== "external";
    }

    getSettingsMode() {
        return this.getProp("settingsMode") === "system" ? "system" : "user";
    }

    getSettingsRevision() {
        const revision = this.getSettingsMode() === "system"
            ? this.getProp("systemSettingsRevision")
            : this.getProp("settingsRevision");
        return Number.isFinite(Number(revision)) ? Number(revision) : 0;
    }

    getMenuPanelElement() {
        return this.refs.menuPanel?.value ||
            (this.shadowRoot || this).querySelector(".sf-admin-menu-main");
    }

    getMenuItemElement(panelId, refValue = null) {
        if (refValue?.value) return refValue.value;

        return [...(this.shadowRoot || this).querySelectorAll("[data-panel-id]")]
            .find((element) => element.dataset.panelId === String(panelId));
    }

    updateOverflow() {
        const menuPanel = this.getMenuPanelElement();
        if (!menuPanel) return;

        if (!this.refs.items.size) return;
        const itemRefs = [...this.refs.items.entries()].filter(([id]) => {
            const item = this.findItemByPanelId(id);
            return !item?.hidden;
        });
        const visibleItemHeight = this.updateMenuItemHeight();
        if (!visibleItemHeight) return;
        const currentVisible = this.state.visible || {};
        const measuredItems = itemRefs.map(([id, refValue]) => {
            const item = this.getMenuItemElement(id, refValue);
            const measuredHeight = item?.offsetHeight || 0;

            if (measuredHeight > 0) {
                item.dataset.sfAdminMenuHeight = String(measuredHeight);
                this._itemHeightCache.set(id, measuredHeight);
            }

            return {
                id,
                itemHeight:
                    measuredHeight ||
                    this._itemHeightCache.get(id) ||
                    Number(item?.dataset.sfAdminMenuHeight) ||
                    visibleItemHeight,
            };
        });
        const naturalHeight = measuredItems.reduce(
            (height, item, index) =>
                height + item.itemHeight + (index > 0 ? this.parentGap : 0),
            0,
        );
        const fitTolerance = parseFloat(
            getComputedStyle(menuPanel).getPropertyValue("--sf-px"),
        ) || 0;

        if (naturalHeight <= menuPanel.clientHeight + fitTolerance) {
            return {
                items: Object.fromEntries(measuredItems.map(({id}) => [id, {
                    ...(currentVisible[id] || {}),
                    visible: true,
                }])),
                hidden: false,
            };
        }
        const moreItemReserve = visibleItemHeight + this.parentGap;
        const containerHeight = Math.max(
            0,
            menuPanel.clientHeight - moreItemReserve,
        );
        const obj = {};
        let hidden = false;
        let usedHeight = 0;

        measuredItems.forEach(({id, itemHeight}, index) => {
            const nextHeight =
                usedHeight + itemHeight + (index > 0 ? this.parentGap : 0);
            const itemVisible = nextHeight <= containerHeight;

            if (!itemVisible) {
                hidden = true;
            }

            obj[id] = {
                ...(currentVisible[id] || {}),
                visible: itemVisible,
            };

            if (itemVisible) {
                usedHeight = nextHeight;
            }
        });
        return {
            items: obj,
            hidden,
        };
    }

    syncContextTriggers() {
        this.querySelectorAll('[data-admin-menu-settings], button[data-settings]').forEach((button) => {
            if (button.closest("sf-admin-menu") !== this) return;
            if (!button.hasAttribute("aria-haspopup")) button.setAttribute("aria-haspopup", "menu");
            if (!button.hasAttribute("aria-expanded")) button.setAttribute("aria-expanded", "false");
        });
    }

    closeContextMenu({restoreFocus = true} = {}) {
        const menu = this.refs.contextMenu?.value;
        const opener = this._contextReturnFocus;
        const targetId = this.contextTarget?.id;
        const shouldRestore = restoreFocus && menu?.contains(document.activeElement);
        const closeToken = ++this._contextOpenToken;
        if (menu && this._contextReadyHandler) menu.removeEventListener("sf-after-render", this._contextReadyHandler);
        this._contextReadyHandler = null;
        this._contextAnchor = null;
        this.disconnectContextGeometry();
        if (this._contextPortal && contextPortalOwners.get(this._contextPortal) === this) {
            render(null, this._contextPortal);
            contextPortalOwners.delete(this._contextPortal);
        }
        this._contextPortal = null;
        this.refs.contextMenu.value = null;
        this.unbindContextEvent();
        this.contextTarget?.classList.remove("active");
        for (const [name, value] of this._contextTriggerAttributes || []) {
            const owned = name === "aria-expanded" ? "true" : "menu";
            if (opener?.getAttribute(name) !== owned) continue;
            if (value === null) opener.removeAttribute(name);
            else opener.setAttribute(name, value);
        }
        this._contextTriggerAttributes = null;
        this.contextTarget = null;
        this._contextReturnFocus = null;
        if (shouldRestore && opener?.isConnected && !opener.matches(":disabled") && !opener.closest("[hidden], [inert]")) {
            opener.focus({preventScroll: true});
        }
        if (shouldRestore) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                // Save/cancel may replace the settings footer immediately after
                // closing. Recover only abandoned focus, never a new user target.
                if (!this.isConnected || closeToken !== this._contextOpenToken || document.activeElement !== document.body) return;
                const replacementHost = targetId ? document.getElementById(targetId) : null;
                const replacement = replacementHost && this.contains(replacementHost)
                    ? (replacementHost.matches("button, a[href]") ? replacementHost : replacementHost.querySelector("button, a[href]"))
                    : null;
                const candidates = [opener, replacement, this.querySelector('[data-action="settings"]'), ...this.querySelectorAll("button, a[href]")];
                const available = candidates.find(item => item?.isConnected && !item.matches(":disabled") &&
                    !item.closest('[hidden], [inert], [aria-disabled="true"]') && item.getClientRects().length && getComputedStyle(item).visibility !== "hidden");
                available?.focus({preventScroll: true});
            }));
        }
    }

    openContextMenu(event, opts = {}) {
        const target = event.currentTarget instanceof Element
            ? event.currentTarget
            : event.target?.closest?.("button, a[href], sf-icon-button") || event.target;
        if (!(target instanceof HTMLElement)) return;
        event.preventDefault();
        event.stopPropagation();
        if (this.contextTarget === target) {
            this.closeContextMenu();
            return;
        }
        this.closeContextMenu({restoreFocus: false});
        this.contextTarget = target;
        this.contextTarget.classList.add("active");
        this._contextReturnFocus = target.matches("button, a[href]") ? target : target.querySelector("button, a[href]");
        const opener = this._contextReturnFocus;
        if (opener) {
            this._contextTriggerAttributes = new Map(["aria-haspopup", "aria-expanded"].map(name => [name, opener.getAttribute(name)]));
            opener.setAttribute("aria-haspopup", "menu");
            opener.setAttribute("aria-expanded", "true");
        }
        // Smart hosts may be display:contents; their native control owns the box.
        const anchor = opener || target;
        const pos = anchor.getBoundingClientRect();
        const openTowardInlineStart = pos.right > window.innerWidth / 2;
        this._contextAnchor = {element: anchor, position: opts.position || null, transform: opts.transform};

        this.renderContextMenu(
            Object.assign(opts, {
                id: target,
                x: openTowardInlineStart ? pos.left : pos.right,
                y: pos.y + pos.height / 2,
                position: opts.position || (openTowardInlineStart ? "right" : "left"),
            }),
        );
    }

    bindContextEvent() {
        if (this._contextEventBound) {
            return;
        }

        this._contextScrollPositions.clear();
        for (let node = this._contextReturnFocus || this.contextTarget; node instanceof Element; node = node.parentElement) {
            this._contextScrollPositions.set(node, {left: node.scrollLeft, top: node.scrollTop});
        }
        const scrollingElement = document.scrollingElement;
        this._contextScrollPositions.set(document, {left: scrollingElement?.scrollLeft, top: scrollingElement?.scrollTop});
        document.addEventListener("click", this.contextEvent);
        document.addEventListener("keydown", this.contextKeyEvent);
        document.addEventListener("focusin", this.contextFocusEvent);
        document.addEventListener("scroll", this.contextScrollEvent, true);
        window.addEventListener("resize", this.scheduleContextGeometry);
        window.visualViewport?.addEventListener("resize", this.scheduleContextGeometry);
        window.visualViewport?.addEventListener("scroll", this.scheduleContextGeometry);
        document.fonts?.addEventListener("loadingdone", this.scheduleContextGeometry);
        this._contextEventBound = true;
    }

    unbindContextEvent() {
        if (!this._contextEventBound) {
            return;
        }

        document.removeEventListener("click", this.contextEvent);
        document.removeEventListener("keydown", this.contextKeyEvent);
        document.removeEventListener("focusin", this.contextFocusEvent);
        document.removeEventListener("scroll", this.contextScrollEvent, true);
        window.removeEventListener("resize", this.scheduleContextGeometry);
        window.visualViewport?.removeEventListener("resize", this.scheduleContextGeometry);
        window.visualViewport?.removeEventListener("scroll", this.scheduleContextGeometry);
        document.fonts?.removeEventListener("loadingdone", this.scheduleContextGeometry);
        this._contextScrollPositions.clear();
        this._contextEventBound = false;
    }

    contextEvent(event) {
        if (this.isContextMenuEvent(event)) {
            return;
        }

        this.closeContextMenu();
    }

    contextKeyEvent(event) {
        if (event.defaultPrevented || !this.isContextMenuEvent(event)) return;
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            this.closeContextMenu();
        } else if (event.key === "Tab") {
            // Restore the opener first; native Tab then continues from its position,
            // rather than from the portal appended at the end of the document.
            this.closeContextMenu();
        }
    }

    contextFocusEvent(event) {
        if (!this.isContextMenuEvent(event) && event.target !== this._contextReturnFocus) {
            this.closeContextMenu({restoreFocus: false});
        }
    }

    contextScrollEvent(event) {
        if (this.isContextMenuEvent(event)) return;
        const node = event.target === document ? document.scrollingElement : event.target;
        const initial = this._contextScrollPositions.get(event.target);
        // scrollIntoView performed for the opener may deliver its event later.
        // A queued notification of the captured position is not a new scroll.
        if (initial && initial.left === node?.scrollLeft && initial.top === node?.scrollTop) return;
        this.closeContextMenu();
    }

    disconnectContextGeometry() {
        if (this._contextGeometryFrame !== null) cancelAnimationFrame(this._contextGeometryFrame);
        this._contextGeometryFrame = null;
        this._contextSizeObserver?.disconnect();
        this._contextSizeObserver = null;
        this._contextSizeTarget = null;
        this._contextPosition?.controller.stop();
        this._contextPosition = null;
    }

    scheduleContextGeometry() {
        if (!this.refs.contextMenu?.value || this._contextGeometryFrame !== null) return;
        const token = this._contextOpenToken;
        this._contextGeometryFrame = requestAnimationFrame(() => {
            this._contextGeometryFrame = null;
            if (token !== this._contextOpenToken) return;
            this.clampContextMenuToViewport();
            // Responsive Admin/control transitions can keep moving the anchor
            // after the resize event. Follow only while those animations run.
            for (let node = this._contextAnchor?.element; node instanceof Element; node = node.parentElement) {
                if (node.getAnimations().some(animation => animation.playState === "running")) {
                    this.scheduleContextGeometry();
                    break;
                }
            }
        });
    }

    isContextMenuEvent(event) {
        const contextMenu = this.refs?.contextMenu?.value;

        if (!(contextMenu instanceof Node)) {
            return false;
        }

        const target = event?.target;

        if (!(target instanceof Node)) {
            return false;
        }

        if (contextMenu === target || contextMenu.contains(target)) {
            return true;
        }

        return event.composedPath?.().includes(contextMenu) || false;
    }

    renderContextMenu(data) {
        const {
            x,
            y,
            position,
            tempVisible,
            id,
            transform,
            items = [
                {
                    component: "sf-button",
                    props: {
                        appearance: "link",
                        scheme: "on-surface",
                        iconStart: "save",
                        text: this.translate("save"),
                        "@click": () => {
                            this.saveMenuSettings();
                        },
                    },
                },
                {
                    component: "sf-button",
                    props: {
                        appearance: "link",
                        scheme: "on-surface",
                        iconStart: `visibility${!tempVisible ? "_off" : ""}`,
                        text: this.translate(!tempVisible ? "hide" : "show"),
                        "@click": () => {
                            this.toggleItemVisibility(id, tempVisible);
                        },
                    },
                },
            ],
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
        const portal = this.getPortalContainer();
        if (this.refs.contextMenu.value && this._contextReadyHandler) {
            this.refs.contextMenu.value.removeEventListener("sf-after-render", this._contextReadyHandler);
        }
        this.disconnectContextGeometry();
        const previousOwner = contextPortalOwners.get(portal);
        if (previousOwner && previousOwner !== this) previousOwner.closeContextMenu({restoreFocus: false});
        contextPortalOwners.set(portal, this);
        this._contextPortal = portal;
        const token = ++this._contextOpenToken;
        const openingFocus = document.activeElement;
        render(
            html`
                <sf-context-menu
                        :key=${x + y}
                        style="
            position: fixed;
            inset-inline-start: calc(${x}px + var(--sf-context-menu-tail-corner-offset));
            inset-block-start: ${y}px;
            transform: ${pos};
            z-index: 10000;
          "
                        .items=${items}
                        aria-label=${this._contextReturnFocus?.getAttribute("aria-label") || this.translate("settingsTitle")}
                        position="${position || "left"}"
                >
                </sf-context-menu>
            `,
            portal,
        );
        this.refs.contextMenu.value = portal.querySelector("sf-context-menu");
        const menu = this.refs.contextMenu.value;
        let focusPending = Boolean(this.contextTarget);
        this._contextReadyHandler = () => {
            if (token !== this._contextOpenToken || this.refs.contextMenu.value !== menu || !menu.isConnected) return;
            this.clampContextMenuToViewport();
            const surface = menu.querySelector(".sf-context-menu");
            if (surface && surface !== this._contextSizeTarget) {
                this._contextSizeObserver?.disconnect();
                this._contextSizeObserver = new ResizeObserver(this.scheduleContextGeometry);
                this._contextSizeObserver.observe(surface);
                this._contextSizeTarget = surface;
            }
            if (!focusPending) return;
            if (document.activeElement !== openingFocus && document.activeElement !== this._contextReturnFocus && !menu.contains(document.activeElement)) {
                focusPending = false;
                return;
            }
            if (!menu.availableMenuItems?.().length) return;
            focusPending = false;
            menu.focus({preventScroll: true});
        };
        menu.addEventListener("sf-after-render", this._contextReadyHandler);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (token === this._contextOpenToken) this._contextReadyHandler?.();
            });
        });
        this.bindContextEvent();
    }

    clampContextMenuToViewport() {
        const contextMenu = this.refs?.contextMenu?.value;
        if (!(contextMenu instanceof HTMLElement)) return;

        const surface = (contextMenu.shadowRoot || contextMenu)
            .querySelector(".sf-context-menu") || contextMenu;
        // Let the browser resolve rem/calc/token expressions instead of treating
        // parseFloat('--space') as pixels. The zero-height ruler leaves no layout.
        const ruler = document.createElement("span");
        ruler.setAttribute("aria-hidden", "true");
        ruler.style.cssText = "position:absolute;inset:0 auto auto 0;visibility:hidden;pointer-events:none;inline-size:var(--sf-context-menu-viewport-space, var(--sf-space-1\\/2));block-size:0;padding:0;border:0;";
        surface.append(ruler);
        const resolvedSpace = ruler.getBoundingClientRect().width;
        ruler.style.inlineSize = "var(--sf-context-menu-tail-corner-offset)";
        const anchorGap = ruler.getBoundingClientRect().width;
        ruler.remove();
        const viewport = window.visualViewport;
        const width = viewport?.width || window.innerWidth;
        const height = viewport?.height || window.innerHeight;
        const left = viewport?.offsetLeft || 0;
        const top = viewport?.offsetTop || 0;
        const margin = Math.min(Math.max(0, resolvedSpace), width / 2, height / 2);
        const availableInlineSize = `${Math.max(0, width - margin * 2)}px`;
        const availableBlockSize = `${Math.max(0, height - margin * 2)}px`;
        surface.style.setProperty("--sf-context-menu-available-inline-size", availableInlineSize);
        surface.style.setProperty("--sf-context-menu-available-block-size", availableBlockSize);
        surface.style.maxInlineSize = availableInlineSize;
        surface.style.maxBlockSize = availableBlockSize;
        // The root must not clip the tail; its content owns long-list scrolling.
        surface.style.overflow = "visible";
        // Always measure the uncorrected position. Child renders can call this
        // repeatedly; measuring our previous correction would undo it next time.
        surface.style.translate = "none";
        const anchor = this._contextAnchor;
        // Preserve unanchored/custom positioning; Admin's native openers use the
        // existing left/right family, whose CSS sides are logical (RTL-aware).
        if (anchor && (!anchor.position || /^(left|right)(-top|-bottom)?$/.test(anchor.position))) {
            if (!anchor.element.isConnected) {
                this.closeContextMenu({restoreFocus: false});
                return;
            }
            const box = anchor.element.getBoundingClientRect();
            const rtl = getComputedStyle(surface).direction === "rtl";
            const opensRight = anchor.position
                ? anchor.position.startsWith("left") !== rtl
                : left + width - margin - box.right >= box.left - left - margin;
            const position = anchor.position || (opensRight !== rtl ? "left" : "right");
            surface.style.insetInlineStart = "auto";
            surface.style.insetInlineEnd = "auto";
            if (anchor.transform === undefined) {
                // Shared Framework geometry (SF.Position): the preferred side
                // flips when it does not fit and the menu shifts inside the
                // viewport; the tail follows the side actually used.
                const suffix = position.replace(/^(left|right)/, "");
                const align = suffix === "-top" ? "start" : suffix === "-bottom" ? "end" : "center";
                surface.style.transform = "none";
                const key = `${position}|${opensRight}`;
                if (this._contextPosition?.element === anchor.element && this._contextPosition.surface === surface && this._contextPosition.key === key) {
                    this._contextPosition.controller.update();
                    return;
                }
                this._contextPosition?.controller.stop();
                const controller = positioning().anchor(anchor.element, surface, {
                    side: opensRight !== rtl ? "inline-end" : "inline-start",
                    align,
                    offset: anchorGap,
                    alignmentOffset: align === "center" ? 0 : Math.max(0, box.height / 2 - anchorGap),
                    padding: margin,
                    fitHeight: false,
                    autoUpdate: false,
                    onPosition: ({placement}) => {
                        const next = `${placement.startsWith("right") !== rtl ? "left" : "right"}${suffix}`;
                        if (contextMenu.getAttribute("position") !== next) contextMenu.setAttribute("position", next);
                    },
                });
                this._contextPosition = {controller, element: anchor.element, surface, key};
                return;
            }
            // Custom transforms keep the static geometry; the anchored branch above
            // sets the tail side only from the side actually used, so a flipped
            // menu never toggles its position attribute back and forth.
            if (contextMenu.getAttribute("position") !== position) contextMenu.setAttribute("position", position);
            const size = surface.getBoundingClientRect();
            const alignment = position.endsWith("-bottom") ? -1 : position.endsWith("-top") ? 0 : -0.5;
            const shift = Number(anchor.transform) / 100;
            surface.style.left = `${opensRight ? box.right + anchorGap : box.left - anchorGap - size.width}px`;
            surface.style.top = `${box.top + box.height / 2 + size.height * shift + (alignment === -1 ? anchorGap : alignment === 0 ? -anchorGap : 0)}px`;
            surface.style.transform = "none";
        }
        const rect = surface.getBoundingClientRect();
        const offsetX = rect.left < left + margin
            ? left + margin - rect.left
            : rect.right > left + width - margin
                ? left + width - margin - rect.right
                : 0;
        const offsetY = rect.top < top + margin
            ? top + margin - rect.top
            : rect.bottom > top + height - margin
                ? top + height - margin - rect.bottom
                : 0;

        surface.style.translate = `${offsetX}px ${offsetY}px`;
    }

    isSameVisibleState(nextVisible = {}) {
        const currentVisible = this.state?.visible || {};
        const keys = new Set([
            ...Object.keys(currentVisible),
            ...Object.keys(nextVisible || {}),
        ]);

        for (const key of keys) {
            if (currentVisible[key]?.visible !== nextVisible[key]?.visible) {
                return false;
            }
        }

        return true;
    }

    scheduleOverflowUpdate() {
        if (this.resizeFrame || this.state.menuSettings) return;
        if (this.isMeasuring) {
            this.overflowUpdatePending = true;
            return;
        }
        const parentSpace = setParentSpace(this.refs.items);
        this.parentGap = parentSpace?.gap ?? 0;
        this.resizeFrame = requestAnimationFrame(() => {
            this.resizeFrame = null;
            this.isMeasuring = true;
            const {items, hidden} = this.updateOverflow() || {
                items: {},
                hidden: false,
            };

            if (items && (
                !this.isSameVisibleState(items) ||
                this.state.hasHidden !== hidden
            )) {
                this.set({visible: items, hasHidden: hidden}, "overflow");
            }

            requestAnimationFrame(() => {
                this.isMeasuring = false;
                if (this.overflowUpdatePending) {
                    this.overflowUpdatePending = false;
                    this.scheduleOverflowUpdate();
                }
            });
        });
    }


    observeMainResize() {
        const menuPanel = this.getMenuPanelElement();
        if (
            !menuPanel ||
            typeof ResizeObserver === "undefined" ||
            this.resizeObserver ||
            !this.refs.items.size
        ) {
            return;
        }

        this.resizeObserver = new ResizeObserver(() => {
            this.scheduleOverflowUpdate();
        });
        this.resizeObserver.observe(menuPanel);
    }

    getPanelElement(panelId) {
        if (!panelId) return null;

        return [...this.querySelectorAll("[data-panel]")].find(
            (panel) => panel.dataset.panel === String(panelId),
        ) || null;
    }

    getPanelTrigger(panelId) {
        if (!panelId) return null;

        const wrapper = [...this.querySelectorAll("[data-panel-id]")].find(
            (item) => item.dataset.panelId === String(panelId),
        );
        return wrapper?.querySelector(":scope > .sf-admin-menu-item") || null;
    }

    // The back row is the button; the arrow inside it is only an icon, and
    // focusing an icon focuses nothing.
    getPanelBackButton(panelId) {
        return this.getPanelElement(panelId)?.querySelector(
            ".sf-admin-menu-back",
        ) || null;
    }

    // The field, whichever shape it is in: the row builds it from sf-input, and
    // the panel writes the input itself because it carries combobox semantics
    // that sf-input does not pass through. A form-associated sf-input keeps the
    // name on itself, not on its inner input (ui-source helpers/form-field.js
    // innerControlName), so the row's field is found through its host.
    getSearchInput() {
        return this.querySelector('input[name="sf_admin_search_input"], sf-input[name="sf_admin_search_input"] input');
    }

    isAvailableNavigationTarget(target) {
        return Boolean(
            target?.isConnected &&
            !target.matches?.(":disabled") &&
            !target.closest?.('[hidden], [inert], [aria-hidden="true"]') &&
            target.getClientRects?.().length &&
            getComputedStyle(target).visibility !== "hidden",
        );
    }

    scheduleNavigationFocus(resolveTarget) {
        const focusToken = ++this._navigationFocusToken;

        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!this.isConnected || focusToken !== this._navigationFocusToken) {
                return;
            }
            const target = typeof resolveTarget === "function"
                ? resolveTarget()
                : resolveTarget;
            if (this.isAvailableNavigationTarget(target)) {
                target.focus({preventScroll: true});
            }
        }));
    }

    focusSearchInput() {
        this.scheduleNavigationFocus(() => this.getSearchInput());
    }

    togglePanel(panelId, open = true, opener = null) {
        if (!panelId) return this;
        if (panelId === "search_panel" && !open) {
            this.set({
                openSearch: false,
            });
        }
        const compactChanged = this.getProp("compact") !== false;
        if (compactChanged) {
            this.setCompact(false, "panel-open");
        }
        if (open) {
            const returnFocus = opener?.matches?.("button, a[href]")
                ? opener
                : this.getPanelTrigger(panelId);
            if (returnFocus) {
                this._panelReturnFocus.set(panelId, returnFocus);
            }
        }
        this.set((state) => {
            const panels = state.panels || {};

            if (panels[panelId]?.open === open) {
                return {};
            }

            return {
                panels: {
                    ...panels,
                    [panelId]: {
                        ...(panels[panelId] || {}),
                        open,
                    },
                },
            };
        });
        if (open) {
            this.scheduleNavigationFocus(() => this.getPanelBackButton(panelId));
        } else {
            const returnFocus = this._panelReturnFocus.get(panelId);
            this._panelReturnFocus.delete(panelId);
            this.scheduleNavigationFocus(() => {
                if (this.isAvailableNavigationTarget(returnFocus)) {
                    return returnFocus;
                }
                return panelId === "search_panel"
                    ? this.getSearchInput()
                    : this.getPanelTrigger(panelId);
            });
        }
        return this;
    }

    buildPanels(items = [], result = {}) {
        items.forEach((item) => {
            if (!item.children?.length) return;

            result[item.panelId] = result[item.panelId] || {open: false};
            this.buildPanels(item.children, result);
        });
        result["search_panel"] = result["search_panel"] || {open: false};
        return result;
    }

    captureInitialItems() {
        const nodes = Array.from(this.childNodes || []).filter(isAdminMenuItemNode);
        for (const [key, menuItem] of Object.entries(this.menuSettings)) {
            if (menuItem.created) {
                const item = document.createElement("sf-admin-menu-item");
                item.setAttribute("type", menuItem.type);
                item.setAttribute("panelId", key);
                nodes.push(item);
            }
        }
        if (!nodes.length) return false;

        this._itemsData = nodes.map((node, index) =>
            this.itemNodeToData(node, [index]),
        );
        this._itemsData = sortItemsByOrder(this._itemsData);
        this._panels = this.buildPanels(this._itemsData, this._panels);
        nodes.forEach((node) => node.remove());

        return true;
    }


    getMainMenuSettings() {
        if (!this.isLocalPersistence()) return {};

        let menuSettings;
        try {
            const storage = window.localStorage;
            const storageKey = this.getMenuSettingsStorageKey();
            menuSettings = storage.getItem(storageKey) ||
                storage.getItem(LEGACY_MENU_SETTINGS_STORAGE_KEY);
            this._settingsStorageError = "";
        } catch (error) {
            this.handleSettingsStorageError(error);
            return {};
        }
        if (!menuSettings) return {};

        try {
            const parsed = JSON.parse(menuSettings);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            console.warn("SF AdminMenu: failed to parse menu settings", error);
            return {};
        }
    }

    getMenuSettingsStorageKey() {
        const menuId = String(this.id || "default").replace(/[^A-Za-z0-9_.-]/g, "_");
        return "sf-admin-menu:" + menuId + ":settings:v1";
    }

    get items() {
        return this._itemsData.filter((item) => item.slot !== "bottom");
    }

    get bottomItems() {
        return this._itemsData.filter((item) => item.slot === "bottom");
    }

    templateContext() {
        const props = this.getPropsContext();
        return this.createTemplateContext({
            ...props,
            component: this,
            items: this.items,
            bottomItems: this.bottomItems,
            rootClass: this.getRootClass(),
            rootStyle: this.getRootStyle(),
        });
    }

    template() {
        if (this._navigation) return renderNavigationTemplate(this._navigation.context());
        return renderAdminMenuTemplate(this.templateContext());
    }

    // The shared convention for a component that takes a host port: ask for one
    // rather than wait to be given it. A page that answers nothing -- every page
    // using the `items` menu today -- gets that menu, unchanged.
    _requestHostPort() {
        if (this.hostPort || this._portRequested) return false;
        this._portRequested = true;
        // A host usually answers inside the dispatch. While it does, the
        // connection that asked is still setting up and loads the menu itself.
        this._answeringRequest = true;
        try {
            this.dispatchEvent(new CustomEvent("sf-host-port-request", {
                bubbles: true,
                composed: true,
                detail: {component: this, context: {owner: "admin-menu", record: null, group: null}},
            }));
        } finally {
            this._answeringRequest = false;
        }
        return true;
    }

    // Read the menu again from the host: something outside the menu changed what
    // it shows -- a star pressed in the page header, a storage created on the
    // page. The port has no way for a host to push, so the page asks the menu
    // to ask. The items menu has nothing to read and ignores it.
    refresh() {
        return this._navigation?.load("requested") ?? Promise.resolve();
    }

    // ---------- the screen's interface (stand 24 A1) ----------

    // The row the page says it is on. Empty: the row whose address the page
    // is at, as before (the navigation controller follows the address).
    get pageCurrent() {
        return String(this.getAttribute("current") ?? "").trim();
    }

    // Whether the current row is among the person's favourites, as the host
    // last answered (values.favourite). A component update tells a binding
    // to read it again (sf-props-change).
    get favourite() {
        const navigation = this._navigation;
        const key = this.pageCurrent || navigation?.navigation?.current || "";
        return Boolean(key && navigation?.isFavourite?.(key));
    }

    // The action toggle {id, on}: the row goes into the person's favourites
    // or out of them through the port (favourite.toggle). The event toggle
    // still tells the page it was asked, as for the menu's own star.
    async toggle(id, on) {
        const params = id && typeof id === "object" ? id : {id, on};
        const key = String(params.id ?? "").trim();
        if (!key) return {outcome: "refused", reason: "no-id"};
        if (!this._navigation) return {outcome: "refused", reason: "no-port"};
        const answer = await this._navigation.setFavourite(key, Boolean(params.on));
        if (answer?.answer === "applied") return {outcome: "applied"};
        if (answer?.answer === "refused") return {outcome: "refused", reason: answer.reason ?? "refused"};
        return {outcome: "unavailable", reason: answer?.reason ?? "unavailable"};
    }

    // open, written by a page that opens the menu from a button of its own:
    // data-open says it, and the stylesheet folds the menu away while it is
    // false on a narrow screen. A page that never writes it sees no change.
    _reflectOpen() {
        if (!this._sfOpenGiven && !this.hasAttribute("open")) {
            if (this.hasAttribute("data-open")) this.removeAttribute("data-open");
            return;
        }
        const open = this.hasAttribute("open") && this.getAttribute("open") !== "false";
        if (this.getAttribute("data-open") !== String(open)) this.setAttribute("data-open", String(open));
    }

    get open() {
        return this.hasAttribute("open") && this.getAttribute("open") !== "false";
    }

    set open(value) {
        this._sfOpenGiven = true;
        if (value === true) this.setAttribute("open", "");
        else this.setAttribute("open", "false");
        this._reflectOpen();
    }

    attributeChangedCallback(name, previous, next) {
        super.attributeChangedCallback?.(name, previous, next);
        if (previous === next) return;
        if (name === "open") {
            this._sfOpenGiven = true;
            this._reflectOpen();
        }
        if (name === "current") this._navigation?.followPageCurrent?.();
    }

    // The port arrives by the base action connect-port {port} (§4.1, §4.9;
    // the Framework's connectPort, with setHostPort its alias), which keeps it
    // as sfPort and runs this hook. A host adapter exposes {port, version,
    // capabilities, raise(intent, payload)}; only the navigation port is taken,
    // the `items` menu has no port at all. Throwing refuses it
    // (port-unsupported) and the base does not keep it.
    onPortConnected(host) {
        if (!host || typeof host.raise !== "function" || host.port !== NAVIGATION_PORT
            || !SUPPORTED_NAVIGATION_VERSIONS.includes(host.version)) {
            throw new TypeError(
                `sf-admin-menu requires a ${NAVIGATION_PORT} host port: ${SUPPORTED_NAVIGATION_VERSIONS.join(", ")}`,
            );
        }
        const wasConnected = this.isConnected;
        this._navigation?.dispose();
        this.hostPort = host;
        this._navigation = new NavigationController(this, host);
        // A port given after connecting replaces the `items` menu that was
        // drawn meanwhile; its listeners go with it.
        if (wasConnected && !this._answeringRequest) {
            this.unbindSearchShortcut();
            this.unbindContextEvent();
            this.disconnectItemObserver();
            this._navigation.load("host-connected");
        }
        this.requestComponentUpdate("navigation-port");
    }

    beforeRender() {
        super.beforeRender();
        this.refs.items = new Map();
    }

    makeDraggable(handle, item, container, options = {}) {
        const dragCleanup = bindSortableDrag({
            handle,
            item,
            container,
            holdDelay: Number(options.holdDelay) || 0,
            boundAttr: "data-sf-admin-menu-drag-bound",
            placeholderExtraClasses: ["sf-admin-menu-item-cloned"],
            shouldIgnorePointerDown: (event) =>
                Number(options.holdDelay) > 0 &&
                event.target?.closest?.("[data-move]"),
            getAfterElement: (currentContainer, y, event, itemsLayout) =>
                this.getDragAfterElement(currentContainer, y, itemsLayout),
            onDragStart: () => {
                this.isMeasuring = true;
            },
            onDrop: () => {
                this.syncItemsOrderFromContainer(container);
                this.isMeasuring = false;
                this.requestComponentUpdate("order");
            },
            onCancel: () => {
                this.isMeasuring = false;
            },
        });

        if (
            dragCleanup ||
            handle?.getAttribute("data-sf-admin-menu-drag-bound") === "1"
        ) {
            return dragCleanup;
        }

        if (!handle || !item || !container) return;
        if (handle.dataset.sfAdminMenuDragBound === "1") return;
        handle.dataset.sfAdminMenuDragBound = "1";

        const holdDelay = Number(options.holdDelay) || 0;
        let isDragging = false;
        let holdTimer = null;
        let suppressClick = false;

        let shiftX = 0;
        let shiftY = 0;

        let startRect = null;
        let placeholder = null;

        const clearHoldTimer = () => {
            if (!holdTimer) return;
            clearTimeout(holdTimer);
            holdTimer = null;
        };

        const startDrag = (event) => {
            if (isDragging) return;
            this.isMeasuring = true;
            event.preventDefault?.();

            isDragging = true;
            suppressClick = true;

            startRect = item.getBoundingClientRect();

            // расстояние от курсора до левого верхнего угла элемента
            shiftX = event.clientX - startRect.left;
            shiftY = event.clientY - startRect.top;

            // placeholder оставляет место в списке
            const name = item.nodeName.toLowerCase();
            placeholder = document.createElement(name);
            placeholder.className = "drag-placeholder";
            placeholder.style.width = `${startRect.width}px`;
            placeholder.style.height = `${startRect.height}px`;
            placeholder.classList.add("sf-admin-menu-item-cloned", ...item.classList);
            item.before(placeholder);

            // сам элемент вынимаем из потока и двигаем поверх всего
            item.classList.add("is-dragging");

            Object.assign(item.style, {
                position: "fixed",
                left: `${startRect.left}px`,
                top: `${startRect.top}px`,
                width: `${startRect.width}px`,
                zIndex: "9999",
                pointerEvents: "none",
            });

            handle.setPointerCapture?.(event.pointerId);

            document.addEventListener("pointermove", onPointerMove);
        };

        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            if (holdDelay > 0 && event.target?.closest?.("[data-move]")) return;

            clearHoldTimer();

            if (holdDelay > 0) {
                holdTimer = setTimeout(() => {
                    holdTimer = null;
                    startDrag(event);
                }, holdDelay);
            } else {
                startDrag(event);
            }

            document.addEventListener("pointerup", onPointerUp, {once: true});
            document.addEventListener("pointercancel", onPointerCancel, {
                once: true,
            });
        });

        handle.addEventListener(
            "click",
            (event) => {
                if (!suppressClick) return;
                suppressClick = false;
                event.preventDefault();
                event.stopImmediatePropagation();
            },
            true,
        );

        function onPointerMove(event) {
            if (!isDragging) {
                return;
            }

            const containerRect = container.getBoundingClientRect();

            let left = event.clientX - shiftX;
            let top = event.clientY - shiftY;

            // ограничиваем движение внутри родителя
            left = Math.max(containerRect.left, left);
            top = Math.max(containerRect.top, top);

            left = Math.min(containerRect.right - startRect.width, left);
            top = Math.min(containerRect.bottom - startRect.height, top);

            item.style.left = `${left}px`;
            item.style.top = `${top}px`;

            movePlaceholder(event.clientX, event.clientY);
        }

        const movePlaceholder = (x, y) => {
            const afterElement = this.getDragAfterElement(container, y);

            if (!afterElement) {
                container.appendChild(placeholder);
            } else {
                container.insertBefore(placeholder, afterElement);
            }
        };

        const onPointerUp = (event) => {
            clearHoldTimer();
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointercancel", onPointerCancel);

            if (!isDragging) {
                return;
            }

            isDragging = false;
            handle.releasePointerCapture?.(event.pointerId);

            // вставляем реальный элемент на место placeholder
            if (placeholder?.parentNode) {
                placeholder.replaceWith(item);
            }

            item.classList.remove("is-dragging");

            Object.assign(item.style, {
                position: "",
                left: "",
                top: "",
                width: "",
                zIndex: "",
                pointerEvents: "",
            });

            placeholder = null;
            startRect = null;
            this.syncItemsOrderFromContainer(container);
            this.isMeasuring = false;
            this.requestComponentUpdate("order");
        };

        const onPointerCancel = () => {
            clearHoldTimer();
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", onPointerUp);

            if (!isDragging) {
                return;
            }

            isDragging = false;
            placeholder?.remove();
            item.classList.remove("is-dragging");

            Object.assign(item.style, {
                position: "",
                left: "",
                top: "",
                width: "",
                zIndex: "",
                pointerEvents: "",
            });

            placeholder = null;
            startRect = null;
            this.isMeasuring = false;
        };
    }

    getDragAfterElement(container, y, itemsLayout = null) {
        const items = Array.isArray(itemsLayout)
            ? itemsLayout.filter(
                  (layout) =>
                      layout.item?.dataset?.panelId &&
                      !layout.item.classList.contains("hidden") &&
                      !layout.item.classList.contains("more"),
              )
            : Array.from(container?.children || [])
                  .filter(
                      (item) =>
                          item instanceof HTMLElement &&
                          item.dataset.panelId &&
                          !item.classList.contains("is-dragging") &&
                          !item.classList.contains("drag-placeholder") &&
                          !item.classList.contains("hidden") &&
                          !item.classList.contains("more"),
                  )
                  .map((item) => {
                      const box = item.getBoundingClientRect();

                      return {
                          item,
                          middle: box.top + box.height / 2,
                      };
                  });
        let closest = {
            offset: Number.NEGATIVE_INFINITY,
            element: null,
        };

        for (const layout of items) {
            const offset = y - layout.middle;

            if (offset < 0 && offset > closest.offset) {
                closest = {
                    offset,
                    element: layout.item,
                };
            }
        }

        return closest.element;
    }

    syncItemsOrderFromContainer(container) {
        const orderedPanelIds = Array.from(container?.children || [])
            .filter(
                (item) =>
                    item instanceof HTMLElement &&
                    item.dataset.panelId &&
                    !item.classList.contains("more") &&
                    !item.classList.contains("drag-placeholder"),
            )
            .map((item) => item.dataset.panelId);

        if (!orderedPanelIds.length) return;

        const orderIndex = new Map(
            orderedPanelIds.map((panelId, index) => [panelId, index]),
        );
        if (this.state.menuSettings) {
            orderedPanelIds.forEach((panelId, index) => {
                this.patchMenuItemSettings(panelId, {order: index});
            });
        }
        const bottomItems = this._itemsData.filter(
            (item) => item.slot === "bottom",
        );
        let test = {};
        const mainItems = this._itemsData
            .filter((item) => item.slot !== "bottom")
            .map((item) => {
                if (!orderIndex.has(item.panelId)) return item;

                const order = orderIndex.get(item.panelId);
                test[item.panelId] = order;
                return {
                    ...item,
                    order,
                    sourceIndex: order,
                };
            })
            .sort((left, right) => {
                const leftOrder = orderIndex.has(left.panelId)
                    ? orderIndex.get(left.panelId)
                    : Number.MAX_SAFE_INTEGER;
                const rightOrder = orderIndex.has(right.panelId)
                    ? orderIndex.get(right.panelId)
                    : Number.MAX_SAFE_INTEGER;

                if (leftOrder !== rightOrder) return leftOrder - rightOrder;
                return left.sourceIndex - right.sourceIndex;
            });

        this._itemsData = [...mainItems, ...bottomItems];
    }

    pruneItemRefs() {
        const ids = new Set();

        const collect = (items = []) => {
            items.forEach((item) => {
                ids.add(item.panelId);
                collect(item.children);
            });
        };

        collect(this._itemsData);

        for (const id of this.refs.items.keys()) {
            if (!ids.has(id)) {
                this.refs.items.delete(id);
            }
        }
    }

    getPortalContainer() {
        let portal = document.getElementById("sf-admin-menu-portal");

        if (!portal) {
            portal = document.createElement("div");
            portal.id = "sf-admin-menu-portal";
            document.body.append(portal);
        }

        return portal;
    }

    // The header of a submenu stands where the header with the logo stands, and
    // the logo is the host's: its height is whatever the host's image is. So the
    // height is measured rather than guessed, and published for the styles to
    // use — the same way the table measures its pinned columns.
    measureHeadHeight() {
        const panel = this.querySelector(
            ".sf-admin-menu-panel:not(.sf-admin-menu-panel-sub):not(.sf-admin-menu-panel-search)",
        );
        const head = panel?.querySelector(":scope > .sf-admin-menu-head");
        const root = this.refs.mainPanel?.value ?? this.querySelector(".sf-admin-menu");
        if (!head || !root) return this;
        const height = Math.round(head.getBoundingClientRect().height);
        if (height > 0) {
            root.style.setProperty("--sf-admin-menu-head--measured-height", `${height}px`);
        }

        return this;
    }

    async afterRender() {
        const initToken = ++this._adminMenuInitToken;
        this.measureHeadHeight();

        this.syncContextTriggers();

        this.scheduleOverflowUpdate();

        await this.whenChildrenDefined();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        requestAnimationFrame(() => {
            if (!this.isConnected || initToken !== this._adminMenuInitToken) {
                return;
            }
            this.observeMainResize();
            this.scheduleOverflowUpdate();

            [...this.refs.items.entries()].forEach(([panelId, refValue]) => {
                const value = this.getMenuItemElement(panelId, refValue);
                if (!value) {
                    return false;
                }
                const container = this.getMenuPanelElement()?.children[0];
                if (!container) return false;
                if (this.state.menuSettings) {
                    const button = value.querySelector("[data-move]");
                    this.makeDraggable(button, value, container);
                }
                this.makeDraggable(value, value, container, {holdDelay: 200});
            });
        });
    }
}

SfAdminMenu.define("sf-admin-menu");
