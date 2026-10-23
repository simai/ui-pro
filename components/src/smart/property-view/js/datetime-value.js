// A datetime's value, read and written back (Larena acceptance, 2026-10-22).
// Plain functions, no rendering: the editor (datetime-edit.js) and the view
// (index.js) both use them, and the contract test runs them without a DOM.
//
// The value is the host's text, in the site's time zone, as it reads it. The
// round trip is lossless: a field whose day and time come back to what they
// were writes back exactly the text it read. A changed day keeps the record's
// clock (seconds, fraction) and zone; a changed time is hh:mm:00 with the
// record's zone; a new value has no zone and is the site's time, which is how
// the host sends and reads it.

// The forms a datetime arrives in: a day, or a day and a time separated by T or
// a space, with optional seconds, fraction and zone. The renderer set reads
// the same shape (field-renderers DATE_TIME_RE); this one also takes a day alone.
export const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})((?::\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/u;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

// The value without the host's formatting ({value, text} carries both).
function rawValue(value) {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) return value.value;
    return value;
}

// What a stored value is made of. `known` is false for a value that is not a
// datetime at all: the controls start empty and, untouched, nothing is written.
export function splitDateTime(value) {
    const raw = rawValue(value);
    if (raw === null || raw === undefined || raw === '') return {raw: raw ?? null, known: true, date: '', time: '', rest: '', zone: ''};
    const match = typeof raw === 'string' ? raw.trim().match(DATE_TIME_RE) : null;
    if (!match) return {raw, known: false, date: '', time: '', rest: '', zone: ''};
    return {
        raw,
        known: true,
        date: match[1],
        time: match[2] ? `${match[2]}:${match[3]}` : '',
        rest: match[4] || '',
        zone: match[5] || '',
    };
}

// A time as the person typed it, as hh:mm, or null when it is not one. The
// mask gives «10:30»; without it «1030», «9:30» and «9.30» are read too.
export function normalizeTime(text) {
    const value = String(text ?? '').trim().replace(/[_\s]/gu, '');
    if (value === '' || value === ':') return '';
    const match = value.match(/^(\d{1,2})[:.]?(\d{2})$/u);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

// The value to write for a day and a time, against what the field held.
// {value} -- the text to write (null clears), or {error} -- the key of the
// sentence that says what is missing.
export function composeDateTime(original, draft) {
    const date = String(draft?.date ?? '').trim();
    const time = normalizeTime(draft?.time);
    if (time === null) return {error: 'timeInvalid'};
    if (!date && !time) return {value: null};
    if (!DAY_RE.test(date)) return {error: date ? 'dateInvalid' : 'dateMissing'};
    if (!time) return {error: 'timeMissing'};
    const before = original?.known ? original : null;
    // Back to what it was: the very text it read, separator and all.
    if (before && before.date === date && before.time === time) return {value: before.raw};
    // The clock below the minute and the zone are the record's while the
    // person did not change the time; a time they typed is to the minute.
    const sameTime = before && before.time === time;
    const rest = sameTime ? before.rest : ':00';
    const zone = before && before.time ? before.zone : '';
    return {value: `${date}T${time}${rest}${zone}`};
}
