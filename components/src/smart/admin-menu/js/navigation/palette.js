import {html, nothing} from "lit";

// The ⌘K palette: a dialog over the page, so the same search is there in the
// two-column menu, on the rail and on a phone (assignment, section 4). The
// groups and their order are the host's; the field says where it searched.

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
                    ${active ? html`<kbd class="sf-admin-nav-kbd" aria-hidden="true">↵</kbd>` : nothing}
                </div>`;
            })}
            ${group.more ? html`<a class="sf-admin-nav-palette-more" href=${group.more.href}
                @click=${() => controller.closePalette({restoreFocus: false})}>${group.more.label}</a>` : nothing}
        </div>`);
}

export function renderPalette(context) {
    const {controller, palette, text} = context;
    if (!palette.open) return nothing;
    return html`<div class="sf-admin-nav-palette"
        @pointerdown=${(event) => { if (event.target === event.currentTarget) controller.closePalette(); }}>
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
            <div class="sf-admin-nav-palette-foot" aria-hidden="true">
                <span><kbd class="sf-admin-nav-key">↑</kbd><kbd class="sf-admin-nav-key">↓</kbd> ${text("paletteNavigate")}</span>
                <span><kbd class="sf-admin-nav-key">↵</kbd> ${text("paletteOpen")}</span>
                <span><kbd class="sf-admin-nav-key">Esc</kbd> ${text("paletteClose")}</span>
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
        aria-keyshortcuts=${shortcut === "⌘K" ? "Meta+K" : "Control+K"}
        title=${compact ? `${text("search")} ${shortcut}` : nothing}
        aria-label=${compact ? text("search") : nothing}
        @click=${(event) => { event.preventDefault(); controller.openPalette(); }}>
        ${icon("search")}
        ${compact ? nothing : html`<span class="sf-admin-nav-row-label">${text("search")}</span>
            <kbd class="sf-admin-nav-kbd">${shortcut}</kbd>`}
    </a>`;
}
