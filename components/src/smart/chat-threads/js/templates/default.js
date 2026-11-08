import {html, nothing} from "lit";
import "./default.css";

// The list, drawn in the component's light DOM: a navigation with a head (the
// way to start a conversation, or the way back from the archive), the rows, a
// foot (the archive, and whatever the host puts in the `footer` slot).
//
// The rows are the Framework's sf-list (since 2.0.0): its rows, groups by day,
// pinned ones first, one Tab stop, renaming, the row's menu and the next page
// are the list's. What stays here is what a list of conversations has around
// its rows: starting one, the archive and the way back, a sentence under the
// rows (in their place when there are none), the footer. The rows reach sf-list from the
// component after a draw (index.js afterRender), as a page.

const command = (icon, label, action, onClick, hidden = false) => html`
    <button type="button" class="sf-thread-list__command" data-action=${action} ?hidden=${hidden} @click=${onClick}>
        <sf-icon icon=${icon} size="2" aria-hidden="true"></sf-icon>
        <span>${label}</span>
    </button>
`;

export function renderThreadListTemplate(context) {
    const {component} = context;
    return html`
        <nav class="sf-thread-list ${context.archived ? "sf-thread-list--archive" : ""}" aria-label=${context.label}>
            <div class="sf-thread-list__head" ?hidden=${!context.canCreate && !context.archived}>
                ${context.createCommands.length
                    ? context.createCommands.map((one) => command(one.icon || "edit_square", one.text, `create:${one.id}`, () => component.create(one.id), !context.canCreate))
                    : command("edit_square", context.createText, "create", () => component.create(), !context.canCreate)}
                ${command("arrow_back", context.backText, "back", () => component.showArchive(false), !context.archived)}
                ${context.archived ? html`<h2 class="sf-thread-list__heading-view">${context.archiveView}</h2>` : nothing}
            </div>
            <div class="sf-thread-list__scroller">
                <sf-list
                        class="sf-thread-list__rows"
                        ?hidden=${Boolean(context.status) && context.empty}
                        label=${context.label}
                        group-by=${context.grouped ? "day" : "none"}
                        heading-level="2"
                        empty-text=${context.emptyText}
                        selected=${context.selected}
                        ?renamable=${context.manage}
                        ?has-more=${context.hasMore}
                        ?loading=${context.loading}
                        .actions=${context.rowActions}
                        @sf-list-open=${(event) => component.onListOpen(event)}
                        @sf-list-rename=${(event) => component.onListRename(event)}
                        @sf-list-apply=${(event) => component.onListApply(event)}
                        @sf-list-load-more=${(event) => component.onListMore(event)}
                ></sf-list>
                <p class="sf-thread-list__status" role="status" ?hidden=${!context.status || context.loading}>${context.status}</p>
            </div>
            <div class="sf-thread-list__footer" ?hidden=${!(context.canArchive && !context.archived) && !context.hasFooter}>
                ${context.canArchive && !context.archived
                    ? command("inventory_2", context.archiveView, "archive-view", () => component.showArchive(true))
                    : nothing}
                ${context.hasFooter ? html`<div class="sf-thread-list__extra">${context.footer}</div>` : nothing}
            </div>
        </nav>
    `;
}
