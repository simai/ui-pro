import {html, nothing} from "lit";
import "./default.css";

// One row: the icon, the name, what the block is for (up to two lines) and,
// for a screen reader only, the action. The name of the button is the row's
// own words, so a voice command that says the block's name reaches it (WCAG
// 2.5.3); «+» is drawn on hover and focus, never at rest.
function renderRow(context, item) {
    const tip = item.sample && item.sample !== item.title
        ? `${item.title} — ${item.purpose ?? ""}\n«${item.sample}»`
        : `${item.title} — ${item.purpose ?? ""}`;
    return html`
        <button type="button" class="sf-mail-library-row" data-add=${item.type} title=${tip}
                @click=${() => context.component.add({type: item.type})}>
            <sf-icon class="sf-mail-library-row-icon" icon=${item.icon || "widgets"} size="2" aria-hidden="true"></sf-icon>
            <span class="sf-mail-library-row-words">
                <span class="sf-mail-library-row-title">${item.title}</span>
                ${item.purpose ? html`<span class="sf-mail-library-row-purpose">${item.purpose}</span>` : nothing}
                <span class="sr-only">${context.addLabel}</span>
            </span>
            <span class="sf-mail-library-row-add" aria-hidden="true"><sf-icon icon="add" size="2"></sf-icon></span>
        </button>
    `;
}

// A variant of a place: the one the letter has now is marked, carries its
// tick and is not offered again; another one replaces it.
function renderVariant(context, place, item) {
    const current = item.type === place.current;
    return html`
        <button type="button" class=${["sf-mail-library-row", current ? "is-selected" : ""].filter(Boolean).join(" ")}
                data-variant=${item.type} data-family=${place.family} aria-pressed=${String(current)}
                title=${`${item.title} — ${item.purpose ?? ""}`}
                @click=${() => context.component.replace({family: place.family, type: item.type})}>
            <sf-icon class="sf-mail-library-row-icon" icon=${item.icon || "widgets"} size="2" aria-hidden="true"></sf-icon>
            <span class="sf-mail-library-row-words">
                <span class="sf-mail-library-row-title">${item.title}</span>
                ${item.purpose ? html`<span class="sf-mail-library-row-purpose">${item.purpose}</span>` : nothing}
                <span class="sr-only">${current ? context.currentLabel : `${context.changeVariantLabel} ${place.title}`}</span>
            </span>
            <span class="sf-mail-library-row-add" aria-hidden="true"><sf-icon icon=${current ? "check" : "swap_horiz"} size="2"></sf-icon></span>
        </button>
    `;
}

// The Library: the search field, the category chips («Все» and one per group,
// when there is more than one group), the groups the search and the category
// leave, then the places («Шапка и подвал») while «Все» is chosen, and the
// empty state when nothing is left.
export function renderMailLibraryTemplate(context) {
    return html`
        <div class=${["sf-mail-library", context.rootClass].filter(Boolean).join(" ")}>
            <sf-input class="sf-mail-library-search" input-type="search" size="1/2" label=${context.searchLabel}
                      value=${context.query}
                      @input=${(event) => context.component.search({query: event.target?.value ?? event.detail?.value ?? ""})}></sf-input>
            ${context.chips.length
                ? html`<div class="sf-mail-library-chips" role="group" aria-label=${context.categoryLabel}>
                    ${context.chips.map((chip) => html`<sf-button size="1/2" appearance=${chip.id === context.category ? "tonal" : "outline"}
                        text=${chip.title} data-category=${chip.id} aria-pressed=${String(chip.id === context.category)}
                        @click=${() => context.component.filter({category: chip.id})}></sf-button>`)}
                </div>`
                : nothing}
            <div class="sf-mail-library-groups">
                ${context.groups.map((group) => html`
                    <div class="sf-mail-library-group" role="group" aria-label=${group.title} data-group=${group.id}>
                        <span class="sf-mail-library-group-title" aria-hidden="true">${group.title}</span>
                        ${group.items.map((item) => renderRow(context, item))}
                    </div>
                `)}
                ${context.places.map((place) => html`
                    <div class="sf-mail-library-group" role="group" aria-label=${place.title} data-group=${`pinned-${place.family}`}>
                        <span class="sf-mail-library-group-title" aria-hidden="true">${place.title}</span>
                        ${place.items.map((item) => renderVariant(context, place, item))}
                    </div>
                `)}
            </div>
            ${context.nothingFound
                ? html`<sf-empty-state class="sf-mail-library-empty" kind="nothing-found" size="1/2" heading-level="3"
                         heading=${context.nothingFoundTitle} text=${context.nothingFoundText}></sf-empty-state>`
                : nothing}
        </div>
    `;
}
