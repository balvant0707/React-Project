import { useState } from "react";
import { Button, Modal, Popover, Tag } from "antd";
import { IconLink, IconMoodSmile } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { EMOJI } from "../lib/emoji";
import { RemoteSelect } from "@rbp/ui";
import { recordCardTypes, type RecordCardType } from "./cards";

// The small pieces every message input shares (the message composer and the post editor use them through
// MessageComposer): the emoji picker, the "link a task" dialog and the tags of the linked tasks.

export const EmojiButton = ({ onPick, size = 14, placement = "topLeft" }: { onPick: (emoji: string) => void; size?: number; placement?: "topLeft" | "topRight" }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover
      trigger="click"
      placement={placement}
      open={open}
      onOpenChange={setOpen}
      content={
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 32px)", gap: 2 }}>
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
              style={{ width: 32, height: 32, fontSize: 20, lineHeight: 1, border: 0, background: "none", cursor: "pointer", borderRadius: 6 }}
            >
              {e}
            </button>
          ))}
        </div>
      }
    >
      <Button type="text" size="small" icon={<IconMoodSmile size={size} />} aria-label={t("feed.emoji")} title={t("feed.emoji")} />
    </Popover>
  );
};

export type LinkedCard = { kind: string; id: string; label: string };

// One "Link ..." button per record kind that modules registered (none = no button).
export const LinkCardButtons = ({ onPick }: { onPick: (card: LinkedCard) => void }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<RecordCardType | null>(null);
  return (
    <>
      {recordCardTypes().map((type) => (
        <Button key={type.kind} type="text" size="small" icon={<IconLink size={14} />} onClick={() => setOpen(type)}>
          {t("cards.link", { kind: type.label })}
        </Button>
      ))}
      <LinkCardModal type={open} onClose={() => setOpen(null)} onPick={onPick} />
    </>
  );
};

// The dialog behind "Link ..."; the chat input opens it from its "+" menu.
export const LinkCardModal = ({ type, onClose, onPick }: { type: RecordCardType | null; onClose: () => void; onPick: (card: LinkedCard) => void }) => {
  const { t } = useTranslation();
  const labels: Record<string, string> = {};
  return (
    <Modal open={!!type} title={t("cards.link", { kind: type?.label })} footer={null} onCancel={onClose} destroyOnClose>
      <RemoteSelect
        autoFocus
        minChars={1}
        style={{ width: "100%" }}
        placeholder={t("cards.placeholder")}
        loadOptions={type?.search ?? (async () => [])}
        onOptions={(options) => options.forEach((o) => (labels[o.value] = o.label))}
        onChange={(id: string) => {
          if (id && type) onPick({ kind: type.kind, id, label: labels[id] ?? id });
          onClose();
        }}
      />
    </Modal>
  );
};

export const LinkedCardTags = ({ cards, onRemove }: { cards: LinkedCard[]; onRemove: (id: string) => void }) =>
  cards.length === 0 ? null : (
    <div style={{ margin: "4px 0 8px" }}>
      {cards.map((x) => (
        <Tag key={x.id} closable icon={<IconLink size={12} style={{ verticalAlign: -2, marginInlineEnd: 4 }} />} onClose={() => onRemove(x.id)}>
          {x.label}
        </Tag>
      ))}
    </div>
  );
