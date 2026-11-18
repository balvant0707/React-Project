// Ported 1:1 from COMPASS (app/src/offline/checklistOutbox.ts).
import { createStore, del, entries, get, set } from "idb-keyval";
import { queryClient } from "../queryClient";
import { lastRequestFailedAtNetworkLevel, supabaseClient } from "@rbp/core";
import { uploadAttachmentFile } from "@rbp/module-messaging/src/hooks/useSignedUrl.ts";
import type { ChecklistItem } from "../lib/checklists";

// Write queue for checklists: answers and photos made without reception wait here (IndexedDB) and are sent when the
// connection is back. Answers are merged per item (the last value wins); the screen shows queued answers on top of
// the server's list (applyPendingAnswers).
const store = createStore("cmms-checklist-outbox", "ops");

type AnswerChange = Partial<Pick<ChecklistItem, "done" | "result" | "value_number" | "value_text" | "note">>;
type AnswerOp = { userId: string | null; key: string; kind: "answer"; taskId: string; itemId: string; change: AnswerChange; at: number };
type PhotoOp = { userId: string | null; key: string; kind: "photo"; taskId: string; itemId: string; blob: Blob; name: string; mime: string; at: number };
type Op = AnswerOp | PhotoOp;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const subscribeOutbox = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// A request that never reached the server (no reception, tunnel, hall without Wi-Fi) or that failed only because the
// session has to be renewed first: worth keeping and trying again.
const isNetworkFailure = (error?: { message?: string } | null) =>
  !navigator.onLine || lastRequestFailedAtNetworkLevel() || /failed to fetch|networkerror|load failed|network request failed|jwt expired|invalid jwt/i.test(error?.message ?? "");

// The queue belongs to the person who made the entries (the identity the auth provider cached).
const currentUserId = () => {
  try {
    return (JSON.parse(localStorage.getItem("rbp.identity") /* Platform: the core auth provider's identity key (IDENTITY_KEY). */ ?? "null") as { id?: string } | null)?.id ?? null;
  } catch {
    return null;
  }
};

const allRaw = async () => (await entries<string, Op>(store)).map(([, v]) => v);
const all = async () => (await allRaw()).filter((o) => o.userId === currentUserId());
export const pendingCount = async () => (await all()).length;
export const pendingPhotos = async (taskId: string) => (await all()).filter((o): o is PhotoOp => o.kind === "photo" && o.taskId === taskId);

// Queued answers laid over the server's list.
export async function applyPendingAnswers<T extends { items: ChecklistItem[] }>(taskId: string, list: T): Promise<T> {
  const answers = (await all()).filter((o): o is AnswerOp => o.kind === "answer" && o.taskId === taskId);
  if (answers.length === 0) return list;
  const byItem = new Map(answers.map((a) => [a.itemId, a.change]));
  return { ...list, items: list.items.map((i) => (byItem.has(i.id) ? { ...i, ...byItem.get(i.id) } : i)) };
}

async function enqueueAnswer(taskId: string, itemId: string, change: AnswerChange) {
  const key = `answer:${itemId}`;
  const existing = (await get<Op>(key, store)) as AnswerOp | undefined;
  await set(key, { userId: currentUserId(), key, kind: "answer", taskId, itemId, change: { ...(existing?.change ?? {}), ...change }, at: Date.now() } satisfies AnswerOp, store);
  emit();
}

// Saves one answer: at once when there is a connection, otherwise (or when the request fails on the way) into the queue.
export async function saveAnswer(taskId: string, itemId: string, change: AnswerChange): Promise<{ queued: boolean; error?: string }> {
  if (navigator.onLine && (await pendingCount()) === 0) {
    const { error } = await supabaseClient.from("task_checklist_items").update(change).eq("id", itemId);
    if (!error) return { queued: false };
    if (!isNetworkFailure(error)) return { queued: false, error: error.message };
  }
  await enqueueAnswer(taskId, itemId, change);
  void flushChecklistOutbox();
  return { queued: true };
}

export async function savePhoto(taskId: string, itemId: string, blob: Blob, name: string): Promise<{ queued: boolean; error?: string }> {
  if (navigator.onLine) {
    try {
      await sendPhoto({ taskId, itemId, blob, name, mime: blob.type });
      return { queued: false };
    } catch (e) {
      if (!isNetworkFailure(e as Error)) return { queued: false, error: (e as Error).message };
    }
  }
  const key = `photo:${crypto.randomUUID()}`;
  await set(key, { userId: currentUserId(), key, kind: "photo", taskId, itemId, blob, name, mime: blob.type, at: Date.now() } satisfies PhotoOp, store);
  emit();
  return { queued: true };
}

async function sendPhoto(p: { taskId: string; itemId: string; blob: Blob; name: string; mime: string }) {
  const file = new File([p.blob], p.name, { type: p.mime || "image/jpeg" });
  const uploaded = await uploadAttachmentFile("tasks", p.taskId, file);
  const { error } = await supabaseClient.from("attachments").insert({ entity_type: "tasks", entity_id: p.taskId, checklist_item_id: p.itemId, ...uploaded });
  if (error) throw error;
}

let flushing: Promise<{ sent: number; dropped: number }> | null = null;

// Sends everything queued, oldest first. An op the server rejects for good (task finished, no right any more, item
// gone) is dropped so it cannot block the queue; a network failure keeps it and stops.
function flushChecklistOutbox(): Promise<{ sent: number; dropped: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    let dropped = 0;
    if (!navigator.onLine) return { sent, dropped };
    const { data } = await supabaseClient.auth.getSession();
    if (!data.session) return { sent, dropped };
    const me = data.session.user.id;
    const week = 14 * 24 * 3600_000;
    const ops = (await allRaw()).sort((a, b) => a.at - b.at);
    for (const old of ops.filter((o) => o.userId !== me && Date.now() - o.at > week)) await del(old.key, store);
    const tasks = new Set<string>();
    for (const op of ops.filter((o) => o.userId === me)) {
      try {
        if (op.kind === "answer") {
          const { error } = await supabaseClient.from("task_checklist_items").update(op.change).eq("id", op.itemId);
          if (error) throw error;
        } else {
          await sendPhoto(op);
        }
        await del(op.key, store);
        tasks.add(op.taskId);
        sent++;
      } catch (e) {
        if (isNetworkFailure(e as Error)) break;
        await del(op.key, store);
        tasks.add(op.taskId);
        dropped++;
      }
    }
    emit();
    for (const id of tasks) {
      void queryClient.invalidateQueries({ queryKey: ["task-checklists", id] });
      void queryClient.invalidateQueries({ queryKey: ["checklist-photos", id] });
      void queryClient.invalidateQueries({ queryKey: ["task", id] });
      void queryClient.invalidateQueries({ queryKey: ["feed", "tasks", id] });
    }
    return { sent, dropped };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// Starts the automatic sending: when the connection returns, at start-up, and now and then while something waits.
export function startChecklistOutbox() {
  const run = () => void flushChecklistOutbox();
  window.addEventListener("online", run);
  window.setInterval(async () => {
    if ((await pendingCount()) > 0) run();
  }, 30_000);
  run();
}
