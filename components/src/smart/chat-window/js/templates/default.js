import {html, nothing} from "lit";
import "./default.css";

// The whole window: its shell (the conversations beside the conversation,
// the field under it), built once by the element as plain DOM and placed
// here as one node. Lit never diffs inside it: the log keeps its scroll while
// history is prepended, the field keeps its caret, and the parts the shell
// holds (sf-thread-list, sf-message-log, sf-chat-composer,
// sf-chat-interlocutor) keep their nodes.
export function renderChatWindowTemplate(context) {
    return html`${context.node ?? nothing}`;
}
