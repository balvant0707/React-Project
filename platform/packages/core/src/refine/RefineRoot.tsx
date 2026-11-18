import { Refine, Authenticated, useGetIdentity, useResourceParams } from '@refinedev/core';
import { ThemedLayout, useNotificationProvider } from '@refinedev/antd';
import routerProvider, { CatchAllNavigate, UnsavedChangesNotifier } from '@refinedev/react-router';
import { dataProvider } from './dataProvider';
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntdApp, type ThemeConfig } from 'antd';
import { ColorModeProvider, startTableCards } from '@rbp/ui';
import '@refinedev/antd/dist/reset.css';
import type { ModuleManifest, ModuleResource } from '../module';
import { supabaseClient } from '../supabase';
import { authProvider } from './authProvider';
import { accessControlProvider } from './accessControlProvider';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { ANTD_LOCALES, currentLanguage, getAppLanguages, type Language } from '../i18n';
import { Login } from '../login/Login';
import { ForgotPassword } from '../login/ForgotPassword';
import { UpdatePassword } from '../login/UpdatePassword';
import { Activate } from '../login/Activate';
import { MfaGate } from '../mfa/MfaGate';
import { MfaPage } from '../mfa/MfaPage';
import { PhoneSearch } from '../shell/GlobalSearch';
import { ProfilePage } from '../profile/ProfilePage';
import { ConfigurationPage } from '../admin/ConfigurationPage';
import { PhrasesPage } from '../admin/PhrasesPage';
import { SettingsPage } from '../admin/SettingsPage';
import { EmailSettingsPage } from '../admin/EmailSettingsPage';
import { UsersPage } from '../admin/UsersPage';
import { TeamsPage } from '../admin/TeamsPage';
import { RolesPage } from '../admin/RolesPage';
import { GrantsPage } from '../admin/GrantsPage';
import { SafetyOutlined, SettingOutlined, TeamOutlined, ToolOutlined, UserOutlined, KeyOutlined } from '@ant-design/icons';
import { Header } from '../shell/Header';
import { Sider } from '../shell/Sider';
import { Title } from '../shell/Title';
import { ShellProvider, type ShellConfig } from '../shell/ShellContext';
import { MainContentArea } from '../shell/MainContentArea';
import { currentRecordTitle, onRecordTitleChange } from '../shell/usePageTitle';
import { queryClient } from '../queryClient';

// Phone: every antd table becomes a list of cards (labels copied from the header; styles in @rbp/ui styles.css).
startTableCards();

// The service worker (precached app shell, web push) exists in the production build only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const register = () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}

// Refine's own texts (buttons, notifications) through i18next (COMPASS App.tsx, verbatim). Refine calls translate(key, "default
// text") as well as translate(key, options, "default text"); a key no locale has keeps Refine's English default.
const i18nProvider = {
  translate: (key: string, options?: any, defaultMessage?: string) => i18n.t(key, { defaultValue: typeof options === 'string' ? options : defaultMessage, ...(typeof options === 'object' ? options : {}) }) as string,
  changeLocale: (lang: string) => i18n.changeLanguage(lang),
  getLocale: () => i18n.language,
};

// Applies the signed-in user's saved language once per login (COMPASS App.tsx). Changed: only a language the app offers
// (RADAR is fixed to English, setAppLanguages).
const ApplyUserLanguage = () => {
  const { data: identity } = useGetIdentity<{ language?: string | null }>();
  useEffect(() => {
    const lang = identity?.language;
    if (lang && (getAppLanguages() as readonly string[]).includes(lang)) void i18n.changeLanguage(lang as Language);
  }, [identity?.language]);
  return null;
};

// Tab title "<record or page> · <app>" (a detail page names its record through usePageTitle; COMPASS App.tsx PageTitle,
// NPM's DocumentTitleHandler did "<menu label> · RADAR"). Changed: the app name is the shell's; the resource label is translated already.
const PageTitle = ({ appName }: { appName: string }) => {
  const { resource } = useResourceParams();
  const location = useLocation();
  const label = resource?.meta?.label as string | undefined;
  const [record, setRecord] = useState(currentRecordTitle());
  useEffect(() => onRecordTitleChange(() => setRecord(currentRecordTitle())), []);
  useEffect(() => {
    const page = record ?? label;
    document.title = page ? `${page} · ${appName}` : appName;
  }, [record, label, location.pathname, appName]);
  return null;
};

export interface RefineRootProps {
  appName: string;
  modules: ModuleManifest[];
  /** Light and dark antd themes of the app (createThemes in @rbp/ui). */
  themes: { light: ThemeConfig; dark: ThemeConfig };
  /** Logo and name shown on the sign-in page. */
  brand: ReactNode;
  /** Title of the sider and the phone header: full (logo + name) and collapsed (icon only). */
  shellTitle: ShellConfig['title'];
  banner: ShellConfig['banner'];
}

/** Translates the module manifests into Refine resources and routes. The only Refine entry point. */
export function RefineRoot({ appName, modules, themes, brand, shellTitle, banner }: RefineRootProps) {
  const { t } = useTranslation();
  // The platform's own pages: the profile (reached through the avatar) and the Admin group (admin administers; users and teams
  // can be delegated by the literals users.manage / teams.manage).
  const coreResources: ModuleResource[] = [
    { name: 'profile', list: '/profile', label: 'Profile', hidden: true },
    { name: 'admin', label: 'nav.settings', icon: <ToolOutlined />, admin: true, permission: 'users.manage' },
    { name: 'admin_users', list: '/admin/users', label: 'admin.users', title: 'admin.users', icon: <UserOutlined />, parent: 'admin', admin: true, permission: 'users.manage' },
    { name: 'admin_teams', list: '/admin/teams', label: 'admin.teams', title: 'admin.teams', icon: <TeamOutlined />, parent: 'admin', admin: true, permission: 'teams.manage' },
    { name: 'admin_roles', list: '/admin/roles', label: 'admin.roles', title: 'admin.roles', icon: <SafetyOutlined />, parent: 'admin', admin: true },
    { name: 'admin_grants', list: '/admin/grants', label: 'admin.grants', title: 'admin.grants', icon: <KeyOutlined />, parent: 'admin', admin: true },
    { name: 'admin_configuration', list: '/admin/configuration', label: 'admin.configuration', title: 'admin.configuration', icon: <SettingOutlined />, parent: 'admin', admin: true },
    { name: 'admin_settings', list: '/admin/settings', label: 'admin.settings.title', title: 'admin.settings.title', parent: 'admin_configuration', admin: true, hidden: true },
    { name: 'admin_email', list: '/admin/email', label: 'admin.email.title', title: 'admin.email.title', parent: 'admin_configuration', admin: true, hidden: true },
    { name: 'admin_phrases', list: '/admin/phrases', label: 'admin.phrases.title', title: 'admin.phrases.title', parent: 'admin_configuration', admin: true, hidden: true },
  ];
  // Order: top-level module entries (menuOrder, then module order), the admin group, then children (Refine places a
  // parent where first mentioned). The same resource name / route path from a later module replaces the earlier one in
  // its place (task-family's task pages over the tasks module's).
  const lastByKey = <T,>(items: T[], key: (x: T) => string) => [...new Map(items.map((x) => [key(x), x])).values()];
  const moduleResources = lastByKey(modules.flatMap((m) => m.resources ?? []), (r) => r.name);
  const topLevel = moduleResources.filter((r) => !r.parent).map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.menuOrder ?? 0) - (b.r.menuOrder ?? 0) || a.i - b.i).map(({ r }) => r);
  // Children of a group keep the module order unless they give a menuOrder (a later module's entry placed between, e.g. COMPASS tickets
  // between tasks and recurring tasks). Labels and titles are i18n keys or plain text.
  const byParent = new Map<string, ModuleResource[]>();
  for (const r of moduleResources) if (r.parent) byParent.set(r.parent, [...(byParent.get(r.parent) ?? []), r]);
  const children = [...byParent.values()].flatMap((list) => list.map((r, i) => ({ r, i })).sort((a, b) => (a.r.menuOrder ?? 0) - (b.r.menuOrder ?? 0) || a.i - b.i).map(({ r }) => r));
  const tr = (text?: string) => (text ? t(text, { defaultValue: text }) : text);
  const resources = [...topLevel, ...coreResources, ...children].map((r) => ({
    name: r.name, list: r.list, show: r.show, edit: r.edit, create: r.create,
    meta: { label: tr(r.label), pageTitle: tr(r.title), icon: r.icon, hide: r.hidden, parent: r.parent, permission: r.permission, admin: r.admin, menuLink: r.menuLink },
  }));
  const recordSlots = useMemo(() => modules.flatMap((m) => m.recordSlots ?? []), [modules]);
  const shell: ShellConfig = {
    appName,
    brand,
    banner,
    title: shellTitle,
    headerItems: modules.flatMap((m) => m.headerItems ?? []),
    phoneTabs: modules.flatMap((m) => m.phoneTabs ?? []),
    profileSections: modules.flatMap((m) => m.profileSections ?? []),
    configurationCards: modules.flatMap((m) => m.configurationCards ?? []),
    headerSearch: modules.map((m) => m.headerSearch).find(Boolean),
    recordSlots,
    contentAsides: modules.flatMap((m) => (m.contentAside ? [m.contentAside] : [])),
  };
  const routes = lastByKey(modules.flatMap((m) => m.routes ?? []), (r) => r.path);
  const data = useMemo(() => dataProvider(supabaseClient, Object.assign({}, ...modules.map((m) => m.listRpcs ?? {}))), [modules]);
  const providers = modules.flatMap((m) => m.providers ?? []);
  const withProviders = (children: ReactNode) => providers.reduceRight<ReactNode>((inner, P) => <P>{inner}</P>, children);
  return (
    <BrowserRouter>
      <ColorModeProvider themes={themes} locale={ANTD_LOCALES[currentLanguage()]}>
        <AntdApp>
          <ShellProvider value={shell}>
          <Refine
            dataProvider={data}
            authProvider={authProvider}
            accessControlProvider={accessControlProvider}
            routerProvider={routerProvider}
            notificationProvider={useNotificationProvider}
            resources={resources}
            i18nProvider={i18nProvider}
            // Options of both source apps (NPM/COMPASS App.tsx). breadcrumb: false - the PageBanner already shows the
            // "App / Section / ..." trail, so Refine's own breadcrumb in List/Show/Edit headers would repeat it.
            // disableTelemetry: Refine would otherwise report usage to telemetry.refine.dev on every load (also blocked by the CSP).
            // reactQuery: the shared query client (../queryClient.ts: backend status banner, offline cache).
            options={{ syncWithLocation: true, title: { text: appName }, breadcrumb: false, warnWhenUnsavedChanges: true, disableTelemetry: true, reactQuery: { clientConfig: queryClient } }}
          >
            <ApplyUserLanguage />
            <PageTitle appName={appName} />
            {withProviders(<Routes>
              <Route
                element={
                  <Authenticated key="auth" fallback={<CatchAllNavigate to="/login" />}>
                    <MfaGate>
                    <ThemedLayout Sider={Sider} Header={Header} Title={Title}><MainContentArea /></ThemedLayout>
                    </MfaGate>
                  </Authenticated>
                }
              >
                <Route path="/search" element={<PhoneSearch />} />
                {/* No sidebar entry: reached through the header avatar. */}
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/admin/users" element={<UsersPage />} />
                <Route path="/admin/teams" element={<TeamsPage />} />
                <Route path="/admin/roles" element={<RolesPage />} />
                <Route path="/admin/grants" element={<GrantsPage />} />
                <Route path="/admin/configuration" element={<ConfigurationPage />} />
                <Route path="/admin/settings" element={<SettingsPage />} />
                <Route path="/admin/email" element={<EmailSettingsPage />} />
                <Route path="/admin/phrases" element={<PhrasesPage />} />
                {routes.filter((r) => !r.layout).map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
              </Route>
              {/* Print views: signed in, without the shell. */}
              <Route element={<Authenticated key="print" fallback={<CatchAllNavigate to="/login" />}><MfaGate><Outlet /></MfaGate></Authenticated>}>
                {routes.filter((r) => r.layout === 'print').map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
              </Route>
              {routes.filter((r) => r.layout === 'public').map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
              <Route path="/login" element={<Login brand={brand} />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/update-password" element={<UpdatePassword />} />
              <Route path="/activate" element={<Activate />} />
              <Route element={<Authenticated key="mfa" fallback={<CatchAllNavigate to="/login" />}><Outlet /></Authenticated>}>
                <Route path="/mfa" element={<MfaPage />} />
              </Route>
            </Routes>)}
            <UnsavedChangesNotifier />
          </Refine>
          </ShellProvider>
        </AntdApp>
      </ColorModeProvider>
    </BrowserRouter>
  );
}
