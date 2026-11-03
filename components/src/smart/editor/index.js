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
import {CATALOGUE_GROUPS} from "../../core/js/composition/catalogue.mjs";
import {isComposed} from "../../core/js/composition/composed.mjs";
import {readInlineDom, renderInlineDom, startInlineEdit, textOffset} from "../../core/js/composition/inline-editor.mjs";
import {localeText, pageLocale} from "../../core/js/page-language.js";
import {EditorModel, MAX_COLUMNS, ORIGINS, SCREENS, refusedClasses} from "./js/model.mjs";
import {catalogueAt, itemKey, pick, pushRecent, searchItems, skeletonOf, toggleFavourite, typeWordKey} from "./js/catalogue.mjs";
import {isPlainObject, locate} from "./js/tree.mjs";
import {renderEditorTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

const applied = (value) => (value === undefined ? {outcome: "applied"} : {outcome: "applied", value});
const refused = (reason) => ({outcome: "refused", reason});
const ID = "data-sf-composition-id";
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
        for (const name of ["document", "types", "editorManifests", "siteBlocks", "words", "rights", "theme", "renderers"]) {
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
        this.libraryTab = "";
        this.libraryGroup = "";
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
        }
    }

    writePreferences() {
        const key = this.preferencesKey ? `sf-editor/${this.preferencesKey}` : "";
        if (key) globalThis.SF?.Preferences?.write?.(key, {recent: this.recent, favourites: this.favourites});
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
        const typing = this.model.typing ? {...this.model.typing, at: this.session ? this.caretOffset() : "end"} : null;
        this.finishSession(false);
        const {document, hidden} = this.model.canvasDocument(this.breakpoint);
        let result;
        try {
            result = await Composition.render(document, {
                registry: this.model.registry,
                preview: true,
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
        const landmarks = Boolean(page.querySelector('main, [role="main"]'));
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
                    const mark = this.ownerDocument.createElement("sf-icon");
                    mark.className = "sf-editor-lock-mark";
                    mark.setAttribute("icon", "lock");
                    mark.setAttribute("size", "1/2");
                    mark.setAttribute("aria-hidden", "true");
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
        if (id && !this.model.placeLock(this.model.place(id)?.parent?.id ?? "")) this.gutterId = id;
        else if (!id) this.gutterId = this.gutterId && this.model.place(this.gutterId) ? this.gutterId : "";
        this.placeOverlays();
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
        this.choose(block?.id ?? null);
        this.canvasElement?.focus({preventScroll: true});
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
        const inPanel = event.target.closest?.(".sf-editor-left, .sf-editor-right, .sf-editor-bar, .sf-editor-pop, sf-modal, .sf-editor-menu");
        if (this.pop && this.onCatalogueKey(event)) return;
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
        const rect = anchor?.getBoundingClientRect?.() ?? {left: 0, bottom: 0, top: 0};
        const at = this.catalogue(place);
        this.pop = {mode, place, slashId, x: rect.left, y: rect.bottom + 4, tab: at.tab};
        this.popQuery = "";
        this.popActive = 0;
        this.refresh();
        requestAnimationFrame(() => {
            if (mode !== "slash") this.querySelector(".sf-editor-pop input, .sf-editor-pop sf-input")?.focus?.();
        });
    }

    closeCatalogue() {
        if (!this.pop) return;
        this.pop = null;
        this.refresh();
    }

    popItems() {
        if (!this.pop) return [];
        const at = this.catalogue(this.pop.place);
        if (this.popQuery) return searchItems(at.items, this.popQuery, {word: (key) => this.word(key), words: (key) => this.wordsOf(key)});
        return at.items.filter((item) => item.tab === this.pop.tab);
    }

    onCatalogueKey(event) {
        const items = this.popItems();
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
            this.chooseItem(items[this.popActive]);
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
    onGripKey(event) {
        if (!this.gutterId) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            this.openGripMenu(this.gutterId, event.currentTarget);
        } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            event.stopPropagation();
            this.moveBy(this.gutterId, event.key === "ArrowUp" ? -1 : 1);
        }
    }

    onPlus(event) {
        const id = this.gutterId;
        const place = id ? this.model.placeAfter(id) : null;
        this.openCatalogue(event.currentTarget, place, "plus");
    }

    /** The grip: a press chooses the block and opens its menu; a pull moves it with drop lines. */
    onGripDown(event) {
        if (event.button !== 0 || !this.gutterId) return;
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
        const button = anchor?.closest?.("sf-button-icon")?.querySelector("button") ?? anchor;
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
        return this.model.fields(id, this.breakpoint).map((field) => ({
            ...field,
            label: this.word(field.label_key),
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
        if (field.kind === "toggle") value = Boolean(event.detail?.checked ?? element.checked ?? element.querySelector?.("input")?.checked);
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
        const libraryTab = libraryAt.tabs.some((tab) => tab.id === this.libraryTab) ? this.libraryTab : libraryAt.tab;
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
                tabs: libraryAt.tabs,
                tab: libraryTab,
                items: libraryItems,
                favourites: pick(libraryAt.items, this.favourites),
                recent: pick(libraryAt.items, this.recent),
            },
            pop: this.pop ? {...this.pop, items: this.popItems(), tabs: this.catalogue(this.pop.place).tabs} : null,
            screens: SCREEN_ORDER.map((name) => ({value: name, label: this.sfWord(`screen-${name}`), icon: SCREEN_ICONS[name], "icon-only": true})),
            states: STATES.map((value) => ({value, label: this.sfWord(`state-${value}`)})),
            origins: ORIGINS,
            hasTemplate: this.main.hasRegions(),
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
