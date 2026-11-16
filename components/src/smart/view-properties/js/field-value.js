import {html, nothing} from 'lit';
import {renderViewField, renderEditField} from '../../field-renderers/index.js';
import {renderSetField} from './set-fields.js';

// One field's value, shown or edited, drawn by the SIMAI Framework field
// renderers. Moved out of the record component's template (sf-view-properties
// 1.10.0) so that every view of the set that draws a field draws it the same
// way: sf-view-properties and sf-view-flow import this, and neither
// has field code of its own (reuse rule, naming decision 2026-11-02).
//
// `context` is what the caller's template reads:
//   component      changeField(field, value), reportFieldError(field, message),
//                  openReference(field, value); with the uploads and the
//                  picker methods when canUploadFiles / canPickRecords
//   changed        a Map of the values typed and not saved yet, by key
//   size           '1' or '1/2', the renderers' size
//   viewHost       the host the view renderers read (formatFieldValue)
//   emptyText      what an empty value reads as
//   canUploadFiles, canPickRecords   whether the host offers those
export function renderFieldValue(context, field, editing, {disabled = false} = {}) {
    const key = String(field.key ?? '');
    const editHost = {
        setFieldValue: (target, value) => context.component.changeField(target, value),
        // A control that knows its entry is not a value yet says so here (port
        // 1.16.0: a masked string that does not fill its mask); the view holds
        // both saves until it is completed or cleared.
        setFieldError: (target, message) => context.component.reportFieldError(target, message),
        ...(context.canUploadFiles
            ? {
                getFieldUploads: (target) => context.component.getFieldUploads(target),
                startFieldUpload: (target, items) => context.component.startFieldUpload(target, items),
                retryFieldUpload: (target, index) => context.component.retryFieldUpload(target, index),
            }
            : {}),
        ...(context.canPickRecords
            ? {
                getFieldOptionsPage: (target) => context.component.getFieldOptionsPage(target),
                getFieldOptionSearch: (target) => context.component.getFieldOptionSearch(target),
                setFieldOptionSearch: (target, text) => context.component.setFieldOptionSearch(target, text),
                loadFieldOptions: (target, request) => context.component.loadFieldOptions(target, request),
            }
            : {}),
    };
    // Money, a percent, rows and the compound fields are the set's own
    // (js/set-fields.js, Larena addendum of 2026-11-03): drawn from Framework
    // controls, with the edit host above, before the Framework renderers are
    // asked for a type they do not draw.
    const own = renderSetField(field, context.changed.has(key) && editing ? context.changed.get(key) : field.value, editing, editHost,
        {node: context.component, size: context.size, viewHost: context.viewHost, disabled});
    if (own !== null) {
        return own === nothing
            ? html`<span class="sf-property-view-empty color-on-surface-variant">${context.emptyText}</span>`
            : own;
    }

    // A datetime and a time of day are the renderer set's: sf-input-date in
    // mode datetime and time, one control each (SIMAI Framework duplication
    // audit A-14). This view drew its own pair -- the day in a datepicker and
    // the time in a masked field -- which cut the day short in a half-width
    // field and held half-typed entries of its own.
    const content = editing
        ? renderEditField(
            field,
            context.changed.has(key) ? context.changed.get(key) : field.value,
            editHost,
            // A field its condition turns off is drawn disabled where the set
            // draws disabled apart from read-only (a choice as buttons).
            {size: context.size, ...(disabled ? {disabled: true} : {})},
        )
        : renderViewField(field, field.value, context.viewHost, {size: context.size});

    const reference = ['record', 'relation', 'user'].includes(field.propertyType || field.type)
        && field.value && typeof field.value === 'object';
    if (!editing && reference && content) {
        return html`<span
                class="sf-property-view-reference"
                @click=${(event) => {
                    event.preventDefault();
                    // And no further: the field in view is a button that opens
                    // the group for editing, so a press that reached it put the
                    // whole group into edit behind the record that had just
                    // opened (owner, 2026-10-08). Following a reference is one
                    // intent, not two.
                    event.stopPropagation();
                    context.component.openReference(field, field.value);
                }}
        >${content}</span>`;
    }

    // An edit control the set cannot build is not an empty value. record and
    // relation have no editor until the picker's host methods exist, and the
    // first version showed «не заполнено» over a field that had a value -- a
    // consumer read it as the value having been lost. Fall back to the view, so
    // the value is shown and plainly not editable yet.
    if (editing && (content === null || typeof content === 'undefined' || content === nothing)) {
        const shown = renderViewField(field, field.value, context.viewHost, {size: context.size});
        if (shown !== null && typeof shown !== 'undefined' && shown !== nothing) {
            return html`<span class="sf-property-view-readonly color-on-surface-variant" data-readonly="true">${shown}</span>`;
        }
    }

    if (content === null || typeof content === 'undefined' || content === nothing) {
        return html`<span class="sf-property-view-empty color-on-surface-variant">${context.emptyText}</span>`;
    }

    return content;
}
