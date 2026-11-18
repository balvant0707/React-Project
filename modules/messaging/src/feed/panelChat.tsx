import { useLayoutEffect, useRef, useState } from "react";
import { theme as antdTheme } from "antd";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntityType } from "@rbp/core";
import { fetchCanEdit } from "../lib/feedQueries";
import { useRecordConversation } from "../hooks/useRecordConversation";
import { ChatView } from "../chats/chatView";
import { FollowButton } from "../chats/followButton";

// Computer: the conversation of a record as a chat in a box of a given height (side panel of the task page): newest
// message at the bottom, the message field at the foot, older messages load when scrolled up (ChatView). `header`
// sits above the chat, next to the Follow button. On a phone the chat is the record's conversation in the Messages module (RecordChatButton).
export const PanelChat = ({ entityType, entityId, height, header }: { entityType: EntityType; entityId: string; height: string | number; header?: React.ReactNode }) => {
  const { token } = antdTheme.useToken();
  const queryClient = useQueryClient();
  const { data: conversationId, isLoading } = useRecordConversation(entityType, entityId);
  const { data: canEdit } = useQuery({ queryKey: ["can-edit", entityType, entityId], queryFn: () => fetchCanEdit(entityType, entityId) });
  return (
    <div style={{ height, display: "flex", flexDirection: "column", border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, background: token.colorBgContainer, overflow: "hidden" }}>
      <div style={{ flex: "none", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, padding: "4px 8px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        {conversationId && <FollowButton conversationId={conversationId} iconOnly />}
        {header}
      </div>
      {/* absolute: a percentage height inside a flex item is not reliable, the chat scrolls inside this box */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", background: token.colorFillQuaternary }}>
        <div style={{ position: "absolute", inset: 0 }}>
          {!isLoading && (
            <ChatView
              conversationId={conversationId ?? null}
              entityType={entityType}
              entityId={entityId}
              withEvents
              canComment={canEdit ?? false}
              onSent={() => void queryClient.invalidateQueries({ queryKey: ["record-conversation", entityType, entityId] })}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// The side panel: stays in view while the page scrolls (below the sticky header) and is exactly as tall as the room left
// on the screen, so the message field is always visible; the chat scrolls inside on its own.
// The header's real height is measured (it grows with the app's header content); the scroll listener is a capture listener
// because the page may scroll in an inner container, whose scroll events do not bubble to window.
const HEADER_HEIGHT = 72;
const measureHeader = () => document.querySelector<HTMLElement>("header.ant-layout-header")?.getBoundingClientRect().height || HEADER_HEIGHT;
export const StickyPanelChat = ({ entityType, entityId, header }: { entityType: EntityType; entityId: string; header?: React.ReactNode }) => {
  const ref = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(600);
  const [headerHeight, setHeaderHeight] = useState(measureHeader);
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      const headerH = measureHeader();
      setHeaderHeight(headerH);
      const top = ref.current?.getBoundingClientRect().top ?? headerH;
      setHeight(Math.max(320, window.innerHeight - Math.max(top, headerH) - 16));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return (
    // alignSelf start: in a stretching grid / flex row the aside would fill the whole row and have no room to stick in.
    <aside ref={ref} style={{ position: "sticky", top: headerHeight, alignSelf: "start" }}>
      <PanelChat entityType={entityType} entityId={entityId} height={height} header={header} />
    </aside>
  );
};

// The width of the side panel is the user's to choose (drag the edge, double click resets, arrow keys on the handle);
// it is remembered per browser.
export const CHAT_WIDTH = { min: 320, max: 760, standard: 400 };
const WIDTH_KEY = "compass.task.chatWidth";
const clampWidth = (w: number) => Math.min(CHAT_WIDTH.max, Math.max(CHAT_WIDTH.min, Math.round(w)));

export const useChatWidth = () => {
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(WIDTH_KEY));
      return stored ? clampWidth(stored) : CHAT_WIDTH.standard;
    } catch {
      return CHAT_WIDTH.standard;
    }
  });
  const commit = (next: number) => {
    const value = clampWidth(next);
    setWidth(value);
    try {
      localStorage.setItem(WIDTH_KEY, String(value));
    } catch {
      /* not remembered */
    }
  };
  return { width, setWidth: (w: number) => setWidth(clampWidth(w)), commit };
};

export const ChatResizeHandle = ({ width, onChange, onCommit }: { width: number; onChange: (w: number) => void; onCommit: (w: number) => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("feed.resizePanel")}
      aria-valuenow={width}
      aria-valuemin={CHAT_WIDTH.min}
      aria-valuemax={CHAT_WIDTH.max}
      tabIndex={0}
      title={t("feed.resizePanel")}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, width };
        e.currentTarget.setPointerCapture(e.pointerId);
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (drag.current) onChange(drag.current.width - (e.clientX - drag.current.x));
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        onCommit(drag.current.width - (e.clientX - drag.current.x));
        drag.current = null;
        setActive(false);
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onDoubleClick={() => onCommit(CHAT_WIDTH.standard)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onCommit(width + 24);
        if (e.key === "ArrowRight") onCommit(width - 24);
      }}
      style={{ cursor: "col-resize", touchAction: "none", display: "flex", justifyContent: "center", userSelect: "none" }}
    >
      <div style={{ width: 3, height: "100%", borderRadius: 2, background: active ? token.colorPrimary : hover ? token.colorBorder : "transparent", transition: "background 0.15s" }} />
    </div>
  );
};
