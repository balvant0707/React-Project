// Ported 1:1 from the NPM tool (app/src/pages/dashboard/index.tsx).
import { useMemo, type ReactNode } from "react";
import dayjs from "dayjs";
import { useGetIdentity } from "@rbp/core";
import { CalendarOutlined, SendOutlined, TrophyOutlined, BankOutlined, AimOutlined } from "@ant-design/icons";
import { usePageBannerTitle } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { CountKpiWidget } from "../../widgets/CountKpiWidget";
import { CompetitorChampionWidget } from "../../widgets/CompetitorChampionWidget";
import { InDockWidget } from "../../widgets/InDockWidget";
import { NextHullEventsWidget } from "../../widgets/NextHullEventsWidget";
import { MyTeamWidget } from "../../widgets/MyTeamWidget";
import { UnknownSystemWidget } from "../../widgets/UnknownSystemWidget";
import { MyTasksWidget, MyOverdueTasksWidget, MyTasksDueSoonWidget } from "../../widgets/TaskKpiWidgets";
import { buildFilterLink } from "../../widgets/filterLink";
import "./dashboard.css";
import { nowInUserZone } from "@rbp/ui";

// Mosaic grid: an 8-column layout crossed with a fixed row height a tile can
// span multiple of, so every widget gets a defined footprint instead of
// auto-sizing to its content. Plain CSS classes (dashboard.css), not inline
// styles, so the below-768px breakpoint there can collapse every tile to
// full width - inline `style` props can't express a media query.
const MosaicTile = ({ colSpan, rowSpan = 1, children }: { colSpan: 1 | 2 | 3 | 4 | 8; rowSpan?: number; children: ReactNode }) => (
  <div className={`dashboard-tile--col-${colSpan} dashboard-tile--row-${rowSpan}`}>{children}</div>
);

// Each widget loads its own data independently on mount - the dashboard
// passes nothing down - so any of them can be dropped onto another page
// unchanged (~/npm_tool/docs/ui-and-navigation.md, widget concept).
const greeting = () => {
  // The user's time zone from the profile (users.time_zone), else the device's.
  const hour = nowInUserZone().hour();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

// "To quote": my customers' hull events still in status Open.
const countToQuote = async (userId: string) => {
  const { count } = await supabaseClient
    .from("hull_events_overview")
    .select("id", { count: "exact", head: true })
    .eq("status", "Open")
    .eq("resolved_group_company_sales_account_user_id", userId);
  return count ?? 0;
};

// "To chase": my specifications that were offered to the customer
// (status approved) and are still waiting for an answer.
const countToChase = async (userId: string) => {
  const { count } = await supabaseClient
    .from("specifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("sales_account_user_id", userId);
  return count ?? 0;
};

const yearStart = () => dayjs().startOf("year").format("YYYY-MM-DD");
const nextYearStart = () => dayjs().add(1, "year").startOf("year").format("YYYY-MM-DD");

// "To celebrate": my customers' hull events Secured this year.
const countSecured = async (userId: string) => {
  const { count } = await supabaseClient
    .from("hull_events_overview")
    .select("id", { count: "exact", head: true })
    .eq("status", "Secured")
    .eq("resolved_group_company_sales_account_user_id", userId)
    .gte("event_date", yearStart())
    .lt("event_date", nextYearStart());
  return count ?? 0;
};

const countAccounts = (statusLabel: string) => async (userId: string) => {
  const { count } = await supabaseClient
    .from("companies")
    .select("id, status:phrases!account_status_phrase_id!inner(text_en)", { count: "exact", head: true })
    .eq("sales_account_user_id", userId)
    .eq("status.text_en", statusLabel);
  return count ?? 0;
};
const countDevelopAccounts = countAccounts("Develop");
const countTargetAccounts = countAccounts("Target");

export const Dashboard = () => {
  const { data: identity } = useGetIdentity<{ id: string; name: string }>();
  const firstName = identity?.name?.split(" ")[0];
  // The banner upper-cases its title; a greeting reads better in sentence case.
  // Memoized: the hook re-runs its effect whenever the node's identity changes,
  // so a fresh element per render would loop (setTitle -> re-render -> setTitle).
  const bannerTitle = useMemo(
    () => (firstName ? <span style={{ textTransform: "none" }}>{`${greeting()}, ${firstName}`}</span> : null),
    [firstName],
  );
  usePageBannerTitle(bannerTitle);

  return (
    <div className="dashboard-mosaic dashboard-mosaic--dense">
      <MosaicTile colSpan={2}>
        <CountKpiWidget
          title="To quote"
          caption="Open events"
          icon={<CalendarOutlined />}
          accentColor="#2f54eb"
          loadCount={countToQuote}
          detailsLink={identity?.id ? buildFilterLink("/hull-events", [
            { field: "status", operator: "eq", value: "Open" },
            { field: "resolved_group_company_sales_account_user_id", operator: "eq", value: identity.id },
          ]) : null}
        />
      </MosaicTile>
      <MosaicTile colSpan={2}>
        <CountKpiWidget
          title="To chase"
          caption="Offers made"
          icon={<SendOutlined />}
          accentColor="#fa8c16"
          loadCount={countToChase}
          detailsLink={identity?.id ? buildFilterLink("/specifications", [
            { field: "status", operator: "eq", value: "approved" },
            { field: "sales_account_user_id", operator: "eq", value: identity.id },
          ]) : null}
        />
      </MosaicTile>
      <MosaicTile colSpan={2}>
        <CountKpiWidget
          title="To celebrate"
          caption={`Jobs secured (${dayjs().year()})`}
          icon={<TrophyOutlined />}
          accentColor="#389e0d"
          loadCount={countSecured}
          detailsLink={identity?.id ? buildFilterLink("/hull-events", [
            { field: "status", operator: "eq", value: "Secured" },
            { field: "resolved_group_company_sales_account_user_id", operator: "eq", value: identity.id },
            { field: "event_date", operator: "gte", value: yearStart() },
            { field: "event_date", operator: "lt", value: nextYearStart() },
          ]) : null}
        />
      </MosaicTile>
      <MosaicTile colSpan={2}>
        <CompetitorChampionWidget />
      </MosaicTile>

      <MosaicTile colSpan={3} rowSpan={2}>
        <InDockWidget />
      </MosaicTile>
      <MosaicTile colSpan={3} rowSpan={2}>
        <NextHullEventsWidget />
      </MosaicTile>
      <MosaicTile colSpan={2} rowSpan={2}>
        <UnknownSystemWidget />
      </MosaicTile>

      <MosaicTile colSpan={4}>
        <MyTeamWidget />
      </MosaicTile>
      <MosaicTile colSpan={2}>
        <CountKpiWidget
          title="Develop accounts"
          icon={<BankOutlined />}
          accentColor="#08979c"
          loadCount={countDevelopAccounts}
          detailsLink="/companies"
        />
      </MosaicTile>
      <MosaicTile colSpan={2}>
        <CountKpiWidget
          title="Target accounts"
          icon={<AimOutlined />}
          accentColor="#c41d7f"
          loadCount={countTargetAccounts}
          detailsLink="/companies"
        />
      </MosaicTile>

      {/* Platform (RADAR): the user's tasks (widgets/TaskKpiWidgets.tsx, hand-written; the NPM tool had no tasks). */}
      <MosaicTile colSpan={3}>
        <MyTasksWidget userId={identity?.id} />
      </MosaicTile>
      <MosaicTile colSpan={3}>
        <MyOverdueTasksWidget userId={identity?.id} />
      </MosaicTile>
      <MosaicTile colSpan={2}>
        <MyTasksDueSoonWidget userId={identity?.id} />
      </MosaicTile>
    </div>
  );
};
