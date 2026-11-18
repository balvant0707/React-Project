import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { App as AntdApp, Button, Card, Dropdown, Input, Mentions, Select, Space, Tag, Typography, theme as antdTheme } from "antd";
import type { MentionsRef } from "antd/es/mentions";
import type { Editor } from "@tiptap/react";
import { BarChartOutlined, CloseOutlined, PaperClipOutlined, PlusOutlined, SendOutlined } from "@ant-design/icons";
import { IconLink } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import type { EntityType } from "@rbp/core";
import { uploadAttachmentFile } from "../hooks/useSignedUrl";
import { createGroupPost, postConversationMessage, postRecordMessage } from "../lib/messaging";
import { refreshMessageCounts, type MessageGroup } from "../hooks/useMessages";
import { toStoredBody, type MentionCandidate } from "./mentions";
import { errorText } from "@rbp/core";
import { cardToken, recordCardTypes, type RecordCardType } from "./cards";
import { pollDraftProblem, type PollDraft } from "../lib/polls";
import { RichTextEditor, type MentionOption } from "../richText";
import { newPollDraft, PollFields } from "../chats/pollFields";
import { useIsMobile } from "@rbp/ui";
import { EmojiButton, LinkedCardTags, LinkCardButtons, LinkCardModal, type LinkedCard } from "./composerParts";

type MessageProps = {
  variant?: "message";
  entityType: EntityType;
  entityId: string;
  // A conversation that exists already (the Messages page): write into it directly.
  conversationId?: string;
  replyTo?: { id: string; name: string } | null;
  onClearReply?: () => void;
  onSent?: () => void;
  // Chat: no typing hint below the input, the mention list opens upwards.
  compact?: boolean;
  // A direct conversation: nobody to mention (the two are in it already).
  direct?: boolean;
};

type PostProps = {
  variant: "post";
  // The groups I may post in; the first (or defaultGroupId) is preselected.
  groups: MessageGroup[];
  defaultGroupId?: string;
  onPosted: (id: string) => void;
  startOpen?: boolean;
  onCancel?: () => void;
};

// The team a message on this record or in this group may mention as a whole (null: none, or not for me).
export const useTeamMentionTarget = (entityType: EntityType, entityId: string) =>
  useQuery({
    queryKey: ["team-mention-target", entityType, entityId],
    enabled: !!entityId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabaseClient.rpc("team_mention_target", { p_anchor_type: entityType, p_anchor_id: entityId });
      return ((data ?? []) as { team_id: string; name: string }[])[0] ?? null;
    },
  });

// The suggestions for "@": people who may see the record (or the group) and, where the writer may mention it, the team.
export const useMentionSearch = (anchorType: EntityType, anchorId: string) => {
  const { data: team } = useTeamMentionTarget(anchorType, anchorId);
  return async (search: string): Promise<MentionOption[]> => {
    if (!anchorId) return [];
    const { data } = await supabaseClient.rpc("mentionable_users", { p_entity_type: anchorType, p_entity_id: anchorId, p_search: search });
    const people: MentionOption[] = ((data as { id: string; name: string | null; email: string | null }[]) ?? []).map((u) => {
      const name = u.name ?? u.email ?? "?";
      return { key: u.id, label: name, candidate: { id: u.id, name, kind: "user" } };
    });
    const teamMatches = team && team.name.toLowerCase().includes(search.toLowerCase());
    return teamMatches ? [{ key: `team:${team.team_id}`, label: team.name, candidate: { id: team.team_id, name: team.name, kind: "team" } }, ...people] : people;
  };
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;

// The one input for everything people write (~/maintenance_tool/docs/messaging.md "Message input"): variant "message" (a messenger row in a
// conversation or on a record) and "post" (group, title, formatted text, a poll). Both share mentions, emoji, linked
// task cards and attachments (drop and paste too).
export const MessageComposer = (props: MessageProps | PostProps) => {
  const isPost = props.variant === "post";
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { identity } = useIdentity();
  const [text, setText] = useState("");
  const [html, setHtml] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<MentionOption[]>([]);
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  // Tasks linked to the message: each becomes a card ([[task:id]] lines at the end of the body).
  const [linked, setLinked] = useState<LinkedCard[]>([]);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [linkOpen, setLinkOpen] = useState<RecordCardType | null>(null);
  const linkCard = (card: LinkedCard) => setLinked((prev) => (prev.some((x) => x.id === card.id) ? prev : [...prev, card]));
  const searchSeq = useRef(0);
  const mentionsRef = useRef<MentionsRef>(null);
  const editorRef = useRef<Editor | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Post only
  const [open, setOpen] = useState(isPost ? !!props.startOpen : true);
  const [groupId, setGroupId] = useState<string | undefined>();
  const [title, setTitle] = useState("");
  const [poll, setPoll] = useState<PollDraft | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const groups = isPost ? props.groups : [];
  const chosen = isPost ? (groupId && groups.some((g) => g.id === groupId) ? groupId : groups.find((g) => g.id === props.defaultGroupId)?.id ?? groups[0]?.id) : undefined;
  // Where mentions and the team come from: the record, or the group a post goes to.
  const anchorType: EntityType = isPost ? "teams" : props.entityType;
  const anchorId = isPost ? chosen ?? "" : props.entityId;
  const mentionSearch = useMentionSearch(anchorType, anchorId);
  const searchMentions = !isPost && props.direct ? async (): Promise<MentionOption[]> => [] : mentionSearch;

  const addFiles = (incoming: File[]) => {
    const accepted = incoming.filter((f) => {
      if (f.size > MAX_FILE_BYTES) {
        message.warning(t("feed.fileTooLarge", { name: f.name }));
        return false;
      }
      return true;
    });
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };
  const onPaste = (e: ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const onSearch = async (search: string) => {
    const seq = ++searchSeq.current;
    const found = await searchMentions(search);
    if (seq === searchSeq.current) setOptions(found);
  };
  const addCandidate = (candidate: MentionCandidate) => setCandidates((prev) => (prev.some((c) => c.id === candidate.id) ? prev : [...prev, candidate]));

  // An emoji goes in at the caret (or replaces the selection) and the caret stays behind it.
  const insertEmoji = (emoji: string) => {
    if (isPost) {
      editorRef.current?.chain().focus().insertContent(emoji).run();
      return;
    }
    const area = mentionsRef.current?.textarea;
    const start = area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    setTimeout(() => {
      area?.focus();
      area?.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  const pollProblem = !!poll && !!pollDraftProblem(poll);
  const canSend = isPost ? !!chosen && (!!html || linked.length > 0) && !pollProblem : !!text.trim() || files.length > 0 || linked.length > 0;

  const resetPost = () => {
    setTitle("");
    setHtml(null);
    setPoll(null);
    setResetKey((k) => k + 1);
    if (isPost) setOpen(!!props.startOpen);
  };

  const send = async () => {
    if (!identity?.id || !canSend) return;
    setSending(true);
    try {
      if (isPost) {
        // The text is HTML: a card is a paragraph of its own, which the post view turns into the card.
        const body = [html ? toStoredBody(html, candidates) : "", ...linked.map((x) => `<p>${cardToken(x.kind, x.id)}</p>`)].join("");
        const { postId, uploadError } = await createGroupPost({ groupId: chosen!, title, body, files, poll });
        // The post exists even when a file failed: clear the form so nobody posts it twice.
        resetPost();
        setFiles([]);
        setLinked([]);
        setCandidates([]);
        if (uploadError) message.warning(t("messages.uploadFailed", { error: uploadError.message }));
        props.onPosted(postId);
        void queryClient.invalidateQueries({ queryKey: ["group-posts"] });
        void refreshMessageCounts(queryClient);
        return;
      }
      const body = [toStoredBody(text.trim(), candidates), ...linked.map((x) => cardToken(x.kind, x.id))].filter(Boolean).join("\n");
      const { entityType, entityId, conversationId, replyTo, onClearReply, onSent } = props;
      const { messageId } = conversationId ? await postConversationMessage(conversationId, body, replyTo?.id) : await postRecordMessage(entityType, entityId, body, replyTo?.id);
      const failed: string[] = [];
      for (const file of files) {
        try {
          const uploaded = await uploadAttachmentFile(entityType, entityId, file);
          const { error: attachError } = await supabaseClient.from("attachments").insert({
            entity_type: entityType,
            entity_id: entityId,
            message_id: messageId,
            uploaded_by_user_id: identity.id,
            ...uploaded,
          });
          if (attachError) throw attachError;
        } catch {
          failed.push(file.name);
        }
      }
      if (failed.length) message.error(t("feed.uploadFailed", { names: failed.join(", ") }));
      setText("");
      setFiles([]);
      setLinked([]);
      setCandidates([]);
      onClearReply?.();
      onSent?.();
      await queryClient.invalidateQueries({ queryKey: ["feed", entityType, entityId] });
    } catch (e: any) {
      message.error(errorText(e));
    } finally {
      setSending(false);
    }
  };

  const fileTags = files.length > 0 && (
    <div style={{ margin: "4px 0 8px" }}>
      {files.map((f, i) => (
        <Tag key={`${f.name}-${i}`} closable closeIcon={<CloseOutlined />} onClose={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
          {f.name}
        </Tag>
      ))}
    </div>
  );
  if (isPost) {
    if (!groups.length) return null;
    if (!open) {
      return (
        <Card size="small" hoverable onClick={() => setOpen(true)} styles={{ body: { color: "var(--ant-color-text-tertiary)" } }}>
          {t("messages.composePlaceholder")}
        </Card>
      );
    }
    return (
      <Card size="small" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} style={dragging ? { borderStyle: "dashed", borderColor: token.colorPrimary } : undefined}>
        <Space direction="vertical" style={{ width: "100%" }} size={10}>
          <Select style={{ width: "100%" }} value={chosen} onChange={setGroupId} options={groups.map((g) => ({ value: g.id, label: g.name }))} placeholder={t("messages.group")} />
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("messages.titleOptional")} maxLength={150} />
          <div onPaste={onPaste}>
            <RichTextEditor
              key={resetKey}
              value={html}
              onChange={setHtml}
              placeholder={t("messages.bodyPlaceholder")}
              autoFocus
              minHeight={100}
              mentionSearch={searchMentions}
              onMention={addCandidate}
              editorRef={editorRef}
              toolbarExtra={
                <>
                  <EmojiButton onPick={insertEmoji} />
                  <LinkCardButtons onPick={linkCard} />
                </>
              }
            />
          </div>
          <LinkedCardTags cards={linked} onRemove={(id) => setLinked((prev) => prev.filter((x) => x.id !== id))} />
          {poll && <PollFields value={poll} onChange={setPoll} onRemove={() => setPoll(null)} />}
          {fileTags}
          <input ref={fileInput} type="file" multiple hidden accept="image/*,application/pdf" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <Space wrap>
            <Button icon={<PaperClipOutlined />} onClick={() => fileInput.current?.click()}>{t("messages.addPictures")}</Button>
            {!poll && <Button icon={<BarChartOutlined />} onClick={() => setPoll(newPollDraft())}>{t("polls.add")}</Button>}
          </Space>
          <Space>
            <Button type="primary" loading={sending} disabled={!canSend} onClick={send}>{t("messages.publish")}</Button>
            <Button onClick={() => { resetPost(); setFiles([]); setLinked([]); setCandidates([]); props.onCancel?.(); }} disabled={sending}>{t("common.cancel")}</Button>
          </Space>
        </Space>
      </Card>
    );
  }

  const { replyTo, onClearReply, compact = false } = props;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {replyTo && (
        <Tag closable onClose={onClearReply} style={{ marginBottom: 4 }}>
          {t("feed.replyingTo", { name: replyTo.name })}
        </Tag>
      )}
      <LinkedCardTags cards={linked} onRemove={(id) => setLinked((prev) => prev.filter((x) => x.id !== id))} />
      {fileTags}
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <LinkCardModal type={linkOpen} onClose={() => setLinkOpen(null)} onPick={linkCard} />
      {/* One row while empty: the field grows with the text, the buttons stay at its last line. */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
        <Dropdown
          trigger={["click"]}
          placement="topLeft"
          menu={{
            items: [
              { key: "file", icon: <PaperClipOutlined />, label: t("feed.attach"), onClick: () => fileInput.current?.click() },
              ...recordCardTypes().map((type) => ({ key: `link-${type.kind}`, icon: <IconLink size={14} />, label: t("cards.link", { kind: type.label }), onClick: () => setLinkOpen(type) })),
            ],
          }}
        >
          <Button type="text" shape="circle" icon={<PlusOutlined />} aria-label={t("feed.addMenu")} style={{ flex: "none", height: 38, width: 38 }} />
        </Dropdown>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "flex-end",
            border: `1px ${dragging ? "dashed" : "solid"} ${dragging ? token.colorPrimary : token.colorBorder}`,
            borderRadius: 20,
            background: dragging ? token.colorPrimaryBg : token.colorBgContainer,
            padding: "3px 4px 3px 6px",
          }}
        >
          <Mentions
            ref={mentionsRef}
            value={text}
            onChange={setText}
            onSearch={onSearch}
            onSelect={(option) => {
              const found = options.find((o) => o.key === String(option.key));
              if (found) addCandidate(found.candidate);
            }}
            options={options.map((o) => ({ key: o.key, value: o.label, label: o.candidate.kind === "team" ? t("feed.teamMention", { name: o.label }) : o.label }))}
            filterOption={false}
            placement={compact ? "top" : "bottom"}
            autoSize={{ minRows: 1, maxRows: 8 }}
            placeholder={dragging ? t("feed.dropHere") : t(!isPost && props.direct ? "feed.placeholderChat" : "feed.placeholder")}
            variant="borderless"
            style={{ flex: 1, minWidth: 0 }}
            onPaste={onPaste}
            onKeyDown={(e) => {
              // Tab picks the highlighted user like Enter does (the Mentions control only knows Enter)
              if (e.key === "Tab" && !e.shiftKey && options.length > 0) {
                const area = e.currentTarget as HTMLTextAreaElement;
                if (/@[^\s@]*$/.test(area.value.slice(0, area.selectionStart))) {
                  e.preventDefault();
                  area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                  return;
                }
              }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div style={{ flex: "none", paddingBottom: 1 }}>
            <EmojiButton onPick={insertEmoji} size={18} placement="topRight" />
          </div>
        </div>
        <Button type="primary" shape="circle" icon={<SendOutlined />} loading={sending} disabled={!canSend} onClick={send} aria-label={t("feed.send")} title={t("feed.send")} style={{ flex: "none", height: 38, width: 38 }} />
      </div>
      {!isMobile && !compact && text.trim() !== "" && (
        <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, margin: "4px 0 0 44px" }}>
          {t("feed.hint")}
        </Typography.Text>
      )}
    </div>
  );
};

// The input under a conversation or a record: the message variant of MessageComposer (the name stays for the callers).
export const FeedComposer = (props: Omit<MessageProps, "variant">) => <MessageComposer {...props} variant="message" />;
