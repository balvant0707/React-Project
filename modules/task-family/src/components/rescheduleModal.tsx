// Ported 1:1 from COMPASS (app/src/components/rescheduleModal.tsx).
import { useState } from "react";
import { Input, Modal, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { formatDate } from "@rbp/ui";

// Moving a due date that was already set asks for a reason; the original date stays for the statistics.
export const RescheduleModal = ({ from, to, original, onConfirm, onCancel }: { from: string | null; to: string; original: string | null; onConfirm: (reason: string) => void; onCancel: () => void }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      title={t("punctuality.rescheduleTitle")}
      okText={t("common.save")}
      okButtonProps={{ disabled: !reason.trim() }}
      onOk={() => onConfirm(reason.trim())}
      onCancel={onCancel}
    >
      <Typography.Paragraph>
        {formatDate(from)} → {formatDate(to)}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {t("punctuality.rescheduleHint", { date: formatDate(original ?? from) })}
      </Typography.Paragraph>
      <Input.TextArea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("punctuality.rescheduleReason")} />
    </Modal>
  );
};
