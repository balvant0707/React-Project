import { App as AntdApp, Button, Dropdown, Tooltip } from "antd";
import { BellFilled, BellOutlined, CheckOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { refreshMessageCounts, type FollowLevel } from "../hooks/useMessages";
import { errorText } from "@rbp/core";

type Participation = { taking_part: boolean; level: FollowLevel } | null;

// Follow a conversation (a record's or a post's): it then appears under "For me" on the Messages page with an unread
// count. Following = taking_part on my own conversation_participants row; the level decides what counts and notifies.
export const FollowButton = ({ conversationId, iconOnly = false, direct = false }: { conversationId: string; iconOnly?: boolean; direct?: boolean }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { identity } = useIdentity();
  const queryKey = ["participation", conversationId, identity?.id];
  const { data: row } = useQuery({
    queryKey,
    enabled: !!identity?.id,
    queryFn: async () => {
      const { data } = await supabaseClient
        .from("conversation_participants")
        .select("taking_part, level")
        .eq("conversation_id", conversationId)
        .eq("user_id", identity!.id)
        .maybeSingle();
      return (data ?? null) as Participation;
    },
  });

  const save = async (values: { taking_part: boolean; level?: FollowLevel }) => {
    const { error } = await supabaseClient
      .from("conversation_participants")
      .upsert({ conversation_id: conversationId, user_id: identity!.id, level: values.level ?? row?.level ?? "all", taking_part: values.taking_part });
    if (error) message.error(errorText(error));
    await Promise.all([queryClient.invalidateQueries({ queryKey }), refreshMessageCounts(queryClient)]);
  };

  if (!identity?.id) return null;
  if (!row?.taking_part) {
    return (
      <Tooltip title={t("feed.follow.hint")}>
        <Button size="small" icon={<BellOutlined />} onClick={() => void save({ taking_part: true, level: "all" })} aria-label={t("feed.follow.none")}>
          {iconOnly ? null : t("feed.follow.none")}
        </Button>
      </Tooltip>
    );
  }
  const mark = (l: FollowLevel) => (row.level === l ? <CheckOutlined /> : <span style={{ width: 14, display: "inline-block" }} />);
  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          { key: "all", icon: mark("all"), label: t("feed.follow.menuAll"), onClick: () => void save({ taking_part: true, level: "all" }) },
          // A direct conversation knows two states: everything or mute.
          ...(direct ? [] : [{ key: "mentions", icon: mark("mentions"), label: t("feed.follow.menuMentions"), onClick: () => void save({ taking_part: true, level: "mentions" }) }]),
          { key: "mute", icon: mark("mute"), label: t("feed.follow.menuMute"), onClick: () => void save({ taking_part: true, level: "mute" }) },
          { type: "divider" },
          { key: "leave", label: t(direct ? "messages.hideDirect" : "feed.follow.menuLeave"), onClick: () => void save({ taking_part: false }) },
        ],
      }}
    >
      <Button size="small" icon={<BellFilled />} aria-label={t(`feed.follow.${row.level}`)}>
        {iconOnly ? null : t(`feed.follow.${row.level}`)}
      </Button>
    </Dropdown>
  );
};
