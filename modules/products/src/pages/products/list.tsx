// Ported 1:1 from the NPM tool (app/src/pages/products/list.tsx).
import { useTable } from "@rbp/core";
// Platform: the main "new" action as COMPASS does it (round + button on a phone).
import { NewButton } from "@rbp/core";
import { List } from "@rbp/core";
import { useNavigate } from "react-router-dom";
import { Tag, Space } from "antd";
import { clickableRow } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { usePageBannerSubtitle } from "@rbp/core";
import { listCountSubtitle } from "@rbp/core";
import { ListTable, ListColumn } from "@rbp/ui";

type ProductRow = {
  id: string;
  code: string;
  name: string;
  colour: string | null;
  is_mix: boolean;
  category_phrase: { text_en: string } | null;
  group_phrase: { text_en: string } | null;
};

// Filters are added via the "Add filter" picker + modal (see
// components/listFilterBar.tsx). Group/Category aren't offered: they're
// embedded phrase relations rather than columns on the products table itself.
const FILTER_DEFS: ListFilterDef[] = [
  { key: "code", label: "Code", kind: "text", fields: ["code"] },
  { key: "name", label: "Name", kind: "text", fields: ["name"] },
  { key: "colour", label: "Colour", kind: "text", fields: ["colour"] },
  {
    key: "is_mix",
    label: "Mix",
    kind: "select",
    field: "is_mix",
    multiple: false,
    options: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
  },
];

export const ProductList = () => {
  const navigate = useNavigate();
  const { tableProps, filters, setFilters } = useTable<ProductRow>({
    resource: "products",
    syncWithLocation: true,
    pagination: { pageSize: 100 },
    meta: {
      select: "id, code, name, colour, is_mix, category_phrase:category_phrase_id(text_en), group_phrase:group_phrase_id(text_en)",
    },
    sorters: { initial: [{ field: "code", order: "asc" }] },
  });
  usePageBannerSubtitle(listCountSubtitle("products", tableProps.pagination));
  const filterBar = useListFilterBar(FILTER_DEFS, filters, setFilters);

  return (
    <List
      toolbar={filterBar.chips}
      headerButtons={
        <Space wrap>
          {filterBar.picker}
          <NewButton label={"New Product"} onClick={() => navigate("/products/new")} />
        </Space>
      }
    >
      {filterBar.modal}
      <ListTable<ProductRow>
        {...tableProps}
        rowKey="id"
        onRow={clickableRow(navigate, "/products")}
      >
        <ListColumn<ProductRow> dataIndex="code" title="Code" sorter width={140} />
        <ListColumn<ProductRow> minWidth={240} dataIndex="name" title="Name" sorter />
        <ListColumn minWidth={100} dataIndex="colour" title="Colour" />
        <ListColumn minWidth={160} dataIndex={["group_phrase", "text_en"]} title="Group" />
        <ListColumn minWidth={160} dataIndex={["category_phrase", "text_en"]} title="Category" />
        <ListColumn dataIndex="is_mix" title="Mix" render={(v: boolean) => (v ? <Tag color="blue">Mix</Tag> : null)} />
      </ListTable>
    </List>
  );
};
