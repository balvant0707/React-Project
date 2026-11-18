import { useState } from "react";
import { App as AntdApp, Button, Checkbox, Popover, Progress, Radio, Tag, Typography } from "antd";
import { BarChartOutlined, EyeInvisibleOutlined, TeamOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPollState, isPollClosedError, pollClose, pollEnded, pollQueryKey, pollVote, type Poll } from "../lib/polls";
import { useUserMap } from "@rbp/core";
import { userDisplayName } from "../feed/mentions";
import { formatDateTime } from "@rbp/ui";
import { errorText } from "@rbp/core";

// The poll under a post (lib/polls.ts): vote while it runs, bars once the result is visible. Starts from `initial`, then
// kept current from Realtime (applyPollUpdate).
export const PollCard = ({ messageId, initial, isAuthor }: { messageId: string; initial: Poll; isAuthor: boolean }) => {
  const { t } = useTranslation();
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const users = useUserMap();
  const { data } = useQuery({ queryKey: pollQueryKey(messageId), queryFn: () => fetchPollState(messageId) });
  const poll = data?.poll ?? initial;
  const mine = data?.mine ?? [];
  const result = data?.result ?? [];
  const [choice, setChoice] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);

  const ended = pollEnded(poll);
  const selected = choice ?? mine;
  const voted = mine.length > 0;
  const changed = choice !== null && [...choice].sort().join() !== [...mine].sort().join();
  const refresh = () => queryClient.invalidateQueries({ queryKey: pollQueryKey(messageId) });

  const vote = async (options: number[]) => {
    setBusy(true);
    const { error } = await pollVote(messageId, options);
    setBusy(false);
    if (error) {
      message.error(isPollClosedError(error) ? t("polls.closedError") : errorText(error));
    } else {
      setChoice(null);
    }
    await refresh();
  };
  const close = () =>
    modal.confirm({
      title: t("polls.closeTitle"),
      content: t("polls.closeText"),
      okText: t("polls.close"),
      onOk: async () => {
        const { error } = await pollClose(messageId);
        if (error) message.error(errorText(error));
        await refresh();
      },
    });

  const toggle = (option: number, on: boolean) =>
    setChoice(poll.multiple ? (on ? [...selected, option] : selected.filter((o) => o !== option)) : [option]);

  const names = (ids: string[] | null | undefined) =>
    (ids ?? []).map((id) => {
      const u = users.get(id);
      return u ? userDisplayName(u) : "?";
    });

  return (
    <div style={{ marginTop: 10, padding: 12, border: "1px solid var(--ant-color-border-secondary)", borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <BarChartOutlined />
        <Typography.Text strong>{t("polls.poll")}</Typography.Text>
        <Tag icon={poll.public ? <TeamOutlined /> : <EyeInvisibleOutlined />} style={{ marginInlineEnd: 0 }}>
          {poll.public ? t("polls.public") : t("polls.secret")}
        </Tag>
        {poll.multiple && <Tag style={{ marginInlineEnd: 0 }}>{t("polls.multiple")}</Tag>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {poll.options.map((text, option) => {
          const row = result.find((r) => r.option === option);
          // Share of the people who voted: in a multiple-choice poll the shares add up to more than 100.
          const pct = poll.vote_count ? Math.min(100, Math.round(((row?.votes ?? 0) * 100) / poll.vote_count)) : 0;
          const label = (
            <span>
              {text}
              {mine.includes(option) && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {" "}
                  · {t("polls.yourVote")}
                </Typography.Text>
              )}
            </span>
          );
          return (
            <div key={option}>
              {ended ? (
                label
              ) : poll.multiple ? (
                <Checkbox checked={selected.includes(option)} disabled={busy} onChange={(e) => toggle(option, e.target.checked)}>
                  {label}
                </Checkbox>
              ) : (
                <Radio checked={selected.includes(option)} disabled={busy} onChange={() => toggle(option, true)}>
                  {label}
                </Radio>
              )}
              {row && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Progress percent={pct} showInfo={false} size="small" style={{ flex: 1, margin: 0 }} />
                  {poll.public && row.votes > 0 ? (
                    <Popover trigger="click" title={text} content={<div style={{ maxHeight: 240, overflowY: "auto" }}>{names(row.voter_ids).map((n, i) => <div key={i}>{n}</div>)}</div>}>
                      <Button type="link" size="small" style={{ padding: 0, height: "auto" }}>
                        {t("polls.votes", { count: row.votes })}
                      </Button>
                    </Popover>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {t("polls.votes", { count: row.votes })}
                    </Typography.Text>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!ended && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Button type="primary" size="small" loading={busy} disabled={!selected.length || (voted && !changed)} onClick={() => vote(selected)}>
            {voted ? t("polls.changeVote") : t("polls.vote")}
          </Button>
          {voted && (
            <Button size="small" disabled={busy} onClick={() => vote([])}>
              {t("polls.withdraw")}
            </Button>
          )}
          {isAuthor && (
            <Button size="small" disabled={busy} onClick={close}>
              {t("polls.close")}
            </Button>
          )}
        </div>
      )}
      <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 8 }}>
        {t("polls.voters", { count: poll.vote_count })}
        {ended && ` · ${t("polls.endedAt", { date: formatDateTime(poll.closed_at) })}`}
        {!ended && !result.length && ` · ${t("polls.resultAfterEnd")}`}
        {!ended && isAuthor && ` · ${t("polls.onlyYouSee")}`}
      </Typography.Text>
    </div>
  );
};
