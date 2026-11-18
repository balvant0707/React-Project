import { IdcardOutlined, ReadOutlined, UserOutlined } from "@ant-design/icons";
import { highlight, registerSearchType, type SearchType } from "@rbp/core";

// People, positions and trainings in the platform search (people_search, positions_search, trainings_search): name and
// subtitle. COMPASS globalSearch.tsx, cases "people", "positions", "trainings".
const line: SearchType["line"] = (r, term) => ({ primary: highlight(r.title, term), secondary: r.subtitle ? highlight(r.subtitle, term) : null });
registerSearchType({ entityType: "people", order: 150, icon: <UserOutlined />, path: (r) => `/people/${r.id}`, line });
registerSearchType({ entityType: "positions", order: 151, icon: <IdcardOutlined />, path: (r) => `/positions/${r.id}`, line });
registerSearchType({ entityType: "trainings", order: 152, icon: <ReadOutlined />, path: () => "/trainings", line });
