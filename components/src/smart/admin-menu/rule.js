// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
SF.RuleLoader['cl-admin-menu'] = {
  tags: ['sf-admin-menu'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'admin-menu' },
    { name: 'icons' },
    { name: 'inputs' },
    { name: 'badges' },
    { name: 'cl-button' },
    { name: 'cl-context-menu', lazy: true },
    { name: 'cl-badge' },
    { name: 'cl-icon' },
    { name: 'cl-icon-button' },
    { name: 'cl-input' },
    // The navigation shell's edit mode moves rows with sf-sortable; a tag the
    // menu renders is a tag it fetches.
    { name: 'cl-sortable', lazy: true },
    // The columns' edges widen and narrow them.
    { name: 'cl-resizer' },
    // The edit mode's profiles are the profile picker (owner, 2026-10-14).
    { name: 'cl-profile-picker', lazy: true },
    // A row's glyph is chosen in the edit mode with the grid dropdown.
    { name: 'cl-dropdown', lazy: true },
    // A search that finds nothing and a menu the host could not load say so
    // in sf-empty-state; neither is on screen when the page starts.
    { name: 'cl-empty-state', lazy: true },
  ],
};
