import {html, nothing} from "lit";
import {ariaKeyShortcuts, parseShortcut, shortcutView} from "../../../../component/kbd/js/shortcut";

// The ⌘K palette: a window over the page, so the same search is there in the
// two-column menu, on the rail and on a phone (assignment, section 4). The
// groups and their order are the host's; the window is SIMAI Framework's
// sf-search (renderPalette below).

// A key or a combination as SIMAI Framework's kbd unit writes it (C04, KB-2,
// K-05): one <kbd> per key, a group for a combination, the platform's caps
// (⌘K on a Mac, Ctrl+K elsewhere) and its + between words. The kbd sheet
// picks the look by the place -- plain glyphs in a list or a menu row. A menu row that is a link with role=button says
// appearance="plain" (the kbd sheet's own attribute): it is a row of a menu,
// not a button. The menu writes the keys and no look of its own.
export function renderKeys(value, appearance = null) {
    const {keys, join} = shortcutView(value);
    if (!keys.length) return nothing;
    const one = (key, said = null) => html`<kbd class=${key.square ? "sf-kbd--square" : nothing} appearance=${said ?? nothing}>${key.text}</kbd>`;
    if (keys.length === 1) return one(keys[0], appearance);
    return html`<kbd class="sf-kbd--group" appearance=${appearance ?? nothing}>${keys.map((key, at) => html`${at && join ? html`<span class="sf-kbd-join">+</span>` : nothing}${one(key)}`)}</kbd>`;
}

// What a combination reads as in words, for a title: «Ctrl+K», «⌘K».
const keysText = (value) => {
    const {keys, join} = shortcutView(value);
    return keys.map((key) => key.text).join(join ? "+" : "");
};

const icon = (name) => (name
    ? html`<sf-icon root-class="sf-admin-nav-row-icon" aria-hidden="true" icon=${name}></sf-icon>`
    : nothing);

// The ⌘K palette is SIMAI Framework's search window, sf-search, in its admin
// command palette recipe (owner decisions C162, C175; K-04): one window for
// sections, records and commands, its dialog, combobox, rows, filters (the
// host's groups as scopes), recent queries, key hints, scrim, layer and focus
// return all the Framework's. The menu is its host: controller.paletteProvider
// asks the navigation port (search.query) and the choice goes back to it
// (search.choose, onPaletteNavigate). The element's own keys are off
// (shortcut=""): mod+k stays the menu's, heard through the kbd unit, so the
// rail and the phone open the same window and the key toggles it. Popular
// queries are not drawn: the navigation port has none.
export function renderPalette(context) {
    const {controller, text} = context;
    if (!controller.offers("search")) return nothing;
    return html`<sf-search class="sf-admin-nav-search" shortcut="" recent-key="admin-menu" popular="false"
        label=${text("search")} placeholder=${text("paletteHint")}
        @sf-search-navigate=${(event) => controller.onPaletteNavigate(event)}></sf-search>`;
}

// The row that opens it, under the site in the first column.
export function renderSearchRow(context) {
    const {controller, text, compact, shortcut} = context;
    if (!controller.offers("search")) return nothing;
    return html`<a class="sf-admin-nav-row sf-admin-nav-row--first" href="#" role="button"
        aria-haspopup="dialog"
        aria-keyshortcuts=${ariaKeyShortcuts(parseShortcut(shortcut)) || nothing}
        title=${compact ? `${text("search")} ${keysText(shortcut)}` : nothing}
        aria-label=${compact ? text("search") : nothing}
        @click=${(event) => { event.preventDefault(); controller.openPalette(); }}>
        ${icon("search")}
        ${compact ? nothing : html`<span class="sf-admin-nav-row-label">${text("search")}</span>
            <span class="sf-admin-nav-row-keys">${renderKeys(shortcut, "plain")}</span>`}
    </a>`;
}
