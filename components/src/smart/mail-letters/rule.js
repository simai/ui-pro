// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The letters page draws its search as sf-input, the order as sf-dropdown,
// «Открыть» and «Новое письмо» as sf-button, the row's ⋯ as sf-icon-button
// and «писем пока нет» as sf-empty-state; a tag it renders is a tag it
// fetches. The ⋯ menu opens in sf-context-menu on a press, so the menu is
// fetched after the page is ready, and the element waits for it before
// opening it.
SF.RuleLoader['cl-mail-letters'] = {
  tags: ['sf-mail-letters'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-input' },
    { name: 'cl-dropdown' },
    { name: 'cl-button' },
    { name: 'cl-icon-button' },
    { name: 'cl-empty-state' },
    { name: 'cl-context-menu', lazy: true },
  ],
};
