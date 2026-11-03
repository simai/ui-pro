// The kinds of block the / menu and the + of the gutter offer, in the order
// they are offered. An entry is a type with the options it starts with, so a
// heading of the third level or a numbered list is one entry; its words are
// lang/<locale>.json `type-<id>`, its search words `find-<id>`.
export const CATALOG = Object.freeze([
    {id: "paragraph", type: "content.paragraph", icon: "notes"},
    {id: "heading-2", type: "content.heading", options: {level: 2}, icon: "title", hint: "##"},
    {id: "heading-3", type: "content.heading", options: {level: 3}, icon: "text_fields", hint: "###"},
    {id: "list", type: "content.list", icon: "format_list_bulleted", hint: "-"},
    {id: "ordered-list", type: "content.list", options: {ordered: true}, icon: "format_list_numbered", hint: "1."},
    {id: "quote", type: "content.quote", icon: "format_quote", hint: ">"},
    {id: "alert", type: "content.alert", icon: "info"},
    {id: "details", type: "content.details", icon: "expand_circle_down"},
    {id: "steps", type: "content.steps", icon: "format_list_numbered_rtl"},
    {id: "table", type: "content.table", icon: "table"},
    {id: "figure", type: "content.figure", icon: "image"},
    {id: "file", type: "content.file", icon: "attach_file"},
    {id: "code", type: "content.code", icon: "code", hint: "```"},
    {id: "divider", type: "content.divider", icon: "horizontal_rule", hint: "---"},
    {id: "tabs", type: "content.tabs", icon: "tab"},
    {id: "card", type: "content.card", icon: "crop_square"},
    {id: "grid", type: "content.grid", icon: "grid_view"},
    {id: "html", type: "content.html", icon: "html"},
]);

export const DEFAULT_KINDS = Object.freeze(["paragraph", "heading-2", "heading-3", "list", "ordered-list", "quote", "alert", "details", "steps", "table", "figure", "file", "code", "divider"]);

// What a block may turn into from its grip menu.
export const TURN_INTO = Object.freeze(["paragraph", "heading-2", "heading-3", "list", "ordered-list", "quote", "alert", "code"]);

// Markdown at the start of a paragraph, typed: the kind it becomes.
export const SHORTCUTS = Object.freeze([
    [/^#{1,2} $/u, "heading-2"],
    [/^### $/u, "heading-3"],
    [/^[-*] $/u, "list"],
    [/^1[.)] $/u, "ordered-list"],
    [/^> $/u, "quote"],
    [/^```$/u, "code"],
    [/^---$/u, "divider"],
]);

export const entryOf = (id) => CATALOG.find((entry) => entry.id === id);

/** The catalog entry a node is, for the mark of its current kind in a menu. */
export function kindOf(node) {
    if (node.type === "content.heading") return (node.data?.level ?? 2) >= 3 ? "heading-3" : "heading-2";
    if (node.type === "content.list") return node.props?.ordered ? "ordered-list" : "list";
    return CATALOG.find((entry) => entry.type === node.type && !entry.options)?.id ?? "";
}

// The icon an alert shows for its status, as the Framework renderer draws it.
export const ALERT_ICONS = Object.freeze({neutral: "info", info: "info", success: "check_circle", warning: "warning", error: "error"});
