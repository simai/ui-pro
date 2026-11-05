// An answer's card (x-blocks, 1.6.0; Mirai24 API v1.4, BLOCKS.md §2) as
// sf-view-properties sees it. The card is a record in the shape of
// simai.property-view-port; the message is its host: it answers record.load
// with the block's record and turns a save into the window's block.submit.
// What travels here and back is the block's, not the record component's: the
// values of number fields come as decimal strings and go back as strings.

const NUMERIC = new Set(["number", "integer"]);

/** Whether the card still takes input: open, not closed by the host, not busy. */
export function isLive(block, {closed = false} = {}) {
  return block.state === "open" && !closed;
}

/** The surface the card is placed as: edit (all fields open), auto (one «Изменить»), or view. */
export function modeOf(block, options = {}) {
  if (!isLive(block, options)) return "view";
  if (block.mode === "edit") return "edit";
  return (block.actions || []).some((action) => action.id === "edit") ? "auto" : "view";
}

/** The label of one of the block's actions, else null. */
export function actionLabel(block, id) {
  return (block.actions || []).find((action) => action.id === id)?.label ?? null;
}

const numeric = (value) => {
  if (typeof value !== "string" || value.trim() === "") return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
};

function eachField(record, visit) {
  for (const section of record?.sections || []) {
    for (const group of section.groups || []) {
      for (const field of group.fields || []) visit(field);
    }
  }
}

/** The record sf-view-properties draws: the block's, with numbers as numbers and the edit right when live. */
export function recordOf(block, options = {}) {
  const record = block.record || {};
  const mode = modeOf(block, options);
  // A group without a label (BLOCKS.md: label null) reads as its section, or,
  // alone, as the card: the record component names every group it draws.
  const sections = (record.sections || []).map((section) => ({
    ...section,
    groups: (section.groups || []).map((group) => ({
      ...group,
      label: group.label ?? section.label ?? block.title ?? null,
      fields: (group.fields || []).map((field) => (NUMERIC.has(field.propertyType) ? {...field, value: numeric(field.value)} : field)),
    })),
  }));
  return {
    record_id: String(block.id),
    collection: record.source ?? null,
    revision: record.revision ?? null,
    title: block.title ?? null,
    sections,
    actions: mode === "view" ? [] : ["record.edit"],
  };
}

/** The changed values as the block takes them: a number field's value back as a string. */
export function valuesOut(block, values = {}) {
  const numbers = new Set();
  eachField(block.record, (field) => { if (NUMERIC.has(field.propertyType)) numbers.add(field.key); });
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key, numbers.has(key) && typeof value === "number" ? String(value) : value,
  ]));
}

/**
 * The window's answer to block.submit as sf-view-properties' answer to a save:
 * applied with the record now held; conflict in the card's words, what was
 * typed kept; invalid as the fields' errors; closed or refused as one line.
 */
export function answerOf(result, block, words) {
  const answer = result?.answer;
  if (answer === "applied") return {answer: "applied", record: recordOf(result.block ?? block)};
  if (answer === "conflict") return {answer: "conflict", message: words("block.conflict")};
  if (answer === "refused" && result.errors && Object.keys(result.errors).length) {
    return {answer: "refused", errors: result.errors};
  }
  if (answer === "refused" && result.reason === "closed") {
    return {answer: "refused", message: result.message || words("block.closed")};
  }
  return {answer: "refused", message: result?.message || result?.text || words("block.failed")};
}
