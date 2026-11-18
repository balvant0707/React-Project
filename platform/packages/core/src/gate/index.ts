// The public entry of an app that runs behind the code gate: sign-in pages and the gate calls, nothing else.
export { startApp } from "./startApp";
export type { StartAppOptions } from "./startApp";
export { GateEntry } from "./GateEntry";
export type { GateEntryProps } from "./GateEntry";
export { openGate, startGateRenewal } from "./gateClient";
export { setAppLanguages, addLocale, LANGUAGES, currentLanguage, ANTD_LOCALES } from "../i18n";
export { SUPABASE_URL } from "../supabase";
