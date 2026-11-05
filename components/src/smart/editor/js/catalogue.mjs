// The one catalogue of sf-editor: every way to insert (the + between blocks,
// / in text, the library on the left) reads it. It is Part A's catalogue of
// the registry (tabs Text and Blocks, the fixed groups, variants) narrowed to
// a place: what a slot cannot take is hidden, not greyed out, and a tab with
// nothing that fits is left out. Search covers names, keywords and the group
// in both languages; Favourites and Recent sit on top. A variant's picture is
// drawn from the variant itself (skeleton), never by hand.
//
// Since 1.1.0 (visual parity, 2026-11-04) the library is a list of sections,
// each with the Framework's icon and word (CATALOGUE_GROUP_TABLE) and a count,
// in the Framework's order (CATALOGUE_GROUPS); a product's own group follows.
//
// Since 1.2.0 (the ui-editor host's G-20, 2026-11-04) the + and / catalogue
// are that same list of sections (no Text/Blocks tabs): the + between
// sections opens on the sections, the + in a text flow and / on Text. A type
// stands in its own section and in each also_in section (core.runtime
// 1.27.0), counted in each; a search lists it once, under its own section.
import Composition from "../../../core/js/composition/index.mjs";
import {CATALOGUE_GROUPS, CATALOGUE_GROUP_TABLE} from "../../../core/js/composition/catalogue.mjs";
import {isComposed} from "../../../core/js/composition/composed.mjs";
import {childrenOf, isPlainObject} from "./tree.mjs";

export const TABS = Object.freeze(["text", "blocks"]);
const TEXT_FLOWS = new Set(["layout.area", "content.document", "content.quote", "content.alert", "content.details", "content.step", "content.tab", "content.card", "content.list-item", "content.grid", "content.media"]);
const RECENT_LIMIT = 8;
// A product group the Framework does not name (a type's own namespace) gets this icon.
const OTHER_GROUP_ICON = "widgets";
const OTHER_TYPE_ICON = "widgets";

/** The word key of a catalogue group: the Framework's for its own groups, group-<id> for a product's. */
export const groupWordKey = (group) => CATALOGUE_GROUP_TABLE[group]?.label_key ?? `group-${group}`;

/** The icon of a catalogue group (a SIMAI Framework icon name). */
export const groupIcon = (group) => CATALOGUE_GROUP_TABLE[group]?.icon ?? OTHER_GROUP_ICON;

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
        const base = {type: entry.type, group: entry.group, groups: [entry.group, ...(entry.also_in ?? [])], tab: entry.tab, order: entry.order, icon: entry.icon ?? groupIcon(entry.group) ?? OTHER_TYPE_ICON, keywords: entry.keywords ?? {}, site: isComposed(manifest), variants: entry.variants.length};
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

/** The section a place opens on: Text inside a text flow and for /, the list of sections between blocks. */
export function sectionForPlace(model, place, mode = "plus") {
    return mode === "slash" || tabForPlace(model, place) === "text" ? "text" : "";
}

/**
 * The library's sections: [{id, icon, labelKey, count, types: [{type, label,
 * icon, site, items}]}], the Framework's groups in its order, then a
 * product's own; a section with nothing is left out. A type with variants
 * holds one item per variant, a type without one item; count is the types.
 * A type stands in each of its groups (also_in), unless `own` (a search):
 * then under its own group only, so it is named once.
 */
export function sectionsOf(items, {own = false} = {}) {
    const groupsOf = (item) => (own || !Array.isArray(item.groups) ? [item.group] : item.groups);
    const order = [...CATALOGUE_GROUPS, ...new Set(items.flatMap(groupsOf))];
    return [...new Set(order)].map((id) => {
        const types = [];
        // A section's own blocks first, then those that also stand in it
        // (also_in), as the prototype lists the button last in Text.
        const here = items.filter((entry) => groupsOf(entry).includes(id));
        for (const item of [...here.filter((entry) => entry.group === id), ...here.filter((entry) => entry.group !== id)]) {
            let type = types.find((entry) => entry.type === item.type);
            if (!type) {
                type = {type: item.type, label: item.typeLabel, icon: item.icon, site: item.site, items: []};
                types.push(type);
            }
            type.items.push(item);
        }
        return {id, icon: groupIcon(id), labelKey: groupWordKey(id), count: types.length, types};
    }).filter((section) => section.count);
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
            item.label, item.typeLabel, item.type, item.variant ?? "", word(groupWordKey(item.group)),
            ...(item.labelKeys ?? []).flatMap((key) => words(key)), ...words(groupWordKey(item.group)),
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
 * A variant's picture as a skeleton: the variant's own tree with its type's
 * effective values (parameter_defaults under its own props), so two variants
 * that differ look apart. Text is bars, a heading a thicker bar, a picture a
 * tinted box, a button an accent pill (outlined when it is outlined), an icon
 * or an icon button an accent dot, a badge a short pill, a section its
 * background and width, a grid its columns, a spacer a gap.
 * [{kind, columns?, look?, background?, width?, children?}]
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

/** What a node prints: its own props over its type's parameter defaults. */
function propsOf(node, model) {
    const manifest = model.registry.types.get(node.type);
    return Composition.effectiveProps ? Composition.effectiveProps(node, manifest) : (node.props ?? {});
}

/** A row of `columns` cells holding the children, empty cells where a column has none. */
function rowOf(columns, children, cell = {kind: "cell"}) {
    const count = Math.max(1, Math.min(4, columns));
    const cells = Array.from({length: count}, (_, index) => children[index] ?? cell);
    return {kind: "row", columns: count, children: cells};
}

function shapeOf(node, model) {
    const children = childrenOf(node).map((child) => shapeOf(child.node, model));
    const props = propsOf(node, model);
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
    case "content.card": return {kind: "card"};
    case "element.button": return {kind: "button", look: props.appearance === "outline" ? "outline" : "fill", icon: Boolean(props.icon)};
    case "element.button-icon":
    case "element.icon": return {kind: "dot"};
    case "element.badge": return {kind: "badge"};
    case "layout.spacer": return {kind: "gap"};
    case "form.input":
    case "form.select": return {kind: "field"};
    case "form.textarea": return {kind: "field", tall: true};
    case "form.checkbox":
    case "form.switch": return {kind: "text"};
    case "form.form": return {kind: "stack", children: children.length ? children : [{kind: "field"}, {kind: "field"}, {kind: "button", look: "fill"}]};
    case "layout.area": return {kind: "stack", children: children.length ? children : [{kind: "heading", level: 3}, {kind: "text"}, {kind: "text"}]};
    case "layout.columns": return rowOf(children.length || columnsOf(props.columns), children);
    case "layout.grid": return rowOf(columnsOf(props.columns), children.length ? children : [], {kind: "card"});
    case "layout.section":
    case "layout.container": {
        const columns = columnsOf(props.columns);
        const inner = columns > 1 ? [rowOf(columns, children)] : children.length ? children : [{kind: "box"}];
        return {kind: "section", background: String(props.background ?? "none"), width: String(props.width ?? "full"), children: inner};
    }
    default: {
        if (/button/u.test(node.type)) return {kind: "button", look: "fill"};
        const columns = columnsOf(props.columns ?? props.cols);
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
