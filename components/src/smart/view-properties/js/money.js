import {formatDecimal} from './decimal.js';

// Money and percent as a person reads them, from decimal strings, never a
// float: the currency's sign and minor units come from Intl, the digits from
// ./decimal.js. Pure, so the unit suite reads it without a browser.

const CURRENCY = new Map();
/** {sign, before, minor}: the sign a locale writes, whether before the amount, and the ISO 4217 minor units. */
export function currencyOf(code, locale) {
    const id = `${code}|${locale}`;
    if (!CURRENCY.has(id)) {
        let sign = code;
        let before = false;
        let minor = 2;
        try {
            const format = new Intl.NumberFormat(locale, {style: 'currency', currency: code, currencyDisplay: 'narrowSymbol'});
            const parts = format.formatToParts(1);
            const at = parts.findIndex((part) => part.type === 'currency');
            sign = parts[at]?.value ?? code;
            before = at < parts.findIndex((part) => part.type === 'integer');
            minor = format.resolvedOptions().maximumFractionDigits;
        } catch {
            // A code Intl does not know keeps its letters and two minor digits.
        }
        CURRENCY.set(id, {sign, before, minor});
    }
    return CURRENCY.get(id);
}

/** An amount with its currency, as a person reads it: «1 500,50 ₽», «$1,500.50». */
export function formatMoney(amount, code, locale) {
    if (!code) return formatDecimal(amount, locale);
    const {sign, before, minor} = currencyOf(code, locale);
    const number = formatDecimal(amount, locale, {minFraction: minor});
    if (!number) return '';
    return before ? `${sign}${number}` : `${number} ${sign}`;
}

/** A money value as {amount, currency}; a field that fixes the currency takes a bare amount. */
export function moneyParts(value, fixed) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return {amount: value.amount ?? null, currency: fixed || (value.currency ?? null)};
    }
    if (value === null || typeof value === 'undefined' || value === '') return {amount: null, currency: fixed || null};
    return {amount: value, currency: fixed || null};
}

export function percentText(value, locale) {
    const number = formatDecimal(value, locale);
    if (!number) return '';
    // ru-RU writes «12,5 %», en «12.5%»: the space is the locale's, read from Intl.
    let spaced = false;
    try {
        spaced = new Intl.NumberFormat(locale, {style: 'percent'}).formatToParts(0.5)
            .some((part) => part.type === 'literal' && /\s/u.test(part.value));
    } catch {
        spaced = false;
    }
    return `${number}${spaced ? ' ' : ''}%`;
}

