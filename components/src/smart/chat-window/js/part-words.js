// The chat's words for the conversation parts the window places (this
// package's sf-message-log, sf-thread-list and sf-change-confirm), registered
// once per page through SF.language, in both languages: the parts speak
// Russian and English on their own, but the chat says «Новое название
// разговора», «Отменено» and «Срок подтверждения истёк. Попросите
// подготовить изменение заново.», and a person who knew the chat must not
// meet other words for the same thing (ui-chat chat-core/larena.js
// registerLarenaWords, moved here with the window: registering another
// component's words is the page's act, and the window is that page's chat).
//
// The words are the window's own lang/ entries, under the parts' lang/
// names; a placeholder ({title}, {time}) is left for the part to fill.

// part -> {the part's word: the window's word}
export const PART_WORDS = {
    'sf-message-log': {
        'region-label': 'list-region',
        'log-label': 'list-label',
        'earlier-text': 'list-earlier',
        'loading-earlier-text': 'list-loading-earlier',
        'latest-label': 'list-latest',
        'you-text': 'you',
    },
    'sf-thread-list': {
        label: 'threads-label',
        'create-text': 'threads-new',
        today: 'threads-today',
        yesterday: 'threads-yesterday',
        earlier: 'threads-earlier',
        'actions-label': 'threads-actions',
        'rename-text': 'threads-rename',
        'rename-label': 'threads-rename-label',
        'archive-text': 'threads-archive',
        'unarchive-text': 'threads-unarchive',
        'archive-view': 'threads-archive-view',
        'back-text': 'threads-back',
        'empty-text': 'threads-empty',
        'archive-empty-text': 'threads-archive-empty',
        'loading-text': 'threads-loading',
    },
    'sf-change-confirm': {
        'changes-label': 'proposal-label',
        'before-text': 'proposal-was',
        'after-text': 'proposal-will',
        'accept-text': 'proposal-confirm',
        'decline-text': 'proposal-cancel',
        'accepting-text': 'proposal-confirming',
        'declining-text': 'proposal-cancelling',
        'accepted-text': 'proposal-applied',
        'declined-text': 'proposal-rejected',
        'expired-text': 'proposal-expired',
        'until-text': 'proposal-until',
    },
};

let registered = null;

/** Register the parts' words from the window's language files {ru, en}. */
export function registerPartWords(languages, language = globalThis.SF?.language) {
    if (!language?.registerAll || registered === language) return false;
    registered = language;
    for (const [locale, file] of Object.entries(languages)) {
        const words = file?.runtime ?? {};
        const tables = {};
        for (const [part, names] of Object.entries(PART_WORDS)) {
            tables[part] = Object.fromEntries(Object.entries(names)
                .filter(([, own]) => typeof words[own] === 'string')
                .map(([name, own]) => [name, words[own]]));
        }
        language.registerAll(locale, tables);
    }
    return true;
}
