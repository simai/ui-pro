// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The editor draws its bar, panels, gutter and library from Framework parts, so those come with it.
// The grip's menu (sf-menu-context) and the output dialog (sf-modal) open on a press, so they are fetched after the page is ready.
SF.RuleLoader['cl-editor'] = {
  tags: ['sf-editor'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-icon' },
    { name: 'cl-button' },
    { name: 'cl-button-icon' },
    { name: 'cl-button-group' },
    { name: 'cl-tabs' },
    { name: 'cl-input' },
    { name: 'cl-dropdown' },
    { name: 'cl-switch' },
    { name: 'cl-skeleton' },
    { name: 'cl-editor-inline' },
    { name: 'cl-menu-context', lazy: true },
    { name: 'cl-modal', lazy: true },
  ],
};
