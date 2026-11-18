// Ported 1:1 from the NPM tool (app/src/pages/shipyards/list.tsx).
import { useEffect, useState } from "react";
import { useTable } from "@rbp/core";
import { List } from "@rbp/core";
import { useNavigate } from "react-router-dom";
import { Tag, Typography } from "antd";
import { buildInFiltersUrl } from "@rbp/module-companies/src/utils/crossFilterNav.ts";
import { clickableRow, useListKeyNav } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { loadDistinctCountries, type CompanyOption } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { loadUserOptions, type UserOption } from "@rbp/module-companies/src/modules/users/users.ts";
import { ListTable, ListColumn } from "@rbp/ui";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { usePageBannerSubtitle } from "@rbp/core";
import { listCountSubtitle } from "@rbp/core";
import { loadCompanyChartColors, type CompanyChartColor } from "@rbp/module-companies/src/modules/companies/chartColors.ts";

// Companies of the type 'shipyard' (all SeaWeb shipbuilders carry it), read from shipyards_overview (migrations 20261014140000,
// 20261018110000). A row opens the company page. By default only yards we deal with are listed: usage_count (hull events +
// newbuilding projects) >= 1; remove the "Used" chip to see every shipbuilder.
type ShipyardRow = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  sales_account_user_name: string | null;
  nb_vessel_count: number;
  built_vessel_count: number;
  hull_event_count: number;
  usage_count: number;
  nb_hull_event_count: number;
  newbuilding_project_count: number;
  makers: string[];
};

// Black or white, whichever reads better on the given #rrggbb fill.
const contrastText = (hex: string) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.6 ? "#000" : "#fff";
};

export const ShipyardList = () => {
  const navigate = useNavigate();
  const { tableProps, filters, setFilters } = useTable<ShipyardRow>({
    resource: "shipyards_overview",
    syncWithLocation: true,
    pagination: { pageSize: 100 },
    sorters: { initial: [{ field: "usage_count", order: "desc" }] },
    filters: { initial: [{ field: "usage_count", operator: "gte", value: 1 }] },
  });
  // A count opens the list behind it; a zero stays plain text (empty list). The row click must not fire too.
  const countLink = (count: number, url: string) =>
    count > 0 ? (
      <a
        onClick={(e) => {
          e.stopPropagation();
          navigate(url);
        }}
      >
        {count}
      </a>
    ) : (
      <span>{count}</span>
    );
  useListKeyNav(tableProps.dataSource, "companies");
  usePageBannerSubtitle(listCountSubtitle("shipyards", tableProps.pagination));

  const [countryOptions, setCountryOptions] = useState<CompanyOption[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [chartColors, setChartColors] = useState<Map<string, CompanyChartColor>>(new Map());
  useEffect(() => {
    loadCompanyChartColors().then(setChartColors);
    loadDistinctCountries().then(setCountryOptions);
    loadUserOptions().then(setUserOptions);
  }, []);

  const filterDefs: ListFilterDef[] = [
    { key: "name", label: "Name", kind: "text", fields: ["name"] },
    { key: "city", label: "City", kind: "text", fields: ["city"] },
    { key: "country", label: "Country", kind: "select", field: "country", options: countryOptions },
    { key: "sales_account_user_id", label: "Salesperson", kind: "select", field: "sales_account_user_id", options: userOptions },
    { key: "usage_count", label: "Hull events + projects", kind: "numberRange", field: "usage_count" },
    { key: "built_vessel_count", label: "Vessels built", kind: "numberRange", field: "built_vessel_count" },
    { key: "nb_vessel_count", label: "NB vessels", kind: "numberRange", field: "nb_vessel_count" },
    { key: "newbuilding_project_count", label: "Newbuilding projects", kind: "numberRange", field: "newbuilding_project_count" },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters);

  return (
    <List toolbar={filterBar.chips} headerButtons={filterBar.picker}>
      {filterBar.modal}
      <ListTable<ShipyardRow> {...tableProps} rowKey="id" onRow={clickableRow<ShipyardRow>(navigate, "/companies")}>
        <ListColumn<ShipyardRow>
          minWidth={260}
          title="Name"
          dataIndex="name"
          sorter
          render={(v: string, r) => (
            <div>
              <div>{v}</div>
              <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                {[r.city, r.country].filter(Boolean).join(" | ") || "—"}
              </Typography.Text>
            </div>
          )}
        />
        <ListColumn<ShipyardRow>
          minWidth={110}
          title="Hull events"
          dataIndex="hull_event_count"
          align="right"
          sorter
          render={(v: number, r) => countLink(v, buildInFiltersUrl("/hull-events", [{ field: "shipyard_company_id", values: [r.id] }]))}
        />
        <ListColumn<ShipyardRow>
          minWidth={110}
          title="NB vessels"
          dataIndex="nb_vessel_count"
          align="right"
          sorter
          render={(v: number, r) =>
            countLink(v, buildInFiltersUrl("/hull-events", [{ field: "type_code", values: ["NB"] }, { field: "shipyard_company_id", values: [r.id] }]))
          }
        />
        <ListColumn<ShipyardRow>
          minWidth={150}
          title="Newbuilding projects"
          dataIndex="newbuilding_project_count"
          align="right"
          sorter
          render={(v: number, r) => countLink(v, buildInFiltersUrl("/newbuildings", [{ field: "shipyard_company_id", values: [r.id] }]))}
        />
        <ListColumn<ShipyardRow>
          minWidth={120}
          title="Vessels built"
          dataIndex="built_vessel_count"
          align="right"
          sorter
          render={(v: number) => v.toLocaleString()}
        />
        <ListColumn<ShipyardRow>
          minWidth={240}
          title="Makers (projects, 3 yrs)"
          dataIndex="makers"
          render={(v: string[]) => (v?.length ? v.map((m) => {
                  // m is "Name (n)"; the company color is keyed by the name / short code before the count.
                  const c = chartColors.get(m.replace(/ \(\d+\)$/, ""));
                  const text = c?.color ? (c.textColor ?? contrastText(c.color)) : undefined;
                  return (
                    <Tag key={m} style={c?.color ? { background: c.color, borderColor: c.color, color: text } : undefined}>
                      {m}
                    </Tag>
                  );
                }) : "—")}
        />
        <ListColumn<ShipyardRow>
          minWidth={170}
          title="Salesperson"
          dataIndex="sales_account_user_name"
          sorter
          render={(v: string | null) => v ?? "—"}
        />
      </ListTable>
    </List>
  );
};
