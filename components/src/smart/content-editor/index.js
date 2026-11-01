// sf-content-editor: the content mode of the SIMAI page editor -- a page typed
// as one flow, in the manner the owner accepted in ui-editor's
// prototypes/content-editor.html. Enter makes the next block and Backspace at a
// block's start joins it to the one before; Markdown at the start of a line
// changes its kind; / in an empty line and the + of the gutter offer a kind;
// the grip moves a block or opens its menu; a selection gets the bar of
// sf-inline-editor (bold, italic, code, link); Esc selects the block and the
// arrows go between blocks; a paste is read through the html@1 subset; a
// table goes cell by cell with Tab. A block's parameters are a form built
// from its type's composition-editor-manifest, opened from a quiet button on
// the block and from the grip menu, and a parameter equal to its default is
// not written.
//
// It holds a Composition Document of the profile structured-content
// (ui-source docs/developer/composition-content-types.md) and saves nothing:
// every change is a `change` event carrying the new Document, and the host
// stores it. A node the editor does not know is shown, kept byte for byte and
// only moved or removed whole.
//
// Written for ui-editor by the owner's decision of 2026-11-01 (content
// standard, sections 6, 7 and 9): the editor belongs to ui-pro, its parts to
// the free Framework. From its component.json (standard simai.smart-component
// 1.4 §3, §4, §8, §11): the settings are made by core/js/element-manifest.js,
// its words are lang/<locale>.json, and the actions answer outcomes.
import {html, render} from "lit";
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {BUILTIN_EDITOR_MANIFESTS, BUILTIN_TYPE_MANIFESTS} from "../../core/js/composition/builtins.mjs";
import {textOffset} from "../../core/js/composition/inline-editor.mjs";
import {inlineLength, inlineText, normalizeInline} from "../../core/js/composition/inline-model.mjs";
import {CATALOG, DEFAULT_KINDS, SHORTCUTS, TURN_INTO, entryOf, kindOf} from "./js/catalog.js";
import {CONVERTIBLE, FIELDS, FLOWS, ITEMS, TEXT_BLOCKS, blank, cloneFresh, convert, idMaker, inlineOf, insertAt, isFlow, join, locate, moveWithin, paramValue, removeNode, replaceNode, setCell, setInline, setParam, setPlain, split} from "./js/model.js";
import {lineOf, nodesFromClipboard} from "./js/paste.js";
import {block, blocks, fieldsIn, refill} from "./js/view.js";
import {renderContentEditorTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});
// What a copy of blocks carries on the clipboard: the nodes themselves, so a
// paste into an editor gives them back exactly.
const NODES_TYPE = "application/x-simai-composition-nodes+json";
const INLINE_EVENTS = ["sf-inline-editor-input", "sf-inline-editor-change", "sf-inline-editor-cancel", "sf-inline-edit-input", "sf-inline-edit-commit", "sf-inline-edit-cancel"];
const UNDO_DEPTH = 200;
const TYPING_PAUSE = 700;

const ContentEditorElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    actions: {
        edit({id} = {}) {
            const wanted = String(id ?? "");
            const node = wanted ? locate(this.doc.root, wanted)?.node : this.flowOf(this.doc.root)[0];
            if (!node) return refused("unknown");
            this.clearPicked();
            const target = this.fieldsOf(node.id)[0];
            if (!target) {
                this.pick([node.id]);
                return applied();
            }
            this.activate(target, "end");
            return applied();
        },
        select({ids} = {}) {
            const wanted = (Array.isArray(ids) ? ids : []).map(String);
            const places = wanted.map((id) => locate(this.doc.root, id));
            if (places.some((place) => !isFlow(place))) return refused("unknown");
            if (places.some((place) => place.parent !== places[0]?.parent)) return refused("not-siblings");
            this.finishSession();
            this.pick(wanted);
            return applied();
        },
        insert({kind, after} = {}) {
            const entry = this.offeredKinds().find((item) => item.id === String(kind ?? ""));
            if (!entry) return refused("unknown");
            const anchor = after ? locate(this.doc.root, String(after)) : null;
            if (after && !isFlow(anchor)) return refused("unknown");
            this.insertKind(entry, anchor ? anchor.node.id : null);
            return applied();
        },
        undo() {
            return this.restore(this.undoStack, this.redoStack) ? applied() : refused("empty");
        },
        redo() {
            return this.restore(this.redoStack, this.undoStack) ? applied() : refused("empty");
        },
    },
});

class SfContentEditor extends ContentEditorElement {
    static get props() {
        return {...super.props, templateName: {attribute: "template", default: "default"}};
    }

    constructor() {
        super();
        // A value set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        for (const name of ["document", "kinds", "editorManifests"]) {
            if (Object.prototype.hasOwnProperty.call(this, name)) {
                const early = this[name];
                delete this[name];
                this[name] = early;
            }
        }
        this.doc = this.emptyDocument();
        this.adopted = undefined;
        this.session = null;
        this.sessionField = null;
        this.undoStack = [];
        this.redoStack = [];
        this.typingUntil = 0;
        this.picked = [];
        this.folds = new Map();
        this.slash = null;
        this.menuMode = null;
        this.menuFor = "";
        this.gutterFor = "";
        this.paramsFor = "";
        this.notice = "";
        this.listening = null;
    }

    emptyDocument() {
        return {schema: "simai.composition.document", schema_version: 1, id: "page", profile: "structured-content", root: {id: "root", type: "content.document", slots: {default: []}}};
    }

    // ------------------------------------------------------------ the Document

    /** Takes the host's Document when it is a new one, not the one this editor sent. */
    adopt() {
        const given = this.document;
        if (given === this.adopted) return;
        this.adopted = given;
        if (given && this.sent && JSON.stringify(given) === this.sent) return;
        const next = given && typeof given === "object" && given.root ? structuredClone(given) : this.emptyDocument();
        this.finishSession();
        this.doc = next;
        this.newId = idMaker(this.doc.root);
        this.undoStack = [];
        this.redoStack = [];
        this.picked = [];
        this.drawAll();
    }

    /** Tells the host: the Document changed. The editor keeps no store of its own. */
    changed(reason) {
        this.sent = JSON.stringify(this.doc);
        this.sfEmit("change", {document: JSON.parse(this.sent), reason});
    }

    flowOf(node) {
        const slot = FLOWS[node.type];
        return slot ? (node.slots?.[slot] ?? []) : [];
    }

    offeredKinds() {
        const wanted = Array.isArray(this.kinds) && this.kinds.length ? this.kinds.map(String) : DEFAULT_KINDS;
        return wanted.map(entryOf).filter(Boolean);
    }

    // The parameters of each type: the Framework's editor manifests, and a
    // host's own for its types; a host's entry for a type replaces the
    // Framework's.
    editorFields(type) {
        const own = Array.isArray(this.editorManifests) ? this.editorManifests : [];
        const found = own.find((entry) => entry?.type === type) ?? BUILTIN_EDITOR_MANIFESTS.find((entry) => entry.type === type);
        const required = BUILTIN_TYPE_MANIFESTS.find((entry) => entry.type === type)?.data_schema?.required ?? [];
        return (found?.fields ?? []).filter((item) => item.visibility !== "hidden" && (item.plane === "props" || item.plane === "data"))
            .map((item) => ({...item, required: item.plane === "data" && required.includes(item.key), kind: this.kindOfField(item)}));
    }

    kindOfField(item) {
        if (Array.isArray(item.choices)) return "choice";
        if (item.property?.type === "boolean") return "toggle";
        if (item.property?.type === "integer") return "integer";
        return "text";
    }

    // ------------------------------------------------------------ drawing

    get sheet() {
        return this.querySelector(".sf-content-editor-sheet");
    }

    get blocksElement() {
        return this.querySelector(".sf-content-editor-blocks");
    }

    get menu() {
        return this.querySelector(".sf-content-editor-menu");
    }

    viewContext() {
        return {
            doc: this.ownerDocument,
            word: (key) => this.sfWord(key),
            isOpen: (node) => (this.folds.has(node.id) ? this.folds.get(node.id) : node.props?.open === true),
            placeholderFor: () => "paragraph-placeholder",
            paramsSummary: (node) => this.paramsSummary(node),
        };
    }

    drawAll() {
        const host = this.blocksElement;
        if (!host) return;
        this.finishSession();
        host.dataset.sfFlow = this.doc.root.id;
        host.dataset.sfSlot = FLOWS[this.doc.root.type] ?? "default";
        host.replaceChildren(blocks(this.viewContext(), this.doc.root));
        const title = this.querySelector(".sf-content-editor-title");
        if (title) {
            title.dataset.sfNode = this.doc.root.id;
            title.textContent = typeof this.doc.root.data?.title === "string" ? this.doc.root.data.title : "";
        }
        this.markPicked();
        this.updateTabStop();
    }

    /** Draws one block again in its place; the other blocks keep their elements. */
    redraw(id) {
        const place = locate(this.doc.root, id);
        if (!place) return;
        const current = this.blockElement(id);
        if (this.sessionField && current?.contains(this.sessionField)) this.finishSession();
        if (!place.parent) return;
        if (!current) {
            this.redrawFlow(place.parent.id, place.slot);
            return;
        }
        current.replaceWith(block(this.viewContext(), place.node));
        this.markPicked();
    }

    /** Draws a flow's blocks again in their order, keeping the elements of those that stayed. */
    redrawFlow(parentId, slot) {
        const parent = locate(this.doc.root, parentId)?.node;
        if (!parent) return;
        if (!isFlow({parent, slot}) && parent !== this.doc.root) {
            const owner = this.flowBlockOf(parent.id);
            if (owner) this.redraw(owner);
            return;
        }
        const host = parent === this.doc.root ? this.blocksElement : this.querySelector(`.sf-content-editor-flow[data-sf-flow="${CSS.escape(parent.id)}"]`);
        if (!host) {
            const owner = this.flowBlockOf(parent.id);
            if (owner) this.redraw(owner);
            return;
        }
        const keep = new Map([...host.children].map((element) => [element.dataset.sfNode, element]));
        const list = parent.slots?.[slot] ?? [];
        const ordered = list.map((node) => keep.get(node.id) ?? block(this.viewContext(), node));
        for (const element of keep.values()) if (!ordered.includes(element)) element.remove();
        ordered.forEach((element, index) => {
            if (host.children[index] !== element) host.insertBefore(element, host.children[index] ?? null);
        });
        this.markPicked();
    }

    /** The id of the flow block a node stands in (itself when it is one). */
    flowBlockOf(id) {
        let place = locate(this.doc.root, id);
        while (place && !isFlow(place)) place = place.parent ? locate(this.doc.root, place.parent.id) : null;
        return place?.node.id ?? "";
    }

    blockElement(id) {
        return this.blocksElement?.querySelector(`.sf-content-editor-block[data-sf-node="${CSS.escape(id)}"]`) ?? null;
    }

    fieldsOf(id) {
        const scope = this.blockElement(id) ?? this.blocksElement?.querySelector(`[data-sf-node="${CSS.escape(id)}"]`);
        if (!scope) return [];
        return scope.classList.contains("sf-content-editor-field") ? [scope] : fieldsIn(scope);
    }

    fieldElement({id, key, row, column}) {
        const extra = row !== undefined && row !== null ? `[data-sf-row="${row}"][data-sf-column="${column}"]` : "";
        return this.querySelector(`.sf-content-editor-field[data-sf-node="${CSS.escape(id)}"][data-sf-field="${CSS.escape(key)}"]${extra}`);
    }

    /** One field of the sheet is its tab stop: the one last typed in, else the first. */
    updateTabStop() {
        const all = [this.querySelector(".sf-content-editor-title"), ...fieldsIn(this.blocksElement ?? this)].filter(Boolean);
        const stop = all.find((element) => element === this.lastField && element.isConnected) ?? all[0];
        for (const element of all) element.tabIndex = element === stop ? 0 : -1;
    }

    // ------------------------------------------------------------ fields and the caret

    describe(element) {
        return {
            id: element.dataset.sfNode,
            key: element.dataset.sfField,
            kind: element.dataset.sfKind,
            row: element.dataset.sfRow !== undefined ? Number(element.dataset.sfRow) : undefined,
            column: element.dataset.sfColumn !== undefined ? Number(element.dataset.sfColumn) : undefined,
        };
    }

    valueOf(element) {
        const field = this.describe(element);
        const node = locate(this.doc.root, field.id)?.node;
        if (!node) return [];
        if (field.kind === "cell") return node.data.rows[field.row]?.[field.column] ?? [];
        if (field.kind === "plain") return String(node.data?.[field.key] ?? "");
        return inlineOf(node, field.key);
    }

    lengthOf(element) {
        const value = this.valueOf(element);
        return typeof value === "string" ? value.length : inlineLength(value);
    }

    caret(element) {
        const selection = this.ownerDocument.getSelection();
        if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return {start: 0, end: 0, collapsed: true};
        const range = selection.getRangeAt(0);
        const offset = (container, at) => {
            if (element.dataset.sfKind !== "plain") return textOffset(element, container, at);
            const measure = this.ownerDocument.createRange();
            measure.selectNodeContents(element);
            measure.setEnd(container, at);
            return measure.toString().length;
        };
        const start = offset(range.startContainer, range.startOffset);
        const end = offset(range.endContainer, range.endOffset);
        return {start, end, collapsed: start === end};
    }

    /** Puts the caret at an offset of a field: characters of text, one per inline atom. */
    setCaret(element, at) {
        const selection = this.ownerDocument.getSelection();
        const total = element.dataset.sfKind === "plain" ? element.textContent.length : this.lengthOf(element);
        let left = at === "end" ? total : Math.max(0, Math.min(Number(at) || 0, total));
        const range = this.ownerDocument.createRange();
        const walk = (node) => {
            for (const child of node.childNodes) {
                if (child.nodeType === 3) {
                    if (left <= child.nodeValue.length) {
                        range.setStart(child, left);
                        return true;
                    }
                    left -= child.nodeValue.length;
                } else if (child.nodeType === 1 && child.hasAttribute("data-sf-inline-node")) {
                    if (left === 0) {
                        range.setStartBefore(child);
                        return true;
                    }
                    left -= 1;
                } else if (child.nodeType === 1 && walk(child)) return true;
            }
            return false;
        };
        if (!walk(element)) {
            range.selectNodeContents(element);
            range.collapse(false);
        }
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // The bar of sf-inline-editor is shown over a selection only, where the
    // selection is: while the caret only blinks, the page stays quiet.
    placeToolbar() {
        const bar = this.toolbar;
        const element = this.sessionField;
        if (!bar || !element || !bar.isConnected) return;
        const selection = this.ownerDocument.getSelection();
        const inside = selection?.rangeCount && element.contains(selection.anchorNode);
        const busy = bar.contains(this.ownerDocument.activeElement);
        if (!busy && (!inside || selection.isCollapsed)) {
            bar.style.visibility = "hidden";
            return;
        }
        bar.style.visibility = "";
        if (busy) return;
        const box = selection.getRangeAt(0).getBoundingClientRect();
        const own = bar.getBoundingClientRect();
        const top = box.top - own.height - 8 >= 0 ? box.top - own.height - 8 : box.bottom + 8;
        const left = Math.max(8, Math.min(box.left + box.width / 2 - own.width / 2, globalThis.innerWidth - own.width - 8));
        Object.assign(bar.style, {top: `${top}px`, left: `${left}px`});
    }

    /** Starts typing in a field at an offset ("end" by default). */
    activate(element, at = "end") {
        if (!element?.isConnected) return;
        this.clearPicked();
        this.closeSlash();
        this.lastField = element;
        this.updateTabStop();
        if (element.dataset.sfKind === "plain") {
            this.finishSession();
            element.focus({preventScroll: true});
            this.setCaret(element, at);
            this.reveal(element);
            return;
        }
        if (this.sessionField === element && this.session) {
            this.setCaret(element, at);
            this.reveal(element);
            return;
        }
        this.finishSession();
        const carrier = this.querySelector("sf-inline-editor");
        if (!carrier || typeof carrier.edit !== "function") {
            // The Loader brings sf-inline-editor with the editor; a press before it arrives waits for it.
            customElements.whenDefined("sf-inline-editor").then(() => {
                if (!this.session) this.activate(element, at);
            });
            return;
        }
        const field = this.describe(element);
        const before = new Set(this.ownerDocument.querySelectorAll(".sf-inline-editor-toolbar"));
        this.session = carrier.edit(element, {
            content: this.valueOf(element),
            nodeId: field.id,
            label: element.getAttribute("aria-label") || "",
            links: true,
            messages: {editing: "{label}"},
        });
        this.sessionField = element;
        this.toolbar = [...this.ownerDocument.querySelectorAll(".sf-inline-editor-toolbar")].find((bar) => !before.has(bar)) ?? null;
        this.setCaret(element, at);
        this.placeToolbar();
        this.reveal(element);
    }

    reveal(element) {
        element.scrollIntoView?.({block: "nearest"});
    }

    /** Ends the inline session: what was typed is already in the Document. */
    finishSession() {
        const session = this.session;
        if (!session) return;
        this.session = null;
        session.commit();
        this.afterSession();
    }

    afterSession() {
        const element = this.sessionField;
        this.sessionField = null;
        this.toolbar = null;
        if (element?.isConnected) refill(element, this.valueOf(element));
    }

    /** Writes what a field holds now into the Document. */
    write(element, value) {
        const field = this.describe(element);
        const node = locate(this.doc.root, field.id)?.node;
        if (!node) return;
        if (field.kind === "cell") setCell(node, field.row, field.column, value);
        else if (field.kind === "plain") {
            if (node === this.doc.root && field.key === "title") {
                node.data ??= {};
                if (value) node.data.title = value;
                else delete node.data.title;
                if (!Object.keys(node.data).length) delete node.data;
            } else setPlain(node, field.key, value);
        } else setInline(node, field.key, value);
    }

    // ------------------------------------------------------------ history

    snapshot() {
        const element = this.sessionField ?? this.ownerDocument.activeElement?.closest?.(".sf-content-editor-field, .sf-content-editor-title");
        const focus = element && this.contains(element) ? {...this.describe(element), title: element.classList.contains("sf-content-editor-title"), at: this.caret(element).start} : null;
        return {doc: JSON.stringify(this.doc), focus, picked: [...this.picked]};
    }

    /** Before a change of structure: one step back. */
    remember() {
        this.undoStack.push(this.snapshot());
        if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
        this.redoStack = [];
        this.typingUntil = 0;
    }

    /** Before typing: one step back for a run of typing, not one per letter. */
    rememberTyping(before) {
        const now = Date.now();
        if (now > this.typingUntil) {
            this.undoStack.push(before);
            if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
            this.redoStack = [];
        }
        this.typingUntil = now + TYPING_PAUSE;
    }

    restore(from, to) {
        const step = from.pop();
        if (!step) return false;
        this.finishSession();
        to.push(this.snapshot());
        this.typingUntil = 0;
        this.doc = JSON.parse(step.doc);
        this.newId = idMaker(this.doc.root);
        this.picked = [];
        this.drawAll();
        if (step.focus) {
            const element = step.focus.title ? this.querySelector(".sf-content-editor-title") : this.fieldElement(step.focus);
            if (element) this.activate(element, step.focus.at);
        } else if (step.picked?.length) this.pick(step.picked.filter((id) => locate(this.doc.root, id)));
        this.changed("history");
        return true;
    }

    // ------------------------------------------------------------ typing

    onFieldInput(element, value) {
        const before = this.lastSnapshot ?? this.snapshot();
        this.rememberTyping(before);
        this.write(element, value);
        this.lastSnapshot = this.snapshot();
        this.hideGutter();
        this.changed("typing");
        const field = this.describe(element);
        const node = locate(this.doc.root, field.id)?.node;
        if (node?.type === "content.paragraph" && field.key === "content") {
            if (this.shortcut(node, element)) return;
            this.watchSlash(node, element);
        } else this.closeSlash();
        this.placeToolbar();
    }

    /** Markdown at the start of a paragraph: `## `, `- `, `1. `, `> `, ``` and ---. */
    shortcut(node, element) {
        const typed = inlineText(inlineOf(node, "content")).replace(/ /gu, " ");
        const rule = SHORTCUTS.find(([pattern]) => pattern.test(typed));
        if (!rule) return false;
        const entry = entryOf(rule[1]);
        if (!entry || !isFlow(locate(this.doc.root, node.id))) return false;
        this.finishSession();
        setInline(node, "content", []);
        this.turnInto(node.id, entry, {remember: false});
        return true;
    }

    // ------------------------------------------------------------ the / menu

    watchSlash(node, element) {
        const typed = inlineText(inlineOf(node, "content"));
        if (!/^\/[^\s/]*$/u.test(typed)) {
            this.closeSlash();
            return;
        }
        const query = typed.slice(1).toLowerCase();
        const items = this.offeredKinds().filter((entry) => !query || this.sfWord(`type-${entry.id}`).toLowerCase().includes(query) || this.sfWord(`find-${entry.id}`).toLowerCase().includes(query));
        const index = this.slash?.id === node.id ? Math.min(this.slash.index, Math.max(0, items.length - 1)) : 0;
        this.slash = {id: node.id, items, index, element};
        this.drawSlash();
    }

    drawSlash() {
        const box = this.querySelector(".sf-content-editor-slash");
        if (!box || !this.slash) return;
        const {items, index, element} = this.slash;
        box.hidden = false;
        const list = items.length
            ? html`${items.map((entry, at) => html`
                <div class="sf-content-editor-option" role="option" id=${`${this.slashId()}-${entry.id}`} aria-selected=${at === index ? "true" : "false"}
                     @pointerdown=${(event) => { event.preventDefault(); this.chooseSlash(at); }}>
                    <sf-icon icon=${entry.icon} size="1" aria-hidden="true"></sf-icon>
                    <span class="sf-content-editor-option-text">${this.sfWord(`type-${entry.id}`)}</span>
                    ${entry.hint ? html`<span class="sf-content-editor-option-hint">${entry.hint}</span>` : ""}
                </div>`)}`
            : html`<div class="sf-content-editor-none">${this.sfWord("nothing-found")}</div>`;
        render(list, box);
        element.setAttribute("aria-controls", box.id);
        element.setAttribute("aria-expanded", "true");
        if (items[index]) element.setAttribute("aria-activedescendant", `${this.slashId()}-${items[index].id}`);
        box.querySelector('[aria-selected="true"]')?.scrollIntoView?.({block: "nearest"});
        const selection = this.ownerDocument.getSelection();
        const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : element.getBoundingClientRect();
        const anchor = rect.height ? rect : element.getBoundingClientRect();
        const own = box.getBoundingClientRect();
        const below = anchor.bottom + 6;
        const top = below + own.height > globalThis.innerHeight - 8 ? Math.max(8, anchor.top - own.height - 6) : below;
        Object.assign(box.style, {top: `${top}px`, left: `${Math.max(8, Math.min(anchor.left, globalThis.innerWidth - own.width - 8))}px`});
    }

    slashId() {
        this.slashKey ??= `sf-content-editor-${Math.random().toString(36).slice(2, 8)}`;
        return this.slashKey;
    }

    closeSlash() {
        if (!this.slash) return;
        const {element} = this.slash;
        for (const name of ["aria-controls", "aria-expanded", "aria-activedescendant"]) element?.removeAttribute(name);
        this.slash = null;
        const box = this.querySelector(".sf-content-editor-slash");
        if (box) box.hidden = true;
    }

    chooseSlash(at) {
        const slash = this.slash;
        const entry = slash?.items[at];
        this.closeSlash();
        if (!entry) return;
        const node = locate(this.doc.root, slash.id)?.node;
        if (!node) return;
        this.finishSession();
        setInline(node, "content", []);
        this.turnInto(node.id, entry, {remember: false});
    }

    slashKey_(event) {
        const {items} = this.slash;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (items.length) this.slash.index = (this.slash.index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
            this.drawSlash();
            return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
            if (items.length) this.chooseSlash(this.slash.index);
            else this.closeSlash();
            return true;
        }
        if (event.key === "Escape") {
            this.closeSlash();
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------ changes of structure

    /** Puts the caret in a node's first or last field, or picks the block when it has none. */
    enter(id, at = "end", which = at === 0 ? "first" : "last") {
        const list = this.fieldsOf(id);
        const target = which === "first" ? list[0] : list.at(-1);
        if (target) this.activate(target, at);
        else {
            const flowBlock = this.flowBlockOf(id);
            if (flowBlock) this.pick([flowBlock]);
        }
    }

    paragraph(content = []) {
        return {id: this.newId(), type: "content.paragraph", data: {content}};
    }

    /** Makes a block of a kind after a block (or at the end of the page) and starts typing in it. */
    insertKind(entry, afterId) {
        this.finishSession();
        this.remember();
        const fresh = this.fresh(entry);
        const anchor = afterId ? locate(this.doc.root, afterId) : null;
        if (anchor) insertAt(this.doc.root, anchor.parent.id, anchor.slot, anchor.index + 1, fresh);
        else insertAt(this.doc.root, this.doc.root.id, FLOWS[this.doc.root.type], this.flowOf(this.doc.root).length, fresh);
        this.settle(fresh);
        this.changed("insert");
    }

    fresh(entry, seed = []) {
        const node = blank(entry.type, this.newId, seed);
        if (entry.options?.level) node.data.level = entry.options.level;
        if (entry.options?.ordered) node.props = {ordered: true};
        return node;
    }

    /** After a block was made: draw it, give a divider a line after it, and type in it. */
    settle(node) {
        const place = locate(this.doc.root, node.id);
        if (node.type === "content.divider") {
            const next = place.parent.slots[place.slot][place.index + 1];
            if (!next || next.type !== "content.paragraph") insertAt(this.doc.root, place.parent.id, place.slot, place.index + 1, this.paragraph());
        }
        // A block turned into another kind keeps its id, so it is drawn anew before its flow.
        this.redraw(node.id);
        this.redrawFlow(place.parent.id, place.slot);
        if (node.type === "content.divider") this.enter(place.parent.slots[place.slot][place.index + 1].id, 0);
        else if (node.type === "content.figure") this.openParams(node.id, this.blockElement(node.id));
        else this.enter(node.id, "end", "first");
        this.say(this.sfWord("inserted-text", {vars: {kind: this.sfWord(`type-${kindOf(node) || "paragraph"}`)}}));
    }

    /** Changes a block's kind and keeps its words. */
    turnInto(id, entry, {remember = true} = {}) {
        const place = locate(this.doc.root, id);
        if (!place?.parent) return;
        if (remember) this.remember();
        const node = place.node;
        let next;
        if (CONVERTIBLE.has(node.type) && CONVERTIBLE.has(entry.type)) next = convert(node, entry.type, this.newId, entry.options);
        else if (!inlineLength(inlineOf(node, "content")) && node.type === "content.paragraph") next = {...this.fresh(entry), id: node.id};
        else return;
        if (entry.type === "content.list" && node.type === "content.list") {
            next.props = entry.options?.ordered ? {...node.props, ordered: true} : (({ordered, start, ...rest}) => (Object.keys(rest).length ? rest : undefined))(node.props ?? {});
            if (!next.props) delete next.props;
        }
        replaceNode(this.doc.root, id, next);
        this.settle(next);
        this.changed("convert");
    }

    /** Enter in an inline field. */
    onEnter(element, event) {
        const field = this.describe(element);
        const place = locate(this.doc.root, field.id);
        if (!place) return;
        const node = place.node;
        const value = this.valueOf(element);
        const {start, end} = this.caret(element);
        if (field.kind === "cell") {
            const rows = node.data.rows;
            if (field.row + 1 < rows.length) this.activate(this.fieldElement({...field, row: field.row + 1}), "end");
            else this.after(node.id);
            return;
        }
        if (field.key === "caption") {
            this.after(node.id);
            return;
        }
        if (node.type === "content.alert" || node.type === "content.details") {
            this.finishSession();
            if (node.type === "content.details") this.folds.set(node.id, true);
            if (!this.flowOf(node).length) {
                this.remember();
                insertAt(this.doc.root, node.id, "default", 0, this.paragraph());
                this.changed("insert");
            }
            this.redraw(node.id);
            this.enter(this.flowOf(node)[0].id, 0, "first");
            return;
        }
        if (node.type === "content.step" && event.shiftKey) {
            this.finishSession();
            this.remember();
            insertAt(this.doc.root, node.id, "default", 0, this.paragraph());
            this.redraw(this.flowBlockOf(node.id));
            this.enter(node.slots.default[0].id, 0, "first");
            this.changed("insert");
            return;
        }
        this.finishSession();
        this.remember();
        const [head, tail] = split(value, start);
        const rest = split(value, end)[1];
        const after = start === end ? tail : rest;
        if (node.type === "content.list-item" || node.type === "content.step") {
            const key = field.key;
            const list = place.parent.slots[place.slot];
            if (!inlineLength(value) && !(node.slots?.default?.length)) {
                this.leaveItems(place);
                return;
            }
            setInline(node, key, head);
            const next = node.type === "content.list-item" ? {id: this.newId(), type: "content.list-item", data: {content: after}} : {id: this.newId(), type: "content.step", ...(inlineLength(after) ? {data: {title: after}} : {}), slots: {default: []}};
            list.splice(place.index + 1, 0, next);
            this.redraw(this.flowBlockOf(node.id));
            this.enter(next.id, 0, "first");
            this.changed("split");
            return;
        }
        // An empty last line of a quote, a note or any other flow inside a block leaves it.
        if (node.type === "content.paragraph" && !inlineLength(value) && place.parent !== this.doc.root && isFlow(place) && place.index === place.parent.slots[place.slot].length - 1 && place.parent.slots[place.slot].length > 1) {
            const owner = this.flowBlockOf(place.parent.id) ? locate(this.doc.root, this.flowBlockOf(place.parent.id)) : null;
            if (owner?.parent) {
                removeNode(this.doc.root, node.id);
                insertAt(this.doc.root, owner.parent.id, owner.slot, owner.index + 1, node);
                this.redraw(owner.node.id);
                this.redrawFlow(owner.parent.id, owner.slot);
                this.enter(node.id, 0);
                this.changed("split");
                return;
            }
        }
        setInline(node, field.key, head);
        const next = this.paragraph(after);
        insertAt(this.doc.root, place.parent.id, place.slot, place.index + 1, next);
        this.refreshField(element);
        this.redrawFlow(place.parent.id, place.slot);
        this.enter(next.id, 0);
        this.changed("split");
    }

    /** An empty last item leaves its list: the line after it is a paragraph, the items after it a list of their own. */
    leaveItems(place) {
        const owner = locate(this.doc.root, place.parent.id);
        const items = place.parent.slots[place.slot];
        const tail = items.splice(place.index + 1);
        items.splice(place.index, 1);
        const line = this.paragraph();
        const add = [line];
        if (tail.length) add.push({...structuredClone({...owner.node, slots: {...owner.node.slots, [place.slot]: []}}), id: this.newId(), slots: {...owner.node.slots, [place.slot]: tail}});
        insertAt(this.doc.root, owner.parent.id, owner.slot, owner.index + 1, ...add);
        if (!items.length) removeNode(this.doc.root, owner.node.id);
        else this.redraw(owner.node.id);
        this.redrawFlow(owner.parent.id, owner.slot);
        this.enter(line.id, 0);
        this.changed("split");
    }

    /** The line after a block: the paragraph there if it is empty, else a new one. */
    after(id) {
        this.finishSession();
        const place = locate(this.doc.root, this.flowBlockOf(id));
        const next = place.parent.slots[place.slot][place.index + 1];
        if (next?.type === "content.paragraph" && !inlineLength(inlineOf(next, "content"))) {
            this.enter(next.id, 0);
            return;
        }
        this.remember();
        const line = this.paragraph();
        insertAt(this.doc.root, place.parent.id, place.slot, place.index + 1, line);
        this.redrawFlow(place.parent.id, place.slot);
        this.enter(line.id, 0);
        this.changed("insert");
    }

    refreshField(element) {
        if (element.isConnected) refill(element, this.valueOf(element));
    }

    /** Backspace at the start of an inline field. Answers whether it did something. */
    onBackspace(element) {
        const field = this.describe(element);
        const place = locate(this.doc.root, field.id);
        if (!place?.parent) return false;
        const node = place.node;
        const value = this.valueOf(element);
        if (field.kind === "cell" || field.key === "caption") return false;
        if (node.type === "content.heading") {
            this.finishSession();
            this.turnInto(node.id, entryOf("paragraph"));
            this.enter(node.id, 0);
            return true;
        }
        if (node.type === "content.list-item" || node.type === "content.step") {
            const key = field.key;
            const list = place.parent.slots[place.slot];
            this.finishSession();
            this.remember();
            if (place.index > 0) {
                const previous = list[place.index - 1];
                const at = inlineLength(inlineOf(previous, key));
                setInline(previous, key, join(inlineOf(previous, key), value));
                if (node.slots?.default?.length) {
                    previous.slots ??= {};
                    previous.slots.default = [...(previous.slots.default ?? []), ...node.slots.default];
                }
                list.splice(place.index, 1);
                this.redraw(this.flowBlockOf(previous.id));
                this.enter(previous.id, at, "first");
            } else {
                // The first item becomes a paragraph before its list.
                const owner = locate(this.doc.root, place.parent.id);
                list.splice(0, 1);
                const line = this.paragraph(value);
                insertAt(this.doc.root, owner.parent.id, owner.slot, owner.index, line);
                if (node.slots?.default?.length) insertAt(this.doc.root, owner.parent.id, owner.slot, owner.index + 1, ...node.slots.default);
                if (!list.length) removeNode(this.doc.root, owner.node.id);
                else this.redraw(owner.node.id);
                this.redrawFlow(owner.parent.id, owner.slot);
                this.enter(line.id, 0);
            }
            this.changed("merge");
            return true;
        }
        if (node.type !== "content.paragraph" || !isFlow(place)) {
            // A title of a note, a summary: nothing before it in the block to join.
            return false;
        }
        const list = place.parent.slots[place.slot];
        const previous = list[place.index - 1];
        if (!previous) {
            if (place.parent === this.doc.root) return false;
            this.finishSession();
            const owner = locate(this.doc.root, place.parent.id);
            const ownTitle = FIELDS[owner.node.type]?.find((entry) => entry.kind === "inline");
            this.remember();
            if (!inlineLength(value) && list.length > 1) {
                list.splice(0, 1);
                this.redraw(this.flowBlockOf(owner.node.id));
                this.enter(list[0].id, 0, "first");
            } else if (ownTitle) {
                const at = inlineLength(inlineOf(owner.node, ownTitle.key));
                setInline(owner.node, ownTitle.key, join(inlineOf(owner.node, ownTitle.key), value));
                list.splice(0, 1);
                this.redraw(this.flowBlockOf(owner.node.id));
                this.activate(this.fieldElement({id: owner.node.id, key: ownTitle.key}), at);
            } else if (isFlow(owner)) {
                // The first line of a quote, a card: it steps out before the block.
                list.splice(0, 1);
                insertAt(this.doc.root, owner.parent.id, owner.slot, owner.index, node);
                if (!list.length) removeNode(this.doc.root, owner.node.id);
                else this.redraw(owner.node.id);
                this.redrawFlow(owner.parent.id, owner.slot);
                this.enter(node.id, 0);
            } else {
                this.undoStack.pop();
                return true;
            }
            this.changed("merge");
            return true;
        }
        this.finishSession();
        if (previous.type === "content.divider") {
            this.remember();
            list.splice(place.index - 1, 1);
            this.redrawFlow(place.parent.id, place.slot);
            this.enter(node.id, 0);
            this.changed("remove");
            return true;
        }
        if (TEXT_BLOCKS.has(previous.type)) {
            this.remember();
            const at = inlineLength(inlineOf(previous, "content"));
            setInline(previous, "content", join(inlineOf(previous, "content"), value));
            list.splice(place.index, 1);
            this.redraw(previous.id);
            this.redrawFlow(place.parent.id, place.slot);
            this.enter(previous.id, at);
            this.changed("merge");
            return true;
        }
        if (previous.type === "content.list" && inlineLength(value)) {
            this.remember();
            const last = previous.slots.items.at(-1);
            const at = inlineLength(inlineOf(last, "content"));
            setInline(last, "content", join(inlineOf(last, "content"), value));
            list.splice(place.index, 1);
            this.redraw(previous.id);
            this.redrawFlow(place.parent.id, place.slot);
            this.enter(last.id, at, "first");
            this.changed("merge");
            return true;
        }
        if (!inlineLength(value)) {
            this.remember();
            list.splice(place.index, 1);
            this.redrawFlow(place.parent.id, place.slot);
            this.enter(previous.id, "end");
            this.changed("remove");
            return true;
        }
        this.enter(previous.id, "end");
        return true;
    }

    /** Delete at the end of a paragraph or a heading takes the next one's words in. */
    onDelete(element) {
        const field = this.describe(element);
        const place = locate(this.doc.root, field.id);
        if (!isFlow(place) || !TEXT_BLOCKS.has(place.node.type)) return false;
        const next = place.parent.slots[place.slot][place.index + 1];
        if (!next || !TEXT_BLOCKS.has(next.type)) return false;
        this.finishSession();
        this.remember();
        const at = inlineLength(this.valueOf(element));
        setInline(place.node, "content", join(inlineOf(place.node, "content"), inlineOf(next, "content")));
        place.parent.slots[place.slot].splice(place.index + 1, 1);
        this.redraw(place.node.id);
        this.redrawFlow(place.parent.id, place.slot);
        this.enter(place.node.id, at);
        this.changed("merge");
        return true;
    }

    /** Moves a block among its siblings by a step. */
    shift(id, step) {
        const place = locate(this.doc.root, id);
        if (!isFlow(place)) return false;
        const to = place.index + step;
        if (to < 0 || to >= place.parent.slots[place.slot].length) return false;
        this.remember();
        moveWithin(this.doc.root, id, to);
        this.redrawFlow(place.parent.id, place.slot);
        this.say(this.sfWord("moved-text", {vars: {position: String(to + 1)}}));
        this.changed("move");
        return true;
    }

    duplicate(id) {
        const place = locate(this.doc.root, id);
        if (!isFlow(place)) return "";
        this.finishSession();
        this.remember();
        const copy = cloneFresh(place.node, this.newId);
        insertAt(this.doc.root, place.parent.id, place.slot, place.index + 1, copy);
        this.redrawFlow(place.parent.id, place.slot);
        this.changed("duplicate");
        return copy.id;
    }

    /** Removes blocks of one flow; a page never ends with no line to type in. */
    removeBlocks(ids, {focus = "pick"} = {}) {
        const places = ids.map((id) => locate(this.doc.root, id)).filter(isFlow);
        if (!places.length) return;
        this.finishSession();
        this.remember();
        const {parent, slot} = places[0];
        const first = Math.min(...places.map((place) => place.index));
        for (const place of places) removeNode(this.doc.root, place.node.id);
        const list = parent.slots[slot];
        if (!list.length && parent === this.doc.root) list.push(this.paragraph());
        this.redraw(this.flowBlockOf(parent.id) || parent.id);
        this.redrawFlow(parent.id, slot);
        const near = list[Math.min(first, list.length - 1)] ?? null;
        this.picked = [];
        if (near && focus === "pick") this.pick([near.id]);
        else if (near) this.enter(near.id, "end");
        this.toast(this.sfWord("removed-text"));
        this.changed("remove");
    }

    // ------------------------------------------------------------ blocks as a selection

    pick(ids) {
        this.finishSession();
        this.closeSlash();
        this.picked = ids.filter(Boolean);
        this.markPicked();
        if (this.picked.length) {
            this.ownerDocument.getSelection()?.removeAllRanges();
            this.blocksElement?.focus({preventScroll: true});
            this.blockElement(this.picked.at(-1))?.scrollIntoView?.({block: "nearest"});
            const node = locate(this.doc.root, this.picked.at(-1))?.node;
            this.say(this.picked.length > 1
                ? this.sfWord("picked-many", {count: this.picked.length, vars: {count: String(this.picked.length)}})
                : this.sfWord("picked-one", {vars: {kind: this.sfWord(`type-${kindOf(node ?? {}) || "paragraph"}`)}}));
        }
        this.sfEmit("select", {ids: [...this.picked]});
    }

    clearPicked() {
        if (!this.picked.length) return;
        this.picked = [];
        this.markPicked();
        this.sfEmit("select", {ids: []});
    }

    markPicked() {
        for (const element of this.querySelectorAll(".sf-content-editor-block.is-picked")) element.classList.remove("is-picked");
        for (const id of this.picked) this.blockElement(id)?.classList.add("is-picked");
        this.blocksElement?.setAttribute("aria-activedescendant", "");
    }

    onPickedKey(event) {
        const mod = event.metaKey || event.ctrlKey;
        const places = this.picked.map((id) => locate(this.doc.root, id)).filter(isFlow);
        if (!places.length) return false;
        const list = places[0].parent.slots[places[0].slot];
        const indexes = places.map((place) => place.index).sort((a, b) => a - b);
        const first = indexes[0];
        const last = indexes.at(-1);
        const key = event.key;
        if (key === "ArrowDown" || key === "ArrowUp") {
            const step = key === "ArrowDown" ? 1 : -1;
            if (event.altKey) {
                if (places.length === 1) this.shift(places[0].node.id, step);
                this.markPicked();
                return true;
            }
            const target = list[(step > 0 ? last : first) + step];
            if (!target) return true;
            this.pick(event.shiftKey ? [...this.picked, target.id] : [target.id]);
            return true;
        }
        if (key === "Enter") {
            const id = this.picked[0];
            this.clearPicked();
            this.enter(id, "end", "first");
            return true;
        }
        if (key === "Escape") {
            this.clearPicked();
            // Esc with nothing left to undo here: the host may take the person back (the layout, say).
            this.sfEmit("leave", {});
            return true;
        }
        if (key === "Backspace" || key === "Delete") {
            this.removeBlocks(this.picked);
            return true;
        }
        if (mod && key.toLowerCase() === "d") {
            const copy = this.duplicate(this.picked.at(-1));
            if (copy) this.pick([copy]);
            return true;
        }
        if (mod && key.toLowerCase() === "a") {
            this.pick(list.map((node) => node.id));
            return true;
        }
        if (key.length === 1 && !mod) {
            this.clearPicked();
            return false;
        }
        return false;
    }

    onCopy(event, cut) {
        if (!this.picked.length || this.sessionField) return;
        const places = this.picked.map((id) => locate(this.doc.root, id)).filter(isFlow).sort((a, b) => a.index - b.index);
        if (!places.length || !event.clipboardData) return;
        event.preventDefault();
        const nodes = places.map((place) => place.node);
        event.clipboardData.setData(NODES_TYPE, JSON.stringify(nodes));
        event.clipboardData.setData("text/plain", nodes.map((node) => inlineText(this.wordsFor(node))).join("\n\n"));
        if (cut) this.removeBlocks(places.map((place) => place.node.id));
        else this.toast(this.sfWord("copied-text"));
    }

    wordsFor(node) {
        const own = FIELDS[node.type]?.filter((entry) => entry.kind === "inline").flatMap((entry) => inlineOf(node, entry.key)) ?? [];
        const plain = FIELDS[node.type]?.filter((entry) => entry.kind === "plain").map((entry) => ({type: "text", value: String(node.data?.[entry.key] ?? "")})) ?? [];
        const inner = Object.values(node.slots ?? {}).flat().flatMap((child) => [{type: "text", value: " "}, ...this.wordsFor(child)]);
        return normalizeInline([...own, ...plain, ...inner]);
    }

    // ------------------------------------------------------------ paste

    onPaste(event, element) {
        const data = event.clipboardData;
        if (!data) return;
        const field = this.describe(element);
        if (field.kind === "plain") {
            event.preventDefault();
            event.stopPropagation();
            this.ownerDocument.execCommand("insertText", false, data.getData("text/plain"));
            return;
        }
        const own = data.getData(NODES_TYPE);
        let nodes = [];
        if (own) {
            try {
                nodes = JSON.parse(own).map((node) => cloneFresh(node, this.newId));
            } catch {
                nodes = [];
            }
        }
        if (!nodes.length) nodes = nodesFromClipboard(data, this.newId, this.ownerDocument);
        const place = locate(this.doc.root, field.id);
        const single = nodes.length === 1 && TEXT_BLOCKS.has(nodes[0].type) && !own;
        // One line, or a paste into a cell, a caption, a title: the words go where the caret is (sf-inline-editor does that).
        if (single || field.kind === "cell" || field.key !== "content" || !isFlow(place) || !TEXT_BLOCKS.has(place.node.type)) {
            if (!single && !own) {
                event.preventDefault();
                event.stopPropagation();
                const words = lineOf(data);
                if (words) this.ownerDocument.execCommand("insertText", false, words);
            }
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (!nodes.length) return;
        const value = this.valueOf(element);
        const {start, end} = this.caret(element);
        this.finishSession();
        this.remember();
        const [head] = split(value, start);
        const [, tail] = split(value, end);
        const list = place.parent.slots[place.slot];
        const add = [...nodes];
        if (inlineLength(tail)) add.push(this.paragraph(tail));
        if (!inlineLength(head) && place.node.type === "content.paragraph") list.splice(place.index, 1, ...add);
        else {
            setInline(place.node, "content", head);
            list.splice(place.index + 1, 0, ...add);
            this.redraw(place.node.id);
        }
        this.redrawFlow(place.parent.id, place.slot);
        this.enter(add.at(-1).id, "end");
        this.say(this.sfWord("pasted-text", {count: add.length, vars: {count: String(add.length)}}));
        this.changed("paste");
    }

    // ------------------------------------------------------------ keys

    onKeydown(event) {
        if (event.defaultPrevented || event.isComposing) return;
        const mod = event.metaKey || event.ctrlKey;
        const target = event.target;
        if (this.querySelector(".sf-content-editor-params")?.contains(target)) return;
        if (mod && event.key.toLowerCase() === "z") {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) this.restore(this.redoStack, this.undoStack);
            else this.restore(this.undoStack, this.redoStack);
            return;
        }
        if (mod && event.key.toLowerCase() === "y") {
            event.preventDefault();
            event.stopPropagation();
            this.restore(this.redoStack, this.undoStack);
            return;
        }
        const title = target.closest?.(".sf-content-editor-title");
        if (title) {
            if (event.key === "Enter" || (event.key === "ArrowDown" && this.onEdge(title, false))) {
                event.preventDefault();
                const first = this.flowOf(this.doc.root)[0];
                if (!first) {
                    this.remember();
                    this.doc.root.slots[FLOWS[this.doc.root.type]].push(this.paragraph());
                    this.redrawFlow(this.doc.root.id, FLOWS[this.doc.root.type]);
                    this.changed("insert");
                }
                this.enter(this.flowOf(this.doc.root)[0].id, 0, "first");
            }
            return;
        }
        const element = target.closest?.(".sf-content-editor-field");
        if (!element || !this.blocksElement?.contains(element)) {
            if (target === this.blocksElement && this.onPickedKey(event)) {
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }
        if (this.slash && this.slashKey_(event)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const field = this.describe(element);
        const stop = () => {
            event.preventDefault();
            event.stopPropagation();
        };
        const caret = this.caret(element);
        if (event.key === "Escape") {
            stop();
            this.pick([this.flowBlockOf(field.id)]);
            return;
        }
        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            stop();
            const id = this.flowBlockOf(field.id);
            const at = caret.start;
            this.finishSession();
            if (this.shift(id, event.key === "ArrowUp" ? -1 : 1)) {
                const again = this.fieldElement(field);
                if (again) this.activate(again, at);
            } else this.activate(element, at);
            return;
        }
        if (mod && event.key.toLowerCase() === "d") {
            stop();
            const copy = this.duplicate(this.flowBlockOf(field.id));
            if (copy) this.enter(copy, "end", "first");
            return;
        }
        if (mod && event.key.toLowerCase() === "a" && caret.start === 0 && this.lengthOf(element) > 0 && caret.end === this.lengthOf(element)) {
            stop();
            this.pick(this.flowOf(this.doc.root).map((node) => node.id));
            return;
        }
        if (field.kind === "plain") {
            this.onPlainKey(event, element, field, caret, stop);
            return;
        }
        if (field.kind === "cell" && event.key === "Tab") {
            stop();
            this.tableTab(element, field, event.shiftKey);
            return;
        }
        if (event.key === "Enter") {
            stop();
            this.onEnter(element, event);
            return;
        }
        if (event.key === "Backspace" && caret.collapsed && caret.start === 0) {
            if (this.onBackspace(element)) stop();
            return;
        }
        if (event.key === "Delete" && caret.collapsed && caret.start === this.lengthOf(element)) {
            if (this.onDelete(element)) stop();
            return;
        }
        if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !event.shiftKey && this.onEdge(element, event.key === "ArrowUp")) {
            const all = [this.querySelector(".sf-content-editor-title"), ...fieldsIn(this.blocksElement)].filter(Boolean);
            const next = all[all.indexOf(element) + (event.key === "ArrowUp" ? -1 : 1)];
            if (next) {
                stop();
                this.activate(next, event.key === "ArrowUp" ? "end" : 0);
            }
        }
    }

    onPlainKey(event, element, field, caret, stop) {
        const node = locate(this.doc.root, field.id)?.node;
        if (event.key === "Tab" && node?.type !== "content.tab") {
            stop();
            this.ownerDocument.execCommand("insertText", false, "  ");
            return;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey || node?.type === "content.tab")) {
            stop();
            if (node?.type === "content.tab") this.enter(this.flowOf(node)[0]?.id ?? node.id, 0, "first");
            else this.after(node.id);
            return;
        }
        if (event.key === "Backspace" && !element.textContent && node && isFlow(locate(this.doc.root, node.id))) {
            stop();
            const place = locate(this.doc.root, node.id);
            const previous = place.parent.slots[place.slot][place.index - 1];
            this.removeBlocks([node.id], {focus: "none"});
            if (previous) this.enter(previous.id, "end");
            return;
        }
        if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !event.shiftKey && this.onEdge(element, event.key === "ArrowUp")) {
            const all = [this.querySelector(".sf-content-editor-title"), ...fieldsIn(this.blocksElement)].filter(Boolean);
            const next = all[all.indexOf(element) + (event.key === "ArrowUp" ? -1 : 1)];
            if (next) {
                stop();
                this.activate(next, event.key === "ArrowUp" ? "end" : 0);
            }
        }
        void caret;
    }

    tableTab(element, field, back) {
        const node = locate(this.doc.root, field.id).node;
        const rows = node.data.rows;
        const columns = rows[0].length;
        let row = field.row;
        let column = field.column + (back ? -1 : 1);
        if (column >= columns) {
            column = 0;
            row += 1;
        }
        if (column < 0) {
            column = columns - 1;
            row -= 1;
        }
        if (row < 0) return;
        if (row >= rows.length) {
            this.finishSession();
            this.remember();
            rows.push(Array.from({length: columns}, () => []));
            this.redraw(node.id);
            this.changed("row");
        }
        this.activate(this.fieldElement({id: node.id, key: "rows", row, column}), "end");
    }

    /** Whether the caret stands on the first (up) or the last (down) line of a field. */
    onEdge(element, up) {
        const selection = this.ownerDocument.getSelection();
        if (!selection?.rangeCount || !selection.isCollapsed) return false;
        const rect = selection.getRangeAt(0).getClientRects()[0];
        if (!rect) return true;
        const box = element.getBoundingClientRect();
        const line = parseFloat(globalThis.getComputedStyle(element).lineHeight) || 24;
        return up ? rect.top - box.top < line * 0.8 : box.bottom - rect.bottom < line * 0.8;
    }

    // ------------------------------------------------------------ the gutter, its menus and the grip

    showGutter(id) {
        const element = this.blockElement(id);
        const gutter = this.querySelector(".sf-content-editor-gutter");
        if (!element || !gutter || this.dragging) return;
        this.gutterFor = id;
        const first = element.querySelector(".sf-content-editor-field") ?? element;
        const sheet = this.sheet.getBoundingClientRect();
        const line = first.getBoundingClientRect();
        const height = parseFloat(globalThis.getComputedStyle(first).lineHeight) || line.height;
        const top = line.top - sheet.top + Math.max(0, (Math.min(height, line.height || height) - gutter.offsetHeight) / 2);
        gutter.style.top = `${Math.round(top)}px`;
        gutter.classList.add("is-shown");
    }

    hideGutter() {
        this.querySelector(".sf-content-editor-gutter")?.classList.remove("is-shown");
    }

    onPointerMove(event) {
        if (this.dragging || event.pointerType === "touch") return;
        const element = event.target.closest?.(".sf-content-editor-blocks > .sf-content-editor-block");
        if (element) this.showGutter(element.dataset.sfNode);
    }

    openMenu(mode, anchor) {
        const menu = this.menu;
        if (!menu || !this.gutterFor) return;
        this.finishSession();
        this.menuMode = mode;
        this.menuFor = this.gutterFor;
        customElements.whenDefined("sf-context-menu").then(() => {
            menu.entries = mode === "plus" ? this.kindEntries() : this.blockEntries(this.menuFor);
            menu.toggleFor(anchor);
        });
    }

    kindEntries(current = "") {
        return this.offeredKinds().map((entry) => ({id: `kind:${entry.id}`, text: this.sfWord(`type-${entry.id}`), icon: entry.icon, keywords: this.sfWord(`find-${entry.id}`), ...(entry.hint ? {shortcut: entry.hint} : {}), ...(current === entry.id ? {current: true} : {})}));
    }

    blockEntries(id) {
        const place = locate(this.doc.root, id);
        if (!place) return [];
        const node = place.node;
        const list = place.parent.slots[place.slot];
        const entries = [];
        if (this.editorFields(node.type).length || node.type === "content.figure") entries.push({id: "params", text: this.sfWord("params-text"), icon: "tune"}, {type: "separator"});
        if (CONVERTIBLE.has(node.type)) {
            const turn = TURN_INTO.map(entryOf).filter((entry) => this.offeredKinds().includes(entry) || entry.id === "paragraph");
            entries.push({id: "turn", text: this.sfWord("turn-text"), icon: "swap_horiz", submenu: turn.map((entry) => ({id: `turn:${entry.id}`, text: this.sfWord(`type-${entry.id}`), icon: entry.icon, ...(kindOf(node) === entry.id ? {current: true} : {})}))}, {type: "separator"});
        }
        if (node.type === "content.table") {
            const rows = node.data.rows.length;
            const columns = node.data.rows[0].length;
            entries.push(
                {id: "row-add", text: this.sfWord("row-add-text"), icon: "add"},
                {id: "column-add", text: this.sfWord("column-add-text"), icon: "add"},
                {id: "row-remove", text: this.sfWord("row-remove-text"), icon: "remove", disabled: rows < 2},
                {id: "column-remove", text: this.sfWord("column-remove-text"), icon: "remove", disabled: columns < 2},
                {type: "separator"},
            );
        }
        entries.push(
            {id: "up", text: this.sfWord("up-text"), icon: "arrow_upward", shortcut: "Alt+↑", disabled: place.index === 0},
            {id: "down", text: this.sfWord("down-text"), icon: "arrow_downward", shortcut: "Alt+↓", disabled: place.index === list.length - 1},
            {id: "duplicate", text: this.sfWord("duplicate-text"), icon: "content_copy", shortcut: "⌘D"},
            {type: "separator"},
            {id: "remove", text: this.sfWord("delete-text"), icon: "delete", shortcut: "⌫", danger: true},
        );
        return entries;
    }

    onMenuSelect(event) {
        const choice = String(event.detail?.id ?? event.detail?.entry?.id ?? "");
        const id = this.menuFor;
        if (!choice || !id || choice === "turn") return;
        const node = locate(this.doc.root, id)?.node;
        if (!node) return;
        if (choice.startsWith("kind:")) {
            const entry = entryOf(choice.slice(5));
            if (node.type === "content.paragraph" && !inlineLength(inlineOf(node, "content"))) this.turnInto(id, entry);
            else this.insertKind(entry, id);
        } else if (choice.startsWith("turn:")) this.turnInto(id, entryOf(choice.slice(5)));
        else if (choice === "params") this.openParams(id, this.blockElement(id));
        else if (choice === "up") this.shift(id, -1);
        else if (choice === "down") this.shift(id, 1);
        else if (choice === "duplicate") {
            const copy = this.duplicate(id);
            if (copy) this.pick([copy]);
        } else if (choice === "remove") this.removeBlocks([id]);
        else if (choice.startsWith("row-") || choice.startsWith("column-")) this.changeTable(node, choice);
    }

    changeTable(node, choice) {
        const rows = node.data.rows;
        if ((choice === "row-remove" && rows.length < 2) || (choice === "column-remove" && rows[0].length < 2)) return;
        this.remember();
        if (choice === "row-add") rows.push(Array.from({length: rows[0].length}, () => []));
        if (choice === "column-add") rows.forEach((cells) => cells.push([]));
        if (choice === "row-remove") rows.pop();
        if (choice === "column-remove") rows.forEach((cells) => cells.pop());
        if (Array.isArray(node.props?.align) && node.props.align.length > rows[0].length) node.props.align.length = rows[0].length;
        this.redraw(node.id);
        this.changed("table");
    }

    // The grip: a press without a pull opens the block's menu, a pull moves the block.
    onGripDown(event) {
        if (event.button !== 0) return;
        const grip = event.currentTarget;
        const id = this.gutterFor;
        const element = this.blockElement(id);
        if (!element) return;
        event.preventDefault();
        grip.setPointerCapture?.(event.pointerId);
        const startY = event.clientY;
        let lastY = startY;
        let moved = false;
        let frame = 0;
        let seat = -1;
        const line = this.querySelector(".sf-content-editor-drop");
        const list = () => this.flowOf(this.doc.root);
        const seats = () => {
            const top = this.sheet.getBoundingClientRect().top;
            const tops = list().map((node) => this.blockElement(node.id).getBoundingClientRect().top - top);
            const last = this.blockElement(list().at(-1).id).getBoundingClientRect();
            tops.push(last.bottom - top);
            return tops;
        };
        const tick = () => {
            const scroller = this.closest("[data-sf-scroll]") ?? this.parentElement;
            const view = scroller?.getBoundingClientRect?.();
            if (view && scroller.scrollHeight > scroller.clientHeight) {
                if (lastY < view.top + 48) scroller.scrollTop -= 10;
                else if (lastY > view.bottom - 48) scroller.scrollTop += 10;
            }
            const y = lastY - this.sheet.getBoundingClientRect().top;
            const all = seats();
            let best = 0;
            all.forEach((value, index) => { if (Math.abs(value - y) < Math.abs(all[best] - y)) best = index; });
            seat = best;
            line.style.top = `${Math.round(all[best]) - 1}px`;
            line.hidden = false;
            frame = requestAnimationFrame(tick);
        };
        const move = (next) => {
            lastY = next.clientY;
            if (!moved && Math.abs(next.clientY - startY) > 4) {
                moved = true;
                this.dragging = true;
                this.finishSession();
                element.classList.add("is-dragging");
                frame = requestAnimationFrame(tick);
            }
        };
        const end = (drop) => {
            cancelAnimationFrame(frame);
            grip.removeEventListener("pointermove", move);
            grip.removeEventListener("pointerup", up);
            grip.removeEventListener("pointercancel", cancel);
            this.ownerDocument.removeEventListener("keydown", key, true);
            line.hidden = true;
            element.classList.remove("is-dragging");
            this.dragging = false;
            if (!moved) {
                if (drop) this.openMenu("block", grip);
                return;
            }
            if (!drop || seat < 0) return;
            const from = list().findIndex((node) => node.id === id);
            const to = seat > from ? seat - 1 : seat;
            if (to === from) return;
            this.remember();
            moveWithin(this.doc.root, id, to);
            this.redrawFlow(this.doc.root.id, FLOWS[this.doc.root.type]);
            this.say(this.sfWord("moved-text", {vars: {position: String(to + 1)}}));
            this.changed("move");
        };
        const up = () => end(true);
        const cancel = () => end(false);
        const key = (press) => {
            if (press.key === "Escape") {
                press.stopPropagation();
                end(false);
            }
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
        grip.addEventListener("pointercancel", cancel);
        this.ownerDocument.addEventListener("keydown", key, true);
    }

    onGripKey(event) {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            event.preventDefault();
            this.openMenu("block", event.currentTarget);
        }
    }

    // ------------------------------------------------------------ parameters

    /** The words of the parameters that differ from their defaults; null for a type without any. */
    paramsSummary(node) {
        const fields = this.editorFields(node.type);
        if (!fields.length) return null;
        const words = fields.filter((item) => item.plane === "props" && node.props && Object.hasOwn(node.props, item.key)).map((item) => {
            const value = node.props[item.key];
            if (item.kind === "choice") return this.choiceWord(item.key, value);
            if (item.kind === "toggle") return value ? this.paramWord(item.key) : this.sfWord("without-text", {vars: {name: this.paramWord(item.key).toLowerCase()}});
            return String(value);
        });
        return words.slice(0, 2).join(" · ");
    }

    paramWord(key) {
        const word = this.sfWord(`param-${key}`);
        return word === `param-${key}` ? key : word;
    }

    choiceWord(key, value) {
        const word = this.sfWord(`choice-${key}-${value}`);
        return word === `choice-${key}-${value}` ? String(value) : word;
    }

    openParams(id, anchor) {
        const place = locate(this.doc.root, id);
        const panel = this.querySelector(".sf-content-editor-params");
        if (!place || !panel) return;
        this.finishSession();
        this.paramsFor = id;
        this.paramsReturn = this.ownerDocument.activeElement;
        this.drawParams();
        panel.hidden = false;
        const box = (anchor?.querySelector?.(".sf-content-editor-tag") ?? anchor)?.getBoundingClientRect?.() ?? this.getBoundingClientRect();
        const own = panel.getBoundingClientRect();
        const top = box.bottom + 6 + own.height > globalThis.innerHeight - 8 ? Math.max(8, box.top - own.height - 6) : box.bottom + 6;
        Object.assign(panel.style, {top: `${top}px`, left: `${Math.max(8, Math.min(box.right - own.width, globalThis.innerWidth - own.width - 8))}px`});
        requestAnimationFrame(() => panel.querySelector("sf-switch, sf-dropdown, sf-input, input")?.focus?.());
    }

    closeParams({focus = true} = {}) {
        const panel = this.querySelector(".sf-content-editor-params");
        if (!panel || panel.hidden) return;
        panel.hidden = true;
        render(html``, panel);
        const id = this.paramsFor;
        this.paramsFor = "";
        if (focus && id && locate(this.doc.root, id)) this.pick([id]);
    }

    drawParams() {
        const panel = this.querySelector(".sf-content-editor-params");
        const node = locate(this.doc.root, this.paramsFor)?.node;
        if (!panel || !node) return;
        const fields = this.editorFields(node.type);
        const picture = node.type === "content.figure" || node.type === "content.media";
        const control = (item) => {
            const value = paramValue(node, item);
            const label = this.paramWord(item.key);
            if (item.kind === "toggle") return html`<sf-switch size="1/2" label=${label} ?checked=${value === true} data-param=${item.key}
                @change=${(event) => this.setParam(item, Boolean(event.target.checked ?? event.currentTarget.checked))}></sf-switch>`;
            if (item.kind === "choice") return html`<sf-dropdown size="1/2" label=${label} data-param=${item.key} .options=${item.choices.map((choice) => ({value: String(choice), text: this.choiceWord(item.key, choice)}))} value=${String(value ?? "")}
                @change=${(event) => this.setParam(item, String(event.detail?.value ?? event.currentTarget.value))}></sf-dropdown>`;
            const integer = item.kind === "integer";
            return html`<sf-input size="1/2" label=${label} data-param=${item.key} input-type=${integer ? "number" : "text"} value=${value === undefined || value === null ? "" : String(value)}
                @change=${(event) => {
                    event.stopPropagation();
                    const raw = String(event.detail?.value ?? event.target.value ?? "").trim();
                    if (!integer) this.setParam(item, raw);
                    else if (raw === "") this.setParam(item, undefined);
                    else if (Number.isInteger(Number(raw))) this.setParam(item, Math.max(item.constraints?.min ?? -Infinity, Math.min(item.constraints?.max ?? Infinity, Number(raw))));
                }}></sf-input>`;
        };
        render(html`
            <div class="sf-content-editor-params-head">
                <span class="sf-content-editor-params-title">${this.sfWord(`type-${kindOf(node) || "paragraph"}`)}</span>
                <sf-icon-button size="1/2" appearance="link" icon="close" aria-label=${this.sfWord("close-text")} title=${this.sfWord("close-text")} @click=${() => this.closeParams()}></sf-icon-button>
            </div>
            ${picture ? html`<sf-input size="1/2" label=${this.sfWord("param-src")} data-param="src" value=${String(node.data?.src ?? "")}
                @change=${(event) => { event.stopPropagation(); this.setSource(String(event.detail?.value ?? event.target.value ?? "").trim()); }}></sf-input>` : ""}
            ${fields.map(control)}
        `, panel);
    }

    setParam(item, value) {
        const node = locate(this.doc.root, this.paramsFor)?.node;
        if (!node || Object.is(paramValue(node, item), value)) return;
        this.remember();
        setParam(node, item, value);
        this.redraw(this.flowBlockOf(node.id) || node.id);
        this.say(this.sfWord("param-changed"));
        this.changed("params");
    }

    setSource(src) {
        const node = locate(this.doc.root, this.paramsFor)?.node;
        if (!node || node.data?.src === src) return;
        this.remember();
        node.data ??= {};
        node.data.src = src;
        this.redraw(node.id);
        this.changed("params");
    }

    // ------------------------------------------------------------ words for a reader

    say(text) {
        this.notice = text;
        const live = this.querySelector(".sf-content-editor-live");
        if (live) live.textContent = text;
    }

    toast(text) {
        this.say(text);
    }

    // ------------------------------------------------------------ wiring

    onConnected() {
        super.onConnected?.();
        this.listen();
    }

    onDisconnected() {
        this.finishSession();
        this.listening?.abort();
        this.listening = null;
        super.onDisconnected?.();
    }

    listen() {
        if (this.listening) return;
        this.listening = new AbortController();
        const signal = {signal: this.listening.signal};
        const doc = this.ownerDocument;
        this.addEventListener("keydown", (event) => this.onKeydown(event), {...signal, capture: true});
        for (const name of INLINE_EVENTS) {
            this.addEventListener(name, (event) => {
                // The inline editor speaks to whoever starts it; here that is
                // this element, which speaks to the page in its own events.
                event.stopPropagation();
                if (name === "sf-inline-editor-input") this.onFieldInput(event.target, event.detail.content);
                if (name === "sf-inline-editor-change" && event.target === this.sessionField) {
                    this.session = null;
                    queueMicrotask(() => this.afterSession());
                }
            }, signal);
        }
        // A plain field, a title, a parameter control: their own input and
        // change stay inside, stopped on the sheet's root (the template) before
        // they reach this element, where a host listens for its own change.
        this.addEventListener("pointerdown", (event) => this.onPointerDown(event), signal);
        this.addEventListener("focusin", (event) => this.onFocusIn(event), signal);
        this.addEventListener("click", (event) => this.onClick(event), signal);
        this.addEventListener("paste", (event) => {
            const element = event.target.closest?.(".sf-content-editor-field");
            if (element && this.blocksElement?.contains(element)) this.onPaste(event, element);
            else if (event.target.closest?.(".sf-content-editor-title")) {
                event.preventDefault();
                doc.execCommand("insertText", false, lineOf(event.clipboardData));
            }
        }, {...signal, capture: true});
        this.addEventListener("copy", (event) => this.onCopy(event, false), signal);
        this.addEventListener("cut", (event) => this.onCopy(event, true), signal);
        this.addEventListener("pointermove", (event) => this.onPointerMove(event), signal);
        this.addEventListener("pointerleave", () => { if (!this.dragging) this.hideGutter(); }, signal);
        this.addEventListener("sf-context-menu-select", (event) => {
            event.stopPropagation();
            this.onMenuSelect(event);
        }, signal);
        this.addEventListener("drop", (event) => event.preventDefault(), signal);
        doc.addEventListener("selectionchange", () => {
            if (!this.sessionField) return;
            requestAnimationFrame(() => this.placeToolbar());
        }, signal);
        globalThis.addEventListener("scroll", () => {
            if (this.sessionField) requestAnimationFrame(() => this.placeToolbar());
            this.closeSlash();
        }, {...signal, capture: true, passive: true});
        doc.addEventListener("pointerdown", (event) => {
            const panel = this.querySelector(".sf-content-editor-params");
            if (panel && !panel.hidden && !panel.contains(event.target) && !event.composedPath().some((node) => node?.classList?.contains?.("sf-dropdown-portal") || node?.localName === "sf-dropdown")) this.closeParams({focus: false});
        }, {...signal, capture: true});
    }

    /** input and change from inside: a plain field or the title is written; neither leaves the element. */
    onInner(event) {
        event.stopPropagation();
        if (event.type !== "input") return;
        const element = event.target.closest?.(".sf-content-editor-field[data-sf-kind='plain'], .sf-content-editor-title");
        if (!element) return;
        const before = this.lastSnapshot ?? this.snapshot();
        this.rememberTyping(before);
        this.write(element, element.textContent);
        this.lastSnapshot = this.snapshot();
        this.hideGutter();
        this.changed("typing");
    }

    onPointerDown(event) {
        if (event.button !== 0) return;
        if (this.picked.length && !event.target.closest?.(".sf-content-editor-gutter")) this.clearPicked();
        const element = event.target.closest?.(".sf-content-editor-field");
        if (!element || !this.blocksElement?.contains(element) || element.dataset.sfKind === "plain" || element === this.sessionField || element.hasAttribute("data-sf-inline-editing")) return;
        // Where the press lands is where the caret goes, read before the session draws the field again.
        const point = this.ownerDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
        const range = point ? {node: point.offsetNode, offset: point.offset} : (() => {
            const legacy = this.ownerDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
            return legacy ? {node: legacy.startContainer, offset: legacy.startOffset} : null;
        })();
        const at = range && element.contains(range.node) ? textOffset(element, range.node, range.offset) : "end";
        this.activate(element, at);
    }

    onFocusIn(event) {
        const element = event.target.closest?.(".sf-content-editor-field");
        // The focus a starting session gives its own field is not a new start.
        if (element && this.blocksElement?.contains(element) && element.dataset.sfKind !== "plain" && element !== this.sessionField && !this.session && !element.hasAttribute("data-sf-inline-editing")) {
            this.activate(element, "end");
        }
        if (element || event.target.closest?.(".sf-content-editor-title")) this.lastField = element ?? event.target;
    }

    onClick(event) {
        const fold = event.target.closest?.("[data-sf-fold]");
        if (fold) {
            const node = locate(this.doc.root, fold.dataset.sfFold)?.node;
            if (node) {
                this.folds.set(node.id, !this.viewContext().isOpen(node));
                this.redraw(node.id);
            }
            return;
        }
        const tag = event.target.closest?.("[data-sf-params]");
        if (tag) {
            const id = tag.closest(".sf-content-editor-block")?.dataset.sfNode;
            if (id) this.openParams(id, tag);
            return;
        }
        if (event.target.closest?.("a") && !(event.metaKey || event.ctrlKey)) event.preventDefault();
        // A press below the last block: a line to type in there.
        if (event.target === this.sheet || event.target === this.blocksElement) {
            const list = this.flowOf(this.doc.root);
            const last = list.at(-1);
            const bottom = last ? this.blockElement(last.id)?.getBoundingClientRect().bottom ?? 0 : 0;
            if (event.clientY <= bottom) return;
            if (last?.type === "content.paragraph" && !inlineLength(inlineOf(last, "content"))) this.enter(last.id, 0);
            else {
                this.remember();
                const line = this.paragraph();
                list.push(line);
                this.redrawFlow(this.doc.root.id, FLOWS[this.doc.root.type]);
                this.enter(line.id, 0);
                this.changed("insert");
            }
        }
    }

    afterUpdate(...rest) {
        super.afterUpdate?.(...rest);
        this.adopt();
    }

    templateContext() {
        return {
            component: this,
            label: this.label,
            titlePlaceholder: this.sfWord("title-placeholder"),
            titleLabel: this.sfWord("title-label"),
            plusLabel: this.sfWord("plus-label"),
            gripLabel: this.sfWord("grip-label"),
            slashLabel: this.sfWord("slash-label"),
            slashId: this.slashId(),
            paramsLabel: this.sfWord("params-label"),
            noticeText: this.notice,
            rootClass: this.getRootClass?.() ?? "",
        };
    }

    template() {
        return renderContentEditorTemplate(this.templateContext());
    }
}

SfContentEditor.define("sf-content-editor");
