// Ported 1:1 from the NPM tool (app/src/pages/admin/costPriceImport/index.tsx).
import { useMemo, useState } from "react";
import { Alert, Button, Card, DatePicker, Space, Statistic, Table, Tabs, Tag, Typography, Upload, App as AntdApp } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { readSheet } from "read-excel-file/browser";
import { List } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { selectInChunks } from "@rbp/ui";
import { dedupeByKey, filePeriodStart, normalizeUnit, parseIatpSheet, type IatpRow } from "./parseIatp";

// Supplier cost price import (IATP export). Rows are matched to existing
// packagings by supplier_key (= "PMC17 Code"); it never creates products or
// packagings. A new price is appended to product_costs with the chosen
// valid-from date (history is kept); a price equal to the current one is
// skipped, and 0 / blank prices are skipped as "no price set". The row's
// Country is stored as the packaging's supply country only when it differs
// from the supplier company's own country (the usual 1:1 case needs nothing).
// The entity (supplier) is only checked against the packaging, never changed.

// File spellings that differ from countries.name_en.
const COUNTRY_ALIASES: Record<string, string[]> = {
  turkiye: ["turkiye", "turkey"],
  korea: ["south korea", "korea, republic of", "korea (republic of)", "republic of korea"],
  usa: ["united states", "united states of america"],
  uae: ["united arab emirates"],
  "republic of south africa": ["south africa"],
  vietnam: ["viet nam"],
  taiwan: ["taiwan", "taiwan, province of china"],
  "hong kong": ["hong kong", "hong kong sar china"],
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Packaging = { id: string; supplier_key: string; supplier_id: string; pack_size: number; unit: string; supply_country_id: string | null };
type Company = { id: string; name: string; country_id: string | null };

type Item = {
  row: IatpRow;
  packaging: Packaging;
  currentPrice: number | null;
  supplierCountryId: string | null;
  setSupplyCountryId: string | null; // to write, if any
  warnings: string[];
};

type Preview = {
  total: number;
  changes: Item[];
  unchanged: Item[];
  noPrice: IatpRow[];
  unmatched: IatpRow[];
  duplicates: IatpRow[];
  unknownCountries: string[];
  periodFromFile: string | null;
};

export const CostPriceImport = () => {
  const { message } = AntdApp.useApp();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<IatpRow[] | null>(null);
  const [validFrom, setValidFrom] = useState<Dayjs | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const reset = () => {
    setRows(null);
    setPreview(null);
    setDone(null);
    setFileName(null);
  };

  const buildPreview = async (parsed: IatpRow[]) => {
    setBusy(true);
    try {
      const { rows: unique, duplicates } = dedupeByKey(parsed);
      const priced = unique.filter((r) => r.price != null);
      const noPrice = unique.filter((r) => r.price == null);

      const packagings = await selectInChunks<Packaging>(
        priced.map((r) => r.supplierKey),
        (chunk) =>
          supabaseClient.from("product_packagings").select("id, supplier_key, supplier_id, pack_size, unit, supply_country_id").in("supplier_key", chunk),
      );
      const byKey = new Map(packagings.map((p) => [p.supplier_key, p]));
      const [companies, costs, { data: countryRows }] = await Promise.all([
        selectInChunks<Company>(
          Array.from(new Set(packagings.map((p) => p.supplier_id))),
          (chunk) => supabaseClient.from("companies").select("id, name, country_id").in("id", chunk),
        ),
        selectInChunks<{ id: string; latest_cost_price: number | null }>(
          packagings.map((p) => p.id),
          (chunk) => supabaseClient.from("product_packagings_overview").select("id, latest_cost_price").in("id", chunk),
        ),
        supabaseClient.from("countries").select("id, name_en"),
      ]);
      const companyById = new Map(companies.map((c) => [c.id, c]));
      const latestById = new Map(costs.map((c) => [c.id, c.latest_cost_price]));
      const countryByName = new Map((countryRows ?? []).map((c: any) => [norm(c.name_en), c.id as string]));
      const resolveCountry = (name: string): string | null => {
        const key = norm(name);
        for (const candidate of [key, ...(COUNTRY_ALIASES[key] ?? [])]) {
          const hit = countryByName.get(norm(candidate));
          if (hit) return hit;
        }
        return null;
      };

      const unknownCountries = new Set<string>();
      const changes: Item[] = [];
      const unchanged: Item[] = [];
      const unmatched: IatpRow[] = [];
      for (const r of priced) {
        const packaging = byKey.get(r.supplierKey);
        if (!packaging) {
          unmatched.push(r);
          continue;
        }
        const company = companyById.get(packaging.supplier_id);
        const warnings: string[] = [];
        if (company && r.entityCode && norm(company.name) !== norm(r.entityCode)) {
          warnings.push(`Supplier is ${company.name}, file says ${r.entityCode}`);
        }
        if (r.unit && r.unit !== normalizeUnit(packaging.unit)) {
          warnings.push(`Unit ${r.unit} vs ${packaging.unit}`);
        }
        if (r.packSize != null && Number(packaging.pack_size) !== r.packSize) {
          warnings.push(`Pack size ${r.packSize} vs ${packaging.pack_size}`);
        }
        const fileCountryId = r.country ? resolveCountry(r.country) : null;
        if (r.country && !fileCountryId) unknownCountries.add(r.country);
        const supplierCountryId = company?.country_id ?? null;
        const setSupplyCountryId =
          fileCountryId && fileCountryId !== supplierCountryId && fileCountryId !== packaging.supply_country_id ? fileCountryId : null;

        const currentPrice = latestById.get(packaging.id) ?? null;
        const item: Item = { row: r, packaging, currentPrice, supplierCountryId, setSupplyCountryId, warnings };
        if (currentPrice != null && Number(currentPrice) === r.price && !setSupplyCountryId) unchanged.push(item);
        else changes.push(item);
      }

      setPreview({
        total: parsed.length,
        changes,
        unchanged,
        noPrice,
        unmatched,
        duplicates,
        unknownCountries: Array.from(unknownCountries).sort(),
        periodFromFile: filePeriodStart(parsed),
      });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    reset();
    setBusy(true);
    try {
      const sheet = (await readSheet(file)) as unknown[][];
      const parsed = parseIatpSheet(sheet);
      if (parsed.error) {
        message.error(parsed.error);
        return;
      }
      setFileName(file.name);
      setRows(parsed.rows);
      const period = filePeriodStart(parsed.rows);
      setValidFrom(period ? dayjs(period) : dayjs().startOf("month"));
      await buildPreview(parsed.rows);
    } catch (e: any) {
      message.error(`Could not read the file: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
    return false;
  };

  // Rows that are priced and either new or changed (price or supply country).
  const priceChanges = useMemo(() => preview?.changes.filter((i) => i.currentPrice == null || Number(i.currentPrice) !== i.row.price) ?? [], [preview]);

  const runImport = async () => {
    if (!preview || !validFrom) return;
    setBusy(true);
    try {
      const date = validFrom.format("YYYY-MM-DD");
      const priceIds = new Set(priceChanges.map((i) => i.packaging.id));
      const items = preview.changes
        .filter((i) => priceIds.has(i.packaging.id) || i.setSupplyCountryId)
        .map((i) => ({
          product_packaging_id: i.packaging.id,
          cost_price: priceIds.has(i.packaging.id) ? i.row.price : null,
          supply_country_id: i.setSupplyCountryId,
        }));
      // A re-import for the same valid-from date corrects that day's row instead of adding a second one;
      // prices and supply-country changes are written together or not at all.
      const { error } = await supabaseClient.rpc("import_product_costs", { p_valid_from: date, p_items: items });
      if (error) throw error;
      setDone(`${priceChanges.length} cost price(s) written (valid from ${date}).`);
      setPreview(null);
      setRows(null);
    } catch (e: any) {
      message.error(`Import failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const rowCols = [
    { title: "Row", dataIndex: ["row", "rowNumber"], width: 70 },
    { title: "Supplier key", dataIndex: ["row", "supplierKey"] },
    { title: "Country", dataIndex: ["row", "country"], width: 140 },
    { title: "Entity", dataIndex: ["row", "entityCode"], width: 120 },
  ];
  const plain = (r: IatpRow) => ({ row: r });

  return (
    <List title="Cost price import">
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {done && <Alert type="success" showIcon message={done} closable onClose={() => setDone(null)} />}

        <Card size="small">
          <Upload.Dragger accept=".xlsx" maxCount={1} showUploadList={false} beforeUpload={onFile} disabled={busy}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p>{fileName ?? "Drop an IATP export (.xlsx) here, or click to choose"}</p>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Rows are matched to existing packagings by PMC17 Code = supplier key. Nothing is written until you confirm.
            </Typography.Text>
          </Upload.Dragger>
        </Card>

        {rows && preview && (
          <>
            <Card size="small">
              <Space size="large" wrap align="start">
                <Statistic title="Rows in file" value={preview.total} />
                <Statistic title="New / changed prices" value={priceChanges.length} valueStyle={{ color: "#389e0d" }} />
                <Statistic title="Unchanged" value={preview.unchanged.length} />
                <Statistic title="No price (0 / blank)" value={preview.noPrice.length} />
                <Statistic title="No matching packaging" value={preview.unmatched.length} valueStyle={preview.unmatched.length ? { color: "#d46b08" } : undefined} />
                <div>
                  <div style={{ color: "rgba(0,0,0,.45)", fontSize: 14, marginBottom: 4 }}>Valid from</div>
                  <DatePicker value={validFrom} onChange={setValidFrom} allowClear={false} />
                  {preview.periodFromFile && (
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        File period: {dayjs(preview.periodFromFile).format("MMMM YYYY")}
                      </Typography.Text>
                    </div>
                  )}
                </div>
              </Space>
              <div style={{ marginTop: 16 }}>
                <Button type="primary" loading={busy} disabled={!validFrom || (priceChanges.length === 0 && !preview.changes.some((i) => i.setSupplyCountryId))} onClick={runImport}>
                  Import {priceChanges.length} price(s)
                </Button>{" "}
                <Button onClick={reset} disabled={busy}>
                  Cancel
                </Button>
              </div>
              {preview.unknownCountries.length > 0 && (
                <Alert
                  style={{ marginTop: 12 }}
                  type="warning"
                  showIcon
                  message={`Country not found in the countries list (supply country left unchanged): ${preview.unknownCountries.join(", ")}`}
                />
              )}
            </Card>

            <Tabs
              items={[
                {
                  key: "changes",
                  label: `New / changed (${preview.changes.length})`,
                  children: (
                    <Table
                      size="small"
                      rowKey={(i) => i.row.supplierKey}
                      dataSource={preview.changes}
                      pagination={{ pageSize: 50 }}
                      columns={[
                        ...rowCols,
                        { title: "Current", dataIndex: "currentPrice", align: "right", width: 90, render: (v) => v ?? "-" },
                        { title: "New", dataIndex: ["row", "price"], align: "right", width: 90 },
                        {
                          title: "Notes",
                          render: (_, i: Item) => (
                            <>
                              {i.setSupplyCountryId && <Tag color="blue">sets supply country</Tag>}
                              {i.warnings.map((w) => (
                                <Tag key={w} color="orange">
                                  {w}
                                </Tag>
                              ))}
                            </>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: "unmatched",
                  label: `No matching packaging (${preview.unmatched.length})`,
                  children: <Table size="small" rowKey={(i) => i.row.supplierKey} dataSource={preview.unmatched.map(plain)} pagination={{ pageSize: 50 }} columns={rowCols} />,
                },
                {
                  key: "noPrice",
                  label: `No price (${preview.noPrice.length})`,
                  children: <Table size="small" rowKey={(i) => i.row.supplierKey} dataSource={preview.noPrice.map(plain)} pagination={{ pageSize: 50 }} columns={rowCols} />,
                },
                {
                  key: "duplicates",
                  label: `Duplicate keys (${preview.duplicates.length})`,
                  children: <Table size="small" rowKey={(i) => `${i.row.supplierKey}-${i.row.rowNumber}`} dataSource={preview.duplicates.map(plain)} pagination={{ pageSize: 50 }} columns={rowCols} />,
                },
              ]}
            />
          </>
        )}
      </Space>
    </List>
  );
};
