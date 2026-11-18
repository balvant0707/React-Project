import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App as AntdApp, Button, Popover, Tooltip, theme as antdTheme } from "antd";
import { SmileOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useIdentity } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { REACTIONS, reactionRows, type ReactionColumn, type ReactionKey, type ReactionRow } from "../lib/reactions";
import { useUserMap } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { userDisplayName } from "./mentions";
import { errorText } from "@rbp/core";

// Emoji reactions (~/maintenance_tool/docs/messaging.md "Reactions"): a fixed set of English codes; every reaction rewrites
// messages.reactions, which reaches other viewers through Realtime.

// One message's reactions, toggled optimistically; the saved state returns as `rows` via Realtime, a failed write is undone.
export function useMessageReactions(messageId: string, rows: ReactionRow[] | undefined) {
  const { message } = AntdApp.useApp();
  const { identity } = useIdentity();
  const [local, setLocal] = useState<ReactionRow[]>(rows ?? []);
  useEffect(() => setLocal(rows ?? []), [rows]);
  const me = identity?.id;
  const toggle = async (reaction: ReactionKey) => {
    if (!me) return;
    const on = !local.some((r) => r.user_id === me && r.reaction === reaction);
    const before = local;
    setLocal((list) => (on ? [...list, { message_id: messageId, user_id: me, reaction }] : list.filter((r) => !(r.user_id === me && r.reaction === reaction))));
    const { error } = on
      ? await supabaseClient.from("message_reactions").insert({ message_id: messageId, reaction })
      : await supabaseClient.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", me).eq("reaction", reaction);
    // A double tap may race into "already there", which is the state wanted anyway.
    if (error && error.code !== "23505") {
      setLocal(before);
      message.error(errorText(error));
    }
  };
  return { rows: local, me, toggle };
}
type MessageReactions = ReturnType<typeof useMessageReactions>;

// For lists: the hook per message, handed to the render function (a hook cannot run inside a loop).
export const WithReactions = ({ messageId, rows, children }: {
  messageId: string;
  rows: ReactionRow[] | undefined;
  children: (state: MessageReactions) => ReactNode;
}) => <>{children(useMessageReactions(messageId, rows))}</>;

// Pills and smiley in one row, in the flow (email thread notes); inside a "chat-row" element the smiley shows on hover.
export const ColumnReactions = ({ messageId, column }: { messageId: string; column: ReactionColumn }) => {
  const rows = useMemo(() => reactionRows(messageId, column), [messageId, column]);
  const state = useMessageReactions(messageId, rows);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
      <ReactionBar state={state} canReact style={{ marginTop: 0, marginBottom: 0, paddingInline: 0 }} />
      <ReactionPicker state={state} />
    </div>
  );
};

// The pills under a message, mine highlighted. Computer: names on hover, a click toggles; phone: a tap lists all reactions.
export const ReactionBar = ({ state, canReact, style }: { state: MessageReactions; canReact: boolean; style?: React.CSSProperties }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const users = useUserMap();
  const isMobile = useIsMobile();
  const [listOpen, setListOpen] = useState(false);
  // The pills lie half on the lower edge of the message, as in messengers.
  const overlap: React.CSSProperties = { gap: 4, marginTop: -12, marginBottom: 4, paddingInline: 8, position: "relative", zIndex: 1 };
  const used = REACTIONS.map((r) => {
    const by = state.rows.filter((x) => x.reaction === r.key);
    return {
      ...r,
      by,
      mine: by.some((x) => x.user_id === state.me),
      names: by.map((x) => (x.user_id === state.me ? t("feed.reactionYou") : users.get(x.user_id) ? userDisplayName(users.get(x.user_id)!) : t("feed.unknownUser"))),
    };
  }).filter((r) => r.by.length > 0);
  if (!used.length) return null;

  const pill = (r: (typeof used)[number], onClick?: () => void) => (
    <button
      key={r.key}
      type="button"
      disabled={!canReact && !isMobile}
      aria-pressed={r.mine}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 24,
        padding: "0 8px",
        borderRadius: 12,
        fontSize: 13,
        lineHeight: 1,
        cursor: canReact || isMobile ? "pointer" : "default",
        color: token.colorText,
        // Opaque, so the pill can sit on the edge of a bubble.
        background: r.mine ? token.colorPrimaryBg : token.colorBgElevated,
        border: `1px solid ${r.mine ? token.colorPrimaryBorder : token.colorBorder}`,
        boxShadow: token.boxShadowTertiary,
      }}
    >
      <span>{r.emoji}</span>
      <span style={{ fontSize: 12, fontWeight: r.mine ? 600 : 400 }}>{r.by.length}</span>
    </button>
  );

  if (isMobile) {
    const list = (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 200, maxWidth: "80vw", maxHeight: 300, overflowY: "auto" }}>
        {used.map((r) => (
          <button
            key={r.key}
            type="button"
            disabled={!canReact}
            aria-pressed={r.mine}
            onClick={() => void state.toggle(r.key)}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              textAlign: "start",
              padding: "6px 8px",
              border: "none",
              borderRadius: 8,
              color: token.colorText,
              background: r.mine ? token.colorPrimaryBg : "transparent",
              cursor: canReact ? "pointer" : "default",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1.2 }}>{r.emoji}</span>
            <span style={{ fontSize: 13 }}>{r.names.join(", ")}</span>
          </button>
        ))}
      </div>
    );
    return (
      <Popover trigger="click" open={listOpen} onOpenChange={setListOpen} content={list} styles={{ body: { padding: 4 } }}>
        <div role="button" aria-label={t("feed.reactionsWho")} style={{ display: "flex", flexWrap: "wrap", ...overlap, ...style }}>
          {used.map((r) => pill(r))}
        </div>
      </Popover>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", ...overlap, ...style }}>
      {used.map((r) => (
        <Tooltip key={r.key} title={r.names.join(", ")}>
          {pill(r, () => void state.toggle(r.key))}
        </Tooltip>
      ))}
    </div>
  );
};

const Choices = ({ state, onPicked }: { state: MessageReactions; onPicked: () => void }) => {
  const { token } = antdTheme.useToken();
  return (
    <div className="reaction-choices" style={{ display: "flex", gap: 2 }}>
      {REACTIONS.map((r) => {
        const mine = state.rows.some((x) => x.user_id === state.me && x.reaction === r.key);
        return (
          <button
            key={r.key}
            type="button"
            aria-pressed={mine}
            onClick={() => {
              onPicked();
              void state.toggle(r.key);
            }}
            style={{ fontSize: 22, width: 40, height: 40, border: "none", borderRadius: 20, cursor: "pointer", background: mine ? token.colorPrimaryBg : "transparent" }}
          >
            {r.emoji}
          </button>
        );
      })}
    </div>
  );
};

// The smiley button that opens the choice of reactions.
export const ReactionPicker = ({ state, size = 20 }: { state: MessageReactions; size?: number }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover trigger="click" open={open} onOpenChange={setOpen} content={<Choices state={state} onPicked={() => setOpen(false)} />} styles={{ body: { padding: 4 } }}>
      <Button type="text" size="small" className="chat-action" icon={<SmileOutlined />} title={t("feed.react")} aria-label={t("feed.react")} style={{ height: size, width: size }} />
    </Popover>
  );
};

// Phone: a long press on a message opens the same choice above it.
export const LongPressReactions = ({ state, enabled, children }: { state: MessageReactions; enabled: boolean; children: ReactNode }) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  // Opened by hand (no trigger), so a tap anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".reaction-choices")) setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener("pointerdown", close), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);
  if (!isMobile || !enabled) return <>{children}</>;
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <Popover open={open} trigger={[]} content={<Choices state={state} onPicked={() => setOpen(false)} />} styles={{ body: { padding: 4 } }}>
      <div
        onTouchStart={() => {
          cancel();
          timer.current = window.setTimeout(() => {
            setOpen(true);
            navigator.vibrate?.(10);
          }, 450);
        }}
        onTouchMove={cancel}
        onTouchEnd={cancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
      >
        {children}
      </div>
    </Popover>
  );
};
