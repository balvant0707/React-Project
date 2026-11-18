import { MessageOutlined, NotificationOutlined } from "@ant-design/icons";
import { excerpt, highlight, registerSearchType, useUserMap, userLabel } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { conversationIcon } from "./lib/entityIcons";

// What the platform search returns for messages (search_messages): team posts and comments on records. Taken over from the
// COMPASS global search; the record types a comment hangs on are named by their modules (registerEntityIcon).
const Author = ({ id }: { id: string | null }) => {
  const users = useUserMap();
  return <>{userLabel(users.get(id ?? ""))}</>;
};

registerSearchType({
  entityType: "posts",
  order: 800,
  icon: <NotificationOutlined />,
  path: (r) => `/messages/${r.id}`, // id = the post's conversation
  line: (r, term) => ({
    primary: highlight(r.title, term),
    secondary: (
      <>
        {r.snippet && r.snippet !== r.title ? <>{highlight(excerpt(r.snippet, term), term)}{" · "}</> : null}
        {r.subtitle}{" · "}<Author id={r.author_user_id} />{" · "}{formatDate(r.event_at)}
      </>
    ),
  }),
});

registerSearchType({
  entityType: "comments",
  order: 850,
  icon: <MessageOutlined />,
  textual: true,
  path: (r) => (r.parent_type && r.parent_id ? `/${r.parent_type.replace("_", "-")}/${r.parent_id}` : null),
  line: (r, term) => ({
    primary: <>{highlight(excerpt(r.snippet ?? "", term), term)}</>,
    secondary: (
      <>
        {conversationIcon(r.parent_type ?? "")} {r.number ? `#${r.number} ` : ""}{r.parent_title}
        {" · "}<Author id={r.author_user_id} />{" · "}{formatDate(r.event_at)}
      </>
    ),
  }),
});
