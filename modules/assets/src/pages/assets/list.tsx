// Ported 1:1 from COMPASS (app/src/pages/assets/list.tsx).
import { useState, type ReactNode } from "react";
import { AssetNumbers } from "@rbp/module-task-family/src/pages/dashboard/widgets.tsx";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTable } from "@rbp/core";
import { stringifyTableParams, type CrudFilter } from "@rbp/core";
import { Badge, Breadcrumb, Button, Segmented, Space, Spin, Table, Tag, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import type { ColumnType } from "antd/es/table";
import { ApartmentOutlined, PlusOutlined, PrinterOutlined, RightOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { List } from "@rbp/core";
import { StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { AssetIcon } from "@rbp/module-task-family/src/components/masterLooks.tsx";
import { FilterChips } from "@rbp/module-task-family/src/components/filterChips.tsx";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { ManageColumnsButton } from "@rbp/ui";
import { SortButton } from "@rbp/core";
import { MobileCardList } from "@rbp/core";
import { loadAssetLabels, searchParentAssetOptions } from "@rbp/module-task-family/src/components/assetSelect.tsx";
import { useColumnVisibility } from "@rbp/ui";
import { formatDate } from "@rbp/ui";
import { useIsMobile } from "@rbp/ui";
import { supabaseClient } from "@rbp/core";
import { localName, pickName, sortByName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { ASSET_STATUSES, type AssetOverviewRow } from "@rbp/module-task-family/src/lib/domain.ts";
import { useAssetAttributes } from "../../hooks/useAssetAttributes";
import { attributeField, attributeKey, formatAttributeValue, type AssetAttribute } from "../../lib/assetAttributes";
import { AssetFormModal } from "./assetForm";
import { ASSET_TREE_KEY, parentIds, useAssetLevel, useBrowseTree, useFilteredTree, type AssetTreeRow } from "./assetTree";

const OPTIONAL_COLUMNS = ["path", "type", "status", "tickets", "manufacturer", "serialNumber", "location", "responsible"] as const;
const DEFAULT_VISIBLE = ["path", "type", "tickets"];
// Attribute columns are optional too, keyed "attr:<id>".
const attrColumn = (a: AssetAttribute) => `attr:${a.id}`;

type View = "tree" | "flat";

// A filter that narrows the rows (Refine keeps cleared ones with an empty value).
const isSet = (f: CrudFilter): boolean =>
  f.operator === "or" || f.operator === "and"
    ? (f.value as CrudFilter[]).length > 0
    : f.value != null && f.value !== "" && !(Array.isArray(f.value) && f.value.length === 0);
const isGroupingFilter = (f: CrudFilter) => "field" in f && f.field === "is_grouping";

// The asset page (/assets): one table in two views with the same columns, filters and server-side paging.
// - Tree (default): rows fold open one by one, children load when a row opens (assetTree.ts); filtered: one page of
// matches in their place in the tree, ancestors grey. Phone: one level at a time as cards.
// - List (?view=flat): every asset flat, without grouping nodes by default, sorted by the next due task.
// A user sees the nodes their grants reach. Next task and open counts come from assets_overview; every asset
// attribute can be a column and a filter.
export const AssetList = () => {
  const { data: attributes } = useAssetAttributes();
  const [searchParams] = useSearchParams();
  const view: View = searchParams.get("view") === "flat" ? "flat" : "tree";
  // The column choice is validated against the known keys on first render, so wait for the attributes.
  if (!attributes) return <Spin />;
  // A new view starts its table state afresh from the URL (initial filters and sorting differ).
  return <AssetListView key={view} view={view} attributes={attributes} />;
};

const AssetListView = ({ view, attributes }: { view: View; attributes: AssetAttribute[] }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const today = dayjs().format("YYYY-MM-DD");
  const [searchParams, setSearchParams] = useSearchParams();
  const newChildOf = searchParams.get("newChildOf");
  const [creating, setCreating] = useState(false);
  const isTree = view === "tree";
  // The asset page links here with ?newChildOf=<id>; the table's own URL state stays.
  const dropNewChildOf = () =>
    setSearchParams((prev) => {
      prev.delete("newChildOf");
      return prev;
    });

  // Holds filters, sorting and paging (synced with the URL) for both views; it fetches the rows only for the list.
  const { tableProps, filters, setFilters, sorters, setSorters, currentPage, setCurrentPage, pageSize } = useTable<AssetOverviewRow>({
    resource: "assets_overview",
    syncWithLocation: true,
    pagination: { pageSize: 50 },
    sorters: { initial: isTree ? [{ field: "name", order: "asc" }] : [{ field: "next_task_due_date", order: "asc" }, { field: "name", order: "asc" }] },
    filters: { initial: isTree ? [] : [{ field: "is_grouping", operator: "eq", value: false }] },
    queryOptions: { enabled: !isTree },
  });
  const activeFilters = filters.filter(isSet);
  const filtered = activeFilters.length > 0;

  // Tree view, browsing: opened rows (null = the default, see useBrowseTree). Filtered: every row starts open.
  const [open, setOpen] = useState<string[] | null>(null);
  const [closed, setClosed] = useState<string[]>([]);
  const browse = useBrowseTree(sorters, currentPage, pageSize, open, isTree && !filtered && !isMobile);
  const matches = useFilteredTree(activeFilters, sorters, currentPage, pageSize, isTree && filtered);
  // Phone, tree view, browsing: one level at a time, the way down as a breadcrumb.
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [levelPage, setLevelPage] = useState(1);
  const level = useAssetLevel(trail.at(-1)?.id ?? null, sorters, levelPage, pageSize, isTree && !filtered && isMobile);

  const columnKeys = [...OPTIONAL_COLUMNS, ...attributes.map(attrColumn)];
  const [visible, setVisible] = useColumnVisibility("compass.assets.columns", columnKeys, DEFAULT_VISIBLE);
  // The tree shows the path itself.
  const show = (key: (typeof OPTIONAL_COLUMNS)[number]) => visible.includes(key) && !(isTree && key === "path");

  const { data: assetTypes } = useQuery({
    queryKey: ["asset-types"],
    queryFn: async () => ((await supabaseClient.from("asset_types").select("id, name, name_de").order("name")).data ?? []) as { id: string; name: string; name_de: string }[],
  });

  const filterDefs: ListFilterDef[] = [
    { kind: "text", key: "search", label: t("common.search"), fields: ["name", "serial_number", "manufacturer", "location"] },
    { kind: "select", key: "below", label: t("assets.below"), field: "ancestor_asset_ids", arrayField: true, loadOptions: searchParentAssetOptions, loadLabels: loadAssetLabels },
    { kind: "select", key: "type", label: t("fields.assetType"), field: "asset_type_id", options: sortByName(assetTypes).map((a) => ({ value: a.id, label: localName(a) })) },
    { kind: "select", key: "status", label: t("fields.status"), field: "status", options: ASSET_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })) },
    { kind: "dateRange", key: "due", label: t("assets.nextDue"), field: "next_task_due_date", presetMonths: [1, 3] },
    ...attributes.map((a): ListFilterDef => {
      const base = { key: attrColumn(a), label: a.name };
      switch (a.data_type) {
        case "number":
          return { ...base, kind: "numberRange", field: attributeField(a), unit: a.unit ?? undefined };
        case "date":
          return { ...base, kind: "dateRange", field: attributeField(a) };
        case "boolean":
          return { ...base, kind: "select", field: attributeField(a), multiple: false, options: [{ value: "true", label: t("common.yes") }, { value: "false", label: t("common.no") }] };
        default:
          return { ...base, kind: "text", fields: [attributeField(a)] };
      }
    }),
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters, "search");

  const has = (field: string, operator: string, value?: unknown) =>
    filters.some((f) => "field" in f && f.field === field && f.operator === operator && (value === undefined || String(f.value) === String(value)));
  const equipmentOnly = has("is_grouping", "eq", false);
  const withTasks = has("open_task_count", "gte", 1);
  const overdue = has("next_task_due_date", "lt");

  // Switching keeps the filters, except "without grouping nodes": the list starts with it, the tree without it.
  const switchView = (next: View) => {
    const kept = activeFilters.filter((f) => !isGroupingFilter(f));
    const nextFilters: CrudFilter[] = next === "flat" && kept.length === 0 ? [{ field: "is_grouping", operator: "eq", value: false }] : kept;
    const query = stringifyTableParams({ filters: nextFilters, sorters: [], view: next === "flat" ? "flat" : undefined });
    navigate(`${location.pathname}${query ? `?${query}` : ""}`);
  };

  // An open count links straight to the matching tab of the asset page.
  const countLink = (r: AssetOverviewRow, count: number, tab: "tasks" | "tickets", color: string) =>
    count > 0 ? (
      <Typography.Link
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/assets/${r.id}?tab=${tab}`);
        }}
      >
        <Badge count={count} color={color} overflowCount={999} />
      </Typography.Link>
    ) : (
      "—"
    );

  const dueDate = (r: AssetOverviewRow) => {
    if (!r.next_task_id) return "—";
    const date = r.next_task_due_date ? formatDate(r.next_task_due_date) : t("assets.noDueDate");
    const late = !!r.next_task_due_date && r.next_task_due_date < today;
    return (
      <Tooltip title={r.next_task_title}>
        <Typography.Link
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/tasks/${r.next_task_id}`);
          }}
        >
          {late ? <Tag color="red" style={{ marginInlineEnd: 0 }}>{date}</Tag> : date}
        </Typography.Link>
      </Tooltip>
    );
  };

  const column = (c: Omit<ColumnType<AssetTreeRow>, "render"> & { render: (row: AssetTreeRow) => ReactNode }): ColumnType<AssetTreeRow> => ({
    ...c,
    key: String(c.dataIndex),
    // A row that waits for its children shows a spinner in the name column and nothing else.
    render: (_: unknown, r: AssetTreeRow) => (r.placeholder ? (c.dataIndex === "name" ? <Spin size="small" /> : null) : c.render(r)),
  });
  const columns: ColumnType<AssetTreeRow>[] = [
    column({
      dataIndex: "name",
      title: t("fields.name"),
      sorter: true,
      render: (r) => (
        <Space size={8} wrap={false}>
          <AssetIcon icon={r.effective_icon} grouping={r.is_grouping} />
          <Typography.Text type={r.context ? "secondary" : undefined}>{r.name}</Typography.Text>
        </Space>
      ),
    }),
    ...(show("path") ? [column({ dataIndex: "ancestor_path_label", title: t("assets.columns.path"), render: (r) => <Typography.Text type="secondary">{r.ancestor_path_label ?? "—"}</Typography.Text> })] : []),
    ...(show("type") ? [column({ dataIndex: "asset_type_name", title: t("fields.assetType"), render: (r) => (r.asset_type_name ? pickName(r.asset_type_name, r.asset_type_name_de) : "—") })] : []),
    ...(show("status") ? [column({ dataIndex: "status", title: t("fields.status"), sorter: true, render: (r) => <StatusTag status={r.status} /> })] : []),
    column({ dataIndex: "open_task_count", title: t("assets.openTasks"), sorter: true, align: "center", render: (r) => countLink(r, r.open_task_count, "tasks", "blue") }),
    column({ dataIndex: "next_task_due_date", title: t("assets.nextDue"), sorter: true, render: dueDate }),
    ...(show("tickets") ? [column({ dataIndex: "open_ticket_count", title: t("assets.openTickets"), sorter: true, align: "center", render: (r) => countLink(r, r.open_ticket_count, "tickets", "orange") })] : []),
    ...(show("manufacturer") ? [column({ dataIndex: "manufacturer", title: t("fields.manufacturer"), sorter: true, render: (r) => r.manufacturer ?? "—" })] : []),
    ...(show("serialNumber") ? [column({ dataIndex: "serial_number", title: t("fields.serialNumber"), render: (r) => r.serial_number ?? "—" })] : []),
    ...(show("location") ? [column({ dataIndex: "location", title: t("fields.location"), sorter: true, render: (r) => r.location ?? "—" })] : []),
    ...(show("responsible") ? [column({ dataIndex: "responsible_user_name", title: t("fields.responsible"), render: (r) => r.responsible_user_name ?? "—" })] : []),
    ...attributes
      .filter((a) => visible.includes(attrColumn(a)))
      .map((a) =>
        column({
          // The PostgREST path doubles as the sort field.
          dataIndex: attributeField(a),
          title: a.name,
          sorter: true,
          align: a.data_type === "number" ? "right" : undefined,
          render: (r) => formatAttributeValue(t, a, r.attribute_values?.[attributeKey(a.id)]),
        }),
      ),
  ];

  const onRow = (r: AssetTreeRow) =>
    r.placeholder ? {} : { style: { cursor: "pointer" as const }, onClick: () => navigate(`/assets/${r.id}`) };

  // Tree rows come from assetTree.ts; paging, sorting and the filter state stay with useTable.
  const tree = filtered ? matches : browse;
  const treePagination = tableProps.pagination ? { ...tableProps.pagination, total: tree.total } : false;
  const expandedRowKeys = filtered ? parentIds(matches.rows).filter((id) => !closed.includes(id)) : browse.openIds;
  const onExpand = (expanded: boolean, row: AssetTreeRow) => {
    if (filtered) setClosed((prev) => (expanded ? prev.filter((id) => id !== row.id) : [...prev, row.id]));
    else setOpen(expanded ? [...browse.openIds, row.id] : browse.openIds.filter((id) => id !== row.id));
  };

  const card = (r: AssetOverviewRow, withPath: boolean) => ({
    title: (
      <Space size={8}>
        <AssetIcon icon={r.effective_icon} grouping={r.is_grouping} />
        {r.name}
      </Space>
    ),
    subtitle: withPath ? r.ancestor_path_label : undefined,
    tags: (
      <>
        {r.asset_type_name && <Tag>{pickName(r.asset_type_name, r.asset_type_name_de)}</Tag>}
        {r.status !== "active" && <StatusTag status={r.status} />}
        {r.open_ticket_count > 0 && <Badge count={r.open_ticket_count} color="orange" title={t("assets.openTickets")} />}
      </>
    ),
    footer:
      r.next_task_id || r.child_count > 0 ? (
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <span>
            {r.next_task_id &&
              `${t("assets.nextDue")}: ${r.next_task_due_date ? formatDate(r.next_task_due_date) : t("assets.noDueDate")} · ${r.next_task_title} · ${t("assets.openTaskCount", { count: r.open_task_count })}`}
          </span>
          {/* Only while browsing the tree: one level down. */}
          {isTree && !filtered && r.child_count > 0 && (
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setTrail((prev) => [...prev, { id: r.id, name: r.name }]);
                setLevelPage(1);
              }}
            >
              {t("assets.childCount", { count: r.child_count })} <RightOutlined />
            </Button>
          )}
        </Space>
      ) : undefined,
  });

  const mobileBody = () => {
    const openAsset = (r: AssetOverviewRow) => navigate(`/assets/${r.id}`);
    if (!isTree) return <MobileCardList<AssetOverviewRow> tableProps={tableProps} onOpen={openAsset} render={(r) => card(r, true)} />;
    if (filtered) {
      const props = { dataSource: matches.matches, loading: matches.isLoading, pagination: { current: currentPage, pageSize, total: matches.total, onChange: setCurrentPage } };
      return <MobileCardList<AssetOverviewRow> tableProps={props} onOpen={openAsset} render={(r) => card(r, true)} />;
    }
    const props = { dataSource: level.data?.rows ?? [], loading: level.isLoading, pagination: { current: levelPage, pageSize, total: level.data?.total ?? 0, onChange: setLevelPage } };
    return (
      <>
        {trail.length > 0 && (
          <Breadcrumb
            style={{ marginBottom: 12 }}
            items={[{ id: "", name: t("assets.allAssets") }, ...trail].map((step, i) => ({
              title:
                i === trail.length ? (
                  step.name
                ) : (
                  <Typography.Link
                    onClick={() => {
                      setTrail(trail.slice(0, i));
                      setLevelPage(1);
                    }}
                  >
                    {step.name}
                  </Typography.Link>
                ),
            }))}
          />
        )}
        <MobileCardList<AssetOverviewRow> tableProps={props} onOpen={openAsset} render={(r) => card(r, false)} />
      </>
    );
  };

  return (
    <List
      title={t("nav.assets")}
      hint={t("assets.listHint")}
      toolbar={filterBar.chips}
      headerButtons={
        <>
          <Segmented<View>
            value={view}
            onChange={switchView}
            options={[
              { value: "tree", icon: <ApartmentOutlined />, label: t("assets.viewTree") },
              { value: "flat", icon: <UnorderedListOutlined />, label: t("assets.viewList") },
            ]}
          />
          {filterBar.search}
          {filterBar.picker}
          <FilterChips
            items={[
              { key: "equipment", label: t("assets.equipmentOnly"), checked: equipmentOnly, onChange: (on) => setFilters([{ field: "is_grouping", operator: "eq", value: on ? false : undefined }]) },
              { key: "tasks", label: t("assets.withOpenTasks"), checked: withTasks, onChange: (on) => setFilters([{ field: "open_task_count", operator: "gte", value: on ? 1 : undefined }]) },
              { key: "overdue", label: t("tasks.overdue"), checked: overdue, onChange: (on) => setFilters([{ field: "next_task_due_date", operator: "lt", value: on ? today : undefined }]) },
            ]}
          />
          {/* On a phone there is no table header to click; in the tree the order holds within each level. */}
          {isMobile && (
            <SortButton
              options={[
                { key: "name", label: t("common.sortOptions.name"), field: "name", order: "asc" },
                { key: "nextDue", label: t("common.sortOptions.nextDue"), field: "next_task_due_date", order: "asc" },
                { key: "changed", label: t("common.sortOptions.changed"), field: "updated_at", order: "desc" },
              ]}
              sorters={sorters}
              onChange={setSorters}
            />
          )}
          {!isMobile && (
            <ManageColumnsButton
              options={[
                ...OPTIONAL_COLUMNS.map((key) => ({ key, label: t(`assets.columns.${key}`) })),
                ...attributes.map((a) => ({ key: attrColumn(a), label: a.name })),
              ]}
              visible={visible}
              onChange={setVisible}
            />
          )}
          <Button icon={<PrinterOutlined />} onClick={() => navigate("/assets/labels")}>
            {t("assets.printLabels")}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            {t("assets.new")}
          </Button>
        </>
      }
    >
      {filterBar.modal}
      <AssetNumbers />
      {isMobile ? (
        mobileBody()
      ) : isTree ? (
        <Table<AssetTreeRow>
          {...(tableProps as TableProps<AssetTreeRow>)}
          rowKey="id"
          columns={columns}
          dataSource={tree.rows}
          loading={tree.isLoading}
          pagination={treePagination}
          onRow={onRow}
          scroll={{ x: true }}
          indentSize={20}
          expandable={{ expandedRowKeys, onExpand }}
        />
      ) : (
        <Table<AssetTreeRow> {...(tableProps as TableProps<AssetTreeRow>)} rowKey="id" columns={columns} onRow={onRow} scroll={{ x: true }} />
      )}
      <AssetFormModal
        open={creating || !!newChildOf}
        defaultParentId={newChildOf}
        onClose={() => {
          setCreating(false);
          if (newChildOf) dropNewChildOf();
        }}
        onSaved={(id) => {
          setCreating(false);
          void queryClient.invalidateQueries({ queryKey: [ASSET_TREE_KEY] });
          navigate(`/assets/${id}`);
        }}
      />
    </List>
  );
};
