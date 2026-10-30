import {html, nothing} from "lit";
import "./default.css";

// A row: the name, when it changed and how many blocks, then «Открыть» and ⋯.
// The letter open in the editor is marked and says so to a screen reader; it
// is not offered to be opened again.
function renderRow(context, letter) {
    const summary = [letter.when, letter.blocksText].filter(Boolean).join(" · ");
    return html`
        <li class=${["sf-mail-letters-row", letter.isCurrent ? "is-current" : ""].filter(Boolean).join(" ")} data-letter=${letter.id}>
            <span class="sf-mail-letters-words">
                <span class="sf-mail-letters-title">${letter.title}</span>
                <span class="sf-mail-letters-summary">${summary}${letter.isCurrent ? html` · <span class="sf-mail-letters-current">${context.currentLabel}</span>` : nothing}</span>
            </span>
            <span class="sf-mail-letters-actions">
                ${letter.isCurrent
                    ? nothing
                    : html`<sf-button size="1/2" appearance="outline" text=${context.openLabel} data-action="open"
                             @click=${() => context.component.choose({action: "open", id: letter.id})}></sf-button>`}
                <sf-icon-button size="1/2" appearance="link" icon="more_horiz" data-action="more"
                    aria-label=${letter.actionsLabel}
                    @click=${(event) => context.component.openMenu(letter.id, event.currentTarget)}></sf-icon-button>
            </span>
        </li>
    `;
}

// The page: the bar (search, order, «Новое письмо»), the rows, the empty state
// that says which of the two it is (no letters at all, or none for this
// search), and the one ⋯ menu, filled for the row it is opened from. The menu
// is printed closed: the first paint is the bar and the rows (§5.4).
export function renderMailLettersTemplate(context) {
    return html`
        <div class=${["sf-mail-letters", context.rootClass].filter(Boolean).join(" ")}>
            <div class="sf-mail-letters-bar">
                <sf-input class="sf-mail-letters-search" input-type="search" size="1/2" label=${context.searchLabel}
                          value=${context.query}
                          @input=${(event) => context.component.search({query: event.target?.value ?? event.detail?.value ?? ""})}></sf-input>
                <sf-dropdown class="sf-mail-letters-order" size="1/2" label=${context.orderLabel} value=${context.order}
                             .options=${context.orderOptions}
                             @change=${(event) => context.component.onOrderChange(event)}></sf-dropdown>
                <sf-button class="sf-mail-letters-new" size="1/2" icon-start="add" text=${context.createLabel} data-action="create"
                           @click=${() => context.component.choose({action: "create"})}></sf-button>
            </div>
            ${context.letters.length
                ? html`<ul class="sf-mail-letters-list">${context.letters.map((letter) => renderRow(context, letter))}</ul>`
                : nothing}
            ${context.empty
                ? html`<sf-empty-state class="sf-mail-letters-empty" kind=${context.empty} size="1/2" heading-level="2"
                         heading=${context.emptyTitle} text=${context.emptyText}></sf-empty-state>`
                : nothing}
            <sf-context-menu class="sf-mail-letters-menu" popup
                             @sf-context-menu-select=${(event) => {
                                 event.stopPropagation();
                                 context.component.onMenuSelect(event.detail);
                             }}></sf-context-menu>
        </div>
    `;
}
