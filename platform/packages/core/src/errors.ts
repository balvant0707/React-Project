// From COMPASS lib/errors.ts, merged with the NPM tool's utils/errorText.ts (docs/shared-parts.md): from NPM come the
// readable 42501 pass-through, the two foreign key texts and `byCode` (NPM's errorText(error, fallback, byCode) still works).
import i18n from "./i18n";

type ErrorLike = { message?: string; code?: string };
type Options = { known?: Record<string, string>; fallback?: string; byCode?: Record<string, string> };

// Postgres error codes (PostgREST passes them through) whose raw text means nothing to a user.
const CODES: Record<string, string> = {
  "23505": "errors.duplicate",
  "23P01": "errors.overlap",
  "23514": "errors.invalid",
  "23502": "errors.invalid",
  "22P02": "errors.invalid",
  PGRST116: "errors.notFound",
};

// Text for an error shown to the user (message.error, form errors). In this order:
//   known     exact messages raised by our own functions, mapped to i18n keys by the caller
//   byCode    the caller's text for a Postgres error code
//   code      a Postgres error code from the list above; 23503 (foreign key): still in use, or refers to something gone
//   forbidden a row-level-security refusal, a raw "permission denied", our plain 'No permission' or a bare 42501 code
//   network   the request did not reach the server
//   message   anything else raised by our functions (written to be read, English) or the JS error's text
//   fallback  the caller's text, else "Something went wrong"
export function errorText(error: unknown, options: Options | string = {}, byCode?: Record<string, string>): string {
  const opts: Options = typeof options === "string" ? { fallback: options, byCode } : { ...options, byCode: options.byCode ?? byCode };
  const { message, code } = (typeof error === "string" ? { message: error } : ((error ?? {}) as ErrorLike));
  if (message && opts.known?.[message]) return i18n.t(opts.known[message]);
  if (code && opts.byCode?.[code]) return opts.byCode[code];
  if (code && CODES[code]) return i18n.t(CODES[code]);
  if (code === "23503") return i18n.t(/^update or delete on/i.test(message ?? "") ? "errors.inUse" : "errors.gone");
  // Our own 42501 passes through when it is a sentence; a bare code or 'No permission' is the translated refusal.
  if (message && (/row-level security|permission denied/i.test(message) || (code === "42501" && (message === "No permission" || /^[a-z0-9_]+$/.test(message))))) return i18n.t("errors.forbidden");
  if (message && /failed to fetch|networkerror|load failed/i.test(message)) return i18n.t("errors.network");
  return message || opts.fallback || i18n.t("common.error");
}
