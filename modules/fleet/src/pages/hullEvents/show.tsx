// Ported 1:1 from the NPM tool (app/src/pages/hullEvents/show.tsx).
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Show } from "@rbp/core";
import { Tag, Spin, Descriptions, Button } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { RecordSlot } from "@rbp/core";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { EntityDetailChrome } from "@rbp/module-messaging/src/notes/entityDetailChrome.tsx";
import { usePageBannerTitle, usePageBannerSubtitle, usePageBannerCrumbExtra } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { companyWithGroup } from "../../components/companyWithGroup";
import { HULL_EVENT_STATUS_COLOR } from "./statusOptions";
import { isLightEventType, hasAppliedProduct } from "./eventTypes";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";

const L = (field: keyof typeof FIELD_LABELS.hull_events) => fieldLabel("hull_events", field);
// Entry-point drill-down, per ~/npm_tool/docs/ui-and-navigation.md: opening a HullEvent
// skips straight to its one Specification when there's exactly one; only
// shows an intermediate list when there's more than one (or none yet - e.g.
// a HullEvent that has no quote yet, or a future Claim/Inspection type that
// never gets a Specification at all).

// The four ownership roles snapshotted onto a hull event from its vessel at
// creation (copy_vessel_snapshot_to_hull_event, before insert only). The
// snapshot is the hull event's own record - editable here when the vessel's
// data was wrong or out of date at the time of creation.
const SNAPSHOT_ROLES = ["group_owner", "ship_manager", "technical_manager", "operator"] as const;
type SnapshotRole = (typeof SNAPSHOT_ROLES)[number];
const snapshotField = (role: SnapshotRole) => `snapshot_${role}_company_id` as const;

type SnapshotCompany = {
  id: string;
  name: string;
  country: string | null;
  groupId: string | null;
  groupName: string | null;
  groupCountry: string | null;
};

// Hero subtitle: supplier (this hull event) / opportunity value+currency /
// status - the hull event's most commercially relevant facts at a glance.
// opportunity_exchange_rate is deliberately left out here, same as the list
// page's own Opportunity column (see 20260925110000) - no confirmed
// conversion direction/target currency exists anywhere in this app yet.
const hullEventSubtitle = (he: any): string | undefined => {
  if (!he) return undefined;
  const supplier = he.this_maker?.name ?? null;
  const opportunity =
    he.opportunity_value != null
      ? `${Number(he.opportunity_value).toLocaleString()}${he.opportunity_value_currency ? ` ${he.opportunity_value_currency}` : ""}`
      : null;
  return [supplier, opportunity, he.status ?? null].filter(Boolean).join(" / ") || undefined;
};

export const HullEventShow = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [hullEvent, setHullEvent] = useState<any>(null);
  // The newbuilding project (see newbuilding_projects) this NB event belongs to, if any.
  const [project, setProject] = useState<{ id: string; title: string } | null>(null);
  // The saved snapshot companies (with country + own group), keyed by role.
  const [snapshotCompanies, setSnapshotCompanies] = useState<Partial<Record<SnapshotRole, SnapshotCompany>>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: he }, { data: heOverview }] = await Promise.all([
      supabaseClient
        .from("hull_events")
        .select(
          "*, vessels(name, imo), phrases(text_en, code), " +
            "newbuilding_project:newbuilding_projects!hull_events_newbuilding_project_id_fkey(id, title), " +
            "customer:companies!hull_events_customer_company_id_fkey(name), " +
            "last_maker:companies!hull_events_supplier_last_hullevent_id_fkey(name), " +
            "this_maker:companies!hull_events_supplier_this_hullevent_id_fkey(name), " +
            "vertical_af:antifouling_products!hull_events_vertical_af_product_fkey(name), " +
            "flat_bottom_af:antifouling_products!hull_events_flat_bottom_af_product_fkey(name), " +
            "vertical_offered_af:antifouling_products!hull_events_vertical_offered_af_product_id_fkey(name), " +
            "flat_bottom_offered_af:antifouling_products!hull_events_flat_bottom_offered_af_product_id_fkey(name), " +
            "dealer:companies!hull_events_dealer_company_id_fkey(name), " +
            "shipyard:companies!hull_events_shipyard_company_id_fkey(name), " +
            "facilitating_partner:companies!hull_events_facilitating_partner_company_id_fkey(name), " +
            "reported_by:users!hull_events_reported_by_user_id_fkey(name), " +
            "sales_account_user:users!sales_account_user_id(name, default_tenant:teams!default_team_id(name)), " +
            "technical_service_rep:users!hull_events_technical_service_rep_user_id_fkey(name), " +
            "second_technical_service_rep:users!hull_events_second_technical_service_rep_user_id_fkey(name), " +
            "hull_event_newbuilding_details(*), can_edit:hull_events_can_edit",
        )
        .eq("id", id)
        .single(),
      // resolved_* (live, via the vessel's CURRENT group_owner/technical_manager/
      // operator_company_id - "who owns this today") and snapshot_*_company_id
      // (frozen at this hull event's own creation, see
      // copy_vessel_snapshot_to_hull_event) are both computed by
      // hull_events_overview - fetched separately rather than folding the raw
      // table query into the view, since PostgREST's FK-embed resolution
      // (last_maker/this_maker/dealer/reported_by above) isn't reliable
      // through a view. snapshot_group_owner_company_id itself IS a plain FK
      // column on hull_events (unlike resolved_*), but its resolved name
      // still needs the view's join, same as the live one.
      supabaseClient
        .from("hull_events_overview")
        .select(
          "resolved_group_company_id, resolved_group_company_name, resolved_group_company_country, " +
            "resolved_group_owner_company_id, resolved_group_owner_company_name, resolved_group_owner_company_country, " +
            "resolved_ship_manager_company_id, resolved_ship_manager_company_name, resolved_ship_manager_company_country, " +
            "resolved_ship_manager_group_company_id, resolved_ship_manager_group_company_name, resolved_ship_manager_group_company_country, " +
            "resolved_technical_manager_company_id, resolved_technical_manager_company_name, resolved_technical_manager_company_country, " +
            "resolved_technical_manager_group_company_id, resolved_technical_manager_group_company_name, resolved_technical_manager_group_company_country, " +
            "resolved_operator_company_id, resolved_operator_company_name, resolved_operator_company_country, " +
            "resolved_operator_group_company_id, resolved_operator_group_company_name, resolved_operator_group_company_country, " +
            "snapshot_group_owner_company_id, snapshot_group_owner_company_name, snapshot_group_owner_company_country, " +
            "snapshot_ship_manager_company_id, snapshot_ship_manager_company_name, snapshot_ship_manager_company_country, " +
            "snapshot_technical_manager_company_id, snapshot_technical_manager_company_name, snapshot_technical_manager_company_country, " +
            "snapshot_operator_company_id, snapshot_operator_company_name, snapshot_operator_company_country, " +
            "location_country_name",
        )
        .eq("id", id)
        .single(),
    ]);
    setProject((he as any)?.newbuilding_project ?? null);
    setHullEvent(he ? { ...(he as any), ...(heOverview as any) } : he);
    // The overview view has no group company for the snapshot columns, so look
    // the four snapshot companies up directly (name, country, own group).
    const snapshotIds = SNAPSHOT_ROLES.map((r) => (he as any)?.[snapshotField(r)] as string | null).filter((v): v is string => !!v);
    if (snapshotIds.length > 0) {
      const { data: companyRows } = await supabaseClient
        .from("companies")
        .select("id, name, countries(name_en), group_company:companies!group_company_id(id, name, countries(name_en))")
        .in("id", snapshotIds);
      const byId = new Map<string, SnapshotCompany>(
        ((companyRows ?? []) as any[]).map((c) => [
          c.id,
          {
            id: c.id,
            name: c.name,
            country: c.countries?.name_en ?? null,
            groupId: c.group_company?.id ?? null,
            groupName: c.group_company?.name ?? null,
            groupCountry: c.group_company?.countries?.name_en ?? null,
          },
        ]),
      );
      setSnapshotCompanies(
        Object.fromEntries(
          SNAPSHOT_ROLES.flatMap((r) => {
            const company = byId.get((he as any)[snapshotField(r)]);
            return company ? [[r, company]] : [];
          }),
        ),
      );
    } else {
      setSnapshotCompanies({});
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // A newbuilding can exist before its vessel does: fall back to its code, then its project.
  const nbDetails = Array.isArray(hullEvent?.hull_event_newbuilding_details)
    ? hullEvent.hull_event_newbuilding_details[0]
    : hullEvent?.hull_event_newbuilding_details;
  const hullEventVesselName = hullEvent?.snapshot_vessel_name ?? hullEvent?.vessels?.name ?? nbDetails?.newbuilding_code ?? project?.title;
  usePageBannerTitle(hullEventVesselName);
  usePageBannerCrumbExtra(hullEvent?.phrases?.text_en);
  usePageBannerSubtitle(hullEventSubtitle(hullEvent));

  const ownershipCell = (role: SnapshotRole, live: ReturnType<typeof companyWithGroup>) => {
    const c = snapshotCompanies[role];
    return (c && companyWithGroup(c.id, c.name, c.country, c.groupId, c.groupName, c.groupCountry)) ?? live ?? "—";
  };

  const isLight = isLightEventType(hullEvent?.phrases?.code);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <Show
      title="Hull Event"
      isLoading={loading}
      headerButtons={
        <>
          {/* Show Orders (offers) and Dock Report (dock reports) come from the modules above fleet. */}
          <RecordSlot slot="hull_events.show.actions" hullEventId={id!} eventTypeCode={hullEvent?.phrases?.code ?? null} />
          <Button icon={<EditOutlined />} onClick={() => navigate(`/hull-events/${id}/edit`)} disabled={!hullEvent?.can_edit}>
            Edit
          </Button>
        </>
      }
    >
      <EntityDetailChrome entityType="hull_events" entityId={id}>
      <Descriptions column={{ xs: 1, md: 2 }} bordered size="small" style={{ marginBottom: 24 }}>
        <Descriptions.Item label={L("snapshot_vessel_name")}>
          {hullEvent?.vessels ? (
            <>
              <Link to={`/vessels/${hullEvent.vessel_id}`}>{hullEvent.snapshot_vessel_name ?? hullEvent.vessels.name}</Link>{" "}
              ({hullEvent.vessels.imo})
            </>
          ) : (
            "— (newbuilding)"
          )}
        </Descriptions.Item>
        <Descriptions.Item label={L("project_code")}>
          {/* Assigned lazily on the first specification, not at hull event
              creation - a hull event with no specs yet (e.g. Report only)
              has none. */}
          {hullEvent?.project_code ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label={L("type_text")}>{hullEvent?.phrases?.text_en}</Descriptions.Item>
        <Descriptions.Item label={L("event_date")}>
          {hullEvent?.event_date ? dayjs(hullEvent.event_date).format("MMM YYYY") : "—"}
        </Descriptions.Item>
        {hullEvent?.phrases?.code === "NB" && (
          <Descriptions.Item label={L("newbuilding_project_id")}>
            {project ? <Link to={`/newbuildings/${project.id}`}>{project.title}</Link> : "—"}
          </Descriptions.Item>
        )}
        <Descriptions.Item label={L("status")}>
          {hullEvent?.status ? <Tag color={HULL_EVENT_STATUS_COLOR[hullEvent.status] ?? "default"}>{hullEvent.status}</Tag> : "—"}
        </Descriptions.Item>
        {hullEvent?.status === "Lost" && (
          <Descriptions.Item label={L("lost_reason")}>{hullEvent.lost_reason || "—"}</Descriptions.Item>
        )}
        {/* The hull event's own saved snapshot (editable, see the edit page) is
            what's shown; the vessel's live-resolved company is only the
            fallback when the snapshot is empty. */}
        <Descriptions.Item label={L("resolved_group_company_id")}>
          {ownershipCell(
            "group_owner",
            companyWithGroup(
              hullEvent?.resolved_group_owner_company_id,
              hullEvent?.resolved_group_owner_company_name,
              hullEvent?.resolved_group_owner_company_country,
              hullEvent?.resolved_group_company_id,
              hullEvent?.resolved_group_company_name,
              hullEvent?.resolved_group_company_country,
            ),
          )}
        </Descriptions.Item>
        <Descriptions.Item label={L("resolved_ship_manager_company_id")}>
          {ownershipCell(
            "ship_manager",
            companyWithGroup(
              hullEvent?.resolved_ship_manager_company_id,
              hullEvent?.resolved_ship_manager_company_name,
              hullEvent?.resolved_ship_manager_company_country,
              hullEvent?.resolved_ship_manager_group_company_id,
              hullEvent?.resolved_ship_manager_group_company_name,
              hullEvent?.resolved_ship_manager_group_company_country,
            ),
          )}
        </Descriptions.Item>
        <Descriptions.Item label={L("resolved_technical_manager_company_id")}>
          {ownershipCell(
            "technical_manager",
            companyWithGroup(
              hullEvent?.resolved_technical_manager_company_id,
              hullEvent?.resolved_technical_manager_company_name,
              hullEvent?.resolved_technical_manager_company_country,
              hullEvent?.resolved_technical_manager_group_company_id,
              hullEvent?.resolved_technical_manager_group_company_name,
              hullEvent?.resolved_technical_manager_group_company_country,
            ),
          )}
        </Descriptions.Item>
        <Descriptions.Item label={L("resolved_operator_company_id")}>
          {ownershipCell(
            "operator",
            companyWithGroup(
              hullEvent?.resolved_operator_company_id,
              hullEvent?.resolved_operator_company_name,
              hullEvent?.resolved_operator_company_country,
              hullEvent?.resolved_operator_group_company_id,
              hullEvent?.resolved_operator_group_company_name,
              hullEvent?.resolved_operator_group_company_country,
            ),
          )}
        </Descriptions.Item>
        {!isLight && (
        <Descriptions.Item label={L("customer_company_id")}>
          {hullEvent?.customer_company_id ? (
            <Link to={`/companies/${hullEvent.customer_company_id}`}>{hullEvent.customer?.name}</Link>
          ) : (
            "—"
          )}
        </Descriptions.Item>
        )}
        {hullEvent?.phrases?.code !== "NB" && (
          <Descriptions.Item label={L("supplier_last_hullevent_id")}>
            {hullEvent?.supplier_last_hullevent_id ? (
              <Link to={`/companies/${hullEvent.supplier_last_hullevent_id}`}>{hullEvent.last_maker?.name}</Link>
            ) : (
              "—"
            )}
          </Descriptions.Item>
        )}
        <Descriptions.Item label={L("supplier_this_hullevent_id")}>
          {hullEvent?.supplier_this_hullevent_id ? (
            <Link to={`/companies/${hullEvent.supplier_this_hullevent_id}`}>{hullEvent.this_maker?.name}</Link>
          ) : (
            "—"
          )}
        </Descriptions.Item>
        {hasAppliedProduct(hullEvent?.phrases?.code) && (
        <Descriptions.Item label={L("vertical_af_product_id")}>{hullEvent?.vertical_af?.name ?? "—"}</Descriptions.Item>
        )}
        {hasAppliedProduct(hullEvent?.phrases?.code) && (
        <Descriptions.Item label={L("flat_bottom_af_product_id")}>{hullEvent?.flat_bottom_af?.name ?? "—"}</Descriptions.Item>
        )}
        {!isLight && (
        <Descriptions.Item label={L("vertical_offered_af_product_id")}>
          {/* Editable on the edit page (e.g. an event without a specification), but
              overwritten from the latest saved specification's own areas by
              replace_specification_children on every save regardless of status
              (see 20260924130000). */}
          {hullEvent?.vertical_offered_af?.name ?? "—"}
        </Descriptions.Item>
        )}
        {!isLight && (
        <Descriptions.Item label={L("flat_bottom_offered_af_product_id")}>{hullEvent?.flat_bottom_offered_af?.name ?? "—"}</Descriptions.Item>
        )}
        {!isLight && (
        <Descriptions.Item label={L("opportunity_value")}>
          {hullEvent?.opportunity_value != null
            ? `${Number(hullEvent.opportunity_value).toLocaleString()}${hullEvent.opportunity_value_currency ? ` ${hullEvent.opportunity_value_currency}` : ""}`
            : "—"}
        </Descriptions.Item>
        )}
        {!isLight && (
        <Descriptions.Item label={L("opportunity_litres")}>
          {hullEvent?.opportunity_litres != null ? `${Number(hullEvent.opportunity_litres).toLocaleString()} L` : "—"}
        </Descriptions.Item>
        )}
        {!isLight && (
        <Descriptions.Item label={L("service_period_months")}>
          {hullEvent?.service_period_months != null ? `${hullEvent.service_period_months} months` : "—"}
        </Descriptions.Item>
        )}
        {!isLight && (
        <Descriptions.Item label={L("dealer_company_id")}>
          {hullEvent?.dealer_company_id ? <Link to={`/companies/${hullEvent.dealer_company_id}`}>{hullEvent.dealer?.name}</Link> : "—"}
        </Descriptions.Item>
        )}
        {!isLight && (
        <Descriptions.Item label={L("facilitating_partner_company_id")}>
          {hullEvent?.facilitating_partner_company_id ? (
            <Link to={`/companies/${hullEvent.facilitating_partner_company_id}`}>{hullEvent.facilitating_partner?.name}</Link>
          ) : (
            "—"
          )}
        </Descriptions.Item>
        )}
        <Descriptions.Item label={L("location_continent")}>{hullEvent?.location_continent ?? "—"}</Descriptions.Item>
        <Descriptions.Item label={L("location_country_id")}>{hullEvent?.location_country_name ?? "—"}</Descriptions.Item>
        <Descriptions.Item label={L("shipyard_company_id")}>
          {/* Which yard is doing THIS hull event, not vessels.shipbuilder
              (who originally built the ship) - a plain, directly-picked
              company reference, not a snapshot (see the migration's own
              comment) - there's nothing to prefill this from. */}
          {hullEvent?.shipyard_company_id ? (
            <Link to={`/companies/${hullEvent.shipyard_company_id}`}>{hullEvent.shipyard?.name}</Link>
          ) : (
            "—"
          )}
        </Descriptions.Item>
        <Descriptions.Item label={L("sales_account_user_id")}>{hullEvent?.sales_account_user?.name ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Associate">{hullEvent?.sales_account_user?.default_tenant?.name ?? "—"}</Descriptions.Item>
        <Descriptions.Item label={L("technical_service_rep_user_id")}>{hullEvent?.technical_service_rep?.name ?? "—"}</Descriptions.Item>
        <Descriptions.Item label={L("second_technical_service_rep_user_id")}>{hullEvent?.second_technical_service_rep?.name ?? "—"}</Descriptions.Item>
        <Descriptions.Item label={L("dock_in_date")}>{formatDate(hullEvent?.dock_in_date)}</Descriptions.Item>
        <Descriptions.Item label={L("dock_out_date")}>{formatDate(hullEvent?.dock_out_date)}</Descriptions.Item>
        <Descriptions.Item label={L("performance_guarantee")}>
          {hullEvent?.performance_guarantee == null ? "—" : hullEvent.performance_guarantee ? "Yes" : "No"}
        </Descriptions.Item>
        <Descriptions.Item label={L("reported_by_user_id")}>{hullEvent?.reported_by?.name ?? "—"}</Descriptions.Item>
        {hullEvent?.phrases?.code === "NB" &&
          (() => {
            const nb = Array.isArray(hullEvent.hull_event_newbuilding_details)
              ? hullEvent.hull_event_newbuilding_details[0]
              : hullEvent.hull_event_newbuilding_details;
            return (
              <>
                <Descriptions.Item label={L("newbuilding_code")}>{nb?.newbuilding_code ?? "—"}</Descriptions.Item>
                <Descriptions.Item label={L("newbuilding_deadweight_tonnage")}>
                  {nb?.newbuilding_deadweight_tonnage != null ? `${nb.newbuilding_deadweight_tonnage.toLocaleString()} DWT` : "—"}
                </Descriptions.Item>
                <Descriptions.Item label={L("newbuilding_teu")}>
                  {nb?.newbuilding_teu != null ? `${nb.newbuilding_teu.toLocaleString()} TEU` : "—"}
                </Descriptions.Item>
                <Descriptions.Item label={L("newbuilding_contract_date")}>{formatDate(nb?.contract_date)}</Descriptions.Item>
                <Descriptions.Item label={L("newbuilding_steel_cut_date")}>{formatDate(nb?.steel_cut_date)}</Descriptions.Item>
              </>
            );
          })()}
      </Descriptions>

      {/* The Specifications table comes from the offers module. */}
      {!isLight && <RecordSlot slot="hull_events.show.sections" hullEventId={id!} />}
      </EntityDetailChrome>
    </Show>
  );
};
