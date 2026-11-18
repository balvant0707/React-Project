import { Button, Input, Radio, Space, Switch, Typography } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { POLL_MAX_OPTIONS, pollDraftProblem, type PollDraft } from "../lib/polls";

// A new poll: the post's text is the question; options, single or multiple choice, secret or public. No end date:
// the author ends the poll on the post. Secret or public cannot be changed once the post is out (the database keeps
// the poll fixed).
const newOption = () => ({ key: crypto.randomUUID(), text: "" });

export const newPollDraft = (): PollDraft => ({
  options: [newOption(), newOption()],
  multiple: false,
  public: false,
});

export const PollFields = ({ value, onChange, onRemove }: { value: PollDraft; onChange: (draft: PollDraft) => void; onRemove: () => void }) => {
  const { t } = useTranslation();
  const setOption = (key: string, text: string) => onChange({ ...value, options: value.options.map((o) => (o.key === key ? { ...o, text } : o)) });
  // Why the post cannot go out yet (the button is disabled meanwhile).
  const problem = pollDraftProblem(value);

  return (
    <div style={{ padding: 12, border: "1px solid var(--ant-color-border-secondary)", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Typography.Text strong>{t("polls.poll")}</Typography.Text>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onRemove} aria-label={t("polls.remove")} />
      </div>
      <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
        {t("polls.questionHint")}
      </Typography.Text>
      <Space direction="vertical" style={{ width: "100%" }} size={6}>
        {value.options.map((option, index) => (
          <div key={option.key} style={{ display: "flex", gap: 6 }}>
            <Input value={option.text} onChange={(e) => setOption(option.key, e.target.value)} placeholder={t("polls.optionPlaceholder", { n: index + 1 })} maxLength={200} />
            {value.options.length > 2 && (
              <Button
                type="text"
                icon={<CloseOutlined />}
                aria-label={t("polls.removeOption")}
                onClick={() => onChange({ ...value, options: value.options.filter((o) => o.key !== option.key) })}
              />
            )}
          </div>
        ))}
        {value.options.length < POLL_MAX_OPTIONS && (
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => onChange({ ...value, options: [...value.options, newOption()] })}>
            {t("polls.addOption")}
          </Button>
        )}
        {problem && (
          <Typography.Text type={problem === "duplicate" ? "danger" : "secondary"} style={{ fontSize: 12 }}>
            {t(problem === "duplicate" ? "polls.problemDuplicate" : "polls.problemTooFew")}
          </Typography.Text>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
          <Switch size="small" checked={value.multiple} onChange={(multiple) => onChange({ ...value, multiple })} />
          <Typography.Text>{t("polls.multipleLabel")}</Typography.Text>
        </div>
        <Radio.Group value={value.public ? "public" : "secret"} onChange={(e) => onChange({ ...value, public: e.target.value === "public" })}>
          <Radio value="secret">{t("polls.secretLabel")}</Radio>
          <Radio value="public">{t("polls.publicLabel")}</Radio>
        </Radio.Group>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {value.public ? t("polls.publicHint") : t("polls.secretHint")}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t("polls.resultHint")}
        </Typography.Text>
      </Space>
    </div>
  );
};
