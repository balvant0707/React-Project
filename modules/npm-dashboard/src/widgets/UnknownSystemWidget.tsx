// Ported 1:1 from the NPM tool (app/src/widgets/UnknownSystemWidget.tsx).
import { useEffect, useState } from "react";
import { useGetIdentity } from "@rbp/core";
import { Progress, Statistic, Typography } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { fetchAllPages } from "@rbp/ui";
import { COMPANY_OWN_ROLE_FIELDS, COMPANY_ROLE_FIELDS } from "@rbp/module-companies/src/utils/crossFilterNav.ts";
import { WidgetCard } from "./WidgetCard";

// Companies per request: the `or` repeats every id once per role column (8), so
// this keeps the URL well under PostgREST's ~8 KB limit.
const COMPANY_CHUNK = 10;
const ROLE_FIELDS = [...COMPANY_ROLE_FIELDS, ...COMPANY_OWN_ROLE_FIELDS];

type VesselRow = { id: string; current_maker_id: string | null };

// How many vessels of my Develop accounts have an unknown current coating
// system: no known current maker (vessels_overview.current_maker_id is the
// supplier of the latest DD/NB event dated up to today, so it is empty when
// the vessel has no such event, the event has no supplier or its service period is over). A vessel counts
// once, however many of the four ownership roles / accounts it matches.
export const UnknownSystemWidget = () => {
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ unknown: 0, total: 0 });

  useEffect(() => {
    if (!identity?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: accounts } = await supabaseClient
        .from("companies")
        .select("id, status:phrases!account_status_phrase_id!inner(text_en)")
        .eq("sales_account_user_id", identity.id)
        .eq("status.text_en", "Develop")
        .limit(1000);
      const companyIds = (accounts ?? []).map((a) => a.id as string);

      const vessels = new Map<string, boolean>();
      for (let i = 0; i < companyIds.length; i += COMPANY_CHUNK) {
        const ids = companyIds.slice(i, i + COMPANY_CHUNK).join(",");
        const rows = await fetchAllPages<VesselRow>((from, to) =>
          supabaseClient
            .from("vessels_overview")
            .select("id, current_maker_id")
            .or(ROLE_FIELDS.map((field) => `${field}.in.(${ids})`).join(","))
            .order("id")
            .range(from, to),
        );
        for (const r of rows) vessels.set(r.id, r.current_maker_id === null);
      }
      if (cancelled) return;
      setCounts({ unknown: [...vessels.values()].filter(Boolean).length, total: vessels.size });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [identity?.id]);

  const pct = counts.total > 0 ? Math.round((counts.unknown / counts.total) * 100) : 0;

  return (
    <WidgetCard
      title="Unknown coating system - develop accounts"
      loading={loading}
      empty={!loading && counts.total === 0}
      emptyText="No vessels on your develop accounts"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Statistic
          value={counts.unknown}
          prefix={<QuestionCircleOutlined style={{ fontSize: 20, color: "#fa8c16" }} />}
          formatter={(v) => Number(v).toLocaleString()}
          valueStyle={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2 }}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          vessels, {pct}% of {counts.total.toLocaleString()}
        </Typography.Text>
        <Progress percent={pct} showInfo={false} strokeColor="#fa8c16" size="small" />
      </div>
    </WidgetCard>
  );
};
