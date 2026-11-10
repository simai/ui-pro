// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
SF.RuleLoader['cl-view-table'] = {
  tags: ['sf-view-table', 'sf-table'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-checkbox' },
    // The cells drawn with another Smart element come with the table, not
    // after the rows: a reference (sf-reference-link), a file
    // (sf-file-preview) and a colour (sf-input-color, in a cell as well as in a
    // card). Fetched lazily, each upgraded some 600 ms after the rows had
    // drawn and moved the row (stand 24: CLS 0.0145 at 1280 when the data
    // arrived).
    { name: 'cl-reference-link' },
    { name: 'cl-file-preview' },
    { name: 'cl-input-color' },
    // A string whose variant is a phone draws sf-input-country. The rule fence
    // reads a component's own templates, and this element comes from the shared
    // renderer set instead -- so nothing would have caught its absence until a
    // page showed an element that never upgraded.
    { name: 'cl-input-country', lazy: true },
    { name: 'cl-button' },
    { name: 'cl-button-icon' },
    { name: 'icons' },
    { name: 'cl-input' },
    { name: 'cl-tag' },
    { name: 'cl-pagination' },
    { name: 'cl-spinner' },
    // A table without rows says why in sf-empty-state (owner, 2026-10-14).
    { name: 'cl-empty-state' },
    { name: 'cl-input-date', lazy: true },
    { name: 'cl-dropdown' },
    // The gear's tabs, «Поля» and «Вид» (owner, 2026-10-14).
    { name: 'cl-tabs', lazy: true },
    { name: 'cl-menu-context', lazy: true },
    // The windows' lists are reordered with sf-sortable (owner, 2026-10-13).
    { name: 'cl-sortable', lazy: true },
    // The filter window's templates are a radio list: a page with nothing else
    // using sf-radio drew its rows empty (owner, 2026-10-14).
    { name: 'cl-radio', lazy: true },
    // A column's edge is the Framework's resize gesture (owner, 2026-10-14).
    { name: 'cl-resizer', lazy: true },
    { name: 'cl-avatar' },
    { name: 'cl-badge' },
    { name: 'cl-list-item' },
    { name: 'cl-modal', lazy: true },
    { name: 'cl-slider-range', lazy: true },
    // The list of resources (C31): the status dot is the dot component's class markup.
    { name: 'dot' },
    // The status word, a fact's note and a quick action's name are the Framework tooltip (its anchor and data-tooltip), shown on hover and on keyboard focus: behaviour, fetched after the page is ready.
    { name: 'tooltip', lazy: true },
    // The layout switch in the toolbar (C31).
    { name: 'cl-segmented' },
  ],
};
