// Ported 1:1 from the NPM tool (app/src/pages/vessels/seastockOffersPanel.tsx).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Table, Tag, Button, Empty, Spin, Dropdown } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { notesColumn } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { useNotesPanel } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { createSeastockProject } from "../../modules/hullEvents/seastockProject";

type SeastockOfferRow = {
  id: string;
  specification_number: string;
  version: number;
  status: "draft" | "accepted" | "lost";
  specification_date: string | null;
  has_messages: boolean;
  // Populated from a second query against `orders` (see load below) once
  // this offer's specifications row has been converted - null until then.
  order_id: string | null;
};

type SeastockProject = {
  id: string;
  project_code: string | null;
  event_date: string | null;
};

const STATUS_TAG: Record<SeastockOfferRow["status"], { color?: string; label: string }> = {
  draft: { label: "Draft" },
  accepted: { color: "green", label: "Accepted" },
  lost: { color: "red", label: "Lost" },
};

// Seastock offers/orders link to a "project" - an ordinary hull_events row,
// type_code 'SS', relabeled "Project" in this context - scoped to this
// vessel (specifications.hull_event_type_code = 'SS'). Reintroduced so
// several linked offers/orders (and their procurements) can be evaluated
// jointly for gross profit; see ~/npm_tool/docs/domain-model.md. Mirrors VesselTimeline's
// own "small card scoped to this vessel" shape rather than living on the
// general Specifications list (which mixes every hull event type together).
//
// Terminology (~/npm_tool/docs/order-processing-module.md): a row here is a
// Specification until it has been converted - an "Offer" - and becomes an
// "Order" once its `orders` row exists (auto-created on acceptance for
// Seastock, see auto_create_order_for_seastock_acceptance). Rather than
// replacing the Draft/Accepted/Lost status tag (still the spec's own real
// lifecycle), a converted row gets an extra "Order" link that jumps straight
// to it.
export const SeastockOffersPanel = ({ vesselId }: { vesselId: string }) => {
  const navigate = useNavigate();
  const { openEntity } = useNotesPanel();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<SeastockOfferRow[]>([]);
  const [projects, setProjects] = useState<SeastockProject[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: projectRows }] = await Promise.all([
      supabaseClient
        .from("specifications_overview")
        .select("id, specification_number, version, status, specification_date, has_messages")
        .eq("vessel_id", vesselId)
        .eq("hull_event_type_code", "SS")
        .order("specification_date", { ascending: false }),
      supabaseClient
        .from("hull_events")
        .select("id, project_code, event_date")
        .eq("vessel_id", vesselId)
        .eq("type_code", "SS")
        .order("created_at", { ascending: false }),
    ]);
    const rows = data ?? [];
    const specIds = rows.map((r) => r.id);
    const { data: orderRows } = specIds.length
      ? await supabaseClient.from("orders").select("id, specification_id").in("specification_id", specIds)
      : { data: [] as { id: string; specification_id: string }[] };
    const orderIdBySpec = new Map((orderRows ?? []).map((o) => [o.specification_id, o.id]));
    setOffers(rows.map((r) => ({ ...r, order_id: orderIdBySpec.get(r.id) ?? null })));
    setProjects(projectRows ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vesselId]);

  const startOfferOn = (hullEventId: string) => navigate(`/specifications/new?hull_event_id=${hullEventId}&vessel_id=${vesselId}`);

  // One click, zero required fields: every other hull_events column
  // (event_date, status, snapshot_*) already gets a default or is filled by
  // the existing copy_vessel_snapshot_to_hull_event trigger. event_date gets
  // overwritten with this offer's own delivery_date as soon as it's saved
  // (see sync_hull_event_event_date_from_specification).
  const startNewProject = async () => {
    const hullEventId = await createSeastockProject(vesselId);
    if (hullEventId) startOfferOn(hullEventId);
  };

  return (
    <Card
      title="Seastock Offers"
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        projects.length === 0 ? (
          <Button size="small" icon={<PlusOutlined />} onClick={startNewProject}>
            New Offer
          </Button>
        ) : (
          <Dropdown
            menu={{
              items: [
                { key: "new-project", label: "New offer" },
                { key: "divider", type: "divider" as const },
                ...projects.map((p) => ({
                  key: p.id,
                  label: `Add to ${p.project_code ?? `project - ${formatDate(p.event_date)}`}`,
                })),
              ],
              onClick: ({ key }) => (key === "new-project" ? startNewProject() : startOfferOn(key)),
            }}
          >
            <Button size="small" icon={<PlusOutlined />}>
              New Offer
            </Button>
          </Dropdown>
        )
      }
    >
      {loading ? (
        <Spin />
      ) : offers.length === 0 ? (
        <Empty description="No Seastock offers yet" />
      ) : (
        <Table<SeastockOfferRow>
          dataSource={offers}
          rowKey="id"
          pagination={false}
          size="small"
          onRow={(record) => ({
            onClick: () => navigate(record.order_id ? `/orders/${record.order_id}` : `/specifications/${record.id}`),
            style: { cursor: "pointer" },
          })}
        >
          <Table.Column<SeastockOfferRow> title="Number" render={(_, r) => `${r.specification_number} - v${r.version}`} />
          <Table.Column<SeastockOfferRow>
            dataIndex="status"
            title="Status"
            render={(v: SeastockOfferRow["status"]) => {
              const tag = STATUS_TAG[v];
              return <Tag color={tag.color}>{tag.label}</Tag>;
            }}
          />
          <Table.Column<SeastockOfferRow>
            title="Order"
            render={(_, r) => (r.order_id ? <Tag color="blue">Order</Tag> : null)}
          />
          <Table.Column<SeastockOfferRow> dataIndex="specification_date" title="Date" render={formatDate} />
          {notesColumn<SeastockOfferRow>((r) => openEntity({ type: "specifications", id: r.id }))}
        </Table>
      )}
    </Card>
  );
};
