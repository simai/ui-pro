import {html} from "lit";
import "./default.css";

// The sheet: the page's title (a textbox, which a heading may not be), then
// its blocks (drawn by the element itself, js/view.js, because
// sf-inline-editor owns a field while it is typed in), the gutter beside the
// block under the pointer, the line a pulled block lands on, the / list, the
// parameters form, the one menu of the + and the grip, the inline editor's
// carrier and a status line for a reader. Nothing here is a frame: text is the
// interface.
export function renderContentEditorTemplate(context) {
    const {component} = context;
    return html`
        <div class=${["sf-content-editor", context.rootClass].filter(Boolean).join(" ")}
             @input=${(event) => component.onInner(event)} @change=${(event) => component.onInner(event)}>
            <div class="sf-content-editor-sheet">
                <div class="sf-content-editor-title" contenteditable="plaintext-only" role="textbox" spellcheck="true"
                     aria-label=${context.titleLabel} data-placeholder=${context.titlePlaceholder}></div>
                <div class="sf-content-editor-blocks" role="group" tabindex="-1" aria-label=${context.label}></div>
                <div class="sf-content-editor-gutter">
                    <sf-icon-button class="sf-content-editor-plus" size="1/2" appearance="link" icon="add"
                                    aria-label=${context.plusLabel} title=${context.plusLabel}
                                    @click=${(event) => component.openMenu("plus", event.currentTarget)}></sf-icon-button>
                    <sf-icon-button class="sf-content-editor-grip" size="1/2" appearance="link" icon="drag_indicator"
                                    aria-label=${context.gripLabel} title=${context.gripLabel} aria-haspopup="menu"
                                    @pointerdown=${(event) => component.onGripDown(event)}
                                    @keydown=${(event) => component.onGripKey(event)}></sf-icon-button>
                </div>
                <div class="sf-content-editor-drop" hidden></div>
            </div>
            <div class="sf-content-editor-slash" id=${context.slashId} role="listbox" aria-label=${context.slashLabel} hidden></div>
            <div class="sf-content-editor-params" role="dialog" aria-label=${context.paramsLabel} hidden
                 @keydown=${(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); component.closeParams(); } }}></div>
            <sf-context-menu class="sf-content-editor-menu" popup size="1/2"></sf-context-menu>
            <sf-inline-editor></sf-inline-editor>
            <div class="sf-content-editor-live" role="status" aria-live="polite"></div>
        </div>
    `;
}
