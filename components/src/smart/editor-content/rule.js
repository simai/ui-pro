// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The editor draws its gutter as sf-button-icon, its marks as sf-icon, the quick toolbar's words as sf-button,
// and every inline field is edited through sf-editor-inline, so those come with it. The block menu (sf-menu-context),
// the parameters' popover and form (sf-popover, sf-switch, sf-dropdown, sf-input) and a picture's drop zone and
// progress (sf-file-upload, sf-progress-bar) open on a press or with an empty picture, so they are fetched after the page is ready.
SF.RuleLoader['cl-editor-content'] = {
  tags: ['sf-editor-content', 'sf-content-editor'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-icon' },
    { name: 'cl-button-icon' },
    { name: 'cl-editor-inline' },
    { name: 'cl-menu-context', lazy: true },
    { name: 'cl-switch', lazy: true },
    { name: 'cl-dropdown', lazy: true },
    { name: 'cl-input', lazy: true },
    { name: 'cl-button' },
    { name: 'cl-file-upload', lazy: true },
    { name: 'cl-progress-bar', lazy: true },
    { name: 'cl-popover', lazy: true },
  ],
};
