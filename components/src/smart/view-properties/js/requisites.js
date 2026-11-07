// The checks of Russian requisites (Larena property types standard, notes of
// 2026-11-03, `ru.requisites@1`): each part on its own, and the parts that go
// together, together. The server checks the same and is the authority; these
// are here so a person sees a mistyped ИНН under the field instead of a refused
// save after it.
//
// Every check answers the key of the words that explain the mistake, or null.

export const REQUISITE_PARTS = Object.freeze(['inn', 'kpp', 'ogrn', 'bik', 'account', 'corr_account']);

const digitsOf = (text) => [...text].map(Number);
const weighted = (digits, weights) => weights.reduce((sum, weight, index) => sum + weight * digits[index], 0);

export function innValid(inn) {
    if (!/^\d{10}$|^\d{12}$/u.test(inn)) return false;
    const d = digitsOf(inn);
    if (inn.length === 10) return (weighted(d, [2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10 === d[9];
    const eleventh = (weighted(d, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10;
    const twelfth = (weighted(d, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10;
    return eleventh === d[10] && twelfth === d[11];
}

export function ogrnValid(ogrn) {
    if (!/^\d{13}$|^\d{15}$/u.test(ogrn)) return false;
    const body = BigInt(ogrn.slice(0, -1));
    const modulus = ogrn.length === 13 ? 11n : 13n;
    return Number((body % modulus) % 10n) === Number(ogrn.at(-1));
}

// An account is checked with the БИК by the Bank of Russia key: the three
// digits that come before it, then its twenty, weighted 7, 1, 3 in turn, add up
// to a multiple of ten. A settlement account takes the БИК's last three digits;
// a correspondent account takes «0» and the БИК's fifth and sixth.
function accountKeyValid(prefix, account) {
    const digits = digitsOf(prefix + account);
    const sum = digits.reduce((total, digit, index) => total + digit * [7, 1, 3][index % 3], 0);
    return sum % 10 === 0;
}

/** The mistakes of a requisites value, part by part: {inn: 'innWrong', …}. */
export function requisiteErrors(value, parts = REQUISITE_PARTS) {
    const errors = {};
    const has = (part) => parts.includes(part);
    const of = (part) => String(value?.[part] ?? '');
    const inn = of('inn');
    const kpp = of('kpp');
    const ogrn = of('ogrn');
    const bik = of('bik');
    const account = of('account');
    const corr = of('corr_account');

    if (has('inn')) {
        // The ИНН is required (the standard): a value without one is no value.
        if (!inn) errors.inn = 'innRequired';
        else if (!/^\d{10}$|^\d{12}$/u.test(inn)) errors.inn = 'innLength';
        else if (!innValid(inn)) errors.inn = 'innWrong';
    }
    const person = inn.length === 12;
    const organization = inn.length === 10;
    if (has('kpp') && kpp) {
        if (!/^\d{4}[\dA-Z]{2}\d{3}$/u.test(kpp)) errors.kpp = 'kppWrong';
        else if (person) errors.kpp = 'kppPerson';
    }
    if (has('ogrn') && ogrn) {
        if (!/^\d{13}$|^\d{15}$/u.test(ogrn)) errors.ogrn = 'ogrnLength';
        else if (!ogrnValid(ogrn)) errors.ogrn = 'ogrnWrong';
        else if (organization && ogrn.length !== 13) errors.ogrn = 'ogrnOrganization';
        else if (person && ogrn.length !== 15) errors.ogrn = 'ogrnPerson';
    }
    const bikRight = /^04\d{7}$/u.test(bik);
    if (has('bik') && bik && !bikRight) errors.bik = 'bikWrong';
    if (has('account') && account) {
        if (!/^\d{20}$/u.test(account)) errors.account = 'accountLength';
        else if (bikRight && !accountKeyValid(bik.slice(-3), account)) errors.account = 'accountKey';
    }
    if (has('corr_account') && corr) {
        if (!/^\d{20}$/u.test(corr)) errors.corr_account = 'accountLength';
        else if (!corr.startsWith('301')) errors.corr_account = 'corrStart';
        else if (bikRight && !accountKeyValid(`0${bik.slice(4, 6)}`, corr)) errors.corr_account = 'accountKey';
    }
    return errors;
}
