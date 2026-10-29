// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The list draws its glyphs as sf-icon, an unread count as sf-badge and a
// conversation's picture as sf-avatar; a tag it renders is a tag it fetches. A
// row's actions open in sf-context-menu on a press, so the menu is fetched after
// the page is ready, and the list waits for the element before opening it. The
// loading sentence is visually hidden with the sr-only utility, which a class
// scan can miss on a node drawn later, so it comes with the component.
SF.RuleLoader['cl-thread-list'] = {
  tags: ['sf-thread-list'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-icon' },
    { name: 'cl-badge' },
    { name: 'cl-avatar' },
    { name: 'cl-context-menu', lazy: true },
    { name: 'sr-only/default' },
  ],
};
