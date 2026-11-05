// The model of sf-editor: one Composition Document, the choice by depth, one
// undo history for typing and structure, the rights the host gave, and every
// change the editor makes (insert, move, split into columns, a parameter, a
// binding, a site block). No DOM here: the element draws what this holds and
// calls these methods, and the unit tests drive the same methods.
//
// The Document is composition-document v1, unchanged. Layout and text are one
// tree (page -> section -> columns -> area -> paragraph): text areas are
// `layout.area` nodes, the site template is the regions around the page's
// `main` region, a site block is a composed type (Part A, ui-source
// a0b7f2ec). The one thing the editor writes of its own is the variant a
// block was inserted from, in the node's extension `simai.composition:variant`, so
// the parameter panel can say a value came from the variant.
import Composition, {
    BUILTIN_EDITOR_MANIFESTS,
    BUILTIN_TYPE_MANIFESTS,
    COMPOSED_EXTENSION,
    DATA_EXTENSION,
    MODIFIERS_EXTENSION,
    UTILITY_BREAKPOINTS,
} from "../../../core/js/composition/index.mjs";
import {isBreakpointValue, isResponsive, valuesByBreakpoint} from "../../../core/js/composition/utilities.mjs";
import {isComposed, textFields} from "../../../core/js/composition/composed.mjs";
import {inlineLength, normalizeInline, sliceInline} from "../../../core/js/composition/inline-model.mjs";
import {childrenOf, clone, freshCopy, idMaker, insertAt, isPlainObject, locate, removeAt, same, slotList, walk} from "./tree.mjs";

export const VARIANT_EXTENSION = "simai.composition:variant";
/** The three screens of the editor and the breakpoint each one edits (phone has no prefix). */
export const SCREENS = Object.freeze({phone: "xs", tablet: "md", desktop: "lg"});
/** Where a parameter's value comes from, each layer over the one before. */
export const ORIGINS = Object.freeze(["type", "theme", "variant", "block", "screen"]);
export const MAX_COLUMNS = 4;
/** The breakpoints the editor's screens edit, narrowest first. */
const EDITOR_BREAKPOINTS = Object.freeze(["xs", "md", "lg"]);
const UNDO_DEPTH = 200;
const TYPING_PAUSE = 800;
const DOCUMENT = {schema: "simai.composition.document", schema_version: 1};

const text = (value) => (value ? [{type: "text", value}] : []);
const refused = (reason) => ({ok: false, reason});
const done = (extra = {}) => ({ok: true, ...extra});

/** An empty page: one section with one text area and one line to type in. */
export function emptyDocument(id = "page") {
    return {
        ...DOCUMENT, id, profile: "ui-layout",
        root: {id: "root", type: "layout.page", slots: {default: [
            {id: "s1", type: "layout.section", props: {width: "normal"}, slots: {default: [
                {id: "a1", type: "layout.area", slots: {default: [{id: "p1", type: "content.paragraph", data: {content: []}}]}},
            ]}},
        ]}},
    };
}

/** The rights the host gave; nothing given is the full set (a designer). */
export function normalizeRights(rights) {
    const given = isPlainObject(rights) ? rights : {};
    return {
        layout: given.layout !== false,
        template: given.template !== false,
        builder: given.builder !== false && given.layout !== false,
        reasons: isPlainObject(given.reasons) ? {...given.reasons} : {},
    };
}

export class EditorModel {
    /**
     * options: {document, types, renderers, editorManifests, siteBlocks, rights, theme, now}
     * types are a host's type manifests; siteBlocks the site's composed types.
     */
    constructor(options = {}) {
        this.now = options.now ?? (() => Date.now());
        this.listeners = new Set();
        this.types = Array.isArray(options.types) ? options.types : [];
        this.siteBlocks = Array.isArray(options.siteBlocks) ? options.siteBlocks : [];
        this.renderers = isPlainObject(options.renderers) ? options.renderers : {};
        this.editorManifests = Array.isArray(options.editorManifests) ? options.editorManifests : [];
        this.rights = normalizeRights(options.rights);
        this.theme = isPlainObject(options.theme) ? options.theme : null;
        this.templateEditing = false;
        this.buildRegistry();
        this.setDocument(options.document);
    }

    // ------------------------------------------------------------ setup

    buildRegistry() {
        // The newest version of each site block stands in the catalogue; a host
        // keeps older ones only while a Document names them.
        const latest = new Map();
        for (const manifest of this.siteBlocks) {
            const have = latest.get(manifest?.type);
            if (!have || compareVersions(manifest.version, have.version) > 0) latest.set(manifest.type, manifest);
        }
        const own = this.types.filter((manifest) => !latest.has(manifest?.type));
        try {
            this.registry = Composition.extendRegistry([...own, ...latest.values()], this.renderers);
        } catch {
            this.registry = Composition.extendRegistry([], this.renderers);
        }
        this.canvasRegistry = canvasRegistry(this.registry);
    }

    setTypes({types, siteBlocks, renderers, editorManifests} = {}) {
        if (types !== undefined) this.types = Array.isArray(types) ? types : [];
        if (siteBlocks !== undefined) this.siteBlocks = Array.isArray(siteBlocks) ? siteBlocks : [];
        if (renderers !== undefined) this.renderers = isPlainObject(renderers) ? renderers : {};
        if (editorManifests !== undefined) this.editorManifests = Array.isArray(editorManifests) ? editorManifests : [];
        this.buildRegistry();
    }

    setRights(rights) {
        this.rights = normalizeRights(rights);
        if (!this.rights.template) this.templateEditing = false;
    }

    setTheme(theme) {
        this.theme = isPlainObject(theme) ? theme : null;
    }

    setDocument(document) {
        this.doc = document && isPlainObject(document.root) ? clone(document) : emptyDocument();
        this.next = idMaker(this.doc.root, "e");
        this.selected = null;
        this.typing = null;
        this.undoStack = [];
        this.redoStack = [];
        this.typingKey = "";
        this.typingUntil = 0;
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    changed(reason, extra = {}) {
        for (const listener of this.listeners) listener({reason, scope: this.templateEditing ? "template" : "page", ...extra});
    }

    manifestOf(type) {
        return this.registry.types.get(type);
    }

    node(id) {
        return this.place(id)?.node ?? null;
    }

    /** Where a node stands; a drawn id of a site block's part stands for the instance. */
    place(id) {
        if (!id) return null;
        const own = locate(this.doc.root, id);
        if (own) return own;
        const at = String(id).indexOf(":");
        return at === -1 ? null : locate(this.doc.root, String(id).slice(0, at));
    }

    // ------------------------------------------------------------ template and rights

    /** 'template' (a region of the site template), 'frame' (the regions themselves) or 'page'. */
    scopeOf(id) {
        const at = this.place(id);
        if (!at) return "page";
        const chain = [...at.ancestors, at.node];
        const region = [...chain].reverse().find((node) => node.type === "layout.region");
        if (region) return region.props?.landmark === "main" ? "page" : "template";
        if (chain.some((node) => node.type === "layout.regions") || (this.hasRegions() && at.node === this.doc.root)) return "frame";
        return "page";
    }

    hasRegions() {
        let found = false;
        walk(this.doc.root, (node) => {
            if (node.type === "layout.regions") found = true;
            return !found;
        });
        return found;
    }

    /** Whether a node stands inside a text area (an author's place to write). */
    insideArea(id) {
        const at = this.place(id);
        if (!at) return false;
        if (this.doc.root.type === "content.document") return at.node !== this.doc.root;
        return at.ancestors.some((node) => node.type === "layout.area");
    }

    /**
     * Why a node cannot be changed, or null when it can: 'template' (the site
     * template, changed only through «Edit template»), 'page' (the page while
     * the template is edited), 'layout' (the layout, which the person has no
     * right to; an author writes only in text areas).
     */
    lockOf(id) {
        const scope = this.scopeOf(id);
        if ((scope === "template" || scope === "frame") && !this.templateEditing) return "template";
        if (scope === "page" && this.templateEditing) return "page";
        if (!this.rights.layout && !this.insideArea(id)) return "layout";
        return null;
    }

    /** Why a place (a slot of a node) cannot take, lose or reorder children, or null. */
    placeLock(parentId) {
        const parent = this.node(parentId);
        if (!parent) return "unknown";
        const scope = this.scopeOf(parentId);
        if ((scope === "template" || scope === "frame") && !this.templateEditing) return "template";
        if (scope === "page" && this.templateEditing) return "page";
        if (!this.rights.layout && parent.type !== "layout.area" && !this.insideArea(parentId)) return "layout";
        return null;
    }

    editTemplate(on) {
        if (on && !this.rights.template) return refused("rights");
        this.finishTyping();
        this.templateEditing = Boolean(on);
        this.selected = null;
        this.typing = null;
        this.changed("template-mode", {silent: true});
        return done();
    }

    // ------------------------------------------------------------ choice by depth

    isText(id) {
        const node = this.textNode(id);
        return Boolean(node && textFields(this.manifestOf(node.type)).length);
    }

    /** The node a drawn id edits text of: a part of a site block is its tree node. */
    textNode(id) {
        const own = locate(this.doc.root, id)?.node;
        if (own) return own;
        const at = String(id).indexOf(":");
        if (at === -1) return null;
        const instance = locate(this.doc.root, String(id).slice(0, at))?.node;
        const manifest = instance && this.manifestOf(instance.type);
        if (!isComposed(manifest)) return null;
        let found = null;
        walk(manifest.composed.root, (node) => {
            if (node.id === String(id).slice(at + 1)) found = node;
        });
        return found;
    }

    select(id) {
        this.finishTyping();
        const at = id ? this.place(id) : null;
        this.selected = at ? at.node.id : null;
        this.typing = null;
        return done({id: this.selected});
    }

    /** Starts typing in a node's text field: {id, key}; the id may be a site block's part. */
    startTyping(id, key = null) {
        const node = this.textNode(id);
        const fields = node ? textFields(this.manifestOf(node.type)) : [];
        const field = key ?? fields[0];
        if (!field || !fields.includes(field)) return refused("not-text");
        const lock = this.lockOf(id);
        if (lock) return refused(lock);
        this.typing = {id, key: field};
        this.selected = this.place(id).node.id;
        return done();
    }

    finishTyping() {
        this.typingUntil = 0;
        this.typingKey = "";
    }

    /** The chain from the outermost block a person can choose down to the node. */
    pathOf(id) {
        const at = this.place(id);
        if (!at) return [];
        return [...at.ancestors, at.node].filter((node) => this.choosable(node));
    }

    choosable(node) {
        return node !== this.doc.root && !["layout.regions", "layout.region"].includes(node.type);
    }

    /** Esc: one level up -- text to its block, a block to its container, up to the section. */
    up() {
        if (this.typing) {
            const id = this.place(this.typing.id).node.id;
            this.finishTyping();
            this.typing = null;
            this.selected = id;
            return done({id});
        }
        if (!this.selected) return refused("none");
        const path = this.pathOf(this.selected);
        const parent = path.at(-2) ?? null;
        this.selected = parent ? parent.id : null;
        return done({id: this.selected});
    }

    /** Enter: one level down -- into the first child, or into the text. */
    down() {
        if (!this.selected) {
            const first = this.firstChoosable(this.doc.root);
            if (!first) return refused("empty");
            this.selected = first.id;
            return done({id: first.id});
        }
        const node = this.node(this.selected);
        if (this.isText(node.id) && !isComposed(this.manifestOf(node.type))) {
            const started = this.startTyping(node.id);
            return started.ok ? done({id: node.id, typing: true}) : started;
        }
        if (isComposed(this.manifestOf(node.type))) return refused("closed");
        const child = this.firstChoosable(node);
        if (!child) return refused("leaf");
        this.selected = child.id;
        return done({id: child.id});
    }

    firstChoosable(node) {
        for (const child of childrenOf(node)) {
            if (this.choosable(child.node)) return child.node;
            const deeper = this.firstChoosable(child.node);
            if (deeper) return deeper;
        }
        return null;
    }

    lastChoosable(node) {
        for (const child of childrenOf(node).reverse()) {
            if (this.choosable(child.node)) return child.node;
            const deeper = this.lastChoosable(child.node);
            if (deeper) return deeper;
        }
        return null;
    }

    /**
     * ↑ ↓ on the canvas: the block before or after a block among its
     * siblings. A container a person cannot choose (a region of the site
     * template) is no wall: past its last block ↓ goes on to the next
     * region's first. Inside a block the arrows stay among its children (Esc
     * goes up). With nothing chosen, ↓ takes the first block a person can
     * work on and ↑ the last. Returns the id, or null when there is none.
     */
    neighbour(id, delta) {
        if (!id || !this.place(id)) return this.openEnd(delta);
        let at = locate(this.doc.root, this.place(id).node.id);
        while (at?.parent) {
            const list = at.parent.slots[at.slot];
            for (let index = at.index + delta; index >= 0 && index < list.length; index += delta) {
                const node = list[index];
                if (this.choosable(node)) return node.id;
                const inside = delta > 0 ? this.firstChoosable(node) : this.lastChoosable(node);
                if (inside) return inside.id;
            }
            if (this.choosable(at.parent)) return null;
            at = locate(this.doc.root, at.parent.id);
        }
        return null;
    }

    /** The first (or last) block a person can choose and change; a locked one when every block is locked. */
    openEnd(delta = 1) {
        // The outermost choosable blocks, in page order: ↑ starts at the last section, not inside it.
        const all = [];
        const visit = (node) => {
            if (this.choosable(node)) {
                all.push(node);
                return;
            }
            for (const list of Object.values(node?.slots ?? {})) for (const child of list) visit(child);
        };
        visit(this.doc.root);
        if (delta < 0) all.reverse();
        return (all.find((node) => !this.lockOf(node.id)) ?? all[0])?.id ?? null;
    }

    isColumnArea(id) {
        const at = locate(this.doc.root, id);
        return Boolean(at?.parent?.type === "layout.columns");
    }

    // ------------------------------------------------------------ history

    snapshot() {
        return {doc: JSON.stringify(this.doc), selected: this.selected, typing: this.typing ? {...this.typing} : null};
    }

    /** Before a change of structure or a parameter: one step back. */
    remember() {
        this.undoStack.push(this.snapshot());
        if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
        this.redoStack = [];
        this.typingUntil = 0;
        this.typingKey = "";
    }

    /** Before typing: one step for a run of typing in one field, not one per letter. */
    rememberTyping(key) {
        const now = this.now();
        if (now > this.typingUntil || key !== this.typingKey) {
            this.undoStack.push(this.snapshot());
            if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
            this.redoStack = [];
        }
        this.typingKey = key;
        this.typingUntil = now + TYPING_PAUSE;
    }

    restore(from, to) {
        const step = from.pop();
        if (!step) return refused("empty");
        to.push(this.snapshot());
        this.typingUntil = 0;
        this.typingKey = "";
        this.doc = JSON.parse(step.doc);
        this.next = idMaker(this.doc.root, "e");
        this.selected = step.selected && this.place(step.selected) ? step.selected : null;
        this.typing = step.typing && this.place(step.typing.id) ? step.typing : null;
        this.changed("history");
        return done();
    }

    undo() {
        return this.restore(this.undoStack, this.redoStack);
    }

    redo() {
        return this.restore(this.redoStack, this.undoStack);
    }

    get canUndo() {
        return this.undoStack.length > 0;
    }

    get canRedo() {
        return this.redoStack.length > 0;
    }

    // ------------------------------------------------------------ text

    /** The inline value of a text field; a site block's part reads the instance's text first. */
    textOf(id, key) {
        const at = String(id).indexOf(":");
        if (at !== -1 && !locate(this.doc.root, id)) {
            const instance = this.place(id)?.node;
            const own = instance?.data?.texts?.[`${String(id).slice(at + 1)}/${key}`];
            if (Array.isArray(own)) return own;
        }
        const node = this.textNode(id);
        const value = node?.data?.[key];
        return Array.isArray(value) ? value : [];
    }

    /** Typing: the field's new inline content. One undo step per run of typing. */
    setText(id, key, content) {
        if (this.lockOf(id)) return refused(this.lockOf(id));
        const value = normalizeInline(content);
        if (same(value, this.textOf(id, key))) return done({same: true});
        this.rememberTyping(`${id}/${key}`);
        this.writeText(id, key, value);
        this.changed("typing");
        return done();
    }

    writeText(id, key, value) {
        const own = locate(this.doc.root, id)?.node;
        if (own) {
            own.data ??= {};
            own.data[key] = value;
            return;
        }
        const at = String(id).indexOf(":");
        const instance = this.place(id).node;
        instance.data ??= {};
        instance.data.texts ??= {};
        instance.data.texts[`${String(id).slice(at + 1)}/${key}`] = value;
    }

    /**
     * Enter in a text block: the words after the caret go to a new block
     * after it (a new item in a list). Enter on an empty last item leaves the
     * list. Returns {ok, id} of the block the caret goes to.
     */
    splitText(id, offset) {
        const at = locate(this.doc.root, id);
        if (!at?.parent || this.lockOf(id)) return refused(this.lockOf(id) ?? "unknown");
        const node = at.node;
        const content = this.textOf(id, "content");
        if (node.type === "content.list-item" && !inlineLength(content) && at.index === at.parent.slots[at.slot].length - 1) {
            const list = locate(this.doc.root, at.parent.id);
            if (!list?.parent) return refused("unknown");
            this.remember();
            removeAt(at.parent, at.slot, at.index);
            const paragraph = {id: this.next(), type: "content.paragraph", data: {content: []}};
            if (!at.parent.slots[at.slot].length) removeAt(list.parent, list.slot, list.index);
            const stay = locate(this.doc.root, at.parent.id);
            if (stay) insertAt(stay.parent, stay.slot, stay.index + 1, paragraph);
            else insertAt(list.parent, list.slot, list.index, paragraph);
            this.typing = {id: paragraph.id, key: "content"};
            this.selected = paragraph.id;
            this.changed("split");
            return done({id: paragraph.id, offset: 0});
        }
        if (!["content.paragraph", "content.heading", "content.list-item"].includes(node.type)) return refused("not-text");
        this.remember();
        const before = sliceInline(content, 0, offset);
        const after = sliceInline(content, offset, inlineLength(content));
        node.data = {...(node.data ?? {}), content: normalizeInline(before)};
        const type = node.type === "content.list-item" ? "content.list-item" : "content.paragraph";
        const fresh = {id: this.next(), type, data: {content: normalizeInline(after)}};
        insertAt(at.parent, at.slot, at.index + 1, fresh);
        this.typing = {id: fresh.id, key: "content"};
        this.selected = fresh.id;
        this.changed("split");
        return done({id: fresh.id, offset: 0});
    }

    /** Backspace at a text block's start: it joins the text block before it. */
    joinBack(id) {
        const at = locate(this.doc.root, id);
        if (!at?.parent || at.index === 0 || this.lockOf(id)) return refused(this.lockOf(id) ?? "first");
        const previous = at.parent.slots[at.slot][at.index - 1];
        const joinable = ["content.paragraph", "content.heading", "content.list-item"];
        if (!joinable.includes(previous.type) || !joinable.includes(at.node.type)) return refused("not-text");
        this.remember();
        const before = this.textOf(previous.id, "content");
        const offset = inlineLength(before);
        previous.data = {...(previous.data ?? {}), content: normalizeInline([...before, ...this.textOf(id, "content")])};
        removeAt(at.parent, at.slot, at.index);
        this.typing = {id: previous.id, key: "content"};
        this.selected = previous.id;
        this.changed("join");
        return done({id: previous.id, offset});
    }

    /**
     * Markdown at the start of a paragraph turns it into a block: `- ` or
     * `* ` a list, `1. ` a numbered list, `#`..`###` a heading, `> ` a quote.
     * One undo returns the paragraph. Returns {ok, id} or {ok: false}.
     */
    markdownShortcut(id) {
        const node = locate(this.doc.root, id)?.node;
        if (node?.type !== "content.paragraph") return refused("not-paragraph");
        const content = this.textOf(id, "content");
        const typed = content.filter((entry) => entry.type === "text").map((entry) => entry.value).join("").replace(/\u00a0/gu, " ");
        const rules = [
            [/^(#{1,3}) /u, (match) => ({type: "content.heading", data: {level: match[1].length}})],
            [/^[-*] /u, () => ({type: "content.list"})],
            [/^1[.)] /u, () => ({type: "content.list", props: {ordered: true}})],
            [/^> /u, () => ({type: "content.quote"})],
        ];
        for (const [pattern, make] of rules) {
            const match = pattern.exec(typed);
            if (!match) continue;
            const rest = sliceInline(content, match[0].length, inlineLength(content));
            const made = make(match);
            const at = locate(this.doc.root, id);
            if (!this.accepts(at.parent.id, at.slot, made.type)) return refused("place");
            this.remember();
            let fresh;
            let caret;
            if (made.type === "content.heading") {
                fresh = {id, type: made.type, data: {level: made.data.level, content: normalizeInline(rest)}};
                caret = fresh.id;
            } else if (made.type === "content.list") {
                const item = {id: this.next(), type: "content.list-item", data: {content: normalizeInline(rest)}};
                fresh = {id, type: made.type, ...(made.props ? {props: made.props} : {}), slots: {items: [item]}};
                caret = item.id;
            } else {
                const line = {id: this.next(), type: "content.paragraph", data: {content: normalizeInline(rest)}};
                fresh = {id, type: made.type, slots: {default: [line]}};
                caret = line.id;
            }
            at.parent.slots[at.slot][at.index] = fresh;
            this.typing = {id: caret, key: "content"};
            this.selected = caret;
            this.changed("convert");
            return done({id: caret, offset: 0});
        }
        return refused("none");
    }

    // ------------------------------------------------------------ places and insert

    /** Whether a slot of a node accepts a type, by its declaration (Part A slotAccepts). */
    accepts(parentId, slot, type) {
        const parent = this.node(parentId);
        if (!parent) return false;
        const manifest = this.manifestOf(parent.type);
        if (!Composition.slotAccepts(this.registry, manifest, slot, type)) return false;
        const max = manifest.slots?.[slot]?.max;
        return !(Number.isInteger(max) && (parent.slots?.[slot]?.length ?? 0) >= max);
    }

    /** The place right after a block: {parent, slot, index}. */
    placeAfter(id) {
        const at = locate(this.doc.root, id);
        return at?.parent ? {parent: at.parent.id, slot: at.slot, index: at.index + 1} : null;
    }

    /** The place at the end of a node's first slot (or the named one). */
    placeInside(id, slot) {
        const node = this.node(id);
        const manifest = node && this.manifestOf(node.type);
        const name = slot ?? Object.keys(manifest?.slots ?? {})[0];
        if (!name) return null;
        return {parent: node.id, slot: name, index: node.slots?.[name]?.length ?? 0};
    }

    /**
     * The default place a new block goes when nothing more is said: after the
     * chosen block if its slot takes it, else inside it, else at the end of
     * the first text area (or the page) that takes it.
     */
    placeFor(type) {
        const candidates = [];
        const chosen = this.selected ? locate(this.doc.root, this.selected) : null;
        if (chosen?.parent) candidates.push(this.placeAfter(chosen.node.id));
        if (chosen) candidates.push(this.placeInside(chosen.node.id));
        walk(this.doc.root, (node) => {
            for (const slot of Object.keys(this.manifestOf(node.type)?.slots ?? {})) candidates.push({parent: node.id, slot, index: node.slots?.[slot]?.length ?? 0});
        });
        return candidates.find((place) => place && this.accepts(place.parent, place.slot, type) && !this.placeLock(place.parent)) ?? null;
    }

    /**
     * A new node from a catalogue choice: {type, variant?}. A variant brings
     * its props, data and children (ids renewed) and is remembered in the
     * node's extension so its values show as the variant's; a site block is
     * an instance (type and version); a type with nothing else gets what it
     * needs to be valid and a place to type.
     */
    make(choice) {
        const manifest = this.manifestOf(choice?.type);
        if (!manifest) return null;
        if (isComposed(manifest)) return Composition.composedInstance(manifest, this.next());
        if (choice.variant) {
            const node = Composition.instantiateVariant(manifest, choice.variant, {id: this.next(), makeId: () => this.next()});
            node.extensions = {...(node.extensions ?? {}), [VARIANT_EXTENSION]: {id: choice.variant}};
            return node;
        }
        return this.blank(choice.type, choice.options);
    }

    /** A node made for a picture or a check only: it takes no id of the page. */
    sample(choice) {
        const keep = this.next;
        let count = 0;
        this.next = () => `sample-${(count += 1)}`;
        try {
            return this.make(choice);
        } finally {
            this.next = keep;
        }
    }

    blank(type, options = {}) {
        const id = this.next();
        const paragraph = (content = []) => ({id: this.next(), type: "content.paragraph", data: {content}});
        switch (type) {
        case "content.paragraph": return {id, type, data: {content: options.content ?? []}};
        case "content.heading": return {id, type, data: {level: options.level ?? 2, content: []}};
        case "content.list": return {id, type, ...(options.ordered ? {props: {ordered: true}} : {}), slots: {items: [{id: this.next(), type: "content.list-item", data: {content: []}}]}};
        case "content.quote":
        case "content.alert":
        case "content.card": return {id, type, slots: {default: [paragraph()]}};
        case "content.details": return {id, type, props: {open: true}, data: {summary: []}, slots: {default: [paragraph()]}};
        case "content.code": return {id, type, data: {code: ""}};
        case "content.table": return {id, type, data: {rows: [[[], []], [[], []]]}};
        case "content.figure": return {id, type, data: {src: "", alt: ""}};
        case "content.media": return {id, type, data: {src: "", alt: ""}, slots: {default: [paragraph()]}};
        case "content.file": return {id, type, data: {href: ""}};
        case "content.steps": return {id, type, slots: {steps: [{id: this.next(), type: "content.step", data: {title: []}, slots: {default: []}}]}};
        case "content.tabs": return {id, type, slots: {tabs: [{id: this.next(), type: "content.tab", data: {label: "1"}, slots: {default: [paragraph()]}}]}};
        case "content.grid": return {id, type, slots: {default: [paragraph(), paragraph()]}};
        case "layout.area": return {id, type, slots: {default: [paragraph()]}};
        case "layout.section": return {id, type, slots: {default: [{id: this.next(), type: "layout.area", slots: {default: [paragraph()]}}]}};
        case "layout.columns": return {id, type, props: {columns: {xs: 1, md: 2}}, slots: {columns: [this.blank("layout.area"), this.blank("layout.area")]}};
        default: {
            const manifest = this.manifestOf(type);
            const node = {id, type};
            for (const [slot, rule] of Object.entries(manifest?.slots ?? {})) {
                if (!Number.isInteger(rule?.min) || rule.min < 1) continue;
                const fits = ["content.paragraph", "layout.area"].find((candidate) => Composition.slotAccepts(this.registry, manifest, slot, candidate));
                if (fits) node.slots = {...(node.slots ?? {}), [slot]: Array.from({length: rule.min}, () => this.blank(fits))};
            }
            return node;
        }
        }
    }

    /** Inserts a node at a place, refusing what the place does not take or the rights do not allow. */
    insertNode(node, place) {
        if (!node || !place) return refused("unknown");
        const lock = this.placeLock(place.parent);
        if (lock) return refused(lock);
        if (!this.accepts(place.parent, place.slot, node.type)) return refused("place");
        this.remember();
        this.next.reserve?.(node);
        insertAt(this.node(place.parent), place.slot, place.index, node);
        this.selected = node.id;
        this.typing = null;
        const typing = this.typingTarget(node);
        if (typing) this.typing = typing;
        this.changed("insert", {id: node.id});
        return done({id: node.id, typing: Boolean(typing)});
    }

    /** Where the caret goes in a new block: its own text, else the first text inside. */
    typingTarget(node) {
        let found = null;
        walk(node, (current) => {
            if (found) return false;
            const fields = textFields(this.manifestOf(current.type));
            if (fields.length && fields[0] === "content" && !isComposed(this.manifestOf(current.type))) found = {id: current.id, key: "content"};
            return !found;
        });
        return found;
    }

    insert(choice, place = null) {
        const where = place ?? this.placeFor(choice?.type);
        if (!where) return refused("place");
        const node = this.make(choice);
        if (!node) return refused("unknown");
        return this.insertNode(node, where);
    }

    /**
     * / in text: the chosen block takes the place of the paragraph the slash
     * was typed in when that holds nothing else; otherwise it goes after it.
     */
    insertFromSlash(choice, paragraphId) {
        const at = locate(this.doc.root, paragraphId);
        if (!at?.parent) return refused("unknown");
        const words = this.textOf(paragraphId, "content").filter((entry) => entry.type === "text").map((entry) => entry.value).join("");
        const only = /^\/\S*$/u.test(words.trim()) || !words.trim();
        if (!only) return this.insert(choice, {parent: at.parent.id, slot: at.slot, index: at.index + 1});
        const node = this.make(choice);
        if (!node) return refused("unknown");
        if (this.placeLock(at.parent.id)) return refused(this.placeLock(at.parent.id));
        if (!this.accepts(at.parent.id, at.slot, node.type) && node.type !== "content.paragraph") return refused("place");
        this.remember();
        at.parent.slots[at.slot][at.index] = node;
        this.selected = node.id;
        this.typing = this.typingTarget(node);
        this.changed("insert", {id: node.id});
        return done({id: node.id, typing: Boolean(this.typing)});
    }

    remove(id) {
        const at = locate(this.doc.root, id);
        if (!at?.parent) return refused("unknown");
        const lock = this.placeLock(at.parent.id) ?? this.lockOf(id);
        if (lock) return refused(lock);
        const min = this.manifestOf(at.parent.type)?.slots?.[at.slot]?.min ?? 0;
        if (at.parent.slots[at.slot].length <= min) return refused("required");
        this.remember();
        removeAt(at.parent, at.slot, at.index);
        if (at.parent.type === "layout.columns") this.syncColumns(at.parent);
        const list = at.parent.slots[at.slot];
        this.selected = (list[Math.min(at.index, list.length - 1)] ?? at.parent).id;
        if (this.selected === this.doc.root.id) this.selected = null;
        this.typing = null;
        this.changed("remove", {id});
        return done({id: this.selected});
    }

    duplicate(id) {
        const at = locate(this.doc.root, id);
        if (!at?.parent) return refused("unknown");
        const lock = this.placeLock(at.parent.id);
        if (lock) return refused(lock);
        if (!this.accepts(at.parent.id, at.slot, at.node.type)) return refused("place");
        const copy = freshCopy(at.node, this.next);
        this.remember();
        insertAt(at.parent, at.slot, at.index + 1, copy);
        if (at.parent.type === "layout.columns") this.syncColumns(at.parent);
        this.selected = copy.id;
        this.typing = null;
        this.changed("duplicate", {id: copy.id});
        return done({id: copy.id});
    }

    /** Moves a block to a place (a drop line); the place is read before the block leaves. */
    move(id, place) {
        const at = locate(this.doc.root, id);
        if (!at?.parent || !place) return refused("unknown");
        const lock = this.placeLock(at.parent.id) ?? this.placeLock(place.parent);
        if (lock) return refused(lock);
        if (locate(at.node, place.parent)) return refused("inside-itself");
        const sameSlot = place.parent === at.parent.id && place.slot === at.slot;
        if (!sameSlot && !this.accepts(place.parent, place.slot, at.node.type)) return refused("place");
        const index = sameSlot && place.index > at.index ? place.index - 1 : place.index;
        if (sameSlot && index === at.index) return refused("same");
        const min = this.manifestOf(at.parent.type)?.slots?.[at.slot]?.min ?? 0;
        if (!sameSlot && at.parent.slots[at.slot].length <= min) return refused("required");
        this.remember();
        removeAt(at.parent, at.slot, at.index);
        insertAt(this.node(place.parent), place.slot, index, at.node);
        for (const parent of [at.parent, this.node(place.parent)]) if (parent?.type === "layout.columns") this.syncColumns(parent);
        this.selected = id;
        this.changed("move", {id});
        return done({id, index});
    }

    /** Alt+↑↓ (and Alt+Shift+↑↓ while typing): one step among the siblings. */
    moveBy(id, delta) {
        const at = locate(this.doc.root, this.place(id)?.node.id);
        if (!at?.parent) return refused("unknown");
        const to = at.index + delta;
        if (to < 0 || to >= at.parent.slots[at.slot].length) return refused("edge");
        const typing = this.typing;
        const moved = this.move(at.node.id, {parent: at.parent.id, slot: at.slot, index: delta > 0 ? to + 1 : to});
        if (moved.ok && typing) this.typing = typing;
        return moved;
    }

    // ------------------------------------------------------------ columns

    /**
     * Splits a block into columns: it goes into the left column (or the
     * right with side 'left' for the other), the other column is empty with a
     * place to type, or holds `other` (a side drop). New columns show one
     * column on the phone (columns {xs: 1, md: 2}). One undo step.
     */
    splitColumns(id, {side = "right", other = null} = {}) {
        const at = locate(this.doc.root, id);
        if (!at?.parent) return refused("unknown");
        const lock = this.placeLock(at.parent.id) ?? (this.rights.layout ? null : "layout");
        if (lock) return refused(lock);
        let target = at;
        let carried = [at.node];
        let rest = null;
        // A block inside a text area: the area is split around it.
        if (!this.accepts(at.parent.id, at.slot, "layout.columns") && at.parent.type === "layout.area") {
            const area = locate(this.doc.root, at.parent.id);
            if (!area?.parent || !this.accepts(area.parent.id, area.slot, "layout.columns")) return refused("place");
            target = area;
            const list = area.node.slots.default;
            rest = {before: list.slice(0, at.index), after: list.slice(at.index + 1)};
            carried = [at.node];
        } else if (!this.accepts(at.parent.id, at.slot, "layout.columns")) return refused("place");
        this.remember();
        const wrap = (node) => (node.type === "layout.area" ? node : {id: this.next(), type: "layout.area", slots: {default: [node]}});
        const own = rest ? {id: this.next(), type: "layout.area", slots: {default: carried}} : wrap(at.node);
        const fresh = other ? wrap(other) : this.blank("layout.area");
        if (other) this.next.reserve?.(other);
        const columns = {id: this.next(), type: "layout.columns", props: {columns: {xs: 1, md: 2}}, slots: {columns: side === "left" ? [fresh, own] : [own, fresh]}};
        const list = target.parent.slots[target.slot];
        if (rest) {
            const replaced = [];
            if (rest.before.length) replaced.push({...target.node, slots: {...target.node.slots, default: rest.before}});
            replaced.push(columns);
            if (rest.after.length) replaced.push({id: this.next(), type: "layout.area", ...(target.node.props ? {props: clone(target.node.props)} : {}), slots: {default: rest.after}});
            list.splice(target.index, 1, ...replaced);
        } else list.splice(target.index, 1, columns);
        this.selected = columns.id;
        this.typing = null;
        this.changed("columns", {id: columns.id});
        return done({id: columns.id});
    }

    /** Adds a column to a columns block, up to four; the phone keeps its own value. */
    addColumn(columnsId, index = null) {
        const node = this.node(columnsId);
        if (node?.type !== "layout.columns") return refused("unknown");
        const lock = this.placeLock(columnsId);
        if (lock) return refused(lock);
        const list = slotList(node, "columns");
        if (list.length >= MAX_COLUMNS) return refused("limit");
        this.remember();
        const area = this.blank("layout.area");
        list.splice(index ?? list.length, 0, area);
        this.syncColumns(node);
        this.selected = area.id;
        this.typing = this.typingTarget(area);
        this.changed("columns", {id: area.id});
        return done({id: area.id});
    }

    /**
     * A side drop: `dragId` stands beside `targetId`. Inside a column it adds
     * a column next to that one (up to four); elsewhere the two are split
     * into two columns.
     */
    dropBeside(dragId, targetId, side = "right") {
        if (dragId === targetId) return refused("same");
        const drag = locate(this.doc.root, dragId);
        const target = locate(this.doc.root, targetId);
        if (!drag?.parent || !target?.parent) return refused("unknown");
        if (locate(drag.node, targetId)) return refused("inside-itself");
        const lock = this.placeLock(drag.parent.id) ?? this.placeLock(target.parent.id) ?? (this.rights.layout ? null : "layout");
        if (lock) return refused(lock);
        const column = target.parent.type === "layout.area" ? locate(this.doc.root, target.parent.id) : null;
        if (column?.parent?.type === "layout.columns") {
            const columns = column.parent;
            if (columns.slots.columns.length >= MAX_COLUMNS) return refused("limit");
            this.remember();
            removeAt(drag.parent, drag.slot, drag.index);
            const area = drag.node.type === "layout.area" ? drag.node : {id: this.next(), type: "layout.area", slots: {default: [drag.node]}};
            const at = columns.slots.columns.findIndex((entry) => entry.id === column.node.id);
            columns.slots.columns.splice(side === "left" ? at : at + 1, 0, area);
            this.syncColumns(columns);
            this.selected = drag.node.id;
            this.changed("columns", {id: columns.id});
            return done({id: columns.id});
        }
        // Split: the dragged block leaves its place first, in the same step.
        const before = this.snapshot();
        const moved = removeAt(drag.parent, drag.slot, drag.index);
        const result = this.splitColumns(targetId, {side, other: moved});
        if (!result.ok) {
            this.doc = JSON.parse(before.doc);
            return result;
        }
        // splitColumns remembered the Document without the dragged block: the step back is to before the drag.
        this.undoStack[this.undoStack.length - 1] = before;
        return result;
    }

    /** Whether a type may stand beside a block in a column of its own (a side drop): a column is a text area. */
    standsBeside(type) {
        if (!type || ["layout.section", "layout.columns"].includes(type)) return false;
        return Composition.slotAccepts(this.registry, this.manifestOf("layout.area"), "default", type);
    }

    /**
     * A new block from the catalogue dropped at a block's side (a library card
     * pulled to its edge): as a side drop, in one step -- inside a column it
     * stands in a new column beside that one (up to four), elsewhere the two
     * are split into two columns. Returns {ok, id} of the new block.
     */
    /**
     * The block a side drop stands beside: the block itself, or, for a block inside
     * another (a paragraph in a quote), the nearest outer block that stands in an
     * area or a place that takes columns. Containers and layout give none.
     */
    besideTarget(id) {
        let at = locate(this.doc.root, id);
        while (at?.parent) {
            if (/^layout\./u.test(at.node.type)) return null;
            if (at.parent.type === "layout.area" || this.accepts(at.parent.id, at.slot, "layout.columns")) return at.node.id;
            at = locate(this.doc.root, at.parent.id);
        }
        return null;
    }

    insertBeside(choice, targetId, side = "right") {
        targetId = this.besideTarget(targetId) ?? targetId;
        const target = locate(this.doc.root, targetId);
        if (!target?.parent) return refused("unknown");
        const lock = this.placeLock(target.parent.id) ?? (this.rights.layout ? null : "layout");
        if (lock) return refused(lock);
        if (!this.standsBeside(choice?.type)) return refused("place");
        const node = this.make(choice);
        if (!node) return refused("unknown");
        const column = target.parent.type === "layout.area" ? locate(this.doc.root, target.parent.id) : null;
        if (column?.parent?.type === "layout.columns") {
            const columns = column.parent;
            if (columns.slots.columns.length >= MAX_COLUMNS) return refused("limit");
            this.remember();
            const area = node.type === "layout.area" ? node : {id: this.next(), type: "layout.area", slots: {default: [node]}};
            const at = columns.slots.columns.findIndex((entry) => entry.id === column.node.id);
            columns.slots.columns.splice(side === "left" ? at : at + 1, 0, area);
            this.syncColumns(columns);
            this.selected = node.id;
            this.typing = this.typingTarget(node);
            this.changed("columns", {id: columns.id});
            return done({id: node.id, typing: Boolean(this.typing)});
        }
        const result = this.splitColumns(targetId, {side, other: node});
        if (!result.ok) return result;
        this.selected = node.id;
        this.typing = this.typingTarget(node);
        return done({id: node.id, columns: result.id, typing: Boolean(this.typing)});
    }

    /** The columns parameter follows the number of columns; the phone keeps its own value. */
    syncColumns(node) {
        const count = node.slots?.columns?.length ?? 0;
        if (!count) return;
        node.props ??= {};
        const current = node.props.columns;
        if (isBreakpointValue(current)) {
            const wider = Object.keys(current).filter((key) => key !== "xs");
            if (wider.length) for (const key of wider) current[key] = count;
            else current.md = count;
            if (count === 1) node.props.columns = 1;
        } else node.props.columns = count === 1 ? 1 : {xs: 1, md: count};
    }

    // ------------------------------------------------------------ parameters

    /** The editor manifest of a node's type: a host's for the type, else the Framework's; with its parameter sets. */
    editorManifest(type) {
        const manifest = this.manifestOf(type);
        if (!manifest) return null;
        const identity = (entry) => entry?.type === manifest.type && entry?.type_version === manifest.version;
        let editor = this.editorManifests.find(identity) ?? BUILTIN_EDITOR_MANIFESTS.find(identity);
        if (!editor && Array.isArray(manifest.parameter_sets) && manifest.parameter_sets.length) {
            editor = {schema: "simai.composition.editor-manifest", schema_version: 1, type: manifest.type, type_version: manifest.version, fields: []};
        }
        return editor ? Composition.withParameterSetFields(editor, BUILTIN_TYPE_MANIFESTS.find(identity) ?? manifest) : null;
    }

    variantOf(node) {
        const id = node?.extensions?.[VARIANT_EXTENSION]?.id;
        return id ? (this.manifestOf(node.type)?.variants ?? []).find((variant) => variant.id === id) ?? null : null;
    }

    themeValue(type, key) {
        const defaults = this.theme?.defaults;
        if (!isPlainObject(defaults)) return undefined;
        if (isPlainObject(defaults[type]) && Object.hasOwn(defaults[type], key)) return defaults[type][key];
        if (isPlainObject(defaults["*"]) && Object.hasOwn(defaults["*"], key)) return defaults["*"][key];
        return undefined;
    }

    /**
     * The fields of a node's parameter form, at a screen (xs, md or lg): each
     * with its kind, value there, where the value comes from (type, theme,
     * variant, block, screen), the inherited value a reset returns to, and the
     * screens whose value differs. A site block's form is its exposed list.
     */
    fields(id, screen = "xs") {
        const node = this.node(id);
        const manifest = node && this.manifestOf(node.type);
        if (!manifest) return [];
        let projected;
        let editor;
        if (isComposed(manifest)) {
            const form = Composition.composedEditorFields(manifest, node, {registry: this.registry, editorManifests: this.editorManifests});
            projected = form.fields;
            editor = form.manifest;
        } else {
            editor = this.editorManifest(node.type);
            if (!editor) return [];
            projected = Composition.projectEditorFields(editor, manifest, node).fields;
        }
        const properties = manifest.props_schema?.properties ?? {};
        return projected.filter((field) => field.visibility !== "hidden" && (field.plane === "props" || field.plane === "data"))
            .filter((field) => !(field.plane === "data" && ["content", "summary", "title", "caption"].includes(field.target)))
            .map((field) => this.describeField(node, manifest, field, properties[field.target], screen));
    }

    describeField(node, manifest, field, schema, screen) {
        const kind = Array.isArray(field.choices) ? "choice" : field.property?.type === "boolean" ? "toggle" : field.property?.type === "integer" ? "integer" : "text";
        const responsive = field.plane === "props" && isResponsive(schema);
        // What the type draws without a value is its schema's default; the
        // editor field's default is only what the form offers first.
        // Since core.runtime 1.26.0 a type may print values unset
        // (parameter_defaults): that is the type's value here, per screen.
        const defaults = field.plane === "props" && isPlainObject(manifest?.parameter_defaults) ? manifest.parameter_defaults : {};
        const typeDefault = Object.hasOwn(defaults, field.target) ? atScreen(defaults[field.target], schema, responsive, screen) : schema && "default" in schema ? schema.default : undefined;
        const themed = field.plane === "props" ? this.themeValue(node.type, field.target) : undefined;
        const theme = themed === undefined ? undefined : atScreen(themed, schema, responsive, screen);
        const variant = this.variantOf(node);
        const variantValue = field.plane === "props" ? variant?.props?.[field.target] : variant?.data?.[field.target];
        const plane = node[field.plane];
        const own = isPlainObject(plane) && Object.hasOwn(plane, field.target) ? plane[field.target] : undefined;
        // What a reset returns to follows the origin chain the dot shows: a
        // block made from a variant goes back to the variant's value, then to
        // the theme's, then to the type's (1.2.0, the ui-editor host's G-21).
        const variantAt = variantValue === undefined ? undefined : atScreen(variantValue, schema, responsive, screen);
        const above = theme !== undefined ? theme : typeDefault;
        // `inherited` is what writing leaves unwritten (the theme's or the
        // type's); `resetTo` is what the reset shows it returns to.
        const inherited = above;
        const resetTo = own !== undefined && variantValue !== undefined && !same(own, variantValue) && variantAt !== undefined ? variantAt : above;
        let value = above !== undefined ? above : field.default;
        let origin = theme !== undefined ? "theme" : "type";
        if (own !== undefined) {
            if (responsive && isBreakpointValue(own)) {
                const order = UTILITY_BREAKPOINTS.slice(0, UTILITY_BREAKPOINTS.indexOf(screen) + 1);
                const decided = [...order].reverse().find((key) => key in own);
                if (decided) {
                    value = own[decided];
                    // The phone's value is the block's own unless other screens differ
                    // from it: then, seen on the phone, it is the phone's.
                    origin = decided !== "xs" || (screen === "xs" && Object.keys(own).length > 1) ? "screen" : "block";
                }
            } else {
                value = own;
                origin = "block";
            }
            if (variantValue !== undefined && same(own, variantValue)) origin = "variant";
        }
        const screens = responsive && isBreakpointValue(own) ? Object.keys(own).filter((key) => key !== "xs") : [];
        return {
            key: field.key,
            target: field.target,
            plane: field.plane,
            kind,
            responsive,
            label_key: field.label_key,
            help_key: field.help_key,
            ...(Array.isArray(field.choices) ? {choices: field.choices} : {}),
            ...(kind === "integer" ? {min: field.constraints?.min ?? schema?.minimum ?? 0, max: field.constraints?.max ?? schema?.maximum ?? 100} : {}),
            value: value ?? null,
            origin,
            inherited: inherited ?? null,
            resetTo: resetTo ?? null,
            set: own !== undefined,
            screens,
            utility: describeUtility(schema),
            section: fieldSection(field, schema),
        };
    }

    /**
     * Sets a parameter at a screen. A responsive value is written per
     * breakpoint, and only where it changes (mobile first); a value equal to
     * what it inherits is not written at all.
     */
    setParam(id, key, value, screen = "xs") {
        const node = this.node(id);
        if (!node) return refused("unknown");
        const lock = this.lockOf(node.id);
        if (lock) return refused(lock);
        const field = this.fields(node.id, screen).find((entry) => entry.key === key);
        if (!field) return refused("unknown");
        const coerced = coerce(field, value);
        if (coerced === null) return refused("invalid");
        const before = JSON.stringify(node);
        const next = clone(node);
        writeField(next, field, coerced.value, screen);
        if (JSON.stringify(next) === before) return done({same: true});
        this.remember();
        Object.assign(node, next);
        for (const plane of ["props", "data"]) if (!(plane in next)) delete node[plane];
        this.changed("parameter", {id: node.id, key});
        return done();
    }

    /**
     * «Reset to inherited», one step along the origin chain the dot shows: a
     * value set here on a block made from a variant goes back to the
     * variant's value (this screen's, when it differs by screen); the
     * variant's value, or one set on a block with no variant, is taken out,
     * so the theme's or the type's stands. The value of this screen (or the
     * block's own on the phone) is what is reset.
     */
    resetParam(id, key, screen = "xs") {
        const node = this.node(id);
        if (!node) return refused("unknown");
        const lock = this.lockOf(node.id);
        if (lock) return refused(lock);
        const field = this.fields(node.id, screen).find((entry) => entry.key === key);
        if (!field || !field.set) return refused("unknown");
        this.remember();
        const plane = node[field.plane];
        const own = plane[field.target];
        const variant = this.variantOf(node);
        const variantValue = field.plane === "props" ? variant?.props?.[field.target] : variant?.data?.[field.target];
        if (variantValue !== undefined && !same(own, variantValue)) {
            if (field.responsive && isBreakpointValue(own) && screen !== "xs") {
                // This screen goes back to the variant's value there.
                const wanted = isBreakpointValue(variantValue) ? variantValue[screen] : undefined;
                if (wanted === undefined) delete own[screen];
                else own[screen] = clone(wanted);
                if (same(own, variantValue) || (isBreakpointValue(variantValue) === false && Object.keys(own).length === 1 && same(own.xs, variantValue))) plane[field.target] = clone(variantValue);
            } else plane[field.target] = clone(variantValue);
            this.changed("parameter", {id: node.id, key});
            return done();
        }
        if (field.responsive && isBreakpointValue(own) && screen !== "xs") {
            delete own[screen];
            const left = Object.keys(own);
            if (!left.length) delete plane[field.target];
            else if (left.length === 1 && left[0] === "xs") plane[field.target] = own.xs;
        } else if (field.responsive && isBreakpointValue(own)) {
            delete own.xs;
            if (!Object.keys(own).length) delete plane[field.target];
        } else delete plane[field.target];
        if (!Object.keys(plane).length) delete node[field.plane];
        this.changed("parameter", {id: node.id, key});
        return done();
    }

    /** The block's own modifiers (the «Extra» field): Framework classes with a screen prefix. */
    modifiersOf(id) {
        const list = this.node(id)?.extensions?.[MODIFIERS_EXTENSION]?.utilities;
        return Array.isArray(list) ? [...list] : [];
    }

    setModifiers(id, classes, rules) {
        const node = this.node(id);
        if (!node) return refused("unknown");
        const lock = this.lockOf(node.id);
        if (lock) return refused(lock);
        // A site block's instance takes only its exposed parameters (G-42).
        if (isComposed(this.manifestOf(node.type))) return refused("closed");
        const list = [...new Set((Array.isArray(classes) ? classes : String(classes ?? "").split(/\s+/u)).map((value) => String(value).trim()).filter(Boolean))];
        const checked = Composition.checkModifiers(list, rules ? {rules} : {});
        if (same(list, this.modifiersOf(id))) return done({dropped: checked.dropped});
        this.remember();
        if (list.length) node.extensions = {...(node.extensions ?? {}), [MODIFIERS_EXTENSION]: {utilities: list}};
        else if (node.extensions) {
            delete node.extensions[MODIFIERS_EXTENSION];
            if (!Object.keys(node.extensions).length) delete node.extensions;
        }
        this.changed("modifiers", {id: node.id});
        return done({dropped: checked.dropped});
    }

    // ------------------------------------------------------------ data

    /** The data a block takes: its host bindings and runtime states, with what is set. */
    dataOf(id) {
        const node = this.node(id);
        const manifest = node && this.manifestOf(node.type);
        if (!manifest) return {bindings: [], runtime: []};
        const bindings = Object.entries(manifest.data_bindings ?? {}).map(([target, entry]) => {
            const binding = (node.bindings ?? []).find((item) => item.target === target && item.owner !== "section") ?? null;
            const settings = Composition.bindingSettings(node, target) ?? {};
            return {target, shapes: entry.shapes, shape: settings.shape ?? entry.shapes[0], empty_key: entry.empty_key, binding, settings};
        });
        const runtime = Object.entries(manifest.runtime?.accepts ?? {}).map(([target, entry]) => {
            const binding = (node.bindings ?? []).find((item) => item.target === target && item.owner === "section") ?? null;
            return {target, shape: entry.shape, binding, publishers: this.publishers(node.id, entry.shape)};
        });
        return {bindings, runtime, publishes: Object.keys(manifest.runtime?.publishes ?? {})};
    }

    /** The blocks of the same section that publish a state of a shape: [{id, type, state}]. */
    publishers(id, shape) {
        const at = locate(this.doc.root, id);
        if (!at) return [];
        const section = [...at.ancestors].reverse().find((node) => node.type === "layout.section") ?? this.doc.root;
        const out = [];
        walk(section, (node) => {
            if (node.id === id) return;
            for (const [state, entry] of Object.entries(this.manifestOf(node.type)?.runtime?.publishes ?? {})) {
                if (entry.shape === shape) out.push({id: node.id, type: node.type, state});
            }
        });
        return out;
    }

    /** Binds a target to a host source (ref), or takes the binding away (ref empty). */
    setSource(id, target, ref, {owner = "host", revision} = {}) {
        const node = this.node(id);
        if (!node) return refused("unknown");
        if (this.lockOf(id)) return refused(this.lockOf(id));
        if (!this.manifestOf(node.type)?.data_bindings?.[target]) return refused("unknown");
        this.remember();
        const others = (node.bindings ?? []).filter((item) => !(item.target === target && item.owner !== "section"));
        node.bindings = ref ? [...others, {owner, ref: String(ref), target, ...(revision ? {revision: String(revision)} : {})}] : others;
        if (!node.bindings.length) delete node.bindings;
        if (!ref) this.writeSettings(node, target, null);
        this.changed("data", {id, target});
        return done();
    }

    /** Changes what the host needs beside a binding: shape, preset, mapping, filter, sort, limit, page_param, params, empty_text. */
    setSettings(id, target, patch) {
        const node = this.node(id);
        if (!node) return refused("unknown");
        if (this.lockOf(id)) return refused(this.lockOf(id));
        if (!this.manifestOf(node.type)?.data_bindings?.[target]) return refused("unknown");
        const current = Composition.bindingSettings(node, target) ?? {};
        const next = {...current};
        for (const [key, value] of Object.entries(patch ?? {})) {
            if (value === undefined || value === null || value === "" || (isPlainObject(value) && !Object.keys(value).length)) delete next[key];
            else next[key] = value;
        }
        if (same(next, current)) return done({same: true});
        this.remember();
        this.writeSettings(node, target, next);
        this.changed("data", {id, target});
        return done();
    }

    writeSettings(node, target, settings) {
        const entry = {...(node.extensions?.[DATA_EXTENSION] ?? {})};
        if (settings && Object.keys(settings).length) entry[target] = settings;
        else delete entry[target];
        if (Object.keys(entry).length) node.extensions = {...(node.extensions ?? {}), [DATA_EXTENSION]: entry};
        else if (node.extensions) {
            delete node.extensions[DATA_EXTENSION];
            if (!Object.keys(node.extensions).length) delete node.extensions;
        }
    }

    /** A runtime link: the target follows a state another block of the section publishes (empty: no link). */
    setRuntime(id, target, publisherId, state) {
        const node = this.node(id);
        if (!node) return refused("unknown");
        if (this.lockOf(id)) return refused(this.lockOf(id));
        const accepts = this.manifestOf(node.type)?.runtime?.accepts?.[target];
        if (!accepts) return refused("unknown");
        if (publisherId && !this.publishers(id, accepts.shape).some((entry) => entry.id === publisherId && entry.state === state)) return refused("publisher");
        this.remember();
        const others = (node.bindings ?? []).filter((item) => !(item.target === target && item.owner === "section"));
        node.bindings = publisherId ? [...others, {owner: "section", ref: `${publisherId}#${state}`, target}] : others;
        if (!node.bindings.length) delete node.bindings;
        this.changed("data", {id, target});
        return done();
    }

    // ------------------------------------------------------------ site blocks

    /**
     * The block builder: a tree to compose (a copy of a block, an existing
     * site block's tree, or a new section), the parameters exposed to the
     * author, a name and a catalogue group. Returns a builder session the
     * element edits with a model of its own over the tree.
     */
    startBuilder({from = null, type = null} = {}) {
        if (!this.rights.builder) return refused("rights");
        if (type) {
            const manifest = this.manifestOf(type);
            if (!isComposed(manifest)) return refused("unknown");
            return done({builder: {
                type: manifest.type, version: manifest.version, editing: true,
                catalogue: clone(manifest.catalogue ?? {group: "marketing"}),
                root: clone(manifest.composed.root), exposed: clone(manifest.exposed ?? []),
                profiles: manifest.profiles, category: manifest.category,
            }});
        }
        const source = from ? this.node(from) : null;
        const root = source ? clone(source) : this.blank("layout.section");
        if (source && isComposed(this.manifestOf(source.type))) return this.startBuilder({type: source.type});
        return done({builder: {type: "", version: "1.0.0", editing: false, from: source?.id ?? null, catalogue: {group: "marketing"}, root, exposed: [], profiles: ["ui-layout"], category: "layout"}});
    }

    /**
     * Saves a builder session as a site block: defineComposedType makes the
     * type; a block it was made from becomes an instance; a changed site
     * block gets the next minor version and every instance in this Document
     * is moved to it (upgradeComposed), the author's texts and values kept.
     * Returns {ok, manifest, changes} or {ok: false, diagnostics}.
     */
    saveBuilder(builder, {name = "", locale = "en"} = {}) {
        if (!this.rights.builder) return refused("rights");
        const slug = String(builder.type || `site.${slugify(name) || "block"}`);
        let version = builder.version ?? "1.0.0";
        if (builder.editing) {
            const current = this.manifestOf(slug);
            const [major, minor] = (current?.version ?? version).split(".").map(Number);
            version = `${major}.${minor + 1}.0`;
        } else if (this.manifestOf(slug)) return {ok: false, reason: "taken", diagnostics: [{code: "composed_type_taken", path: "$.type", message: `${slug} is taken`}]};
        const labelKey = `${slug}.name`;
        const definition = {
            type: slug, version, profiles: builder.profiles ?? ["ui-layout"], category: builder.category ?? "layout",
            catalogue: {...(builder.catalogue ?? {}), group: builder.catalogue?.group ?? "marketing", label_key: builder.catalogue?.label_key ?? labelKey},
            root: builder.root, exposed: builder.exposed ?? [],
        };
        const made = Composition.defineComposedType(definition, this.registry);
        if (!made.manifest) return {ok: false, reason: "invalid", diagnostics: made.diagnostics};
        const words = name ? {[locale]: {[definition.catalogue.label_key]: name}} : {};
        this.remember();
        this.siteBlocks = [...this.siteBlocks.filter((entry) => !(entry.type === slug && entry.version === version)), made.manifest];
        this.buildRegistry();
        let changes = [];
        if (builder.editing) {
            const upgraded = Composition.upgradeComposed(this.doc, this.registry);
            this.doc = upgraded.document;
            changes = upgraded.changes;
        } else if (builder.from) {
            const at = locate(this.doc.root, builder.from);
            if (at?.parent && this.accepts(at.parent.id, at.slot, slug)) {
                const instance = Composition.composedInstance(made.manifest, this.next());
                at.parent.slots[at.slot][at.index] = instance;
                this.selected = instance.id;
            }
        }
        this.typing = null;
        this.changed("site-block", {type: slug, version});
        return {ok: true, manifest: made.manifest, words, changes};
    }

    /** The parameters a builder may expose: every field of every block of the tree, {path, target, key, label_key}. */
    exposable(builder) {
        const model = new EditorModel({document: {...DOCUMENT, id: "builder", profile: "ui-layout", root: builder.root}, types: this.types, siteBlocks: this.siteBlocks, renderers: this.renderers, editorManifests: this.editorManifests});
        const out = [];
        walk(builder.root, (node) => {
            for (const field of model.fields(node.id)) {
                if (field.plane !== "props" && field.kind === "text") continue;
                out.push({path: node.id, target: `${field.plane}.${field.target}`, key: field.target, label_key: field.label_key, type: node.type});
            }
        });
        return out;
    }

    // ------------------------------------------------------------ output

    toJSON() {
        return clone(this.doc);
    }

    /**
     * The Document as the canvas draws it at a screen: each responsive value
     * flattened to that screen's (so the canvas shows the screen whatever the
     * window is), the theme's defaults where the block sets nothing, and a
     * block hidden on that screen drawn faded instead of left out.
     */
    canvasDocument(screen = "lg") {
        const doc = clone(this.doc);
        const hidden = new Set();
        walk(doc.root, (node) => {
            const manifest = this.manifestOf(node.type);
            const properties = manifest?.props_schema?.properties ?? {};
            const defaults = isPlainObject(manifest?.parameter_defaults) ? manifest.parameter_defaults : {};
            for (const [key, schema] of Object.entries(properties)) {
                const theme = this.themeValue(node.type, key);
                const has = isPlainObject(node.props) && Object.hasOwn(node.props, key);
                // What the type prints unset (parameter_defaults) is drawn too:
                // flattened to this screen, as the block's own value is.
                const raw = has ? node.props[key] : theme !== undefined ? theme : defaults[key];
                if (raw === undefined) continue;
                const value = isResponsive(schema) && isBreakpointValue(raw) ? valuesByBreakpoint(raw, schema)[screen] : raw;
                node.props ??= {};
                if (value === undefined) delete node.props[key];
                else node.props[key] = value;
            }
            if (node.props?.hidden === true) {
                hidden.add(node.id);
                delete node.props.hidden;
            }
            if (node.props && !Object.keys(node.props).length) delete node.props;
        });
        return {document: doc, hidden};
    }

    /** The Document with the theme's defaults where blocks set nothing: what the site prints. */
    themedDocument() {
        const doc = clone(this.doc);
        if (!this.theme?.defaults) return doc;
        walk(doc.root, (node) => {
            for (const key of Object.keys(this.manifestOf(node.type)?.props_schema?.properties ?? {})) {
                const theme = this.themeValue(node.type, key);
                if (theme === undefined || (isPlainObject(node.props) && Object.hasOwn(node.props, key))) continue;
                node.props = {...(node.props ?? {}), [key]: clone(theme)};
            }
        });
        return doc;
    }

    /** The HTML a site prints: SIMAI Framework utilities, mobile first; unknown own modifiers left out. */
    async toHTML({resolveBinding, utilityRules} = {}) {
        const result = await Composition.render(this.themedDocument(), {
            registry: this.registry,
            ...(resolveBinding ? {resolveBinding} : {}),
            options: utilityRules ? {utilityRules} : {},
        });
        return {html: result.html, diagnostics: result.diagnostics, notices: result.notices ?? [], assets: result.assets};
    }

    /** Markdown for the text areas: [{id, markdown}], one per area (the page's text when it has none). */
    toMarkdown() {
        const areas = [];
        walk(this.doc.root, (node) => {
            if (node.type === "layout.area" || node.type === "content.document") {
                areas.push({id: node.id, markdown: blocksToMarkdown(node.slots?.default ?? [], this)});
                return false;
            }
            return true;
        });
        return areas;
    }

    validate() {
        return Composition.validate(this.doc, this.registry);
    }
}

// ------------------------------------------------------------ helpers

export function compareVersions(left = "0.0.0", right = "0.0.0") {
    const a = String(left).split(".").map(Number);
    const b = String(right).split(".").map(Number);
    for (let index = 0; index < 3; index += 1) if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) < (b[index] ?? 0) ? -1 : 1;
    return 0;
}

export function slugify(value) {
    return String(value ?? "").toLowerCase().normalize("NFKD")
        .replace(/[а-яё]/gu, (letter) => TRANSLIT[letter] ?? "")
        .replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 40);
}

const TRANSLIT = {а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"};

/**
 * The registry the canvas draws with. The canvas shows one screen in a
 * window of another width, so each block's values are flattened to that
 * screen (canvasDocument) and must print whatever they are: a responsive
 * utility parameter has no default here, so the phone's one column of a
 * split prints grid-col-1 even in a wide window. What a site prints (the
 * output) uses the Framework's registry as it is: since core.runtime 1.26.0
 * it prints the phone's value once a wider screen differs (G-36).
 */
function canvasRegistry(registry) {
    const types = new Map();
    for (const [type, manifest] of registry.types) {
        const properties = manifest?.props_schema?.properties;
        const keys = isPlainObject(properties) ? Object.keys(properties).filter((key) => isResponsive(properties[key]) && isPlainObject(properties[key]) && "default" in properties[key]) : [];
        if (!keys.length) {
            types.set(type, manifest);
            continue;
        }
        const own = {...properties};
        for (const key of keys) {
            const {default: _default, ...rest} = own[key];
            own[key] = rest;
        }
        types.set(type, {...manifest, props_schema: {...manifest.props_schema, properties: own}});
    }
    return {...registry, types};
}

/**
 * The heading a field stands under in the panel: content (what the block
 * says and is), layout (the Framework's layout utilities: width, space,
 * grid, alignment, background) or extra (visibility per screen and what
 * the editor manifest marks advanced).
 */
export function fieldSection(field, schema) {
    const set = /^sf\.composition\.set_([a-z_]+)\./u.exec(String(field.label_key ?? ""))?.[1];
    if (set === "visibility" || field.target === "hidden") return "extra";
    // A block's own content (its data: a heading's level) stays under Content
    // even when its manifest files it as advanced; advanced props go to More.
    if (field.plane === "data") return "content";
    if (field.group === "advanced") return "extra";
    if (field.plane === "props" && (set || schema?.["x-simai-utility"])) return "layout";
    return "content";
}

/** A value at a screen: a responsive value per breakpoint gives that screen's, anything else itself. */
function atScreen(value, schema, responsive, screen) {
    return responsive && isBreakpointValue(value) ? valuesByBreakpoint(value, schema)[screen] : value;
}

/** What a parameter is bound to in the Framework, for the line under its control: the utility it prints. */
function describeUtility(schema) {
    const declaration = Array.isArray(schema?.["x-simai-utility"]) ? schema["x-simai-utility"][0] : schema?.["x-simai-utility"];
    if (!isPlainObject(declaration)) return null;
    if (typeof declaration.class === "string") return declaration.class.replace("{value}", "*");
    if (isPlainObject(declaration.values)) return Object.values(declaration.values).filter(Boolean).join(" · ");
    return null;
}

/** A value as a field takes it: {value}, {value: undefined} for empty, or null when it cannot be one. */
export function coerce(field, value) {
    if (value === undefined || value === null || value === "") return {value: undefined};
    if (field.kind === "toggle") return {value: value === true || value === "true"};
    if (field.kind === "integer") {
        const number = Number(value);
        if (!Number.isInteger(number)) return null;
        return {value: Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, number))};
    }
    if (field.kind === "choice") {
        const found = field.choices.find((choice) => String(choice) === String(value));
        return found === undefined ? null : {value: found};
    }
    return {value: String(value)};
}

/** The value a breakpoint map gives at a breakpoint, mobile first; `inherited` below its first key. */
function valueAt(values, breakpoint, inherited) {
    const order = UTILITY_BREAKPOINTS.slice(0, UTILITY_BREAKPOINTS.indexOf(breakpoint) + 1);
    const decided = [...order].reverse().find((key) => key in values);
    return decided ? values[decided] : inherited;
}

/**
 * Writes a field's value into a node, at a screen, keeping only what differs
 * from what it inherits. A responsive value set for one screen is that
 * screen's only: the next wider screen the editor shows keeps what it showed,
 * and the narrowest value is stored whatever the type's default while a wider
 * screen differs from it (columns {xs: 2} set to 1 on the phone become
 * {xs: 1, md: 2}, not nothing).
 */
function writeField(node, field, value, screen) {
    const planeName = field.plane;
    node[planeName] ??= {};
    const plane = node[planeName];
    const inherited = field.inherited ?? undefined;
    if (!field.responsive) {
        if (value === undefined || (planeName === "props" && same(value, inherited))) delete plane[field.target];
        else plane[field.target] = value;
    } else {
        const current = plane[field.target];
        const before = isBreakpointValue(current) ? {...current} : current !== undefined ? {xs: current} : {};
        const values = {...before};
        const wider = EDITOR_BREAKPOINTS[EDITOR_BREAKPOINTS.indexOf(screen) + 1];
        if (wider && !(wider in values)) {
            const kept = valueAt(before, wider, inherited);
            if (kept !== undefined) values[wider] = kept;
        }
        if (value === undefined) delete values[screen];
        else values[screen] = value;
        // Mobile first: a wider value is kept only where it changes from the narrower one.
        let carried;
        let first = true;
        for (const breakpoint of UTILITY_BREAKPOINTS) {
            if (!(breakpoint in values)) continue;
            if (!first && same(values[breakpoint], carried)) delete values[breakpoint];
            else carried = values[breakpoint];
            first = false;
        }
        const keys = Object.keys(values);
        if (!keys.length || (keys.length === 1 && same(values[keys[0]], inherited))) delete plane[field.target];
        else if (keys.length === 1 && keys[0] === "xs") plane[field.target] = values.xs;
        else plane[field.target] = values;
    }
    if (!Object.keys(plane).length) delete node[planeName];
}

/** Why each class of the «Extra classes» was not taken, by reason: [{reason, classes}], each class by its name. */
export function refusedClasses(dropped) {
    const groups = new Map();
    for (const entry of Array.isArray(dropped) ? dropped : []) {
        const name = typeof entry === "string" ? entry : String(entry?.class ?? "");
        if (!name) continue;
        const reason = typeof entry === "string" ? "modifier_unknown" : String(entry?.reason ?? "modifier_unknown");
        groups.set(reason, [...(groups.get(reason) ?? []), name]);
    }
    return [...groups].map(([reason, classes]) => ({reason, classes}));
}

// ------------------------------------------------------------ Markdown

const escapeMarkdown = (value) => String(value).replace(/([\\`*_[\]<>])/gu, "\\$1");

export function inlineToMarkdown(content) {
    return (Array.isArray(content) ? content : []).map((entry) => {
        if (entry?.type === "text") {
            let value = (entry.marks ?? []).includes("code") ? `\`${String(entry.value).replace(/`/gu, "\\`")}\`` : escapeMarkdown(entry.value);
            if ((entry.marks ?? []).includes("em")) value = `*${value}*`;
            if ((entry.marks ?? []).includes("strong")) value = `**${value}**`;
            return value;
        }
        if (entry?.type === "link") return `[${inlineToMarkdown(entry.children)}](${String(entry.href).replace(/[()\s]/gu, encodeURIComponent)})`;
        if (entry?.type === "component") return escapeMarkdown(entry.props?.text ?? entry.props?.label ?? "");
        return "";
    }).join("");
}

function blocksToMarkdown(nodes, model, depth = 0) {
    return nodes.map((node) => blockToMarkdown(node, model, depth)).filter((value) => value !== "").join("\n\n");
}

function blockToMarkdown(node, model, depth) {
    const indent = "  ".repeat(depth);
    const words = (key = "content") => inlineToMarkdown(node.data?.[key]);
    const inner = (slot = "default") => blocksToMarkdown(node.slots?.[slot] ?? [], model, depth);
    switch (node.type) {
    case "content.paragraph": return words();
    case "content.heading": return `${"#".repeat(Math.min(6, Math.max(1, node.data?.level ?? 2)))} ${words()}`;
    case "content.list": {
        const start = node.props?.ordered ? (node.props?.start ?? 1) : null;
        return (node.slots?.items ?? []).map((item, index) => {
            const mark = start === null ? "-" : `${start + index}.`;
            const nested = item.slots?.default?.length ? `\n${blocksToMarkdown(item.slots.default, model, depth + 1).split("\n").map((line) => `${indent}  ${line}`).join("\n")}` : "";
            return `${indent}${mark} ${inlineToMarkdown(item.data?.content)}${nested}`;
        }).join("\n");
    }
    case "content.quote": return inner().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
    case "content.alert": {
        const title = node.data?.title ? `**${inlineToMarkdown(node.data.title)}**\n` : "";
        return `${title}${inner()}`.split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
    }
    case "content.code": return `\`\`\`${node.props?.lang ?? ""}\n${node.data?.code ?? ""}\n\`\`\``;
    case "content.divider": return "---";
    case "content.figure": {
        const picture = node.data?.src ? `![${escapeMarkdown(node.data?.alt ?? "")}](${node.data.src})` : "";
        const caption = node.data?.caption ? `\n*${inlineToMarkdown(node.data.caption)}*` : "";
        return `${picture}${caption}`;
    }
    case "content.file": return node.data?.href ? `[${escapeMarkdown(node.data?.label ?? node.data.href)}](${node.data.href})` : "";
    case "content.table": {
        const rows = Array.isArray(node.data?.rows) ? node.data.rows : [];
        if (!rows.length) return "";
        const line = (row) => `| ${row.map((cell) => inlineToMarkdown(cell).replace(/\|/gu, "\\|")).join(" | ")} |`;
        return [line(rows[0]), `| ${rows[0].map(() => "---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
    }
    case "content.details": return `**${inlineToMarkdown(node.data?.summary)}**\n\n${inner()}`;
    case "content.math": return `$$\n${node.data?.source ?? ""}\n$$`;
    default: {
        const children = childrenOf(node).map((child) => child.node);
        return children.length ? blocksToMarkdown(children, model, depth) : "";
    }
    }
}

export {text};
