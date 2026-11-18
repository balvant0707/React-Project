// Ported 1:1 from COMPASS (app/src/components/claimTaskButton.tsx).
import { useState } from "react";
import { App as AntdApp, Button, Tooltip } from "antd";
import { IconUserPlus } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { errorText } from "@rbp/core";

// "I take it" on a list row: RPC task_claim sets me as the assignee; a second click on the same task fails with "already taken".
// `round`: a dashed circle with a person icon where the assignee's photo would be (task cards on a phone).
export const ClaimTaskButton = ({ taskId, onClaimed, round }: { taskId: string; onClaimed: () => void; round?: boolean }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const claim = async () => {
    setBusy(true);
    const { error } = await supabaseClient.rpc("task_claim", { p_task_id: taskId });
    setBusy(false);
    if (error) {
      const known: Record<string, string> = {
        "The task was already taken": "tasks.claim.errors.taken",
        "The task does not belong to your team": "tasks.claim.errors.notTeam",
        "You are not allowed to edit this task": "tasks.claim.errors.notAllowed",
      };
      message.error(errorText(error, { known }));
      onClaimed();
      return;
    }
    message.success(t("tasks.claim.done"));
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    onClaimed();
  };

  if (round) {
    return (
      <Tooltip title={t("tasks.claim.button")}>
        <Button
          shape="circle"
          aria-label={t("tasks.claim.button")}
          loading={busy}
          icon={<IconUserPlus size={16} />}
          onClick={(e) => {
            e.stopPropagation();
            void claim();
          }}
          style={{ borderStyle: "dashed", width: 32, height: 32 }}
        />
      </Tooltip>
    );
  }
  return (
    <Button
      size="small"
      type="primary"
      ghost
      loading={busy}
      onClick={(e) => {
        e.stopPropagation();
        void claim();
      }}
    >
      {t("tasks.claim.button")}
    </Button>
  );
};
