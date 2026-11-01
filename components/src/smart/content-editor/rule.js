// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The editor draws its gutter as sf-icon-button, its marks as sf-icon, and every inline field is
// edited through sf-inline-editor, so those come with it. The block menu (sf-context-menu) and the
// parameters form (sf-switch, sf-dropdown, sf-input) open on a press, so they are fetched after
// the page is ready.
SF.RuleLoader['cl-content-editor'] = {
  tags: ['sf-content-editor'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-icon' },
    { name: 'cl-icon-button' },
    { name: 'cl-inline-editor' },
    { name: 'cl-context-menu', lazy: true },
    { name: 'cl-switch', lazy: true },
    { name: 'cl-dropdown', lazy: true },
    { name: 'cl-input', lazy: true },
  ],
};
