import {html, nothing} from "lit";
import {repeat} from "lit/directives/repeat.js";
import "./default.css";

// The list, drawn in the component's light DOM: a navigation with a head (the
// way to start a conversation, or the way back from the archive), the scrolling
// rows, a foot (the archive, and whatever the host puts in the `footer` slot),
// and one context menu shared by every row.
//
// A row is one native button -- the conversation -- and, when the host lets
// the person manage it, a «⋯» beside it. The «⋯» is not a Tab stop of its own
// (tabindex -1): a list of forty conversations would be eighty stops. It is
// reached from its row with Shift+F10 or the menu key, and by pointer.
//
// The rows are keyed by id, so a conversation that moves to the top keeps its
// node and a redraw does not take focus from the row a person is on.

const ACTIVITIES = new Set(["running", "waiting", "done", "stopped", "failed"]);

const row = (context, thread) => {
    const {component} = context;
    const title = String(thread.title ?? "") || context.untitledText;
    const caption = thread.caption ? String(thread.caption) : "";
    const unread = Number(thread.unread) > 0 ? Math.floor(Number(thread.unread)) : 0;
    const current = thread.id === context.selected;
    const avatar = thread.avatar && typeof thread.avatar === "object" ? thread.avatar : null;
    const pinned = thread.pinned === true;
    // Only the words the badge knows: an unknown one draws no mark rather than
    // a badge with no state.
    const activity = ACTIVITIES.has(thread.activity) ? thread.activity : "";

    if (context.editing === thread.id) {
        return html`
            <li class="sf-thread-list__item sf-thread-list__item--editing" data-id=${thread.id}>
                <input
                        class="sf-thread-list__rename"
                        .value=${title === context.untitledText ? "" : title}
                        maxlength=${context.titleLimit}
                        aria-label=${context.renameLabel}
                        @keydown=${(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                component.finishRename(true, event.currentTarget);
                            }
                            if (event.key === "Escape") {
                                // The Escape is the field's: a panel around the
                                // list must not close on it as well.
                                event.preventDefault();
                                event.stopPropagation();
                                component.finishRename(false, event.currentTarget);
                            }
                        }}
                        @blur=${(event) => component.finishRename(true, event.currentTarget)}
                />
            </li>
        `;
    }

    return html`
        <li class="sf-thread-list__item ${current ? "sf-thread-list__item--current" : ""} ${unread ? "sf-thread-list__item--unread" : ""}"
            data-id=${thread.id}>
            <button
                    type="button"
                    class="sf-thread-list__link"
                    data-id=${thread.id}
                    tabindex=${thread.id === context.tabStop ? "0" : "-1"}
                    aria-current=${current ? "page" : nothing}
                    aria-keyshortcuts=${context.manage ? "Shift+F10 F2" : nothing}
                    title=${caption ? `${title} · ${caption}` : title}
                    @click=${() => component.open(thread.id)}
            >
                ${avatar
                    ? html`<sf-avatar class="sf-thread-list__avatar" size="1/2" aria-hidden="true"
                                      image-url=${avatar["image-url"] ?? ""} text=${avatar.text ?? ""}></sf-avatar>`
                    : nothing}
                <span class="sf-thread-list__text">
                    <span class="sf-thread-list__title">${title}</span>
                    ${caption ? html`<span class="sf-thread-list__caption">${caption}</span>` : nothing}
                    ${pinned ? html`<span class="sf-thread-list__pinned">${context.pinnedText}</span>` : nothing}
                </span>
                ${activity
                    ? html`<sf-badge class="sf-thread-list__activity" size="1/3" appearance="tonal" compact
                                     activity=${activity}></sf-badge>`
                    : nothing}
                ${unread
                    ? html`<sf-badge class="sf-thread-list__unread" size="1/3" scheme="primary"
                                     text=${unread > 99 ? "99+" : String(unread)}
                                     aria-label=${context.unreadLabel(unread)}></sf-badge>`
                    : nothing}
            </button>
            ${context.manage
                ? html`<button
                        type="button"
                        class="sf-thread-list__more"
                        tabindex="-1"
                        aria-haspopup="menu"
                        aria-label=${context.actionsLabel(title)}
                        title=${context.actionsLabel(title)}
                        @click=${(event) => component.openMenu(thread.id, event.currentTarget)}
                ><sf-icon icon="more_horiz" size="1" aria-hidden="true"></sf-icon></button>`
                : nothing}
        </li>
    `;
};

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
                ${command("edit_square", context.createText, "create", () => component.create(), !context.canCreate)}
                ${command("arrow_back", context.backText, "back", () => component.showArchive(false), !context.archived)}
                ${context.archived ? html`<h2 class="sf-thread-list__heading-view">${context.archiveView}</h2>` : nothing}
            </div>
            <div class="sf-thread-list__scroller" aria-busy=${context.loading ? "true" : "false"}>
                ${context.loading
                    ? html`<div class="sf-thread-list__skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
                           <p class="sr-only" role="status">${context.loadingText}</p>`
                    : nothing}
                <div class="sf-thread-list__groups" @keydown=${(event) => component.onKey(event)}>
                    ${repeat(context.groups, (group) => group.key, (group) => context.grouped
                        ? html`
                            <section class="sf-thread-list__group" data-group=${group.key}>
                                <h2 class="sf-thread-list__heading">${group.heading}</h2>
                                <ul class="sf-thread-list__list" aria-label=${group.heading}>
                                    ${repeat(group.threads, (thread) => thread.id, (thread) => row(context, thread))}
                                </ul>
                            </section>`
                        : html`
                            <ul class="sf-thread-list__list" aria-label=${context.label}>
                                ${repeat(group.threads, (thread) => thread.id, (thread) => row(context, thread))}
                            </ul>`)}
                </div>
                <p class="sf-thread-list__status" ?hidden=${!context.status || context.loading}>${context.status}</p>
                <div class="sf-thread-list__sentinel" aria-hidden="true"></div>
            </div>
            <div class="sf-thread-list__footer" ?hidden=${!(context.canArchive && !context.archived) && !context.hasFooter}>
                ${context.canArchive && !context.archived
                    ? command("inventory_2", context.archiveView, "archive-view", () => component.showArchive(true))
                    : nothing}
                ${context.hasFooter ? html`<div class="sf-thread-list__extra">${context.footer}</div>` : nothing}
            </div>
            <sf-context-menu
                    class="sf-thread-list__menu"
                    popup
                    @sf-context-menu-select=${(event) => {
                        event.stopPropagation();
                        component.onMenu(event.detail);
                    }}
            ></sf-context-menu>
        </nav>
    `;
}
