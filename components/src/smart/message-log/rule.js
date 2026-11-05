// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// sf-message-log is a dated alias of the Framework's sf-list-feed: the element is a subclass
// of the class that defines sf-list-feed, so the feed's rule (its code, its sheet, its own
// relations: sf-button, sf-button-icon, sr-only) comes with it. This rule's sheet keeps only the
// former public variables feeding the feed's.
SF.RuleLoader['cl-message-log'] = {
  tags: ['sf-message-log'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-list-feed' },
  ],
};
