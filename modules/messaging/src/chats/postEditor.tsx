import { useRef, useState } from "react";
import { App as AntdApp, Input, Modal, Space } from "antd";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { RichTextEditor } from "../richText";
import { supabaseClient } from "@rbp/core";
import { isEditWindowError } from "../lib/messaging";
import { refreshMessageCounts, type GroupPost, type MessageGroup } from "../hooks/useMessages";
import { errorText } from "@rbp/core";
import { useUserMap } from "@rbp/core";
import { MessageComposer, useMentionSearch } from "../feed/composer";
import { EmojiButton } from "../feed/composerParts";
import { useGroupName } from "../feed/messageBody";
import { toDisplayBody, toStoredBody, type MentionCandidate } from "../feed/mentions";

// Writing a post: the post variant of MessageComposer (group, optional title, formatted text, pictures and files,
// optionally a poll). The name and props stay for the callers.
export const PostComposer = (props: { groups: MessageGroup[]; defaultGroupId?: string; onPosted: (id: string) => void; startOpen?: boolean; onCancel?: () => void }) => (
  <MessageComposer {...props} variant="post" />
);

// Editing my own post: title and text. The mentions the text has are shown as "@Name" while editing and stored as
// tokens again; new ones can be added.
export const EditPostModal = ({ post, onClose }: { post: GroupPost | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const users = useUserMap();
  const groupName = useGroupName();
  const searchMentions = useMentionSearch("teams", post?.team_id ?? "");
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null | undefined>(undefined);
  const [added, setAdded] = useState<MentionCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const shown = post ? toDisplayBody(post.body, users, groupName) : null;

  const save = async () => {
    if (!post || !shown) return;
    const nextBody = body === undefined ? post.body : toStoredBody(body ?? "", [...shown.candidates, ...added]);
    if (!nextBody) return;
    setBusy(true);
    const { error } = await supabaseClient.rpc("team_post_edit", { p_conversation_id: post.id, p_title: (title ?? post.title ?? "").trim() || null, p_body: nextBody });
    setBusy(false);
    if (error) return message.error(isEditWindowError(error) ? t("feed.editWindowOver") : errorText(error));
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["group-posts"] }), queryClient.invalidateQueries({ queryKey: ["group-post"] }), refreshMessageCounts(queryClient)]);
    setTitle(null);
    setBody(undefined);
    setAdded([]);
    onClose();
  };

  return (
    <Modal open={!!post} title={t("messages.editPost")} onCancel={onClose} onOk={save} okText={t("common.save")} confirmLoading={busy} destroyOnClose width={640}>
      {post && shown && (
        <Space direction="vertical" style={{ width: "100%" }} size={10}>
          <Input defaultValue={post.title ?? ""} onChange={(e) => setTitle(e.target.value)} placeholder={t("messages.titleOptional")} maxLength={150} />
          <RichTextEditor
            value={body === undefined ? shown.text : body}
            onChange={setBody}
            minHeight={140}
            mentionSearch={searchMentions}
            onMention={(c) => setAdded((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]))}
            editorRef={editorRef}
            toolbarExtra={<EmojiButton onPick={(emoji) => editorRef.current?.chain().focus().insertContent(emoji).run()} />}
          />
        </Space>
      )}
    </Modal>
  );
};
