// Ported 1:1 from the NPM tool (app/src/pages/vessels/vesselNewbuildingProjectsPanel.tsx).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Table, Tag } from "antd";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { notesColumn } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { useNotesPanel } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { HULL_EVENT_STATUS_COLOR } from "../hullEvents/statusOptions";

export type VesselNewbuildingProject = {
  id: string;
  title: string;
  status: string | null;
  bidding_date: string | null;
  customer_name: string | null;
  shipyard_name: string | null;
  has_messages: boolean;
};

// The newbuilding projects this vessel belongs to: a vessel is linked to a project only through its NB hull events
// (hull_events.newbuilding_project_id), so the project ids come from those events. The vessel page needs the result to
// decide whether the tab exists at all, hence a hook rather than loading inside the panel.
export const useVesselNewbuildingProjects = (vesselId: string | undefined) => {
  const [projects, setProjects] = useState<VesselNewbuildingProject[]>([]);

  useEffect(() => {
    if (!vesselId || vesselId === "new") {
      setProjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: events } = await supabaseClient
        .from("hull_events")
        .select("newbuilding_project_id")
        .eq("vessel_id", vesselId)
        .not("newbuilding_project_id", "is", null);
      const projectIds = [...new Set((events ?? []).map((e) => e.newbuilding_project_id as string))];
      const { data } = projectIds.length
        ? await supabaseClient
            .from("newbuilding_projects_overview")
            .select("id, title, status, bidding_date, customer_name, shipyard_name, has_messages")
            .in("id", projectIds)
            .order("created_at", { ascending: false })
        : { data: [] as VesselNewbuildingProject[] };
      if (!cancelled) setProjects((data ?? []) as VesselNewbuildingProject[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [vesselId]);

  return projects;
};

const L = (field: keyof typeof FIELD_LABELS.newbuilding_projects) => fieldLabel("newbuilding_projects", field);

export const VesselNewbuildingProjectsPanel = ({ projects }: { projects: VesselNewbuildingProject[] }) => {
  const navigate = useNavigate();
  const { openEntity } = useNotesPanel();

  return (
    <Card title="Newbuilding Projects" size="small" style={{ marginBottom: 16 }}>
      <Table<VesselNewbuildingProject>
        dataSource={projects}
        rowKey="id"
        pagination={false}
        size="small"
        onRow={(record) => ({ onClick: () => navigate(`/newbuildings/${record.id}`), style: { cursor: "pointer" } })}
      >
        <Table.Column<VesselNewbuildingProject> dataIndex="title" title={L("title")} render={(v: string) => <strong>{v}</strong>} />
        <Table.Column<VesselNewbuildingProject>
          dataIndex="status"
          title={L("status")}
          render={(v: string | null) => (v ? <Tag color={HULL_EVENT_STATUS_COLOR[v] ?? "default"}>{v}</Tag> : "—")}
        />
        <Table.Column<VesselNewbuildingProject> dataIndex="customer_name" title={L("customer_name")} render={(v) => v ?? "—"} />
        <Table.Column<VesselNewbuildingProject> dataIndex="shipyard_name" title={L("shipyard_company_id")} render={(v) => v ?? "—"} />
        <Table.Column<VesselNewbuildingProject> dataIndex="bidding_date" title={L("bidding_date")} render={formatDate} />
        {notesColumn<VesselNewbuildingProject>((r) => openEntity({ type: "newbuilding_projects", id: r.id }))}
      </Table>
    </Card>
  );
};
