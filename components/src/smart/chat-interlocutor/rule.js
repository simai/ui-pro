// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The chevron is a Smart sf-icon; a tag it renders is a tag it fetches. The
// choice opens in sf-context-menu on a press, so the menu is fetched after the
// page is ready, and the element waits for it before opening it. The sentence
// that describes the button is visually hidden with the sr-only utility, which
// a class scan can miss on a node drawn later, so it comes with the component.
SF.RuleLoader['cl-chat-interlocutor'] = {
  tags: ['sf-chat-interlocutor'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-icon' },
    { name: 'cl-context-menu', lazy: true },
    { name: 'sr-only/default' },
  ],
};
