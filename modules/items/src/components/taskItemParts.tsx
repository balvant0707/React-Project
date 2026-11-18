// Ported 1:1 from COMPASS (app/src/components/taskItemParts.tsx).
import { useEffect, useMemo, useState } from "react";
import { App as AntdApp, Button, Checkbox, Empty, Input, InputNumber, Modal, Space, Typography } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { ItemSelect } from "@rbp/module-task-family/src/components/itemSelect.tsx";
import { ItemThumb } from "@rbp/module-task-family/src/components/itemPhoto.tsx";
import { useUnitText } from "@rbp/module-task-family/src/hooks/useItems.ts";
import { StockPickRow, picksInvalid } from "./stockPickRow";
import { useItemBalances } from "../hooks/useStock";
import type { ItemStock, StockPick } from "../lib/stock";
import { fetchAssetItems, fetchOrderedItems, fetchTaskItems, itemLabel, type ItemMode } from "@rbp/module-task-family/src/lib/items.ts";
import { errorText } from "@rbp/core";

export const useLines = (taskId: string, mode: ItemMode) =>
  useQuery({ queryKey: ["task-items", taskId, mode], queryFn: () => (mode === "order" ? fetchOrderedItems(taskId) : fetchTaskItems(taskId)) });

// Database messages a user can act on.
export const ITEM_ERRORS: Record<string, string> = {
  "This task type does not offer items of this category": "items.errors.category",
  "This task type does not use items": "items.errors.typeNone",
};

type PickerOption = { value: string; label: string; name: string; number: string; thumb: string | null; position: string | null };

// Picker that offers the asset's spare parts list as photo tiles (people know a part by its look) and switches to the
// catalogue search on demand.
export const ItemPicker = ({
  value,
  onChange,
  assetOptions,
  categoryIds,
}: {
  value?: string;
  onChange?: (id: string) => void;
  assetOptions: PickerOption[];
  categoryIds?: string[];
}) => {
  const { t } = useTranslation();
  const [catalogue, setCatalogue] = useState(false);
  const [filter, setFilter] = useState("");
  if (catalogue) return <ItemSelect autoFocus value={value} onChange={onChange} categoryIds={categoryIds} />;
  const term = filter.trim().toLowerCase();
  const shown = term ? assetOptions.filter((o) => `${o.label} ${o.position ?? ""}`.toLowerCase().includes(term)) : assetOptions;
  return (
    <div>
      {assetOptions.length > 6 && (
        <Input.Search allowClear size="small" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("items.fromAssetList")} style={{ marginBottom: 8 }} />
      )}
      <div role="listbox" aria-label={t("items.fromAssetList")} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))", gap: 8, maxHeight: 340, overflowY: "auto", padding: 2 }}>
        {shown.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={selected}
              title={o.label}
              onClick={() => onChange?.(o.value)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 4,
                textAlign: "left",
                cursor: "pointer",
                background: "transparent",
                color: "inherit",
                font: "inherit",
                borderRadius: 6,
                border: selected ? "2px solid var(--ant-color-primary, #1677ff)" : "1px solid var(--ant-color-border, rgba(127,127,127,0.3))",
              }}
            >
              <div style={{ width: "100%", aspectRatio: "4 / 3" }}>
                <ItemThumb path={o.thumb} size="100%" />
              </div>
              <span style={{ fontSize: 12, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{o.name}</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>{o.number}</span>
            </button>
          );
        })}
      </div>
      <Button type="link" size="small" style={{ paddingInline: 0, marginTop: 4 }} onClick={() => setCatalogue(true)}>
        {t("items.searchCatalogue")}
      </Button>
    </div>
  );
};

type UsageRow = { key: string; lineId?: string; itemId: string | null; label: string; thumb: string | null; quantity: number; unitPhraseId: string | null; checked: boolean; picks?: StockPick[] };

// Asked when a task is completed: which items were used? Open lines (planned, arrived or missing) and the asset's
// spare parts list are offered; the ticked ones are saved as used. Skippable like the hours question.
export const ItemUsageModal = ({
  open,
  task,
  onSkip,
  onSaved,
}: {
  open: boolean;
  task: { id: string; asset_id: string | null };
  onSkip: () => void;
  onSaved: () => void;
}) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const unit = useUnitText();
  const { data: lines } = useLines(task.id, "use");
  const { data: assetItems } = useQuery({
    queryKey: ["asset-items", task.asset_id, false],
    enabled: open && !!task.asset_id,
    queryFn: () => fetchAssetItems(task.asset_id!, false),
  });
  const initial = useMemo<UsageRow[]>(() => {
    const open_ = (lines ?? []).filter((l) => l.state !== "used");
    const onTask = new Set((lines ?? []).map((l) => l.item_id).filter(Boolean));
    return [
      ...open_.map((l) => ({
        key: l.id, lineId: l.id, itemId: l.item_id, label: itemLabel(l), thumb: l.photo_thumbnail_path, quantity: Number(l.quantity), unitPhraseId: l.unit_phrase_id,
        // Planned items and items that arrived are most likely installed now.
        checked: l.state === "planned" || !!l.arrived_at,
      })),
      ...(assetItems ?? [])
        .filter((p) => p.is_active && !onTask.has(p.item_id))
        .map((p) => ({ key: `asset-${p.item_id}`, itemId: p.item_id, label: itemLabel(p), thumb: p.photo_thumbnail_path, quantity: 1, unitPhraseId: p.unit_phrase_id, checked: false })),
    ];
  }, [lines, assetItems]);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [saving, setSaving] = useState(false);
  // Items of the rows that are kept in stock: where the parts can come from.
  const itemIds = useMemo(() => [...new Set(initial.map((r) => r.itemId).filter((x): x is string => !!x))], [initial]);
  const { data: stocks } = useQuery({
    queryKey: ["stock-list", "usage", itemIds.join(",")],
    enabled: open && itemIds.length > 0,
    queryFn: async () => ((await supabaseClient.from("item_stock_overview").select("*").in("item_id", itemIds)).data ?? []) as ItemStock[],
  });
  const managedIds = (stocks ?? []).map((s) => s.item_id);
  const { data: balances } = useItemBalances(managedIds, open);
  useEffect(() => {
    if (open) setRows(initial);
  }, [open, initial]);

  const save = async () => {
    setSaving(true);
    try {
      // One call, one transaction: either every ticked row is saved or none.
      const { error } = await supabaseClient.rpc("task_items_save_used", {
        p_task_id: task.id,
        p_lines: rows.filter((x) => x.checked).map((r) => ({ line_id: r.lineId ?? null, item_id: r.itemId, quantity: r.quantity, picks: r.picks?.map((p) => ({ location_id: p.location_id, quantity: p.quantity })) ?? null })),
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["task-items", task.id] });
      onSaved();
    } catch (e: any) {
      message.error(errorText(e, { known: ITEM_ERRORS }));
    } finally {
      setSaving(false);
    }
  };

  // Another quantity drops a split the person made: it would no longer add up.
  const set = (key: string, patch: Partial<UsageRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...("quantity" in patch ? { picks: undefined } : {}), ...patch } : r)));
  const stockOf = (itemId: string | null) => (itemId ? (stocks ?? []).find((s) => s.item_id === itemId) : undefined);
  const invalid = rows.some((r) => r.checked && picksInvalid(r.picks, r.quantity));

  return (
    <Modal
      open={open}
      title={t("items.usageTitle")}
      onCancel={onSkip}
      destroyOnClose
      footer={[
        <Button key="skip" onClick={onSkip}>{t("effort.skip")}</Button>,
        <Button key="save" type="primary" loading={saving} disabled={!rows.some((r) => r.checked) || invalid} onClick={() => void save()}>
          {t("effort.saveAndComplete")}
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary">{t("items.usageHint")}</Typography.Paragraph>
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }}>
          {rows.map((r) => (
            <div key={r.key}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <Checkbox checked={r.checked} onChange={(e) => set(r.key, { checked: e.target.checked })} style={{ alignItems: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {r.itemId && <ItemThumb path={r.thumb} size={36} />}
                  <span>{r.label}</span>
                </span>
                {!r.lineId && <Typography.Text type="secondary"> · {t("items.fromAssetListShort")}</Typography.Text>}
              </Checkbox>
              <Space size={4}>
                <InputNumber size="small" min={0.01} value={r.quantity} onChange={(v) => set(r.key, { quantity: Number(v ?? 1), checked: true })} style={{ width: 80 }} />
                <Typography.Text type="secondary" style={{ minWidth: 48, whiteSpace: "nowrap" }}>{unit(r.unitPhraseId)}</Typography.Text>
              </Space>
            </div>
            {r.checked && stockOf(r.itemId) && (
              <StockPickRow
                quantity={r.quantity}
                stock={stockOf(r.itemId)!}
                balances={(balances ?? []).filter((b) => b.item_id === r.itemId)}
                picks={r.picks}
                onChange={(picks) => set(r.key, { picks })}
              />
            )}
            </div>
          ))}
        </Space>
      )}
    </Modal>
  );
};

// True when the completion should ask for used items: open lines exist or the asset has a spare parts list.
export const useNeedsItemUsage = (task: { id: string; asset_id: string | null } | undefined, enabled: boolean) => {
  const { data: lines } = useQuery({ queryKey: ["task-items", task?.id, "use"], enabled: !!task && enabled, queryFn: () => fetchTaskItems(task!.id) });
  const { data: assetItems } = useQuery({
    queryKey: ["asset-items", task?.asset_id, false],
    enabled: !!task?.asset_id && enabled,
    queryFn: () => fetchAssetItems(task!.asset_id!, false),
  });
  return enabled && ((lines ?? []).some((l) => l.state !== "used") || ((assetItems ?? []).length > 0 && !(lines ?? []).some((l) => l.state === "used")));
};
