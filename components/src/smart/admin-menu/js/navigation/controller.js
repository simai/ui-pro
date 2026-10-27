// The admin menu that replaced the admin's top bar, driven by
// simai.admin-navigation-port (larena-specs frontend-interface-program,
// sf-admin-menu assignment, mockup v5).
//
// sf-admin-menu draws this when a host answers it with a navigation port, and
// its older `items` menu otherwise. Both live in one element on purpose: a
// fifth element would have had to be added across the build, the package
// reference and the locks, and retired the same way, while the `items` menu
// has to keep working for Larena until it connects the port. The `items` path
// goes when Larena has switched (owner, 2026-10-11).
//
// The host owns everything a person sees here -- sites, rows, profiles,
// favourites, the person -- and this controller owns only where the person is:
// which root is open, which section is unfolded, what they typed into «Найти в
// разделе», whether the menu is on its rail. Every change leaves through the
// port, and nothing the host said is kept past the next answer.
import {closeMenu, openMenu, removeMenu, updateMenu} from "./menu";
import {getInitials} from "../../../helpers/text";
import {pageText} from "../../../../core/js/page-language";
import BundledPreferences from "../../../../core/js/preferences.js";
import {wordsOf} from "../words.js";

export const NAVIGATION_PORT = "simai.admin-navigation-port";

// Every port version this shell accepts, in one place, the way sf-data-view and
// sf-property-view keep theirs.
export const SUPPORTED_NAVIGATION_VERSIONS = ["1.0.0"];

// The width at which two columns become two screens. The same query
// sf-property-view and sf-drawer switch on, written the same way, so a reader
// grepping 48rem finds all three.
const WIDE_MEDIA_QUERY = "(min-width: 48rem)";

// «Найти в разделе» is offered once a section has more rows than fit at a
// glance (assignment, section 3).
const FIND_IN_SECTION_FROM = 7;


// How long typing may pause before the palette asks the host. Short enough to
// feel immediate; long enough that a word typed at speed is one question.
const PALETTE_PAUSE_MS = 120;

// ⌘K on a Mac, Ctrl K elsewhere: the hint says the keys this keyboard has.
const IS_MAC = /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? globalThis.navigator?.userAgent ?? "");
export const PALETTE_SHORTCUT = IS_MAC ? "⌘K" : "Ctrl K";

// The id prefix of the lists sf-sortable reorders in the edit mode.
export const LIST_ID = "sf-admin-nav-list-";

export const NAVIGATION_TEXT = wordsOf({
    loading: "loading",
    unavailable: "unavailable",
    retry: "retry",
    search: "search",
    favourites: "favourites",
    fold: "fold",
    unfold: "unfold",
    notifications: "notifications",
    collapse: "collapse",
    expand: "expand",
    hideColumn: "hide-column",
    back: "back",
    allSites: "all-sites",
    findInSection: "find-in-section",
    nothingFound: "nothing-found",
    star: "star",
    unstar: "unstar",
    chooseSite: "choose-site",
    findSite: "find-site",
    manageSites: "manage-sites",
    moreSites: "more-sites",
    external: "external",
    paletteHint: "palette-hint",
    paletteNavigate: "palette-navigate",
    paletteOpen: "palette-open",
    paletteClose: "palette-close",
    account: "account",
    theme: "theme",
    menuWidth: "menu-width",
    columnWidth: "column-width",
    themeLight: "theme-light",
    themeDark: "theme-dark",
    themeSystem: "theme-system",
    language: "language",
    findLanguage: "find-language",
    languageNote: "language-note",
    menuProfile: "menu-profile",
    signOut: "sign-out",
    editMenu: "edit-menu",
    configureMenu: "configure-menu",
    done: "done",
    profileLabel: "profile-label",
    notePersonal: "note-personal",
    noteShared: "note-shared",
    resetToPackages: "reset-to-packages",
    newProfile: "new-profile",
    renameProfile: "rename-profile",
    deleteProfile: "delete-profile",
    sharedProfile: "shared-profile",
    create: "create",
    cancel: "cancel",
    save: "save",
    show: "show",
    hide: "hide",
    more: "more",
    rename: "rename",
    chooseIcon: "choose-icon",
    addSection: "add-section",
    newSection: "new-section",
    packageName: "package-name",
    deleteRow: "delete-row",
    drag: "drag",
    add: "add",
    addDivider: "add-divider",
    addHeading: "add-heading",
    addLink: "add-link",
    linkLabel: "link-label",
    linkHref: "link-href",
    profileName: "profile-name",
    profileNameEmpty: "profile-name-empty",
    linkNameEmpty: "link-name-empty",
    hrefInvalid: "href-invalid",
    hrefInsecure: "href-insecure",
    refused: "refused",
    newHeading: "new-heading",
    conflict: "conflict",
    personalName: "personal-name",
});

const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// What a person asks of the host, told on the element by the vocabulary's verb
// (vocabulary 1.1.5 §5.1: sf-admin-menu-intent splits into
// sf-admin-menu-<verb>). Each port intent of simai.admin-navigation-port is a
// verb with a kind; the detail carries the vocabulary's fields, and the port's
// own intent and payload beside them, which is all the 1.0 name carried.
const INTENT_VERBS = {
    "navigation.load": ["refresh", "navigation", (p) => ({reason: p.reason ?? null, site: p.site ?? null})],
    "item.open": ["open", "item", (p) => ({id: p.key, href: p.href ?? null})],
    "favourite.toggle": ["toggle", "favourite", (p) => ({id: p.key, on: Boolean(p.on)})],
    "preference.compact": ["save", "preference", (p) => ({values: {compact: p.compact}})],
    "preference.widths": ["save", "preference", (p) => ({values: {widths: p.widths}})],
    "preference.theme": ["save", "preference", (p) => ({values: {theme: p.theme}})],
    "preference.language": ["save", "preference", (p) => ({values: {language: p.language}})],
    "sites.search": ["query", "site", (p) => ({query: p.query ?? ""})],
    "site.switch": ["open", "site", (p) => ({id: p.site})],
    "view.profile": ["open", "view", (p) => ({id: p.profile})],
    "view.create": ["create", "view", () => ({})],
    "view.save": ["save", "view", (p) => ({id: p.profile ?? null, revision: p.revision ?? null})],
    "view.reset": ["reset", "view", (p) => ({id: p.profile ?? null})],
    "view.rename": ["rename", "view", (p) => ({id: p.profile, title: p.label ?? ""})],
    "view.delete": ["delete", "view", (p) => ({ids: [p.profile]})],
    "search.query": ["query", "search", (p) => ({query: p.query ?? ""})],
    "search.choose": ["open", "search", (p) => ({id: p.key, group: p.group ?? null})],
    "session.sign-out": ["sign-out", "session", () => ({})],
    "notifications.load": ["refresh", "notifications", () => ({})],
    "notifications.read": ["read", "notifications", (p) => ({ids: [].concat(p.ids ?? p.id ?? [])})],
};


// SF.Preferences, the Framework's one store of view preferences (core
// publishes it; this bundle's copy is the fallback).
const preferences = () => globalThis.SF?.Preferences || BundledPreferences;
const MENU_PREFERENCE = "sf-admin-menu/main";
const FAVOURITES_ROOT = "sf:favourites";

// Larena's region contract (larena/admin, 2026-10-15): the shell's revision in
// <meta name="larena-shell-revision">, the content region in
// main#larena-admin-content, asked for with X-Larena-Region: content. Only
// when both are on the page, and once.
function enableRegionNavigation() {
    const navigation = globalThis.SF?.RegionNavigation;
    if (!navigation || navigation.enabled) return;
    const document = globalThis.document;
    if (!document?.querySelector('meta[name="larena-shell-revision"]') || !document.getElementById("larena-admin-content")) return;
    navigation.enable({
        region: "content",
        root: "#larena-admin-content",
        header: "X-Larena-Region",
        revisionMeta: "larena-shell-revision",
        scope: "/admin",
    });
}

export class NavigationController {
    constructor(element, port) {
        this.element = element;
        this.port = port;
        this.navigation = null;
        this.status = "loading";
        this.message = "";
        this.openRoot = null;
        this.unfolded = new Set();
        this.filter = "";
        // Folded as the person left it, from the first paint: the host's answer
        // came after it, and the menu opened and then folded.
        this.compact = preferences()?.read(MENU_PREFERENCE)?.compact === true;
        this.screen = "first";
        this.sequence = 0;
        this.sites = {open: false, query: "", items: [], next: null, loading: false, sequence: 0};
        // The ⌘K palette: what was typed, what the host answered for it, which
        // result is under the keyboard, and where focus goes back to.
        this.palette = {open: false, query: "", groups: [], scope: "", active: 0, loading: false, sequence: 0};
        this._paletteOpener = null;
        this._paletteTimer = null;
        // The edit mode: on or off, what is being renamed or added, the row whose
        // ⋯ is open, the profile list in the banner, and what the last save said.
        this.edit = {on: false, renaming: null, adding: null, rowMenu: null, profiles: false, naming: null, message: ""};
        this._onSortableIntent = (event) => this.onSortableIntent(event);
        element.addEventListener("sf-sortable-intent", this._onSortableIntent);
        this._onResize = (event) => this.onColumnResize(event);
        element.addEventListener("sf-resize", this._onResize);

        this.wideMedia = typeof globalThis.matchMedia === "function"
            ? globalThis.matchMedia(WIDE_MEDIA_QUERY)
            : null;
        this.wide = this.wideMedia ? this.wideMedia.matches : true;
        this._onWideChange = (event) => {
            this.wide = event.matches;
            // Screens are a phone idea; a desktop shows both columns at once.
            if (this.wide) this.screen = "first";
            this.update("viewport");
        };
        this.wideMedia?.addEventListener?.("change", this._onWideChange);

        this._onDocumentPointer = (event) => {
            const path = event.composedPath();
            const within = (name) => path.some((node) => node?.classList?.contains?.(name));
        };
        this._onKeyDown = (event) => {
            // ⌘K / Ctrl+K opens the palette from anywhere on the page, in every
            // arrangement of the menu -- the rail and the phone included, which
            // is the reason it is a palette over the page rather than a column.
            if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
                && String(event.key).toLowerCase() === "k" && this.offers("search")) {
                event.preventDefault();
                if (this.palette.open) this.closePalette();
                else this.openPalette();
                return;
            }
            if (event.key === "Escape" && this.palette.open) {
                event.preventDefault();
                event.stopPropagation();
                this.closePalette();
                return;
            }
        };
        document.addEventListener("pointerdown", this._onDocumentPointer, true);
        document.addEventListener("keydown", this._onKeyDown, true);
        // The admin's pages without full reloads (interface fragments,
        // 2026-10-15), piloted here: the menu turns region navigation on when
        // the page is Larena's shell -- its revision in the head, its content
        // region in the body -- and keeps its current row on the address the
        // region went to, since the shell around it is not drawn again.
        this._onRegionLoad = (event) => this.followAddress(event.detail?.url);
        document.addEventListener("sf-region-load", this._onRegionLoad);
        enableRegionNavigation();
    }

    // The row whose address is this one becomes current: the deepest match on
    // the path, so /admin/storage/news/42 keeps «Новости» lit.
    followAddress(url) {
        if (!url) return;
        let path;
        try {
            path = new URL(url, globalThis.location.href).pathname;
        } catch {
            return;
        }
        let best = null;
        const visit = (rows) => {
            for (const row of rows ?? []) {
                if (row.href && !["link", "heading", "divider"].includes(row.kind)) {
                    let target = null;
                    try {
                        target = new URL(row.href, globalThis.location.href).pathname;
                    } catch {
                        target = null;
                    }
                    if (target && (path === target || path.startsWith(`${target.replace(/\/$/u, "")}/`))
                        && (!best || target.length > best.length)) best = {key: row.key, length: target.length};
                }
                visit(row.children);
            }
        };
        visit(this.navigation?.items);
        // Drawn again whichever row it is: «Уведомления» reads its own mark
        // from the address, not from a row of the tree.
        if (best && best.key !== this.navigation?.current) this.navigation = {...this.navigation, current: best.key};
        this.followCurrentRoot();
        this.update("address");
    }

    // An open second column shows the root that holds the page: on a page of
    // «Настройки» it still showed «Данные», the root left open on another page
    // (Larena, 2026-10-16). It switches; it never opens or closes by itself --
    // a column the person closed stays closed (owner, 2026-10-13: the menu
    // must not jump).
    followCurrentRoot() {
        if (!this.wide || !this.openRoot) return;
        const holder = this.roots().find((root) => this.holdsCurrent(root)
            && root.key !== this.navigation?.current && (root.children ?? []).length > 0);
        if (!holder || holder.key === this.openRoot) return;
        this.openRoot = holder.key;
        this.rememberRoot(holder.key);
    }

    dispose() {
        removeMenu(this);
        clearTimeout(this._paletteTimer);
        this.element.removeEventListener("sf-sortable-intent", this._onSortableIntent);
        this.element.removeEventListener("sf-resize", this._onResize);
        this.wideMedia?.removeEventListener?.("change", this._onWideChange);
        document.removeEventListener("pointerdown", this._onDocumentPointer, true);
        document.removeEventListener("keydown", this._onKeyDown, true);
        document.removeEventListener("sf-region-load", this._onRegionLoad);
        this.wideMedia = null;
    }

    text(key) {
        return pageText(NAVIGATION_TEXT, key, this.element, "sf-admin-menu");
    }

    update(reason) {
        this.element.requestComponentUpdate(`navigation-${reason}`);
        if (this.palette?.open) requestAnimationFrame(() => this.syncPaletteField());
    }

    // The field is sf-input's own input, so the listbox it drives is named on
    // that element rather than on the wrapper a screen reader never focuses.
    syncPaletteField() {
        const input = this.element.querySelector(".sf-admin-nav-palette-field input");
        if (!input) return;
        input.setAttribute("role", "combobox");
        input.setAttribute("aria-expanded", "true");
        input.setAttribute("aria-controls", "sf-admin-nav-palette-results");
        input.setAttribute("aria-autocomplete", "list");
        input.setAttribute("aria-label", this.text("search"));
        const count = this.paletteResults().length;
        if (count) input.setAttribute("aria-activedescendant", `sf-admin-nav-palette-option-${this.palette.active}`);
        else input.removeAttribute("aria-activedescendant");
    }

    offers(capability) {
        return Boolean(this.port?.capabilities?.includes?.(capability));
    }

    // A host that throws is a host that did not answer; a person sees the same
    // «unavailable» as for a host that said so.
    // Every intent is also told on the element by its verb (INTENT_VERBS), so
    // a page can watch what a person asked of the host without standing
    // between the two; sf-admin-menu-intent, the 1.0 name for all of them,
    // follows each until 2026-12-01 (aliases.json, split).
    async raise(intent, payload = {}) {
        // An intent a later port adds is told as a refresh of its own kind
        // until it has a verb here.
        const [verb, kind, fields] = INTENT_VERBS[intent] ?? ["refresh", String(intent).split(".")[0], () => ({})];
        this.element.sfEmit(verb, {kind, ...fields(payload ?? {}), intent, payload: copy(payload)});
        try {
            const answer = await this.port.raise(intent, copy(payload), {});
            return answer && typeof answer === "object" ? answer : {answer: "unavailable"};
        } catch (error) {
            return {answer: "unavailable", reason: String(error?.message ?? error)};
        }
    }

    // The menu as the host sees it. An answer to an older request than the last
    // one sent is dropped by its echoed sequence: switching sites twice quickly
    // must not end on the first site's rows.
    async load(reason = "connected", site = null) {
        const sequence = ++this.sequence;
        if (!this.navigation) this.status = "loading";
        this.update("loading");
        const answer = await this.raise("navigation.load", {reason, site, sequence});
        this.accept(answer, sequence);
    }

    accept(answer, sequence) {
        if (answer.answer === "applied") {
            const echoed = answer.echo?.sequence ?? sequence;
            if (echoed !== null && echoed < this.sequence) return;
            const first = !this.navigation;
            this.navigation = answer;
            if (first) this.applyPersonPreferences(answer.person);
            // On a wide screen the menu opens where the page is: the root that
            // holds the current row shows its column, as a person who came
            // through it last left it. Only on the first answer -- a root the
            // person closed stays closed when the menu is read again.
            // The second column is shown as the person left it, on every page:
            // opened by the page it moved -- open on one page, closed on the
            // next, open again on a record reached through a link -- and that
            // was the menu jumping (owner, 2026-10-13). Only a person who never
            // chose is shown the root that holds the page.
            if (first && this.wide && !this.openRoot && !answer.person?.compact) {
                const remembered = this.rememberedRoot();
                if (remembered !== undefined) {
                    this.openRoot = remembered && this.roots().some((root) => root.key === remembered) ? remembered : null;
                    this.followCurrentRoot();
                } else {
                    const holder = this.roots().find((root) => this.holdsCurrent(root)
                        && root.key !== answer.current && (root.children ?? []).length > 0);
                    if (holder) this.openRoot = holder.key;
                }
            }
            this.status = "ready";
            this.message = "";
            this.compact = typeof answer.person?.compact === "boolean"
                ? answer.person.compact
                : this.preference.compact === true;
            // An open root the new menu does not hold closes rather than showing
            // an empty column under a heading that no longer exists.
            if (this.openRoot && !this.roots().some((root) => root.key === this.openRoot)) {
                this.openRoot = null;
                this.screen = "first";
            }
        } else if (!this.navigation) {
            this.status = answer.answer === "refused" ? "refused" : "unavailable";
            this.message = answer.reason || "";
        }
        this.update("state");
    }

    // The person's theme and language are the host's to keep, so the page follows
    // them when the menu first reads them. Without this a page could open dark
    // from the Framework's own cookie while the host -- and the profile menu --
    // said «as the system», two answers to one question.
    applyPersonPreferences(person) {
        if (!person || !this.offers("preferences")) return;
        const loader = globalThis.SF?.Loader;
        if (person.theme && loader?.themePreference !== person.theme) loader?.setTheme?.(person.theme);
        const language = globalThis.SF?.language;
        if (person.language && language?.current?.() !== person.language) language?.use?.(person.language);
    }

    // ─── what the template reads ─────────────────────────────────────────────

    // Hidden rows are drawn in the edit mode, struck through, so they can be
    // brought back; outside it they are not drawn at all.
    roots() {
        return (this.navigation?.items ?? []).filter((row) => this.edit?.on || !row.hidden);
    }

    siteRoots() {
        return this.roots().filter((row) => row.level !== "install");
    }

    installRoots() {
        return this.roots().filter((row) => row.level === "install");
    }

    rootByKey(key) {
        if (key === FAVOURITES_ROOT) return this.favouritesRoot();
        return (this.navigation?.items ?? []).find((row) => row.key === key) ?? null;
    }

    // Favourites are a section of their own (owner, 2026-10-15): a star at the
    // foot of the first column, its pages in the second column like any
    // section's. They were a block under the sections, in the first column,
    // where the person mostly works in the second.
    favouritesRoot() {
        const favourites = this.favourites();
        if (!favourites.length) return null;
        return {
            key: FAVOURITES_ROOT, kind: "root", level: "site", label: this.text("favourites"), icon: "star",
            children: favourites.map((entry) => ({...entry, kind: entry.kind === "divider" || entry.kind === "heading" ? entry.kind : "page"})),
        };
    }

    // The rows of the open root as they are drawn: hidden ones gone, headings
    // without a visible row after them gone too (assignment v5, item 9), and the
    // filter applied to pages when one is typed.
    rowsOf(root) {
        if (this.edit?.on) return [...(root?.children ?? [])];
        const rows = (root?.children ?? []).filter((row) => !row.hidden);
        const needle = this.filter.trim().toLowerCase();
        const matched = needle
            ? rows.filter((row) => row.kind === "heading" || (row.label ?? "").toLowerCase().includes(needle)
                || (row.children ?? []).some((child) => (child.label ?? "").toLowerCase().includes(needle)))
            : rows;
        const drawn = [];
        matched.forEach((row, index) => {
            if (row.kind === "heading") {
                const next = matched.slice(index + 1).find((candidate) => candidate.kind !== "divider");
                if (!next || next.kind === "heading") return;
            }
            if (row.kind === "divider" && (needle || drawn.length === 0 || drawn[drawn.length - 1].kind === "divider")) return;
            drawn.push(row);
        });
        while (drawn.length && drawn[drawn.length - 1].kind === "divider") drawn.pop();
        return drawn;
    }

    pageCount(root) {
        return (root?.children ?? []).filter((row) => !row.hidden && !["heading", "divider"].includes(row.kind)).length;
    }

    offersFind(root) {
        return this.pageCount(root) >= FIND_IN_SECTION_FROM;
    }

    favourites() {
        return this.offers("favourites") ? (this.navigation?.favourites ?? []) : [];
    }

    isFavourite(key) {
        return this.favourites().some((entry) => entry.key === key);
    }

    isCurrent(key) {
        return this.navigation?.current === key;
    }

    // A root is shown as current when the page belongs to one of its rows.
    holdsCurrent(root) {
        const current = this.navigation?.current;
        if (!current) return false;
        if (root.key === current) return true;
        return (root.children ?? []).some((row) => row.key === current
            || (row.children ?? []).some((child) => child.key === current));
    }

    // ─── what a person does ──────────────────────────────────────────────────

    openRootColumn(key) {
        if (this.openRoot === key && this.wide) {
            this.openRoot = null;
        } else {
            this.openRoot = key;
            this.filter = "";
            if (!this.wide) this.screen = "second";
        }
        if (this.wide) this.rememberRoot(this.openRoot);
        this.update("root");
    }

    hideColumn() {
        this.openRoot = null;
        this.screen = "first";
        if (this.wide) this.rememberRoot(null);
        this.update("root");
    }

    // Which root's column the person left open, per site, in this browser:
    // undefined when they never chose, "" when they closed it. A preference of
    // the person's view rather than the host's data, so it is the browser's.
    rootMemoryKey() {
        return `sf-admin-menu:open-root:${this.navigation?.site?.current?.key ?? ""}`;
    }

    // The menu's view preference (SF.Preferences, owner 2026-10-14): the
    // root left open per site and whether the menu is folded to its rail, kept
    // for the person with every other view preference.
    get preference() {
        return preferences()?.read(MENU_PREFERENCE) ?? {};
    }

    keepPreference(patch) {
        preferences()?.write(MENU_PREFERENCE, {...this.preference, v: 1, ...patch});
    }

    rememberedRoot() {
        const roots = this.preference.openRoots ?? {};
        const site = this.navigation?.site?.current?.key ?? "";
        if (Object.prototype.hasOwnProperty.call(roots, site)) return roots[site] ?? "";
        // What this browser kept before the standard, taken over once.
        try {
            const legacy = globalThis.localStorage?.getItem(this.rootMemoryKey());
            if (legacy !== null && legacy !== undefined) {
                this.rememberRoot(legacy);
                globalThis.localStorage?.removeItem(this.rootMemoryKey());
                return legacy;
            }
        } catch {
            // nothing kept
        }
        return undefined;
    }

    rememberRoot(key) {
        const site = this.navigation?.site?.current?.key ?? "";
        this.keepPreference({openRoots: {...(this.preference.openRoots ?? {}), [site]: key ?? ""}});
    }

    back() {
        this.screen = "first";
        this.update("screen");
    }

    toggleSection(key) {
        if (this.unfolded.has(key)) this.unfolded.delete(key);
        else this.unfolded.add(key);
        this.update("section");
    }

    setFilter(value) {
        this.filter = String(value ?? "");
        this.update("filter");
    }

    // A row is a link the browser understands -- a middle click or a modified
    // click opens it in a tab as any link would -- and a plain click is the
    // host's to answer, because what opening a row means is the host's.
    async openRow(row, event) {
        if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
        if (row.kind === "link") return;
        event?.preventDefault?.();
        if (row.kind === "root") {
            this.openRootColumn(row.key);
            return;
        }
        if (row.kind === "section") {
            this.toggleSection(row.key);
            return;
        }
        const answer = await this.raise("item.open", {key: row.key, href: row.href ?? null});
        if (answer.answer === "applied") {
            this.navigation = {...this.navigation, current: row.key};
            if (!this.wide) this.screen = "first";
            this.update("open");
            const href = answer.href ?? row.href ?? null;
            // With region navigation on, the menu goes there itself and says so:
            // `region: true` tells a host listener the page is already on its
            // way, so it does not load it a second time.
            const region = Boolean(href && globalThis.SF?.RegionNavigation?.enabled);
            this.element.sfEmit("navigate", {id: row.key, key: row.key, href, region});
            if (region) globalThis.SF.RegionNavigation.navigate(new URL(href, globalThis.location.href).href);
        }
    }

    async toggleFavourite(row) {
        const on = !this.isFavourite(row.key);
        const answer = await this.raise("favourite.toggle", {key: row.key, on});
        if (answer.answer === "applied" && Array.isArray(answer.favourites)) {
            this.navigation = {...this.navigation, favourites: answer.favourites};
            this.update("favourite");
        }
    }

    async toggleCompact() {
        this.compact = !this.compact;
        if (this.compact) this.openRoot = null;
        this.keepPreference({compact: this.compact});
        this.update("compact");
        if (this.offers("preferences")) await this.raise("preference.compact", {compact: this.compact});
        // The payload the manifest has always declared for this event.
        this.element.sfEmit("compact-change", {compact: this.compact, source: "toggle"});
    }

    // ─── the site switcher ───────────────────────────────────────────────────

    // Whenever the host switches sites, however many there are now: with one
    // site the switcher was a dead button, and read as broken (owner,
    // 2026-10-14). Its list says which site this is and finds the others.
    canSwitchSite() {
        return this.offers("site-switch");
    }

    // The sites are the Framework's standard menu (owner, 2026-10-12): the
    // same list with a search as the languages in the profile menu, searched by
    // the host because an agency may have hundreds of sites.
    async openSites(anchor) {
        if (!this.canSwitchSite()) return;
        this.sites = {...this.sites, open: true, query: "", items: [], next: null};
        const opened = await openMenu(this, anchor, {
            label: this.text("chooseSite"),
            // As wide as the switcher it opens from (owner, 2026-10-14), but in
            // the narrow rail, where the switcher is a picture.
            width: this.compact ? "content" : "trigger",
            entries: this.siteEntries(),
            search: {placeholder: this.text("findSite"), empty: this.text("nothingFound"), remote: true},
            onSearch: (query) => this.searchSites(query),
            onClose: () => { this.sites = {...this.sites, open: false}; },
            select: (id) => {
                const [kind, key] = String(id ?? "").split(/:(.*)/su);
                if (kind === "site") return this.switchSite(key);
                if (kind === "more") return this.searchSites(this.sites.query, {more: true});
                return null;
            },
        });
        if (!opened) {
            this.sites = {...this.sites, open: false};
            return;
        }
        await this.searchSites("");
    }

    siteEntries() {
        const current = this.navigation?.site?.current?.key;
        const entries = this.sites.items.map((site) => ({
            id: `site:${site.key}`, text: site.label, caption: site.caption,
            initials: site.mark || getInitials(site.label ?? ""),
            kind: "radio", checked: site.key === current,
        }));
        if (this.sites.next !== null && this.sites.next !== undefined) {
            entries.push({id: "more", text: this.text("moreSites"), icon: "expand_more", keepOpen: true, disabled: this.sites.loading});
        }
        const manage = this.navigation?.site?.manage_href;
        if (manage) entries.push({type: "separator"}, {id: "manage", text: this.text("manageSites"), icon: "settings", href: manage});
        return entries;
    }

    closeSites() {
        if (this.sites.open) closeMenu(this);
        this.sites = {...this.sites, open: false};
    }

    // Asked of the host, a page at a time; never filtered here, because an
    // agency may have hundreds of sites.
    async searchSites(query, {more = false} = {}) {
        const sequence = ++this.sites.sequence;
        this.sites = {...this.sites, query, loading: true};
        const answer = await this.raise("sites.search", {query, cursor: more ? this.sites.next : null});
        if (sequence !== this.sites.sequence) return;
        if (answer.answer === "applied") {
            this.sites = {
                ...this.sites,
                loading: false,
                items: more ? [...this.sites.items, ...(answer.items ?? [])] : (answer.items ?? []),
                next: answer.next_cursor ?? null,
            };
        } else {
            this.sites = {...this.sites, loading: false};
        }
        if (this.sites.open) updateMenu(this, this.siteEntries());
    }

    async switchSite(key) {
        this.closeSites();
        if (key === this.navigation?.site?.current?.key) return;
        const sequence = ++this.sequence;
        const answer = await this.raise("site.switch", {site: key, sequence});
        this.accept(answer, sequence);
    }

    // ─── the profile menu ────────────────────────────────────────────────────

    currentLanguage() {
        const code = this.navigation?.person?.language;
        return (this.navigation?.person?.languages ?? []).find((entry) => entry.code === code) ?? null;
    }

    // Applied at once through the Framework's own theme switch, which every page
    // on the Framework already answers; the host keeps it for the next page.
    // A column's width is the person's, as the theme is (owner, 2026-10-14):
    // kept by the host with preference.widths when it keeps preferences, so it
    // is the same on any computer; the browser keeps it too, for a host that
    // does not. A reset sends null: the column's own width again.
    async onColumnResize(event) {
        const phase = event.detail?.phase;
        const column = /^admin-nav-(first|second)$/u.exec(event.target?.getAttribute?.("storage-key") ?? "")?.[1];
        if (!column || (phase !== "end" && phase !== "reset") || !this.navigation?.person) return;
        const width = phase === "reset" ? null : Math.round(Number(event.detail?.width) || 0) || null;
        const widths = {...(this.navigation.person.widths ?? {}), [column]: width};
        this.navigation = {...this.navigation, person: {...this.navigation.person, widths}};
        if (this.offers("preferences")) await this.raise("preference.widths", {widths});
    }

    async chooseTheme(theme) {
        globalThis.SF?.Loader?.setTheme?.(theme);
        this.navigation = {...this.navigation, person: {...this.navigation.person, theme}};
        this.update("theme");
        if (this.offers("preferences")) await this.raise("preference.theme", {theme});
    }

    // Framework components change language without a reload; whether the host's
    // own page needs one is the host's answer, not this component's guess.
    async chooseLanguage(code) {
        globalThis.SF?.language?.use?.(code);
        this.navigation = {...this.navigation, person: {...this.navigation.person, language: code}};
        if (!this.offers("preferences")) return;
        const answer = await this.raise("preference.language", {language: code});
        if (answer.answer === "applied" && answer.reload === true) globalThis.location?.reload?.();
    }

    async chooseProfile(key) {
        if (key === this.navigation?.profiles?.current) return;
        const answer = await this.raise("view.profile", {profile: key});
        if (answer.answer === "applied" && answer.navigation) {
            this.accept({...answer.navigation, answer: "applied"}, this.sequence);
        }
    }

    async signOut() {
        const answer = await this.raise("session.sign-out", {});
        if (answer.answer !== "applied") return;
        this.element.sfEmit("navigate", {id: "session.sign-out", key: "session.sign-out", href: answer.href ?? null});
    }

    // ─── the edit mode ───────────────────────────────────────────────────────

    currentProfile() {
        const profiles = this.navigation?.profiles;
        return profiles?.list?.find((entry) => entry.key === profiles.current) ?? null;
    }

    mayEdit(profile = this.currentProfile()) {
        const rights = this.navigation?.rights ?? {};
        if (!profile) return false;
        return profile.kind === "shared" ? Boolean(rights.edit_shared) : Boolean(rights.edit_personal);
    }

    // The pencil is there when something can be edited at all: the current
    // profile, or a personal one the edit mode can move to.
    canEdit() {
        if (!this.offers("menu-profiles") || !this.navigation) return false;
        return this.mayEdit() || Boolean(this.navigation.rights?.edit_personal);
    }

    // A shared profile this person may not change is not edited by stealth:
    // the edit mode moves to their personal profile, made from the one they
    // were looking at when they have none.
    async startEdit() {
        if (!this.canEdit()) return;
        closeMenu(this);
        // The edit mode chooses a row's glyph with the grid dropdown, which the
        // menu fetches when it is first needed rather than with every page.
        globalThis.SF?.Loader?.ensureSmartElementLoaded?.("sf-dropdown");
        if (!this.mayEdit()) {
            let personal = this.navigation.profiles.list.find((entry) => entry.kind === "personal");
            if (!personal) {
                const made = await this.raise("view.create", {
                    label: this.text("personalName"), shared: false, from: this.navigation.profiles.current,
                });
                if (made.answer !== "applied") return this.editMessage(made.reason);
                personal = made.profiles?.list?.find((entry) => entry.kind === "personal");
            }
            if (!personal || !(await this.switchProfile(personal.key))) return;
        }
        this.edit = {...this.edit, on: true, message: ""};
        if (!this.openRoot) {
            const first = this.siteRoots().find((root) => root.kind === "root");
            if (first && this.wide) this.openRoot = first.key;
        }
        this.update("edit");
    }

    stopEdit() {
        closeMenu(this);
        this.edit = {on: false, renaming: null, adding: null, rowMenu: null, profiles: false, naming: null, message: ""};
        this.update("edit");
    }

    // A refusal is said in words: the host's codes are for logs. One the menu
    // knows by name is translated, the rest is named as it came.
    reasonText(reason) {
        const code = String(reason ?? "");
        if (!code) return "";
        if (code === "admin_menu_layout_href_invalid") return this.text("hrefInvalid");
        if (/\s/u.test(code)) return code;
        return this.text("refused").replace("{reason}", code);
    }

    editMessage(text) {
        this.edit = {...this.edit, message: this.reasonText(text)};
        this.update("edit");
        return false;
    }

    async switchProfile(key) {
        const answer = await this.raise("view.profile", {profile: key});
        if (answer.answer !== "applied" || !answer.navigation) return this.editMessage(answer.reason);
        this.accept({...answer.navigation, answer: "applied"}, this.sequence);
        return true;
    }

    // The whole layout, read off the menu as it is drawn: where every row sits,
    // its order, whether it is hidden, a name a person gave it, and their own
    // rows. A save is always the whole of it, against the revision it came from.
    layoutOf(items) {
        const layout = {schema_version: 1, items: {}, own: []};
        const place = (row, parent, order) => {
            const named = row.label !== (row.package_label ?? row.label) ? row.label : null;
            if (row.own) {
                layout.own.push({
                    key: row.key, kind: row.kind, parent, order,
                    label: row.label ?? null, icon: row.icon ?? null, href: row.href ?? null,
                });
            } else {
                // A glyph chosen for a package's row is saved with it: it was
                // written as null, so every choice was lost on the next read
                // (owner, 2026-10-14). Where the host says the package's own
                // glyph, only a different one is saved; where it does not, the
                // row's glyph is, so a chosen one is never dropped.
                const chosen = "package_icon" in row ? (row.icon !== row.package_icon ? row.icon ?? null : null) : row.icon ?? null;
                layout.items[row.key] = {parent, order, hidden: Boolean(row.hidden), label: named, icon: chosen};
            }
        };
        items.forEach((root, rootIndex) => {
            place(root, null, rootIndex);
            (root.children ?? []).forEach((row, index) => place(row, root.key, index));
        });
        return layout;
    }

    // Every change is drawn at once and saved at once (assignment, section 7).
    // A conflict reads the menu again, with the reason said; nothing is merged
    // behind the person's back.
    async change(mutate) {
        const items = JSON.parse(JSON.stringify(this.navigation.items ?? []));
        mutate(items);
        this.navigation = {...this.navigation, items};
        this.edit = {...this.edit, message: ""};
        this.update("edit-change");
        const answer = await this.raise("view.save", {
            profile: this.navigation.profiles.current,
            revision: this.navigation.revision,
            layout: this.layoutOf(items),
        });
        if (answer.answer === "applied") {
            this.navigation = {...this.navigation, revision: answer.revision ?? this.navigation.revision};
            return true;
        }
        this.editMessage(answer.answer === "conflict" ? this.text("conflict") : answer.reason);
        await this.load("refresh-after-conflict");
        return false;
    }

    // The list a key lives in: the roots, or one root's rows.
    listOf(items, parent) {
        if (parent === null || parent === "roots") return items;
        return items.find((root) => root.key === parent)?.children ?? null;
    }

    findIn(items, key) {
        for (const root of items) {
            if (root.key === key) return {row: root, list: items};
            const at = (root.children ?? []).find((row) => row.key === key);
            if (at) return {row: at, list: root.children};
        }
        return null;
    }

    toggleHidden(key) {
        return this.change((items) => {
            const found = this.findIn(items, key);
            if (found) found.row.hidden = !found.row.hidden;
        });
    }

    renameRow(key, label) {
        this.edit = {...this.edit, renaming: null, rowMenu: null};
        const text = String(label ?? "").trim();
        if (!text) return this.update("edit");
        return this.change((items) => {
            const found = this.findIn(items, key);
            if (found) found.row.label = text;
        });
    }

    // A row's glyph, chosen in the edit mode from the same list as a record
    // section's (owner, 2026-10-13); saved in the profile with the row.
    setRowIcon(key, icon) {
        const next = String(icon ?? "").trim();
        if (!next) return this.update("edit");
        return this.change((items) => {
            const found = this.findIn(items, key);
            if (found) found.row.icon = next;
        });
    }

    returnPackageName(key) {
        this.edit = {...this.edit, rowMenu: null};
        return this.change((items) => {
            const found = this.findIn(items, key);
            if (found && found.row.package_label) found.row.label = found.row.package_label;
        });
    }

    removeOwnRow(key) {
        this.edit = {...this.edit, rowMenu: null};
        return this.change((items) => {
            const found = this.findIn(items, key);
            if (found?.row.own) found.list.splice(found.list.indexOf(found.row), 1);
        });
    }

    // A link's address, as the host keeps it: a path on this site, or an
    // https:// address. A bare host name gets https://; http:// is refused
    // (owner, 2026-10-14). A wrong address refused the whole layout, and the
    // rows added with it vanished on the next read.
    static linkAddress(value) {
        const text = String(value ?? "").trim();
        if (!text) return {error: "hrefInvalid"};
        if (text.startsWith("/") && !text.startsWith("//")) return {href: text};
        if (/^http:\/\//iu.test(text)) return {error: "hrefInsecure"};
        const full = /^[a-z][a-z0-9+.-]*:/iu.test(text) ? text : `https://${text.replace(/^\/\//u, "")}`;
        try {
            const url = new URL(full);
            if (url.protocol !== "https:" || !url.hostname.includes(".")) return {error: "hrefInvalid"};
            return {href: url.href};
        } catch {
            return {error: "hrefInvalid"};
        }
    }

    addLink(parent, label, href) {
        const name = String(label ?? "").trim();
        const address = this.constructor.linkAddress(href);
        if (!name || address.error) {
            this.edit = {...this.edit, linkError: name ? this.text(address.error) : this.text("linkNameEmpty")};
            return this.update("edit");
        }
        this.edit = {...this.edit, draft: null, linkError: ""};
        return this.addOwnRow(parent, "link", {label: name, href: address.href});
    }

    // A person's own rows get keys the layout recognises as theirs; the host
    // keeps them as they are, inside the profile they were made in.
    addOwnRow(parent, kind, {label = null, href = null} = {}) {
        this.edit = {...this.edit, adding: null};
        const key = `own.${Date.now().toString(36)}`;
        const row = {
            key, kind, level: "site", own: true, hidden: false, package_label: null,
            label: kind === "divider" ? null : (label || this.text(kind === "root" ? "newSection" : "newHeading")),
            icon: kind === "link" ? "open_in_new" : kind === "root" ? "folder" : null,
            href: kind === "link" ? href : null,
            attention: null, badge: null, shortcut: null, action: null,
            ...(kind === "root" ? {children: []} : {}),
        };
        return this.change((items) => this.listOf(items, parent)?.push(row)).then((saved) => {
            if (saved && kind === "root") {
                this.openRoot = key;
                this.edit = {...this.edit, renaming: key};
                this.update("edit");
            } else if (saved && kind === "heading") {
                this.edit = {...this.edit, renaming: key};
                this.update("edit");
            }
            return saved;
        });
    }

    // sf-sortable says what was moved and where to; this controller moves it in
    // the menu it holds and saves. A row moves within its list, or between the
    // top level and the open section's column (owner, 2026-10-14); a section
    // stays at the top level, as the menu is two levels deep.
    onSortableIntent(event) {
        if (!this.edit.on) return;
        // sf-sortable names a list by its id; the lists here are
        // `sf-admin-nav-list-roots` and `sf-admin-nav-list-<root key>`.
        const {item, from, to, index} = event.detail ?? {};
        const listKey = (id) => (typeof id === "string" && id.startsWith(LIST_ID) ? id.slice(LIST_ID.length) : null);
        const source = listKey(from);
        const target = listKey(to);
        if (!source || !target) return;
        if (source === target) {
            this.moveRow(source, item, index);
            return;
        }
        this.moveRowBetween(source, target, item, index);
    }

    moveRowBetween(source, target, key, index) {
        const from = this.listOf(this.navigation.items ?? [], source === "roots" ? null : source);
        const row = from?.find((entry) => entry.key === key);
        if (!row || (target !== "roots" && row.kind === "root")) return null;
        return this.change((items) => {
            const list = this.listOf(items, source === "roots" ? null : source);
            const into = this.listOf(items, target === "roots" ? null : target);
            const at = list?.findIndex((entry) => entry.key === key) ?? -1;
            if (!into || at < 0) return;
            const [moved] = list.splice(at, 1);
            into.splice(Math.max(0, Math.min(index, into.length)), 0, moved);
        });
    }

    moveRow(listKey, key, index) {
        return this.change((items) => {
            const list = this.listOf(items, listKey === "roots" ? null : listKey);
            if (!list) return;
            const at = list.findIndex((row) => row.key === key);
            if (at < 0) return;
            const [row] = list.splice(at, 1);
            list.splice(Math.max(0, Math.min(index, list.length)), 0, row);
        });
    }

    async resetProfile() {
        const answer = await this.raise("view.reset", {
            profile: this.navigation.profiles.current, revision: this.navigation.revision,
        });
        if (answer.answer === "applied" && answer.navigation) {
            this.accept({...answer.navigation, answer: "applied"}, this.sequence);
            this.editMessage("");
            return;
        }
        this.editMessage(answer.answer === "conflict" ? this.text("conflict") : answer.reason);
        await this.load("refresh-after-conflict");
    }

    toggleEditProfiles() {
        this.edit = {...this.edit, profiles: !this.edit.profiles, naming: null};
        this.update("edit");
    }

    async editProfile(key) {
        this.edit = {...this.edit, profiles: false};
        if (key !== this.navigation.profiles.current) await this.switchProfile(key);
        this.update("edit");
    }

    startNaming(mode) {
        this.edit = {...this.edit, naming: mode, draft: null, message: ""};
        this.update("edit");
    }

    async createProfile(label, shared) {
        const text = String(label ?? "").trim();
        if (!text) return this.editMessage(this.text("profileNameEmpty"));
        const answer = await this.raise("view.create", {label: text, shared: Boolean(shared), from: this.navigation.profiles.current});
        if (answer.answer !== "applied") return this.editMessage(answer.reason);
        const made = answer.profiles?.list?.find((entry) => entry.label === text
            && !this.navigation.profiles.list.some((known) => known.key === entry.key));
        this.edit = {...this.edit, profiles: false, naming: null, draft: null};
        if (made) await this.switchProfile(made.key);
        else await this.load("requested");
    }

    async renameProfile(label, profile = this.navigation.profiles.current) {
        const text = String(label ?? "").trim();
        if (!text) return this.editMessage(this.text("profileNameEmpty"));
        const answer = await this.raise("view.rename", {profile, label: text});
        if (answer.answer !== "applied") return this.editMessage(answer.reason);
        this.navigation = {...this.navigation, profiles: answer.profiles ?? this.navigation.profiles};
        this.edit = {...this.edit, profiles: false, naming: null};
        this.update("edit");
    }

    async deleteProfile(profile = this.navigation.profiles.current) {
        const answer = await this.raise("view.delete", {profile});
        if (answer.answer !== "applied") return this.editMessage(answer.reason);
        this.edit = {...this.edit, profiles: false, naming: null};
        if (answer.navigation) this.accept({...answer.navigation, answer: "applied"}, this.sequence);
        else await this.load("requested");
        if (!this.mayEdit()) this.stopEdit();
    }

    // ─── the palette ─────────────────────────────────────────────────────────

    openPalette() {
        if (!this.offers("search") || this.palette.open) return;
        this._paletteOpener = document.activeElement;
        this.closeSites();
        this.palette = {...this.palette, open: true, query: "", groups: [], scope: "", active: 0};
        this.update("palette");
        // Empty text asks for what the host shows before anything is typed:
        // «Недавние» and the actions.
        this.queryPalette("", {now: true});
        this.focusPalette();
    }

    // The field is sf-input's own <input>. The first time the palette opens on a
    // page, sf-input may not even be loaded yet -- the Loader fetches a tag's
    // script when the tag first appears -- so the field arrives some hundreds of
    // milliseconds after the dialog. Asking once, or for a few frames, found
    // nothing and left focus on the page behind a dialog that says it is modal.
    focusPalette(attempt = 0) {
        if (!this.palette.open) return;
        const input = this.element.querySelector(".sf-admin-nav-palette-field input");
        if (!input) {
            if (attempt < 60) setTimeout(() => this.focusPalette(attempt + 1), 50);
            return;
        }
        this.syncPaletteField();
        if (document.activeElement !== input) input.focus();
    }

    closePalette({restoreFocus = true} = {}) {
        if (!this.palette.open) return;
        clearTimeout(this._paletteTimer);
        this.palette = {...this.palette, open: false};
        this.update("palette");
        const opener = this._paletteOpener;
        this._paletteOpener = null;
        if (restoreFocus && opener?.isConnected) opener.focus?.();
    }

    queryPalette(text, {now = false} = {}) {
        const query = String(text ?? "");
        this.palette = {...this.palette, query};
        clearTimeout(this._paletteTimer);
        const ask = async () => {
            const sequence = ++this.palette.sequence;
            this.palette = {...this.palette, loading: true};
            this.update("palette");
            const answer = await this.raise("search.query", {query, sequence});
            // A late answer is dropped: what the field shows is what the
            // results answer.
            if (!this.palette.open || sequence !== this.palette.sequence) return;
            if (answer.answer === "applied") {
                this.palette = {
                    ...this.palette,
                    loading: false,
                    groups: (answer.groups ?? []).filter((group) => (group.items ?? []).length || group.more),
                    scope: answer.echo?.scope ?? "",
                    active: 0,
                };
            } else {
                this.palette = {...this.palette, loading: false, groups: []};
            }
            this.update("palette");
        };
        if (now) ask();
        else this._paletteTimer = setTimeout(ask, PALETTE_PAUSE_MS);
    }

    paletteResults() {
        return this.palette.groups.flatMap((group) => (group.items ?? []).map((item) => ({group: group.key, item})));
    }

    movePalette(delta) {
        const count = this.paletteResults().length;
        if (!count) return;
        this.palette = {...this.palette, active: (this.palette.active + delta + count) % count};
        this.update("palette-active");
        requestAnimationFrame(() => this.element
            .querySelector(".sf-admin-nav-palette-item[data-active=\"true\"]")
            ?.scrollIntoView?.({block: "nearest"}));
    }

    async choosePalette(index = this.palette.active) {
        const chosen = this.paletteResults()[index];
        if (!chosen) return;
        const answer = await this.raise("search.choose", {group: chosen.group, key: chosen.item.key});
        if (answer.answer !== "applied") return;
        this.closePalette({restoreFocus: false});
        const href = answer.href ?? chosen.item.href ?? null;
        if (chosen.item.kind !== "action" && this.navigation) {
            this.navigation = {...this.navigation, current: chosen.item.key};
            this.update("open");
        }
        this.element.sfEmit("navigate", {id: chosen.item.key, key: chosen.item.key, href});
    }

    onPaletteKey(event) {
        if (event.key === "ArrowDown") { event.preventDefault(); this.movePalette(1); }
        else if (event.key === "ArrowUp") { event.preventDefault(); this.movePalette(-1); }
        else if (event.key === "Enter") { event.preventDefault(); this.choosePalette(); }
    }

    context() {
        return {
            controller: this,
            text: (key) => this.text(key),
            status: this.status,
            message: this.message,
            navigation: this.navigation,
            wide: this.wide,
            compact: this.compact && this.wide,
            screen: this.screen,
            openRoot: this.openRoot ? this.rootByKey(this.openRoot) : null,
            filter: this.filter,
            sites: this.sites,
            palette: this.palette,
            shortcut: PALETTE_SHORTCUT,
            edit: this.edit,
        };
    }
}
