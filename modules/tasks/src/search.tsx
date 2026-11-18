import { CheckSquareOutlined } from "@ant-design/icons";
import { highlight, registerSearchType } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import i18n from "i18next";

// Tasks in the platform search (public.tasks_search): number, title, the record the task belongs to, status. After the
// tasks block of COMPASS's global search.
registerSearchType({
  entityType: "tasks",
  order: 100,
  icon: <CheckSquareOutlined />,
  path: (r) => `/tasks/${r.id}`,
  line: (r, term) => ({
    primary: <>#{r.number} {highlight(r.title, term)}</>,
    secondary: (
      <>
        {r.subtitle ? <>{r.subtitle}{" · "}</> : null}
        {r.status ? i18n.t(`status.${r.status}`, { defaultValue: r.status }) : null}
        {" · "}{formatDate(r.event_at)}
      </>
    ),
  }),
});
