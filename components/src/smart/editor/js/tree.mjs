// The tree of a Composition Document as sf-editor walks it: where a node
// stands, its ancestors, its children in slot order, and new ids. Pure
// functions over plain JSON; nothing here knows about the page.

export const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
export const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** The children of a node in slot order: [{slot, index, node}]. */
export function childrenOf(node) {
    const out = [];
    for (const [slot, list] of Object.entries(isPlainObject(node?.slots) ? node.slots : {})) {
        (Array.isArray(list) ? list : []).forEach((child, index) => out.push({slot, index, node: child}));
    }
    return out;
}

/** Calls visit(node, parent, slot, index) for every node, parents first. */
export function walk(root, visit, parent = null, slot = "", index = 0) {
    if (!isPlainObject(root)) return;
    if (visit(root, parent, slot, index) === false) return;
    for (const child of childrenOf(root)) walk(child.node, visit, root, child.slot, child.index);
}

/** Where a node stands: {node, parent, slot, index, ancestors} (ancestors from the root down to the parent), or null. */
export function locate(root, id) {
    if (!root) return null;
    if (root.id === id) return {node: root, parent: null, slot: "", index: 0, ancestors: []};
    const trail = [root];
    const search = (node) => {
        for (const child of childrenOf(node)) {
            if (child.node.id === id) return {node: child.node, parent: node, slot: child.slot, index: child.index, ancestors: [...trail]};
            trail.push(child.node);
            const found = search(child.node);
            trail.pop();
            if (found) return found;
        }
        return null;
    };
    return search(root);
}

/** Every id of a subtree. */
export function idsOf(node, into = new Set()) {
    walk(node, (current) => { into.add(current.id); });
    return into;
}

/** Makes ids `<prefix><n>` that no node of the tree holds; `taken` grows as ids are given. */
export function idMaker(root, prefix = "e") {
    const taken = idsOf(root);
    let count = taken.size;
    const next = () => {
        let id;
        do id = `${prefix}${(count += 1).toString(36)}`; while (taken.has(id));
        taken.add(id);
        return id;
    };
    next.reserve = (node) => idsOf(node, taken);
    return next;
}

/** A copy of a subtree with new ids all through it; runtime links inside follow the ids. */
export function freshCopy(node, next) {
    const copy = clone(node);
    const map = new Map();
    walk(copy, (current) => {
        const id = next();
        map.set(current.id, id);
        current.id = id;
    });
    walk(copy, (current) => {
        if (!Array.isArray(current.bindings)) return;
        current.bindings = current.bindings.map((binding) => {
            if (binding?.owner !== "section" || typeof binding.ref !== "string") return binding;
            const [from, state] = binding.ref.split("#");
            return map.has(from) ? {...binding, ref: `${map.get(from)}#${state}`} : binding;
        });
    });
    return copy;
}

/** The list of a slot, made when it is missing. */
export function slotList(node, slot) {
    node.slots ??= {};
    node.slots[slot] ??= [];
    return node.slots[slot];
}

export function insertAt(parent, slot, index, node) {
    const list = slotList(parent, slot);
    list.splice(Math.max(0, Math.min(index, list.length)), 0, node);
}

export function removeAt(parent, slot, index) {
    const list = parent.slots?.[slot];
    if (!Array.isArray(list)) return null;
    return list.splice(index, 1)[0] ?? null;
}

/** Whether `id` stands inside the subtree of `ancestorId` (or is it). */
export function within(root, ancestorId, id) {
    const at = locate(root, ancestorId);
    if (!at) return false;
    let found = false;
    walk(at.node, (current) => {
        if (current.id === id) found = true;
        return !found;
    });
    return found;
}
