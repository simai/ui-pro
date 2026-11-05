import {formatDate} from '../../../core/js/format-date.js';

// A date, a date and time or a time of day in the page's language, through
// the SIMAI Framework's format-date module, for a value the host did not
// format (formatFieldValue). The host's own text still wins; without one, a
// date read «2026-11-02» where a person expects «2 нояб. 2026 г.».
//
// The forms are read as a host stores them: a day «YYYY-MM-DD» is that day on
// the reader's calendar (not UTC midnight, which is the day before west of
// Greenwich); a date and time with a zone is that moment in the reader's zone
// and one without a zone is the wall clock as written; a time «hh:mm[:ss]» is
// a time of day. Anything else is left for the caller to print as it came.
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/u;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/u;

export const DATE_TYPES = new Set(['date', 'datetime', 'time']);

function readMoment(type, text) {
    const day = DAY.exec(text);
    if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    const time = TIME.exec(text);
    if (time) return type === 'time' ? new Date(2000, 0, 1, Number(time[1]), Number(time[2]), Number(time[3] ?? 0)) : null;
    const stamp = DATE_TIME.exec(text);
    if (!stamp) return null;
    if (stamp[7]) {
        const moment = new Date(text.replace(' ', 'T'));
        return Number.isNaN(moment.getTime()) ? null : moment;
    }
    return new Date(Number(stamp[1]), Number(stamp[2]) - 1, Number(stamp[3]), Number(stamp[4]), Number(stamp[5]), Number(stamp[6] ?? 0));
}

// The text for a value of a date type, or '' when it is not one this reads.
export function formatDateValue(type, value, node) {
    if (!DATE_TYPES.has(type) || typeof value !== 'string' || !value.trim()) return '';
    const text = value.trim();
    const moment = readMoment(type, text);
    if (!moment) return '';
    const hasTime = type !== 'date' && !DAY.test(text);
    if (type === 'time') return formatDate(moment, {date: null, time: 'short', node});
    return formatDate(moment, {date: 'medium', time: hasTime ? 'short' : null, node});
}
