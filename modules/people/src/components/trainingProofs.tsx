// Ported 1:1 from COMPASS (app/src/components/trainingProofs.tsx).
import { App as AntdApp, Space, Tooltip, Typography, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { IconUsersGroup } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { uploadAttachmentFile } from "@rbp/module-messaging/src/hooks/useSignedUrl.ts";
import { useTrainingProofs } from "../hooks/useTrainings";
import { FileLink } from "@rbp/module-messaging/src/fileLink.tsx";
import { errorText } from "@rbp/core";

// Stores files as ordinary attachments of a training record or a training session (private bucket, path
// training_records/<record>/<file> or training_sessions/<session>/<file>). A session's files count for every record it
// wrote. Proofs are evidence: the app offers no delete (only HR, people.edit, removes one through the database).
export async function addTrainingProofs(recordId: string, files: File[], entityType: "training_records" | "training_sessions" = "training_records") {
  for (const file of files) {
    const uploaded = await uploadAttachmentFile(entityType, recordId, file);
    const { error } = await supabaseClient.from("attachments").insert({ entity_type: entityType, entity_id: recordId, ...uploaded });
    if (error) throw error;
  }
}

// One of recordId (its own proofs plus those of its session; uploads go to the record) or sessionId.
export const TrainingProofs = ({ recordId, sessionId, canAdd }: { recordId?: string; sessionId?: string; canAdd: boolean }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: proofs } = useTrainingProofs({ recordId, sessionId });

  const add = async (file: File) => {
    try {
      if (recordId) await addTrainingProofs(recordId, [file]);
      else if (sessionId) await addTrainingProofs(sessionId, [file], "training_sessions");
      for (const key of ["training-proofs", "training-records", "training-status", "training-sessions"]) void queryClient.invalidateQueries({ queryKey: [key] });
    } catch (e) {
      message.error(errorText(e));
    }
    return false;
  };

  return (
    <Space size={[8, 4]} wrap>
      {(proofs ?? []).map((p) => (
        <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {recordId && p.entity_type === "training_sessions" && (
            <Tooltip title={t("trainings.sessions.proofOfSession")}><IconUsersGroup size={14} aria-label={t("trainings.sessions.proofOfSession")} /></Tooltip>
          )}
          <FileLink path={p.storage_path} name={p.file_name} mimeType={p.mime_type} />
        </span>
      ))}
      {(proofs ?? []).length === 0 && <Typography.Text type="secondary">{t("trainings.noProof")}</Typography.Text>}
      {canAdd && (
        <Upload beforeUpload={add} showUploadList={false} multiple>
          <a><UploadOutlined /> {t("trainings.addProof")}</a>
        </Upload>
      )}
    </Space>
  );
};
