// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The inspector draws its fields as sf-input, sf-textarea, sf-dropdown, sf-switch and sf-image-field,
// its lists as sf-sortable, its tabs as sf-tabs, its path as sf-breadcrumbs, its marks as sf-icon and its
// buttons as sf-button and sf-icon-button; a tag it renders is a tag it fetches. The sections are the class
// accordion's markup, so its sheet comes too. The ⋯ menu opens in sf-context-menu on a press, so the menu
// is fetched after the page is ready, and the element waits for it before opening it.
SF.RuleLoader['cl-mail-inspector'] = {
  tags: ['sf-mail-inspector'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'accordion' },
    { name: 'cl-icon' },
    { name: 'cl-input' },
    { name: 'cl-textarea' },
    { name: 'cl-dropdown' },
    { name: 'cl-switch' },
    { name: 'cl-image-field' },
    { name: 'cl-sortable' },
    { name: 'cl-tabs' },
    { name: 'cl-breadcrumbs' },
    { name: 'cl-button' },
    { name: 'cl-icon-button' },
    { name: 'cl-context-menu', lazy: true },
  ],
};
