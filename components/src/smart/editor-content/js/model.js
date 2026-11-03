// The Document side of sf-editor-content: where each type keeps its text, which
// of its slots are a flow of blocks, and the few changes typing makes (split,
// merge, convert, insert, remove, move). Everything here works on a Composition
// Document of the profile structured-content (composition-content-types.md in
// ui-source) and keeps what it does not change: a node's presentation,
// bindings, extensions and any data or props key the editor does not know stay
// as they were, and a type it does not know is never opened.
import {inlineLength, inlineText, normalizeInline, sliceInline} from "../../../core/js/composition/inline-model.mjs";

// The editable surfaces of each type, in reading order. `inline` is the inline
// model of content.paragraph, edited through sf-editor-inline; `plain` is text
// as it is (code, raw markup, a label); `cells` is a table's rows of inline
// cells. `optional` means the key is written only when it holds something.
export const FIELDS = Object.freeze({
    "content.paragraph": [{key: "content", kind: "inline"}],
    "content.heading": [{key: "content", kind: "inline"}],
    "content.list-item": [{key: "content", kind: "inline"}],
    "content.alert": [{key: "title", kind: "inline", optional: true}],
    "content.details": [{key: "summary", kind: "inline"}],
    "content.step": [{key: "title", kind: "inline", optional: true}],
    "content.figure": [{key: "caption", kind: "inline", optional: true}],
    "content.file": [{key: "label", kind: "plain", optional: true}],
    "content.table": [{key: "rows", kind: "cells"}, {key: "caption", kind: "inline", optional: true}],
    "content.code": [{key: "code", kind: "plain"}],
    "content.html": [{key: "markup", kind: "plain"}],
    "content.tab": [{key: "label", kind: "plain"}],
    "content.diagram": [{key: "source", kind: "plain"}],
    "content.math": [{key: "source", kind: "plain"}],
});

// The slots that hold a flow of blocks (typing goes on inside them), and the
// slots that hold a type's own items.
export const FLOWS = Object.freeze({
    "content.document": "default",
    "content.quote": "default",
    "content.alert": "default",
    "content.details": "default",
    "content.step": "default",
    "content.tab": "default",
    "content.grid": "default",
    "content.card": "default",
    "content.media": "default",
    "content.list-item": "default",
});
export const ITEMS = Object.freeze({
    "content.list": {slot: "items", type: "content.list-item"},
    "content.steps": {slot: "steps", type: "content.step"},
    "content.tabs": {slot: "tabs", type: "content.tab"},
});

export const KNOWN = new Set([...Object.keys(FIELDS), ...Object.keys(FLOWS), ...Object.keys(ITEMS), "content.divider"]);
// A block whose words can join the block before it, and take one in.
export const TEXT_BLOCKS = new Set(["content.paragraph", "content.heading"]);

const children = (node, slot) => {
    node.slots ??= {};
    return (node.slots[slot] ??= []);
};

/** Where a node stands: its parent, the parent's slot and its index there. */
export function locate(root, id) {
    if (root.id === id) return {node: root, parent: null, slot: "", index: 0};
    const walk = (parent) => {
        for (const [slot, list] of Object.entries(parent.slots ?? {})) {
            for (const [index, node] of list.entries()) {
                if (node.id === id) return {node, parent, slot, index};
                const found = walk(node);
                if (found) return found;
            }
        }
        return null;
    };
    return walk(root);
}

const ids = (node, into = new Set()) => {
    into.add(node.id);
    for (const child of Object.values(node.slots ?? {}).flat()) ids(child, into);
    return into;
};

/** Makes new ids for the editor's nodes: `<prefix><n>`, never one in use. */
export function idMaker(root, prefix = "n") {
    const taken = ids(root);
    let count = taken.size;
    return () => {
        let id;
        do id = `${prefix}${(count += 1).toString(36)}`; while (taken.has(id));
        taken.add(id);
        return id;
    };
}

export const isFlow = (place) => Boolean(place?.parent && FLOWS[place.parent.type] === place.slot);

/** The inline value of a field, [] when there is none. */
export function inlineOf(node, key) {
    const value = node.data?.[key];
    return Array.isArray(value) ? value : [];
}

/** Writes an inline field; an optional one that is empty is taken out. */
export function setInline(node, key, content) {
    const field = FIELDS[node.type]?.find((entry) => entry.key === key);
    const value = normalizeInline(content);
    node.data ??= {};
    if (field?.optional && !inlineLength(value)) delete node.data[key];
    else node.data[key] = value;
    if (!Object.keys(node.data).length) delete node.data;
}

export function setPlain(node, key, text) {
    node.data ??= {};
    const value = String(text ?? "");
    // An optional key holds something or is not written (a file's label).
    if (!value && FIELDS[node.type]?.find((entry) => entry.key === key)?.optional) delete node.data[key];
    else node.data[key] = value;
}

export function setCell(node, row, column, content) {
    const rows = node.data.rows;
    rows[row][column] = normalizeInline(content);
}

const text = (value) => (value ? [{type: "text", value}] : []);

/** A new node of a type, with what it needs to be valid and one place to type. */
export function blank(type, next, seed = []) {
    const id = next();
    const paragraph = (content = []) => ({id: next(), type: "content.paragraph", data: {content}});
    switch (type) {
    case "content.paragraph": return {id, type, data: {content: seed}};
    case "content.heading": return {id, type, data: {level: 2, content: seed}};
    case "content.list": return {id, type, slots: {items: [{id: next(), type: "content.list-item", data: {content: seed}}]}};
    case "content.list-item": return {id, type, data: {content: seed}};
    case "content.quote": return {id, type, slots: {default: [paragraph(seed)]}};
    case "content.alert": return {id, type, slots: {default: [paragraph(seed)]}};
    case "content.details": return {id, type, props: {open: true}, data: {summary: seed}, slots: {default: [paragraph()]}};
    case "content.steps": return {id, type, slots: {steps: [{id: next(), type: "content.step", data: {title: seed}, slots: {default: []}}]}};
    case "content.step": return {id, type, slots: {default: []}};
    case "content.code": return {id, type, data: {code: inlineText(seed)}};
    case "content.divider": return {id, type};
    case "content.table": return {id, type, data: {rows: [[[], [], []], [[], [], []], [[], [], []]]}};
    case "content.figure": return {id, type, data: {src: "", alt: ""}};
    case "content.file": return {id, type, data: {href: ""}};
    case "content.tabs": return {id, type, slots: {tabs: [{id: next(), type: "content.tab", data: {label: "1"}, slots: {default: [paragraph()]}}]}};
    case "content.tab": return {id, type, data: {label: ""}, slots: {default: [paragraph()]}};
    case "content.grid": return {id, type, slots: {default: [paragraph(), paragraph()]}};
    case "content.card": return {id, type, slots: {default: [paragraph(seed)]}};
    case "content.html": return {id, type, data: {markup: inlineText(seed)}};
    default: return {id, type};
    }
}

/** The words a block holds, joined, so a change of kind keeps them. */
export function wordsOf(node) {
    if (node.type === "content.code") return text(node.data?.code);
    if (node.type === "content.list") return (node.slots?.items ?? []).flatMap((item, index) => [...(index ? text(" ") : []), ...inlineOf(item, "content")]);
    if (FIELDS[node.type]?.[0]?.kind === "inline") {
        const own = inlineOf(node, FIELDS[node.type][0].key);
        if (own.length) return own;
    }
    const flow = FLOWS[node.type];
    if (flow) return (node.slots?.[flow] ?? []).flatMap((child, index) => [...(index ? text(" ") : []), ...wordsOf(child)]);
    return [];
}

// What a block may turn into from the grip menu and the / menu, and what it
// becomes: the words are kept, the rest is the new kind's own.
export const CONVERTIBLE = new Set(["content.paragraph", "content.heading", "content.list", "content.quote", "content.alert", "content.code"]);

export function convert(node, type, next, options = {}) {
    const words = wordsOf(node);
    const fresh = blank(type, next, words);
    if (type === "content.heading") fresh.data.level = options.level ?? 2;
    if (type === "content.list" && options.ordered) fresh.props = {ordered: true};
    // A list keeps its items when it only changes between kinds of list.
    if (type === "content.list" && node.type === "content.list") fresh.slots.items = node.slots.items;
    return {...fresh, id: node.id};
}

/** Splits inline content at an offset: [before, after]. */
export function split(content, at) {
    return [sliceInline(content, 0, at), sliceInline(content, at, inlineLength(content))];
}

export const join = (first, second) => normalizeInline([...first, ...second]);

export function insertAt(root, parentId, slot, index, ...nodes) {
    const parent = locate(root, parentId)?.node;
    if (!parent) return false;
    const list = children(parent, slot);
    list.splice(Math.max(0, Math.min(index, list.length)), 0, ...nodes);
    return true;
}

export function removeNode(root, id) {
    const at = locate(root, id);
    if (!at?.parent) return null;
    at.parent.slots[at.slot].splice(at.index, 1);
    return at;
}

export function replaceNode(root, id, node) {
    const at = locate(root, id);
    if (!at?.parent) return false;
    at.parent.slots[at.slot][at.index] = node;
    return true;
}

/** Moves a node within its own slot, to `index` among its siblings. */
export function moveWithin(root, id, index) {
    const at = locate(root, id);
    if (!at?.parent) return false;
    const list = at.parent.slots[at.slot];
    const to = Math.max(0, Math.min(index, list.length - 1));
    if (to === at.index) return false;
    list.splice(at.index, 1);
    list.splice(to, 0, at.node);
    return true;
}

/** A copy with new ids all through it. */
export function cloneFresh(node, next) {
    const copy = structuredClone(node);
    const renew = (current) => {
        current.id = next();
        for (const list of Object.values(current.slots ?? {})) list.forEach(renew);
    };
    renew(copy);
    return copy;
}

/** A parameter's value as the editor manifest reads it: the node's, else its default. */
export function paramValue(node, field) {
    const plane = field.plane === "data" ? node.data : node.props;
    return plane && Object.hasOwn(plane, field.key) ? plane[field.key] : field.default;
}

/**
 * Writes a parameter. A props value equal to its default is taken out, and
 * so is a props object left empty: only what differs is written (section 7).
 */
export function setParam(node, field, value) {
    const planeName = field.plane === "data" ? "data" : "props";
    const empty = value === "" || value === null || value === undefined;
    node[planeName] ??= {};
    if ((planeName === "props" && Object.is(value, field.default)) || (empty && !field.required)) delete node[planeName][field.key];
    else node[planeName][field.key] = value;
    if (!Object.keys(node[planeName]).length) delete node[planeName];
}
