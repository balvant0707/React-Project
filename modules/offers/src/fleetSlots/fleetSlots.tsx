// What offers adds to the fleet pages (slots, see modules/fleet/src/module.tsx). The code is the part of the NPM tool's
// pages/hullEvents/show.tsx and pages/vessels/vesselTimeline.tsx that reads specifications and orders, moved here unchanged
//.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Table, Tag, Typography } from "antd";
import { PlusOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-offers/src/fieldLabels.ts";
import { notesColumn } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { buildFilteredListUrl } from "@rbp/module-companies/src/utils/crossFilterNav.ts";
import { useNotesPanel } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import type { TimelineEntry, VesselTimelineSource } from "@rbp/module-fleet/src/pages/vessels/vesselTimeline.tsx";

const LS = (field: keyof typeof FIELD_LABELS.specifications) => fieldLabel("specifications", field);

type SpecificationRow = {
  id: string;
  specification_number: string;
  version: number;
  status: "draft" | "accepted" | "lost";
  specification_date: string | null;
  has_messages: boolean;
};

/** Hull event page, slot hull_events.show.sections: the event's specifications. */
export const HullEventSpecifications = ({ hullEventId: id }: { hullEventId: string }) => {
  const navigate = useNavigate();
  const { openEntity } = useNotesPanel();
  const [specs, setSpecs] = useState<SpecificationRow[] | null>(null);

  useEffect(() => {
    supabaseClient
      .from("specifications_overview")
      .select("id, specification_number, version, status, specification_date, has_messages")
      .eq("hull_event_id", id)
      .order("specification_number")
      .order("version")
      .then(({ data: specRows }) => setSpecs((specRows as SpecificationRow[] | null) ?? []));
  }, [id]);

  return (
    <>
      <Typography.Title level={5}>
        Specifications{" "}
        <Button size="small" icon={<PlusOutlined />} onClick={() => navigate(`/specifications/new?hull_event_id=${id}`)}>
          New Specification
        </Button>
      </Typography.Title>
      <Table dataSource={specs ?? []} rowKey="id" pagination={false}>
        <Table.Column
          title="Number"
          render={(_, record: SpecificationRow) => (
            <Link to={`/specifications/${record.id}`}>
              {record.specification_number} - v{record.version}
            </Link>
          )}
        />
        <Table.Column
          dataIndex="status"
          title={LS("status")}
          render={(v: SpecificationRow["status"]) =>
            v === "accepted" ? <Tag color="green">Accepted</Tag> : v === "lost" ? <Tag color="red">Lost</Tag> : null
          }
        />
        <Table.Column dataIndex="specification_date" title={LS("specification_date")} render={formatDate} />
        {notesColumn<SpecificationRow>((r) => openEntity({ type: "specifications", id: r.id }))}
      </Table>
    </>
  );
};

/** Hull event page, slot hull_events.show.actions: "Show Orders" when the event has orders. */
export const HullEventOrdersButton = ({ hullEventId: id }: { hullEventId: string }) => {
  const navigate = useNavigate();
  const [orderCount, setOrderCount] = useState(0);

  useEffect(() => {
    // Same view the Orders list reads (soft-deleted orders excluded), so the
    // "Show Orders" button only appears when that list would be non-empty.
    supabaseClient
      .from("orders_overview")
      .select("id", { count: "exact", head: true })
      .eq("hull_event_id", id)
      .then(({ count: orderRowCount }) => setOrderCount(orderRowCount ?? 0));
  }, [id]);

  if (orderCount === 0) return null;
  return (
    <Button
      icon={<ShoppingCartOutlined />}
      onClick={() => navigate(buildFilteredListUrl("/orders", [{ field: "hull_event_id", operator: "eq", value: id }]))}
    >
      Show Orders
    </Button>
  );
};

const SEASTOCK_COLOR = "purple";

type SeastockOfferRow = {
  id: string;
  specification_number: string;
  specification_date: string | null;
  status: string;
};

/** Vessel timeline, slot vessels.timeline: the vessel's Seastock offers. */
export const seastockTimelineSource: VesselTimelineSource = async (vesselId, navigate) => {
  // Seastock offers/orders link to a "project" hull event (type_code
  // 'SS') scoped to this vessel - see specifications.hull_event_type_code.
  const { data } = await supabaseClient
    .from("specifications")
    .select("id, specification_number, specification_date, status")
    .eq("vessel_id", vesselId)
    .eq("hull_event_type_code", "SS");
  const seastockOrders = data as SeastockOfferRow[] | null;
  return (seastockOrders ?? [])
    .filter((s) => s.specification_date)
    .map(
      (s): TimelineEntry => ({
        key: `seastock-${s.id}`,
        date: s.specification_date as string,
        color: SEASTOCK_COLOR,
        label: (
          <>
            <Typography.Link onClick={() => navigate(`/specifications/${s.id}`)}>
              <Typography.Text strong>Seastock Offer {s.specification_number}</Typography.Text>
            </Typography.Link>
            <Typography.Text type="secondary"> — {s.status}</Typography.Text>
          </>
        ),
      }),
    );
};
