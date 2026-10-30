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

// A line before the message that a window draws. 1.2.0: display.divider, where
// the unread part of a conversation begins («Новые»). 1.3.0: display.day, the
// words of a new calendar day, above «Новые» when both fall here. Nothing to
// press: a separator named by its words, so a screen reader meets it in
// reading order; the message itself is unchanged.
const line = (words, kind) => html`<div class="sf-chat-divider sf-chat-divider--${kind}" role="separator" aria-label=${words}><span class="sf-chat-divider__text">${words}</span></div>`;

export function renderDivider(context) {
    if (!context.day && !context.divider) return nothing;
    return html`${context.day ? line(context.day, "day") : nothing}${context.divider ? line(context.divider, "unread") : nothing}`;
}
