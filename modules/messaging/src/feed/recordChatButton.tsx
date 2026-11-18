import { Badge, Button } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useIdentity } from "@rbp/core";
import type { EntityType } from "@rbp/core";
import { useRecordUnread } from "../hooks/useMessages";

// Phone: the chat of a record (task, ticket, asset, goal) is the record's conversation in the Messages module, the one
// place a chat fills the screen (~/maintenance_tool/docs/messaging.md "Record chat on a phone"). The button carries the unread count and
// passes the title, so the conversation is named even before its first message; Back there returns here.
export const RecordChatButton = ({ entityType, entityId, title, label }: { entityType: EntityType; entityId: string; title: string; label?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identity } = useIdentity();
  const unread = useRecordUnread(entityType, entityId, identity?.id);
  const open = () => navigate(`/messages?record=${entityType}:${entityId}`, { state: { recordTitle: title } });
  return (
    <Badge count={unread} size="small" offset={[-4, 4]}>
      <Button aria-label={t("feed.title")} icon={<MessageOutlined />} onClick={open}>
        {label ? t("feed.title") : null}
      </Button>
    </Badge>
  );
};
