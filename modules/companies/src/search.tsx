import { ApartmentOutlined, CrownOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { highlight, registerSearchType } from "@rbp/core";

// Companies in the platform search (public.companies_search): as in NPM's header search (components/globalSearch.tsx), the
// name with a crown for a group company (status 'group'), the short code below.
registerSearchType({
  entityType: "companies",
  order: 10,
  groupLabel: "Companies",
  icon: <ApartmentOutlined />,
  path: (r) => `/companies/${r.id}`,
  line: (r, term) => ({
    primary: (
      <>
        {highlight(r.title, term)}
        {r.status === "group" && (
          <Tooltip title="Group company (has subsidiaries)">
            <CrownOutlined style={{ marginLeft: 6, color: "#d48806", fontSize: 11 }} />
          </Tooltip>
        )}
      </>
    ),
    secondary: r.subtitle && r.subtitle !== r.title ? highlight(r.subtitle, term) : null,
  }),
});
