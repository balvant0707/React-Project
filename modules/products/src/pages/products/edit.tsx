// Ported 1:1 from the NPM tool (app/src/pages/products/edit.tsx).
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCanAccess as useCan} from "@rbp/core";
import { Show } from "@rbp/core";
import { usePageBannerTitle } from "@rbp/core";
import {
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Checkbox,
  Row,
  Col,
  Card,
  Table,
  Button,
  Popconfirm,
  Spin,
  Typography,
  App as AntdApp,
} from "antd";
import { PlusOutlined, DeleteOutlined, CopyOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { loadPhraseOptions, type PhraseOption as Option } from "@rbp/core";
import { loadCompanyOptions } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { searchProductOptions, loadProductOptionsByIds } from "../../modules/products/packagings";
import { RemoteSelect } from "@rbp/ui";
import { newRowKey } from "@rbp/ui";
import { selectInChunks } from "@rbp/ui";
import { clearedToNull } from "@rbp/ui";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-products/src/fieldLabels.ts";
import { errorText } from "@rbp/core";

const L = (field: keyof typeof FIELD_LABELS.products) => fieldLabel("products", field);

type PackagingRow = {
  key: string;
  id: string | null;
  supplier_id: string | null;
  pack_size: number | null;
  unit: string;
  supplier_key: string;
  cost_price: number | null;
  // null = the supplier company's own country (the usual 1:1 case)
  supply_country_id: string | null;
};

// Mix ratio and overcoating-interval rows are both supplier-specific in the
// database (one row per supplier), but several suppliers very often share
// the exact same ratio/interval numbers - confirmed by the user, who wants
// to enter that once, not once per supplier. So the UI groups flat DB rows
// that share every field except supplier_id into a single row with a
// multi-select "Suppliers" column; saving expands each UI row back into one
// DB row per selected supplier (see groupMixRows/groupOvercoatingRows below
// and the flatMap calls in save()). To give one supplier a different number,
// duplicate the row (CopyOutlined button), remove that supplier from the
// original row's Suppliers list, and edit the copy.
type MixComponentRow = {
  key: string;
  component_product_id: string | null;
  type: "base" | "hardener";
  parts_volumetric: number | null;
  parts_gravimetric: number | null;
  supplierIds: string[];
};

// One row per (product pair, DFT band, temperature) - matches
// product_overcoating_intervals directly, see the migration for why (the
// interval depends on all three, plus supplier, not on one product alone).
//
// `otherProductId` only applies to the "overcoat" table below (the
// underlying product this page's product can be applied over); the
// "undocking" table has no other product - product_id is always this page's
// product there, so the column doesn't apply and isn't shown.
type OvercoatingIntervalRow = {
  key: string;
  otherProductId: string | null;
  dry_film_thickness_minimum_um: number | null;
  dry_film_thickness_maximum_um: number | null;
  temperature_celsius: number | null;
  minimum_value: number | null;
  minimum_unit: string | null;
  maximum_value: number | null;
  maximum_unit: string | null;
  no_maximum: boolean;
  interval_text_override: string | null;
  supplierIds: string[];
};

// Mirrors the DB's own composite key for each table (product_mix_components'
// PK, product_overcoating_intervals_unique_key) so a collision that would
// otherwise only surface as a mid-save unique-violation - AFTER save()'s
// delete-then-insert has already deleted the existing rows, see the
// migration comments - is caught up front instead, before anything is
// written.
const findDuplicateMixKey = (rows: MixComponentRow[]): boolean => {
  const seen = new Set<string>();
  for (const r of rows) {
    for (const supplierId of r.supplierIds) {
      const key = `${r.component_product_id}|${supplierId}`;
      if (seen.has(key)) return true;
      seen.add(key);
    }
  }
  return false;
};

const findDuplicateIntervalKey = (rows: OvercoatingIntervalRow[]): boolean => {
  const seen = new Set<string>();
  for (const r of rows) {
    for (const supplierId of r.supplierIds) {
      const key = [
        r.otherProductId,
        r.dry_film_thickness_minimum_um ?? -1,
        r.dry_film_thickness_maximum_um ?? -1,
        r.temperature_celsius,
        supplierId,
      ].join("|");
      if (seen.has(key)) return true;
      seen.add(key);
    }
  }
  return false;
};

// Admin-managed DFT proposal inputs (product_coefficients, 1:1 with the
// product) - see ~/npm_tool/docs/domain-model.md "DFT proposal calculation". Only the
// coefficient_curves resource's admins may see or change this section; an
// all-empty section means no row, i.e. this product gets no DFT proposal.
type CoefficientsForm = {
  polishing_rate: number | null;
  speed_curve_id: string | null;
  temperature_curve_id: string | null;
  max_service_life_months: number | null;
  flat_bottom_derate_pct: number | null;
  boottop_derate_pct: number | null;
  minimum_dft_um: number | null;
  maximum_dft_per_coat_um: number | null;
  anchoring_dft_um: number | null;
  anchoring_sea_days_threshold: number | null;
};
const blankCoefficients = (): CoefficientsForm => ({
  polishing_rate: null,
  speed_curve_id: null,
  temperature_curve_id: null,
  max_service_life_months: null,
  flat_bottom_derate_pct: null,
  boottop_derate_pct: null,
  minimum_dft_um: null,
  maximum_dft_per_coat_um: null,
  anchoring_dft_um: null,
  anchoring_sea_days_threshold: null,
});
const LC = (field: keyof typeof FIELD_LABELS.product_coefficients) => fieldLabel("product_coefficients", field);

const newKey = () => newRowKey("product-row");
const blankMixComponent = (): MixComponentRow => ({
  key: newKey(),
  component_product_id: null,
  type: "base",
  parts_volumetric: null,
  parts_gravimetric: null,
  supplierIds: [],
});
const blankOvercoatingRow = (): OvercoatingIntervalRow => ({
  key: newKey(),
  otherProductId: null,
  dry_film_thickness_minimum_um: null,
  dry_film_thickness_maximum_um: null,
  temperature_celsius: null,
  minimum_value: null,
  minimum_unit: null,
  maximum_value: null,
  maximum_unit: null,
  no_maximum: false,
  interval_text_override: null,
  supplierIds: [],
});

// Collapses flat product_mix_components rows (one per supplier) into grouped
// UI rows (one per distinct component/type/ratio combination, carrying every
// supplier that shares it) - see the type comment on MixComponentRow above.
const groupMixRows = (rows: any[]): MixComponentRow[] => {
  const groups = new Map<string, MixComponentRow>();
  for (const r of rows) {
    const groupKey = [r.component_product_id, r.type, r.parts_volumetric, r.parts_gravimetric].join("|");
    const existing = groups.get(groupKey);
    if (existing) existing.supplierIds.push(r.supplier_id);
    else
      groups.set(groupKey, {
        key: groupKey,
        component_product_id: r.component_product_id,
        type: r.type,
        parts_volumetric: r.parts_volumetric,
        parts_gravimetric: r.parts_gravimetric,
        supplierIds: [r.supplier_id],
      });
  }
  return [...groups.values()];
};

// Same grouping idea as groupMixRows, for product_overcoating_intervals
// rows - shared by both the "as topcoat" and "undocking" tables below.
const groupOvercoatingRows = (rows: any[]): OvercoatingIntervalRow[] => {
  const groups = new Map<string, OvercoatingIntervalRow>();
  for (const r of rows) {
    const groupKey = [
      r.product_id,
      r.dry_film_thickness_minimum_um,
      r.dry_film_thickness_maximum_um,
      r.temperature_celsius,
      r.minimum_value,
      r.minimum_unit,
      r.maximum_value,
      r.maximum_unit,
      r.no_maximum,
      r.interval_text_override,
    ].join("|");
    const existing = groups.get(groupKey);
    if (existing) existing.supplierIds.push(r.supplier_id);
    else
      groups.set(groupKey, {
        key: groupKey,
        otherProductId: r.product_id,
        dry_film_thickness_minimum_um: r.dry_film_thickness_minimum_um,
        dry_film_thickness_maximum_um: r.dry_film_thickness_maximum_um,
        temperature_celsius: r.temperature_celsius,
        minimum_value: r.minimum_value,
        minimum_unit: r.minimum_unit,
        maximum_value: r.maximum_value,
        maximum_unit: r.maximum_unit,
        no_maximum: r.no_maximum,
        interval_text_override: r.interval_text_override,
        supplierIds: [r.supplier_id],
      });
  }
  return [...groups.values()];
};

// Shared "Suppliers" multi-select column - identical on the Mix Components,
// "as topcoat", and "undocking" tables.
const suppliersColumn = <T extends { key: string; supplierIds: string[] }>(
  updateFn: (key: string, patch: Partial<T>) => void,
  supplierOptions: Option[],
) => (
  <Table.Column<T>
    key="suppliers"
    title="Suppliers"
    width={220}
    render={(_: unknown, record: T) => (
      <Select
        mode="multiple"
        value={record.supplierIds}
        options={supplierOptions}
        onChange={(v) => updateFn(record.key, { supplierIds: v } as Partial<T>)}
        style={{ width: "100%" }}
        showSearch
        optionFilterProp="label"
        maxTagCount={2}
        placeholder="Select suppliers"
      />
    )}
  />
);

// Shared between the "as topcoat" and "undocking" tables on the product
// edit page - identical columns except "Applied over" (only the former has
// another product to pick) and Suppliers (added by the caller, since it
// needs supplierOptions in scope).
const overcoatingIntervalColumns = (updateFn: (key: string, patch: Partial<OvercoatingIntervalRow>) => void) => [
  <Table.Column
    key="dft"
    title="DFT range (µm)"
    width={150}
    render={(_: unknown, record: OvercoatingIntervalRow) => (
      <Input.Group compact>
        <InputNumber
          value={record.dry_film_thickness_minimum_um}
          onChange={(v) => updateFn(record.key, { dry_film_thickness_minimum_um: v })}
          style={{ width: "50%" }}
          placeholder="min"
        />
        <InputNumber
          value={record.dry_film_thickness_maximum_um}
          onChange={(v) => updateFn(record.key, { dry_film_thickness_maximum_um: v })}
          style={{ width: "50%" }}
          placeholder="max"
        />
      </Input.Group>
    )}
  />,
  <Table.Column
    key="temperature"
    title="Temp (°C)"
    width={90}
    render={(_: unknown, record: OvercoatingIntervalRow) => (
      <InputNumber value={record.temperature_celsius} onChange={(v) => updateFn(record.key, { temperature_celsius: v })} style={{ width: "100%" }} />
    )}
  />,
  <Table.Column
    key="minimum"
    title="Min"
    width={140}
    render={(_: unknown, record: OvercoatingIntervalRow) => (
      <Input.Group compact>
        <InputNumber value={record.minimum_value} onChange={(v) => updateFn(record.key, { minimum_value: v })} style={{ width: "60%" }} placeholder="value" />
        <Input value={record.minimum_unit ?? ""} onChange={(e) => updateFn(record.key, { minimum_unit: e.target.value })} style={{ width: "40%" }} placeholder="h/d" />
      </Input.Group>
    )}
  />,
  <Table.Column
    key="maximum"
    title="Max"
    width={140}
    render={(_: unknown, record: OvercoatingIntervalRow) => (
      <Input.Group compact>
        <InputNumber
          value={record.maximum_value}
          onChange={(v) => updateFn(record.key, { maximum_value: v })}
          style={{ width: "60%" }}
          placeholder="value"
          disabled={record.no_maximum}
        />
        <Input
          value={record.maximum_unit ?? ""}
          onChange={(e) => updateFn(record.key, { maximum_unit: e.target.value })}
          style={{ width: "40%" }}
          placeholder="h/d"
          disabled={record.no_maximum}
        />
      </Input.Group>
    )}
  />,
  <Table.Column
    key="noMaximum"
    title="No max"
    width={70}
    align="center"
    render={(_: unknown, record: OvercoatingIntervalRow) => (
      <Checkbox checked={record.no_maximum} onChange={(e) => updateFn(record.key, { no_maximum: e.target.checked })} />
    )}
  />,
  <Table.Column
    key="note"
    title="Note"
    width={160}
    render={(_: unknown, record: OvercoatingIntervalRow) => (
      <Input
        value={record.interval_text_override ?? ""}
        onChange={(e) => updateFn(record.key, { interval_text_override: e.target.value })}
        placeholder="only if the phrase can't be derived"
      />
    )}
  />,
];

export const ProductEdit = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const isMix = Form.useWatch("is_mix", form);
  const { data: canManageCoefficients } = useCan({ resource: "coefficient_curves", action: "edit" });

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<Option[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<Option[]>([]);
  const [groupOptions, setGroupOptions] = useState<Option[]>([]);
  const [packagings, setPackagings] = useState<PackagingRow[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  // supplier company id -> its own country id, shown as the supply country default
  const [supplierCountryId, setSupplierCountryId] = useState<Record<string, string | null>>({});
  const [mixComponents, setMixComponents] = useState<MixComponentRow[]>([]);
  // "As the topcoat over ..." - edited on THIS product's page because this
  // product is the overcoated_with_product_id, per the confirmed rule (an
  // overcoating interval is edited on the topcoat's page, not the base
  // coat's).
  const [overcoatRows, setOvercoatRows] = useState<OvercoatingIntervalRow[]>([]);
  // "Undocking (as the final coat)" - product_id is always this product,
  // there's no other page for these rows to live on.
  const [undockingRows, setUndockingRows] = useState<OvercoatingIntervalRow[]>([]);
  const [coefficients, setCoefficients] = useState<CoefficientsForm>(blankCoefficients());
  const [speedCurveOptions, setSpeedCurveOptions] = useState<Option[]>([]);
  const [temperatureCurveOptions, setTemperatureCurveOptions] = useState<Option[]>([]);
  const patchCoefficients = (patch: Partial<CoefficientsForm>) => setCoefficients((c) => ({ ...c, ...patch }));

  const load = async () => {
    const [suppliers, categories, groups] = await Promise.all([
      loadCompanyOptions("supplier"),
      loadPhraseOptions("product_category"),
      loadPhraseOptions("product_group"),
    ]);
    setSupplierOptions(suppliers);
    const [{ data: countryRows }, supplierRows] = await Promise.all([
      supabaseClient.from("countries").select("id, name_en").order("name_en"),
      selectInChunks<{ id: string; country_id: string | null }>(
        suppliers.map((o) => o.value),
        (chunk) => supabaseClient.from("companies").select("id, country_id").in("id", chunk),
      ),
    ]);
    setCountryOptions((countryRows ?? []).map((c: any) => ({ value: c.id, label: c.name_en })));
    setSupplierCountryId(Object.fromEntries(supplierRows.map((r) => [r.id, r.country_id])));
    setCategoryOptions(categories);
    setGroupOptions(groups);

    const { data: curves } = await supabaseClient.from("coefficient_curves").select("id, kind, name, companies(name)").order("name");
    const curveOption = (c: any): Option => ({ value: c.id, label: c.companies?.name ? `${c.name} (${c.companies.name})` : c.name });
    setSpeedCurveOptions((curves ?? []).filter((c) => c.kind === "speed").map(curveOption));
    setTemperatureCurveOptions((curves ?? []).filter((c) => c.kind === "temperature").map(curveOption));

    if (isNew) {
      form.setFieldsValue({ is_mix: false });
      setCoefficients(blankCoefficients());
      setLoading(false);
      return;
    }

    setLoading(true);
    const [{ data: product }, { data: pkgs }, { data: mixRows }, { data: overcoatData }, { data: undockingData }] = await Promise.all([
      supabaseClient.from("products").select("*").eq("id", id).single(),
      supabaseClient.from("product_packagings").select("*").eq("product_id", id),
      supabaseClient.from("product_mix_components").select("*").eq("mix_product_id", id),
      supabaseClient.from("product_overcoating_intervals").select("*").eq("overcoated_with_product_id", id).eq("interval_type", "overcoat"),
      supabaseClient.from("product_overcoating_intervals").select("*").eq("product_id", id).eq("interval_type", "undocking"),
    ]);
    form.setFieldsValue(product);
    const { data: coefficientRow } = await supabaseClient.from("product_coefficients").select("*").eq("product_id", id).maybeSingle();
    setCoefficients(coefficientRow ? { ...blankCoefficients(), ...coefficientRow } : blankCoefficients());

    const pkgIds = (pkgs ?? []).map((p) => p.id);
    const { data: costs } = pkgIds.length
      ? await supabaseClient.from("product_costs").select("product_packaging_id, cost_price, valid_from").in("product_packaging_id", pkgIds).order("valid_from", { ascending: false })
      : { data: [] as any[] };
    const latestCost = new Map<string, number>();
    for (const c of costs ?? []) if (!latestCost.has(c.product_packaging_id)) latestCost.set(c.product_packaging_id, c.cost_price);

    setPackagings(
      (pkgs ?? []).map((p) => ({
        key: p.id,
        id: p.id,
        supplier_id: p.supplier_id,
        pack_size: p.pack_size,
        unit: p.unit,
        supplier_key: p.supplier_key,
        cost_price: latestCost.get(p.id) ?? null,
        supply_country_id: p.supply_country_id ?? null,
      })),
    );
    setMixComponents(groupMixRows(mixRows ?? []));
    setOvercoatRows(groupOvercoatingRows(overcoatData ?? []));
    setUndockingRows(groupOvercoatingRows(undockingData ?? []));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addPackaging = () =>
    setPackagings((rows) => [
      ...rows,
      { key: newKey(), id: null, supplier_id: null, pack_size: null, unit: "L", supplier_key: "", cost_price: null, supply_country_id: null },
    ]);
  const removePackaging = (key: string) => setPackagings((rows) => rows.filter((r) => r.key !== key));
  const updatePackaging = (key: string, patch: Partial<PackagingRow>) =>
    setPackagings((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addMixComponent = () => setMixComponents((rows) => [...rows, blankMixComponent()]);
  const removeMixComponent = (key: string) => setMixComponents((rows) => rows.filter((r) => r.key !== key));
  const updateMixComponent = (key: string, patch: Partial<MixComponentRow>) =>
    setMixComponents((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const duplicateMixComponent = (key: string) =>
    setMixComponents((rows) => {
      const idx = rows.findIndex((r) => r.key === key);
      if (idx === -1) return rows;
      const copy = { ...rows[idx], key: newKey() };
      return [...rows.slice(0, idx + 1), copy, ...rows.slice(idx + 1)];
    });

  const addOvercoatRow = () => setOvercoatRows((rows) => [...rows, blankOvercoatingRow()]);
  const removeOvercoatRow = (key: string) => setOvercoatRows((rows) => rows.filter((r) => r.key !== key));
  const updateOvercoatRow = (key: string, patch: Partial<OvercoatingIntervalRow>) =>
    setOvercoatRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const duplicateOvercoatRow = (key: string) =>
    setOvercoatRows((rows) => {
      const idx = rows.findIndex((r) => r.key === key);
      if (idx === -1) return rows;
      const copy = { ...rows[idx], key: newKey() };
      return [...rows.slice(0, idx + 1), copy, ...rows.slice(idx + 1)];
    });

  const addUndockingRow = () => setUndockingRows((rows) => [...rows, blankOvercoatingRow()]);
  const removeUndockingRow = (key: string) => setUndockingRows((rows) => rows.filter((r) => r.key !== key));
  const updateUndockingRow = (key: string, patch: Partial<OvercoatingIntervalRow>) =>
    setUndockingRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const duplicateUndockingRow = (key: string) =>
    setUndockingRows((rows) => {
      const idx = rows.findIndex((r) => r.key === key);
      if (idx === -1) return rows;
      const copy = { ...rows[idx], key: newKey() };
      return [...rows.slice(0, idx + 1), copy, ...rows.slice(idx + 1)];
    });

  const save = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();

      // Checked up front, before any write: save() below deletes each
      // table's existing rows before re-inserting the flattened set, so a
      // duplicate key discovered only at insert time (via the DB's unique
      // constraint) would already have deleted the real data by then. See
      // findDuplicateMixKey/findDuplicateIntervalKey above.
      if (values.is_mix && findDuplicateMixKey(mixComponents)) {
        throw new Error("Two mix component rows have the same component product and supplier - fix or remove the duplicate before saving.");
      }
      if (findDuplicateIntervalKey(overcoatRows)) {
        throw new Error("Two overcoating interval rows have the same underlying product, DFT band, temperature and supplier - fix or remove the duplicate before saving.");
      }
      if (findDuplicateIntervalKey(undockingRows)) {
        throw new Error("Two undocking interval rows have the same DFT band, temperature and supplier - fix or remove the duplicate before saving.");
      }

      let productId = id;
      if (isNew) {
        const { data, error } = await supabaseClient.from("products").insert(values).select().single();
        if (error) throw error;
        productId = data.id;
      } else {
        const { error } = await supabaseClient.from("products").update(clearedToNull(values)).eq("id", id);
        if (error) throw error;
      }

      if (canManageCoefficients?.can) {
        // Every field is optional; a product with nothing filled in simply
        // has no coefficients row. `coefficients` may carry the loaded row's
        // own product_id/created_at/updated_at, which must not be re-sent.
        const { product_id: _p, created_at: _c, updated_at: _u, ...fields } = coefficients as CoefficientsForm & {
          product_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        const hasAny = Object.values(fields).some((v) => v != null);
        if (hasAny) {
          const { error } = await supabaseClient.from("product_coefficients").upsert({ ...fields, product_id: productId });
          if (error) throw error;
        } else if (!isNew) {
          const { error } = await supabaseClient.from("product_coefficients").delete().eq("product_id", productId);
          if (error) throw error;
        }
      }

      for (const pkg of packagings) {
        let packagingId = pkg.id;
        if (!packagingId) {
          const { data, error } = await supabaseClient
            .from("product_packagings")
            .insert({ product_id: productId, supplier_id: pkg.supplier_id, pack_size: pkg.pack_size, unit: pkg.unit, supplier_key: pkg.supplier_key, supply_country_id: pkg.supply_country_id })
            .select()
            .single();
          if (error) throw error;
          packagingId = data.id;
        } else {
          const { error } = await supabaseClient
            .from("product_packagings")
            .update({ supplier_id: pkg.supplier_id, pack_size: pkg.pack_size, unit: pkg.unit, supplier_key: pkg.supplier_key, supply_country_id: pkg.supply_country_id })
            .eq("id", packagingId);
          if (error) throw error;
        }
        const today = new Date().toISOString().slice(0, 10);
        if (pkg.cost_price != null) {
          const { error: costError } = await supabaseClient
            .from("product_costs")
            .insert({ product_packaging_id: packagingId, cost_price: pkg.cost_price, valid_from: today });
          if (costError) throw costError;
        }
      }

      if (values.is_mix) {
        const { error: deleteMixError } = await supabaseClient.from("product_mix_components").delete().eq("mix_product_id", productId);
        if (deleteMixError) throw deleteMixError;
        const flatMixRows = mixComponents
          .filter((m) => m.component_product_id && m.supplierIds.length > 0)
          .flatMap((m) =>
            m.supplierIds.map((supplierId) => ({
              mix_product_id: productId,
              component_product_id: m.component_product_id,
              supplier_id: supplierId,
              type: m.type,
              parts_volumetric: m.parts_volumetric,
              parts_gravimetric: m.parts_gravimetric,
            })),
          );
        if (flatMixRows.length > 0) {
          const { error } = await supabaseClient.from("product_mix_components").insert(flatMixRows);
          if (error) throw error;
        }
      }

      const { error: deleteOvercoatError } = await supabaseClient
        .from("product_overcoating_intervals")
        .delete()
        .eq("overcoated_with_product_id", productId)
        .eq("interval_type", "overcoat");
      if (deleteOvercoatError) throw deleteOvercoatError;
      const flatOvercoatRows = overcoatRows
        .filter((r) => r.otherProductId && r.temperature_celsius != null && r.supplierIds.length > 0)
        .flatMap((r) =>
          r.supplierIds.map((supplierId) => ({
            product_id: r.otherProductId,
            overcoated_with_product_id: productId,
            supplier_id: supplierId,
            interval_type: "overcoat",
            dry_film_thickness_minimum_um: r.dry_film_thickness_minimum_um,
            dry_film_thickness_maximum_um: r.dry_film_thickness_maximum_um,
            temperature_celsius: r.temperature_celsius,
            minimum_value: r.minimum_value,
            minimum_unit: r.minimum_unit,
            maximum_value: r.no_maximum ? null : r.maximum_value,
            maximum_unit: r.no_maximum ? null : r.maximum_unit,
            no_maximum: r.no_maximum,
            interval_text_override: r.interval_text_override,
          })),
        );
      if (flatOvercoatRows.length > 0) {
        const { error } = await supabaseClient.from("product_overcoating_intervals").insert(flatOvercoatRows);
        if (error) throw error;
      }

      const { error: deleteUndockingError } = await supabaseClient
        .from("product_overcoating_intervals")
        .delete()
        .eq("product_id", productId)
        .eq("interval_type", "undocking");
      if (deleteUndockingError) throw deleteUndockingError;
      const flatUndockingRows = undockingRows
        .filter((r) => r.temperature_celsius != null && r.supplierIds.length > 0)
        .flatMap((r) =>
          r.supplierIds.map((supplierId) => ({
            product_id: productId,
            overcoated_with_product_id: null,
            supplier_id: supplierId,
            interval_type: "undocking",
            dry_film_thickness_minimum_um: r.dry_film_thickness_minimum_um,
            dry_film_thickness_maximum_um: r.dry_film_thickness_maximum_um,
            temperature_celsius: r.temperature_celsius,
            minimum_value: r.minimum_value,
            minimum_unit: r.minimum_unit,
            maximum_value: r.no_maximum ? null : r.maximum_value,
            maximum_unit: r.no_maximum ? null : r.maximum_unit,
            no_maximum: r.no_maximum,
            interval_text_override: r.interval_text_override,
          })),
        );
      if (flatUndockingRows.length > 0) {
        const { error } = await supabaseClient.from("product_overcoating_intervals").insert(flatUndockingRows);
        if (error) throw error;
      }

      message.success("Product saved");
      if (isNew) navigate(`/products/${productId}`);
      else load();
    } catch (e: any) {
      if (e?.errorFields) {
        message.error("Please fix the highlighted fields before saving");
        return;
      }
      message.error(errorText(e, "Could not save product"));
    } finally {
      setSaving(false);
    }
  };

  const productName = Form.useWatch("name", form);
  usePageBannerTitle(isNew ? "New Product" : productName ? `Product: ${productName}` : undefined);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <Show
      title={isNew ? "New Product" : "Edit Product"}
      headerButtons={
        <Button type="primary" onClick={save} loading={saving}>
          Save
        </Button>
      }
    >
      <Form form={form} layout="vertical">
        <Card title="Details" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={L("code")} name="code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={L("production_code")} name="production_code">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={L("colour")} name="colour">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={L("is_mix")} name="is_mix" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={L("name")} name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={L("name2")} name="name2">
                <Input maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={L("name3")} name="name3">
                <Input maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={L("category_phrase_id")} name="category_phrase_id">
                <Select options={categoryOptions} allowClear showSearch optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={L("group_phrase_id")} name="group_phrase_id">
                <Select options={groupOptions} allowClear showSearch optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={L("default_thinner_product_id")} name="default_thinner_product_id">
                {/* Excludes this product itself - a thinner can't be its own default thinner. */}
                <RemoteSelect
                  loadOptions={(term) => searchProductOptions(term).then((opts) => opts.filter((o) => o.value !== id))}
                  loadLabels={loadProductOptionsByIds}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={L("default_thinner_pct")} name="default_thinner_pct" tooltip="Share of this thinner added to the paint, in % of the paint quantity (DD/NB paint list)">
                <InputNumber style={{ width: "100%" }} min={0.1} max={100} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card title="Technical" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={L("solids_volume_pct")} name="solids_volume_pct">
                <InputNumber style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={L("dry_film_thickness_um")} name="dry_film_thickness_um">
                <InputNumber style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={L("gravity")} name="gravity">
                <InputNumber style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {canManageCoefficients?.can && (
          <Card title="DFT proposal coefficients (admin)" size="small" style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
              Inputs to the dry film thickness proposal on a specification's coat lines. Leave everything empty for a product that gets no proposal.
              Curves are managed under Admin - Coefficient curves.
            </Typography.Text>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item label={LC("polishing_rate")}>
                  <InputNumber style={{ width: "100%" }} value={coefficients.polishing_rate} onChange={(v) => patchCoefficients({ polishing_rate: v })} />
                </Form.Item>
              </Col>
              <Col span={9}>
                <Form.Item label={LC("speed_curve_id")}>
                  <Select
                    options={speedCurveOptions}
                    value={coefficients.speed_curve_id ?? undefined}
                    onChange={(v) => patchCoefficients({ speed_curve_id: v ?? null })}
                    allowClear
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
              </Col>
              <Col span={9}>
                <Form.Item label={LC("temperature_curve_id")}>
                  <Select
                    options={temperatureCurveOptions}
                    value={coefficients.temperature_curve_id ?? undefined}
                    onChange={(v) => patchCoefficients({ temperature_curve_id: v ?? null })}
                    allowClear
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={LC("max_service_life_months")}>
                  <InputNumber
                    style={{ width: "100%" }}
                    value={coefficients.max_service_life_months}
                    onChange={(v) => patchCoefficients({ max_service_life_months: v })}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={LC("flat_bottom_derate_pct")}>
                  <InputNumber
                    style={{ width: "100%" }}
                    value={coefficients.flat_bottom_derate_pct}
                    onChange={(v) => patchCoefficients({ flat_bottom_derate_pct: v })}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={LC("boottop_derate_pct")}>
                  <InputNumber style={{ width: "100%" }} value={coefficients.boottop_derate_pct} onChange={(v) => patchCoefficients({ boottop_derate_pct: v })} />
                </Form.Item>
              </Col>
              <Col span={6} />
              <Col span={6}>
                <Form.Item label={LC("minimum_dft_um")}>
                  <InputNumber style={{ width: "100%" }} value={coefficients.minimum_dft_um} onChange={(v) => patchCoefficients({ minimum_dft_um: v })} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={LC("maximum_dft_per_coat_um")}>
                  <InputNumber
                    style={{ width: "100%" }}
                    value={coefficients.maximum_dft_per_coat_um}
                    onChange={(v) => patchCoefficients({ maximum_dft_per_coat_um: v })}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={LC("anchoring_dft_um")}>
                  <InputNumber style={{ width: "100%" }} value={coefficients.anchoring_dft_um} onChange={(v) => patchCoefficients({ anchoring_dft_um: v })} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={LC("anchoring_sea_days_threshold")}>
                  <InputNumber
                    style={{ width: "100%" }}
                    value={coefficients.anchoring_sea_days_threshold}
                    onChange={(v) => patchCoefficients({ anchoring_sea_days_threshold: v })}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        )}

        <Card
          title="Packaging & cost"
          size="small"
          style={{ marginBottom: 16 }}
          extra={
            <Button icon={<PlusOutlined />} size="small" onClick={addPackaging}>
              Add packaging
            </Button>
          }
        >
          <Table dataSource={packagings} rowKey="key" pagination={false} size="small" scroll={{ x: true }}>
            <Table.Column
              title="Supplier"
              width={180}
              render={(_, record: PackagingRow) => (
                <Select
                  value={record.supplier_id ?? undefined}
                  options={supplierOptions}
                  onChange={(v) => updatePackaging(record.key, { supplier_id: v })}
                  style={{ width: "100%" }}
                  showSearch
                  optionFilterProp="label"
                />
              )}
            />
            <Table.Column
              title="Supply country"
              width={170}
              render={(_, record: PackagingRow) => {
                const own = record.supplier_id ? supplierCountryId[record.supplier_id] : null;
                const ownLabel = countryOptions.find((c) => c.value === own)?.label;
                return (
                  <Select
                    value={record.supply_country_id ?? undefined}
                    options={countryOptions}
                    placeholder={ownLabel ? `${ownLabel} (supplier)` : "Same as supplier"}
                    onChange={(v) => updatePackaging(record.key, { supply_country_id: v ?? null })}
                    allowClear
                    style={{ width: "100%" }}
                    showSearch
                    optionFilterProp="label"
                  />
                );
              }}
            />
            <Table.Column
              title="Pack size"
              width={100}
              align="right"
              render={(_, record: PackagingRow) => (
                <InputNumber value={record.pack_size} onChange={(v) => updatePackaging(record.key, { pack_size: v })} />
              )}
            />
            <Table.Column
              title="Unit"
              width={80}
              render={(_, record: PackagingRow) => (
                <Input value={record.unit} onChange={(e) => updatePackaging(record.key, { unit: e.target.value })} />
              )}
            />
            <Table.Column
              title="Supplier key"
              width={160}
              render={(_, record: PackagingRow) => (
                <Input value={record.supplier_key} onChange={(e) => updatePackaging(record.key, { supplier_key: e.target.value })} />
              )}
            />
            <Table.Column
              title="Cost price"
              width={110}
              align="right"
              render={(_, record: PackagingRow) => (
                <InputNumber value={record.cost_price} onChange={(v) => updatePackaging(record.key, { cost_price: v })} />
              )}
            />
            <Table.Column
              title=""
              width={40}
              render={(_, record: PackagingRow) => (
                <Popconfirm title="Remove this packaging?" onConfirm={() => removePackaging(record.key)}>
                  <Button icon={<DeleteOutlined />} danger size="small" />
                </Popconfirm>
              )}
            />
          </Table>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
            Cost price changes are saved as a new dated entry (valid from today), not overwritten - matches the monthly price-list import (Admin → Configuration → Cost price import). Supply country only needs setting when it differs from the supplier's own country. Sales
            price is not catalog data - it's entered per specification on that spec's Paint List.
          </Typography.Text>
        </Card>

        <Card
          title="Overcoating intervals — as the topcoat"
          size="small"
          style={{ marginBottom: 16 }}
          extra={
            <Button icon={<PlusOutlined />} size="small" onClick={addOvercoatRow}>
              Add interval
            </Button>
          }
        >
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
            One row per underlying product, DFT band and temperature this product ("{form.getFieldValue("code") ?? "this product"}") can be overcoated
            onto. Edited here, on the topcoat's own page, rather than on the underlying product's page. A row's numbers apply to every supplier checked in
            its Suppliers column at once - duplicate a row to give one supplier a different number.
          </Typography.Text>
          <Table dataSource={overcoatRows} rowKey="key" pagination={false} size="small" scroll={{ x: true }}>
            <Table.Column
              title="Applied over"
              width={200}
              render={(_, record: OvercoatingIntervalRow) => (
                // Includes this product itself - a topcoat can be overcoated onto itself.
                <RemoteSelect
                  value={record.otherProductId ?? undefined}
                  loadOptions={searchProductOptions}
                  loadLabels={loadProductOptionsByIds}
                  onChange={(v) => updateOvercoatRow(record.key, { otherProductId: v })}
                  style={{ width: "100%" }}
                />
              )}
            />
            {overcoatingIntervalColumns(updateOvercoatRow)}
            {suppliersColumn<OvercoatingIntervalRow>(updateOvercoatRow, supplierOptions)}
            <Table.Column
              title=""
              width={70}
              render={(_, record: OvercoatingIntervalRow) => (
                <>
                  <Button icon={<CopyOutlined />} size="small" onClick={() => duplicateOvercoatRow(record.key)} style={{ marginRight: 4 }} />
                  <Popconfirm title="Remove this interval?" onConfirm={() => removeOvercoatRow(record.key)}>
                    <Button icon={<DeleteOutlined />} danger size="small" />
                  </Popconfirm>
                </>
              )}
            />
          </Table>
        </Card>

        <Card
          title="Undocking interval — as the final coat"
          size="small"
          style={{ marginBottom: 16 }}
          extra={
            <Button icon={<PlusOutlined />} size="small" onClick={addUndockingRow}>
              Add interval
            </Button>
          }
        >
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
            Minimum/maximum time in water after this product was applied as the final coat - no underlying product, since there's nothing "overcoated"
            here. A row's numbers apply to every supplier checked in its Suppliers column at once.
          </Typography.Text>
          <Table dataSource={undockingRows} rowKey="key" pagination={false} size="small" scroll={{ x: true }}>
            {overcoatingIntervalColumns(updateUndockingRow)}
            {suppliersColumn<OvercoatingIntervalRow>(updateUndockingRow, supplierOptions)}
            <Table.Column
              title=""
              width={70}
              render={(_, record: OvercoatingIntervalRow) => (
                <>
                  <Button icon={<CopyOutlined />} size="small" onClick={() => duplicateUndockingRow(record.key)} style={{ marginRight: 4 }} />
                  <Popconfirm title="Remove this interval?" onConfirm={() => removeUndockingRow(record.key)}>
                    <Button icon={<DeleteOutlined />} danger size="small" />
                  </Popconfirm>
                </>
              )}
            />
          </Table>
        </Card>

        {isMix && (
          <Card
            title="Mix components (Base / Hardener)"
            size="small"
            extra={
              <Button icon={<PlusOutlined />} size="small" onClick={addMixComponent}>
                Add component
              </Button>
            }
          >
            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
              A row's component/ratio applies to every supplier checked in its Suppliers column at once - duplicate a row to give one supplier a different
              ratio.
            </Typography.Text>
            <Table dataSource={mixComponents} rowKey="key" pagination={false} size="small" scroll={{ x: true }}>
              <Table.Column
                title="Component product"
                width={260}
                render={(_, record: MixComponentRow) => (
                  // Excludes this product itself - it can't be its own mix component.
                  <RemoteSelect
                    value={record.component_product_id ?? undefined}
                    loadOptions={(term) => searchProductOptions(term).then((opts) => opts.filter((o) => o.value !== id))}
                    loadLabels={loadProductOptionsByIds}
                    onChange={(v) => updateMixComponent(record.key, { component_product_id: v })}
                    style={{ width: "100%" }}
                  />
                )}
              />
              <Table.Column
                title="Type"
                width={140}
                render={(_, record: MixComponentRow) => (
                  <Select
                    value={record.type}
                    options={[
                      { value: "base", label: "Base" },
                      { value: "hardener", label: "Hardener" },
                    ]}
                    onChange={(v) => updateMixComponent(record.key, { type: v })}
                    style={{ width: "100%" }}
                  />
                )}
              />
              <Table.Column
                title="Parts (volumetric)"
                width={140}
                align="right"
                render={(_, record: MixComponentRow) => (
                  <InputNumber value={record.parts_volumetric} onChange={(v) => updateMixComponent(record.key, { parts_volumetric: v })} />
                )}
              />
              <Table.Column
                title="Parts (gravimetric)"
                width={140}
                align="right"
                render={(_, record: MixComponentRow) => (
                  <InputNumber value={record.parts_gravimetric} onChange={(v) => updateMixComponent(record.key, { parts_gravimetric: v })} />
                )}
              />
              {suppliersColumn<MixComponentRow>(updateMixComponent, supplierOptions)}
              <Table.Column
                title=""
                width={70}
                render={(_, record: MixComponentRow) => (
                  <>
                    <Button icon={<CopyOutlined />} size="small" onClick={() => duplicateMixComponent(record.key)} style={{ marginRight: 4 }} />
                    <Button icon={<DeleteOutlined />} danger size="small" onClick={() => removeMixComponent(record.key)} />
                  </>
                )}
              />
            </Table>
          </Card>
        )}
      </Form>
    </Show>
  );
};
