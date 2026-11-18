// Ported 1:1 from the NPM tool (app/src/pages/vessels/vesselTimeline.tsx).
import { useEffect, useMemo, useState } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { useRecordSlot } from "@rbp/core";
import { Card, Timeline, Typography, Spin, Empty } from "antd";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { loadCompanyOptionsWithGroupByIds } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { DATE_FORMAT } from "@rbp/ui";


// No dedicated color convention exists yet for hull_event_type (unlike
// status, see hullEvents/statusOptions.ts) - defined here since this is the
// first place type gets its own color rather than plain text.
const HULL_EVENT_TYPE_COLOR: Record<string, string> = {
  DD: "blue",
  NB: "green",
};

// Every vessels column vessel_history snapshots that's worth surfacing as a
// "this changed" timeline entry - everything except the id/valid_from/
// valid_until bookkeeping. The *_company_id/*_is_manual pairs are tracked
// separately, in COMPANY_ROLE_FIELDS below, since displaying them means
// resolving a company id to its name rather than a plain string compare.
type VesselFieldKey = keyof typeof FIELD_LABELS.vessels;

const TRACKED_FIELDS: { key: VesselFieldKey; isDate?: boolean }[] = [
  { key: "name" },
  { key: "deadweight_tonnage" },
  { key: "gross_tonnage" },
  { key: "net_tonnage" },
  { key: "flag" },
  { key: "built_date", isDate: true },
  { key: "ship_type" },
  { key: "class_society" },
  { key: "status" },
  { key: "vessel_sanction" },
  { key: "overall_risk_rating" },
  { key: "docking_survey_date", isDate: true },
  { key: "shipbuilder" },
  { key: "shipbuilder_country" },
  { key: "group_owner" },
  { key: "group_owner_country" },
  { key: "ship_manager" },
  { key: "ship_manager_country" },
  { key: "technical_manager" },
  { key: "technical_manager_country" },
  { key: "operator" },
  { key: "operator_country" },
];

// The four SeaWeb ownership roles' resolved-company pair (see
// get_or_create_seaweb_company / vessels_resolve_company_links) - tracked as
// its own field so reassigning a vessel's Group Owner/Ship Manager/
// Technical Manager/Operator company (auto-resolved or a manual override) shows up
// here too, not just a change to the underlying free-text field.
const COMPANY_ROLE_FIELDS: { companyIdKey: VesselFieldKey; isManualKey: string }[] = [
  { companyIdKey: "group_owner_company_id", isManualKey: "group_owner_company_is_manual" },
  { companyIdKey: "ship_manager_company_id", isManualKey: "ship_manager_company_is_manual" },
  { companyIdKey: "technical_manager_company_id", isManualKey: "technical_manager_company_is_manual" },
  { companyIdKey: "operator_company_id", isManualKey: "operator_company_is_manual" },
];

const HISTORY_SELECT = [
  "id",
  "valid_from",
  "valid_until",
  ...TRACKED_FIELDS.map((f) => f.key),
  ...COMPANY_ROLE_FIELDS.flatMap((f) => [f.companyIdKey, f.isManualKey]),
].join(", ");

const formatValue = (key: VesselFieldKey, value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  const field = TRACKED_FIELDS.find((f) => f.key === key);
  return field?.isDate ? dayjs(value as string).format(DATE_FORMAT) : String(value);
};

const formatCompanyValue = (companyId: unknown, isManual: unknown, companiesById: Record<string, string>): string => {
  if (!companyId) return "— (no alias match)";
  const name = companiesById[companyId as string] ?? "Unknown company";
  return `${name} (${isManual ? "manual exception" : "auto-resolved"})`;
};

type Change = { key: string; label: string; from: string; to: string };

type VesselHistoryRow = Record<string, unknown> & { id: string; valid_from: string; valid_until: string };

type HullEventRow = {
  id: string;
  event_date: string | null;
  status: string | null;
  type_code: string | null;
  type_text: string | null;
};

export type TimelineEntry = {
  key: string;
  date: string;
  color: string;
  label: React.ReactNode;
};

/** Extra timeline entries of a vessel from a module above fleet (slot "vessels.timeline", `value` of the item). */
export type VesselTimelineSource = (vesselId: string, navigate: NavigateFunction) => Promise<TimelineEntry[]>;

// Merges vessel_history (attribute changes) and this vessel's hull_events
// into one chronological view - antd's Timeline component, not a charting
// library (@ant-design/plots, used for the status chart elsewhere, is built
// for continuous series, not a list of discrete dated events like this one).
export const VesselTimeline = ({
  vesselId,
  imo,
  vessel,
  companyOptions,
}: {
  vesselId: string;
  imo: string | null | undefined;
  vessel: Record<string, unknown> | null;
  companyOptions: { value: string; label: string }[];
}) => {
  const navigate = useNavigate();
  const slotSources = useRecordSlot("vessels.timeline");
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const companiesById = useMemo(() => Object.fromEntries(companyOptions.map((c) => [c.value, c.label])), [companyOptions]);

  useEffect(() => {
    if (!vessel) return;
    setLoading(true);
    Promise.all([
      // vessel_history is keyed by imo (SeaWeb's own key), not vessel_id - a
      // vessel with no imo yet (none exist today, but see the placeholder-
      // vessel follow-up discussed for NB) simply has no attribute history,
      // not a reason to skip the vessel's own hull events/orders below too.
      imo
        ? supabaseClient
            .from("vessel_history")
            .select(HISTORY_SELECT)
            .eq("vessel_imo", imo)
            .order("valid_from", { ascending: true })
            .then((r) => r.data as unknown as VesselHistoryRow[] | null)
        : Promise.resolve(null),
      supabaseClient
        .from("hull_events")
        .select("id, event_date, status, phrases(code, text_en)")
        .eq("vessel_id", vesselId)
        .neq("type_code", "SS")
        .then((r) => r.data),
      Promise.all(slotSources.map((s) => (s.value as VesselTimelineSource)(vesselId, navigate))).then((r) => r.flat()),
    ]).then(async ([history, hullEventsRaw, slotEntries]) => {
      // companyOptions only carries this vessel's current role companies (the
      // company pickers search on the server - there are too many companies
      // to preload), so name the other companies its history mentions here.
      const historyCompanyIds = new Set<string>();
      for (const h of history ?? []) {
        for (const { companyIdKey } of COMPANY_ROLE_FIELDS) {
          const cid = h[companyIdKey];
          if (typeof cid === "string" && !companiesById[cid]) historyCompanyIds.add(cid);
        }
      }
      const extraNames = await loadCompanyOptionsWithGroupByIds([...historyCompanyIds]);
      const companyNames: Record<string, string> = {
        ...companiesById,
        ...Object.fromEntries(extraNames.map((o) => [o.value, o.label])),
      };

      const hullEvents: HullEventRow[] =(hullEventsRaw ?? []).map((he: any) => ({
        id: he.id,
        event_date: he.event_date,
        status: he.status,
        type_code: he.phrases?.code ?? null,
        type_text: he.phrases?.text_en ?? null,
      }));

      // Each vessel_history row is a snapshot of what was true from
      // valid_from to valid_until - so "what changed at valid_until" is the
      // diff between this row and whatever state took over next (the
      // following history row, or the vessel's current live row for the
      // most recent one). Only the fields that actually differ are shown -
      // e.g. a name-only correction shows just "Name: X -> Y", not every
      // tracked field.
      const chronological = [...(history ?? [])].sort((a, b) => (a.valid_from < b.valid_from ? -1 : 1));
      const successors: (Record<string, unknown> | null)[] = [...chronological.slice(1), vessel];

      const historyEntries: TimelineEntry[] = chronological
        .map((h, i): TimelineEntry | null => {
          const next = successors[i];
          if (!next) return null;
          const fieldChanges: Change[] = TRACKED_FIELDS.map(({ key }): Change | null => {
            const from = h[key];
            const to = next[key];
            if (String(from ?? "") === String(to ?? "")) return null;
            return { key, label: fieldLabel("vessels", key), from: formatValue(key, from), to: formatValue(key, to) };
          }).filter((c): c is Change => c !== null);
          const companyChanges: Change[] = COMPANY_ROLE_FIELDS.map(({ companyIdKey, isManualKey }): Change | null => {
            const fromId = h[companyIdKey];
            const toId = next[companyIdKey];
            const fromManual = h[isManualKey];
            const toManual = next[isManualKey];
            if (String(fromId ?? "") === String(toId ?? "") && Boolean(fromManual) === Boolean(toManual)) return null;
            return {
              key: companyIdKey,
              label: fieldLabel("vessels", companyIdKey),
              from: formatCompanyValue(fromId, fromManual, companyNames),
              to: formatCompanyValue(toId, toManual, companyNames),
            };
          }).filter((c): c is Change => c !== null);
          const changes = [...fieldChanges, ...companyChanges];
          if (changes.length === 0) return null;
          return {
            key: `history-${h.id}`,
            date: h.valid_until,
            color: "gray",
            label: (
              <>
                <Typography.Text strong>Vessel data changed</Typography.Text>
                {changes.map((c) => (
                  <div key={c.key}>
                    <Typography.Text type="secondary">
                      {c.label}: {c.from} → {c.to}
                    </Typography.Text>
                  </div>
                ))}
              </>
            ),
          };
        })
        .filter((e): e is TimelineEntry => e !== null);

      const hullEventEntries: TimelineEntry[] = hullEvents
        .filter((he) => he.event_date)
        .map((he) => ({
          key: `hull-event-${he.id}`,
          date: he.event_date as string,
          color: HULL_EVENT_TYPE_COLOR[he.type_code ?? ""] ?? "default",
          label: (
            <>
              <Typography.Link onClick={() => navigate(`/hull-events/${he.id}`)}>
                <Typography.Text strong>{he.type_text ?? "Hull Event"}</Typography.Text>
              </Typography.Link>
              {he.status && <Typography.Text type="secondary"> — {he.status}</Typography.Text>}
            </>
          ),
        }));

      const merged = [...historyEntries, ...hullEventEntries, ...slotEntries].sort((a, b) => (a.date < b.date ? 1 : -1));
      setEntries(merged);
      setLoading(false);
    });
  }, [vesselId, imo, vessel, companiesById, navigate, slotSources]);

  return (
    <Card title="Timeline" size="small" style={{ marginBottom: 16 }}>
      {loading ? (
        <Spin />
      ) : entries.length === 0 ? (
        <Empty description="No recorded changes or hull events yet" />
      ) : (
        <Timeline
          items={entries.map((e) => ({
            key: e.key,
            color: e.color,
            children: (
              <>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(e.date).format(DATE_FORMAT)}
                </Typography.Text>
                <div>{e.label}</div>
              </>
            ),
          }))}
        />
      )}
    </Card>
  );
};
