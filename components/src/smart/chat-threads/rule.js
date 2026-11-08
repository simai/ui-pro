// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The head's and foot's commands draw their glyphs as sf-icon; the rows are the
// Framework's sf-list (since 2.0.0), which brings its own parts: sf-list-item, the
// avatar, the badges, the empty state and the row menu. A tag it renders is a tag
// it fetches.
SF.RuleLoader['cl-chat-threads'] = {
  tags: ['sf-chat-threads', 'sf-thread-list'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'cl-icon' },
    { name: 'cl-list' },
  ],
};
