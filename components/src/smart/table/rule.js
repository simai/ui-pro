SF.RuleLoader["cl-table"] = {
  tags: ["sf-table"],
  type: "smart",
  mode: "smart",
  js: true,
  css: true,
  // lazy: rendered later -- filter editors, cell editors, menus -- fetched after the page is ready (2026-10-12).
  relation: [
    { name: "cl-checkbox" },
    // The cells drawn with another Smart element come with the table, not
    // after the rows: a reference (sf-reference-link), a file
    // (sf-file-preview) and a colour (sf-color, in a cell as well as in a
    // card). Fetched lazily, each upgraded some 600 ms after the rows had
    // drawn and moved the row (stand 24: CLS 0.0145 at 1280 when the data
    // arrived).
    { name: "cl-reference-link" },
    { name: "cl-file-preview" },
    { name: "cl-color" },
    // A string whose variant is a phone draws sf-country-code. The rule fence
    // reads a component's own templates, and this element comes from the shared
    // renderer set instead -- so nothing would have caught its absence until a
    // page showed an element that never upgraded.
    { name: "cl-country-code", lazy: true },
    { name: "cl-button" },
    { name: "cl-icon-button" },
    { name: "icons" },
    { name: "cl-input" },
    { name: "cl-tag" },
    { name: "cl-pagination" },
    { name: "cl-spinner" },
    // A table without rows says why in sf-empty-state (owner, 2026-10-14).
    { name: "cl-empty-state" },
    { name: "cl-datepicker", lazy: true },
    { name: "cl-dropdown" },
    // The gear's tabs, «Поля» and «Вид» (owner, 2026-10-14).
    { name: "cl-tabs", lazy: true },
    { name: "cl-context-menu", lazy: true },
    // The windows' lists are reordered with sf-sortable (owner, 2026-10-13).
    { name: "cl-sortable", lazy: true },
    // The filter window's templates are a radio list: a page with nothing else
    // using sf-radio drew its rows empty (owner, 2026-10-14).
    { name: "cl-radio", lazy: true },
    // A column's edge is the Framework's resize gesture (owner, 2026-10-14).
    { name: "cl-resizer", lazy: true },
    { name: "cl-avatar" },
    { name: "cl-badge" },
    { name: "cl-list-item" },
    { name: "cl-modal", lazy: true },
    { name: "cl-range-slider", lazy: true },
  ],
};
