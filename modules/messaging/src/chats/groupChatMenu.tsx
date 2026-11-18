import { useState } from "react";
import { App as AntdApp, Button, Dropdown, Input, Modal, Select } from "antd";
import { EditOutlined, LogoutOutlined, MoreOutlined, UserAddOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { useUsers, usersFor } from "@rbp/core";
import { refreshMessageCounts } from "../hooks/useMessages";
import { errorText } from "@rbp/core";

// Who is in a direct or group chat (the participant policy shows only one's own row).
export const useConversationPeople = (conversationId: string, enabled = true) =>
  useQuery({
    queryKey: ["conversation-people", conversationId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("conversation_people", { p_conversation_id: conversationId });
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });

// The ⋯ of a group chat: name it, add people (they read the whole history), leave it. Anybody in the chat may do all
// three; nobody moderates a group chat (~/maintenance_tool/docs/messaging.md "Group chats").
export const GroupChatMenu = ({ conversationId, title, onLeft }: { conversationId: string; title: string | null; onLeft: () => void }) => {
  const { t } = useTranslation();
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: users } = useUsers();
  const { data: people } = useConversationPeople(conversationId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState<string[] | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["conversation-header", conversationId] }),
      queryClient.invalidateQueries({ queryKey: ["conversation-people", conversationId] }),
      refreshMessageCounts(queryClient),
    ]);
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabaseClient.rpc(fn, args);
    if (error) {
      message.error(errorText(error));
      return false;
    }
    await refresh();
    return true;
  };

  return (
    <>
      <Dropdown
        trigger={["click"]}
        menu={{
          items: [
            { key: "rename", icon: <EditOutlined />, label: t("messages.groupChat.rename"), onClick: () => setRenaming(title ?? "") },
            { key: "add", icon: <UserAddOutlined />, label: t("messages.groupChat.add"), onClick: () => setAdding([]) },
            { type: "divider" },
            {
              key: "leave",
              icon: <LogoutOutlined />,
              danger: true,
              label: t("messages.groupChat.leave"),
              onClick: () =>
                modal.confirm({
                  title: t("messages.groupChat.leaveTitle"),
                  content: t("messages.groupChat.leaveText"),
                  okButtonProps: { danger: true },
                  okText: t("messages.groupChat.leave"),
                  onOk: async () => {
                    if (await call("conversation_leave", { p_conversation_id: conversationId })) onLeft();
                  },
                }),
            },
          ],
        }}
      >
        <Button size="small" icon={<MoreOutlined />} aria-label={t("common.more")} />
      </Dropdown>
      <Modal
        open={renaming !== null}
        title={t("messages.groupChat.rename")}
        onCancel={() => setRenaming(null)}
        onOk={async () => {
          if (await call("conversation_rename", { p_conversation_id: conversationId, p_title: renaming })) setRenaming(null);
        }}
        destroyOnClose
      >
        <Input autoFocus maxLength={80} placeholder={t("messages.groupChat.namePlaceholder")} value={renaming ?? ""} onChange={(e) => setRenaming(e.target.value)} />
      </Modal>
      <Modal
        open={adding !== null}
        title={t("messages.groupChat.add")}
        okButtonProps={{ disabled: !adding?.length }}
        onCancel={() => setAdding(null)}
        onOk={async () => {
          if (await call("conversation_add_people", { p_conversation_id: conversationId, p_user_ids: adding })) setAdding(null);
        }}
        destroyOnClose
      >
        <Select
          mode="multiple"
          autoFocus
          showSearch
          optionFilterProp="label"
          style={{ width: "100%" }}
          placeholder={t("messages.groupChat.addPick")}
          value={adding ?? []}
          onChange={setAdding}
          options={usersFor(users).filter((u) => !people?.includes(u.id)).map((u) => ({ value: u.id, label: u.name ?? u.email ?? u.id }))}
        />
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>{t("messages.groupChat.addHint")}</div>
      </Modal>
    </>
  );
};
