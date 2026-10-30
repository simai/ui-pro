// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The structure draws its list as sf-sortable, its marks as sf-icon, its ⋯ as sf-icon-button and the
// empty card as sf-empty-state with an sf-button; a tag it renders is a tag it
// fetches. The ⋯ menu opens in sf-context-menu on a press, so the menu is fetched
// after the page is ready, and the element waits for it before opening it.
SF.RuleLoader['cl-mail-structure'] = {
  tags: ['sf-mail-structure'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-icon' },
    { name: 'cl-sortable' },
    { name: 'cl-button' },
    { name: 'cl-icon-button' },
    { name: 'cl-empty-state' },
    { name: 'cl-context-menu', lazy: true },
  ],
};
