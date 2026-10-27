import {html, nothing} from "lit";
import "./default.css";

// One change put to a person: a heading, the values as they were and as they
// will be, then the answers or the outcome.
//
// The heading is a role="heading" with a level the host chooses, not a fixed
// <h2>: the card is placed inside a message, a panel or a page, and the level
// that is right in one is a skipped level in another.
//
// The values are a description list -- the field is the term, the two values
// its descriptions -- so a screen reader reads «Название: Было Черновик, Станет
// Итоги» rather than a grid of loose words. A value is text, never markup.
//
// Both answers are outlined and weigh the same: a change is decided, not
// nudged, and a filled «Confirm» beside a quiet «Decline» is a nudge.
//
// The status line is a polite live region and also the place focus goes when
// the button that had it disappears (index.js, answer()).
//
// The answers call the actions confirm and cancel, which a page reaches as
// data-sf-action="<id>.confirm" and "<id>.cancel" (§8, §19.4).
const ICON = {open: "schedule", pending: "schedule", accepted: "check_circle", declined: "cancel", expired: "timer_off"};

const value = (context, text) => {
    const shown = text === null || text === undefined || text === "" ? null : String(text);
    return shown === null
        ? html`<span class="sf-change-confirm__value sf-change-confirm__value--empty">${context.emptyValueText}</span>`
        : html`<span class="sf-change-confirm__value">${shown}</span>`;
};

export function renderChangeConfirmTemplate(context) {
    const {component} = context;
    return html`
        <section
                class="sf-change-confirm sf-change-confirm--${context.state}"
                aria-labelledby=${context.heading ? context.headingId : nothing}
                aria-label=${context.heading ? nothing : context.changesLabel}
                data-state=${context.state}
        >
            ${context.heading
                ? html`<div class="sf-change-confirm__heading" id=${context.headingId} role="heading"
                            aria-level=${context.headingLevel}>${context.heading}</div>`
                : nothing}
            ${context.hasDescription
                ? html`<div class="sf-change-confirm__description">${context.description}</div>`
                : nothing}
            <dl class="sf-change-confirm__changes" aria-label=${context.changesLabel}>
                ${context.changes.map((change) => html`
                    <div class="sf-change-confirm__change">
                        <dt class="sf-change-confirm__label">${String(change.label ?? "")}</dt>
                        <dd class="sf-change-confirm__before">
                            <span class="sf-change-confirm__tag">${context.beforeText}</span>
                            ${value(context, change.before)}
                        </dd>
                        <dd class="sf-change-confirm__after">
                            <span class="sf-change-confirm__tag">${context.afterText}</span>
                            ${value(context, change.after)}
                        </dd>
                    </div>
                `)}
            </dl>
            <footer class="sf-change-confirm__footer">
                <!-- Always in the page, empty while there is nothing to say: a live
                     region that appears together with its words is not heard. -->
                <p class="sf-change-confirm__status" role="status" tabindex="-1">
                    ${context.statusText
                        ? html`<sf-icon icon=${ICON[context.state] ?? "schedule"} size="1" aria-hidden="true"></sf-icon>
                            <span>${context.statusText}</span>`
                        : nothing}
                </p>
                <!-- While the answer is applied (pending) the answers stay where they
                     were: the pressed one busy, with the button's own spinner and
                     aria-busy, the other disabled, so the card does not jump and
                     the person sees which answer is on its way. -->
                <div class="sf-change-confirm__actions" ?hidden=${!context.open && !context.pending}>
                    <sf-button
                            appearance="outline"
                            scheme="primary"
                            size="1/2"
                            text=${context.acceptText}
                            data-action="accept"
                            ?loading=${context.pressed === true}
                            ?disabled=${context.disabled && context.pressed !== true}
                            @click=${() => component.confirm()}
                    ></sf-button>
                    <sf-button
                            appearance="outline"
                            scheme="on-surface"
                            size="1/2"
                            text=${context.declineText}
                            data-action="decline"
                            ?loading=${context.pressed === false}
                            ?disabled=${context.disabled && context.pressed !== false}
                            @click=${() => component.cancel()}
                    ></sf-button>
                </div>
            </footer>
        </section>
    `;
}
