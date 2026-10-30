import {html, nothing} from "lit";
import {repeat} from "lit/directives/repeat.js";
import "./default.css";

// A row: its handle (a pin for a place that does not move), its icon, the name
// and what it holds, and ⋯, whose space is kept. One row of the list is the tab
// stop; arrows go between rows.
function renderRow(context, row) {
    const {component} = context;
    return html`
        <div class=${["sf-mail-structure-row", row.isSelected ? "is-selected" : "", row.family ? "is-pinned" : ""].filter(Boolean).join(" ")}
             data-sf-sortable-item=${row.id} data-family=${row.family || nothing} tabindex=${row.isStop ? "0" : "-1"}
             aria-current=${row.isSelected ? "true" : "false"}
             @focus=${() => { component.stop = row.id; }}
             @click=${(event) => component.onRowClick(event, row.id)}
             @keydown=${(event) => component.onRowKeydown(event, row.id)}>
            ${row.family
                ? html`<span class="sf-mail-structure-handle" aria-hidden="true" title=${context.pinnedLabel}><sf-icon icon="push_pin" size="1"></sf-icon></span>`
                : html`<span class="sf-mail-structure-handle" data-sf-sortable-handle aria-hidden="true"><sf-icon icon="drag_indicator" size="1"></sf-icon></span>`}
            <sf-icon class="sf-mail-structure-icon" icon=${row.icon || "widgets"} size="2" aria-hidden="true"></sf-icon>
            <span class="sf-mail-structure-words">
                <span class="sf-mail-structure-title">${row.title}</span>
                ${row.summary ? html`<span class="sf-mail-structure-summary">${row.summary}</span>` : nothing}
            </span>
            <sf-icon-button class="sf-mail-structure-more" size="1/2" appearance="link" icon="more_horiz" tabindex="-1"
                            aria-label=${row.actionsLabel} title=${row.actionsLabel}
                            @click=${(event) => component.openMenu(row.id, event.currentTarget)}></sf-icon-button>
        </div>
    `;
}

function renderEmpty(context) {
    const {component} = context;
    return html`
        <sf-empty-state class="sf-mail-structure-empty" kind="no-data" size="1/2" heading-level="3"
                        heading=${context.emptyTitle} text=${context.emptyText}>
            <sf-button slot="actions" size="1/2" appearance="outline" icon-start="add" text=${context.addLabel}
                       data-action="add" @click=${() => component.add()}></sf-button>
        </sf-empty-state>
    `;
}

// The structure: the letter's settings, the rows in the letter's order (with
// the empty card where the first block will go), then «Добавить блок» unless
// the card says it already.
export function renderMailStructureTemplate(context) {
    const {component} = context;
    return html`
        <div class=${["sf-mail-structure", context.rootClass].filter(Boolean).join(" ")}>
            <button type="button" class=${["sf-mail-structure-row", "sf-mail-structure-settings", context.settingsSelected ? "is-selected" : ""].filter(Boolean).join(" ")}
                    aria-current=${context.settingsSelected ? "true" : "false"}
                    @click=${() => component.select({id: ""})}>
                <span class="sf-mail-structure-handle" aria-hidden="true"></span>
                <sf-icon class="sf-mail-structure-icon" icon="tune" size="2" aria-hidden="true"></sf-icon>
                <span class="sf-mail-structure-title">${context.settingsLabel}</span>
            </button>
            <sf-sortable class="sf-mail-structure-list" group="letter" label=${context.listLabel} .inserterItems=${context.kinds}
                         @sf-sortable-move=${(event) => component.onSortableMove(event)}
                         @sf-sortable-insert=${(event) => component.onSortableInsert(event)}>
                ${repeat(context.rows, (row) => row.id, (row) => html`${row.id === context.emptyBefore ? renderEmpty(context) : nothing}${renderRow(context, row)}`)}
                ${context.empty && !context.emptyBefore ? renderEmpty(context) : nothing}
            </sf-sortable>
            ${context.empty
                ? nothing
                : html`<button type="button" class="sf-mail-structure-row sf-mail-structure-add" data-action="add" @click=${() => component.add()}>
                    <span class="sf-mail-structure-handle" aria-hidden="true"></span>
                    <sf-icon class="sf-mail-structure-icon" icon="add" size="2" aria-hidden="true"></sf-icon>
                    <span class="sf-mail-structure-title">${context.addLabel}</span>
                </button>`}
            <span class="sf-mail-structure-notice sr-only" role="status">${context.noticeText}</span>
            <sf-context-menu class="sf-mail-structure-menu" popup
                             @sf-context-menu-select=${(event) => {
                                 event.stopPropagation();
                                 component.onMenuSelect(event.detail);
                             }}></sf-context-menu>
        </div>
    `;
}
