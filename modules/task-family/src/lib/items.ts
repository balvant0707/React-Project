// Ported 1:1 from COMPASS (app/src/lib/items.ts).
import { supabaseClient } from "@rbp/core";
import type { RemoteOption } from "@rbp/ui";

// Items (~/maintenance_tool/docs/items.md): catalogue (spare parts, consumables, lab supplies ... by category), spare parts lists of
// assets, item lines on tasks. Prices are null for users without costs.view (RLS on item_prices).

export type Supplier = {
  id: string;
  name: string;
  customer_number: string | null;
  erp_supplier_number: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
};

export type CatalogueItem = {
  id: string;
  item_number: string;
  name: string;
  category_phrase_id: string | null;
  description: string | null;
  manufacturer: string | null;
  manufacturer_item_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  erp_supplier_number: string | null;
  unit_phrase_id: string | null;
  erp_item_number: string | null;
  lead_time_days: number | null;
  is_critical: boolean;
  is_active: boolean;
  unit_price: number | null;
  asset_count: number;
  created_at: string;
  photo_attachment_id: string | null;
  // The main photo, else the first image of the item (photo_path the original, photo_thumbnail_path the small copy).
  photo_path: string | null;
  photo_thumbnail_path: string | null;
  // Stock settings (items table; not part of the overview view).
  stock_managed?: boolean;
  minimum_stock?: number | string | null;
  reorder_quantity?: number | string | null;
  default_stock_location_id?: string | null;
};

export type AssetItem = {
  asset_id: string;
  item_id: string;
  quantity_installed: number;
  position_note: string | null;
  asset_name: string;
  asset_path: string;
  item_number: string;
  item_name: string;
  manufacturer: string | null;
  manufacturer_item_number: string | null;
  category_phrase_id: string | null;
  unit_phrase_id: string | null;
  lead_time_days: number | null;
  is_critical: boolean;
  is_active: boolean;
  supplier_name: string | null;
  photo_path: string | null;
  photo_thumbnail_path: string | null;
};

// What a task type does with items (task_types.item_mode).
export const ITEM_MODES = ["none", "use", "order"] as const;
export type ItemMode = (typeof ITEM_MODES)[number];

// Platform: exported (the platform lint refuses a value only used as a type).
export const TASK_ITEM_STATES = ["planned", "needed", "used"] as const;
type TaskItemState = (typeof TASK_ITEM_STATES)[number];

// A line on a task: a catalogue item (item_id) or free text (description). unit_phrase_id / supplier_id are the line's
// own values, else the item's; line_* are the line's own values only (for editing).
export type TaskItem = {
  id: string;
  task_id: string;
  item_id: string | null;
  description: string | null;
  quantity: number;
  state: TaskItemState;
  note: string | null;
  purchase_task_id: string | null;
  arrived_at: string | null;
  created_at: string;
  line_unit_phrase_id: string | null;
  line_supplier_id: string | null;
  unit_phrase_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  erp_supplier_number: string | null;
  item_number: string | null;
  item_name: string;
  manufacturer: string | null;
  manufacturer_item_number: string | null;
  erp_item_number: string | null;
  category_phrase_id: string | null;
  lead_time_days: number | null;
  is_critical: boolean;
  unit_price: number | null;
  task_number: number | null;
  task_title: string | null;
  purchase_task_number: number | null;
  purchase_task_status: string | null;
  photo_thumbnail_path: string | null;
};

// Where a needed line stands: not ordered yet, ordered (order open) or arrived.
type OrderStage = "missing" | "ordered" | "arrived";
export const orderStage = (l: Pick<TaskItem, "purchase_task_id" | "arrived_at">): OrderStage =>
  l.arrived_at ? "arrived" : l.purchase_task_id ? "ordered" : "missing";

// "ET-1001 · Bearing" for catalogue items, the text alone for free-text lines.
export const itemLabel = (p: { item_number?: string | null; name?: string; item_name?: string }) => {
  const name = p.name ?? p.item_name ?? "";
  return p.item_number ? `${p.item_number} · ${name}` : name;
};

export const fetchSuppliers = async () =>
  ((await supabaseClient.from("suppliers").select("id, name, customer_number, erp_supplier_number, email, phone, website, notes, is_active").order("name")).data ?? []) as Supplier[];

// Server-side search for item pickers: number, manufacturer number, ERP number or name; active items only, optionally
// only of some categories (what a task type offers).
export const searchItems = async (term: string, categoryIds?: string[]): Promise<RemoteOption[]> => {
  const like = `%${term.replace(/[%_,()"]/g, " ").trim()}%`;
  let q = supabaseClient
    .from("items_overview")
    .select("id, item_number, name, photo_thumbnail_path")
    .eq("is_active", true)
    .or(`item_number.ilike.${like},name.ilike.${like},manufacturer_item_number.ilike.${like},erp_item_number.ilike.${like}`);
  if (categoryIds?.length) q = q.in("category_phrase_id", categoryIds);
  const { data } = await q.order("item_number").limit(30);
  return (data ?? []).map((p) => ({ value: p.id, label: itemLabel(p), thumb: p.photo_thumbnail_path as string | null }));
};

export const itemLabels = async (ids: string[]): Promise<RemoteOption[]> => {
  const { data } = await supabaseClient.from("items").select("id, item_number, name").in("id", ids);
  return (data ?? []).map((p) => ({ value: p.id, label: itemLabel(p) }));
};

export const fetchTaskItems = async (taskId: string) =>
  ((await supabaseClient.from("task_items_overview").select("*").eq("task_id", taskId).order("created_at")).data ?? []) as TaskItem[];

// Everything an order orders: its own lines and the lines of the task it was started from.
export const fetchOrderedItems = async (purchaseTaskId: string) =>
  ((await supabaseClient.from("task_items_overview").select("*").eq("purchase_task_id", purchaseTaskId).order("created_at")).data ?? []) as TaskItem[];

export const fetchAssetItems = async (assetId: string, subtree: boolean) => {
  const { data, error } = await supabaseClient.rpc("asset_items_for", { p_asset_id: assetId, p_subtree: subtree });
  if (error) throw error;
  return ((data ?? []) as AssetItem[]).map((r) => ({ ...r, quantity_installed: Number(r.quantity_installed) }));
};

// The categories a task type offers (task_type_item_categories); empty = all.
export const fetchTypeItemCategories = async (taskTypeId: string) =>
  ((await supabaseClient.from("task_type_item_categories").select("category_phrase_id").eq("task_type_id", taskTypeId)).data ?? []).map(
    (r) => r.category_phrase_id as string,
  );

// "3 Pakete Toilettenpapier" → quantity 3, unit "Pakete" if it names a unit, text "Toilettenpapier". A leading number
// is the quantity (comma or point), a following word that matches a unit (code, German or English text, also plural
// with -e/-en/-s) the unit; the rest is the text.
export const parseQuickLine = (input: string, units: { id: string; code: string | null; text_de: string | null; text_en: string }[]) => {
  const text = input.trim();
  const m = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\s+)?(.*)$/i);
  let quantity = 1;
  let rest = text;
  if (m) {
    quantity = Number(m[1].replace(",", ".")) || 1;
    rest = m[2].trim();
  }
  let unitId: string | null = null;
  const [first, ...others] = rest.split(/\s+/);
  if (first && others.length) {
    const word = first.toLowerCase().replace(/\.$/, "");
    const hit = units.find((u) =>
      [u.code, u.text_de, u.text_en]
        .filter(Boolean)
        .map((x) => x!.toLowerCase())
        .some((x) => word === x || word === `${x}e` || word === `${x}en` || word === `${x}s` || word === `${x}n`),
    );
    if (hit) {
      unitId = hit.id;
      rest = others.join(" ");
    }
  }
  return { quantity, unitId, description: rest };
};

// Tab-separated lines for the ERP (paste into the ERP order or Excel): supplier ERP number, supplier, ERP item number,
// item number, description, quantity, unit, unit price, for task, note.
export const erpRows = (lines: TaskItem[], unit: (id: string | null) => string, header: string[]) => {
  // A cell starting with = + - @ would run as a formula in Excel (free text comes from many users): a leading ' makes it text.
  const clean = (v: unknown) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim().replace(/^(?=[=+\-@])/, "'");
  const rows = lines.map((l) => [
    l.erp_supplier_number,
    l.supplier_name,
    l.erp_item_number,
    l.item_number,
    [l.item_name, l.manufacturer, l.manufacturer_item_number].filter(Boolean).join(" · "),
    Number(l.quantity).toLocaleString("de-DE"),
    unit(l.unit_phrase_id),
    l.unit_price == null ? "" : Number(l.unit_price).toLocaleString("de-DE", { minimumFractionDigits: 2 }),
    l.task_number && l.task_id !== l.purchase_task_id ? `#${l.task_number}` : "",
    l.note,
  ]);
  return [header, ...rows].map((r) => r.map(clean).join("\t")).join("\n");
};
