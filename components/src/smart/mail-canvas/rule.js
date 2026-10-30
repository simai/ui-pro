// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The canvas draws its width switch as sf-button-group and places sf-composition-overlay over the frame;
// a tag it renders is a tag it fetches. Both are drawn at once: the overlay is what makes the letter
// something to press on. The element waits for the overlay before it attaches the frame.
SF.RuleLoader['cl-mail-canvas'] = {
  tags: ['sf-mail-canvas'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-button-group' },
    { name: 'cl-composition-overlay' },
  ],
};
