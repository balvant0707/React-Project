// Started as a 1:1 port of the NPM tool (app/src/pages/inbox/index.tsx); hand-maintained since 2026-11-12.
// Changed: RADAR has one messaging page (the platform's Messages: record notes, chats, team
// posts), so this page is "Mail", the email threads of the mailboxes only (decided 2026-11-10). NPM's record-notes view
// (list rows, conversation column, composer) was cut out; a thread's internal notes are in EmailThreadPanel.
import { useEffect, useRef, useState } from "react";
import { useCanAccess as useCan, useGetIdentity } from "@rbp/core";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App as AntdApp, Alert, Drawer, Grid, List, Switch, Typography, Input, Button, Empty, Badge, Tag, Tooltip, theme as antdTheme } from "antd";
import {
  SearchOutlined,
  MailOutlined,
  PlusOutlined,
  EditOutlined,
  ArrowLeftOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { formatDateTime } from "@rbp/ui";
import { clampPanelWidth, readSavedPanelWidth, savePanelWidth } from "@rbp/module-messaging/src/notes/panelWidth.ts";
import { EmailThreadPanel } from "../../components/emailThreadPanel";
import { EmailDraftPanel } from "../../components/emailDraftPanel";
import {
  SMART_VIEWS,
  SmartViewNav,
  badgeCount,
  viewMailboxId,
  type ViewCounts,
} from "./smartViews";
import { createNewEmailDraft, isLockedByOther, writerLabel, type DraftWriter } from "../../modules/email/drafts";

const { useToken } = antdTheme;

// An email thread in the list: "mine" = I am responsible or follow it, "mailboxes" = every thread of my mailboxes.
type ThreadItem = {
  id: string;
  subject: string | null;
  status: string;
  lastMessageAt: string | null;
  mailboxName: string | null;
  mailboxColor: string | null;
  unread: boolean;
  // mine to look after: responsible, follower, or the sales rep / responsible person of a linked record (rpc my_relevant_email_thread_ids)
  relevant: boolean;
  responsibleId: string | null;
  // entity types of the records the thread is linked to (none = a free conversation)
  entityTypes: string[];
  // somebody is writing a reply right now (lock of the thread's draft still running)
  writer: DraftWriter | null;
};
// A new email in the making (a shared draft of a mailbox, not yet sent).
type DraftItem = {
  id: string;
  subject: string | null;
  updatedAt: string;
  mailboxId: string;
  mailboxName: string | null;
  mailboxColor: string | null;
  createdByMe: boolean;
  lockedByMe: boolean;
  entityTypes: string[];
  writer: DraftWriter | null;
  writing: boolean;
};

type ListItem =
  | { kind: "thread"; at: string | null; thread: ThreadItem }
  | { kind: "draft"; at: string | null; draft: DraftItem };

const VIEW_STORAGE_KEY = "npmtool_inbox_view";
// Email threads of a view are loaded this many at a time ("Show more" asks for the next page).
const THREAD_PAGE = 50;
const WIDTH_PANEL = { cookie: "npmtool_inbox_list_width", def: 340, min: 260, max: 560 };

// The Mail page (/inbox): smart views | list | open item. The list holds the email threads of the user's mailboxes and
// new emails in the making; the right column shows an email thread with its internal notes (EmailThreadPanel) or a draft
// (EmailDraftPanel). The list column is resizable (width in a cookie).
export const InboxList = () => {
  const { token } = useToken();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loadSeqRef = useRef(0);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState("");
  const searchTerm = search.trim().toLowerCase();
  const [unreadOnly, setUnreadOnly] = useState(false);
  // Mailboxes the user may use (row level security). Without any, the page only says so.
  const [mailboxes, setMailboxes] = useState<{ id: string; address: string; display_name: string; color: string | null }[]>([]);
  const [brokenMailboxIds, setBrokenMailboxIds] = useState<string[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  // The smart view in the left column (key of SMART_VIEWS, or "mailbox:<id>"); remembered per browser.
  const [view, setViewState] = useState<string>(() => {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) || "mine";
    } catch {
      return "mine";
    }
  });
  const setView = (next: string) => {
    setViewState(next);
    setThreadLimit(THREAD_PAGE);
    setNavOpen(false);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* private window: the view is just not remembered */
    }
  };
  const [viewCounts, setViewCounts] = useState<ViewCounts | null>(null);
  const [threadLimit, setThreadLimit] = useState(THREAD_PAGE);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const wide = !!screens.lg;
  const isMobile = !screens.md;
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const { message } = AntdApp.useApp();
  const { data: canManageMailboxes } = useCan({ resource: "mailboxes", action: "list" });
  const hasMailboxes = mailboxes.length > 0;
  const [mailboxesLoaded, setMailboxesLoaded] = useState(false);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [width, setWidth] = useState(() => readSavedPanelWidth(WIDTH_PANEL));
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      setWidth(clampPanelWidth(WIDTH_PANEL, e.clientX));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth((w) => {
        savePanelWidth(WIDTH_PANEL, w);
        return w;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    Promise.all([
      supabaseClient.from("mailboxes").select("id, address, display_name, color").order("display_name"),
      supabaseClient.from("mailbox_connections").select("mailbox_id, status"),
    ]).then(([{ data: boxes }, { data: connections }]) => {
      setMailboxes((boxes as any[]) ?? []);
      setMailboxesLoaded(true);
      setBrokenMailboxIds(((connections as any[]) ?? []).filter((c) => c.status === "error").map((c) => c.mailbox_id));
    });
  }, []);

  const smartView = SMART_VIEWS.find((v) => v.key === view);
  const viewMailbox = viewMailboxId(view);
  // Every view is about email threads: none without a mailbox.
  const navViews = hasMailboxes ? SMART_VIEWS : [];
  const viewIsKnown = smartView ? navViews.some((v) => v.key === view) : !!viewMailbox && mailboxes.some((m) => m.id === viewMailbox);
  const activeView = viewIsKnown ? view : "mine";
  const activeSmartView = SMART_VIEWS.find((v) => v.key === activeView);
  const viewLabel = activeSmartView?.label ?? mailboxes.find((m) => m.id === viewMailboxId(activeView))?.display_name ?? "Mine";

  const loadThreads = async () => {
    if (!identity?.id) return;
    // Only the newest call may write its result (a slow older one finishing last must not show an outdated list).
    const seq = ++loadSeqRef.current;
    if (!hasMailboxes) {
      setThreads([]);
      setDrafts([]);
      setListLoading(false);
      return;
    }
    const mailboxId = viewMailboxId(activeView);
    const [{ data: threadRows }, { data: counts }, { data: draftRows }] = await Promise.all([
      supabaseClient.rpc("email_view_threads", {
        p_view: mailboxId ? "mailbox" : activeView,
        p_mailbox: mailboxId,
        p_unread_only: unreadOnly,
        p_closed: showClosed,
        p_search: searchTerm || null,
        p_limit: threadLimit + 1,
      }),
      supabaseClient.rpc("email_view_counts"),
      // Drafts of the mailboxes (RLS): replies in the making mark their thread, new emails get a row of their own.
      supabaseClient
        .from("email_thread_drafts")
        .select(
          "id, email_thread_id, mailbox_id, subject, entity_links, created_by_user_id, locked_by_user_id, locked_at, updated_at, " +
            "locked_by:users!email_thread_drafts_locked_by_user_id_fkey(name, email), mailboxes(display_name, color)",
        )
        .order("updated_at", { ascending: false })
        .limit(200),
    ]);
    if (seq !== loadSeqRef.current) return;
    setListLoading(false);
    const all = (threadRows as any[]) ?? [];
    setHasMoreThreads(all.length > threadLimit);
    const data = all.slice(0, threadLimit);
    setViewCounts((counts as ViewCounts | null) ?? null);
    const writerByThread = new Map<string, DraftWriter>();
    const standalone: DraftItem[] = [];
    for (const d of (draftRows as any[]) ?? []) {
      const writing = isLockedByOther(d, identity.id);
      if (d.email_thread_id) {
        if (writing) writerByThread.set(d.email_thread_id, d.locked_by);
      } else {
        standalone.push({
          id: d.id,
          subject: d.subject,
          updatedAt: d.updated_at,
          mailboxId: d.mailbox_id,
          mailboxName: d.mailboxes?.display_name ?? null,
          mailboxColor: d.mailboxes?.color ?? null,
          createdByMe: d.created_by_user_id === identity.id,
          lockedByMe: d.locked_by_user_id === identity.id,
          entityTypes: ((d.entity_links as any[]) ?? []).map((l) => l.entity_type),
          writer: d.locked_by ?? null,
          writing: !!d.locked_by_user_id && !!d.locked_at && Date.now() - new Date(d.locked_at).getTime() < 120_000,
        });
      }
    }
    setDrafts(standalone);
    setThreads(
      data.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        lastMessageAt: t.last_message_at,
        mailboxName: t.mailbox_name ?? null,
        mailboxColor: t.mailbox_color ?? null,
        unread: !!t.unread,
        relevant: !!t.relevant,
        responsibleId: t.responsible_user_id ?? null,
        entityTypes: t.entity_types ?? [],
        writer: writerByThread.get(t.id) ?? null,
      })),
    );
  };
  // The effects below run with the render they were made in; this always reaches the newest loadThreads.
  const loadThreadsRef = useRef(loadThreads);
  loadThreadsRef.current = loadThreads;

  // Another view, filter or page, or a changed search: load again (the search waits for a pause in typing).
  useEffect(() => {
    const timer = setTimeout(() => loadThreadsRef.current(), searchTerm ? 300 : 0);
    return () => clearTimeout(timer);
  }, [identity?.id, hasMailboxes, activeView, unreadOnly, showClosed, threadLimit, searchTerm]);

  // A colleague's draft, lock or new mail shows up without a reload: realtime (debounced, one reload per burst) with a
  // slow poll as the safety net for a missed event.
  useEffect(() => {
    if (!hasMailboxes) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => loadThreadsRef.current(), 800);
    };
    const timer = setInterval(() => loadThreadsRef.current(), 60_000);
    const channel = supabaseClient
      .channel("inbox_email_list")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_messages" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_thread_drafts" }, reload)
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
      clearInterval(timer);
      supabaseClient.removeChannel(channel);
    };
  }, [identity?.id, hasMailboxes]);

  const startNewEmail = async () => {
    if (!identity?.id) return;
    const { id, error } = await createNewEmailDraft(identity.id);
    if (error || !id) {
      message.error(error ?? "Could not start the email");
      return;
    }
    openDraft(id);
    loadThreads();
  };

  const openDraft = (id: string) => {
    setSelectedThreadId(null);
    setSelectedDraftId(id);
  };

  // Deep links: ?thread=<id>, or ?conversation=<id> of a thread's internal conversation (a push for an internal note).
  useEffect(() => {
    const draftParam = searchParams.get("draft");
    if (draftParam) {
      openDraft(draftParam);
      return;
    }
    const threadParam = searchParams.get("thread");
    if (threadParam) {
      setSelectedThreadId(threadParam);
      setSelectedDraftId(null);
      return;
    }
    const conversationParam = searchParams.get("conversation");
    if (!conversationParam) return;
    supabaseClient
      .from("conversations")
      .select("entity_type:anchor_type, entity_id:anchor_id")
      .eq("id", conversationParam)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.entity_type === "email_threads") {
          setSelectedThreadId(data.entity_id);
          setSelectedDraftId(null);
        }
      });
  }, [searchParams]);

  // Threads come filtered from the server; only the typed search of a draft or the unread switch is applied here.
  const visibleThreads = threads;
  const draftInView = (d: DraftItem) =>
    activeView === "mine" ? d.createdByMe || d.lockedByMe : viewMailboxId(activeView) ? d.mailboxId === viewMailboxId(activeView) : activeView === "free" ? d.entityTypes.length === 0 : false;
  const visibleDrafts = drafts.filter(
    (d) => draftInView(d) && (!searchTerm || `${d.subject ?? ""} ${d.mailboxName ?? ""}`.toLowerCase().includes(searchTerm)) && !unreadOnly,
  );
  const items: ListItem[] = [
    ...visibleDrafts.map((draft): ListItem => ({ kind: "draft", at: draft.updatedAt, draft })),
    ...visibleThreads.map((thread): ListItem => ({ kind: "thread", at: thread.lastMessageAt, thread })),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  const nav = (touch?: boolean) => (
    <SmartViewNav
      views={navViews}
      mailboxes={mailboxes}
      counts={viewCounts}
      active={activeView}
      onSelect={setView}
      touch={touch}
    />
  );
  const activeBadge = activeSmartView ? badgeCount(activeSmartView, viewCounts) : (viewCounts?.mailboxes?.[viewMailbox ?? ""]?.u ?? 0);
  const panelOpen = !!(selectedThreadId || selectedDraftId);
  const closePanel = () => {
    setSelectedThreadId(null);
    setSelectedDraftId(null);
  };

  return (
    <div style={{ display: "flex", height: isMobile ? "calc(100dvh - 112px - 57px - var(--bar-gap))" : "calc(100vh - 112px)", border: `1px solid ${token.colorBorderSecondary}` }}>
      {wide && (
        <div style={{ width: 220, flexShrink: 0, overflowY: "auto", padding: 8, borderRight: `1px solid ${token.colorBorderSecondary}` }}>{nav()}</div>
      )}
      <div
        style={
          isMobile
            ? { flex: 1, minWidth: 0, display: panelOpen ? "none" : "flex", flexDirection: "column" }
            : { width, minWidth: WIDTH_PANEL.min, maxWidth: WIDTH_PANEL.max, flexShrink: 0, position: "relative", display: "flex", flexDirection: "column" }
        }
      >
        <div style={{ padding: "8px 12px", flexShrink: 0, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {wide ? (
              <Typography.Text strong style={{ flex: 1, minWidth: 0 }} ellipsis>
                {viewLabel}
              </Typography.Text>
            ) : (
              // Narrower screens and phones: the views live in a drawer, this button names the current one.
              <Button onClick={() => setNavOpen(true)} style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{viewLabel}</span>
                {activeBadge > 0 && <Badge count={activeBadge} overflowCount={99} size="small" style={{ marginLeft: 8 }} />}
                <DownOutlined style={{ marginLeft: 8, fontSize: 11 }} />
              </Button>
            )}
            {hasMailboxes && (
              <Button icon={<PlusOutlined />} onClick={startNewEmail}>
                {isMobile ? undefined : "New email"}
              </Button>
            )}
          </div>
          <Input
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
            placeholder="Search email threads"
            style={{ borderRadius: 20 }}
          />
          <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <Switch size="small" checked={unreadOnly} onChange={setUnreadOnly} />
              Unread only
            </label>
            {hasMailboxes && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <Switch size="small" checked={showClosed} onChange={setShowClosed} />
                Closed
              </label>
            )}
          </div>
        </div>
        {mailboxesLoaded && !hasMailboxes && (
          <Alert
            type="info"
            banner
            message="No mailbox yet"
            description={canManageMailboxes?.can ? <Button size="small" onClick={() => navigate("/admin/mailboxes")}>Connect a mailbox</Button> : "Notes and chats are on the Messages page. Mail shows up here once an admin connects a mailbox you belong to."}
          />
        )}
        {hasMailboxes && brokenMailboxIds.some((id) => !viewMailbox || viewMailbox === id) && (
          <Alert
            type="error"
            banner
            message="A mailbox needs reconnecting"
            description={
              canManageMailboxes?.can ? (
                <Button size="small" onClick={() => navigate("/admin/mailboxes")}>
                  Go to Mailboxes admin
                </Button>
              ) : (
                "Ask an admin to reconnect it - mail of that mailbox is paused until then."
              )
            }
          />
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <List
          loading={listLoading}
          dataSource={items}
          locale={{
            emptyText: searchTerm
              ? "No conversations match your search"
              : unreadOnly
                ? "No unread conversations in this view"
                : (activeSmartView?.emptyText ?? "No email threads in this mailbox"),
          }}
          renderItem={(item) => {
            if (item.kind === "draft") return (
              <List.Item
                onClick={() => openDraft(item.draft.id)}
                style={{ cursor: "pointer", padding: "10px 16px", background: selectedDraftId === item.draft.id ? token.colorFillTertiary : undefined }}
              >
                <List.Item.Meta
                  avatar={<EditOutlined style={{ color: item.draft.mailboxColor ?? token.colorTextSecondary }} />}
                  title={
                    <span>
                      <Tag color="gold" style={{ marginRight: 6 }}>
                        draft
                      </Tag>
                      {item.draft.subject || "(no subject)"}
                    </span>
                  }
                  description={
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {item.draft.writing && item.draft.writer ? `${writerLabel(item.draft.writer)} is writing - ` : ""}
                      {item.draft.mailboxName ? `${item.draft.mailboxName} - ` : ""}
                      {formatDateTime(item.draft.updatedAt)}
                    </Typography.Text>
                  }
                />
              </List.Item>
            );
            return (
              <List.Item
                onClick={() => {
                  setSelectedDraftId(null);
                  setSelectedThreadId(item.thread.id);
                  setThreads((prev) => prev.map((t) => (t.id === item.thread.id ? { ...t, unread: false } : t)));
                }}
                style={{
                  cursor: "pointer",
                  padding: "10px 16px",
                  background: selectedThreadId === item.thread.id ? token.colorFillTertiary : undefined,
                }}
              >
                <List.Item.Meta
                  avatar={item.thread.unread ? <Badge dot color={item.thread.relevant ? undefined : token.colorTextQuaternary} /> : undefined}
                  title={
                    <span style={{ fontWeight: item.thread.unread && item.thread.relevant ? 600 : 400 }}>
                      <Tooltip title="Email thread">
                        <span style={{ marginRight: 6, color: item.thread.mailboxColor ?? token.colorTextSecondary }}>
                          <MailOutlined />
                        </span>
                      </Tooltip>
                      {item.thread.subject || "(no subject)"}
                      {item.thread.writer && (
                        <Tag color="processing" icon={<EditOutlined />} style={{ marginLeft: 6 }}>
                          {writerLabel(item.thread.writer)} is writing
                        </Tag>
                      )}
                      {!item.thread.responsibleId && (
                        <Tag color="orange" style={{ marginLeft: 6 }}>
                          unassigned
                        </Tag>
                      )}
                    </span>
                  }
                  description={
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {item.thread.mailboxName ? `${item.thread.mailboxName} - ` : ""}
                      {formatDateTime(item.thread.lastMessageAt)}
                    </Typography.Text>
                  }
                />
              </List.Item>
            );
          }}
        />
        {hasMoreThreads && (
          <div style={{ padding: 12, textAlign: "center" }}>
            <Button onClick={() => setThreadLimit((n) => n + THREAD_PAGE)}>Show more</Button>
          </div>
        )}
        </div>
        {!isMobile && (
        <div
          onMouseDown={startDrag}
          style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 1 }}
        />
        )}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: isMobile && !panelOpen ? "none" : "flex",
          flexDirection: "column",
          borderLeft: isMobile ? undefined : `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        {isMobile && panelOpen && (
          <div style={{ flexShrink: 0, padding: "6px 8px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={closePanel}>
              Back to list
            </Button>
          </div>
        )}
        {selectedDraftId ? (
          <EmailDraftPanel
            key={selectedDraftId}
            draftId={selectedDraftId}
            onChanged={loadThreads}
            onSent={(threadId) => {
              setSelectedDraftId(null);
              if (threadId) setSelectedThreadId(threadId);
              loadThreads();
            }}
            onDiscarded={() => {
              setSelectedDraftId(null);
              loadThreads();
            }}
          />
        ) : selectedThreadId ? (
          <EmailThreadPanel
            key={selectedThreadId}
            threadId={selectedThreadId}
            onChanged={loadThreads}
            onOpenDraft={(id) => { openDraft(id); loadThreads(); }}
            onClosed={(id, goNext) => {
              // The next thread of the list below the closed one (else the one above); "Close" alone stays, except on a phone.
              const threadItems = items.filter((i): i is Extract<ListItem, { kind: "thread" }> => i.kind === "thread");
              const at = threadItems.findIndex((i) => i.thread.id === id);
              const next = threadItems[at + 1] ?? threadItems[at - 1];
              if (goNext && next) {
                setSelectedThreadId(next.thread.id);
                setThreads((prev) => prev.map((t) => (t.id === next.thread.id ? { ...t, unread: false } : t)));
              } else if (goNext || isMobile) closePanel();
            }}
          />
        ) : (
          <Empty description="Select an email thread" style={{ marginTop: 48 }} />
        )}
      </div>
      <Drawer
        open={navOpen && !wide}
        onClose={() => setNavOpen(false)}
        placement={isMobile ? "bottom" : "left"}
        height={isMobile ? "70vh" : undefined}
        width={isMobile ? undefined : 300}
        title="Views"
        styles={{ body: { padding: 8 } }}
      >
        {nav(isMobile)}
      </Drawer>
    </div>
  );
};
