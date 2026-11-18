// Ported 1:1 from the NPM tool (app/src/pages/vessels/vesselOrdersPanel.tsx).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Table, Tag, Empty, Spin } from "antd";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { notesColumn } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { useNotesPanel } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { ORDER_STATUS_COLOR, type OrderStatusCode } from "../orders/statusColor";

type VesselOrderRow = {
  id: string;
  order_number: string | null;
  status_code: OrderStatusCode;
  status_label: string;
  requested_date: string | null;
  customer_name: string | null;
  supplier_name: string | null;
  customer_po_number: string | null;
  specification_number: string | null;
  specification_version: number | null;
  has_messages: boolean;
};

// All of this vessel's orders, of any hull event type. orders_overview has no
// vessel_id column (only the vessel's name), so the ids come from `orders`
// first and the display columns from the overview - a vessel has a handful
// of orders at most, so the .in() stays far below the URL-length limit.
export const VesselOrdersPanel = ({ vesselId }: { vesselId: string }) => {
  const navigate = useNavigate();
  const { openEntity } = useNotesPanel();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<VesselOrderRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: ids } = await supabaseClient.from("orders").select("id").eq("vessel_id", vesselId).is("deleted_at", null);
      const orderIds = (ids ?? []).map((o) => o.id);
      const { data } = orderIds.length
        ? await supabaseClient
            .from("orders_overview")
            .select(
              "id, order_number, status_code, status_label, requested_date, customer_name, supplier_name, customer_po_number, specification_number, specification_version, has_messages",
            )
            .in("id", orderIds)
            .order("created_at", { ascending: false })
        : { data: [] as VesselOrderRow[] };
      if (cancelled) return;
      setOrders((data ?? []) as VesselOrderRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [vesselId]);

  return (
    <Card title="Orders" size="small" style={{ marginBottom: 16 }}>
      {loading ? (
        <Spin />
      ) : orders.length === 0 ? (
        <Empty description="No orders yet" />
      ) : (
        <Table<VesselOrderRow>
          dataSource={orders}
          rowKey="id"
          pagination={false}
          size="small"
          onRow={(record) => ({ onClick: () => navigate(`/orders/${record.id}`), style: { cursor: "pointer" } })}
        >
          <Table.Column<VesselOrderRow> dataIndex="order_number" title="Order Number" />
          <Table.Column<VesselOrderRow>
            title="Specification"
            render={(_, r) => (r.specification_number ? `${r.specification_number} - v${r.specification_version}` : "-")}
          />
          <Table.Column<VesselOrderRow> dataIndex="customer_name" title="Customer" />
          <Table.Column<VesselOrderRow> dataIndex="supplier_name" title="Supplier" />
          <Table.Column<VesselOrderRow>
            title="Status"
            render={(_, r) => <Tag color={ORDER_STATUS_COLOR[r.status_code]}>{r.status_label}</Tag>}
          />
          <Table.Column<VesselOrderRow> dataIndex="customer_po_number" title="Customer PO" />
          <Table.Column<VesselOrderRow> dataIndex="requested_date" title="Requested Date" render={formatDate} />
          {notesColumn<VesselOrderRow>((r) => openEntity({ type: "orders", id: r.id }))}
        </Table>
      )}
    </Card>
  );
};
