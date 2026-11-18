// Ported 1:1 from the NPM tool (app/src/pages/specifications/areasEditor.tsx).
import { useMemo, useRef, useState } from "react";
import { Table, Select, InputNumber, Button, Card, Space, Tooltip, Typography, Segmented, theme, App as AntdApp } from "antd";
import { PlusOutlined, DeleteOutlined, CopyOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { computeAreaProduct } from "./areaCalc";
import { formatNumber } from "@rbp/ui";
import { newRowKey } from "@rbp/ui";
import type { PhraseOption as Option } from "@rbp/core";
import { ProductPackagingSelect } from "./productPackagingSelect";
import { SurfacePrepPicker } from "../../components/surfacePrepPicker";
import { requestDftProposal, type LocationKind } from "@rbp/module-products/src/pages/specifications/dftProposal.ts";

export type { Option };

// PackagingInfo lives in products (modules/products/packagings.ts), which sits below offers.
import type { PackagingInfo } from "@rbp/module-products/src/modules/products/packagings.ts";
export type { PackagingInfo };

export type AreaProductRow = {
  key: string;
  id: string | null;
  sequence: number;
  product_packaging_id: string | null;
  coat_mode_phrase_id: string | null;
  coat_pct: number | null;
  application_method_phrase_id: string | null;
  loss_factor_pct: number | null;
  size_m2: number | null;
  dry_film_thickness_um: number | null;
  overcoat_time_minimum_override: number | null;
  overcoat_time_maximum_override: number | null;
  theoretical_spreading_rate: number | null;
  coverage_practical: number | null;
  quantity_l: number | null;
  price_per_l: number | null;
  price_per_m2: number | null;
  total_price: number | null;
};

export type AreaRow = {
  key: string;
  id: string | null;
  sequence: number;
  area_id: string | null;
  size_m2: number | null;
  substrate_phrase_id: string | null;
  environment_standard_phrase_id: string | null;
  loss_factor_pct: number | null;
  surface_preparation_text: string | null;
  remarks_text: string | null;
  products: AreaProductRow[];
};

export const newAreaKey = () => newRowKey("area");
const num = formatNumber;

export function recomputeAreaProduct(
  area: AreaRow,
  product: AreaProductRow,
  packagingById: Map<string, PackagingInfo>,
  priceByPackaging: Map<string, number>,
): AreaProductRow {
  const pkg = product.product_packaging_id ? packagingById.get(product.product_packaging_id) : undefined;
  // Price comes from the specification's own Paint List (priceByPackaging), not
  // from the catalog - there is no catalog-level sales price. If the product
  // isn't on the Paint List yet, the price is left blank rather than guessed.
  const sales_price = product.product_packaging_id ? priceByPackaging.get(product.product_packaging_id) ?? null : null;
  const computed = computeAreaProduct({
    solids_volume_pct: pkg?.solids_volume_pct ?? null,
    dry_film_thickness_um: product.dry_film_thickness_um ?? pkg?.dry_film_thickness_um ?? null,
    loss_factor_pct: product.loss_factor_pct ?? area.loss_factor_pct,
    area_size_m2: area.size_m2,
    coat_pct: product.coat_pct,
    sales_price,
  });
  return { ...product, ...computed };
}

// A labeled cell for the coat-line detail row - `width` is the minimum and the flex basis; the cells grow evenly, so
// the values line up into columns across the coat lines of one area.
const CoatField = ({
  label,
  width,
  children,
  align = "left",
}: {
  label: string;
  width: number;
  children: React.ReactNode;
  align?: "left" | "right";
}) => (
  <div style={{ flex: `0 0 ${width}px`, textAlign: align }}>
    <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 2 }}>
      {label}
    </Typography.Text>
    {children}
  </div>
);

// A coat line's DFT may not exceed its product's maximum DFT per coat
// (product_coefficients.maximum_dft_per_coat_um, loaded as maxDftByProductId) - the proposal never does,
// so this only ever fires on a manual edit. Products without coefficients
// have no such limit. Also enforced server-side, see the
// 20260920110000 migration.
const maximumDftForRow = (
  product: AreaProductRow,
  packagingById: Map<string, PackagingInfo>,
  maxDftByProductId: Map<string, number>,
): number | null => {
  const pkg = product.product_packaging_id ? packagingById.get(product.product_packaging_id) : undefined;
  return pkg ? maxDftByProductId.get(pkg.product_id) ?? null : null;
};

export function findDftOverMaximum(
  areas: AreaRow[],
  packagingById: Map<string, PackagingInfo>,
  maxDftByProductId: Map<string, number>,
): string[] {
  const problems: string[] = [];
  for (const area of areas) {
    for (const product of area.products) {
      const maximum = maximumDftForRow(product, packagingById, maxDftByProductId);
      if (maximum != null && product.dry_film_thickness_um != null && product.dry_film_thickness_um > maximum) {
        const label = packagingById.get(product.product_packaging_id!)?.label ?? "Coat line";
        problems.push(`${label}: DFT ${product.dry_film_thickness_um} um exceeds the maximum of ${maximum} um per coat`);
      }
    }
  }
  return problems;
}

export type SpecHeaderForDft = {
  speed: number | null;
  seawaterTemperature: number | null;
  activityDaysPerYear: number | null;
  servicePeriodMonths: number | null;
};

export const AreasEditor = ({
  areas,
  onChange,
  supplierId,
  packagings,
  onPackagingsLoaded,
  priceByPackaging,
  discountRatio,
  areaOptions,
  areaAfZoneById,
  substrateOptions,
  environmentOptions,
  coatModeOptions,
  applicationMethodOptions,
  defaultApplicationMethodId,
  surfacePrepOptions,
  maxDftByProductId,
  specHeader,
  disabled,
}: {
  areas: AreaRow[];
  onChange: (areas: AreaRow[]) => void;
  // The packagings loaded so far (this spec's own plus any picked this session);
  // the product picker searches the catalog on the server and registers every
  // result - together with that product's DFT coefficients - through
  // onPackagingsLoaded before offering it (see productPackagingSelect.tsx).
  supplierId?: string | null;
  packagings: PackagingInfo[];
  onPackagingsLoaded: (list: PackagingInfo[]) => Promise<void>;
  priceByPackaging: Map<string, number>;
  discountRatio: number;
  areaOptions: Option[];
  // Keyed by spec_areas.id - only used to derive the DFT proposal's
  // flat/boottop/vertical classification above, see dftProposal.ts.
  areaAfZoneById: Map<string, LocationKind | null>;
  substrateOptions: Option[];
  environmentOptions: Option[];
  coatModeOptions: Option[];
  applicationMethodOptions: Option[];
  // Pre-selected application method on a newly added coat line - the
  // "Airless spray" phrase, a spec-page-level default (not per product).
  defaultApplicationMethodId: string | null;
  surfacePrepOptions: Option[];
  // Maximum DFT per coat of the products that have DFT coefficients (the coefficients themselves stay on the server: the
  // proposal comes from requestDftProposal). Only those products get an auto-calculated DFT on insert; everything else
  // keeps the product-default fallback.
  maxDftByProductId: Map<string, number>;
  specHeader: SpecHeaderForDft;
  disabled?: boolean;
}) => {
  const packagingById = useMemo(() => new Map(packagings.map((p) => [p.id, p])), [packagings]);
  const { token } = theme.useToken();
  const { message } = AntdApp.useApp();
  // The latest areas, for a change that arrives after a server call (the proposal) and must not overwrite edits made meanwhile.
  const areasRef = useRef(areas);
  areasRef.current = areas;

  // On selecting a product for a coat line: asks the server for that line's DFT (the product's coefficients + the spec's
  // operating conditions) instead of leaving it to the product's flat default. Accounts for the line already being a second
  // (or third, ...) coat of the SAME product placed directly above it - a contiguous run of identical-product rows shares
  // one proposal, each row getting its place in the coat split (priorCoats) rather than each independently proposing a full
  // fresh total. Returns null (caller keeps the product's own default) when the product has no coefficients, or the spec
  // doesn't have enough header data yet to calculate.
  const proposeDftForSelection = (area: AreaRow, productKey: string, packagingId: string): Promise<number | null> => {
    const selected = packagingById.get(packagingId);
    if (!selected || !maxDftByProductId.has(selected.product_id)) return Promise.resolve(null);

    const rowIndex = area.products.findIndex((p) => p.key === productKey);
    let priorCount = 0;
    for (let i = rowIndex - 1; i >= 0; i--) {
      const priorPkg = area.products[i].product_packaging_id ? packagingById.get(area.products[i].product_packaging_id!) : undefined;
      if (priorPkg?.product_id !== selected.product_id) break;
      priorCount++;
    }

    return requestDftProposal({
      packagingId,
      ...specHeader,
      location: (area.area_id ? areaAfZoneById.get(area.area_id) : null) ?? "vertical",
      priorCoats: priorCount,
    });
  };

  // Price/L, Price/m2 and Total always show the SAME basis - gross (list
  // price) or net (after the specification's discounts) - never a mix, so
  // toggling this is the only way discounts show up here at all. Areas never
  // store a discounted price themselves; this only affects display.
  const [showNet, setShowNet] = useState(true);
  // Collapsed rather than expanded keys, so a newly added area opens by default.
  const [collapsedKeys, setCollapsedKeys] = useState<string[]>([]);
  const expandedKeys = areas.map((a) => a.key).filter((k) => !collapsedKeys.includes(k));
  const disp = (v: number | null) => (v == null ? null : showNet ? v * discountRatio : v);

  const recomputeArea = (area: AreaRow): AreaRow => ({
    ...area,
    products: area.products.map((p) => recomputeAreaProduct(area, p, packagingById, priceByPackaging)),
  });

  const updateArea = (key: string, patch: Partial<AreaRow>) => {
    onChange(
      areas.map((r) => {
        if (r.key !== key) return r;
        const merged: AreaRow = { ...r, ...patch };
        // A product row with no loss factor of its own, or one that still
        // matches the area's OLD loss factor, is treated as "following the
        // area" - changing the area's brings it along. A row whose loss
        // factor was typed to something else already diverged and is left
        // alone.
        if ("loss_factor_pct" in patch) {
          const previousAreaLossFactor = r.loss_factor_pct;
          merged.products = merged.products.map((p) =>
            p.loss_factor_pct == null || p.loss_factor_pct === previousAreaLossFactor
              ? { ...p, loss_factor_pct: merged.loss_factor_pct }
              : p,
          );
        }
        return recomputeArea(merged);
      }),
    );
  };

  const updateProduct = (areaKey: string, productKey: string, patch: Partial<AreaProductRow>) => {
    onChange(
      areas.map((r) =>
        r.key === areaKey
          ? { ...r, products: r.products.map((p) => (p.key === productKey ? recomputeAreaProduct(r, { ...p, ...patch }, packagingById, priceByPackaging) : p)) }
          : r,
      ),
    );
  };

  const blankCoatLine = (area: AreaRow): AreaProductRow => ({
    key: newAreaKey(),
    id: null,
    sequence: area.products.length + 1,
    product_packaging_id: null,
    coat_mode_phrase_id: null,
    coat_pct: null,
    application_method_phrase_id: defaultApplicationMethodId,
    // Prepopulated from the area's own loss factor (null stays null
    // if the area doesn't have one) - counts as "following the area"
    // in updateArea above, same as a row left blank.
    loss_factor_pct: area.loss_factor_pct,
    size_m2: null,
    dry_film_thickness_um: null,
    overcoat_time_minimum_override: null,
    overcoat_time_maximum_override: null,
    theoretical_spreading_rate: null,
    coverage_practical: null,
    quantity_l: null,
    price_per_l: null,
    price_per_m2: null,
    total_price: null,
  });

  // A new area starts with two coat lines: an antifouling system is
  // (almost) never a single coat, and the user would otherwise have to add
  // the second one by hand every time. Either can be removed again.
  const addArea = () => {
    const area: AreaRow = {
      key: newAreaKey(),
      id: null,
      sequence: areas.length + 1,
      area_id: null,
      size_m2: null,
      substrate_phrase_id: null,
      environment_standard_phrase_id: null,
      loss_factor_pct: null,
      surface_preparation_text: null,
      remarks_text: null,
      products: [],
    };
    for (let i = 0; i < 2; i++) {
      area.products.push(recomputeAreaProduct(area, blankCoatLine(area), packagingById, priceByPackaging));
    }
    onChange([...areas, area]);
  };

  const duplicateArea = (key: string) => {
    const source = areas.find((a) => a.key === key);
    if (!source) return;
    const clone: AreaRow = {
      ...source,
      key: newAreaKey(),
      id: null,
      sequence: areas.length + 1,
      products: source.products.map((p) => ({ ...p, key: newAreaKey(), id: null })),
    };
    onChange([...areas, clone]);
  };

  const removeArea = (key: string) => onChange(areas.filter((r) => r.key !== key));

  const addProduct = (areaKey: string) => {
    onChange(
      areas.map((r) => {
        if (r.key !== areaKey) return r;
        const blank = blankCoatLine(r);
        return { ...r, products: [...r.products, recomputeAreaProduct(r, blank, packagingById, priceByPackaging)] };
      }),
    );
  };

  const removeProduct = (areaKey: string, productKey: string) =>
    onChange(areas.map((r) => (r.key === areaKey ? { ...r, products: r.products.filter((p) => p.key !== productKey) } : r)));

  return (
    <Card
      title={
        <>
          Areas{" "}
          <Tooltip title="Coverage, quantity and total price are confirmed against real legacy documents. A coat line's own Area (m2) is derived from the area's size x coat %, not entered directly. Price/L, Price/m2 and Total always show the same basis - use the Gross/Net switch to see the effect of the specification's discounts.">
            <QuestionCircleOutlined style={{ color: "#aaa", fontWeight: "normal" }} />
          </Tooltip>
        </>
      }
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        <Space>
          <Segmented
            size="small"
            value={showNet ? "net" : "gross"}
            onChange={(v) => setShowNet(v === "net")}
            options={[
              { label: "Gross", value: "gross" },
              { label: "Net (after discount)", value: "net" },
            ]}
          />
          <Button
            size="small"
            disabled={areas.length === 0}
            onClick={() => setCollapsedKeys(expandedKeys.length > 0 ? areas.map((a) => a.key) : [])}
          >
            {expandedKeys.length > 0 ? "Collapse all" : "Expand all"}
          </Button>
          {!disabled && (
            <Button icon={<PlusOutlined />} onClick={addArea} size="small">
              Add area
            </Button>
          )}
        </Space>
      }
    >
      <Table
        dataSource={areas}
        rowKey="key"
        pagination={false}
        size="small"
        scroll={{ x: "max-content" }}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpand: (expanded, area) =>
            setCollapsedKeys((prev) => (expanded ? prev.filter((k) => k !== area.key) : [...prev, area.key])),
          expandedRowRender: (area) => (
            // The delete button wrapper (61px) takes the place of the area row's 70px
            // actions column less the coat line card's 8px padding + 1px border, so the
            // coat line's Total ends where the area row's Total price column ends.
            <div style={{ paddingLeft: 24, marginRight: 0 }}>
              {/* Full-width row of its own, not a column on the area header
                  row - a Surface prep column there forced horizontal
                  scrolling on narrower screens (Comments panel open, smaller
                  laptop) before any of the coat-line detail was reachable. */}
              <div style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                  Surface prep
                </Typography.Text>
                <SurfacePrepPicker
                  value={area.surface_preparation_text}
                  onChange={(text) => updateArea(area.key, { surface_preparation_text: text })}
                  options={surfacePrepOptions}
                  disabled={disabled}
                />
              </div>
              {area.products.map((product) => {
                const pkg = product.product_packaging_id ? packagingById.get(product.product_packaging_id) : undefined;
                const dftMaximum = maximumDftForRow(product, packagingById, maxDftByProductId);
                return (
                  <div
                    key={product.key}
                    style={{ border: "1px solid #EDEDED", borderRadius: 6, padding: 8, marginBottom: 8 }}
                  >
                    {/* Two groups in one wrapping flex row: product pickers, then DFT..Total.
                        No widths are set for the groups: the right group keeps its content
                        width, the left one takes the rest (the product select absorbs it) and
                        never gets narrower than its min-content. When both do not fit, the right
                        group drops below (before DFT) and the left one fills the first line. */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", columnGap: 16, rowGap: 6 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flex: "1 1 0", minWidth: "min-content" }}>
                      <ProductPackagingSelect
                        value={product.product_packaging_id ?? undefined}
                        packagings={packagings}
                        supplierId={supplierId}
                        onPackagingsLoaded={onPackagingsLoaded}
                        onChange={(val) => {
                          const selected = packagingById.get(val);
                          // The old product's own DFT never belongs here once the product itself has changed: the new
                          // product's default stands in at once (so the line is never left at e.g. 175 um on a product
                          // whose own default/max is 100 um) and the server's proposal replaces it when it arrives,
                          // unless the line was changed again meanwhile.
                          updateProduct(area.key, product.key, {
                            product_packaging_id: val,
                            dry_film_thickness_um: selected?.dry_film_thickness_um ?? null,
                          });
                          void proposeDftForSelection(area, product.key, val).then((proposed) => {
                            if (proposed == null) return;
                            const latest = areasRef.current.find((r) => r.key === area.key);
                            const row = latest?.products.find((p) => p.key === product.key);
                            if (!latest || !row || row.product_packaging_id !== val || row.dry_film_thickness_um !== (selected?.dry_film_thickness_um ?? null)) return;
                            onChange(areasRef.current.map((r) => (r.key === area.key ? { ...r, products: r.products.map((p) => (p.key === product.key ? recomputeAreaProduct(r, { ...p, dry_film_thickness_um: proposed }, packagingById, priceByPackaging) : p)) } : r)));
                          }).catch(() => {
                            message.warning("The DFT proposal could not be calculated (no connection to the server). The product's default DFT is used - check it, or select the product again.");
                          });
                        }}
                        style={{ flex: "1 1 0", minWidth: 212 }}
                        placeholder="Product - type to search"
                        disabled={disabled}
                      />
                      <Select
                        value={product.coat_mode_phrase_id ?? undefined}
                        options={coatModeOptions}
                        onChange={(val) => updateProduct(area.key, product.key, { coat_mode_phrase_id: val })}
                        style={{ width: 120 }}
                        placeholder="Coat mode"
                        allowClear
                        disabled={disabled}
                      />
                      <InputNumber
                        value={product.coat_pct}
                        onChange={(val) => updateProduct(area.key, product.key, { coat_pct: val })}
                        placeholder="Coat %"
                        suffix="%"
                        controls={false}
                        min={0}
                        max={100}
                        style={{ width: 80 }}
                        disabled={disabled}
                      />
                      <Select
                        value={product.application_method_phrase_id ?? undefined}
                        options={applicationMethodOptions}
                        onChange={(val) => updateProduct(area.key, product.key, { application_method_phrase_id: val })}
                        style={{ width: 120 }}
                        placeholder="Application"
                        allowClear
                        disabled={disabled}
                      />
                    </div>
                    {/* Right group: fixed-width fields in a nowrap row, so they line up as real table
                        columns across every coat line. It never scrolls; the row wraps before it. */}
                    <div style={{ flex: "0 0 auto", marginLeft: "auto" }}>
                      <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "flex-end", gap: 10 }}>
                        <CoatField label="DFT (um)" width={58}>
                        <InputNumber
                          size="small"
                          value={product.dry_film_thickness_um}
                          placeholder={String(pkg?.dry_film_thickness_um ?? "default")}
                          status={dftMaximum != null && product.dry_film_thickness_um != null && product.dry_film_thickness_um > dftMaximum ? "error" : undefined}
                          onChange={(val) => {
                            if (dftMaximum != null && val != null && val > dftMaximum) {
                              message.error(`DFT ${val} um exceeds this product's maximum of ${dftMaximum} um per coat - add another coat line instead.`);
                            }
                            updateProduct(area.key, product.key, { dry_film_thickness_um: val });
                          }}
                          disabled={disabled}
                          style={{ width: "100%" }}
                        />
                        {dftMaximum != null && product.dry_film_thickness_um != null && product.dry_film_thickness_um > dftMaximum && (
                          <Typography.Text type="danger" style={{ fontSize: 11 }}>
                            max {dftMaximum}
                          </Typography.Text>
                        )}
                      </CoatField>
                      <CoatField label="Loss %" width={58}>
                        <InputNumber
                          size="small"
                          value={product.loss_factor_pct}
                          placeholder={String(area.loss_factor_pct ?? "default")}
                          onChange={(val) => updateProduct(area.key, product.key, { loss_factor_pct: val })}
                          disabled={disabled}
                          style={{ width: "100%" }}
                        />
                      </CoatField>
                      <CoatField label="Area (m2)" width={66} align="right">
                        <Typography.Text>{num(product.size_m2)}</Typography.Text>
                      </CoatField>
                      <CoatField label="TSR (m2/L)" width={76} align="right">
                        <Typography.Text>{num(product.theoretical_spreading_rate)}</Typography.Text>
                      </CoatField>
                      <CoatField label="Coverage (m2/L)" width={92} align="right">
                        <Typography.Text>{num(product.coverage_practical)}</Typography.Text>
                      </CoatField>
                      <CoatField label="Qty (L)" width={58} align="right">
                        <Typography.Text>{num(product.quantity_l)}</Typography.Text>
                      </CoatField>
                      <CoatField label="Price/L" width={64} align="right">
                        <Typography.Text>{disp(product.price_per_l) != null ? num(disp(product.price_per_l)) : "—"}</Typography.Text>
                      </CoatField>
                      <CoatField label="Price/m2" width={68} align="right">
                        <Typography.Text>{num(disp(product.price_per_m2))}</Typography.Text>
                      </CoatField>
                      <CoatField label="Total" width={92} align="right">
                        <Typography.Text strong style={{ fontSize: 16, color: token.colorPrimary }}>
                          {num(disp(product.total_price))}
                        </Typography.Text>
                      </CoatField>
                      {!disabled && (
                        // As wide as the actions column of the area row, so the Total stays aligned with the area's Total price.
                        <div style={{ flex: "0 0 61px", textAlign: "right" }}>
                          <Button icon={<DeleteOutlined />} danger size="small" onClick={() => removeProduct(area.key, product.key)} />
                        </div>
                      )}
                      </div>
                    </div>
                    </div>
                  </div>
                );
              })}
              {!disabled && (
                <Button icon={<PlusOutlined />} size="small" onClick={() => addProduct(area.key)}>
                  Add coat line
                </Button>
              )}
            </div>
          ),
        }}
      >
        <Table.Column
          title="Area"
          dataIndex="area_id"
          width={170}
          render={(v, record: AreaRow) => (
            <Select
              value={v ?? undefined}
              options={areaOptions}
              onChange={(val) => updateArea(record.key, { area_id: val })}
              style={{ width: "100%" }}
              disabled={disabled}
              showSearch
              optionFilterProp="label"
            />
          )}
        />
        <Table.Column
          title="Size (m2)"
          dataIndex="size_m2"
          width={100}
          align="right"
          render={(v, record: AreaRow) => (
            <InputNumber value={v} onChange={(val) => updateArea(record.key, { size_m2: val })} disabled={disabled} />
          )}
        />
        <Table.Column
          title="Substrate"
          dataIndex="substrate_phrase_id"
          width={120}
          render={(v, record: AreaRow) => (
            <Select
              value={v ?? undefined}
              options={substrateOptions}
              onChange={(val) => updateArea(record.key, { substrate_phrase_id: val })}
              style={{ width: "100%" }}
              disabled={disabled}
              allowClear
            />
          )}
        />
        <Table.Column
          title="Environment"
          dataIndex="environment_standard_phrase_id"
          width={130}
          render={(v, record: AreaRow) => (
            <Select
              value={v ?? undefined}
              options={environmentOptions}
              onChange={(val) => updateArea(record.key, { environment_standard_phrase_id: val })}
              style={{ width: "100%" }}
              disabled={disabled}
              allowClear
            />
          )}
        />
        <Table.Column
          title="Loss %"
          dataIndex="loss_factor_pct"
          width={80}
          align="right"
          render={(v, record: AreaRow) => (
            <InputNumber value={v} onChange={(val) => updateArea(record.key, { loss_factor_pct: val })} disabled={disabled} />
          )}
        />
        <Table.Column
          title="Coats"
          width={70}
          align="right"
          render={(_, record: AreaRow) => record.products.length}
        />
        <Table.Column
          title="Total price"
          width={110}
          align="right"
          render={(_, record: AreaRow) => {
            const hasAny = record.products.some((p) => p.total_price != null);
            const total = record.products.reduce((sum, p) => sum + (p.total_price ?? 0), 0);
            return (
              <Typography.Text strong style={{ fontSize: 16, color: token.colorPrimary }}>
                {hasAny ? num(disp(total)) : "—"}
              </Typography.Text>
            );
          }}
        />
        {!disabled && (
          <Table.Column
            title=""
            width={70}
            align="right"
            render={(_, record: AreaRow) => (
              <>
                <Button icon={<CopyOutlined />} type="text" size="small" title="Duplicate area" onClick={() => duplicateArea(record.key)} />
                <Button icon={<DeleteOutlined />} danger type="text" size="small" onClick={() => removeArea(record.key)} />
              </>
            )}
          />
        )}
      </Table>
    </Card>
  );
};
