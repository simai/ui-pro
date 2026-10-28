import {html, nothing} from "lit";
import "./default.css";

// The template `person`: one message of a conversation between people, as
// js/view/person.js draws it -- grouped with its neighbours by author, the
// reader's own on the end side, with its time, «изменено», its files and,
// where the message allows, edit and delete. One sheet serves both templates.
export function renderChatPersonTemplate(context) {
    return html`<div class="sf-chat-message-host sf-chat-message-host--person">${context.node ?? nothing}</div>`;
}
