import { supabaseClient } from "@rbp/core";
import { shrinkImage } from "./image";
import { uploadAttachmentFile } from "../hooks/useSignedUrl";
import { pollDraftPayload, type PollDraft } from "./polls";

// Writing into the conversation of a record (~/maintenance_tool/docs/messaging.md): the conversation is created on the first message.
export const postRecordMessage = async (entityType: string, entityId: string, body: string, replyToMessageId?: string | null) => {
  const { data: conversationId, error: convError } = await supabaseClient.rpc("conversation_get_or_create", {
    p_anchor_type: entityType,
    p_anchor_id: entityId,
  });
  if (convError) throw convError;
  const { data, error } = await supabaseClient
    .from("messages")
    .insert({ conversation_id: conversationId as string, body, reply_to_message_id: replyToMessageId ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return { conversationId: conversationId as string, messageId: data.id as string };
};

// A message into a conversation that already exists (a post in a group, a direct conversation).
export const postConversationMessage = async (conversationId: string, body: string, replyToMessageId?: string | null) => {
  const { data, error } = await supabaseClient
    .from("messages")
    .insert({ conversation_id: conversationId, body, reply_to_message_id: replyToMessageId ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return { conversationId, messageId: data.id as string };
};

// The conversation with one person (created on first use, the same one from either side). It shows in the Inbox once
// somebody wrote.
export const openDirectConversation = async (userId: string) => {
  const { data, error } = await supabaseClient.rpc("conversation_get_or_create_direct", { p_user_id: userId });
  if (error) throw error;
  return data as string;
};

export type PostFile = { id: string; message_id: string; storage_path: string; file_name: string; mime_type: string | null };

// A post is created through the RPC first (its ids are part of the file paths), then the files are uploaded and linked to
// its first message. Pictures are shrunk in the browser. A failed upload keeps the post and is reported in `uploadError`.
export async function createGroupPost(input: { groupId: string; title: string | null; body: string; files: File[]; poll?: PollDraft | null }): Promise<{ postId: string; uploadError: Error | null }> {
  const { data, error } = await supabaseClient.rpc("team_post_create", { p_team_id: input.groupId, p_title: input.title?.trim() || null, p_body: input.body, p_poll: input.poll ? pollDraftPayload(input.poll) : null });
  if (error) throw error;
  const created = (Array.isArray(data) ? data[0] : data) as { conversation_id: string; message_id: string };
  let uploadError: Error | null = null;
  const { data: me } = await supabaseClient.auth.getUser();
  for (const original of input.files) {
    try {
      const blob = await shrinkImage(original);
      const file = blob === original ? original : new File([blob], original.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
      const uploaded = await uploadAttachmentFile("teams", input.groupId, file);
      const { error: linkError } = await supabaseClient.from("attachments").insert({
        entity_type: "teams",
        entity_id: input.groupId,
        message_id: created.message_id,
        uploaded_by_user_id: me.user?.id,
        ...uploaded,
      });
      if (linkError) throw linkError;
    } catch (e) {
      uploadError ??= e as Error;
    }
  }
  return { postId: created.conversation_id, uploadError };
}

// The pictures and files of a page of posts, keyed by the post's first message (the posts' own files, not the ones on comments).
export async function fetchPostFiles(rootMessageIds: string[]): Promise<Record<string, PostFile[]>> {
  const map: Record<string, PostFile[]> = {};
  if (!rootMessageIds.length) return map;
  const { data } = await supabaseClient
    .from("attachments")
    .select("id, message_id, storage_path, file_name, mime_type")
    .in("message_id", rootMessageIds)
    .order("created_at");
  for (const f of (data ?? []) as PostFile[]) map[f.message_id] = [...(map[f.message_id] ?? []), f];
  return map;
}

// Looking at a conversation marks it read (a plain read marker when I do not take part, ~/maintenance_tool/docs/messaging.md).
export const markConversationRead = (conversationId: string) => supabaseClient.rpc("conversation_mark_read", { p_conversation_id: conversationId });

// The author may correct a message or a post for 15 minutes (public.message_edit_window; the database refuses later edits).
const EDIT_WINDOW_MINUTES = 15;
export const withinEditWindow = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MINUTES * 60_000;
// The database's message for an edit that came too late (the editor stayed open past the window).
export const isEditWindowError = (error: { hint?: string | null } | null | undefined) => error?.hint === "edit_window";
