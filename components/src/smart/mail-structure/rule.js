// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The structure draws its list as sf-sortable, its marks as sf-icon, its ⋯ as sf-button-icon and the
// empty card as sf-empty-state with an sf-button; a tag it renders is a tag it
// fetches. The ⋯ menu opens in sf-menu-context on a press, so the menu is fetched
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
    { name: 'cl-button-icon' },
    { name: 'cl-empty-state' },
    { name: 'cl-menu-context', lazy: true },
  ],
};
