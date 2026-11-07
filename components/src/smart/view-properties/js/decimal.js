// Decimal numbers as strings, never as floats (Larena property types standard,
// notes of 2026-11-03: «Arithmetic is on decimal digits, never on floats»;
// «Never a float on the wire»). A money amount, a percent and every cell a row
// computes are read, multiplied, summed and rounded here on BigInt units, so
// 0.1 + 0.2 is 0.3 and 2 499,99 stays 2 499,99 however many rows add up to it.
//
// A decimal is {units, scale}: the value is units / 10^scale. The canonical
// string has an optional minus, the integer digits without leading zeros and
// the fraction digits as written ("1500.50", "0.5", "-3"); "-0" is "0".

const TYPED = /^([+-]?)(\d*)(?:[.,](\d*))?$/u;
// Spaces a person or a formatter puts between groups of digits: the plain
// space, the no-break space and the narrow no-break space ru-RU writes.
const GROUP_SPACES = /[\s   ']/gu;

/**
 * What a person typed, read as a decimal: `{ok: true, value}` with the
 * canonical string (null for nothing typed), or `{ok: false}` for text that is
 * not a number. A comma and a point both separate the fraction; spaces between
 * groups go.
 */
export function readDecimal(text) {
    if (text === null || typeof text === 'undefined') return {ok: true, value: null};
    if (typeof text === 'number') {
        // A JSON integer is taken as its digits (property types standard §5); a
        // float is not a decimal and is refused rather than guessed at.
        return Number.isSafeInteger(text) ? {ok: true, value: String(text)} : {ok: false};
    }
    const plain = String(text).replace(GROUP_SPACES, '');
    if (plain === '') return {ok: true, value: null};
    const match = TYPED.exec(plain);
    if (!match) return {ok: false};
    const [, sign, whole, fraction] = match;
    if (whole === '' && (fraction ?? '') === '') return {ok: false};
    const integer = whole.replace(/^0+(?=\d)/u, '') || '0';
    const digits = fraction ?? '';
    const zero = /^0*$/u.test(integer + digits);
    const value = `${sign === '-' && !zero ? '-' : ''}${integer}${digits ? `.${digits}` : ''}`;
    return {ok: true, value};
}

/** The decimal of a canonical string or a JSON integer, or null. */
export function toDecimal(value) {
    if (value && typeof value === 'object' && typeof value.units === 'bigint') return value;
    const read = readDecimal(value);
    if (!read.ok || read.value === null) return null;
    const negative = read.value.startsWith('-');
    const [whole, fraction = ''] = read.value.replace('-', '').split('.');
    const units = BigInt(whole + fraction) * (negative ? -1n : 1n);
    return {units, scale: fraction.length};
}

/** How many digits a decimal string has after its point. */
export function fractionDigits(value) {
    const read = readDecimal(value);
    if (!read.ok || read.value === null) return 0;
    const at = read.value.indexOf('.');
    return at === -1 ? 0 : read.value.length - at - 1;
}

const POWERS = new Map();
const power = (n) => {
    if (!POWERS.has(n)) POWERS.set(n, 10n ** BigInt(n));
    return POWERS.get(n);
};

function rescale(decimal, scale) {
    return decimal.scale === scale ? decimal : {units: decimal.units * power(scale - decimal.scale), scale};
}

export function multiply(a, b) {
    return {units: a.units * b.units, scale: a.scale + b.scale};
}

export function add(a, b) {
    const scale = Math.max(a.scale, b.scale);
    return {units: rescale(a, scale).units + rescale(b, scale).units, scale};
}

/** A share: 20 percent is 0.2 (property types standard, rows: «A percent operand counts as its share»). */
export function share(decimal) {
    return {units: decimal.units, scale: decimal.scale + 2};
}

/** Rounded half away from zero to `scale` digits after the point. */
export function round(decimal, scale) {
    if (decimal.scale <= scale) return rescale(decimal, scale);
    const divisor = power(decimal.scale - scale);
    const negative = decimal.units < 0n;
    const magnitude = negative ? -decimal.units : decimal.units;
    let units = magnitude / divisor;
    if ((magnitude % divisor) * 2n >= divisor) units += 1n;
    return {units: negative ? -units : units, scale};
}

export function compare(a, b) {
    const scale = Math.max(a.scale, b.scale);
    const left = rescale(a, scale).units;
    const right = rescale(b, scale).units;
    return left === right ? 0 : left < right ? -1 : 1;
}

/** The canonical string of a decimal, with exactly its scale's digits after the point. */
export function decimalString(decimal) {
    const negative = decimal.units < 0n;
    const digits = (negative ? -decimal.units : decimal.units).toString().padStart(decimal.scale + 1, '0');
    const whole = decimal.scale ? digits.slice(0, -decimal.scale) : digits;
    const fraction = decimal.scale ? digits.slice(-decimal.scale) : '';
    const zero = decimal.units === 0n;
    return `${negative && !zero ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

// The separators of a locale, read once from Intl and kept: a decimal is
// formatted from its digits, so no amount passes through a float to be shown.
const SEPARATORS = new Map();
function separators(locale) {
    if (!SEPARATORS.has(locale)) {
        let group = ' ';
        let point = '.';
        try {
            for (const part of new Intl.NumberFormat(locale).formatToParts(12345.6)) {
                if (part.type === 'group') group = part.value;
                if (part.type === 'decimal') point = part.value;
            }
        } catch {
            // An unknown locale keeps the defaults.
        }
        SEPARATORS.set(locale, {group, point});
    }
    return SEPARATORS.get(locale);
}

/**
 * A decimal string as a person reads it in `locale`: groups of three, the
 * locale's point, and at least `minFraction` digits after it («1 500,50»).
 * Groups start at four digits, as the standard reads money («1 500,50 ₽»).
 */
export function formatDecimal(value, locale, {minFraction = 0} = {}) {
    const decimal = toDecimal(value);
    if (!decimal) return '';
    const text = decimalString(decimal.scale < minFraction ? rescale(decimal, minFraction) : decimal);
    const negative = text.startsWith('-');
    const [whole, fraction] = text.replace('-', '').split('.');
    const {group, point} = separators(locale);
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, group);
    return `${negative ? '−' : ''}${grouped}${fraction ? `${point}${fraction}` : ''}`;
}

/** A decimal string as typed in an input: the locale's point, no groups («1500,5»). */
export function editableDecimal(value, locale) {
    const read = readDecimal(value);
    if (!read.ok || read.value === null) return '';
    return read.value.replace('.', separators(locale).point);
}
