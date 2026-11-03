// The one catalogue of sf-editor: every way to insert (the + between blocks,
// / in text, the library on the left) reads it. It is Part A's catalogue of
// the registry (tabs Text and Blocks, the fixed groups, variants) narrowed to
// a place: what a slot cannot take is hidden, not greyed out, and a tab with
// nothing that fits is left out. Search covers names, keywords and the group
// in both languages; Favourites and Recent sit on top. A variant's picture is
// drawn from the variant itself (skeleton), never by hand.
import Composition from "../../../core/js/composition/index.mjs";
import {isComposed} from "../../../core/js/composition/composed.mjs";
import {childrenOf, isPlainObject} from "./tree.mjs";

export const TABS = Object.freeze(["text", "blocks"]);
const TEXT_FLOWS = new Set(["layout.area", "content.document", "content.quote", "content.alert", "content.details", "content.step", "content.tab", "content.card", "content.list-item", "content.grid", "content.media"]);
const RECENT_LIMIT = 8;

/** The word of a type with no label_key of its own: type-<type with dashes>, from the editor's lang files. */
export const typeWordKey = (type) => `type-${String(type).replace(/[^a-z0-9]+/gu, "-")}`;

/** The key of a catalogue item: its type and variant. */
export const itemKey = (item) => `${item.type}${item.variant ? `#${item.variant}` : ""}`;

/** Which tab a place opens on: inside a text flow, Text; between sections, Blocks. */
export function tabForPlace(model, place) {
    const parent = place ? model.node(place.parent) : null;
    return parent && TEXT_FLOWS.has(parent.type) ? "text" : "blocks";
}

/**
 * The items a place takes (or, with no place, those that have some place in
 * the page): each type once, or once per variant. `word(key)` names them.
 */
export function itemsFor(model, place, word = (key) => key) {
    const registry = model.registry;
    const listed = Composition.catalogue(registry, place ? {parent: model.node(place.parent)?.type, slot: place.slot} : {}).entries;
    const items = [];
    for (const entry of listed) {
        const manifest = registry.types.get(entry.type);
        if (!model.rights.layout && manifest.category === "layout") continue;
        if (place ? !model.accepts(place.parent, place.slot, entry.type) || model.placeLock(place.parent) : !model.placeFor(entry.type)) continue;
        const base = {type: entry.type, group: entry.group, tab: entry.tab, order: entry.order, keywords: entry.keywords ?? {}, site: isComposed(manifest)};
        const typeKey = entry.label_key ?? typeWordKey(entry.type);
        const typeLabel = word(typeKey);
        if (entry.variants.length) {
            for (const variant of entry.variants) items.push({...base, variant: variant.id, label: word(variant.label_key), labelKeys: [variant.label_key, typeKey], typeLabel, ...(variant.preview ? {preview: variant.preview} : {})});
        } else items.push({...base, label: typeLabel, labelKeys: [typeKey], typeLabel, ...(entry.preview ? {preview: entry.preview} : {})});
    }
    return items;
}

/**
 * The catalogue at a place: {tab, tabs: [{id, groups: [{id, items}]}]}, the
 * tab the place opens on first; tabs with nothing are left out.
 */
export function catalogueAt(model, place, {word = (key) => key, groups = []} = {}) {
    const items = itemsFor(model, place, word);
    const tabs = TABS.map((id) => {
        const own = items.filter((item) => item.tab === id);
        const order = [...groups, ...new Set(own.map((item) => item.group))];
        const named = [...new Set(order)].map((group) => ({id: group, items: own.filter((item) => item.group === group)})).filter((group) => group.items.length);
        return {id, groups: named, count: own.length};
    }).filter((tab) => tab.count);
    const wanted = tabForPlace(model, place);
    const tab = tabs.some((entry) => entry.id === wanted) ? wanted : tabs[0]?.id ?? wanted;
    return {tab, tabs, items};
}

/**
 * Search across every tab and group: names, keywords and the group, in every
 * language given. `words(key)` gives a word in every language (the editor's
 * and the host's), so a block is found by its name in any of them.
 */
export function searchItems(items, query, {word = (key) => key, words = () => [], locales = ["en", "ru"]} = {}) {
    const wanted = String(query ?? "").trim().toLowerCase();
    if (!wanted) return items;
    const parts = wanted.split(/\s+/u);
    return items.filter((item) => {
        const haystack = [
            item.label, item.typeLabel, item.type, item.variant ?? "", word(`group-${item.group}`),
            ...(item.labelKeys ?? []).flatMap((key) => words(key)), ...words(`group-${item.group}`),
            ...locales.flatMap((locale) => item.keywords?.[locale] ?? []),
        ].join(" ").toLowerCase();
        return parts.every((part) => haystack.includes(part));
    });
}

/** Recent: the newest first, each once, at most eight. */
export function pushRecent(recent, item) {
    const key = typeof item === "string" ? item : itemKey(item);
    return [key, ...(Array.isArray(recent) ? recent : []).filter((entry) => entry !== key)].slice(0, RECENT_LIMIT);
}

export function toggleFavourite(favourites, item) {
    const key = typeof item === "string" ? item : itemKey(item);
    const list = Array.isArray(favourites) ? favourites : [];
    return list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key];
}

/** The items of a key list that this place takes, in the list's order. */
export function pick(items, keys) {
    const byKey = new Map(items.map((item) => [itemKey(item), item]));
    return (Array.isArray(keys) ? keys : []).map((key) => byKey.get(key)).filter(Boolean);
}

/**
 * A variant's picture as a skeleton: the variant's own tree, with text as
 * bars, a heading a thicker bar, a picture a tinted box, a button an accent
 * pill, the grid by its columns. [{kind, columns?, children?}]
 */
export function skeletonOf(model, item) {
    const manifest = model.registry.types.get(item.type);
    if (!manifest) return [];
    const node = isComposed(manifest) ? manifest.composed.root : model.sample(item);
    return node ? [shapeOf(node, model)] : [];
}

function columnsOf(value) {
    if (Number.isInteger(value)) return value;
    if (isPlainObject(value)) return Number(value.lg ?? value.md ?? value.xs ?? 1) || 1;
    return 1;
}

function shapeOf(node, model) {
    const children = childrenOf(node).map((child) => shapeOf(child.node, model));
    switch (node.type) {
    case "content.heading": return {kind: "heading", level: node.data?.level ?? 2};
    case "content.paragraph":
    case "content.list-item": return {kind: "text"};
    case "content.list": return {kind: "list", children};
    case "content.figure":
    case "content.media": return {kind: "picture", children};
    case "content.divider": return {kind: "line"};
    case "content.code":
    case "content.table": return {kind: "box"};
    case "layout.columns": return {kind: "row", columns: Math.min(4, children.length || columnsOf(node.props?.columns)), children};
    default: {
        if (/button/u.test(node.type)) return {kind: "button"};
        const columns = columnsOf(node.props?.columns ?? node.props?.cols);
        // A block with data draws its records as the variant lays them out:
        // cards in its columns, or one under another, below its own slots (an
        // intro heading). Variants that differ by their columns so look apart.
        if (model.registry.types.get(node.type)?.data_bindings) {
            const records = columns > 1
                ? {kind: "row", columns: Math.min(4, columns), children: Array.from({length: Math.min(4, columns)}, () => ({kind: "card"}))}
                : {kind: "stack", children: [{kind: "card"}, {kind: "card"}]};
            return children.length ? {kind: "stack", children: [...children, records]} : records;
        }
        if (!children.length) return {kind: "box"};
        return columns > 1 ? {kind: "row", columns, children} : {kind: "stack", children};
    }
    }
}
