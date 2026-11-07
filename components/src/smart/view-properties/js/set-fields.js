import {html, nothing} from 'lit';
import "./set-fields.css";
import {renderViewField, renderEditField} from '../../field-renderers/index.js';
import {pageLocale, pageText} from '../../../core/js/page-language';
import {compare, decimalString, editableDecimal, formatDecimal, fractionDigits, readDecimal, toDecimal} from './decimal.js';
import {currencyOf, formatMoney, moneyParts, percentText} from './money.js';
import {NUMERIC, columnCurrency, columnsOf, computeRow, rowTotals, rowsOf} from './rows.js';
import {REQUISITE_PARTS, requisiteErrors} from './requisites.js';

// The property types the set draws itself, beside the SIMAI Framework field
// renderers it draws every other type with (Larena addendum of 2026-11-03 to
// the general components task, msg-bf1ad4f3ae00420bb752; Larena property types
// standard, notes of 2026-11-03):
//
//   money          {amount, currency}: an amount and its ISO 4217 currency
//   percent        a decimal with a % after it
//   items          rows over the field's columns: a table editor, a card a row on a phone
//   compound       a fixed set of parts with one value object, checked together
//   ru.requisites  the compound of a Russian organisation's or person's requisites
//
// Each is drawn from Framework controls (sf-input with `text-end`, sf-dropdown,
// sf-button-icon, sf-button) and, inside a row or a compound, by the Framework
// renderers for the types they already draw. Every number is a decimal string
// (./decimal.js): nothing here writes a float.
//
// A control writes what was typed. An entry that is not a value yet -- text
// that is not a number, more digits after the point than the currency has, a
// ИНН whose control digit is wrong -- is written as typed and reported through
// setFieldError, which holds both saves while it stands (port 1.16.0, as a
// masked string does), and the control says what is wrong under itself once
// the person has left it.

const TEXT = {
    en: {
        currency: 'Currency',
        notNumber: 'Enter a number',
        fractionMax: 'At most {n} digits after the point',
        fractionNone: 'A whole amount, no digits after the point',
        chooseCurrency: 'Choose a currency',
        range: 'From {min} to {max}',
        atLeast: 'At least {min}',
        atMost: 'At most {max}',
        addRow: 'Add a row',
        removeRow: 'Remove the row',
        rowUp: 'Move the row up',
        rowDown: 'Move the row down',
        row: 'Row {n}',
        total: 'Total',
        cellsWrong: 'Some cells are not filled in correctly',
        rows: '{n} rows',
        row1: '1 row',
        inn: 'INN',
        kpp: 'KPP',
        ogrn: 'OGRN',
        bik: 'BIK',
        account: 'Account',
        corr_account: 'Correspondent account',
        innRequired: 'The INN is required',
        innLength: '10 digits for an organisation, 12 for a person',
        innWrong: 'The INN control digits do not match',
        kppWrong: 'Nine characters: four digits, two digits or letters, three digits',
        kppPerson: 'A person\'s INN has no KPP',
        ogrnLength: '13 digits (OGRN) or 15 (OGRNIP)',
        ogrnWrong: 'The control digit does not match',
        ogrnOrganization: 'An organisation has a 13-digit OGRN',
        ogrnPerson: 'A person has a 15-digit OGRNIP',
        bikWrong: 'Nine digits starting with 04',
        accountLength: '20 digits',
        accountKey: 'The account does not match the BIK',
        corrStart: 'A correspondent account starts with 301',
    },
    ru: {
        currency: 'Валюта',
        notNumber: 'Введите число',
        fractionMax: 'Не больше {n} знаков после запятой',
        fractionNone: 'Целая сумма, без знаков после запятой',
        chooseCurrency: 'Выберите валюту',
        range: 'От {min} до {max}',
        atLeast: 'Не меньше {min}',
        atMost: 'Не больше {max}',
        addRow: 'Добавить строку',
        removeRow: 'Удалить строку',
        rowUp: 'Поднять строку',
        rowDown: 'Опустить строку',
        row: 'Строка {n}',
        total: 'Итого',
        cellsWrong: 'Не все ячейки заполнены верно',
        rows: '{n} строк',
        row1: '1 строка',
        inn: 'ИНН',
        kpp: 'КПП',
        ogrn: 'ОГРН',
        bik: 'БИК',
        account: 'Расчётный счёт',
        corr_account: 'Корр. счёт',
        innRequired: 'ИНН обязателен',
        innLength: '10 цифр у организации, 12 у физлица',
        innWrong: 'Не сходятся контрольные цифры ИНН',
        kppWrong: 'Девять знаков: четыре цифры, две цифры или буквы, три цифры',
        kppPerson: 'У ИНН физлица нет КПП',
        ogrnLength: '13 цифр (ОГРН) или 15 (ОГРНИП)',
        ogrnWrong: 'Не сходится контрольная цифра',
        ogrnOrganization: 'У организации ОГРН из 13 цифр',
        ogrnPerson: 'У физлица ОГРНИП из 15 цифр',
        bikWrong: 'Девять цифр, начиная с 04',
        accountLength: '20 цифр',
        accountKey: 'Счёт не сходится с БИК',
        corrStart: 'Корр. счёт начинается с 301',
    },
};
const WORDS_OF = 'sf-view-properties';

function word(node, key, vars = {}) {
    let text = pageText(TEXT, key, node, WORDS_OF);
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
    return text;
}

// ru counts: 1 строка, 2–4 строки, 5+ строк.
function rowsWord(node, count) {
    const locale = pageLocale(node);
    if (count === 1) return word(node, 'row1');
    if (locale.startsWith('ru')) {
        const tens = count % 100;
        const ones = count % 10;
        if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${count} строки`;
    }
    return word(node, 'rows', {n: count});
}

export const SET_FIELD_TYPES = Object.freeze(['money', 'percent', 'items', 'compound', 'ru.requisites']);

// --- Currencies -------------------------------------------------------------

// The currencies a money field offers when it does not fix one: the ones a
// Russian-language business meets most, and the value's own currency first
// when it is none of them. A field that fixes `currency` offers no choice.
const OFFERED_CURRENCIES = ['RUB', 'USD', 'EUR', 'CNY', 'KZT', 'BYN', 'AED', 'TRY', 'GBP', 'JPY'];

// --- What a person is typing -------------------------------------------------

// The text in a decimal input while it is being typed. The value written is
// canonical («12.5»); drawn back as such it would move the caret under the
// person typing «12,50». So the typed text is kept per control and shown while
// it still reads as the value, and dropped when the control is left.
const DRAFTS = new WeakMap();
const draftsOf = (node) => {
    if (!DRAFTS.has(node)) DRAFTS.set(node, new Map());
    return DRAFTS.get(node);
};
// The controls a person has left: a message stands under a control only then,
// as a masked string's does.
const LEFT = new WeakMap();
const leftOf = (node) => {
    if (!LEFT.has(node)) LEFT.set(node, new Set());
    return LEFT.get(node);
};
const redraw = (node) => node?.requestComponentUpdate?.('changed');

function shownText(node, path, value, locale) {
    const draft = draftsOf(node).get(path);
    const read = readDecimal(value);
    if (!read.ok) return String(value ?? '');
    if (typeof draft === 'string') {
        const typed = readDecimal(draft);
        if (typed.ok && typed.value === read.value) return draft;
    }
    return editableDecimal(read.value, locale);
}

// The mistake of a typed decimal, or null: not a number, more digits after the
// point than allowed, outside the bounds.
function decimalError(node, raw, {maxFraction = null, min = null, max = null} = {}) {
    const read = readDecimal(raw);
    if (!read.ok) return word(node, 'notNumber');
    if (read.value === null) return null;
    if (maxFraction !== null && fractionDigits(read.value) > maxFraction) {
        return maxFraction === 0 ? word(node, 'fractionNone') : word(node, 'fractionMax', {n: maxFraction});
    }
    const value = toDecimal(read.value);
    const low = toDecimal(min);
    const high = toDecimal(max);
    const locale = pageLocale(node);
    if ((low && compare(value, low) < 0) || (high && compare(value, high) > 0)) {
        if (low && high) return word(node, 'range', {min: formatDecimal(min, locale), max: formatDecimal(max, locale)});
        return low ? word(node, 'atLeast', {min: formatDecimal(min, locale)}) : word(node, 'atMost', {max: formatDecimal(max, locale)});
    }
    return null;
}

/**
 * One decimal input: sf-input with the decimal keyboard and `text-end` (a % or
 * a currency sign). `write(text, error)` gets what was typed -- canonical when
 * it reads as a number -- and the mistake, or null.
 */
function decimalInput(node, {path, value, size, label, required, textEnd, placeholder, check, write}) {
    const locale = pageLocale(node);
    const text = shownText(node, path, value, locale);
    const error = check(text);
    const shown = error && leftOf(node).has(path) ? error : '';
    const typed = (event) => {
        const raw = event.target?.value ?? '';
        draftsOf(node).set(path, raw);
        const read = readDecimal(raw);
        write(read.ok ? read.value : raw, check(raw));
    };
    return html`
        <sf-input
                class="sf-view-fields-decimal"
                size=${size}
                appearance="bordered"
                inputmode="decimal"
                value=${text}
                text-end=${textEnd || nothing}
                placeholder=${placeholder || nothing}
                ?required=${Boolean(required)}
                ?invalid=${Boolean(shown)}
                error-message=${shown || nothing}
                aria-label=${label || ''}
                data-path=${path}
                @input=${typed}
                @change=${typed}
                @focusout=${() => {
                    draftsOf(node).delete(path);
                    leftOf(node).add(path);
                    redraw(node);
                }}
        ></sf-input>
    `;
}

// --- percent -------------------------------------------------------------------

function percentBounds(field) {
    // 0 and 100 when the field sets none (property types standard §2).
    return {min: field.min ?? '0', max: field.max ?? '100'};
}

function renderPercentEdit(field, value, host, ctx) {
    const {min, max} = percentBounds(field);
    return decimalInput(ctx.node, {
        path: ctx.path ?? String(field.key ?? ''),
        value, size: ctx.size, label: field.label || field.key, required: field.required,
        textEnd: '%', placeholder: field.placeholder,
        check: (text) => decimalError(ctx.node, text, {min, max}),
        write: (next, error) => {
            host.setFieldValue(field, next);
            host.setFieldError?.(field, error);
        },
    });
}

function renderPercentView(field, value, ctx) {
    const text = percentText(value, pageLocale(ctx.node));
    return text ? html`<span class="sf-field-view">${text}</span>` : nothing;
}

// --- money ---------------------------------------------------------------------

function renderMoneyEdit(field, value, host, ctx) {
    const node = ctx.node;
    const locale = pageLocale(node);
    const path = ctx.path ?? String(field.key ?? '');
    const fixed = typeof field.currency === 'string' && field.currency ? field.currency : null;
    const parts = moneyParts(value, fixed);
    // A currency chosen before an amount is typed waits here: a value is an
    // amount and its currency, never a currency alone.
    const currencyPath = `${path}#currency`;
    const currency = parts.currency || draftsOf(node).get(currencyPath) || null;
    const minor = currency ? currencyOf(currency, locale).minor : null;
    const check = (text) => {
        const error = decimalError(node, text, {maxFraction: minor, min: field.min ?? null, max: field.max ?? null});
        if (error) return error;
        return readDecimal(text).value !== null && !currency ? word(node, 'chooseCurrency') : null;
    };
    const write = (amount, error, code = currency) => {
        host.setFieldValue(field, amount === null ? null : {amount, currency: code});
        host.setFieldError?.(field, error);
    };
    const amount = decimalInput(node, {
        path, value: parts.amount, size: ctx.size, label: field.label || field.key, required: field.required,
        textEnd: fixed ? currencyOf(fixed, locale).sign : '', placeholder: field.placeholder,
        check, write,
    });
    if (fixed) return amount;

    const offered = [...new Set([...(currency ? [currency] : []), ...OFFERED_CURRENCIES])];
    return html`
        <span class="sf-view-fields-money flex gap-1/3 min-w-0">
            ${amount}
            <sf-dropdown
                    class="sf-view-fields-currency"
                    size=${ctx.size}
                    appearance="outlined"
                    mode="select"
                    search="false"
                    value=${currency ?? ''}
                    placeholder=${word(node, 'currency')}
                    aria-label=${word(node, 'currency')}
                    .options=${offered.map((code) => ({
                        type: 'text', size: '1', value: code,
                        text: `${code} ${currencyOf(code, locale).sign === code ? '' : currencyOf(code, locale).sign}`.trim(),
                        selected: code === currency,
                    }))}
                    @change=${(event) => {
                        const code = event.detail?.value || null;
                        draftsOf(node).set(currencyPath, code);
                        const typed = parts.amount;
                        if (typed !== null && typed !== '') {
                            const nextMinor = code ? currencyOf(code, locale).minor : null;
                            const error = decimalError(node, typed, {maxFraction: nextMinor, min: field.min ?? null, max: field.max ?? null})
                                || (code ? null : word(node, 'chooseCurrency'));
                            write(readDecimal(typed).ok ? readDecimal(typed).value : typed, error, code);
                        } else {
                            redraw(node);
                        }
                    }}
            ></sf-dropdown>
        </span>
    `;
}

function moneyText(field, value, locale) {
    const fixed = typeof field.currency === 'string' && field.currency ? field.currency : null;
    const {amount, currency} = moneyParts(value, fixed);
    return amount === null ? '' : formatMoney(amount, currency, locale);
}

function renderMoneyView(field, value, ctx) {
    const text = moneyText(field, value, pageLocale(ctx.node));
    return text ? html`<span class="sf-field-view sf-view-fields-amount">${text}</span>` : nothing;
}

// --- number inside a row -----------------------------------------------------------

// A number cell of a row is a decimal string as a money amount is: the
// Framework's number editor writes a float, which the rows refuse. An integer
// cell is the Framework's own.
function renderDecimalEdit(field, value, host, ctx) {
    return decimalInput(ctx.node, {
        path: ctx.path ?? String(field.key ?? ''),
        value, size: ctx.size, label: field.label || field.key, required: field.required,
        textEnd: field.unit || '', placeholder: field.placeholder,
        check: (text) => decimalError(ctx.node, text, {min: field.min ?? null, max: field.max ?? null}),
        write: (next, error) => {
            host.setFieldValue(field, next);
            host.setFieldError?.(field, error);
        },
    });
}

function decimalText(field, value, locale) {
    const text = formatDecimal(value, locale);
    return text && field.unit ? `${text} ${field.unit}` : text;
}

// --- items: rows over columns ------------------------------------------------------

function cellText(column, cell, columns, locale, viewHost) {
    if (cell === null || typeof cell === 'undefined' || cell === '') return null;
    switch (column.propertyType) {
        case 'money': {
            const {amount, currency} = moneyParts(cell, columnCurrency(column, columns));
            return amount === null ? null : formatMoney(amount, currency, locale);
        }
        case 'percent': return percentText(cell, locale);
        case 'number': return decimalText(column, cell, locale);
        default: {
            const shown = renderViewField({...column, value: cell}, cell, viewHost, {size: '1'});
            return shown === null || shown === nothing ? null : shown;
        }
    }
}

function totalText(column, total, columns, locale) {
    if (column.propertyType === 'money') {
        const currency = columnCurrency(column, columns);
        return formatMoney(decimalString(total), currency, locale);
    }
    if (column.propertyType === 'percent') return percentText(decimalString(total), locale);
    return decimalText(column, decimalString(total), locale);
}

// A column's share of the row: text widest, a yes-or-no narrowest.
function track(column) {
    switch (column.propertyType) {
        case 'boolean': return 'minmax(4rem, auto)';
        // Wide enough for the control's own padding, a suffix (% or a currency
        // sign) and the digits a person types: a 5.5rem percent showed «2 %» for 20.
        case 'integer': return 'minmax(5.5rem, 0.6fr)';
        case 'percent': return 'minmax(6.5rem, 0.6fr)';
        case 'number': return 'minmax(6.5rem, 0.7fr)';
        case 'money': return column.currency ? 'minmax(9rem, 0.9fr)' : 'minmax(13rem, 1.2fr)';
        case 'date': return 'minmax(9rem, 0.8fr)';
        case 'choice': return 'minmax(8rem, 1fr)';
        default: return 'minmax(10rem, 2fr)';
    }
}

function itemsSummary(field, rows, columns, ctx) {
    const locale = pageLocale(ctx.node);
    const totals = rowTotals(rows, columns);
    const first = columns.find((column) => Object.hasOwn(totals, column.key) && column.propertyType === 'money')
        ?? columns.find((column) => Object.hasOwn(totals, column.key));
    const count = rowsWord(ctx.node, rows.length);
    return first ? `${count}, ${word(ctx.node, 'total').toLowerCase()} ${totalText(first, totals[first.key], columns, locale)}` : count;
}

function renderItemsTable(field, rows, columns, ctx, {editing, host}) {
    const node = ctx.node;
    const locale = pageLocale(node);
    const key = String(field.key ?? '');
    const minRows = Number.isInteger(field.minRows) ? field.minRows : 0;
    const maxRows = Number.isInteger(field.maxRows) ? field.maxRows : 1000;
    // Fewer rows than the field asks for are drawn as empty rows to fill in,
    // and written only once something is typed in them.
    const drawn = editing ? [...rows, ...Array.from({length: Math.max(0, minRows - rows.length)}, () => ({}))] : rows;
    const totals = rowTotals(rows, columns);
    const hasTotals = Object.keys(totals).length > 0;
    const template = `${columns.map(track).join(' ')}${editing ? ' auto' : ''}`;

    // Every cell's mistake, by row and column, reported as one for the field:
    // the field holds the save while any cell does.
    const errors = cellErrorsOf(node, key);
    const reportCells = () => {
        const any = [...errors.values()].some(Boolean);
        host.setFieldError?.(field, any ? word(node, 'cellsWrong') : null);
    };

    const writeRows = (next) => {
        const computed = next.map((row) => computeRow(row, columns, locale));
        host.setFieldValue(field, computed.length ? computed : null);
    };
    const writeCell = (index, column, cell) => {
        const next = drawn.map((row) => ({...row}));
        if (cell === null || typeof cell === 'undefined' || cell === '') delete next[index][column.key];
        else next[index][column.key] = cell;
        writeRows(next.slice(0, Math.max(rows.length, index + 1)));
    };
    // Rows move: what was typed in a cell and is not a value yet goes with the
    // cell's place, so the drafts of this field are dropped.
    const reshape = (next) => {
        for (const path of [...draftsOf(node).keys()]) if (path.startsWith(`${key}[`)) draftsOf(node).delete(path);
        for (const path of [...leftOf(node)]) if (path.startsWith(`${key}[`)) leftOf(node).delete(path);
        errors.clear();
        reportCells();
        writeRows(next);
    };

    const cell = (row, index, column) => {
        const path = `${key}[${index}].${column.key}`;
        const value = row[column.key];
        if (!editing || column.compute || field.readonly === true || column.readonly === true) {
            const text = cellText(column, column.compute && editing ? computeRow(row, columns, locale)[column.key] : value, columns, locale, ctx.viewHost);
            return html`<span class="sf-view-items-text ${column.compute ? 'color-on-surface-variant' : ''}" data-computed=${column.compute ? 'true' : nothing}>${text ?? html`<span class="color-on-surface-variant">—</span>`}</span>`;
        }
        const cellField = {...column, key: path, label: column.label || column.key, value};
        const cellHost = {
            setFieldValue: (_target, next) => writeCell(index, column, next),
            setFieldError: (_target, message) => {
                errors.set(path, message || null);
                reportCells();
            },
        };
        const cellCtx = {...ctx, path};
        switch (column.propertyType) {
            case 'money': return renderMoneyEdit({...cellField, currency: column.currency}, value, cellHost, cellCtx);
            case 'percent': return renderPercentEdit(cellField, value, cellHost, cellCtx);
            case 'number': return renderDecimalEdit(cellField, value, cellHost, cellCtx);
            default: {
                const control = renderEditField(cellField, value, cellHost, {size: ctx.size});
                return control ?? html`<span class="sf-view-items-text">${cellText(column, value, columns, locale, ctx.viewHost) ?? '—'}</span>`;
            }
        }
    };

    const rowActions = (index) => html`
        <span class="sf-view-items-actions flex items-cross-center gap-1/4" role="cell">
            <sf-button-icon size="1/2" appearance="link" scheme="secondary" icon="keyboard_arrow_up"
                    data-action="row-up" ?disabled=${index === 0 || index >= rows.length}
                    title=${word(node, 'rowUp')} aria-label=${word(node, 'rowUp')}
                    @click=${() => {
                        const next = rows.slice();
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        reshape(next);
                    }}></sf-button-icon>
            <sf-button-icon size="1/2" appearance="link" scheme="secondary" icon="keyboard_arrow_down"
                    data-action="row-down" ?disabled=${index >= rows.length - 1}
                    title=${word(node, 'rowDown')} aria-label=${word(node, 'rowDown')}
                    @click=${() => {
                        const next = rows.slice();
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        reshape(next);
                    }}></sf-button-icon>
            <sf-button-icon size="1/2" appearance="link" scheme="secondary" icon="delete"
                    data-action="row-remove" ?disabled=${drawn.length <= minRows || index >= rows.length}
                    title=${word(node, 'removeRow')} aria-label=${word(node, 'removeRow')}
                    @click=${() => reshape(rows.filter((_row, at) => at !== index))}></sf-button-icon>
        </span>
    `;

    return html`
        <span class="sf-view-items-box">
        <span class="sf-view-items ${editing ? 'sf-view-items--edit' : ''}" data-items=${key} role="table"
              aria-label=${field.label || key} style=${`--sf-view-items-columns: ${template}`}>
            <span class="sf-view-items-head" role="row">
                ${columns.map((column) => html`<span class="sf-view-items-heading ${NUMERIC.has(column.propertyType) ? 'sf-view-items-numeric' : ''}" role="columnheader">${column.label || column.key}${editing && column.required && !column.compute ? html`<span class="color-error" aria-hidden="true"> *</span>` : nothing}</span>`)}
                ${editing ? html`<span class="sf-view-items-heading" role="columnheader"></span>` : nothing}
            </span>
            ${drawn.map((row, index) => html`
                <span class="sf-view-items-row" role="row" data-row=${index} aria-label=${word(node, 'row', {n: index + 1})}>
                    ${columns.map((column) => html`
                        <span class="sf-view-items-cell ${NUMERIC.has(column.propertyType) ? 'sf-view-items-numeric' : ''}" role="cell" data-column=${column.key}>
                            <span class="sf-view-items-cell-label color-on-surface-variant" aria-hidden="true">${column.label || column.key}</span>
                            ${cell(row, index, column)}
                        </span>`)}
                    ${editing ? rowActions(index) : nothing}
                </span>`)}
            ${hasTotals && rows.length
                ? html`
                    <span class="sf-view-items-row sf-view-items-totals" role="row" data-totals="true">
                        ${columns.map((column, at) => html`
                            <span class="sf-view-items-cell ${NUMERIC.has(column.propertyType) ? 'sf-view-items-numeric' : ''} ${Object.hasOwn(totals, column.key) ? '' : 'sf-view-items-cell--blank'}" role="cell" data-column=${column.key}>
                                ${Object.hasOwn(totals, column.key)
                                    ? html`<span class="sf-view-items-cell-label color-on-surface-variant" aria-hidden="true">${word(node, 'total')}: ${column.label || column.key}</span><span class="sf-view-items-text sf-view-items-total">${totalText(column, totals[column.key], columns, locale)}</span>`
                                    : at === 0 ? html`<span class="sf-view-items-text sf-view-items-total-word">${word(node, 'total')}</span>` : nothing}
                            </span>`)}
                        ${editing ? html`<span role="cell"></span>` : nothing}
                    </span>`
                : nothing}
            ${editing
                ? html`
                    <span class="sf-view-items-foot flex items-cross-center gap-1">
                        <sf-button appearance="outline" size=${ctx.size} icon="add" text=${word(node, 'addRow')}
                                data-action="row-add" ?disabled=${drawn.length >= maxRows}
                                @click=${() => reshape([...drawn, {}])}></sf-button>
                    </span>`
                : nothing}
        </span>
        </span>
    `;
}

const CELL_ERRORS = new WeakMap();
function cellErrorsOf(node, key) {
    if (!CELL_ERRORS.has(node)) CELL_ERRORS.set(node, new Map());
    const all = CELL_ERRORS.get(node);
    if (!all.has(key)) all.set(key, new Map());
    return all.get(key);
}

function renderItemsEdit(field, value, host, ctx) {
    return renderItemsTable(field, rowsOf(value), columnsOf(field), ctx, {editing: true, host});
}

function renderItemsView(field, value, ctx) {
    const rows = rowsOf(value);
    if (!rows.length) return nothing;
    if (ctx.summary) return html`<span class="sf-field-view">${itemsSummary(field, rows, columnsOf(field), ctx)}</span>`;
    return renderItemsTable(field, rows, columnsOf(field), ctx, {editing: false, host: null});
}

// --- compound: a fixed set of parts, one value --------------------------------------

// The parts of a requisites field, in the standard's order, of those the field
// names (`parts`; all six when it names none). Each is typed as digits, the КПП
// as digits and capital letters.
const REQUISITE_LENGTH = {inn: 12, kpp: 9, ogrn: 15, bik: 9, account: 20, corr_account: 20};

function requisiteParts(field) {
    const named = Array.isArray(field.parts) ? field.parts.map(String) : REQUISITE_PARTS;
    return REQUISITE_PARTS.filter((part) => named.includes(part));
}

function compoundParts(field) {
    return (Array.isArray(field.parts) ? field.parts : [])
        .map((part) => (part && typeof part === 'object' ? {...part, propertyType: part.propertyType || part.type} : null))
        .filter((part) => part?.key);
}

function objectOf(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// The value written: the parts in their order, an empty part no key, and
// nothing at all when every part is empty.
function compoundValue(order, value) {
    const next = {};
    for (const part of order) {
        const one = value[part];
        if (one !== null && typeof one !== 'undefined' && one !== '') next[part] = one;
    }
    return Object.keys(next).length ? next : null;
}

function renderRequisitesEdit(field, value, host, ctx) {
    const node = ctx.node;
    const key = String(field.key ?? '');
    const parts = requisiteParts(field);
    const held = objectOf(value);
    const errors = requisiteErrors(held, parts);
    const write = (part, text) => {
        const cleaned = part === 'kpp' ? text.replace(/\s/gu, '').toUpperCase() : text.replace(/\D/gu, '');
        const next = compoundValue(parts, {...held, [part]: cleaned});
        const mistakes = requisiteErrors(next ?? {}, parts);
        // Nothing typed in a field that is not required is no mistake.
        const blank = next === null && field.required !== true;
        host.setFieldValue(field, next);
        host.setFieldError?.(field, !blank && Object.keys(mistakes).length ? word(node, mistakes[Object.keys(mistakes)[0]]) : null);
    };
    return html`
        <span class="sf-view-fields-compound grid gap-1 w-full min-w-0" data-compound=${key}>
            ${parts.map((part) => {
                const path = `${key}.${part}`;
                const left = leftOf(node).has(path);
                const blank = Object.keys(held).length === 0 && field.required !== true;
                const message = left && !blank && errors[part] ? word(node, errors[part]) : '';
                return html`
                    <span class="sf-view-fields-part flex flex-col gap-1/4 min-w-0 ${part === 'account' || part === 'corr_account' ? 'sf-view-fields-part--wide' : ''}" data-part=${part}>
                        <span class="sf-view-fields-part-label color-on-surface-variant">${word(node, part)}${part === 'inn' && field.required ? html`<span class="color-error" aria-hidden="true"> *</span>` : nothing}</span>
                        <sf-input
                                size=${ctx.size}
                                appearance="bordered"
                                inputmode=${part === 'kpp' ? 'text' : 'numeric'}
                                maxlength=${String(REQUISITE_LENGTH[part])}
                                value=${String(held[part] ?? '')}
                                ?required=${part === 'inn' && field.required === true}
                                ?invalid=${Boolean(message)}
                                error-message=${message || nothing}
                                aria-label=${`${field.label || key}: ${word(node, part)}`}
                                @input=${(event) => write(part, String(event.target?.value ?? ''))}
                                @change=${(event) => write(part, String(event.target?.value ?? ''))}
                                @focusout=${() => { leftOf(node).add(path); redraw(node); }}
                        ></sf-input>
                    </span>`;
            })}
        </span>
    `;
}

function requisitesText(field, value, node) {
    const held = objectOf(value);
    return requisiteParts(field).filter((part) => held[part]).map((part) => `${word(node, part)} ${held[part]}`).join(', ');
}

function renderRequisitesView(field, value, ctx) {
    const text = requisitesText(field, value, ctx.node);
    return text ? html`<span class="sf-field-view">${text}</span>` : nothing;
}

function renderCompoundEdit(field, value, host, ctx) {
    const node = ctx.node;
    const key = String(field.key ?? '');
    const parts = compoundParts(field);
    const order = parts.map((part) => part.key);
    const held = objectOf(value);
    const errors = cellErrorsOf(node, key);
    return html`
        <span class="sf-view-fields-compound grid gap-1 w-full min-w-0" data-compound=${key}>
            ${parts.map((part) => {
                const path = `${key}.${part.key}`;
                const partField = {...part, key: path, label: part.label || part.key, readonly: field.readonly === true || part.readonly === true};
                const partHost = {
                    setFieldValue: (_target, next) => host.setFieldValue(field, compoundValue(order, {...held, [part.key]: next})),
                    setFieldError: (_target, message) => {
                        errors.set(path, message || null);
                        const first = [...errors.values()].find(Boolean);
                        host.setFieldError?.(field, first ?? null);
                    },
                };
                const partCtx = {...ctx, path};
                const control = SET_CONTROLS[part.propertyType]?.edit(partField, held[part.key], partHost, partCtx)
                    ?? renderEditField(partField, held[part.key], partHost, {size: ctx.size});
                return html`
                    <span class="sf-view-fields-part flex flex-col gap-1/4 min-w-0 ${part.width === 'full' ? 'sf-view-fields-part--wide' : ''}" data-part=${part.key}>
                        <span class="sf-view-fields-part-label color-on-surface-variant">${partField.label}${part.required ? html`<span class="color-error" aria-hidden="true"> *</span>` : nothing}</span>
                        ${control ?? nothing}
                    </span>`;
            })}
        </span>
    `;
}

function renderCompoundView(field, value, ctx) {
    const held = objectOf(value);
    const shown = compoundParts(field).filter((part) => held[part.key] !== null && typeof held[part.key] !== 'undefined' && held[part.key] !== '');
    if (!shown.length) return nothing;
    return html`<span class="sf-field-view sf-view-fields-compound-view">${shown.map((part, at) => {
        const own = SET_CONTROLS[part.propertyType]?.view({...part}, held[part.key], ctx);
        const content = own ?? renderViewField({...part}, held[part.key], ctx.viewHost, {size: ctx.size}) ?? String(held[part.key]);
        return html`${at ? ', ' : ''}<span class="color-on-surface-variant">${part.label || part.key}</span> ${content}`;
    })}</span>`;
}

// --- the map ---------------------------------------------------------------------

const SET_CONTROLS = {
    money: {edit: renderMoneyEdit, view: renderMoneyView},
    percent: {edit: renderPercentEdit, view: renderPercentView},
    items: {edit: renderItemsEdit, view: renderItemsView},
    compound: {edit: renderCompoundEdit, view: renderCompoundView},
    'ru.requisites': {edit: renderRequisitesEdit, view: renderRequisitesView},
};

/** Whether the set draws this property type itself. */
export function drawsSetField(field) {
    return Object.hasOwn(SET_CONTROLS, String(field?.propertyType || field?.type || ''));
}

/**
 * A field of a type the set draws, edited or shown. `ctx` is {node, size,
 * viewHost, disabled}: the element whose page language the words follow, the
 * size on the ladder, the host's formatFieldValue, and whether a condition
 * turns the field off. A field the person may not change is shown, as the
 * Framework renderers show one.
 */
export function renderSetField(field, value, editing, host, ctx) {
    const control = SET_CONTROLS[String(field.propertyType || field.type)];
    if (!control) return null;
    const formatted = !editing ? ctx.viewHost?.formatFieldValue?.(field, value) : null;
    if (typeof formatted === 'string' && formatted !== '') return html`<span class="sf-field-view">${formatted}</span>`;
    if (editing && field.readonly !== true && ctx.disabled !== true && host?.setFieldValue) {
        return control.edit(field, value, host, ctx);
    }
    return control.view(field, value, ctx);
}

/** A field's value as one line of text: «1 500,50 ₽», «2 строки, итого 2 499,99 ₽». */
export function setFieldText(field, value, node) {
    const locale = pageLocale(node);
    switch (String(field?.propertyType || field?.type || '')) {
        case 'money': return moneyText(field, value, locale);
        case 'percent': return percentText(value, locale);
        case 'items': {
            const rows = rowsOf(value);
            return rows.length ? itemsSummary(field, rows, columnsOf(field), {node}) : '';
        }
        case 'ru.requisites': return requisitesText(field, value, node);
        default: return null;
    }
}
