// Ported 1:1 from COMPASS (app/src/pages/items/locationShow.tsx).
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Empty, Space, Spin, Table, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { FieldBar } from "@rbp/module-task-family/src/components/fieldBar.tsx";
import { StockBookModal, StockCountModal, StockTransferModal } from "../../components/stockDialogs";
import { useTeams } from "@rbp/core";
import { useMe } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { useQuantityText } from "@rbp/module-task-family/src/hooks/useItems.ts";
import { useStockLocations } from "../../hooks/useStock";
import { locationUrl, mayBook } from "../../lib/stock";

type Content = { item_id: string; stock_location_id: string; quantity: number | string; item_number: string; item_name: string; unit_phrase_id: string | null; total_count: number };
const PAGE = 50;

// A location (store, shelf, bin): its place in the tree, the stock in it and below it, and a QR code for the label. The
// QR code opens this page, so the stock at a bin is one scan away.
export const LocationShow = () => {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const { has } = usePermissions();
  const { teamIds } = useMe();
  const quantity = useQuantityText();
  const { data: groups } = useTeams();
  const { locations, byId, isLoading } = useStockLocations();
  const [book, setBook] = useState(false);
  const [count, setCount] = useState<Content | null>(null);
  const [transfer, setTransfer] = useState<Content | null>(null);
  const location = byId.get(id);
  const [page, setPage] = useState(1);

  // Paged on the server (RPC stock_location_contents walks the subtree): a store can hold more than a page of items.
  const { data: contents, isLoading: loadingContents } = useQuery({
    queryKey: ["location-contents", id, page],
    enabled: !!location,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("stock_location_contents", { p_location_id: id, p_limit: PAGE, p_offset: (page - 1) * PAGE });
      if (error) throw error;
      return (data ?? []) as Content[];
    },
  });
  const total = contents?.[0]?.total_count ?? 0;

  if (isLoading) return <Spin />;
  if (!location) return <Empty description={t("common.notFound")} />;
  const children = locations.filter((l) => l.parent_id === id);
  const canBookHere = mayBook(has, teamIds, location);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link to="/items?view=locations">{t("stock.locations")}</Link>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <Space align="center" size={12} wrap>
            <Typography.Title level={3} style={{ margin: 0 }}>{location.path}</Typography.Title>
            {!location.is_active && <Tag>{t("items.inactive")}</Tag>}
          </Space>
          <FieldBar
            fields={[
              { label: t("stock.code"), value: location.code },
              { label: t("stock.team"), value: location.team_id ? groups?.find((g) => g.id === location.team_id)?.name ?? "—" : "—" },
              { label: t("stock.note"), value: location.note ?? "—", hidden: !location.note },
              {
                label: t("stock.below"),
                value: children.length ? <Space size={4} wrap>{children.map((c) => <Link key={c.id} to={`/items/locations/${c.id}`}>{c.name}</Link>)}</Space> : "—",
              },
            ]}
          />
        </div>
        <div style={{ textAlign: "center", background: "#fff", padding: 8, borderRadius: 6, border: "1px solid #ddd" }}>
          <QRCodeSVG value={locationUrl(location.id)} size={96} />
          <div style={{ fontSize: 11, color: "#000" }}>{location.code}</div>
        </div>
      </div>
      <Space style={{ marginBottom: 12 }} wrap>
        {canBookHere && <Button onClick={() => setBook(true)}>{t("stock.bookTitle")}</Button>}
        <Link to={`/items/locations/labels?root=${location.id}`}><Button>{t("stock.printLabel")}</Button></Link>
      </Space>
      <Table<Content>
        size="small"
        rowKey={(r) => `${r.item_id}:${r.stock_location_id}`}
        loading={loadingContents}
        dataSource={contents}
        pagination={{ current: page, pageSize: PAGE, total: Number(total), onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("stock.emptyLocation")} /> }}
        columns={[
          { title: t("items.title"), render: (_: unknown, r) => <Link to={`/items/${r.item_id}?tab=stock`}>{`${r.item_number} · ${r.item_name}`}</Link> },
          { title: t("stock.location"), render: (_: unknown, r) => byId.get(r.stock_location_id)?.path ?? "—" },
          { title: t("items.quantity"), align: "right" as const, render: (_: unknown, r) => quantity(r.quantity, r.unit_phrase_id) },
          {
            title: "",
            align: "right" as const,
            render: (_: unknown, r) =>
              mayBook(has, teamIds, byId.get(r.stock_location_id)) ? (
                <Space size={4}>
                  <Button size="small" onClick={() => setCount(r)}>{t("stock.count")}</Button>
                  <Button size="small" disabled={Number(r.quantity) <= 0} onClick={() => setTransfer(r)}>{t("stock.transfer")}</Button>
                </Space>
              ) : null,
          },
        ]}
      />
      <StockBookModal open={book} locationId={location.id} onClose={() => setBook(false)} />
      {count && <StockCountModal open itemId={count.item_id} itemLabel={`${count.item_number} · ${count.item_name}`} locationId={count.stock_location_id} current={Number(count.quantity)} onClose={() => setCount(null)} />}
      {transfer && <StockTransferModal open itemId={transfer.item_id} itemLabel={`${transfer.item_number} · ${transfer.item_name}`} fromId={transfer.stock_location_id} available={Number(transfer.quantity)} onClose={() => setTransfer(null)} />}
    </div>
  );
};
