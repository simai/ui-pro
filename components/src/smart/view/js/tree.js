// The tree a data view shows when its host answers in levels (data view port
// 1.8.0). The host answers one level at a time -- the roots, or one node's
// children after tree.expand -- and the view keeps what it has been told and
// which nodes are open. The rows the table draws are a walk of that, in order,
// each row knowing its level and its place among its siblings; nothing here
// builds a tree out of a flat dump or decides where a node may go.
export const ROOT = "\u0000root";

const keyOf = (parent) => (parent === null || parent === undefined ? ROOT : String(parent));

export function createTree() {
    return {nodes: new Map(), children: new Map(), expanded: new Set(), loading: new Set()};
}

/**
 * One level the host answered: the roots (parent null) or a node's children.
 * `append` keeps the children already known and adds the next page of them.
 */
export function acceptLevel(tree, {parent = null, records = [], hasNext = false, cursor = null, append = false} = {}) {
    const key = keyOf(parent);
    if (key === ROOT && !append) {
        tree.nodes.clear();
        tree.children.clear();
        tree.loading.clear();
        // Open nodes stay open across a re-read: a person who opened a branch
        // and saved a row does not want it closed under them. They are dropped
        // when the node is gone, by the walk, which never reaches them.
    }
    for (const record of records) tree.nodes.set(String(record.id), record);
    const before = append ? (tree.children.get(key)?.ids ?? []) : [];
    const seen = new Set(before);
    const ids = [...before, ...records.map((record) => String(record.id)).filter((id) => !seen.has(id))];
    tree.children.set(key, {ids, hasNext: Boolean(hasNext), cursor: cursor ?? null});
    if (key !== ROOT) {
        tree.expanded.add(key);
        tree.loading.delete(key);
    }
    return tree;
}

/** Whether a node's children are already known, so opening it needs no host. */
export function hasLevel(tree, id) {
    return tree.children.has(keyOf(id));
}

export function collapse(tree, id) {
    tree.expanded.delete(String(id));
    return tree;
}

export function expandKnown(tree, id) {
    tree.expanded.add(String(id));
    return tree;
}

export function markLoading(tree, id) {
    tree.loading.add(String(id));
    return tree;
}

/** Forget a node's children, so the next opening asks the host again. */
export function dropLevel(tree, id) {
    tree.children.delete(keyOf(id));
    tree.expanded.delete(String(id));
    return tree;
}

/**
 * The rows to draw: the known tree walked from the roots through every open
 * node. A row is the record with `__tree` beside it -- the level from 0, whether
 * it has children and is open, and its place among its siblings for
 * aria-setsize and aria-posinset. A level with more to come ends in a row of
 * its own, `__tree.more`, which asks for the next page.
 */
export function visibleRows(tree) {
    const rows = [];
    const walk = (key, level) => {
        const entry = tree.children.get(key);
        if (!entry) return;
        entry.ids.forEach((id, index) => {
            const record = tree.nodes.get(id);
            if (!record) return;
            const expanded = tree.expanded.has(id) && tree.children.has(id);
            rows.push({
                ...record,
                __tree: {
                    level: Number.isInteger(record.level) ? record.level : level,
                    hasChildren: record.has_children === true,
                    expanded,
                    loading: tree.loading.has(id),
                    setsize: entry.ids.length,
                    posinset: index + 1,
                },
            });
            if (expanded) walk(id, level + 1);
        });
        if (entry.hasNext) {
            rows.push({
                id: `__more:${key === ROOT ? "" : key}`,
                __tree: {level, more: true, parent: key === ROOT ? null : key, cursor: entry.cursor},
            });
        }
    };
    walk(ROOT, 0);
    return rows;
}

/** Every record the tree knows, open or not: what an action is checked against. */
export function knownRecords(tree) {
    return [...tree.nodes.values()];
}
