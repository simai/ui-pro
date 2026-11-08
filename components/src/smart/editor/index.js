// sf-editor: the one block editor (owner's decision of 2026-11-03, ui-control
// control/ui-editor/UNIFIED-BLOCK-EDITOR.md; Part B of ONE-EDITOR-ASSIGNMENT).
// Layout and text are one Composition Document and one editor: there are no
// modes, only depth. A click on text types; a click beside it chooses the
// block; Esc goes up a level and Enter down. One catalogue serves the + between
// blocks, / in text and the library on the left; one parameter panel shows
// where each value comes from (type, theme, variant, block, screen); one undo
// history holds typing and structure. Rights come from the host: the editor
// shows what follows from them (locked parts dimmed with a lock and a reason)
// and has no role switch. The theme is the host's and is only read. The site
// template and the block builder are separate, explicit edits.
//
// Built on the Part A contracts of SIMAI Framework (ui-source a0b7f2ec): the
// catalogue and variants, layout parameters as utilities, parameter sets,
// composed site blocks, named places and data from the host's source port.
// The model (js/model.mjs) holds the Document and every change; this element
// draws it with the Framework's own renderers and its own Smart components.
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import Composition, {EDITOR_FIELD_WORDS, EDITOR_WORDS_OWNER} from "../../core/js/composition/index.mjs";
import {CATALOGUE_GROUPS, catalogueEntry} from "../../core/js/composition/catalogue.mjs";
import {isComposed} from "../../core/js/composition/composed.mjs";
import {readInlineDom, renderInlineDom, startInlineEdit, textOffset} from "../../core/js/composition/inline-editor.mjs";
import {localeText, pageLocale} from "../../core/js/page-language.js";
import {EditorModel, MAX_COLUMNS, ORIGINS, SCREENS, refusedClasses} from "./js/model.mjs";
import {catalogueAt, groupIcon, groupWordKey, itemKey, pick, pushRecent, searchItems, sectionForPlace, sectionsOf, skeletonOf, toggleFavourite, typeWordKey} from "./js/catalogue.mjs";
import {isPlainObject, locate} from "./js/tree.mjs";
import {renderEditorTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

const applied = (value) => (value === undefined ? {outcome: "applied"} : {outcome: "applied", value});
const refused = (reason) => ({outcome: "refused", reason});
const ID = "data-sf-composition-id";

/**
 * The box an element is drawn in. A Framework button's host (sf-button,
 * sf-button-icon) is display: contents and has no box of its own, so its
 * rectangle is 0 at the window's top-left: the box is its button's (G-37).
 */
function boxOf(element) {
    if (!element?.getBoundingClientRect) return null;
    const own = element.getBoundingClientRect();
    if (own.width || own.height) return own;
    const inner = element.querySelector?.(":scope > button, button") ?? element.firstElementChild;
    return inner && inner !== element ? boxOf(inner) : own;
}
const INLINE_EVENTS = ["sf-editor-inline-input", "sf-editor-inline-change", "sf-editor-inline-cancel", "sf-inline-editor-input", "sf-inline-editor-change", "sf-inline-editor-cancel", "sf-inline-edit-input", "sf-inline-edit-commit", "sf-inline-edit-cancel"];
const TEXT_TAGS = new Set(["content.paragraph", "content.heading", "content.list-item"]);
// The part of a block's width a drop near its side counts as a side drop.
const SIDE_ZONE = 0.18;
const DRAG_THRESHOLD = 4;
const SCREEN_ORDER = ["desktop", "tablet", "phone"];
const SCREEN_ICONS = {desktop: "desktop_windows", tablet: "tablet_mac", phone: "smartphone"};
const STATES = ["auto", "empty", "error", "loading"];

const EditorElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "en",
    actions: {
        select({id} = {}) {
            if (id && !this.model.place(String(id))) return refused("unknown");
            this.choose(id ? String(id) : null);
            return applied();
        },
        edit({id} = {}) {
            const node = id ? this.model.textNode(String(id)) : null;
            if (!node) return refused("unknown");
            const started = this.model.startTyping(String(id));
            if (!started.ok) return refused(started.reason);
            this.refresh();
            this.afterDraw(() => this.activate(String(id), "end"));
            return applied();
        },
        insert({type, variant, after} = {}) {
            const choice = {type: String(type ?? ""), ...(variant ? {variant: String(variant)} : {})};
            if (!this.model.manifestOf(choice.type)) return refused("unknown");
            const place = after ? this.model.placeAfter(String(after)) : null;
            if (after && !place) return refused("unknown");
            const result = this.insertChoice(choice, place);
            return result.ok ? applied({id: result.id}) : refused(result.reason);
        },
        undo() {
            return this.history("undo");
        },
        redo() {
            return this.history("redo");
        },
        "set-parameter"({id, key, value, screen} = {}) {
            const breakpoint = SCREENS[screen] ?? SCREENS[this.screenName];
            const result = this.model.setParam(String(id ?? ""), String(key ?? ""), value, breakpoint);
            if (!result.ok) return refused(result.reason);
            this.redraw();
            return applied();
        },
        "edit-template"({on} = {}) {
            const result = this.toggleTemplate(on !== false);
            return result.ok ? applied() : refused(result.reason);
        },
        "build-block"({id, type} = {}) {
            const result = this.openBuilder({from: id ? String(id) : null, type: type ? String(type) : null});
            return result.ok ? applied() : refused(result.reason);
        },
        async output({format} = {}) {
            const value = await this.outputOf(String(format ?? "json"));
            return value === null ? refused("unknown") : applied(value);
        },
    },
});

class SfEditor extends EditorElement {
    constructor() {
        super();
        for (const name of ["document", "types", "editorManifests", "siteBlocks", "words", "rights", "theme", "renderers", "pageSettings"]) {
            if (Object.prototype.hasOwnProperty.call(this, name)) {
                const early = this[name];
                delete this[name];
                this[name] = early;
            }
        }
        this.model = new EditorModel();
        this.main = this.model;
        this.builder = null;
        this.adopted = undefined;
        this.sent = "";
        this.session = null;
        this.sessionId = "";
        this.hoverId = "";
        this.gutterId = "";
        this.drag = null;
        this.pop = null;
        this.popQuery = "";
        this.popActive = 0;
        this.libraryQuery = "";
        this.leftTab = "blocks";
        this.rightTab = "parameters";
        this.lockNote = null;
        this.outputView = null;
        this.notice = "";
        this.dataState = new Map();
        this.dataCache = new Map();
        this.recent = [];
        this.favourites = [];
        this.drawToken = 0;
        this.pendingAfterDraw = [];
        this.listening = null;
        this.seen = {};
        this.pageLandmarks = false;
        this.dropped = null;
        this.librarySection = "";
        this.libraryClosed = new Set();
        this.helpOpen = null;
        this.codeCache = new Map();
        this.hintSeen = false;
    }

    // ------------------------------------------------------------ inputs

    get screenName() {
        return SCREENS[this.screen] ? this.screen : "desktop";
    }

    get breakpoint() {
        return SCREENS[this.screenName];
    }

    get locale() {
        return pageLocale(this) || "en";
    }

    /** Takes what the host set: a new Document (not the one this editor sent), types, rights, theme. */
    adopt() {
        const seen = this.seen;
        const types = this.types;
        const siteBlocks = this.siteBlocks;
        const renderers = this.renderers;
        const editorManifests = this.editorManifests;
        let redraw = false;
        if (types !== seen.types || siteBlocks !== seen.siteBlocks || renderers !== seen.renderers || editorManifests !== seen.editorManifests) {
            Object.assign(seen, {types, siteBlocks, renderers, editorManifests});
            this.main.setTypes({types, siteBlocks, renderers, editorManifests});
            redraw = true;
        }
        if (this.rights !== seen.rights) {
            seen.rights = this.rights;
            this.main.setRights(this.rights);
            redraw = true;
        }
        if (this.theme !== seen.theme) {
            seen.theme = this.theme;
            this.main.setTheme(this.theme);
            redraw = true;
        }
        const given = this.document;
        if (given !== this.adopted) {
            this.adopted = given;
            if (!(given && this.sent && JSON.stringify(given) === this.sent)) {
                this.finishSession(false);
                this.main.setDocument(given);
                this.builder = null;
                this.model = this.main;
                redraw = true;
            }
        }
        if (this.screen !== seen.screen) {
            seen.screen = this.screen;
            redraw = true;
        }
        if (redraw) this.redraw();
    }

    // ------------------------------------------------------------ words

    /** A word: the editor's own, a host block's (words), the Framework's field words, else the key. */
    word(key, vars) {
        if (!key) return "";
        const locale = this.locale;
        const host = isPlainObject(this.words) ? this.words : {};
        const hosted = host[locale]?.[key] ?? host[locale.split("-")[0]]?.[key] ?? host.en?.[key];
        if (hosted !== undefined) return format(hosted, vars);
        const site = this.builderWords?.[locale]?.[key];
        if (site !== undefined) return site;
        // The Framework's words (sf.composition.*) are not the editor's own:
        // asked there first, so the editor's dictionary does not warn of them.
        if (String(key).startsWith("sf.")) {
            const framework = localeText(EDITOR_FIELD_WORDS, key, locale, EDITOR_WORDS_OWNER);
            if (framework !== key) return framework;
        }
        const own = this.sfWord(key, vars ? {vars} : undefined);
        if (own !== key) return own;
        const field = localeText(EDITOR_FIELD_WORDS, key, locale, EDITOR_WORDS_OWNER);
        if (field !== key) return field;
        return humanize(key);
    }

    /** A word in every language there is: the editor's own, the host's, the Framework's field words. */
    wordsOf(key) {
        const host = isPlainObject(this.words) ? this.words : {};
        const site = isPlainObject(this.builderWords) ? this.builderWords : {};
        const own = [en, ru].map((dictionary) => dictionary.runtime?.[key]);
        const hosted = [...Object.values(host), ...Object.values(site)].map((dictionary) => dictionary?.[key]);
        const field = ["en", "ru"].map((locale) => EDITOR_FIELD_WORDS[locale]?.[key]);
        return [...own, ...hosted, ...field].filter((value) => typeof value === "string");
    }

    typeLabel(type) {
        const manifest = this.model.manifestOf(type);
        const key = manifest?.catalogue?.label_key;
        return key ? this.word(key) : this.word(typeWordKey(type));
    }

    // ------------------------------------------------------------ lifecycle

    onConnected() {
        super.onConnected?.();
        this.readPreferences();
        this.listen();
    }

    onDisconnected() {
        this.finishSession(false);
        this.listening?.abort();
        this.listening = null;
        this.toolbarObserver?.disconnect();
        this.toolbarObserver = null;
        this.watchedToolbar = null;
        super.onDisconnected?.();
    }

    afterUpdate(...rest) {
        super.afterUpdate?.(...rest);
        if (this.main.listeners.size === 0) this.main.subscribe((event) => this.onModelChange(event));
        this.adopt();
    }

    afterRender(...rest) {
        super.afterRender?.(...rest);
        // The first render made the page's element: the Document is drawn into it.
        if (this.pageElement && !this.drawToken) this.redraw();
        else this.placeOverlays();
        this.wireSearch();
        this.watchToolbar();
    }

    /** sf-input names its own input only: the catalogue's search is a combobox over the list, said on the native input. */
    wireSearch() {
        const input = this.querySelector(".sf-editor-pop sf-input input");
        if (!input) {
            // The search draws its input on its own update: wire it then.
            const host = this.querySelector(".sf-editor-pop sf-input");
            if (host && !host.sfEditorWired) {
                host.sfEditorWired = true;
                Promise.resolve(host.updateComplete).then(() => requestAnimationFrame(() => this.wireSearch()));
            }
            return;
        }
        const count = this.querySelectorAll(".sf-editor-pop [role=\"option\"]").length;
        input.setAttribute("role", "combobox");
        input.setAttribute("aria-controls", "sf-editor-pop-list");
        input.setAttribute("aria-expanded", "true");
        input.setAttribute("aria-autocomplete", "list");
        if (count) input.setAttribute("aria-activedescendant", `sf-editor-pop-${Math.min(this.popActive, count - 1)}`);
        else input.removeAttribute("aria-activedescendant");
    }

    /** The host learns of every change: the whole Document, the reason, and whether it was the page or the template. */
    onModelChange(event) {
        if (event.silent) return;
        this.sent = JSON.stringify(this.main.doc);
        this.sfEmit("change", {document: JSON.parse(this.sent), reason: event.reason, scope: event.scope});
    }

    readPreferences() {
        const key = this.preferencesKey ? `sf-editor/${this.preferencesKey}` : "";
        const stored = key ? globalThis.SF?.Preferences?.read?.(key) : null;
        if (isPlainObject(stored)) {
            this.recent = Array.isArray(stored.recent) ? stored.recent.map(String) : [];
            this.favourites = Array.isArray(stored.favourites) ? stored.favourites.map(String) : [];
            this.hintSeen = stored.hint_seen === true;
        }
    }

    writePreferences() {
        const key = this.preferencesKey ? `sf-editor/${this.preferencesKey}` : "";
        if (key) globalThis.SF?.Preferences?.write?.(key, {recent: this.recent, favourites: this.favourites, ...(this.hintSeen ? {hint_seen: true} : {})});
    }

    refresh() {
        this.requestComponentUpdate("state");
    }

    afterDraw(callback) {
        this.pendingAfterDraw.push(callback);
    }

    // ------------------------------------------------------------ the canvas

    get pageElement() {
        return this.querySelector(".sf-editor-page");
    }

    get canvasElement() {
        return this.querySelector(".sf-editor-canvas");
    }

    blockElement(id) {
        return id ? this.pageElement?.querySelector(`[${ID}="${cssEscape(id)}"]`) ?? null : null;
    }

    /** Draws the page again: the Framework's renderers over the Document as the chosen screen shows it. */
    async redraw() {
        const page = this.pageElement;
        this.refresh();
        if (!page) return;
        const token = ++this.drawToken;
        this.codeCache.clear();
        const typing = this.model.typing ? {...this.model.typing, at: this.session ? this.caretOffset() : "end"} : null;
        this.finishSession(false);
        const {document, hidden} = this.model.canvasDocument(this.breakpoint);
        let result;
        try {
            // The canvas stands inside the editor's own page, which has its own
            // main landmark: the Document's layout.page and a main region are
            // drawn embedded, as <div data-sf-composition-landmark="main">
            // (Composition render options.embedded, SIMAI Framework pair
            // ui-0c23f6a0af12, ui-source #60). A pair before it ignores the
            // option. The HTML a site prints (toHTML) keeps the landmarks.
            result = await Composition.render(document, {
                registry: this.model.canvasRegistry,
                preview: true,
                options: {embedded: true},
                resolveBinding: (binding, context) => this.previewBinding(binding, context),
            });
        } catch (error) {
            result = {html: "", diagnostics: [{code: "render_failed", message: String(error?.message ?? error)}]};
        }
        if (token !== this.drawToken || !page.isConnected) return;
        page.innerHTML = result.html;
        page.dataset.sfEditorDrawn = "true";
        for (const [name, value] of Object.entries(isPlainObject(this.model.theme?.attributes) ? this.model.theme.attributes : {})) {
            if (/^(?:data-[a-z0-9-]+|class|lang|dir)$/u.test(name)) page.setAttribute(name, String(value));
        }
        this.diagnostics = result.diagnostics ?? [];
        // A page with its own main landmark keeps its landmarks top level: the canvas around it is then no region.
        // Drawn embedded, that main is <div data-sf-composition-landmark="main">: the page still has one.
        const landmarks = Boolean(page.querySelector('main, [role="main"], [data-sf-composition-landmark="main"]'));
        if (landmarks !== this.pageLandmarks) {
            this.pageLandmarks = landmarks;
            this.refresh();
        }
        this.decorate(hidden);
        this.placeOverlays();
        if (typing && this.model.typing && typing.id === this.model.typing.id) this.activate(typing.id, typing.at);
        else if (this.model.typing) this.activate(this.model.typing.id, "end");
        const waiting = this.pendingAfterDraw.splice(0);
        for (const callback of waiting) callback();
    }

    /** What only editing needs on the drawn page: locks, faded hidden blocks, empty places, placeholders. */
    decorate(hidden) {
        const page = this.pageElement;
        for (const element of page.querySelectorAll(`[${ID}]`)) {
            const id = element.getAttribute(ID);
            const at = this.model.place(id);
            if (!at) continue;
            element.classList.add("sf-editor-node");
            // A locked part is dimmed with a lock once, at its outermost element; the
            // frame of a page with a template (the regions) and a container that
            // holds an open place (an author's text area) only say why on a press.
            const lock = this.model.lockOf(id);
            if (lock) {
                element.dataset.sfEditorLock = lock;
                // Inactive for this person: said so, and its dimmed text is not
                // held to the contrast of what can be changed (WCAG 1.4.3).
                element.setAttribute("aria-disabled", "true");
                const marked = element.parentElement?.closest(".sf-editor-locked");
                const open = [...element.querySelectorAll(`[${ID}]`)].some((inner) => !this.model.lockOf(inner.getAttribute(ID)));
                if (this.model.scopeOf(id) !== "frame" && !open && marked?.dataset.sfEditorLock !== lock) {
                    element.classList.add("sf-editor-locked");
                    // A chip in the part's corner: a span (an sf-icon's own
                    // display would put it on a line of its own), the lock and
                    // the word for why.
                    const mark = this.ownerDocument.createElement("span");
                    mark.className = "sf-editor-lock-mark";
                    mark.setAttribute("aria-hidden", "true");
                    const icon = this.ownerDocument.createElement("sf-icon");
                    icon.setAttribute("icon", "lock");
                    icon.setAttribute("size", "1/3");
                    const words = this.ownerDocument.createElement("span");
                    words.textContent = this.sfWord(`lock-mark-${lock}`);
                    mark.append(icon, words);
                    element.append(mark);
                }
            }
            if (hidden.has(id)) {
                element.classList.add("sf-editor-hidden-here");
                element.dataset.sfEditorHidden = this.sfWord("hidden-here");
            }
            const node = this.model.textNode(id);
            if (node && TEXT_TAGS.has(node.type) && !element.textContent.trim()) element.dataset.placeholder = this.sfWord(node.type === "content.heading" ? "heading-placeholder" : "text-placeholder");
            if (id.includes(":")) element.classList.add("sf-editor-part");
            const own = locate(this.model.doc.root, id)?.node;
            if (own && !lock) this.drawEmptyPlaces(own, element);
        }
    }

    /**
     * The empty places of a block: an empty text area or region, and an empty
     * named place that declares its prompt (empty_key), such as a split
     * hero's picture. Each says what it takes and is its own +; it stands in
     * the renderer's element for that place (data-sf-composition-slot) when
     * there is one, else at the end of the block.
     */
    drawEmptyPlaces(node, element) {
        const manifest = this.model.manifestOf(node.type);
        if (!manifest || isComposed(manifest) || this.model.placeLock(node.id)) return;
        for (const [slot, rule] of Object.entries(manifest.slots ?? {})) {
            if (node.slots?.[slot]?.length) continue;
            const container = ["layout.area", "layout.region"].includes(node.type) && slot === "default";
            if (!container && !rule?.empty_key) continue;
            const holder = [...element.querySelectorAll(`[data-sf-composition-slot="${cssEscape(slot)}"]`)]
                .find((candidate) => candidate.closest(`[${ID}]`) === element) ?? element;
            const place = this.ownerDocument.createElement("div");
            place.className = "sf-editor-empty";
            place.dataset.sfEditorEmpty = node.id;
            place.dataset.sfEditorSlot = slot;
            const plus = this.ownerDocument.createElement("sf-icon");
            plus.setAttribute("icon", "add");
            plus.setAttribute("size", "1/2");
            plus.setAttribute("aria-hidden", "true");
            const words = this.ownerDocument.createElement("span");
            words.textContent = this.word(rule?.empty_key ?? "empty-place");
            place.append(plus, words);
            holder.append(place);
        }
    }

    /** Preview data for a binding: the host's source port, or demo data of its shape; a state the person chose to look at wins. */
    async previewBinding(binding, {node, shape, settings} = {}) {
        const state = this.dataState.get(node?.id);
        if (state === "loading") return undefined;
        if (state === "error") throw new Error(this.sfWord("state-error-text"));
        if (state === "empty") return Composition.DATA_SHAPES[shape]?.list ? {[Composition.DATA_SHAPES[shape].list]: []} : null;
        const port = this.sourcePort();
        if (port && binding?.ref) {
            try {
                return await port.resolveBinding(binding, {shape, settings});
            } catch {
                return Composition.demoData(shape);
            }
        }
        return Composition.demoData(shape);
    }

    sourcePort() {
        const port = this.sfPort;
        if (!port || ["sources", "fields", "preview"].some((name) => typeof port[name] !== "function")) return null;
        if (this.wrappedPort?.from !== port) this.wrappedPort = {from: port, port: Composition.createSourcePort(port)};
        return this.wrappedPort.port;
    }

    onPortConnected() {
        this.dataCache.clear();
        this.redraw();
    }

    // ------------------------------------------------------------ overlays

    /** The frame and gutter of the hovered block, the frame of the chosen one, placed over the drawn page. */
    placeOverlays() {
        const canvas = this.canvasElement;
        if (!canvas) return;
        const box = canvas.getBoundingClientRect();
        const place = (element, target, pad = 0) => {
            if (!element) return;
            if (!target) {
                element.hidden = true;
                return;
            }
            const rect = target.getBoundingClientRect();
            element.hidden = false;
            Object.assign(element.style, {
                insetBlockStart: `${rect.top - box.top + canvas.scrollTop - pad}px`,
                insetInlineStart: `${(this.isRtl ? box.right - rect.right : rect.left - box.left) + canvas.scrollLeft - pad}px`,
                inlineSize: `${rect.width + pad * 2}px`,
                blockSize: `${rect.height + pad * 2}px`,
            });
        };
        const chosen = this.model.typing ? null : this.blockElement(this.model.selected);
        place(this.querySelector(".sf-editor-chosen"), chosen, 2);
        const hover = this.hoverId && this.hoverId !== this.model.selected ? this.blockElement(this.hoverId) : null;
        place(this.querySelector(".sf-editor-hover"), hover, 2);
        const gutter = this.querySelector(".sf-editor-gutter");
        // The grip stays where it was pressed while it is held.
        const gutterTarget = this.blockElement(this.gutterId);
        if (gutter) {
            if (!gutterTarget) gutter.hidden = true;
            else {
                const rect = gutterTarget.getBoundingClientRect();
                gutter.hidden = false;
                const side = this.isRtl ? box.right - rect.right : rect.left - box.left;
                Object.assign(gutter.style, {
                    insetBlockStart: `${rect.top - box.top + canvas.scrollTop}px`,
                    insetInlineStart: `${Math.max(0, side + canvas.scrollLeft - gutter.offsetWidth - 4)}px`,
                });
            }
        }
        this.placeToolbar(chosen, canvas, box);
        this.placeHint(gutter, gutterTarget, canvas, box);
    }

    /**
     * The chosen block's floating bar: above the block at its end edge, as
     * the prototype has it; below the block when there is no room above (the
     * first block of the page). Hidden while typing or dragging.
     */
    placeToolbar(chosen, canvas, box) {
        const bar = this.querySelector(".sf-editor-toolbar");
        if (!bar || !canvas || !box) return;
        if (!chosen || this.drag || this.model.typing || bar.hidden) {
            bar.style.visibility = "hidden";
            return;
        }
        const rect = chosen.getBoundingClientRect();
        const height = bar.offsetHeight;
        const width = bar.offsetWidth;
        const gap = 8;
        const top = rect.top - box.top + canvas.scrollTop;
        const room = rect.top - box.top;
        const above = room >= height + gap;
        const end = this.isRtl ? box.right - rect.left : rect.right - box.left;
        const start = Math.max(4, Math.min(end + canvas.scrollLeft - width, canvas.clientWidth + canvas.scrollLeft - width - 4));
        Object.assign(bar.style, {
            visibility: "visible",
            insetBlockStart: `${above ? top - height - gap : top + Math.min(rect.height, canvas.clientHeight) + gap}px`,
            insetInlineStart: `${start}px`,
        });
        bar.dataset.side = above ? "above" : "below";
    }

    /** The floating bar's parts draw their buttons after it: it is placed again when its size changes. */
    watchToolbar() {
        const bar = this.querySelector(".sf-editor-toolbar");
        if (!bar || bar === this.watchedToolbar || typeof ResizeObserver !== "function") return;
        this.toolbarObserver?.disconnect();
        this.watchedToolbar = bar;
        this.toolbarObserver = new ResizeObserver(() => {
            const canvas = this.canvasElement;
            const box = canvas?.getBoundingClientRect();
            this.placeToolbar(this.model.typing ? null : this.blockElement(this.model.selected), canvas, box);
            const gutter = this.querySelector(".sf-editor-gutter");
            if (canvas && box) this.placeHint(gutter, this.blockElement(this.gutterId), canvas, box);
        });
        this.toolbarObserver.observe(bar);
    }

    /** The first-use hint beside the gutter: until the person first uses the grip or +. */
    placeHint(gutter, target, canvas, box) {
        const hint = this.querySelector(".sf-editor-gutter-hint");
        if (!hint) return;
        const show = !this.hintSeen && gutter && !gutter.hidden && target && !this.drag;
        hint.hidden = !show;
        if (!show) return;
        // Above the gutter, as the prototype has it; never over the gutter or
        // the chosen block's floating bar: above the bar, below the gutter or
        // below the bar, the first place that is free.
        const rect = gutter.getBoundingClientRect();
        const bar = this.querySelector(".sf-editor-toolbar");
        const barRect = bar && !bar.hidden && bar.style.visibility === "visible" ? bar.getBoundingClientRect() : null;
        const height = hint.offsetHeight;
        const width = hint.offsetWidth;
        const gap = 4;
        const tops = [rect.top - height - gap, ...(barRect ? [barRect.top - height - gap] : []), rect.bottom + gap, ...(barRect ? [barRect.bottom + gap] : [])];
        const left = this.isRtl ? rect.right - width : rect.left;
        const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const free = (top) => top >= box.top
            && !meets({top, bottom: top + height, left, right: left + width}, rect)
            && !(barRect && meets({top, bottom: top + height, left, right: left + width}, barRect));
        const top = tops.find(free) ?? tops[0];
        Object.assign(hint.style, {
            insetBlockStart: `${Math.max(0, top - box.top + canvas.scrollTop)}px`,
            insetInlineStart: `${Math.max(0, (this.isRtl ? box.right - rect.right : rect.left - box.left) + canvas.scrollLeft)}px`,
        });
    }

    /** The grip or + was used: the first-use hint is not shown again. */
    hintUsed() {
        if (this.hintSeen) return;
        this.hintSeen = true;
        this.writePreferences();
        const hint = this.querySelector(".sf-editor-gutter-hint");
        if (hint) hint.hidden = true;
    }

    get isRtl() {
        return getComputedStyle(this).direction === "rtl";
    }

    /** The block a page element stands for: the nearest drawn node a person can choose (a site block's part is its instance). */
    blockAt(target) {
        let element = target?.closest?.(`[${ID}]`);
        while (element && this.pageElement?.contains(element)) {
            const id = element.getAttribute(ID);
            const at = this.model.place(id);
            if (at && this.model.choosable(at.node)) return {element: this.blockElement(at.node.id) ?? element, id: at.node.id};
            element = element.parentElement?.closest(`[${ID}]`);
        }
        return null;
    }

    onPointerMove(event) {
        if (this.drag) return;
        if (!this.pageElement?.contains(event.target) && !event.target.closest?.(".sf-editor-gutter")) return;
        if (event.target.closest?.(".sf-editor-gutter")) return;
        const block = this.blockAt(event.target);
        const id = block?.id ?? "";
        if (id === this.hoverId) return;
        this.hoverId = id;
        const gutter = this.gutterFor(id);
        if (gutter && !this.model.placeLock(this.model.place(gutter)?.parent?.id ?? "")) this.gutterId = gutter;
        else if (!gutter) this.gutterId = this.gutterId && this.model.place(this.gutterId) ? this.gutterId : "";
        this.placeOverlays();
    }

    /**
     * The block whose gutter (+ and grip) a pointer over a block shows: the
     * hovered one, except over a block that fills the chosen block it stands
     * in. A section its hero fills has no point of its own, so its grip menu
     * was the hero's, and «Make a site block» on the chosen section made a
     * block of the hero alone (G-38); there the gutter stays the chosen
     * block's. Enter, or a press on the block inside, goes down to it. While
     * typing, the gutter is the hovered block's.
     */
    gutterFor(id) {
        const chosen = this.model.typing ? "" : this.model.selected;
        if (!id || !chosen || id === chosen) return id;
        let inside = false;
        for (let at = this.model.place(id); at?.parent; at = this.model.place(at.parent.id)) {
            if (at.parent.id === chosen) {
                inside = true;
                break;
            }
        }
        if (!inside) return id;
        const outer = this.blockElement(chosen)?.getBoundingClientRect();
        const inner = this.blockElement(id)?.getBoundingClientRect();
        if (!outer || !inner) return id;
        const fills = Math.abs(outer.left - inner.left) <= 4 && Math.abs(outer.right - inner.right) <= 4
            && Math.abs(outer.top - inner.top) <= 4 && Math.abs(outer.bottom - inner.bottom) <= 4;
        return fills ? chosen : id;
    }

    // ------------------------------------------------------------ pressing on the page

    onPagePointerDown(event) {
        if (event.button !== 0 || !this.pageElement?.contains(event.target)) return;
        const empty = event.target.closest?.("[data-sf-editor-empty]");
        if (empty) {
            event.preventDefault();
            const place = this.model.placeInside(empty.dataset.sfEditorEmpty, empty.dataset.sfEditorSlot || undefined);
            this.openCatalogue(empty, place, "plus");
            return;
        }
        const raw = event.target.closest?.(`[${ID}]`);
        if (!raw) {
            this.choose(null);
            return;
        }
        const rawId = raw.getAttribute(ID);
        const lock = this.model.lockOf(rawId);
        const textNode = this.model.textNode(rawId);
        if (event.target.closest?.("a") && !(event.metaKey || event.ctrlKey)) event.preventDefault();
        if (lock) {
            event.preventDefault();
            const block = this.blockAt(raw);
            this.choose(block?.id ?? null);
            this.showLock(lock, event);
            return;
        }
        this.lockNote = null;
        if (textNode && TEXT_TAGS.has(textNode.type) && (raw === event.target || raw.contains(event.target)) && !event.target.closest?.(".sf-editor-empty")) {
            if (raw === this.sessionElement) return;
            const at = caretAt(this.ownerDocument, raw, event.clientX, event.clientY);
            const started = this.model.startTyping(rawId);
            if (started.ok) {
                this.activate(rawId, at);
                this.announce(rawId);
                return;
            }
        }
        event.preventDefault();
        const block = this.blockAt(raw);
        // A site block's instance is closed: its texts are typed in place.
        // A press on the chosen instance away from its texts types in the
        // nearest one (G-40); the first press only chooses it.
        if (block && block.id === this.model.selected && this.typeInInstance(block.id, {x: event.clientX, y: event.clientY})) return;
        this.choose(block?.id ?? null);
        this.canvasElement?.focus({preventScroll: true});
    }

    /** The drawn text parts of a site block's instance: the elements of its composed texts. */
    instanceTexts(id) {
        const node = this.model.node(id);
        if (!node || !isComposed(this.model.manifestOf(node.type))) return [];
        const element = this.blockElement(id);
        if (!element) return [];
        return [...element.querySelectorAll(`[${ID}^="${cssEscape(id)}:"]`)]
            .filter((part) => TEXT_TAGS.has(this.model.textNode(part.getAttribute(ID))?.type));
    }

    /**
     * Types in a text of a site block's instance (G-40): the one nearest a
     * point, at the point when it is on the text and at its end otherwise;
     * with no point, the first. The text is kept in the instance's
     * data.texts, through drawing again and undo. False when it has none.
     */
    typeInInstance(id, point = null) {
        const parts = this.instanceTexts(id);
        if (!parts.length) return false;
        let part = parts[0];
        let on = false;
        if (point) {
            let best = Infinity;
            for (const candidate of parts) {
                const box = candidate.getBoundingClientRect();
                const dx = Math.max(box.left - point.x, 0, point.x - box.right);
                const dy = Math.max(box.top - point.y, 0, point.y - box.bottom);
                const distance = Math.hypot(dx, dy);
                if (distance < best) {
                    best = distance;
                    part = candidate;
                    on = distance === 0;
                }
            }
        }
        const partId = part.getAttribute(ID);
        if (!this.model.startTyping(partId).ok) return false;
        this.activate(partId, on ? caretAt(this.ownerDocument, part, point.x, point.y) : "end");
        this.announce(partId);
        return true;
    }

    showLock(lock, event) {
        this.lockNote = {lock, x: event.clientX, y: event.clientY, text: this.lockText(lock)};
        this.refresh();
    }

    lockText(lock) {
        const reason = this.model.rights.reasons?.[lock];
        if (reason) return String(reason);
        return this.sfWord(`lock-${lock}`);
    }

    /** Chooses a block (or none): the frame, the panel, the path; the host hears it. */
    choose(id) {
        this.finishSession(false);
        this.model.select(id);
        // The chosen block's gutter stands beside it, so its grip and + are
        // reached without a hover (the Structure tab, the arrows).
        const chosen = this.model.selected;
        if (chosen && this.blockElement(chosen) && !this.model.placeLock(this.model.place(chosen)?.parent?.id ?? "")) this.gutterId = chosen;
        this.closeCatalogue();
        this.lockNote = id && this.model.lockOf(id) ? this.lockNote : null;
        this.announce(this.model.selected);
        this.refresh();
        this.placeOverlays();
    }

    /** The host hears which block is chosen (select {ids}), once per change. */
    announce(id) {
        if (this.lastSelect === (id ?? "")) return;
        this.lastSelect = id ?? "";
        this.sfEmit("select", {ids: id ? [id] : []});
    }

    // ------------------------------------------------------------ typing

    /** Starts typing in a drawn text element through sf-editor-inline, at an offset or "end". */
    activate(id, at = "end") {
        const element = this.blockElement(id);
        if (!element) return;
        if (this.sessionElement === element && this.session) {
            setCaret(element, at);
            return;
        }
        this.finishSession(false);
        const content = this.model.textOf(id, "content");
        const carrier = this.querySelector("sf-editor-inline");
        const options = {content, nodeId: id, label: this.typeLabel(this.model.textNode(id)?.type), links: true, toolbar: "selection"};
        try {
            this.session = typeof carrier?.edit === "function" ? carrier.edit(element, options) : startInlineEdit(element, options);
        } catch {
            return;
        }
        this.sessionElement = element;
        this.sessionId = id;
        // A heading being typed stays a heading: the textbox role the inline
        // session gives is not one a heading may take (its editable state says
        // enough); the session puts the attributes back when it ends.
        if (/^H[1-6]$/u.test(element.tagName)) {
            element.removeAttribute("role");
            element.removeAttribute("aria-multiline");
        }
        element.focus({preventScroll: true});
        setCaret(element, at);
        this.model.startTyping(id);
        this.gutterId = this.model.place(id)?.node.id ?? "";
        this.refresh();
        this.placeOverlays();
    }

    /** Ends the typing session; the text is already in the Document. */
    finishSession(redrawText = true) {
        const session = this.session;
        const element = this.sessionElement;
        const id = this.sessionId;
        this.session = null;
        this.sessionElement = null;
        this.sessionId = "";
        if (!session) return;
        try {
            session.commit();
        } catch {
            // the element left the page with its session
        }
        if (redrawText && element?.isConnected) element.replaceChildren(renderInlineDom(element.ownerDocument, this.model.textOf(id, "content")));
    }

    caretOffset() {
        const element = this.sessionElement;
        const selection = this.ownerDocument.getSelection();
        if (!element || !selection?.rangeCount || !element.contains(selection.anchorNode)) return "end";
        const range = selection.getRangeAt(0);
        return textOffset(element, range.startContainer, range.startOffset);
    }

    onInlineInput(event) {
        event.stopPropagation();
        const element = event.target;
        if (element !== this.sessionElement) return;
        const id = this.sessionId;
        const content = event.detail?.content ?? readInlineDom(element);
        this.model.setText(id, "content", content);
        this.refresh();
        const node = this.model.textNode(id);
        if (node?.type === "content.paragraph" && !id.includes(":")) {
            const made = this.model.markdownShortcut(id);
            if (made.ok) {
                this.redraw();
                this.afterDraw(() => this.activate(made.id, 0));
                return;
            }
            this.watchSlash(id, element);
        }
        this.placeOverlays();
    }

    /** / in an empty line opens the catalogue on the Text tab, filtered by what follows the slash. */
    watchSlash(id, element) {
        const words = this.model.textOf(id, "content").filter((entry) => entry.type === "text").map((entry) => entry.value).join("");
        const match = /^\/(\S*)$/u.exec(words);
        if (!match) {
            if (this.pop?.mode === "slash") this.closeCatalogue();
            return;
        }
        const at = locate(this.model.doc.root, id);
        if (!at?.parent) return;
        if (this.pop?.mode !== "slash") this.openCatalogue(element, {parent: at.parent.id, slot: at.slot, index: at.index + 1}, "slash", id);
        this.popQuery = match[1];
        this.popActive = 0;
        this.refresh();
    }

    // ------------------------------------------------------------ keys

    onKeydown(event) {
        if (event.defaultPrevented || event.isComposing) return;
        const mod = event.metaKey || event.ctrlKey;
        const key = event.key;
        const inPanel = event.target.closest?.(".sf-editor-left, .sf-editor-right, .sf-editor-bar, .sf-editor-pop, sf-modal, .sf-editor-menu, .sf-editor-toolbar, .sf-editor-help-pop");
        if (this.pop && this.onCatalogueKey(event)) return;
        if (this.helpOpen && key === "Escape") {
            event.preventDefault();
            this.helpOpen = null;
            this.refresh();
            this.querySelector(".sf-editor-help-open button")?.focus();
            return;
        }
        if (mod && key.toLowerCase() === "z" && !inPanel) {
            event.preventDefault();
            event.stopPropagation();
            this.history(event.shiftKey ? "redo" : "undo");
            return;
        }
        if (mod && key.toLowerCase() === "y" && !inPanel) {
            event.preventDefault();
            event.stopPropagation();
            this.history("redo");
            return;
        }
        if (inPanel) return;
        if (this.session) return this.onTypingKey(event);
        const id = this.model.selected;
        if (key === "Escape") {
            event.preventDefault();
            if (this.lockNote) this.lockNote = null;
            this.model.up();
            this.choose(this.model.selected);
            return;
        }
        if (!id) {
            if (key === "Enter") {
                event.preventDefault();
                this.model.down();
                this.choose(this.model.selected);
            } else if (key === "ArrowDown" || key === "ArrowUp") {
                event.preventDefault();
                this.chooseNeighbour(null, key === "ArrowUp" ? -1 : 1);
            }
            return;
        }
        if (key === "Enter") {
            event.preventDefault();
            const result = this.model.down();
            if (result.typing) {
                this.activate(result.id, "end");
                return;
            }
            // Enter on a site block's instance goes into its first text (G-40).
            if (result.reason === "closed" && this.typeInInstance(id)) return;
            this.choose(this.model.selected);
            return;
        }
        if (event.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
            event.preventDefault();
            this.moveBy(id, key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (key === "ArrowUp" || key === "ArrowDown") {
            event.preventDefault();
            this.chooseNeighbour(id, key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (key === "Backspace" || key === "Delete") {
            event.preventDefault();
            this.run(this.model.remove(id), "removed-text");
            return;
        }
        if (mod && key.toLowerCase() === "d") {
            event.preventDefault();
            this.run(this.model.duplicate(id), "duplicated-text");
        }
    }

    /** ↑ ↓: the block before or after (the first one when nothing is chosen), brought into view. */
    chooseNeighbour(id, delta) {
        const next = this.model.neighbour(id, delta);
        if (!next) return;
        this.choose(next);
        this.blockElement(next)?.scrollIntoView?.({block: "nearest", inline: "nearest"});
    }

    onTypingKey(event) {
        const key = event.key;
        const id = this.sessionId;
        if (key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            this.finishSession();
            this.model.up();
            this.choose(this.model.selected);
            this.canvasElement?.focus({preventScroll: true});
            return;
        }
        if (event.altKey && event.shiftKey && (key === "ArrowUp" || key === "ArrowDown")) {
            event.preventDefault();
            event.stopPropagation();
            this.moveBy(id, key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (id.includes(":")) {
            if (key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }
        if (key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            const offset = this.caretOffset();
            const result = this.model.splitText(id, offset === "end" ? Infinity : offset);
            if (result.ok) {
                this.redraw();
                this.afterDraw(() => this.activate(result.id, 0));
            }
            return;
        }
        if (key === "Backspace" && this.caretOffset() === 0 && this.ownerDocument.getSelection()?.isCollapsed) {
            const result = this.model.joinBack(id);
            if (result.ok) {
                event.preventDefault();
                event.stopPropagation();
                this.redraw();
                this.afterDraw(() => this.activate(result.id, result.offset));
            }
        }
    }

    history(direction) {
        this.finishSession(false);
        const result = direction === "redo" ? this.model.redo() : this.model.undo();
        if (!result.ok) return refused(result.reason);
        this.closeCatalogue();
        this.redraw();
        this.say(this.sfWord(direction === "redo" ? "redone-text" : "undone-text"));
        return applied();
    }

    moveBy(id, delta) {
        const typing = Boolean(this.session);
        const result = this.model.moveBy(id, delta);
        if (!result.ok) return;
        this.redraw();
        if (typing) this.afterDraw(() => this.activate(this.model.typing?.id ?? id, "end"));
        this.say(this.sfWord("moved-text"));
    }

    run(result, said) {
        if (!result.ok) {
            this.say(this.sfWord(`refused-${result.reason}`));
            return result;
        }
        this.redraw();
        if (this.model.typing) this.afterDraw(() => this.activate(this.model.typing.id, "end"));
        if (said) this.say(this.sfWord(said));
        return result;
    }

    /**
     * Says what happened in the status line. The line has no part of the
     * template inside it: its text is written here only, so a render never
     * meets nodes it did not make (writing into a template part broke every
     * later render, G-27).
     */
    say(text) {
        this.notice = text;
        const live = this.querySelector(".sf-editor-live");
        if (live) live.textContent = text;
    }

    // ------------------------------------------------------------ the catalogue

    catalogue(place) {
        return catalogueAt(this.model, place, {word: (key) => this.word(key), groups: CATALOGUE_GROUPS});
    }

    /** Opens the catalogue at a place: the + between blocks, / in text. */
    openCatalogue(anchor, place, mode, slashId = "") {
        // The + is an sf-button-icon, whose host is display: contents and has
        // no box: the catalogue stands by the button it draws (G-37).
        const rect = boxOf(anchor) ?? {left: 0, right: 0, bottom: 0, top: 0};
        // The one list of sections (1.2.0): between blocks the + opens on the
        // sections, in a text flow and for / on Text, when the place takes some;
        // a place that takes one section only (a named place of media) opens it.
        const wanted = sectionForPlace(this.model, place, mode);
        const fitting = sectionsOf(this.catalogue(place).items);
        const section = wanted && fitting.some((entry) => entry.id === wanted) ? wanted : fitting.length === 1 ? fitting[0].id : "";
        this.pop = {mode, place, slashId, x: rect.left, y: rect.bottom + 4, above: rect.top - 4, section};
        this.popQuery = "";
        this.popActive = 0;
        this.refresh();
        requestAnimationFrame(() => {
            this.keepPopInView();
            if (mode !== "slash") this.querySelector(".sf-editor-pop input, .sf-editor-pop sf-input")?.focus?.();
        });
    }

    /** The catalogue stays inside the window: moved left at the end edge, above its anchor at the bottom. */
    keepPopInView() {
        const element = this.querySelector(".sf-editor-pop");
        const view = this.ownerDocument.defaultView;
        if (!element || !this.pop || !view) return;
        const box = element.getBoundingClientRect();
        const margin = 8;
        let {x, y} = this.pop;
        let height = this.pop.height ?? null;
        if (x + box.width > view.innerWidth - margin) x = Math.max(margin, view.innerWidth - margin - box.width);
        // Below the + when it fits, else above it; when neither fits, the
        // larger room, the list capped to it and scrolled: every option can
        // be reached (G-41).
        const below = view.innerHeight - margin - this.pop.y;
        const above = this.pop.above - margin;
        if (box.height <= below) y = this.pop.y;
        else if (box.height <= above) y = this.pop.above - box.height;
        else if (below >= above) {
            y = this.pop.y;
            height = Math.floor(below);
        } else {
            height = Math.floor(above);
            y = this.pop.above - height;
        }
        if (x === this.pop.x && y === this.pop.y && height === (this.pop.height ?? null)) return;
        this.pop = {...this.pop, x, y, ...(height ? {height} : {})};
        this.refresh();
    }

    closeCatalogue() {
        if (!this.pop) return;
        this.pop = null;
        this.refresh();
    }

    /** The sections the catalogue's place takes, as the library lists them. */
    popSections() {
        return this.pop ? sectionsOf(this.catalogue(this.pop.place).items) : [];
    }

    /**
     * What the catalogue lists: with a search, what it found in every
     * section, each block once under its own section, Text first; in an open
     * section, its blocks (a type there from another section too); else
     * nothing, the list of sections stands.
     */
    popItems() {
        if (!this.pop) return [];
        const at = this.catalogue(this.pop.place);
        if (this.popQuery) {
            const found = searchItems(at.items, this.popQuery, {word: (key) => this.word(key), words: (key) => this.wordsOf(key)});
            return sectionsOf(found, {own: true}).flatMap((section) => section.types.flatMap((type) => type.items));
        }
        if (!this.pop.section) return [];
        return sectionsOf(at.items).find((section) => section.id === this.pop.section)?.types.flatMap((type) => type.items) ?? [];
    }

    /** The options the keys move over: the sections, or the blocks. */
    popOptions() {
        if (!this.pop) return [];
        if (this.popQuery || this.pop.section) return this.popItems();
        return this.popSections().map((section) => ({section: section.id}));
    }

    /** Opens a section of the catalogue in place («» goes back to the sections). */
    openPopSection(id) {
        if (!this.pop) return;
        this.pop = {...this.pop, section: id};
        this.popActive = 0;
        this.refresh();
        requestAnimationFrame(() => {
            this.keepPopInView();
            if (this.pop?.mode !== "slash") this.querySelector(".sf-editor-pop sf-input input")?.focus();
        });
    }

    onCatalogueKey(event) {
        const items = this.popOptions();
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            this.closeCatalogue();
            return true;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            this.popActive = (this.popActive + (event.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length);
            this.refresh();
            return true;
        }
        if (event.key === "Enter" && items[this.popActive]) {
            event.preventDefault();
            event.stopPropagation();
            const option = items[this.popActive];
            if (option.section) this.openPopSection(option.section);
            else this.chooseItem(option);
            return true;
        }
        // Back to the sections: ← or Backspace in an empty search (the + only:
        // with / those keys edit the text).
        if (this.pop.mode !== "slash" && this.pop.section && !this.popQuery && (event.key === "ArrowLeft" || event.key === "Backspace")) {
            event.preventDefault();
            event.stopPropagation();
            this.openPopSection("");
            return true;
        }
        if (this.pop.mode !== "slash" && !this.popQuery && !this.pop.section && event.key === "ArrowRight" && items[this.popActive]?.section) {
            event.preventDefault();
            event.stopPropagation();
            this.openPopSection(items[this.popActive].section);
            return true;
        }
        return false;
    }

    chooseItem(item) {
        const pop = this.pop;
        this.closeCatalogue();
        const choice = {type: item.type, ...(item.variant ? {variant: item.variant} : {})};
        if (pop?.mode === "slash") {
            this.finishSession(false);
            const result = this.model.insertFromSlash(choice, pop.slashId);
            this.remember(item);
            return this.run(result, "inserted-text");
        }
        return this.insertChoice(choice, pop?.place ?? null, item);
    }

    insertChoice(choice, place, item = null) {
        this.finishSession(false);
        const result = this.model.insert(choice, place);
        if (result.ok) this.remember(item ?? choice);
        return this.run(result, "inserted-text");
    }

    remember(item) {
        this.recent = pushRecent(this.recent, itemKey(item));
        this.writePreferences();
    }

    favourite(item) {
        this.favourites = toggleFavourite(this.favourites, itemKey(item));
        this.writePreferences();
        this.refresh();
    }

    // ------------------------------------------------------------ the gutter, the grip and drag

    /** The grip from the keyboard: Enter or Space opens its menu; Alt+arrows move. */
    onGripKey(event, id = this.gutterId) {
        if (!id) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            this.hintUsed();
            this.openGripMenu(id, event.currentTarget);
        } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            event.stopPropagation();
            this.moveBy(id, event.key === "ArrowUp" ? -1 : 1);
        }
    }

    /** The floating bar's grip: a press opens the chosen block's menu, a pull moves it. */
    onToolbarGrip(event) {
        const id = this.model.selected;
        if (event.button !== 0 || !id) return;
        this.hintUsed();
        this.startDrag(event, {kind: "move", id});
    }

    onPlus(event) {
        this.hintUsed();
        const id = this.gutterId;
        const place = id ? this.model.placeAfter(id) : null;
        this.openCatalogue(event.currentTarget, place, "plus");
    }

    /** The grip: a press chooses the block and opens its menu; a pull moves it with drop lines. */
    onGripDown(event) {
        if (event.button !== 0 || !this.gutterId) return;
        this.hintUsed();
        this.startDrag(event, {kind: "move", id: this.gutterId});
    }

    onLibraryDown(event, item) {
        if (event.button !== 0) return;
        this.startDrag(event, {kind: "new", item});
    }

    startDrag(event, what) {
        const start = {x: event.clientX, y: event.clientY};
        const doc = this.ownerDocument;
        const pointer = event.pointerId;
        let moving = false;
        const controller = new AbortController();
        const signal = {signal: controller.signal};
        const move = (next) => {
            if (!moving && Math.hypot(next.clientX - start.x, next.clientY - start.y) < DRAG_THRESHOLD) return;
            if (!moving) {
                moving = true;
                this.drag = {...what, target: null};
                this.finishSession(false);
                this.classList.add("sf-editor-dragging");
                this.placeOverlays();
            }
            next.preventDefault();
            this.drag.target = this.dropTarget(next.clientX, next.clientY);
            this.placeDropLine();
        };
        const end = (last) => {
            controller.abort();
            this.classList.remove("sf-editor-dragging");
            const drag = this.drag;
            this.drag = null;
            this.placeDropLine();
            if (!moving) {
                if (what.kind === "move") this.openGripMenu(what.id, event.target);
                else this.insertChoice({type: what.item.type, ...(what.item.variant ? {variant: what.item.variant} : {})}, null, what.item);
                return;
            }
            if (last.type === "pointercancel" || !drag?.target) {
                this.placeOverlays();
                return;
            }
            this.dropOn(drag, drag.target);
        };
        doc.addEventListener("pointermove", move, signal);
        doc.addEventListener("pointerup", end, signal);
        doc.addEventListener("pointercancel", end, signal);
        // A drag the browser lost (a window switch): the next move with no button clears it.
        doc.addEventListener("pointermove", (next) => {
            if (moving && next.buttons === 0 && next.pointerId === pointer) end(next);
        }, signal);
    }

    /**
     * Where a drop at a point lands: beside a block (its side), before or
     * after it in the nearest slot that takes the dragged type, or inside an
     * empty place. {place} or {beside: {id, side}}, with the line to draw.
     */
    dropTarget(x, y) {
        const doc = this.ownerDocument;
        const under = doc.elementFromPoint(x, y);
        if (!under || !this.pageElement?.contains(under)) return null;
        const type = this.drag.kind === "move" ? this.model.node(this.drag.id)?.type : this.drag.item.type;
        if (!type) return null;
        const empty = under.closest("[data-sf-editor-empty]");
        if (empty) {
            const place = this.model.placeInside(empty.dataset.sfEditorEmpty, empty.dataset.sfEditorSlot || undefined);
            if (place && this.model.accepts(place.parent, place.slot, type) && !this.model.placeLock(place.parent)) return {place, rect: empty.getBoundingClientRect(), edge: "inside"};
        }
        let block = this.blockAt(under);
        while (block) {
            const at = locate(this.model.doc.root, block.id);
            if (!at?.parent) return null;
            if (this.drag.kind === "move" && (block.id === this.drag.id || locate(this.model.node(this.drag.id), block.id))) {
                block = this.blockAt(block.element.parentElement);
                continue;
            }
            const rect = block.element.getBoundingClientRect();
            const ratio = (x - rect.left) / Math.max(1, rect.width);
            const sideways = this.model.rights.layout && (ratio < SIDE_ZONE || ratio > 1 - SIDE_ZONE) && rect.width > 160 && !["layout.section", "layout.columns"].includes(at.node.type);
            // A block inside another (a paragraph in a quote) gives its side to the outer block.
            const besideId = sideways ? this.model.besideTarget(block.id) ?? block.id : null;
            const beside = besideId && besideId !== block.id ? this.blockElement(besideId) : block.element;
            const outer = beside?.getBoundingClientRect();
            const outerRatio = outer ? (x - outer.left) / Math.max(1, outer.width) : 0.5;
            const besideAt = besideId ? locate(this.model.doc.root, besideId) : null;
            if (besideAt && (outerRatio < SIDE_ZONE || outerRatio > 1 - SIDE_ZONE) && (this.drag.kind === "move" ? !locate(this.model.node(besideId), this.drag.id) : this.model.standsBeside(type)) && !this.model.placeLock(besideAt.parent.id)) {
                const left = outerRatio < SIDE_ZONE;
                return {beside: {id: besideId, side: (left !== this.isRtl) ? "left" : "right"}, rect: outer, edge: left ? "start" : "end"};
            }
            const after = y > rect.top + rect.height / 2;
            const place = {parent: at.parent.id, slot: at.slot, index: at.index + (after ? 1 : 0)};
            if (this.model.accepts(place.parent, place.slot, type) || (this.drag.kind === "move" && this.model.place(this.drag.id)?.parent?.id === place.parent)) {
                if (!this.model.placeLock(place.parent)) return {place, rect, edge: after ? "after" : "before"};
            }
            block = this.blockAt(block.element.parentElement);
        }
        return null;
    }

    placeDropLine() {
        const line = this.querySelector(".sf-editor-drop");
        const canvas = this.canvasElement;
        if (!line || !canvas) return;
        const target = this.drag?.target;
        if (!target) {
            line.hidden = true;
            return;
        }
        const box = canvas.getBoundingClientRect();
        const rect = target.rect;
        line.hidden = false;
        line.dataset.edge = target.edge;
        const top = rect.top - box.top + canvas.scrollTop;
        const left = rect.left - box.left + canvas.scrollLeft;
        if (target.edge === "start" || target.edge === "end") {
            Object.assign(line.style, {top: `${top}px`, left: `${target.edge === "start" ? left - 2 : left + rect.width - 1}px`, width: "3px", height: `${rect.height}px`});
        } else if (target.edge === "inside") {
            Object.assign(line.style, {top: `${top}px`, left: `${left}px`, width: `${rect.width}px`, height: `${rect.height}px`});
        } else {
            Object.assign(line.style, {top: `${(target.edge === "after" ? top + rect.height : top) - 1}px`, left: `${left}px`, width: `${rect.width}px`, height: "3px"});
        }
    }

    dropOn(drag, target) {
        if (drag.kind === "move") {
            const result = target.beside ? this.model.dropBeside(drag.id, target.beside.id, target.beside.side) : this.model.move(drag.id, target.place);
            this.run(result, "moved-text");
            return;
        }
        const choice = {type: drag.item.type, ...(drag.item.variant ? {variant: drag.item.variant} : {})};
        if (target.beside) {
            this.finishSession(false);
            const result = this.model.insertBeside(choice, target.beside.id, target.beside.side);
            if (result.ok) this.remember(drag.item);
            this.run(result, "columns-text");
            return;
        }
        this.insertChoice(choice, target.place, drag.item);
    }

    // ------------------------------------------------------------ the grip menu

    openGripMenu(id, anchor) {
        this.choose(id);
        const menu = this.querySelector(".sf-editor-menu");
        if (!menu) return;
        const node = this.model.node(id);
        const at = locate(this.model.doc.root, id);
        const columns = node?.type === "layout.columns";
        const entries = [
            {id: "up", text: this.sfWord("menu-up"), icon: "arrow_upward", shortcut: "Alt+↑", disabled: !at || at.index === 0},
            {id: "down", text: this.sfWord("menu-down"), icon: "arrow_downward", shortcut: "Alt+↓", disabled: !at?.parent || at.index >= at.parent.slots[at.slot].length - 1},
            {id: "duplicate", text: this.sfWord("menu-duplicate"), icon: "content_copy", shortcut: "⌘D"},
            ...(this.model.rights.layout ? [{id: "columns", text: this.sfWord(columns ? "menu-add-column" : "menu-columns"), icon: "view_column", disabled: columns && node.slots?.columns?.length >= MAX_COLUMNS}] : []),
            ...(this.model.rights.builder && !this.builder ? [{id: "build", text: this.sfWord(isComposed(this.model.manifestOf(node?.type)) ? "menu-change-block" : "menu-make-block"), icon: "dashboard_customize"}] : []),
            {id: "remove", text: this.sfWord("menu-remove"), icon: "delete", danger: true, shortcut: "⌫"},
        ];
        menu.entries = entries;
        menu.dataset.for = id;
        // sf-button-icon's host is display: contents: the menu stands by its button.
        const button = anchor?.closest?.("sf-button-icon")?.querySelector(":scope > button, button") ?? anchor;
        menu.openFor?.(button, {side: "block-end", align: "start"});
    }

    onMenuSelect(event) {
        event.stopPropagation();
        const menu = event.currentTarget;
        const id = menu.dataset.for;
        const action = event.detail?.entry?.id ?? event.detail?.id;
        queueMicrotask(() => {
            // The menu closes: the keys (⌘Z first) act where a person works, on the canvas.
            if (action !== "build") this.canvasElement?.focus({preventScroll: true});
            if (action === "up" || action === "down") this.moveBy(id, action === "up" ? -1 : 1);
            else if (action === "duplicate") this.run(this.model.duplicate(id), "duplicated-text");
            else if (action === "remove") this.run(this.model.remove(id), "removed-text");
            else if (action === "columns") {
                const node = this.model.node(id);
                this.run(node?.type === "layout.columns" ? this.model.addColumn(id) : this.model.splitColumns(id), "columns-text");
            } else if (action === "build") this.openBuilder({from: id});
        });
    }

    // ------------------------------------------------------------ template, builder, output

    toggleTemplate(on) {
        this.finishSession(false);
        const result = this.main.editTemplate(on);
        if (result.ok) {
            this.lockNote = null;
            this.redraw();
            this.say(this.sfWord(on ? "template-on-text" : "template-off-text"));
        }
        return result;
    }

    openBuilder({from = null, type = null} = {}) {
        this.finishSession(false);
        const started = this.main.startBuilder({from, type});
        if (!started.ok) return started;
        const builder = started.builder;
        const doc = {schema: "simai.composition.document", schema_version: 1, id: "builder", profile: "ui-layout", locale: this.main.doc.locale, root: {id: "builder-root", type: "layout.page", slots: {default: [builder.root]}}};
        this.builder = {...builder, name: type ? this.typeLabel(type) : "", diagnostics: []};
        this.model = new EditorModel({document: doc, types: this.main.types, siteBlocks: this.main.siteBlocks, renderers: this.main.renderers, editorManifests: this.main.editorManifests, theme: this.main.theme});
        this.model.select(builder.root.id);
        this.redraw();
        return {ok: true};
    }

    closeBuilder() {
        this.builder = null;
        this.model = this.main;
        this.redraw();
    }

    async saveBuilder() {
        const session = this.builder;
        if (!session) return;
        const root = this.model.doc.root.slots.default[0];
        const result = this.main.saveBuilder({...session, root, exposed: session.exposed.filter((entry) => locate(root, entry.path))}, {name: session.name, locale: this.locale});
        if (!result.ok) {
            this.builder = {...session, diagnostics: result.diagnostics ?? [{code: result.reason}]};
            this.refresh();
            return;
        }
        this.builderWords = mergeWords(this.builderWords, result.words);
        const detail = {manifest: result.manifest, words: result.words, changes: result.changes};
        this.sfEmit("block-save", detail);
        try {
            await this.sfPort?.saveBlock?.(result.manifest, result.words);
        } catch {
            this.say(this.sfWord("block-not-kept-text"));
        }
        this.builder = null;
        this.model = this.main;
        this.redraw();
        this.say(this.sfWord("block-saved-text"));
    }

    toggleExposed(path, field, on) {
        if (!this.builder) return;
        const target = `${field.plane}.${field.target}`;
        const others = this.builder.exposed.filter((entry) => !(entry.path === path && entry.target === target));
        let key = field.target;
        const taken = new Set(others.map((entry) => entry.key));
        for (let index = 2; taken.has(key); index += 1) key = `${field.target}_${index}`;
        this.builder.exposed = on ? [...others, {key, path, target}] : others;
        this.refresh();
    }

    async outputOf(format) {
        if (format === "json") return JSON.stringify(this.main.toJSON(), null, 2);
        if (format === "markdown") return this.main.toMarkdown().map((area) => area.markdown).join("\n\n---\n\n");
        if (format === "html") {
            const port = this.sourcePort();
            const result = await this.main.toHTML({resolveBinding: port ? port.resolveBinding : undefined});
            return prettyHtml(result.html);
        }
        return null;
    }

    /**
     * The output dialog: drawn, then opened. sf-modal is fetched on the first
     * press (a lazy part), so its open() is waited for: the first press opens
     * the dialog (G-28). A tab switch only changes the text.
     */
    async openOutput(format = "json") {
        const shown = Boolean(this.outputView);
        this.outputView = {format, text: await this.outputOf(format)};
        this.refresh();
        await this.updateComplete?.catch?.(() => {});
        if (shown) return;
        const modal = await this.defined(() => this.querySelector(".sf-editor-output"), "sf-modal", "open");
        if (!modal || !this.outputView) return;
        await modal.updateComplete?.catch?.(() => {});
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (this.outputView) modal.open();
    }

    /** An element of a lazy part once its definition has come: it, or null after a few seconds. */
    async defined(find, tag, method) {
        const ready = () => {
            const element = find();
            return element && typeof element[method] === "function" ? element : null;
        };
        if (ready()) return ready();
        const registry = this.ownerDocument.defaultView?.customElements ?? globalThis.customElements;
        await Promise.race([registry?.whenDefined?.(tag), new Promise((resolve) => setTimeout(resolve, 5000))]).catch(() => {});
        // An element made before its definition is upgraded with it.
        const element = find();
        if (element && typeof element[method] !== "function") registry?.upgrade?.(element);
        return ready();
    }

    // ------------------------------------------------------------ the panels

    /** The parameter form of the chosen block at the screen being edited. */
    formOf(id) {
        // The Document keeps `hidden`; the panel asks the positive question,
        // «show on this screen», with the value turned over (yes = not hidden).
        return this.model.fields(id, this.breakpoint).map((field) => ({
            ...field,
            ...(field.target === "hidden" && field.kind === "toggle" ? {shown: true} : {}),
            label: field.target === "hidden" && field.kind === "toggle" ? this.sfWord("show-on-screen") : this.word(field.label_key),
            originLabel: this.sfWord(`origin-${field.origin}`),
            choiceLabels: (field.choices ?? []).map((choice) => ({value: String(choice), text: this.choiceWord(field, choice)})),
            screensLabel: field.screens.map((key) => this.sfWord(`screen-${Object.keys(SCREENS).find((name) => SCREENS[name] === key) ?? key}`)).join(", "),
        }));
    }

    choiceWord(field, choice) {
        const key = `${field.label_key}.${choice}`;
        const said = this.word(key);
        return said === humanize(key) ? String(choice) : said;
    }

    onField(event, field) {
        event.stopPropagation();
        const id = this.model.selected;
        const element = event.currentTarget;
        let value = event.detail?.value ?? element.value;
        if (Array.isArray(value)) value = value[0];
        if (field.kind === "toggle") value = value === true || value === "true" || (typeof value !== "string" && Boolean(event.detail?.checked ?? element.checked));
        if (field.shown) value = !value;
        if (Array.isArray(value)) value = value[0];
        const result = this.model.setParam(id, field.key, value, this.breakpoint);
        if (!result.ok) this.say(this.sfWord(`refused-${result.reason}`));
        this.redraw();
    }

    onReset(field) {
        this.model.resetParam(this.model.selected, field.key, this.breakpoint);
        this.redraw();
    }

    onModifiers(event) {
        event.stopPropagation();
        const value = event.detail?.value ?? event.currentTarget.value ?? "";
        const result = this.model.setModifiers(this.model.selected, String(value));
        this.dropped = {id: this.model.selected, groups: refusedClasses(result.dropped)};
        this.redraw();
    }

    setScreen(name) {
        if (!SCREENS[name]) return;
        this.screen = name;
    }

    setRightTab(tab) {
        this.rightTab = tab;
        this.refresh();
    }

    /**
     * The chosen block as code: its node in the Document (JSON), or as the
     * site prints it (HTML: the whole page printed, the block's element cut
     * out of it). Worked out once per drawing; null while it is printed.
     */
    codeOf(id, format) {
        const key = `${format}:${id}`;
        if (this.codeCache.has(key)) return this.codeCache.get(key);
        if (format === "json") {
            const node = locate(this.model.toJSON?.().root ?? this.model.doc.root, id)?.node ?? this.model.node(id);
            const text = JSON.stringify(node ?? null, null, 2);
            this.codeCache.set(key, text);
            return text;
        }
        this.codeCache.set(key, null);
        const port = this.sourcePort();
        Promise.resolve(this.model.toHTML({resolveBinding: port ? port.resolveBinding : undefined})).then((result) => {
            const parsed = new DOMParser().parseFromString(`<body>${result?.html ?? ""}</body>`, "text/html");
            const element = parsed.body.querySelector(`[${ID}="${cssEscape(id)}"]`);
            return element ? prettyHtml(element.outerHTML) : this.sfWord("html-none");
        }, () => this.sfWord("html-none")).then((text) => {
            this.codeCache.set(key, text);
            this.refresh();
        });
        return null;
    }

    /** The help popover under its button in the bar. */
    toggleHelp(event) {
        if (this.helpOpen) {
            this.helpOpen = null;
            this.refresh();
            return;
        }
        const rect = boxOf(event.currentTarget) ?? {bottom: 0, right: 0};
        const view = this.ownerDocument.defaultView;
        this.helpOpen = {y: rect.bottom + 4, x: Math.max(8, (view?.innerWidth ?? rect.right) - rect.right)};
        this.refresh();
    }

    /** The theme button: the site's theme settings when the host gave them, else the page panel that names the theme. */
    showTheme() {
        const url = this.main.theme?.settings_url;
        if (url) {
            this.ownerDocument.defaultView?.open(url, "_top");
            return;
        }
        this.choose(null);
    }

    /** Opens a library section in place («» closes it, back to the list of sections). */
    openSection(id) {
        this.librarySection = id;
        this.refresh();
        requestAnimationFrame(() => this.querySelector(id ? ".sf-editor-back button" : `.sf-editor-section-row[data-section] sf-button button`)?.focus({preventScroll: true}));
    }

    toggleVariants(type) {
        if (this.libraryClosed.has(type)) this.libraryClosed.delete(type);
        else this.libraryClosed.add(type);
        this.refresh();
    }

    /** The groups a site block may be filed under: the Framework's, in its order. */
    builderGroups() {
        return [...CATALOGUE_GROUPS];
    }

    // ------------------------------------------------------------ data

    /**
     * What the host's source port answered to a question, for drawing: the
     * answer once it came, null until then (the question is asked once and
     * the panel is drawn again when it is answered). The port's answers are
     * checked by createSourcePort; one it refuses reads as nothing.
     */
    answer(key, ask) {
        const port = this.sourcePort();
        if (!port) return null;
        const known = this.dataCache.get(key);
        if (known) return known.value;
        const entry = {value: null};
        this.dataCache.set(key, entry);
        Promise.resolve().then(() => ask(port)).then((value) => {
            entry.value = Array.isArray(value) ? value : [];
        }, () => {
            entry.value = [];
        }).then(() => this.refresh());
        return null;
    }

    /** The fields of a data shape a mapping names: a list shape's item fields, else its own. */
    shapeFields(shape) {
        const entry = Composition.DATA_SHAPES[shape];
        if (!entry) return [];
        const schema = entry.list ? entry.schema?.properties?.[entry.list]?.items : entry.schema;
        return Object.keys(schema?.properties ?? {});
    }

    listShape(shape) {
        return Boolean(Composition.DATA_SHAPES[shape]?.list);
    }

    onSource(event, entry) {
        event.stopPropagation();
        const ref = String(event.detail?.value ?? event.currentTarget.value ?? "");
        this.model.setSource(this.model.selected, entry.target, Array.isArray(ref) ? ref[0] : ref);
        this.redraw();
    }

    onSetting(event, entry, key, transform = (value) => value) {
        event.stopPropagation();
        let value = event.detail?.value ?? event.currentTarget.value;
        if (Array.isArray(value)) value = value[0];
        this.model.setSettings(this.model.selected, entry.target, {[key]: transform(value)});
        this.redraw();
    }

    onMapping(event, entry, field) {
        event.stopPropagation();
        let value = event.detail?.value ?? event.currentTarget.value;
        if (Array.isArray(value)) value = value[0];
        const mapping = {...(entry.settings.mapping ?? {})};
        if (value) mapping[field] = String(value);
        else delete mapping[field];
        this.model.setSettings(this.model.selected, entry.target, {mapping});
        this.redraw();
    }

    onRuntime(event, entry) {
        event.stopPropagation();
        let value = event.detail?.value ?? event.currentTarget.value;
        if (Array.isArray(value)) value = value[0];
        const [id, state] = String(value ?? "").split("#");
        this.model.setRuntime(this.model.selected, entry.target, id || null, state);
        this.redraw();
    }

    onState(event) {
        event.stopPropagation();
        let value = event.detail?.value ?? event.currentTarget.value;
        if (Array.isArray(value)) value = value[0];
        if (!value || value === "auto") this.dataState.delete(this.model.selected);
        else this.dataState.set(this.model.selected, String(value));
        this.redraw();
    }

    // ------------------------------------------------------------ events

    listen() {
        if (this.listening) return;
        this.listening = new AbortController();
        const signal = {signal: this.listening.signal};
        this.addEventListener("keydown", (event) => this.onKeydown(event), {...signal, capture: true});
        this.addEventListener("pointerdown", (event) => {
            if (this.pop && !event.target.closest?.(".sf-editor-pop")) this.closeCatalogue();
            if (this.pageElement?.contains(event.target)) this.onPagePointerDown(event);
        }, signal);
        this.addEventListener("pointermove", (event) => this.onPointerMove(event), {...signal, passive: true});
        this.addEventListener("pointerleave", () => {
            if (this.drag) return;
            this.hoverId = "";
            this.placeOverlays();
        }, signal);
        for (const name of INLINE_EVENTS) {
            this.addEventListener(name, (event) => {
                event.stopPropagation();
                if (name === "sf-editor-inline-input") this.onInlineInput(event);
                if (name === "sf-editor-inline-change" && event.target === this.sessionElement) {
                    const element = this.sessionElement;
                    const id = this.sessionId;
                    this.session = null;
                    this.sessionElement = null;
                    this.sessionId = "";
                    queueMicrotask(() => {
                        if (element?.isConnected) element.replaceChildren(renderInlineDom(element.ownerDocument, this.model.textOf(id, "content")));
                        if (this.model.typing?.id === id) this.model.typing = null;
                        this.refresh();
                    });
                }
            }, signal);
        }
        this.addEventListener("click", (event) => {
            if (this.pageElement?.contains(event.target) && event.target.closest?.("a")) event.preventDefault();
        }, {...signal, capture: true});
        // A form drawn on the page (form.form, 1.2.0) is never sent from the
        // editor: its submit button chooses the block, as any element does.
        this.addEventListener("submit", (event) => {
            if (this.pageElement?.contains(event.target)) event.preventDefault();
        }, {...signal, capture: true});
        const relayout = () => requestAnimationFrame(() => {
            this.placeOverlays();
            this.placeDropLine();
        });
        globalThis.addEventListener("resize", relayout, signal);
        this.addEventListener("scroll", relayout, {...signal, capture: true, passive: true});
    }

    // ------------------------------------------------------------ drawing

    templateContext() {
        return {component: this, rootClass: this.getRootClass?.() ?? ""};
    }

    template() {
        return renderEditorTemplate(this);
    }

    /** Everything the template draws, worked out once per render. */
    view() {
        const model = this.model;
        const selected = model.selected ? model.node(model.selected) : null;
        const lock = selected ? model.lockOf(selected.id) : null;
        const typeManifest = selected ? model.manifestOf(selected.type) : null;
        const data = selected && !lock ? model.dataOf(selected.id) : {bindings: [], runtime: []};
        const libraryAt = this.catalogue(null);
        const libraryItems = this.libraryQuery ? searchItems(libraryAt.items, this.libraryQuery, {word: (key) => this.word(key), words: (key) => this.wordsOf(key)}) : libraryAt.items;
        const sections = sectionsOf(libraryAt.items);
        const section = sections.some((entry) => entry.id === this.librarySection) ? this.librarySection : "";
        const entry = typeManifest ? catalogueEntry(typeManifest) : null;
        const manifestGroup = entry?.group;
        const at = selected ? locate(model.doc.root, selected.id) : null;
        return {
            model,
            selected,
            lock,
            typeManifest,
            data,
            hasData: data.bindings.length > 0 || data.runtime.length > 0,
            path: selected ? model.pathOf(selected.id) : [],
            form: selected && !lock ? this.formOf(selected.id) : [],
            modifiers: selected ? model.modifiersOf(selected.id).join(" ") : "",
            library: {
                sections,
                section,
                found: this.libraryQuery ? sectionsOf(libraryItems, {own: true}) : [],
                favourites: pick(libraryAt.items, this.favourites),
                recent: pick(libraryAt.items, this.recent),
            },
            typeIcon: selected ? entry?.icon ?? (manifestGroup ? groupIcon(manifestGroup) : "widgets") : "",
            sectionLabel: manifestGroup ? this.word(groupWordKey(manifestGroup)) : "",
            position: at?.parent ? {first: at.index === 0, last: at.index >= at.parent.slots[at.slot].length - 1} : null,
            pop: this.pop ? {...this.pop, items: this.popItems(), sections: this.popSections()} : null,
            screens: SCREEN_ORDER.map((name) => ({value: name, label: this.sfWord(`screen-${name}`), icon: SCREEN_ICONS[name], "icon-only": true})),
            states: STATES.map((value) => ({value, label: this.sfWord(`state-${value}`)})),
            origins: ORIGINS,
            hasTemplate: this.main.hasRegions(),
            heading: this.getAttribute("heading") || "",
            caption: this.getAttribute("caption") || "",
            page: this.pageSettings && typeof this.pageSettings === "object" && !Array.isArray(this.pageSettings) ? this.pageSettings : null,
            landmarks: Boolean(this.pageLandmarks),
            tree: this.treeOf(model.doc.root, 0),
        };
    }

    treeOf(node, depth) {
        const rows = [];
        const visit = (current, level) => {
            const choosable = this.model.choosable(current);
            if (choosable) rows.push({id: current.id, type: current.type, label: this.typeLabel(current.type), depth: level, lock: this.model.lockOf(current.id), excerpt: excerptOf(current)});
            for (const list of Object.values(current.slots ?? {})) for (const child of list) visit(child, choosable ? level + 1 : level);
        };
        visit(node, depth);
        return rows;
    }

    skeleton(item) {
        return skeletonOf(this.model, item);
    }
}

// ------------------------------------------------------------ helpers

function format(text, vars) {
    return vars ? String(text).replace(/\{(\w+)\}/gu, (_, key) => String(vars[key] ?? "")) : String(text);
}

function humanize(key) {
    const last = String(key).replace(/^type-[a-z]+-/u, "").split(/[.]/u).pop().replace(/[_-]+/gu, " ");
    return last.charAt(0).toUpperCase() + last.slice(1);
}

function mergeWords(into = {}, add = {}) {
    const out = {...into};
    for (const [locale, words] of Object.entries(add ?? {})) out[locale] = {...(out[locale] ?? {}), ...words};
    return out;
}

function cssEscape(value) {
    return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/["\\]/gu, "\\$&");
}

function excerptOf(node) {
    const content = node.data?.content ?? node.data?.title ?? node.data?.summary;
    if (!Array.isArray(content)) return "";
    return content.map((entry) => entry.value ?? (entry.children ?? []).map((child) => child.value).join("")).join("").slice(0, 40);
}

/** Where a press lands in a text element, as an offset of the inline model. */
function caretAt(doc, element, x, y) {
    const point = doc.caretPositionFromPoint?.(x, y);
    const range = point ? {node: point.offsetNode, offset: point.offset} : (() => {
        const legacy = doc.caretRangeFromPoint?.(x, y);
        return legacy ? {node: legacy.startContainer, offset: legacy.startOffset} : null;
    })();
    return range && element.contains(range.node) ? textOffset(element, range.node, range.offset) : "end";
}

function setCaret(element, at) {
    const doc = element.ownerDocument;
    const selection = doc.getSelection();
    if (!selection) return;
    const range = doc.createRange();
    if (at === "end" || at === Infinity) {
        range.selectNodeContents(element);
        range.collapse(false);
    } else {
        let left = Number(at) || 0;
        const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let placed = false;
        while (walker.nextNode()) {
            const length = walker.currentNode.textContent.length;
            if (left <= length) {
                range.setStart(walker.currentNode, left);
                placed = true;
                break;
            }
            left -= length;
        }
        if (!placed) {
            range.selectNodeContents(element);
            range.collapse(false);
        }
        range.collapse(true);
    }
    selection.removeAllRanges();
    selection.addRange(range);
}

const VOID = new Set(["img", "br", "hr", "input", "source", "meta", "link"]);
/** The HTML output, one element per line, for reading. */
function prettyHtml(markup) {
    const out = [];
    let depth = 0;
    for (const token of String(markup).split(/(<[^>]+>)/u).filter((part) => part.trim())) {
        if (token.startsWith("</")) {
            depth = Math.max(0, depth - 1);
            out.push(`${"  ".repeat(depth)}${token}`);
        } else if (token.startsWith("<")) {
            out.push(`${"  ".repeat(depth)}${token}`);
            const tag = /^<([a-z0-9-]+)/iu.exec(token)?.[1]?.toLowerCase();
            if (tag && !VOID.has(tag) && !token.endsWith("/>")) depth += 1;
        } else out.push(`${"  ".repeat(depth)}${token.trim()}`);
    }
    return out.join("\n");
}

SfEditor.define("sf-editor");
