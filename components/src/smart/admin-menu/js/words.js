// The words of sf-admin-menu (standard simai.smart-component 1.3.8 §11): they
// live in lang/<locale>.json, the one source the Studio, the docs and a
// product's SF.language.register read. The menu's three dictionaries -- the
// navigation's, the settings menu's and the counter's -- are made from them
// here, by the key each one has always used, so every word is written once.
import en from "../lang/en.json";
import ru from "../lang/ru.json";

const LANG = {en: en.runtime, ru: ru.runtime};

/** {<dictionary key>: <lang key>} -> {en: {...}, ru: {...}}, as pageText reads a dictionary. */
export function wordsOf(map) {
    return Object.fromEntries(Object.entries(LANG).map(([locale, words]) => [locale, Object.fromEntries(
        Object.entries(map).filter(([, name]) => words[name] !== undefined).map(([key, name]) => [key, words[name]]),
    )]));
}
