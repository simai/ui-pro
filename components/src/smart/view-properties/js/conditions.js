// A field's conditions (port 1.14.0, Larena 2026-10-23): when it is shown,
// required and enabled, each a condition over the other fields' values as they
// stand on screen -- what the record holds, or what the person has changed it to
// and not saved yet. Plain functions, no rendering: the component evaluates them
// on every render, so a field appears the moment the value it waits for is
// chosen, and the contract test runs them without a DOM.
//
// The grammar is the port's, and small on purpose:
//
//   {field, op, value}   op: eq, ne, in, not_in (value a list), empty, not_empty
//   {all: [...]}         every condition holds
//   {any: [...]}         at least one holds
//   {not: {...}}         the condition does not hold
//
// Nothing in the Framework had a condition grammar to reuse: the data view's
// filters are the host's query, not a predicate the component runs.

export const CONDITION_OPS = Object.freeze(["eq", "ne", "in", "not_in", "empty", "not_empty"]);

// A value is compared by what it is, not by how it is shown: a lookup's
// {value, label} and a formatted {value, text} by their `value`. Text on both
// sides, because a host sends 5 in one place and "5" in another and means the
// same thing by both.
const scalar = (value) => (value && typeof value === "object" && !Array.isArray(value) && "value" in value ? value.value : value);

// What a field holds, as a list: a multiple field is a list already, a single
// one is a list of one, and nothing -- null, an empty string, an empty list --
// is a list of none.
const itemsOf = (value) => (Array.isArray(value) ? value : [value])
    .map(scalar)
    .filter((item) => item !== null && item !== undefined && item !== "")
    .map((item) => String(item));

// True or false, or null for a condition that cannot be read: an unknown op, a
// node with no conditions, a list where a list belongs and is missing. A
// condition nobody can read leaves the field as the host declared it rather
// than hiding it -- a field lost to a typo in a condition is a value a person
// can no longer see or change.
export function evaluateCondition(condition, values) {
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) return null;
    for (const node of ["all", "any"]) {
        if (!(node in condition)) continue;
        const list = condition[node];
        if (!Array.isArray(list) || !list.length) return null;
        const results = list.map((item) => evaluateCondition(item, values));
        if (results.includes(null)) return null;
        return node === "all" ? results.every(Boolean) : results.some(Boolean);
    }
    if ("not" in condition) {
        const inner = evaluateCondition(condition.not, values);
        return inner === null ? null : !inner;
    }
    if (typeof condition.field !== "string" || !CONDITION_OPS.includes(condition.op)) return null;
    // A field the record does not carry holds nothing.
    const held = itemsOf(values.get(condition.field));
    if (condition.op === "empty") return held.length === 0;
    if (condition.op === "not_empty") return held.length > 0;
    if (condition.op === "eq" || condition.op === "ne") {
        // A list (a multiple field) is equal when any of its items is.
        const hit = held.includes(String(scalar(condition.value)));
        return condition.op === "eq" ? hit : !hit;
    }
    if (!Array.isArray(condition.value)) return null;
    const wanted = condition.value.map((item) => String(scalar(item)));
    const hit = held.some((item) => wanted.includes(item));
    return condition.op === "in" ? hit : !hit;
}

// What a field's `when` decides, given the values on screen. A part the field
// does not condition, or conditions unreadably, is what the field declares:
// shown, required as `required` says, enabled unless `readonly`.
export function fieldConditions(field, values) {
    const when = field?.when && typeof field.when === "object" ? field.when : null;
    const decide = (key) => (when && key in when ? evaluateCondition(when[key], values) : null);
    const visible = decide("visible");
    const required = decide("required");
    const enabled = decide("enabled");
    return {
        visible: visible ?? true,
        required: required ?? field?.required === true,
        enabled: enabled ?? true,
    };
}
