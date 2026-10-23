import {html} from 'lit';
import {splitDateTime} from './datetime-value.js';

// A datetime field edited as what it is: a day and a time of day (Larena
// acceptance, 2026-10-22: «Дата и время» kept only the day, so a new record
// could not get a time and «15.11.2026 10:30» was saved as «15.11.2026»).
//
// The shared renderer set edits a datetime with sf-datepicker alone, which has
// no clock, and puts the record's old time back on the way out. This view
// draws the pair itself: the Framework's sf-datepicker for the day and the
// Framework's sf-input, masked to hh:mm, for the time -- sf-input has no
// input-type="time" (its types are text, email, password, search, tel, url),
// and a raw <input type="time"> would be the one unstyled control in the panel.
// Both are drawn at the view's size, on one row, each named for assistive
// technology («Начало: дата», «Начало: время»).
//
// The value is the host's text, in the site's time zone, as it reads it. The
// round trip is lossless: an untouched field is not written at all, and a
// field whose day and time come back to what they were writes back exactly
// the text it read. A changed day keeps the record's clock (seconds, fraction)
// and zone; a changed time is hh:mm:00 with the record's zone; a new value has
// no zone and is the site's time, which is how the host sends and reads it.

// The pair. `draft` is what the person has entered so far, kept by the view so
// a half-typed time survives a render; without one the stored value shows.
export function renderDateTimeEdit(context, field, value) {
    const key = String(field.key ?? '');
    const stored = splitDateTime(value);
    const draft = context.component.dateTimeDraft(key) ?? stored;
    const label = String(field.label || field.key || '');
    const words = context.dateTimeText;
    const size = context.size === '1/2' ? '1/2' : '1';
    const name = `sf_field_${field.key || 'value'}`;
    const invalid = context.errors.has(key);
    const change = (part, text) => context.component.changeDateTime(field, value, part, text);

    // The day is bound as a property, not as the value attribute: sf-datepicker
    // reads a value attribute back after the person empties the field, so an
    // attribute-bound day could not be cleared (its date getter falls back to
    // the attribute once its own state is empty).
    return html`
        <div class="sf-property-view-datetime" role="group" aria-label=${label} data-datetime=${key}>
            <sf-datepicker
                    class="sf-property-view-datetime-date"
                    size=${size}
                    name=${`${name}_date`}
                    .value=${draft.date}
                    aria-label=${words.dateLabel.replace('{label}', label)}
                    ?required=${Boolean(field.required)}
                    @change=${(event) => {
                        // The datepicker's own change, not a bubbling native one
                        // from its text field: only the first carries the ISO day.
                        if (event.target !== event.currentTarget) return;
                        change('date', event.detail?.value ?? event.currentTarget?.value ?? '');
                    }}
            ></sf-datepicker>
            <sf-input
                    class="sf-property-view-datetime-time"
                    size=${size}
                    appearance="bordered"
                    root-class="sf-property-view-datetime-time-field"
                    name=${`${name}_time`}
                    value=${draft.time}
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder=${words.placeholder}
                    mask
                    mask-pattern="00:00"
                    ?invalid=${invalid}
                    ?required=${Boolean(field.required)}
                    aria-label=${words.timeLabel.replace('{label}', label)}
                    @change=${(event) => change('time', event.currentTarget?.value ?? '')}
            ></sf-input>
        </div>
    `;
}
