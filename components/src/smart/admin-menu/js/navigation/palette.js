import {html, nothing} from "lit";
import {ariaKeyShortcuts, parseShortcut, shortcutView} from "../../../../component/kbd/js/shortcut";

// The ⌘K palette: a dialog over the page, so the same search is there in the
// two-column menu, on the rail and on a phone (assignment, section 4). The
// groups and their order are the host's; the field says where it searched.

// A key or a combination as SIMAI Framework's kbd unit writes it (C04, KB-2,
// K-05): one <kbd> per key, a group for a combination, the platform's caps
// (⌘K on a Mac, Ctrl+K elsewhere) and its + between words. The kbd sheet
// picks the look by the place -- plain glyphs in a list or a menu row, a key
// in the palette's foot. A menu row that is a link with role=button says
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

function renderResults(context) {
    const {controller, palette, text} = context;
    if (!palette.groups.length) {
        return palette.loading
            ? nothing
            : html`<sf-empty-state class="sf-admin-nav-empty" layout="inline" kind="nothing-found" size="1/2"
                text=${text("nothingFound")}></sf-empty-state>`;
    }
    let index = -1;
    return palette.groups.map((group) => html`
        <div class="sf-admin-nav-heading" id=${`sf-admin-nav-palette-group-${group.key}`}>${group.label}</div>
        <div role="group" aria-labelledby=${`sf-admin-nav-palette-group-${group.key}`}>
            ${(group.items ?? []).map((item) => {
                index += 1;
                const at = index;
                const active = at === palette.active;
                return html`<div class="sf-admin-nav-palette-item" role="option"
                    id=${`sf-admin-nav-palette-option-${at}`}
                    aria-selected=${String(active)}
                    data-active=${active ? "true" : nothing}
                    @pointermove=${() => {
                        if (palette.active !== at) {
                            controller.palette = {...controller.palette, active: at};
                            controller.update("palette-active");
                        }
                    }}
                    @click=${() => controller.choosePalette(at)}>
                    ${icon(item.icon || (item.kind === "action" ? "bolt" : "description"))}
                    <span class="sf-admin-nav-palette-label">${item.label}</span>
                    ${item.caption ? html`<span class="sf-admin-nav-palette-caption">${item.caption}</span>` : nothing}
                    ${active ? html`<span class="sf-admin-nav-palette-enter" aria-hidden="true">${renderKeys("enter")}</span>` : nothing}
                </div>`;
            })}
            ${group.more ? html`<a class="sf-admin-nav-palette-more" href=${group.more.href}
                @click=${() => controller.closePalette({restoreFocus: false})}>${group.more.label}</a>` : nothing}
        </div>`);
}

export function renderPalette(context) {
    const {controller, palette, paletteZIndex, text} = context;
    if (!palette.open) return nothing;
    // A press on the dimmed page closes it through the layer stack
    // (controller.openPalette), which also gives it its height.
    return html`<div class="sf-admin-nav-palette" style=${paletteZIndex ? `z-index: ${paletteZIndex}` : nothing}>
        <div class="sf-admin-nav-palette-dialog" role="dialog" aria-modal="true" aria-label=${text("search")}>
            <div class="sf-admin-nav-palette-field" @keydown=${(event) => controller.onPaletteKey(event)}>
                <sf-input size="1" icon-start="search"
                    placeholder=${text("paletteHint")}
                    value=${palette.query}
                    @input=${(event) => controller.queryPalette(event.target?.value ?? event.detail?.value ?? "")}></sf-input>
                ${palette.scope ? html`<span class="sf-admin-nav-palette-scope">${palette.scope}</span>` : nothing}
            </div>
            <div class="sf-admin-nav-palette-results" id="sf-admin-nav-palette-results" role="listbox"
                aria-label=${text("search")} aria-busy=${palette.loading ? "true" : "false"}>
                ${renderResults(context)}
            </div>
            <div class="sf-admin-nav-palette-foot sf-text-1/3" aria-hidden="true">
                <span>${renderKeys("up")} ${renderKeys("down")} ${text("paletteNavigate")}</span>
                <span>${renderKeys("enter")} ${text("paletteOpen")}</span>
                <span>${renderKeys("escape")} ${text("paletteClose")}</span>
            </div>
        </div>
    </div>`;
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
