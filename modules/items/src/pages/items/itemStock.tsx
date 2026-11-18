// Ported 1:1 from COMPASS (app/src/pages/items/itemStock.tsx).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Empty, Segmented, Space, Table, Tag, Typography } from "antd";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { FieldBar } from "@rbp/module-task-family/src/components/fieldBar.tsx";
import { StockBookModal, StockCountModal, StockTransferModal } from "../../components/stockDialogs";
import { useMe } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { useUserMap } from "@rbp/core";
import { useQuantityText } from "@rbp/module-task-family/src/hooks/useItems.ts";
import { StockChart } from "../../components/stockChart";
import { useStockHistory, useStockLocations } from "../../hooks/useStock";
import { mayBook, type ItemStock, type StockBalance, type StockMovement } from "../../lib/stock";
import { formatDate } from "@rbp/ui";
import type { CatalogueItem } from "@rbp/module-task-family/src/lib/items.ts";

const PAGE = 30;
const KIND_COLORS: Record<string, string> = { opening: "blue", receipt: "green", issue: "orange", return: "cyan", correction: "purple", count: "gold", transfer: "default" };

// The stock of one item: totals, the quantity per location with the manual bookings, and the ledger. The ledger only
// grows, so it is read a page at a time (newest first, keyset on `seq`), never as a whole.
export const ItemStockTab = ({ part }: { part: CatalogueItem & { stock_managed?: boolean } }) => {
  const { t } = useTranslation();
  const { has } = usePermissions();
  const { teamIds } = useMe();
  const quantity = useQuantityText();
  const users = useUserMap();
  const { byId } = useStockLocations();
  const [weeks, setWeeks] = useState(26);
  const [book, setBook] = useState(false);
  const [count, setCount] = useState<{ locationId: string; current: number } | null>(null);
  const [transfer, setTransfer] = useState<{ locationId: string; current: number } | null>(null);
  const label = `${part.item_number} · ${part.name}`;

  const { data: stock } = useQuery({
    queryKey: ["item-stock", part.id],
    queryFn: async () => ((await supabaseClient.from("item_stock_overview").select("*").eq("item_id", part.id).maybeSingle()).data ?? null) as ItemStock | null,
  });
  const { data: balances } = useQuery({
    queryKey: ["stock-balances", part.id, "item"],
    queryFn: async () => ((await supabaseClient.from("stock_balances").select("item_id, stock_location_id, quantity").eq("item_id", part.id)).data ?? []) as StockBalance[],
  });
  const history = useInfiniteQuery({
    queryKey: ["stock-movements", part.id],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      let q = supabaseClient
        .from("stock_movements")
        .select("id, seq, item_id, stock_location_id, quantity, kind, task_id, task_item_id, transfer_id, note, created_at, created_by_user_id, task:tasks(task_number, title)")
        .eq("item_id", part.id)
        .order("seq", { ascending: false })
        .limit(PAGE);
      if (pageParam != null) q = q.lt("seq", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as (StockMovement & { task: { task_number: number; title: string } | null })[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].seq : undefined),
  });
  const trend = useStockHistory([part.id], weeks, !!part.stock_managed);
  const rows = history.data?.pages.flat() ?? [];
  const canBookSomewhere = has("stock.edit.all") || has("stock.edit.team");

  if (!part.stock_managed) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("stock.notManaged")} />;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <FieldBar
        fields={[
          {
            label: t("stock.total"),
            value: (
              <Space size={6}>
                <Typography.Text strong>{stock?.quantity == null ? "—" : quantity(stock.quantity, part.unit_phrase_id)}</Typography.Text>
                {stock?.below_minimum && <Tag color="red">{t("stock.belowMinimum")}</Tag>}
              </Space>
            ),
          },
          { label: t("stock.minimum"), value: stock?.minimum_stock == null ? "—" : quantity(stock.minimum_stock, part.unit_phrase_id) },
          { label: t("stock.reorderQuantity"), value: stock?.reorder_quantity == null ? "—" : quantity(stock.reorder_quantity, part.unit_phrase_id) },
          { label: t("stock.defaultLocation"), value: stock?.default_stock_location_id ? <Link to={`/items/locations/${stock.default_stock_location_id}`}>{byId.get(stock.default_stock_location_id)?.path ?? "—"}</Link> : "—" },
        ]}
      />
      {canBookSomewhere && (
        <Button onClick={() => setBook(true)}>{t("stock.bookTitle")}</Button>
      )}
      <Table<StockBalance>
        size="small"
        rowKey="stock_location_id"
        dataSource={(balances ?? []).filter((b) => Number(b.quantity) !== 0).sort((a, b) => (byId.get(a.stock_location_id)?.path ?? "").localeCompare(byId.get(b.stock_location_id)?.path ?? ""))}
        pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("stock.noStock")} /> }}
        columns={[
          {
            title: t("stock.location"),
            render: (_: unknown, r) => <Link to={`/items/locations/${r.stock_location_id}`}>{byId.get(r.stock_location_id)?.path ?? "—"}</Link>,
          },
          {
            title: t("items.quantity"),
            align: "right" as const,
            render: (_: unknown, r) => <Typography.Text type={Number(r.quantity) < 0 ? "danger" : undefined}>{quantity(r.quantity, part.unit_phrase_id)}</Typography.Text>,
          },
          {
            title: "",
            align: "right" as const,
            render: (_: unknown, r) =>
              mayBook(has, teamIds, byId.get(r.stock_location_id)) ? (
                <Space size={4}>
                  <Button size="small" onClick={() => setCount({ locationId: r.stock_location_id, current: Number(r.quantity) })}>{t("stock.count")}</Button>
                  <Button size="small" disabled={Number(r.quantity) <= 0} onClick={() => setTransfer({ locationId: r.stock_location_id, current: Number(r.quantity) })}>{t("stock.transfer")}</Button>
                </Space>
              ) : null,
          },
        ]}
      />
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <Typography.Title level={5} style={{ margin: 0 }}>{t("stock.development")}</Typography.Title>
          <Segmented
            size="small"
            value={weeks}
            onChange={(v) => setWeeks(Number(v))}
            options={[
              { value: 13, label: t("stock.months", { count: 3 }) },
              { value: 26, label: t("stock.months", { count: 6 }) },
              { value: 52, label: t("stock.months", { count: 12 }) },
            ]}
          />
        </div>
        <StockChart
          points={trend.data?.get(part.id) ?? []}
          minimum={stock?.minimum_stock == null ? null : Number(stock.minimum_stock)}
          format={(v) => quantity(v, part.unit_phrase_id)}
          formatDay={(d) => formatDate(d)}
          minimumLabel={t("stock.minimum")}
          label={t("stock.development")}
        />
      </div>
      <div>
        <Typography.Title level={5}>{t("stock.history")}</Typography.Title>
        <Table<StockMovement & { task: { task_number: number; title: string } | null }>
          size="small"
          rowKey="id"
          dataSource={rows}
          loading={history.isLoading}
          pagination={false}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("stock.noMovements")} /> }}
          columns={[
            { title: t("fields.createdAt"), dataIndex: "created_at", render: (v: string) => formatDate(v) },
            { title: t("stock.kindLabel"), dataIndex: "kind", render: (v: string) => <Tag color={KIND_COLORS[v]}>{t(`stock.kinds.${v}`)}</Tag> },
            { title: t("stock.location"), render: (_: unknown, r) => byId.get(r.stock_location_id)?.path ?? "—" },
            {
              title: t("items.quantity"),
              align: "right" as const,
              render: (_: unknown, r) => {
                const n = Number(r.quantity);
                return <Typography.Text type={n < 0 ? "danger" : n > 0 ? "success" : undefined}>{n > 0 ? `+${n}` : String(n)}</Typography.Text>;
              },
            },
            { title: t("items.task"), render: (_: unknown, r) => (r.task ? <Link to={`/tasks/${r.task_id}`}>#{r.task.task_number} {r.task.title}</Link> : "—") },
            { title: t("stock.by"), render: (_: unknown, r) => (r.created_by_user_id ? users.get(r.created_by_user_id)?.name ?? "—" : "—") },
            { title: t("stock.note"), dataIndex: "note", render: (v: string | null) => v ?? "—" },
          ]}
        />
        {history.hasNextPage && (
          <Button style={{ marginTop: 8 }} loading={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
            {t("stock.loadMore")}
          </Button>
        )}
      </div>
      <StockBookModal open={book} itemId={part.id} onClose={() => setBook(false)} />
      {count && <StockCountModal open itemId={part.id} itemLabel={label} locationId={count.locationId} current={count.current} onClose={() => setCount(null)} />}
      {transfer && <StockTransferModal open itemId={part.id} itemLabel={label} fromId={transfer.locationId} available={transfer.current} onClose={() => setTransfer(null)} />}
    </Space>
  );
};
