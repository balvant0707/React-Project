// Ported 1:1 from the NPM tool (app/src/pages/newbuildings/show.tsx).
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCanAccess as useCan} from "@rbp/core";
import { Show } from "@rbp/core";
import { Table, Tag, Spin, Descriptions, Typography, Button, Result } from "antd";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { usePageBannerTitle, usePageBannerSubtitle } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { clickableRow, notesColumn } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { useNotesPanel } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { HULL_EVENT_STATUS_COLOR } from "../hullEvents/statusOptions";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { EntityDetailChrome } from "@rbp/module-messaging/src/notes/entityDetailChrome.tsx";
import { ProjectFormModal, type NewbuildingProject } from "./projectFormModal";

const L = (field: keyof typeof FIELD_LABELS.newbuilding_projects) => fieldLabel("newbuilding_projects", field);
const LH = (field: keyof typeof FIELD_LABELS.hull_events) => fieldLabel("hull_events", field);

// Newbuilding project detail page (~/npm_tool/docs/domain-model.md, "Newbuilding projects"): the project's own data and the newbuilding
// hull events (type NB) of its vessels. A project has no specification of its own (quotes live on its hull events), but
// notes and attachments of its own (entity type newbuilding_projects).

type HullEventRow = {
  id: string;
  vessel_name: string | null;
  vessel_imo: string | null;
  vessel_ship_type_group: string | null;
  newbuilding_code: string | null;
  newbuilding_deadweight_tonnage: number | null;
  event_date: string | null;
  status: string | null;
  maker_name: string | null;
  specification_count: number;
  has_accepted_specification: boolean;
  sales_account_user_name: string | null;
  has_messages: boolean;
};

const amount = (value: number | null, currency: string | null) =>
  value == null ? "—" : `${Number(value).toLocaleString()}${currency ? ` ${currency}` : ""}`;

export const NewbuildingShow = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openEntity } = useNotesPanel();
  const { data: canCreateHullEvent } = useCan({ resource: "hull_events", action: "create" });

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<(NewbuildingProject & { can_edit: boolean }) | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [hullEvents, setHullEvents] = useState<HullEventRow[]>([]);
  const [editOpen, setEditOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: row }, { data: ov }, { data: eventRows }] = await Promise.all([
      supabaseClient.from("newbuilding_projects").select("*, can_edit:newbuilding_projects_can_edit").eq("id", id).maybeSingle(),
      supabaseClient.from("newbuilding_projects_overview").select("*").eq("id", id).maybeSingle(),
      supabaseClient
        .from("hull_events_overview")
        .select(
          "id, vessel_name, vessel_imo, vessel_ship_type_group, newbuilding_code, newbuilding_deadweight_tonnage, event_date, status, maker_name, " +
            "specification_count, has_accepted_specification, sales_account_user_name, has_messages",
        )
        .eq("newbuilding_project_id", id)
        .order("event_date")
        .order("vessel_name"),
    ]);
    setProject(row as any);
    setOverview(ov);
    setHullEvents((eventRows ?? []) as unknown as HullEventRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  usePageBannerTitle(project?.title);
  usePageBannerSubtitle([overview?.customer_name, overview?.shipyard_name, project?.status].filter(Boolean).join(" / ") || undefined);

  if (loading && !project) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }
  if (!project) {
    return <Result status="404" title="Newbuilding project not found" subTitle="It may have been deleted, or you may not have access to it." />;
  }

  const makerIds = project.maker_company_ids ?? [];

  return (
    <Show
      title="Newbuilding Project"
      isLoading={loading}
      headerButtons={
        <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)} disabled={!project.can_edit}>
          Edit
        </Button>
      }
    >
      <EntityDetailChrome entityType="newbuilding_projects" entityId={id}>
      <Descriptions column={{ xs: 1, md: 2 }} bordered size="small" style={{ marginBottom: 24 }}>
        <Descriptions.Item label={L("title")} span={2}>
          {project.title}
        </Descriptions.Item>
        <Descriptions.Item label={L("status")}>
          {project.status ? <Tag color={HULL_EVENT_STATUS_COLOR[project.status] ?? "default"}>{project.status}</Tag> : "—"}
        </Descriptions.Item>
        <Descriptions.Item label={L("bidding_date")}>{formatDate(project.bidding_date)}</Descriptions.Item>
        {project.status === "Lost" && (
          <Descriptions.Item label={L("lost_reason")} span={2}>
            {project.lost_reason || "—"}
          </Descriptions.Item>
        )}
        <Descriptions.Item label={L("ship_type")} span={2}>
          {project.ship_type ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label={L("customer_company_id")}>
          {project.customer_company_id ? <Link to={`/companies/${project.customer_company_id}`}>{overview?.customer_name}</Link> : "—"}
        </Descriptions.Item>
        <Descriptions.Item label={L("shipyard_company_id")}>
          {project.shipyard_company_id ? <Link to={`/companies/${project.shipyard_company_id}`}>{overview?.shipyard_name}</Link> : "—"}
        </Descriptions.Item>
        <Descriptions.Item label={L("owner_associate_company_id")}>
          {project.owner_associate_company_id ? (
            <Link to={`/companies/${project.owner_associate_company_id}`}>{overview?.owner_associate_name}</Link>
          ) : (
            "—"
          )}
        </Descriptions.Item>
        <Descriptions.Item label={L("maker_company_ids")}>
          {makerIds.length > 0 ? (
            <MakerLinks ids={makerIds} />
          ) : (
            "—"
          )}
        </Descriptions.Item>
        <Descriptions.Item label={L("estimated_contract_value")}>
          {amount(project.estimated_contract_value, project.estimated_contract_value_currency)}
        </Descriptions.Item>
        <Descriptions.Item label={L("cash_rebate")}>{amount(project.cash_rebate, project.estimated_contract_value_currency)}</Descriptions.Item>
        <Descriptions.Item label={L("sales_account_user_id")}>{overview?.sales_account_user_name ?? "—"}</Descriptions.Item>
        <Descriptions.Item label={L("assigned_team_id")}>{overview?.assigned_team_name ?? "—"}</Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5}>
        Hull events{" "}
        {canCreateHullEvent?.can && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => navigate(`/hull-events/new?newbuilding_project_id=${id}`)}>
            New hull event
          </Button>
        )}
      </Typography.Title>
      <Table<HullEventRow>
        dataSource={hullEvents}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: "No hull events yet - add one for each vessel of this project" }}
        onRow={clickableRow<HullEventRow>(navigate, "/hull-events")}
      >
        <Table.Column<HullEventRow>
          title={LH("vessel_name")}
          dataIndex="vessel_name"
          render={(v: string | null, r) =>
            v ? (
              <div>
                <strong>{v}</strong>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    IMO {r.vessel_imo} - {r.vessel_ship_type_group ?? "?"}
                  </Typography.Text>
                </div>
              </div>
            ) : (
              <span style={{ color: "#aaa" }}>— (no vessel yet)</span>
            )
          }
        />
        <Table.Column<HullEventRow> title={LH("newbuilding_code")} dataIndex="newbuilding_code" render={(v: string | null) => v ?? "—"} />
        <Table.Column<HullEventRow>
          title={LH("newbuilding_deadweight_tonnage")}
          dataIndex="newbuilding_deadweight_tonnage"
          align="right"
          render={(v: number | null) => (v != null ? `${v.toLocaleString()} DWT` : "—")}
        />
        <Table.Column<HullEventRow>
          title={LH("event_date")}
          dataIndex="event_date"
          render={(v: string | null) => (v ? dayjs(v).format("MMM YYYY") : "—")}
        />
        <Table.Column<HullEventRow>
          title={LH("status")}
          dataIndex="status"
          render={(v: string | null) => (v ? <Tag color={HULL_EVENT_STATUS_COLOR[v] ?? "default"}>{v}</Tag> : "—")}
        />
        <Table.Column<HullEventRow> title={LH("supplier_this_hullevent_id")} dataIndex="maker_name" render={(v: string | null) => v ?? "—"} />
        <Table.Column<HullEventRow>
          title={LH("specification_count")}
          dataIndex="specification_count"
          render={(_, r) =>
            r.specification_count > 0 ? (
              <>
                {r.specification_count} {r.specification_count === 1 ? "spec" : "specs"}
                {r.has_accepted_specification && (
                  <Tag color="green" style={{ marginLeft: 6 }}>
                    Accepted
                  </Tag>
                )}
              </>
            ) : (
              <span style={{ color: "#aaa" }}>None yet</span>
            )
          }
        />
        <Table.Column<HullEventRow> title={LH("sales_account_user_id")} dataIndex="sales_account_user_name" render={(v: string | null) => v ?? "—"} />
        {notesColumn<HullEventRow>((r) => openEntity({ type: "hull_events", id: r.id }))}
      </Table>
      </EntityDetailChrome>

      <ProjectFormModal
        open={editOpen}
        project={project}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          load();
        }}
      />
    </Show>
  );
};

// The makers are an id array on the project; names come from the companies table (read in one request).
const MakerLinks = ({ ids }: { ids: string[] }) => {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    supabaseClient
      .from("companies")
      .select("id, name")
      .in("id", ids)
      .then(({ data }) => setNames(Object.fromEntries((data ?? []).map((c) => [c.id, c.name]))));
  }, [ids]);
  return (
    <>
      {ids.map((makerId, i) => (
        <span key={makerId}>
          {i > 0 && ", "}
          <Link to={`/companies/${makerId}`}>{names[makerId] ?? "…"}</Link>
        </span>
      ))}
    </>
  );
};
