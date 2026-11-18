// How an app starts, the same for COMPASS and RADAR (their main.tsx only name what differs). Without VITE_GATE the app starts at
// once. With VITE_GATE=1 (docs/code-gate.md) the app's JavaScript is served only to a visitor with a session, so a visitor without
// one gets the sign-in pages (GateEntry) and the app is loaded after the gate is opened.
// Everything this file imports statically is public: `loadApp` and `prepare` must load the app with `import()`.
import { StrictMode, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Button, Result, type ThemeConfig } from "antd";
import { ColorModeProvider } from "@rbp/ui";
import i18n, { ANTD_LOCALES, currentLanguage } from "../i18n";
import { GateEntry } from "./GateEntry";
import { startGateRenewal } from "./gateClient";
import { runStart } from "./startSequence";

export type StartAppOptions = {
  appName: string;
  themes: { light: ThemeConfig; dark: ThemeConfig };
  brand: ReactNode;
  /** `() => import('./app')`: the module code and the shell, a module with a default export (the root component). */
  loadApp: () => Promise<{ default: ComponentType }>;
  /** Work before the first render of the app (COMPASS: restore the device cache). Runs after the gate is open. */
  prepare?: () => Promise<void>;
  /** Pages that work without a sign-in (COMPASS: the QR report form). Their code is public, see GateEntry. */
  publicRoutes?: { path: string; element: ReactNode }[];
};

export const startApp = ({ appName, themes, brand, loadApp, prepare, publicRoutes }: StartAppOptions) => {
  const root = createRoot(document.getElementById("root")!);
  const start = () => runStart({
    prepare,
    loadApp,
    log: (message, error) => console.error(message, error),
    onLoaded: ({ default: App }) => root.render(<StrictMode><App /></StrictMode>),
    // A chunk that did not load (network, an expired gate cookie): say so and offer a reload, not an empty page.
    onFailed: () => root.render(
      <ColorModeProvider themes={themes} locale={ANTD_LOCALES[currentLanguage()]}>
        <Result
          status="warning"
          title={i18n.t("gate.unavailable", { defaultValue: "The app could not be opened right now." })}
          extra={<Button type="primary" onClick={() => window.location.reload()}>{i18n.t("gate.retry", { defaultValue: "Try again" })}</Button>}
        />
      </ColorModeProvider>,
    ),
  });
  if (import.meta.env.VITE_GATE === "1") {
    root.render(
      <StrictMode>
        <GateEntry appName={appName} themes={themes} brand={brand} publicRoutes={publicRoutes} onReady={() => { startGateRenewal(); void start(); }} />
      </StrictMode>,
    );
  } else {
    void start();
  }
};
