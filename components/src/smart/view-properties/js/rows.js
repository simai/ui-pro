import {add, decimalString, multiply, round, share, toDecimal} from './decimal.js';
import {currencyOf, moneyParts} from './money.js';

// Rows over columns (Larena property types standard, notes of 2026-11-03,
// `items@1`): the columns as the set reads them, the computed cells of a row
// and the totals under summed columns, on decimal strings. Pure, so the unit
// suite reads it without a browser.

export const NUMERIC = new Set(['integer', 'number', 'percent', 'money']);

// A column as the set reads it: its settings beside its own keys, its type
// under the name the renderers address (`propertyType`).
export function columnOf(column) {
    const {settings, ...own} = column ?? {};
    const type = own.propertyType || own.type;
    return {...(settings && typeof settings === 'object' ? settings : {}), ...own, propertyType: type, type};
}

export function columnsOf(field) {
    return (Array.isArray(field.columns) ? field.columns : []).map(columnOf).filter((column) => column.key);
}

export function rowsOf(value) {
    return Array.isArray(value) ? value.map((row) => (row && typeof row === 'object' ? row : {})) : [];
}

// The decimal a numeric cell holds, or null.
export function cellDecimal(column, cell) {
    if (cell === null || typeof cell === 'undefined' || cell === '') return null;
    if (column.propertyType === 'money') return toDecimal(moneyParts(cell, column.currency).amount);
    return toDecimal(cell);
}

// The currency a money column's cells are in: its own, else the one money
// operand's when it is computed.
export function columnCurrency(column, columns) {
    if (column.currency) return column.currency;
    if (column.compute?.of) {
        const operand = columns.find((one) => column.compute.of.includes(one.key) && one.propertyType === 'money');
        return operand?.currency ?? null;
    }
    return null;
}

/**
 * A row with its computed cells worked out from the cells typed: a product of
 * two or three operands, a percent counting as its share, rounded half away
 * from zero to the currency's minor units or the column's `scale` (2 by
 * default). A computed cell whose operands are not all there is no cell. The
 * keys follow the columns, the computed ones last. The server works the same
 * out and is the authority.
 */
export function computeRow(row, columns, locale = 'en') {
    const typed = {};
    const computed = {};
    for (const column of columns) {
        if (column.compute) continue;
        if (Object.hasOwn(row, column.key) && row[column.key] !== null && row[column.key] !== '') typed[column.key] = row[column.key];
    }
    for (const column of columns) {
        if (!column.compute || column.compute.op !== 'multiply' || !Array.isArray(column.compute.of)) continue;
        let product = null;
        let currency = null;
        for (const key of column.compute.of) {
            const operand = columns.find((one) => one.key === key);
            const decimal = operand ? cellDecimal(operand, typed[key]) : null;
            if (!decimal) { product = null; break; }
            if (operand.propertyType === 'money') currency = moneyParts(typed[key], operand.currency).currency;
            const factor = operand.propertyType === 'percent' ? share(decimal) : decimal;
            product = product ? multiply(product, factor) : factor;
        }
        if (!product) continue;
        if (column.propertyType === 'money') {
            const code = column.currency || currency;
            const scale = code ? currencyOf(code, locale).minor : 2;
            computed[column.key] = {amount: decimalString(round(product, scale)), currency: code};
        } else {
            const scale = column.propertyType === 'integer' ? 0 : Number.isInteger(column.scale) ? column.scale : 2;
            computed[column.key] = decimalString(round(product, scale));
        }
    }
    return {...typed, ...computed};
}

/** The sums of the columns marked `total: "sum"`, as decimals by key. */
export function rowTotals(rows, columns) {
    const totals = {};
    for (const column of columns) {
        if (column.total !== 'sum' || !NUMERIC.has(column.propertyType)) continue;
        let sum = {units: 0n, scale: 0};
        for (const row of rows) {
            const decimal = cellDecimal(column, row[column.key]);
            if (decimal) sum = add(sum, decimal);
        }
        totals[column.key] = sum;
    }
    return totals;
}

