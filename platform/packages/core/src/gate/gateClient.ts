// The browser side of the code gate (functions/_middleware.ts). The gate is a cookie that the Pages Function sets after it
// has checked the Supabase session; without it the app's JavaScript under /static/ is not served (see docs/code-gate.md).
import { supabaseClient } from "../supabase";

// "mfa": the session is valid but the second factor is not done yet (the entry shows the authenticator page).
export type GateResult = "ok" | "denied" | "mfa" | "unavailable";

const call = (method: "POST" | "DELETE", token?: string) =>
  fetch("/api/gate", { method, credentials: "same-origin", headers: token ? { authorization: `Bearer ${token}` } : undefined });

// Asks for the cookie. "ok" also covers a gate that is not there (404: no Function on this deployment, e.g. a local server; 405:
// the Function is deployed but the gate is switched off, so the request reaches the static files, which refuse a POST) and
// no network (the app then starts from the service worker's cache). Only a refused session or a server fault stops the start.
export const openGate = async (accessToken: string): Promise<GateResult> => {
  try {
    const res = await call("POST", accessToken);
    if (res.ok || res.status === 404 || res.status === 405) return "ok";
    if (res.status === 403) return "mfa";
    if (res.status === 401) return "denied";
    return "unavailable";
  } catch {
    return "ok";
  }
};

// Once the app runs: renew the cookie whenever the session is renewed or a person signs in again without reloading (the
// chunks of pages not opened yet are still to come), drop it at sign-out.
export const startGateRenewal = () => {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session) void openGate(session.access_token);
    if (event === "SIGNED_OUT") void call("DELETE").catch(() => undefined);
  });
  // The service worker fetches the gated files it has not cached yet, so the app also starts without network next time.
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: "warm-gated" })).catch(() => undefined);
  }
};
