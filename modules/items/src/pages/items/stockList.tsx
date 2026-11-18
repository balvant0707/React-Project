// Ported 1:1 from COMPASS (app/src/pages/items/stockList.tsx).
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Space, Switch, Table, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { StockBookModal } from "../../components/stockDialogs";
import { usePermissions } from "@rbp/core";
import { useQuantityText } from "@rbp/module-task-family/src/hooks/useItems.ts";
import { Sparkline } from "@rbp/module-task-family/src/components/sparkline.tsx";
import { useStockHistory, useStockLocations } from "../../hooks/useStock";
import { formatDate } from "@rbp/ui";
import type { ItemStock } from "../../lib/stock";

const PAGE = 50;
const TREND_WEEKS = 12;

// Items kept in stock with their totals, paged on the server. The stock itself comes from the small balance table.
export const StockList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { has } = usePermissions();
  const quantity = useQuantityText();
  const { byId } = useStockLocations();
  const [search, setSearch] = useState("");
  const [params] = useSearchParams();
  const [onlyBelow, setOnlyBelow] = useState(params.get("below") === "1");
  const [page, setPage] = useState(1);
  const [booking, setBooking] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["stock-list", search.trim(), onlyBelow, page],
    queryFn: async () => {
      let q = supabaseClient.from("item_stock_overview").select("*", { count: "exact" }).eq("is_active", true);
      const term = search.trim().replace(/[%_,()"]/g, " ");
      if (term) q = q.or(`item_number.ilike.%${term}%,name.ilike.%${term}%`);
      if (onlyBelow) q = q.eq("below_minimum", true);
      const { data, count, error } = await q.order("item_number").range((page - 1) * PAGE, page * PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as ItemStock[], count: count ?? 0 };
    },
  });
  // One call for the whole page of rows, not one per row.
  const trends = useStockHistory((data?.rows ?? []).map((r) => r.item_id), TREND_WEEKS);
  const canBook = has("stock.edit.all") || has("stock.edit.team");

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center", justifyContent: "space-between" }}>
        <Space wrap>
          <Input.Search allowClear placeholder={t("stock.searchPlaceholder")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ width: 240 }} />
          <span><Switch checked={onlyBelow} onChange={(v) => { setOnlyBelow(v); setPage(1); }} /> {t("stock.onlyBelow")}</span>
        </Space>
        {canBook && <Button onClick={() => setBooking(true)}>{t("stock.bookTitle")}</Button>}
      </div>
      <Table<ItemStock>
        rowKey="item_id"
        size="small"
        loading={isLoading}
        dataSource={data?.rows}
        scroll={{ x: "max-content" }}
        pagination={{ current: page, pageSize: PAGE, total: data?.count ?? 0, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }}
        onRow={(r) => ({ onClick: () => navigate(`/items/${r.item_id}?tab=stock`), style: { cursor: "pointer" } })}
        locale={{ emptyText: t("stock.listEmpty") }}
        columns={[
          { title: t("items.itemNumber"), dataIndex: "item_number", render: (v: string, r) => <Link to={`/items/${r.item_id}?tab=stock`} onClick={(e) => e.stopPropagation()}>{v}</Link> },
          { title: t("fields.name"), dataIndex: "name" },
          {
            title: t("stock.total"),
            align: "right" as const,
            render: (_: unknown, r) => (
              <Space size={6}>
                <Typography.Text strong type={r.below_minimum ? "danger" : undefined}>{r.quantity == null ? "—" : quantity(r.quantity, r.unit_phrase_id)}</Typography.Text>
                {r.below_minimum && <Tag color="red">{t("stock.belowMinimum")}</Tag>}
              </Space>
            ),
          },
          {
            title: t("stock.trend", { weeks: TREND_WEEKS }),
            render: (_: unknown, r) => {
              const points = trends.data?.get(r.item_id);
              return points ? (
                <div style={{ width: 120, marginTop: -6 }}>
                  <Sparkline values={points.map((p) => p.value)} labels={points.map((p) => formatDate(p.day))} label={t("stock.trend", { weeks: TREND_WEEKS })} />
                </div>
              ) : null;
            },
          },
          { title: t("stock.minimum"), align: "right" as const, render: (_: unknown, r) => (r.minimum_stock == null ? "—" : quantity(r.minimum_stock, r.unit_phrase_id)) },
          { title: t("stock.locations"), align: "right" as const, dataIndex: "location_count" },
          { title: t("stock.defaultLocation"), render: (_: unknown, r) => (r.default_stock_location_id ? byId.get(r.default_stock_location_id)?.path ?? "—" : "—") },
        ]}
      />
      <StockBookModal open={booking} onClose={() => setBooking(false)} />
    </>
  );
};
