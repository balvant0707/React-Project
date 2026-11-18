// Hand-written replacement of NPM's components/followToggle.tsx: same props,
// follow / mute through conversation_participants; email threads keep NPM's thread_follows.
import { useCallback, useEffect, useState } from "react";
import { Button, Tooltip } from "antd";
import { BellFilled, BellOutlined } from "@ant-design/icons";
import { supabaseClient, useGetIdentity } from "@rbp/core";

type FollowState = "follow" | "mute" | "none";

export const FollowToggle = ({ targetType, targetId }: { targetType: "conversations" | "email_threads"; targetId: string | null }) => {
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [state, setState] = useState<FollowState | null>(null);

  const load = useCallback(() => {
    if (!targetId || !identity?.id) return setState(null);
    if (targetType === "email_threads") {
      supabaseClient.rpc("thread_follow_state", { p_target_type: targetType, p_target_id: targetId }).then(({ data }) => setState((data as FollowState) ?? "none"));
      return;
    }
    supabaseClient
      .from("conversation_participants")
      .select("taking_part, level")
      .eq("conversation_id", targetId)
      .eq("user_id", identity.id)
      .maybeSingle()
      .then(({ data }) => setState(data?.level === "mute" ? "mute" : data?.taking_part ? "follow" : "none"));
  }, [targetType, targetId, identity?.id]);
  useEffect(load, [load]);

  if (!targetId || !identity?.id || state === null) return null;
  const following = state === "follow";
  const toggle = async () => {
    if (targetType === "email_threads") {
      const level = following ? "mute" : "follow";
      setState(level);
      const { error } = await supabaseClient
        .from("thread_follows")
        .upsert({ user_id: identity.id, target_type: targetType, target_id: targetId, level }, { onConflict: "user_id,target_type,target_id" });
      if (error) load();
      return;
    }
    const level = following ? "mute" : "all";
    setState(following ? "mute" : "follow");
    const { error } = await supabaseClient
      .from("conversation_participants")
      .upsert({ conversation_id: targetId, user_id: identity.id, level, taking_part: !following }, { onConflict: "conversation_id,user_id" });
    if (error) load();
  };

  return (
    <Tooltip title={following ? "You get notified about new messages here. Click to mute." : "Muted (mentions still reach you). Click to follow."}>
      <Button size="small" type={following ? "default" : "dashed"} icon={following ? <BellFilled /> : <BellOutlined />} onClick={toggle}>
        {following ? "Following" : state === "mute" ? "Muted" : "Follow"}
      </Button>
    </Tooltip>
  );
};
