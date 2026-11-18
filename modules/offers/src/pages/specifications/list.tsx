// Ported 1:1 from the NPM tool (app/src/pages/specifications/list.tsx).
import { useTable } from "@rbp/core";
import { List } from "@rbp/core";
import { useNavigate } from "react-router-dom";
import { Tag } from "antd";
import { useListRowProps, rowLabel, useListKeyNav, attachmentsColumn, notesColumn } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { formatDate } from "@rbp/ui";
import { ENTITY_CONFIG } from "@rbp/module-offers/src/entityTypes.ts";
import { useNotesPanel, useListNotes } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { usePageBannerSubtitle } from "@rbp/core";
import { listCountSubtitle } from "@rbp/core";
import { ListTable, ListColumn } from "@rbp/ui";

type SpecificationOverviewRow = {
  id: string;
  specification_number: string;
  version: number;
  status: "draft" | "accepted" | "lost";
  specification_date: string | null;
  team_name: string | null;
  vessel_name: string | null;
  has_attachments: boolean;
  has_messages: boolean;
};

// Filters are added via the "Add filter" picker + modal (see
// components/listFilterBar.tsx).
const FILTER_DEFS: ListFilterDef[] = [
  { key: "specification_number", label: "Number", kind: "text", fields: ["specification_number"] },
  { key: "vessel_name", label: "Vessel", kind: "text", fields: ["vessel_name"] },
  { key: "team_name", label: "Owner Associate", kind: "text", fields: ["team_name"] },
  {
    key: "status",
    label: "Status",
    kind: "select",
    field: "status",
    options: [
      { value: "accepted", label: "Accepted" },
      { value: "draft", label: "Draft" },
      { value: "lost", label: "Lost" },
    ],
  },
  { key: "specification_date", label: "Date", kind: "dateRange", field: "specification_date" },
];

export const SpecificationList = () => {
  const navigate = useNavigate();
  const { openEntity } = useNotesPanel();
  useListNotes();
  const listRowProps = useListRowProps<SpecificationOverviewRow>(navigate, ENTITY_CONFIG.specifications.listPath!, "specifications");
  const { tableProps, filters, setFilters } = useTable<SpecificationOverviewRow>({
    resource: "specifications_overview",
    syncWithLocation: true,
    pagination: { pageSize: 100 },
    sorters: { initial: [{ field: "specification_date", order: "desc" }] },
  });
  useListKeyNav(tableProps.dataSource, "specifications");
  usePageBannerSubtitle(listCountSubtitle("specifications", tableProps.pagination));
  const filterBar = useListFilterBar(FILTER_DEFS, filters, setFilters);

  return (
    <List
      toolbar={filterBar.chips}
      headerButtons={filterBar.picker}
    >
      {filterBar.modal}
      <ListTable<SpecificationOverviewRow>
        {...tableProps}
        rowKey="id"
        onRow={listRowProps}
      >
        <ListColumn<SpecificationOverviewRow>
          minWidth={150}
          title="Number"
          dataIndex="specification_number"
          sorter
          render={(_, r) => `${r.specification_number} - v${r.version}`}
        />
        <ListColumn<SpecificationOverviewRow> minWidth={180} dataIndex="vessel_name" title="Vessel" sorter />
        <ListColumn<SpecificationOverviewRow> minWidth={100} dataIndex="team_name" title="Owner Associate" sorter />
        <ListColumn
          dataIndex="status"
          title="Status"
          sorter
          render={(v: SpecificationOverviewRow["status"]) =>
            v === "accepted" ? <Tag color="green">Accepted</Tag> : v === "lost" ? <Tag color="red">Lost</Tag> : <Tag>Draft</Tag>
          }
        />
        {notesColumn<SpecificationOverviewRow>((r) => openEntity({ type: "specifications", id: r.id, label: rowLabel("specifications", r) }))}
        {attachmentsColumn<SpecificationOverviewRow>()}
        <ListColumn dataIndex="specification_date" title="Date" sorter render={formatDate} />
      </ListTable>
    </List>
  );
};
