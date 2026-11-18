// One filter bar for both apps (docs/shared-parts.md B5): COMPASS's version (texts through i18n, quick search box,
// minChars, phone filter sheet fields) plus NPM's `alsoFields` and today in the user's time zone.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, DatePicker, Input, InputNumber, Modal, Select, Space, Tag, Typography } from "antd";
import { FilterOutlined } from "@ant-design/icons";
import type { CrudFilter, CrudFilters } from "@refinedev/core";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { RemoteSelect, nowInUserZone, todayIso, useIsMobile } from "@rbp/ui";
import { FilterSheet } from "./filterSheet";

// "Add filter" picks a column, a modal collects its values, each applied filter is a closable tag derived from Refine's
// URL-kept `filters` (every def round-trips through toFilters / fromFilters).

type Option = { value: string; label: string };
type NumberRange = { min?: number; max?: number };
type DateRange = { from?: string; to?: string };
type FilterValue = string[] | NumberRange | DateRange;

type BaseDef = { key: string; label: string };
// Free-text terms; a row matches if any term is contained in any of `fields`.
type TextFilterDef = BaseDef & { kind: "text"; fields: string[] };
// Options: `multiple` (default) = `in`, else `eq`. Large lists: `loadOptions` (server search) + `loadLabels` (names for
// URL values). `arrayField`: `field` is an array column matched against any chosen value.
type SelectFilterDef = BaseDef & {
  kind: "select";
  field: string;
  options?: Option[];
  multiple?: boolean;
  arrayField?: boolean;
  loadOptions?: (term: string) => Promise<Option[]>;
  loadLabels?: (ids: string[]) => Promise<Option[]>;
  // Further columns the value may match, as one keyed "or" filter (a company as itself and as its group).
  alsoFields?: string[];
  // Typed characters before the search runs (default 2); 0 lists a first page when the dropdown opens (teams: my own).
  minChars?: number;
};
type NumberRangeFilterDef = BaseDef & { kind: "numberRange"; field: string; unit?: string };
// `presetMonths` adds "next N months" quick-fill buttons to the modal.
type DateRangeFilterDef = BaseDef & { kind: "dateRange"; field: string; presetMonths?: number[] };
export type ListFilterDef = TextFilterDef | SelectFilterDef | NumberRangeFilterDef | DateRangeFilterDef;

const isEmpty = (v: FilterValue | undefined): boolean =>
  v === undefined || (Array.isArray(v) ? v.length === 0 : Object.values(v).every((x) => x == null));

const asStrings = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(String);

const asNumber = (v: unknown): number | undefined => (v == null || v === "" ? undefined : Number(v));

// setFilters merges: toFilters(def, undefined) yields the payload that removes a filter.
function toFilters(def: ListFilterDef, value: FilterValue | undefined): CrudFilters {
  const empty = isEmpty(value);
  switch (def.kind) {
    case "text": {
      const terms = empty ? [] : (value as string[]);
      return [
        {
          operator: "or",
          key: def.key,
          value: terms.flatMap((t) => def.fields.map((field) => ({ field, operator: "contains", value: t }))),
        },
      ] as CrudFilter[];
    }
    case "select": {
      const vals = empty ? [] : (value as string[]);
      if (def.arrayField) {
        return [{ operator: "or", key: def.key, value: vals.map((v) => ({ field: def.field, operator: "ina", value: [v] })) }] as CrudFilter[];
      }
      if (def.alsoFields) {
        const fields = [def.field, ...def.alsoFields];
        return [
          { operator: "or", key: def.key, value: vals.flatMap((v) => fields.map((field) => ({ field, operator: "eq", value: v }))) },
        ] as CrudFilter[];
      }
      return def.multiple === false
        ? [{ field: def.field, operator: "eq", value: vals[0] }]
        : [{ field: def.field, operator: "in", value: vals.length ? vals : undefined }];
    }
    case "numberRange": {
      const r = (empty ? {} : value) as NumberRange;
      return [
        { field: def.field, operator: "gte", value: r.min },
        { field: def.field, operator: "lte", value: r.max },
      ];
    }
    case "dateRange": {
      const r = (empty ? {} : value) as DateRange;
      return [
        { field: def.field, operator: "gte", value: r.from },
        { field: def.field, operator: "lte", value: r.to },
      ];
    }
  }
}

function fromFilters(def: ListFilterDef, filters: CrudFilters): FilterValue | undefined {
  const find = (field: string, operator: string) =>
    filters.find((f) => "field" in f && f.field === field && f.operator === operator)?.value;
  let value: FilterValue | undefined;
  switch (def.kind) {
    case "text": {
      const or = filters.find((f) => f.operator === "or" && "key" in f && f.key === def.key);
      const conditions = (or?.value ?? []) as { field: string; value: unknown }[];
      value = [...new Set(conditions.filter((c) => c.field === def.fields[0]).map((c) => String(c.value)))];
      break;
    }
    case "select": {
      if (def.arrayField) {
        const or = filters.find((f) => f.operator === "or" && "key" in f && f.key === def.key);
        const conditions = (or?.value ?? []) as { value: unknown }[];
        value = conditions.flatMap((c) => asStrings(c.value));
        break;
      }
      if (def.alsoFields) {
        const or = filters.find((f) => f.operator === "or" && "key" in f && f.key === def.key);
        const conditions = (or?.value ?? []) as { field: string; value: unknown }[];
        value = [...new Set(conditions.filter((c) => c.field === def.field).map((c) => String(c.value)))];
        break;
      }
      value = asStrings(find(def.field, def.multiple === false ? "eq" : "in"));
      break;
    }
    case "numberRange":
      value = { min: asNumber(find(def.field, "gte")), max: asNumber(find(def.field, "lte")) };
      break;
    case "dateRange":
      value = { from: find(def.field, "gte") as string | undefined, to: find(def.field, "lte") as string | undefined };
      break;
  }
  return isEmpty(value) ? undefined : value;
}

const fmtDate = (d: string) => dayjs(d).format("DD MMM YYYY");

function describe(def: ListFilterDef, value: FilterValue, remoteLabels: Record<string, string>): string {
  switch (def.kind) {
    case "text":
      return (value as string[]).map((t) => `"${t}"`).join(", ");
    case "select": {
      const labelOf = (v: string) => def.options?.find((o) => o.value === v)?.label ?? remoteLabels[v] ?? v;
      return (value as string[]).map(labelOf).join(", ");
    }
    case "numberRange": {
      const { min, max } = value as NumberRange;
      const unit = def.unit ? ` ${def.unit}` : "";
      if (min != null && max != null) return `${min.toLocaleString()} – ${max.toLocaleString()}${unit}`;
      return min != null ? `≥ ${min.toLocaleString()}${unit}` : `≤ ${max!.toLocaleString()}${unit}`;
    }
    case "dateRange": {
      const { from, to } = value as DateRange;
      if (from && to) return `${fmtDate(from)} – ${fmtDate(to)}`;
      return from ? `from ${fmtDate(from)}` : `until ${fmtDate(to!)}`;
    }
  }
}

const emptyDraft = (def: ListFilterDef): FilterValue => (def.kind === "text" || def.kind === "select" ? [] : {});

export function useListFilterBar(
  defs: ListFilterDef[],
  filters: CrudFilters,
  setFilters: (filters: CrudFilters) => void,
  // Text def that also gets a search box (`search`); a single term hides its chip.
  quickSearchKey?: string,
): { picker: ReactNode; chips: ReactNode; modal: ReactNode; search: ReactNode; fields: FilterField[]; edit: (key: string) => void } {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<{ def: ListFilterDef; draft: FilterValue } | null>(null);
  // The picker is an action menu: a new key after each pick resets it.
  const [pickerKey, setPickerKey] = useState(0);
  const isMobile = useIsMobile();

  const allActive = defs
    .map((def) => ({ def, value: fromFilters(def, filters) }))
    .filter((a): a is { def: ListFilterDef; value: FilterValue } => a.value !== undefined);
  const quickDef = defs.find((d): d is TextFilterDef => d.kind === "text" && d.key === quickSearchKey);
  const quickTerms = (allActive.find((a) => a.def === quickDef)?.value ?? []) as string[];
  const active = allActive.filter((a) => a.def !== quickDef || quickTerms.length > 1);
  const activeKeys = new Set(active.map((a) => a.def.key));

  // Labels of server-searched values: from search results seen, else loadLabels.
  const [remoteLabels, setRemoteLabels] = useState<Record<string, string>>({});
  const rememberLabels = (opts: Option[]) =>
    setRemoteLabels((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const o of opts) {
        if (next[o.value] !== o.label) {
          next[o.value] = o.label;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  const missingByDef = active.flatMap(({ def, value }) =>
    def.kind === "select" && def.loadLabels
      ? [{ load: def.loadLabels, ids: (value as string[]).filter((v) => !remoteLabels[v]) }]
      : [],
  );
  const missingKey = missingByDef.map((m) => m.ids.join(",")).join("|");
  useEffect(() => {
    for (const { load, ids } of missingByDef) if (ids.length) load(ids).then(rememberLabels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  const open = (def: ListFilterDef) =>
    setEditing({ def, draft: active.find((a) => a.def.key === def.key)?.value ?? emptyDraft(def) });

  const commit = () => {
    if (editing) setFilters(toFilters(editing.def, editing.draft));
    setEditing(null);
  };

  const pickerSelect = (
    <Select
      key={pickerKey}
      placeholder={t("filters.add")}
      suffixIcon={<FilterOutlined />}
      showSearch
      optionFilterProp="label"
      style={{ width: 180 }}
      options={defs.map((d) => ({ value: d.key, label: activeKeys.has(d.key) ? `${d.label} ✓` : d.label }))}
      onChange={(key: string) => {
        setPickerKey((k) => k + 1);
        const def = defs.find((d) => d.key === key);
        if (def) open(def);
      }}
    />
  );

  const chips = active.length ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: "100%", minWidth: 0 }}>
      {active.map(({ def, value }) => {
        const text = `${def.label}: ${describe(def, value, remoteLabels)}`;
        return (
          <Tag
            key={def.key}
            color="blue"
            closable
            onClose={() => setFilters(toFilters(def, undefined))}
            style={{ margin: 0, fontWeight: 400, fontSize: 13, display: "inline-flex", alignItems: "center", maxWidth: "min(420px, 100%)", minWidth: 0 }}
          >
            <span
              title={`${text} (click to edit)`}
              onClick={() => open(def)}
              style={{ cursor: "pointer", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {text}
            </span>
          </Tag>
        );
      })}
    </div>
  ) : null;

  const bodyRef = useRef<HTMLDivElement>(null);
  const modal = (
    <Modal
      open={!!editing}
      title={editing ? t("filters.title", { label: editing.def.label }) : ""}
      onCancel={() => setEditing(null)}
      // No footer (the dropdown would cover OK): OK sits beside the input.
      footer={null}
      destroyOnClose
      // antd's own focus handling wins over the inputs' autoFocus, so focus the first input once the modal is open.
      afterOpenChange={(open) => {
        if (open) bodyRef.current?.querySelector<HTMLElement>("input")?.focus();
      }}
      width={520}
    >
      {editing && (
        <div ref={bodyRef} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FilterModalBody
              def={editing.def}
              draft={editing.draft}
              onChange={(draft) => setEditing({ def: editing.def, draft })}
              remoteLabels={remoteLabels}
              onRemoteOptions={rememberLabels}
            />
          </div>
          <Button type="primary" onClick={commit} disabled={isEmpty(editing.draft)}>
            {t("filters.ok")}
          </Button>
        </div>
      )}
    </Modal>
  );

  const search = quickDef ? (
    <QuickSearch
      term={quickTerms.length === 1 ? quickTerms[0] : ""}
      onSearch={(term) => setFilters(toFilters(quickDef, term ? [term] : undefined))}
    />
  ) : null;

  // The picker's columns for the phone's filter sheet; `edit` opens the modal.
  const fields: FilterField[] = defs.filter((d) => d !== quickDef).map((d) => ({ key: d.key, label: d.label, active: activeKeys.has(d.key) }));
  const edit = (key: string) => {
    const def = defs.find((d) => d.key === key);
    if (def) open(def);
  };

  // Phone: COMPASS's "Filter" button with its bottom sheet (the columns; a tap opens the same modal) instead of the select.
  const picker = isMobile ? <FilterSheet fields={fields} onEdit={edit} /> : pickerSelect;
  return { picker, chips, modal, search, fields, edit };
}

export type FilterField = { key: string; label: string; active: boolean };

// Search box above a list (300 ms debounce). An outside change of `term` (chip closed, link) replaces the typed text.
function QuickSearch({ term, onSearch }: { term: string; onSearch: (term: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(term);
  const sent = useRef(term);
  useEffect(() => {
    if (term !== sent.current) {
      sent.current = term;
      setText(term);
    }
  }, [term]);
  useEffect(() => {
    const next = text.trim();
    if (next === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = next;
      onSearch(next);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <Input.Search
      allowClear
      placeholder={t("common.searchByName")}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onSearch={(v) => {
        sent.current = v.trim();
        onSearch(v.trim());
      }}
      style={{ width: 240 }}
    />
  );
}

function FilterModalBody({
  def,
  draft,
  onChange,
  remoteLabels,
  onRemoteOptions,
}: {
  def: ListFilterDef;
  draft: FilterValue;
  onChange: (draft: FilterValue) => void;
  remoteLabels: Record<string, string>;
  onRemoteOptions: (options: Option[]) => void;
}) {
  const { t } = useTranslation();
  switch (def.kind) {
    case "text":
      return (
        <>
          <Select
            mode="tags"
            open={false}
            autoFocus
            tokenSeparators={[","]}
            placeholder={t("filters.typeEnter", { label: def.label.toLowerCase() })}
            value={draft as string[]}
            onChange={(v) => onChange(v)}
            style={{ width: "100%" }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Add several values to match any of them.
          </Typography.Text>
        </>
      );
    case "select":
      if (def.loadOptions) {
        return (
          <RemoteSelect
            mode={def.multiple === false ? undefined : "multiple"}
            autoFocus
            placeholder={def.multiple === false ? t("filters.search", { label: def.label.toLowerCase() }) : t("filters.searchMany")}
            loadOptions={def.loadOptions}
            loadLabels={def.loadLabels}
            minChars={def.minChars}
            onOptions={onRemoteOptions}
            knownLabels={remoteLabels}
            value={def.multiple === false ? (draft as string[])[0] : (draft as string[])}
            onChange={(v) => onChange(v == null ? [] : Array.isArray(v) ? v : [v])}
          />
        );
      }
      return (
        <Select
          mode={def.multiple === false ? undefined : "multiple"}
          autoFocus
          showSearch
          optionFilterProp="label"
          allowClear
          placeholder={def.multiple === false ? t("filters.select", { label: def.label.toLowerCase() }) : t("filters.selectMany")}
          options={def.options ?? []}
          value={def.multiple === false ? (draft as string[])[0] : (draft as string[])}
          onChange={(v) => onChange(v == null ? [] : Array.isArray(v) ? v : [v])}
          style={{ width: "100%" }}
        />
      );
    case "numberRange": {
      const r = draft as NumberRange;
      return (
        <Space>
          <InputNumber
            autoFocus
            placeholder={t("filters.min")}
            value={r.min}
            onChange={(v) => onChange({ ...r, min: v ?? undefined })}
            style={{ width: 160 }}
          />
          <InputNumber placeholder={t("filters.max")} value={r.max} onChange={(v) => onChange({ ...r, max: v ?? undefined })} style={{ width: 160 }} />
        </Space>
      );
    }
    case "dateRange": {
      const r = draft as DateRange;
      return (
        <Space direction="vertical">
          <Space>
            <DatePicker
              placeholder={t("filters.from")}
              value={r.from ? dayjs(r.from) : null}
              onChange={(d) => onChange({ ...r, from: d ? d.format("YYYY-MM-DD") : undefined })}
            />
            <DatePicker
              placeholder={t("filters.to")}
              value={r.to ? dayjs(r.to) : null}
              onChange={(d) => onChange({ ...r, to: d ? d.format("YYYY-MM-DD") : undefined })}
            />
          </Space>
          {def.presetMonths && (
            <Space size={4} wrap>
              {def.presetMonths.map((m) => (
                <Button
                  key={m}
                  size="small"
                  onClick={() =>
                    onChange({ from: todayIso(), to: nowInUserZone().add(m, "month").format("YYYY-MM-DD") })
                  }
                >
                  Next {m} months
                </Button>
              ))}
            </Space>
          )}
        </Space>
      );
    }
  }
}
