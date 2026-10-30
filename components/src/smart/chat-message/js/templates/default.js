import {html, nothing} from "lit";
import "./default.css";

// One message of a chat (an assistant's answer, its wait or refusal, or a
// person's question with its files), as the view js/view/message.js draws it.
//
// The view is plain DOM, built once per change by the element and placed
// here as one node: Lit never diffs inside a message, so an open «why» card,
// a brief's typed answer and a proposal's card keep their nodes and focus.
//
// The first paint is the message itself: it comes with the host's state, and
// the element reads no clock but the message's own times (§5.4).
export function renderChatMessageTemplate(context) {
    return html`<div class="sf-chat-message-host">${renderDivider(context)}${context.node ?? nothing}</div>`;
}

// 1.2.0: display.divider -- a line before the message that a window draws
// where the unread part of a conversation begins («Новые»). Plain text, so a
// screen reader meets it in reading order; the message itself is unchanged.
export function renderDivider(context) {
    return context.divider ? html`<div class="sf-chat-divider"><span class="sf-chat-divider__text">${context.divider}</span></div>` : nothing;
}
