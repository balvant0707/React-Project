// What a visitor without a session gets: the sign-in pages only. Once there is a session the code gate is opened
// (gateClient.openGate) and `onReady` loads the app, whose JavaScript is served only with the gate cookie.
// Everything this file imports statically is public; keep business code (modules, admin pages) out of its import graph.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Refine } from "@refinedev/core";
import { useNotificationProvider } from "@refinedev/antd";
import routerProvider, { CatchAllNavigate } from "@refinedev/react-router";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App as AntdApp, Button, Result, Spin, type ThemeConfig } from "antd";
import { ColorModeProvider } from "@rbp/ui";
import i18n, { ANTD_LOCALES, currentLanguage } from "../i18n";
import { supabaseClient } from "../supabase";
import { authProvider } from "../refine/authProvider";
import { Login } from "../login/Login";
import { ForgotPassword } from "../login/ForgotPassword";
import { UpdatePassword } from "../login/UpdatePassword";
import { Activate } from "../login/Activate";
import { MfaPage } from "../mfa/MfaPage";
import { ShellProvider, type ShellConfig } from "../shell/ShellContext";
import { openGate } from "./gateClient";

const i18nProvider = {
  translate: (key: string, options?: any, defaultMessage?: string) =>
    i18n.t(key, { defaultValue: typeof options === "string" ? options : defaultMessage, ...(typeof options === "object" ? options : {}) }) as string,
  changeLocale: (lang: string) => i18n.changeLanguage(lang),
  getLocale: () => i18n.language,
};

// "ready": the gate is open and the app is being loaded; the sign-in pages are gone by then, so their router cannot move the address
// again (a fast answer from the gate let it push /login after the app had been told to start on /).
type Phase = "checking" | "login" | "mfa" | "error" | "ready";

// The sign-in pages are part of the app too. Signing in here opens the gate before the router has left them, so the app would start
// on /login (or /activate) and show the form again: move to the page that was asked for (`to`, same site only) or the start page.
const SIGN_IN_PATHS = ["/login", "/activate", "/forgot-password", "/mfa"];
const leaveSignIn = () => {
  const { pathname, search } = window.location;
  if (!SIGN_IN_PATHS.includes(pathname)) return;
  const to = new URLSearchParams(search).get("to");
  window.history.replaceState(null, "", to && /^\/(?!\/)/.test(to) ? to : "/");
};

export type GateEntryProps = {
  appName: string;
  themes: { light: ThemeConfig; dark: ThemeConfig };
  brand: ReactNode;
  onReady: () => void;
  // Pages that work without a sign-in (COMPASS's QR report form): shown to a visitor without a session, next to the sign-in
  // pages. Their code is part of the public entry, so import only what such a page needs (nothing of the modules).
  publicRoutes?: { path: string; element: ReactNode }[];
};

export const GateEntry = ({ appName, themes, brand, onReady, publicRoutes = [] }: GateEntryProps) => {
  const [phase, setPhase] = useState<Phase>("checking");
  const opening = useRef(false);
  // Set once the gate is open: from then on a missing session no longer brings the sign-in pages back (the app is being loaded).
  const opened = useRef(false);

  const open = useCallback(async (token: string) => {
    if (opening.current) return;
    opening.current = true;
    const result = await openGate(token);
    if (result === "ok") {
      opened.current = true;
      return setPhase("ready");
    }
    opening.current = false;
    // A refused session shows the sign-in page again, a password-only one the authenticator page; a fault on the server offers a retry.
    setPhase(result === "denied" ? "login" : result === "mfa" ? "mfa" : "error");
  }, []);

  useEffect(() => {
    let alive = true;
    void supabaseClient.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) void open(data.session.access_token);
      else setPhase("login");
    });
    const { data: sub } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (session && event !== "INITIAL_SESSION" && event !== "TOKEN_REFRESHED") void open(session.access_token);
      if (!session && !opened.current) setPhase("login");
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [open]);

  // The sign-in pages have been taken down (phase "ready"): now leave their address and hand over to the app, once.
  const handedOver = useRef(false);
  useEffect(() => {
    if (phase !== "ready" || handedOver.current) return;
    handedOver.current = true;
    leaveSignIn();
    onReady();
  }, [phase, onReady]);

  const shell: ShellConfig = {
    appName, brand, banner: { gradient: "none" }, title: { expanded: null, collapsed: null },
    headerItems: [], phoneTabs: [], profileSections: [], configurationCards: [], recordSlots: [], contentAsides: [],
  };

  return (
    <BrowserRouter>
      <ColorModeProvider themes={themes} locale={ANTD_LOCALES[currentLanguage()]}>
        <AntdApp>
          <ShellProvider value={shell}>
            <Refine
              authProvider={authProvider}
              routerProvider={routerProvider}
              notificationProvider={useNotificationProvider}
              i18nProvider={i18nProvider}
              options={{ title: { text: appName }, disableTelemetry: true }}
            >
              {(phase === "checking" || phase === "ready") && <div style={{ display: "flex", justifyContent: "center", padding: 64 }}><Spin size="large" /></div>}
              {phase === "error" && (
                <Result
                  status="warning"
                  title={i18n.t("gate.unavailable", { defaultValue: "The app could not be opened right now." })}
                  extra={<Button type="primary" onClick={() => window.location.reload()}>{i18n.t("gate.retry", { defaultValue: "Try again" })}</Button>}
                />
              )}
              {phase === "mfa" && (
                <Routes>
                  {/* A public page stays public for a password-only session too (a sticker scanned by someone half signed in). */}
                  {publicRoutes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
                  <Route path="/mfa" element={<MfaPage onDone={() => void supabaseClient.auth.getSession().then(({ data }) => data.session && void open(data.session.access_token))} />} />
                  <Route path="*" element={<CatchAllNavigate to="/mfa" />} />
                </Routes>
              )}
              {phase === "login" && (
                <Routes>
                  {publicRoutes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
                  <Route path="/login" element={<Login brand={brand} />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/update-password" element={<UpdatePassword />} />
                  <Route path="/activate" element={<Activate />} />
                  <Route path="*" element={<CatchAllNavigate to="/login" />} />
                </Routes>
              )}
            </Refine>
          </ShellProvider>
        </AntdApp>
      </ColorModeProvider>
    </BrowserRouter>
  );
};
