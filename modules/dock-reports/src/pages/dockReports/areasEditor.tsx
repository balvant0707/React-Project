// Ported 1:1 from the NPM tool (app/src/pages/dockReports/areasEditor.tsx).
import { Table, Select, InputNumber, Input, Button, Card, Space, Typography } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { PhraseOption as Option } from "@rbp/core";
import { ProductPackagingSelect } from "@rbp/module-offers/src/pages/specifications/productPackagingSelect.tsx";
import type { PackagingInfo } from "@rbp/module-offers/src/pages/specifications/areasEditor.tsx";
import { BatchTagInput } from "./batchTagInput";
import { DisplayField } from "./displayField";
import { SurfacePrepPicker } from "@rbp/module-offers/src/components/surfacePrepPicker.tsx";
import { uuidv7 } from "@rbp/ui";
import type { DraftArea as AreaRow, DraftAreaProduct as AreaProductRow } from "./offline/types";

export type { PackagingInfo };
export type { AreaRow, AreaProductRow };

// Every row gets a real, final id immediately (client-generated UUIDv7),
// online or off - see utils/uuid.ts and ~/npm_tool/docs/dock-report-offline-sync.md.
// There's no "temporary local key vs. real server id" distinction to
// reconcile later; key and id are the same value throughout.
const blankProduct = (): AreaProductRow => {
  const id = uuidv7();
  return {
    key: id,
    id,
    product_packaging_id: null,
    coat_mode_phrase_id: null,
    coat_pct: null,
    application_method_phrase_id: null,
    dry_film_thickness_um: null,
    measured_dry_film_thickness_um: null,
    batches: [],
  };
};

const blankArea = (): AreaRow => {
  const id = uuidv7();
  return {
    key: id,
    id,
    area_id: null,
    size_m2: null,
    substrate_phrase_id: null,
    environment_standard_phrase_id: null,
    surface_preparation_text: null,
    actual_surface_preparation_text: null,
    remarks_text: null,
    fouling_extent_pct: null,
    fouling_evaluation_phrase_id: null,
    condition_comments_text: null,
    products: [],
  };
};

// Fork of specifications/areasEditor.tsx, one purpose narrower: no pricing,
// no DFT proposal (this is a record of what actually happened, not a quote) -
// just the actual-vs-spec fields ~/npm_tool/docs/dock-report-module.md calls for, plus
// the batch/drum tag input per coat line.
export const DockReportAreasEditor = ({
  areas,
  onChange,
  packagings,
  onPackagingsLoaded,
  areaOptions,
  substrateOptions,
  environmentOptions,
  coatModeOptions,
  applicationMethodOptions,
  foulingEvaluationOptions,
  surfacePrepOptions,
  disabled,
}: {
  areas: AreaRow[];
  onChange: (areas: AreaRow[]) => void;
  packagings: PackagingInfo[];
  onPackagingsLoaded: (list: PackagingInfo[]) => Promise<void>;
  areaOptions: Option[];
  substrateOptions: Option[];
  environmentOptions: Option[];
  coatModeOptions: Option[];
  applicationMethodOptions: Option[];
  foulingEvaluationOptions: Option[];
  surfacePrepOptions: Option[];
  disabled?: boolean;
}) => {
  const updateArea = (key: string, patch: Partial<AreaRow>) =>
    onChange(areas.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const updateProduct = (areaKey: string, productKey: string, patch: Partial<AreaProductRow>) =>
    onChange(
      areas.map((a) =>
        a.key === areaKey
          ? { ...a, products: a.products.map((p) => (p.key === productKey ? { ...p, ...patch } : p)) }
          : a,
      ),
    );

  const addArea = () => onChange([...areas, blankArea()]);
  const removeArea = (key: string) => onChange(areas.filter((a) => a.key !== key));
  const addProduct = (areaKey: string) =>
    onChange(areas.map((a) => (a.key === areaKey ? { ...a, products: [...a.products, blankProduct()] } : a)));
  const removeProduct = (areaKey: string, productKey: string) =>
    onChange(areas.map((a) => (a.key === areaKey ? { ...a, products: a.products.filter((p) => p.key !== productKey) } : a)));

  return (
    <Card
      title="Areas & Products"
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        !disabled && (
          <Button icon={<PlusOutlined />} onClick={addArea} size="small">
            Add area
          </Button>
        )
      }
    >
      <Table
        dataSource={areas}
        rowKey="key"
        pagination={false}
        size="small"
        scroll={{ x: "max-content" }}
        expandable={{
          defaultExpandAllRows: true,
          expandedRowRender: (area) => (
            <div style={{ paddingLeft: 24 }}>
              <Space wrap size="large" style={{ width: "100%", marginBottom: 12 }}>
                <div style={{ width: 260 }}>
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 11 }}>
                    Surface prep (from specification)
                  </Typography.Text>
                  {/* Always spec-derived, never editable here regardless of
                      overall edit mode - a DisplayField, not a disabled
                      control, so it reads as real data, not a broken field. */}
                  <DisplayField value={area.surface_preparation_text} multiline />
                </div>
                <div style={{ width: 260 }}>
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 11 }}>
                    Actual surface prep
                  </Typography.Text>
                  <SurfacePrepPicker
                    value={area.actual_surface_preparation_text}
                    onChange={(text) => updateArea(area.key, { actual_surface_preparation_text: text })}
                    options={surfacePrepOptions}
                    readOnly={disabled}
                  />
                </div>
                <div style={{ width: 120 }}>
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 11 }}>
                    Fouling extent %
                  </Typography.Text>
                  {disabled ? (
                    <DisplayField value={area.fouling_extent_pct != null ? `${area.fouling_extent_pct}%` : undefined} align="right" />
                  ) : (
                    <InputNumber
                      value={area.fouling_extent_pct}
                      onChange={(v) => updateArea(area.key, { fouling_extent_pct: v })}
                      addonAfter="%"
                      style={{ width: "100%" }}
                    />
                  )}
                </div>
                <div style={{ width: 180 }}>
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 11 }}>
                    Fouling evaluation
                  </Typography.Text>
                  {disabled ? (
                    <DisplayField value={foulingEvaluationOptions.find((o) => o.value === area.fouling_evaluation_phrase_id)?.label} />
                  ) : (
                    <Select
                      value={area.fouling_evaluation_phrase_id ?? undefined}
                      options={foulingEvaluationOptions}
                      onChange={(v) => updateArea(area.key, { fouling_evaluation_phrase_id: v })}
                      allowClear
                      style={{ width: "100%" }}
                    />
                  )}
                </div>
                <div style={{ width: 260 }}>
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 11 }}>
                    Condition comments
                  </Typography.Text>
                  <Input.TextArea
                    value={area.condition_comments_text ?? ""}
                    rows={2}
                    onChange={(e) => updateArea(area.key, { condition_comments_text: e.target.value })}
                    readOnly={disabled}
                  />
                </div>
              </Space>

              {area.products.map((product) => (
                <div key={product.key} style={{ border: "1px solid #EDEDED", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                  <Space wrap size="small" style={{ width: "100%", marginBottom: 6 }}>
                    {disabled ? (
                      <DisplayField value={packagings.find((p) => p.id === product.product_packaging_id)?.label} width={260} />
                    ) : (
                      <ProductPackagingSelect
                        value={product.product_packaging_id ?? undefined}
                        packagings={packagings}
                        onPackagingsLoaded={onPackagingsLoaded}
                        onChange={(val) => updateProduct(area.key, product.key, { product_packaging_id: val })}
                        style={{ width: 260 }}
                      />
                    )}
                    {disabled ? (
                      <DisplayField value={coatModeOptions.find((o) => o.value === product.coat_mode_phrase_id)?.label} width={150} />
                    ) : (
                      <Select
                        value={product.coat_mode_phrase_id ?? undefined}
                        options={coatModeOptions}
                        onChange={(val) => updateProduct(area.key, product.key, { coat_mode_phrase_id: val })}
                        style={{ width: 150 }}
                        placeholder="Coat mode"
                        allowClear
                      />
                    )}
                    {disabled ? (
                      <DisplayField value={product.coat_pct != null ? `${product.coat_pct}%` : undefined} width={90} align="right" />
                    ) : (
                      <InputNumber
                        value={product.coat_pct}
                        onChange={(val) => updateProduct(area.key, product.key, { coat_pct: val })}
                        placeholder="Coat %"
                        addonAfter="%"
                      />
                    )}
                    {disabled ? (
                      <DisplayField value={applicationMethodOptions.find((o) => o.value === product.application_method_phrase_id)?.label} width={150} />
                    ) : (
                      <Select
                        value={product.application_method_phrase_id ?? undefined}
                        options={applicationMethodOptions}
                        onChange={(val) => updateProduct(area.key, product.key, { application_method_phrase_id: val })}
                        style={{ width: 150 }}
                        placeholder="Application"
                        allowClear
                      />
                    )}
                    {/* Spec DFT is always spec-derived, never editable here -
                        same "DisplayField, not disabled" treatment as the
                        spec surface prep text above, regardless of edit mode. */}
                    <DisplayField value={product.dry_film_thickness_um} width={90} align="right" />
                    <InputNumber
                      value={product.measured_dry_film_thickness_um}
                      onChange={(val) => updateProduct(area.key, product.key, { measured_dry_film_thickness_um: val })}
                      placeholder="Measured DFT"
                      readOnly={disabled}
                      style={{ width: 110 }}
                    />
                    {!disabled && (
                      <Button icon={<DeleteOutlined />} danger size="small" onClick={() => removeProduct(area.key, product.key)} />
                    )}
                  </Space>
                  <BatchTagInput
                    batches={product.batches}
                    onChange={(batches) => updateProduct(area.key, product.key, { batches })}
                    disabled={disabled}
                  />
                </div>
              ))}
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
          render={(v, record: AreaRow) => {
            // Once an area is picked, it's locked - only a brand-new
            // ("Add area") row with no area_id yet stays pickable. Renaming
            // which physical area an existing row points to would silently
            // shift the meaning of every daily entry/photo/batch already
            // tagged to it.
            const locked = disabled || !!v;
            return locked ? (
              <DisplayField value={areaOptions.find((o) => o.value === v)?.label} />
            ) : (
              <Select
                value={v ?? undefined}
                options={areaOptions}
                onChange={(val) => updateArea(record.key, { area_id: val })}
                style={{ width: "100%" }}
                showSearch
                optionFilterProp="label"
              />
            );
          }}
        />
        <Table.Column
          title="Size (m2)"
          dataIndex="size_m2"
          width={100}
          align="right"
          render={(v, record: AreaRow) =>
            disabled ? (
              <DisplayField value={v} align="right" />
            ) : (
              <InputNumber value={v} onChange={(val) => updateArea(record.key, { size_m2: val })} />
            )
          }
        />
        <Table.Column
          title="Substrate"
          dataIndex="substrate_phrase_id"
          width={130}
          render={(v, record: AreaRow) =>
            disabled ? (
              <DisplayField value={substrateOptions.find((o) => o.value === v)?.label} />
            ) : (
              <Select
                value={v ?? undefined}
                options={substrateOptions}
                onChange={(val) => updateArea(record.key, { substrate_phrase_id: val })}
                style={{ width: "100%" }}
                allowClear
              />
            )
          }
        />
        <Table.Column
          title="Environment"
          dataIndex="environment_standard_phrase_id"
          width={140}
          render={(v, record: AreaRow) =>
            disabled ? (
              <DisplayField value={environmentOptions.find((o) => o.value === v)?.label} />
            ) : (
              <Select
                value={v ?? undefined}
                options={environmentOptions}
                onChange={(val) => updateArea(record.key, { environment_standard_phrase_id: val })}
                style={{ width: "100%" }}
                allowClear
              />
            )
          }
        />
        <Table.Column title="Coats" width={70} align="right" render={(_, record: AreaRow) => record.products.length} />
        {!disabled && (
          <Table.Column
            title=""
            width={50}
            render={(_, record: AreaRow) => <Button icon={<DeleteOutlined />} danger type="text" size="small" onClick={() => removeArea(record.key)} />}
          />
        )}
      </Table>
    </Card>
  );
};
