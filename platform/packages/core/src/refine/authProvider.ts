// Copied from COMPASS app/src/authProvider.ts. Changes: imports, storage key, push sign-out call deferred to the push module.
import type { AuthProvider } from "@refinedev/core";
import i18n from "../i18n";
import { signInAddress } from "../login/loginEmail";
import { supabaseClient } from "../supabase";
import { setUserTimeZone } from "@rbp/ui";
import { resetAccessCache } from "./accessControlProvider";
import { disablePushOnSignOut } from "../push/push";

type CachedIdentity = { id: string; name?: string | null; email?: string | null; photo_url: string | null; language: string | null };
export const IDENTITY_KEY = "rbp.identity";
const readCachedIdentity = (): CachedIdentity | null => {
  try {
    return JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? "null") as CachedIdentity | null;
  } catch {
    return null;
  }
};
const writeCachedIdentity = (identity: CachedIdentity) => {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    /* storage may be blocked */
  }
};

export const authProvider: AuthProvider = {
  login: async ({ username, password, providerName, captchaToken }) => {
    resetAccessCache();
    // Microsoft Entra SSO: matches existing accounts by e-mail (enable_signup = false).
    if (providerName) {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: providerName as "azure",
        options: { redirectTo: window.location.origin, scopes: "email" },
      });
      if (error) {
        return { success: false, error: { message: error.message, name: "LoginError" } };
      }
      return { success: true };
    }

    // A password account signs in with its contact e-mail address, or without one with the username
    // (~/maintenance_tool/docs/username-login.md); the "@" tells which.
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: signInAddress(username ?? ""),
      password,
      // Turnstile (login/captcha.tsx): only present when the build has a site key.
      options: captchaToken ? { captchaToken } : undefined,
    });

    if (error) {
      // GoTrue: a locked account is user_banned; unknown user and wrong password are both invalid_credentials.
      const code = (error as { code?: string }).code;
      // The sign-in throttle (hook_password_verification_attempt) refuses a waiting account with the text of a wrong password
      // but another error code: it reads the same here, nothing tells that an account is waiting.
      const wrongPassword = code === "invalid_credentials" || error.message === "Invalid login credentials";
      const message = code === "user_banned" ? i18n.t("pages.login.lockedHint") : wrongPassword ? i18n.t("pages.login.invalidCredentials") : error.message;
      return {
        success: false,
        error: { message, name: code === "user_banned" ? i18n.t("pages.login.locked") : i18n.t("pages.login.failed") },
      };
    }

    if (data?.session) {
      return { success: true, redirectTo: "/" };
    }

    return {
      success: false,
      error: { message: "Login failed", name: "LoginError" },
    };
  },

  // login-help mails the link if there is a contact address; the answer is the same either way.
  forgotPassword: async ({ username }) => {
    const { error } = await supabaseClient.functions.invoke("login-help", { body: { action: "forgot", login: username } });
    if (error) {
      return { success: false, error };
    }
    return { success: true };
  },

  updatePassword: async ({ password }) => {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) {
      return { success: false, error };
    }
    return { success: true, redirectTo: "/login" };
  },

  logout: async () => {
    try {
      localStorage.removeItem(IDENTITY_KEY);
      setUserTimeZone(null);
      resetAccessCache();
    } catch {
      /* ignore */
    }
    // Signing out ends push on this device (a shared tablet must not show the last person's messages).
    await disablePushOnSignOut();
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      return { success: false, error };
    }
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    const { data } = await supabaseClient.auth.getSession();
    if (data?.session) {
      return { authenticated: true };
    }
    // Offline with an expired token that cannot be refreshed: keep the user in, they read cached data.
    if (!navigator.onLine && readCachedIdentity()) {
      return { authenticated: true };
    }
    return {
      authenticated: false,
      redirectTo: "/login",
      logout: true,
    };
  },

  onError: async (error) => {
    // Refine's Supabase provider sets `code` / `statusCode`, never `status`.
    const code = (error as { code?: string })?.code;
    const statusCode = (error as { statusCode?: number })?.statusCode;
    // The database refuses sessions without the second factor: finish the TOTP step instead of signing out.
    if ((error as { message?: string })?.message === "mfa_required") {
      return { redirectTo: "/mfa", error };
    }
    // The account was locked while signed in: out, with a notice.
    if ((error as { message?: string })?.message === "account_locked") {
      return { logout: true, redirectTo: "/login?locked=1", error };
    }
    if (statusCode === 401 || statusCode === 403 || code === "PGRST301" || code === "42501") {
      return { logout: true, redirectTo: "/login", error };
    }
    return {};
  },

  getIdentity: async () => {
    try {
      // getSession reads the stored session (no network); getUser would fail offline.
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return readCachedIdentity();
      const { data: profile, error } = await supabaseClient
        .from("users")
        .select("name, email, photo_url, language, time_zone")
        .eq("id", user.id)
        .single();
      // The contact address from users; the session's address is internal (~/maintenance_tool/docs/username-login.md).
      if (error && !profile) return readCachedIdentity() ?? { id: user.id, name: null, email: null, photo_url: null, language: null };
      const identity = {
        id: user.id,
        name: profile?.name ?? null,
        email: profile?.email ?? null,
        photo_url: profile?.photo_url ?? null,
        language: profile?.language ?? null,
      };
      // Every timestamp is shown in the zone of the profile (null = the device's zone).
      setUserTimeZone(profile?.time_zone ?? null);
      writeCachedIdentity(identity);
      return identity;
    } catch {
      return readCachedIdentity();
    }
  },
};
