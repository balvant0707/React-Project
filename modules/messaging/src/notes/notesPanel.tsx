// Hand-written, replaces NPM's components/notesPanel.tsx (docs/shared-parts.md B1). NPM's frame (computer: sticky,
// resizable column following the header Notes toggles, detail or list mode; phone: block below the page or a modal for a
// list row) around the messaging ChatView. Reading the notes asks read_notes, posting write_notes (view for most records;
// companies have their own literals); without read_notes the panel shows the record's history only.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExportOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Modal, Typography, theme as antdTheme } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEntityType, supabaseClient, type EntityType } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { ChatView } from "@rbp/module-messaging/src/chats/chatView.tsx";
import { FollowButton } from "@rbp/module-messaging/src/chats/followButton.tsx";
import { useRecordConversation } from "@rbp/module-messaging/src/hooks/useRecordConversation.ts";
import { useNotesPanel } from "./notesPanelContext";
import { clampPanelWidth, readSavedPanelWidth, savePanelWidth } from "./panelWidth";

const WIDTH_PANEL = { cookie: "npmtool_notes_panel_width", def: 320, min: 260, max: 640 };

// The record's chat in a box: ChatView scrolls inside, newest at the bottom, the message field at the foot.
const RecordChat = ({ type, id }: { type: string; id: string }) => {
  const { token } = antdTheme.useToken();
  const queryClient = useQueryClient();
  const { data: conversationId, isLoading } = useRecordConversation(type as EntityType, id);
  const { data: canWrite } = useQuery({
    queryKey: ["can-write-notes", type, id],
    queryFn: async () => (await supabaseClient.rpc("can_access_entity", { p_entity_type: type, p_entity_id: id, p_grant_type: "write_notes" })).data === true,
  });
  const { data: canRead } = useQuery({
    queryKey: ["can-read-notes", type, id],
    queryFn: async () => (await supabaseClient.rpc("can_access_entity", { p_entity_type: type, p_entity_id: id, p_grant_type: "read_notes" })).data === true,
  });
  return (
    // absolute: a percentage height inside a flex item is not reliable
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: token.colorFillQuaternary }}>
      {canRead === false && <Alert type="info" banner showIcon={false} message="You can't see the notes of this record; its history is shown." />}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          {!isLoading && (
            <ChatView
              key={`${type}:${id}`}
              conversationId={conversationId ?? null}
              entityType={type as EntityType}
              entityId={id}
              withEvents
              canComment={canWrite ?? false}
              onSent={() => void queryClient.invalidateQueries({ queryKey: ["record-conversation", type, id] })}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const RecordFollow = ({ type, id }: { type: string; id: string }) => {
  const { data: conversationId } = useRecordConversation(type as EntityType, id);
  return conversationId ? <FollowButton conversationId={conversationId} iconOnly /> : null;
};

// The aside registered in the messaging manifest, so every app with messaging mounts it. The heavy part (layout measuring, resize
// listeners, record queries) is a separate component that only exists while the panel has something to show; an app whose pages
// never call useEntityNotes / useListNotes (COMPASS) renders nothing and runs none of it.
export const NotesPanel = () => {
  const { effectiveEntity: entity, isListOverride, open } = useNotesPanel();
  const isMobile = useIsMobile();
  const visible = (isMobile ? entity !== null && !isListOverride : open) || (isMobile && isListOverride && entity !== null);
  return visible ? <NotesPanelView /> : null;
};

const NotesPanelView = () => {
  const { token } = antdTheme.useToken();
  const { effectiveEntity: entity, isListOverride, open, pageKind, closeListOverride } = useNotesPanel();
  const navigate = useNavigate();
  const recordPath = entity ? (getEntityType(entity.type)?.listPath ?? null) : null;
  const isMobile = useIsMobile();
  // Phone: the page's notes below the page, a list row's notes in a modal.
  const showInline = isMobile ? entity !== null && !isListOverride : open;
  const showMobileModal = isMobile && isListOverride && entity !== null;
  const visible = showInline || showMobileModal;
  const panelRef = useRef<HTMLDivElement>(null);

  // Desktop: the panel sticks under the header down to the viewport bottom; the wrapper keeps a short page from scrolling.
  const [width, setWidth] = useState(() => readSavedPanelWidth(WIDTH_PANEL));
  const draggingRef = useRef(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [wrapperMinHeight, setWrapperMinHeight] = useState<number | null>(null);
  const [bottomPad, setBottomPad] = useState(0);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  useEffect(() => {
    if (isMobile) return;
    let frame = 0;
    const measure = () => {
      const headerH = document.querySelector<HTMLElement>("header.ant-layout-header")?.getBoundingClientRect().height ?? 0;
      setHeaderHeight(headerH);
      const wrapper = panelRef.current?.parentElement;
      const wrapperTop = wrapper?.getBoundingClientRect().top ?? headerH;
      const layout = wrapper?.parentElement?.parentElement;
      setBottomPad(layout ? parseFloat(getComputedStyle(layout).paddingBottom) || 0 : 0);
      setWrapperMinHeight(Math.round(window.innerHeight - ((wrapper?.getBoundingClientRect().top ?? 0) + window.scrollY)));
      setPanelHeight(Math.round(window.innerHeight - Math.max(headerH, wrapperTop)));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isMobile, entity?.type, entity?.id, visible]);

  // Resizing by dragging the left edge.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) setWidth(clampPanelWidth(WIDTH_PANEL, window.innerWidth - e.clientX));
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

  if (!visible) return null;

  const thread = !entity ? (
    <Empty description={pageKind === "list" ? "Select a row to see its notes" : "No notes on this screen"} style={{ marginTop: 32 }} />
  ) : (
    <RecordChat type={entity.type} id={entity.id} />
  );

  if (showMobileModal) {
    return (
      <Modal open title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}>Notes {entity && <RecordFollow type={entity.type} id={entity.id} />}</span>} onCancel={closeListOverride} footer={null}>
        <div style={{ height: "65vh", display: "flex", flexDirection: "column" }}>{thread}</div>
      </Modal>
    );
  }

  const panel = (
    <div
      ref={panelRef}
      style={
        isMobile
          ? { width: "100%", height: "70vh", borderTop: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer, display: "flex", flexDirection: "column", marginTop: 16 }
          : {
              width: "100%",
              position: "sticky",
              top: headerHeight,
              // Above the list pages' frozen banner/filter block (useFreezePanes, z-index 9), which spans the full width.
              zIndex: 10,
              height: panelHeight ?? `calc(100vh - ${headerHeight}px)`,
              minHeight: 360,
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorBgContainer,
              display: "flex",
              flexDirection: "column",
            }
      }
    >
      {!isMobile && <div onMouseDown={startDrag} style={{ position: "absolute", left: -3, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 1 }} />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", gap: 8, flex: "none" }}>
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Notes
          </Typography.Title>
          {pageKind === "list" && entity?.label && (
            <Typography.Text type="secondary" ellipsis style={{ display: "block" }}>
              {entity.label}
            </Typography.Text>
          )}
        </div>
        {entity && <RecordFollow type={entity.type} id={entity.id} />}
        {pageKind === "list" && entity && recordPath && (
          <Button size="small" icon={<ExportOutlined />} onClick={() => navigate(`${recordPath}/${entity.id}`)}>
            Open record
          </Button>
        )}
      </div>
      {thread}
    </div>
  );

  if (isMobile) return panel;
  // `contain: size` keeps the panel's content from sizing the page row.
  return (
    <div style={{ width, minWidth: WIDTH_PANEL.min, maxWidth: WIDTH_PANEL.max, flexShrink: 0, alignSelf: "stretch", contain: "size", marginBottom: -bottomPad, minHeight: Math.max(360, wrapperMinHeight ?? 0) }}>
      {panel}
    </div>
  );
};
