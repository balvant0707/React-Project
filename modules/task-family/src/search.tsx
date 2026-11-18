import { IconTarget } from "@tabler/icons-react";
import { highlight, registerSearchType } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import i18n from "i18next";

// Goals in the platform search (public.goals_search): number, title, status. After the goals block of COMPASS's global search.
registerSearchType({
  entityType: "goals",
  order: 110,
  icon: <IconTarget size={16} stroke={1.6} />,
  path: (r) => `/goals/${r.id}`,
  line: (r, term) => ({
    primary: <>#{r.number} {highlight(r.title, term)}</>,
    secondary: (
      <>
        {r.status ? i18n.t(`goals.status.${r.status}`, { defaultValue: r.status }) : null}
        {" · "}{formatDate(r.event_at)}
      </>
    ),
  }),
});
