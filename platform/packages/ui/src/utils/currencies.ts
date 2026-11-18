// From the NPM tool (app/src/utils/currencies.ts), until 2026-11-13 ported into npm-base; now one copy in the platform.
// Currencies offered in every currency dropdown (ISO 4217 code as value and label).
const CURRENCY_CODES = ["EUR", "USD", "GBP", "JPY", "CNY", "KRW", "SGD", "AED", "CHF", "NOK", "SEK", "DKK", "PLN", "TRY"];

export const CURRENCY_OPTIONS = CURRENCY_CODES.map((code) => ({ value: code, label: code }));
