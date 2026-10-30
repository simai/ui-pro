import {html, nothing} from "lit";
import "./default.css";

// The width switch, the two notes, the overlay and the frame. The overlay comes
// before the frame, so the keyboard tree is reached first and the frame, which
// takes no tab stop, is only ever pressed. The frame's sandbox is written here
// and nowhere else: allow-same-origin and nothing more, so the letter runs no
// script and the page can still read it. The overlay stays out of the scroller:
// it clips its own line to what the scroller shows.
export function renderMailCanvasTemplate(context) {
    const {component} = context;
    return html`
        <section class=${["sf-mail-canvas", context.rootClass].filter(Boolean).join(" ")} aria-label=${context.previewLabel}>
            <h2 class="sr-only">${context.previewLabel}</h2>
            ${context.choices.length
                ? html`<div class="sf-mail-canvas-bar">
                    <sf-button-group class="sf-mail-canvas-widths" appearance="segmented" plate="raised" size="1/2"
                                     aria-label=${context.widthsLabel} value=${context.chosenWidth}
                                     items=${JSON.stringify(context.choices)}
                                     @change=${(event) => component.onWidthChange(event)}></sf-button-group>
                </div>`
                : nothing}
            <p class="sf-mail-canvas-note sf-mail-canvas-stale" ?hidden=${!context.isStale}>${context.staleText}</p>
            <p class="sf-mail-canvas-note sf-mail-canvas-weight" role="status" ?hidden=${!context.weightText}>${context.weightText}</p>
            ${context.ownOverlay
                ? html`<section class="sf-mail-canvas-layer" aria-label=${context.layerLabel}>
                    <sf-composition-overlay label=${context.previewLabel} accepts=${context.overlayAccepts || nothing}></sf-composition-overlay>
                </section>`
                : nothing}
            <div class="sf-mail-canvas-scroll">
                <iframe class=${["sf-mail-canvas-frame", context.frameCastsShadow ? "shadow-1" : ""].filter(Boolean).join(" ")}
                        sandbox="allow-same-origin" tabindex="-1" title=${context.frameLabel}
                        width=${context.frameSize || nothing}
                        @load=${() => component.onFrameLoad()}></iframe>
            </div>
        </section>
    `;
}
