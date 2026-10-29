// Generated from component.json by scripts/generate-component-files.mjs; do not edit.
// The window places this package's conversation parts and the chat's own by
// tag, and a tag it renders is a tag it fetches: the list and the
// conversation (sf-thread-list, sf-message-log), the field, whom one talks
// to and the messages (sf-chat-composer, sf-chat-interlocutor,
// sf-chat-message, which brings sf-change-confirm for a proposal). The way
// back above the field and an error's «Повторить» are plain button markup,
// the search above the list the Framework's input markup; every glyph is a
// Smart sf-icon. «Мои файлы» (x-my-files) draw the space used and an empty
// or failed list only once the view is opened.
SF.RuleLoader['cl-chat-window'] = {
  tags: ['sf-chat-window'],
  type: 'smart',
  mode: 'smart',
  js: true,
  css: true,
  relation: [
    { name: 'buttons' },
    { name: 'icon-buttons' },
    { name: 'inputs' },
    { name: 'cl-icon' },
    { name: 'cl-thread-list' },
    { name: 'cl-message-log' },
    { name: 'cl-chat-composer' },
    { name: 'cl-chat-interlocutor' },
    { name: 'cl-chat-message' },
    { name: 'cl-change-confirm', lazy: true },
    { name: 'cl-context-menu', lazy: true },
    { name: 'cl-progress-bar', lazy: true },
    { name: 'cl-empty-state', lazy: true },
  ],
};
