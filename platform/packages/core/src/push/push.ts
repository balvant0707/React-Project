import { supabaseClient } from "../supabase";

// Web Push on this device (~/maintenance_tool/docs/notifications.md "Push"): the service worker (core sw/sw.js, production build only)
// receives, push_subscribe stores the subscription, send-push holds the VAPID key pair.

export type PushState =
  | "unsupported" // no Push API (old browser, private window, not a secure origin)
  | "dev_server" // the Vite dev server has no service worker: push only in the built app (npm run preview, port 5176)
  | "no_worker" // the built app's service worker did not start (site data blocked, install failed)
  | "ios_install" // iPhone / iPad: push only in the app added to the home screen (iOS 16.4+)
  | "not_configured" // the server has no VAPID keys
  | "denied" // the person blocked notifications for this app in the browser
  | "off"
  | "on";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;

// PushManager.subscribe() wants the key as bytes, it travels as base64url.
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

let publicKey: Promise<string | null> | null = null;
const fetchPublicKey = () =>
  (publicKey ??= supabaseClient.functions
    .invoke("send-push", { body: { action: "config" } })
    .then(({ data }) => ((data as { publicKey?: string | null } | null)?.publicKey ?? null))
    .catch(() => {
      publicKey = null;
      return null;
    }));

// The worker registers after load (RefineRoot), so wait a few seconds for it on a first visit; dev has none.
const registration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!supported()) return null;
  const now = await navigator.serviceWorker.getRegistration();
  if (now || import.meta.env.DEV) return now ?? null;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))]);
};

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return "ios_install";
  if (!supported()) return "unsupported";
  if (!(await registration())) return import.meta.env.DEV ? "dev_server" : "no_worker";
  if (!(await fetchPublicKey())) return "not_configured";
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "on" : "off";
}

// Asks for the permission (must run from a click) and registers this device for the signed-in person.
// Thrown when the browser's push service does not answer (network or company policy blocks it).
export class PushServiceTimeout extends Error {}
const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new PushServiceTimeout("push service timeout")), ms))]);

// onStep tells the card what it waits for: the person's answer to the browser's question, then the push service.
export async function enablePush(onStep?: (step: "permission" | "subscribe") => void): Promise<PushState> {
  const reg = await registration();
  const key = await fetchPublicKey();
  if (!reg || !key) return "unsupported";
  onStep?.("permission");
  if ((await Notification.requestPermission()) !== "granted") return Notification.permission === "denied" ? "denied" : "off";
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another key (keys were changed on the server) cannot receive anything: renew it.
  const current = sub?.options.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== key) {
    await sub.unsubscribe();
    sub = null;
  }
  onStep?.("subscribe");
  sub ??= await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }), 20000);
  const json = sub.toJSON();
  const { error } = await supabaseClient.rpc("push_subscribe", {
    p_endpoint: json.endpoint!,
    p_p256dh: json.keys!.p256dh,
    p_auth_key: json.keys!.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
  return "on";
}

// Switches this device off: removes the row (while still signed in) and the browser's subscription.
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabaseClient.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

// Signing out ends push on this device (shared tablets).
export async function disablePushOnSignOut(): Promise<void> {
  try {
    await disablePush();
  } catch {
    /* signing out must not fail because of push */
  }
}

// After a sign-in: drop a subscription this browser still holds for somebody else.
export async function dropForeignSubscription(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    const { data, error } = await supabaseClient.from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).maybeSingle();
    if (!error && !data) await sub.unsubscribe();
  } catch {
    /* offline or no service worker: try again next time */
  }
}
