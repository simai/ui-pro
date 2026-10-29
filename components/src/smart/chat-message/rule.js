// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// A message draws the Framework's plain markup: icon buttons (copy, rating,
// a chip's remove), buttons (a brief's options, the «why» card, the person's
// editor) and inputs («Свой вариант», the note of a rating); every glyph is a
// Smart sf-icon, and a proposal is the package's sf-change-confirm. A tag it
// renders is a tag it fetches. Code blocks go through SF.Highlight when the
// page has it; the message does not bring it.
SF.RuleLoader['cl-chat-message'] = {
  tags: ['sf-chat-message'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'icon-buttons' },
    { name: 'buttons' },
    { name: 'inputs' },
    { name: 'cl-icon' },
    { name: 'cl-change-confirm' },
  ],
};
