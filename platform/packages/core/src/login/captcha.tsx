// Cloudflare Turnstile for password sign-in. Off unless the build sets VITE_TURNSTILE_SITE_KEY; then Supabase Auth must have
// the captcha switched on with the matching secret (docs/deploy.md), because with it on every signInWithPassword needs a
// token and without the secret nothing checks it. The widget is invisible to most people (managed mode).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || "";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
const loadTurnstile = (): Promise<TurnstileApi> => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("captcha unavailable")));
    script.onerror = () => {
      loading = null;
      reject(new Error("captcha unavailable"));
    };
    document.head.appendChild(script);
  });
  return loading;
};

export const captchaEnabled = SITE_KEY !== "";

export type Captcha = {
  enabled: boolean;
  // The token to send with the sign-in, null until the check has passed (or after it expired).
  token: string | null;
  // The check could not be loaded or ran into an error: the form cannot be submitted.
  failed: boolean;
  // A token works once: call this after every attempt.
  reset: () => void;
  widget: ReactElement | null;
};

export const useCaptcha = (): Captcha => {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const hostRef = useCallback((el: HTMLDivElement | null) => setHost(el), []);

  useEffect(() => {
    if (!captchaEnabled || !host) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetId.current = api.render(host, {
          sitekey: SITE_KEY,
          theme: "auto",
          callback: (value: string) => {
            setToken(value);
            setFailed(false);
          },
          "expired-callback": () => setToken(null),
          "error-callback": () => {
            setToken(null);
            setFailed(true);
          },
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [host]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, []);

  return {
    enabled: captchaEnabled,
    token,
    failed,
    reset,
    widget: captchaEnabled ? <div ref={hostRef} style={{ display: "flex", justifyContent: "center", minHeight: 0, marginBottom: 12 }} /> : null,
  };
};
