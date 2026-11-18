// Ported 1:1 from COMPASS (app/src/pages/items/index.tsx).
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Select, Switch, Table, Tabs, Tag, Tooltip } from "antd";
import { PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { Page } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { useCategoryText, useQuantityText, useSuppliers } from "@rbp/module-task-family/src/hooks/useItems.ts";
import { usePhrases, usePhraseText } from "@rbp/core";
import { formatMoney } from "@rbp/module-task-family/src/lib/money.ts";
import type { CatalogueItem } from "@rbp/module-task-family/src/lib/items.ts";
import { ItemFormModal } from "./itemForm";
import { ItemThumb } from "@rbp/module-task-family/src/components/itemPhoto.tsx";
import { SupplierList } from "./suppliers";
import { StockList } from "./stockList";
import { ItemNumbers } from "@rbp/module-task-family/src/pages/dashboard/widgets.tsx";
import { LocationList } from "./locations";

const PAGE = 50;

// The catalogue is paged on the server: it can grow far beyond what a browser should load at once.
const Catalogue = ({ canEdit }: { canEdit: boolean }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { has } = usePermissions();
  const { data: suppliers } = useSuppliers();
  const quantity = useQuantityText();
  const categoryText = useCategoryText();
  const phraseText = usePhraseText();
  const { data: categories } = usePhrases("item_category");
  const [category, setCategory] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState<string | undefined>();
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["items", "list", search.trim(), supplier ?? null, category ?? null, onlyCritical, showInactive, page],
    queryFn: async () => {
      let q = supabaseClient.from("items_overview").select("*", { count: "exact" });
      const term = search.trim().replace(/[%_,()"]/g, " ");
      if (term) q = q.or(`item_number.ilike.%${term}%,name.ilike.%${term}%,manufacturer.ilike.%${term}%,manufacturer_item_number.ilike.%${term}%,erp_item_number.ilike.%${term}%`);
      if (supplier) q = q.eq("supplier_id", supplier);
      if (category) q = q.eq("category_phrase_id", category);
      if (onlyCritical) q = q.eq("is_critical", true);
      if (!showInactive) q = q.eq("is_active", true);
      const { data, count, error } = await q.order("item_number").range((page - 1) * PAGE, page * PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as CatalogueItem[], count: count ?? 0 };
    },
  });

  const reset = () => setPage(1);
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Input.Search allowClear placeholder={t("items.searchPlaceholder")} value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} style={{ width: 260 }} />
          <Select allowClear placeholder={t("items.category")} value={category} onChange={(v) => { setCategory(v); reset(); }} style={{ minWidth: 170 }} options={(categories ?? []).map((c) => ({ value: c.id, label: phraseText(c) }))} />
          <Select allowClear showSearch optionFilterProp="label" placeholder={t("items.supplier")} value={supplier} onChange={(v) => { setSupplier(v); reset(); }} style={{ minWidth: 200 }} options={(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          <span><Switch checked={onlyCritical} onChange={(v) => { setOnlyCritical(v); reset(); }} /> {t("items.onlyCritical")}</span>
          <span><Switch checked={showInactive} onChange={(v) => { setShowInactive(v); reset(); }} /> {t("items.showInactive")}</span>
        </div>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>{t("items.new")}</Button>}
      </div>
      <Table<CatalogueItem>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data?.rows}
        scroll={{ x: "max-content" }}
        pagination={{ current: page, pageSize: PAGE, total: data?.count ?? 0, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }}
        onRow={(r) => ({ onClick: () => navigate(`/items/${r.id}`), style: { cursor: "pointer" } })}
        columns={[
          { title: "", width: 48, render: (_: unknown, r) => <ItemThumb path={r.photo_thumbnail_path} previewPath={r.photo_path} size={36} preview /> },
          { title: t("items.itemNumber"), dataIndex: "item_number", render: (v: string, r) => <Link to={`/items/${r.id}`} onClick={(e) => e.stopPropagation()}>{v}</Link> },
          {
            title: t("fields.name"),
            render: (_: unknown, r) => (
              <>
                {r.name}
                {r.is_critical && <Tooltip title={t("items.criticalHint")}><Tag color="red" icon={<WarningOutlined />} style={{ marginLeft: 8 }}>{t("items.critical")}</Tag></Tooltip>}
                {!r.is_active && <Tag style={{ marginLeft: 8 }}>{t("items.inactive")}</Tag>}
              </>
            ),
          },
          { title: t("items.category"), render: (_: unknown, r) => categoryText(r.category_phrase_id) || "—" },
          { title: t("items.manufacturer"), render: (_: unknown, r) => [r.manufacturer, r.manufacturer_item_number].filter(Boolean).join(" · ") || "—" },
          { title: t("items.supplier"), dataIndex: "supplier_name", render: (v: string | null) => v ?? "—" },
          { title: t("items.leadTime"), dataIndex: "lead_time_days", render: (v: number | null) => (v == null ? "—" : t("items.daysCount", { count: v })) },
          ...(has("costs.view") ? [{ title: t("items.unitPrice"), align: "right" as const, render: (_: unknown, r: CatalogueItem) => (r.unit_price == null ? "—" : `${formatMoney(r.unit_price, i18n.language)} / ${quantity(1, r.unit_phrase_id)}`) }] : []),
          { title: t("items.usedInAssets"), dataIndex: "asset_count", align: "right" as const },
        ]}
      />
      <ItemFormModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/items/${id}`)} />
    </>
  );
};

export const ItemsPage = () => {
  const { t } = useTranslation();
  const { has } = usePermissions();
  const [params, setParams] = useSearchParams();
  const requested = params.get("view");
  const canSeeStock = has("stock.view");
  const view = requested === "suppliers" ? "suppliers" : canSeeStock && (requested === "stock" || requested === "locations") ? requested : "catalogue";
  const canEdit = has("items.edit");
  return (
    <Page title={t("items.title")}>
      <ItemNumbers />
      <Tabs
        activeKey={view}
        onChange={(key) => setParams(key === "catalogue" ? {} : { view: key }, { replace: true })}
        items={[
          { key: "catalogue", label: t("items.catalogue"), children: <Catalogue canEdit={canEdit} /> },
          ...(canSeeStock
            ? [
                { key: "stock", label: t("stock.title"), children: <StockList /> },
                { key: "locations", label: t("stock.locations"), children: <LocationList /> },
              ]
            : []),
          { key: "suppliers", label: t("items.suppliers"), children: <SupplierList canEdit={canEdit || has("costs.edit")} canDelete={canEdit} /> },
        ]}
      />
    </Page>
  );
};
