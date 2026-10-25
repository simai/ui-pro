import {html, nothing} from "lit";
import "./default.css";

// The frame of the log, drawn in the component's light DOM like every Smart
// component: a document stylesheet does not cross a shadow boundary, and the
// messages a host draws carry their own classes from the page's sheets.
//
// Three names, deliberately different: the scrolling region («Conversation»),
// the log inside it («Messages») and the announcer, which has none. Two
// «Messages» in a row tell a screen reader nothing.
//
// The column is one node the component owns and keeps (see index.js); lit
// places it once and leaves it alone, so prepending history and redrawing a
// message never move the scroll anchor.
//
// The two buttons sit in wrappers that are hidden instead of the buttons: a
// Smart button's host is display: contents, and `hidden` on it does nothing.
export function renderMessageLogTemplate(context) {
    const {component} = context;
    return html`
        <div
                class="sf-message-log ${context.empty ? "sf-message-log--empty" : ""}"
                role="region"
                aria-label=${context.regionLabel}
                tabindex="0"
                @scroll=${() => component.onScroll()}
        >
            <div class="sf-message-log__earlier" ?hidden=${!context.hasMore}>
                <sf-button
                        appearance="link"
                        scheme="on-surface"
                        size="1/2"
                        icon="expand_less"
                        text=${context.earlierText}
                        ?disabled=${context.loadingEarlier}
                        data-action="earlier"
                        @click=${() => component.requestEarlier()}
                ></sf-button>
            </div>
            <div class="sf-message-log__empty" ?hidden=${!context.empty || !context.emptyContent}>
                ${context.emptyContent ?? nothing}
            </div>
            ${context.column}
            <div class="sf-message-log__jump" hidden>
                <sf-icon-button
                        appearance="surface"
                        scheme="on-surface"
                        size="1"
                        radius="rounded"
                        icon="arrow_downward"
                        data-action="latest"
                        title=${context.latestLabel}
                        aria-label=${context.latestLabel}
                        @click=${() => component.scrollToLatest({focus: true})}
                ></sf-icon-button>
            </div>
            <div class="sf-message-log__announcer sr-only" aria-live="polite"></div>
        </div>
    `;
}
