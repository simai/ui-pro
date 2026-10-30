// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The structure draws its marks as sf-icon, its ⋯ as sf-icon-button and the empty
// card as sf-empty-state with an sf-button; a tag it renders is a tag it fetches.
// sf-sortable is fetched after the page is ready: arriving before this element
// draws, it would take the printed rows as its own first paint and drop them.
// The ⋯ menu opens in sf-context-menu on a press, so it is fetched then too, and
// the element waits for it before opening it.
SF.RuleLoader['cl-mail-structure'] = {
  tags: ['sf-mail-structure'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-icon' },
    { name: 'cl-sortable', lazy: true },
    { name: 'cl-button' },
    { name: 'cl-icon-button' },
    { name: 'cl-empty-state' },
    { name: 'cl-context-menu', lazy: true },
  ],
};
