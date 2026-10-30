// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The Library draws its search field as sf-input, the category chips as
// sf-button, the row icons as sf-icon and «nothing found» as sf-empty-state;
// a tag it renders is a tag it fetches. The words a row says to a screen
// reader are visually hidden with the sr-only utility, which a class scan can
// miss on a node drawn later, so it comes with the component. Nothing else:
// the blocks are data the host passes in.
SF.RuleLoader['cl-mail-library'] = {
  tags: ['sf-mail-library'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-input' },
    { name: 'cl-button' },
    { name: 'cl-icon' },
    { name: 'cl-empty-state' },
    { name: 'sr-only/default' },
  ],
};
