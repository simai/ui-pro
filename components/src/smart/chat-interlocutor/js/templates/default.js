import {html, nothing} from "lit";
import "./default.css";

// Whom the conversation is with: one native button that names the current
// interlocutor, its chevron, the sentence that describes it to a screen reader
// and the Framework's context menu it opens.
//
// With fewer than two interlocutors the button is a name: disabled, with no
// aria-haspopup, aria-expanded or description, and the chevron hidden.
// Otherwise it is a menu button, closed from the start (aria-expanded false);
// sf-context-menu sets aria-expanded while it is open and puts it back after,
// and the template writes it again only when the button stops or starts being
// a choice.
//
// The menu is printed closed: the first paint is the button (§5.4).
export function renderChatInterlocutorTemplate(context) {
    const {component} = context;
    return html`
        <div class="sf-chat-interlocutor${context.single ? " sf-chat-interlocutor--single" : ""}">
            <button
                    type="button"
                    class="sf-chat-interlocutor__button"
                    aria-label=${context.label}
                    aria-haspopup=${context.single ? nothing : "menu"}
                    aria-expanded=${context.single ? nothing : "false"}
                    aria-describedby=${context.single ? nothing : context.noteId}
                    ?disabled=${context.single}
                    @click=${() => component.openMenu()}
            ><span class="sf-chat-interlocutor__title">${context.title}</span><sf-icon
                    icon="expand_more" size="1/2" aria-hidden="true"></sf-icon></button>
            <sf-context-menu
                    class="sf-chat-interlocutor__menu"
                    popup
                    aria-label=${context.menuLabel}
                    @sf-context-menu-select=${(event) => {
                        event.stopPropagation();
                        component.onMenuSelect(event.detail);
                    }}
            ></sf-context-menu>
            <span class="sf-chat-interlocutor__note sr-only" id=${context.noteId}>${context.note}</span>
        </div>
    `;
}
