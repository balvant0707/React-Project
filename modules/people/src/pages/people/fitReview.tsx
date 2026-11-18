// Ported 1:1 from COMPASS (app/src/pages/people/fitReview.tsx).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { App as AntdApp, Alert, Button, Card, DatePicker, Empty, Input, Radio, Select, Space, Spin, Table, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import dayjs, { type Dayjs } from "dayjs";
import { Page } from "@rbp/core";
import { TrainingStatusTag } from "../../components/trainingStatusTag";
import { useUserMap } from "@rbp/core";
import { useFitAccess, useFitContext, useFitRefresh, useFitReviews } from "../../hooks/useFitReviews";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { useTrainingStatus, useTrainingTypes } from "../../hooks/useTrainings";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import type { FitRating, FitReview } from "../../lib/positions";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";

// One line to rate: a requirement of the combined list.
type Row = { key: string; phraseId: string; text: string; from: string[] };

const FindingTag = ({ rating }: { rating?: FitRating }) => {
  const { t } = useTranslation();
  return rating ? <Tag color={rating === "deviation" ? "red" : "green"} style={{ margin: 0 }}>{t(`fit.rating.${rating}`)}</Tag> : <>—</>;
};

// The review of one person against all positions they hold: the requirements are combined, every line is rated by hand,
// the findings of the previous review stand beside them, the next review date defaults to one year.
export const FitReviewPage = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const correcting = params.get("review");
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const refresh = useFitRefresh();
  const access = useFitAccess();
  const users = useUserMap();
  const { data: people } = usePeople();
  const { data: ctx, isLoading } = useFitContext(id);
  const { data: reviews } = useFitReviews(id);
  const { data: trainingStatus } = useTrainingStatus();
  const { data: trainingTypes } = useTrainingTypes();
  const person = (people ?? []).find((p) => p.id === id);
  const editing = correcting ? (reviews ?? []).find((r) => r.id === correcting) : undefined;
  // The previous finding per requirement: from the latest review other than the one being corrected.
  const previous: FitReview | undefined = (reviews ?? []).find((r) => r.id !== correcting);

  const [rating, setRating] = useState<Record<string, FitRating | undefined>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [measure, setMeasure] = useState("");
  const [measureDue, setMeasureDue] = useState<Dayjs | null>(null);
  const [measureStatus, setMeasureStatus] = useState<"open" | "done">("open");
  const [reviewedOn, setReviewedOn] = useState<Dayjs>(dayjs());
  const [nextOn, setNextOn] = useState<Dayjs>(dayjs().add(1, "year"));
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);

  const positionName = (pid: string) => ctx?.positions.find((p) => p.position_id === pid)?.name ?? editing?.positions.find((p) => p.position_id === pid)?.name ?? "—";
  const rows: Row[] = useMemo(() => {
    if (editing) {
      return editing.items.map((i): Row => ({ key: i.phrase_id, phraseId: i.phrase_id, text: i.text, from: [] }));
    }
    if (!ctx) return [];
    return ctx.requirements.map((r): Row => ({ key: r.phrase_id, phraseId: r.phrase_id, text: r.text, from: r.position_ids }));
  }, [ctx, editing]);

  // Fill the form once (new review: defaults; correction: the stored review).
  useEffect(() => {
    const marker = editing ? `edit:${editing.id}` : ctx ? "new" : null;
    if (!marker || loaded === marker) return;
    setLoaded(marker);
    if (editing) {
      setRating(Object.fromEntries(editing.items.map((i) => [i.phrase_id, i.rating])));
      setComment(Object.fromEntries(editing.items.map((i) => [i.phrase_id, i.comment ?? ""])));
      setNote(editing.note ?? "");
      setMeasure(editing.measure ?? "");
      setMeasureDue(editing.measure_due_on ? dayjs(editing.measure_due_on) : null);
      setMeasureStatus(editing.measure_status ?? "open");
      setReviewedOn(dayjs(editing.reviewed_on));
      setNextOn(dayjs(editing.next_review_on));
    }
  }, [ctx, editing, loaded]);

  const prevByKey = new Map((previous?.items ?? []).map((i) => [i.phrase_id, i]));
  const unrated = rows.filter((r) => !rating[r.key]).length;
  const hasDeviation = rows.some((r) => rating[r.key] === "deviation");
  const myTraining = (trainingStatus ?? []).filter((s) => s.user_id === id && s.required);
  const typeName = (tid: string) => (trainingTypes ?? []).find((x) => x.id === tid)?.name ?? "—";

  if (isLoading || !people) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
  if (!person || !id) return <Empty description={t("common.notFound")} />;

  const save = async () => {
    setSaving(true);
    const { error } = await supabaseClient.rpc("position_fit_review_save", {
      p_review: editing?.id ?? null,
      p_user: id,
      p_reviewed_on: reviewedOn.format("YYYY-MM-DD"),
      p_next_review_on: nextOn.format("YYYY-MM-DD"),
      p_note: note,
      p_measure: measure,
      p_measure_due_on: measureDue ? measureDue.format("YYYY-MM-DD") : null,
      p_measure_status: measure.trim() ? measureStatus : null,
      p_items: rows.map((r) => ({ phrase_id: r.phraseId, rating: rating[r.key], comment: comment[r.key] ?? "" })),
    });
    setSaving(false);
    if (error) {
      message.error(errorText(error));
      return;
    }
    refresh();
    message.success(t("fit.saved"));
    void navigate(`/people/${id}`);
  };

  const noReview = rows.length === 0;
  return (
    <Page
      title={<span>{t(editing ? "fit.correctTitle" : "fit.title")}: {personName(person)}</span>}
      subtitle={<Link to={`/people/${id}`}>{t("fit.backToPerson")}</Link>}
      hint={t("fit.hint")}
    >
      {!access.canEdit && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t("fit.noRight")} />}
      {(ctx?.without_description ?? []).length > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t("fit.withoutDescription", { names: ctx!.without_description.join(", ") })} />
      )}

      <Card size="small" title={t("fit.positionsChecked")} style={{ marginBottom: 16 }}>
        <Space wrap>
          {(editing?.positions ?? ctx?.positions ?? []).map((p) => (
            <Link key={p.position_id} to={`/positions/${p.position_id}/print?version=${p.version_id}`} target="_blank">
              <Tag color="blue" style={{ cursor: "pointer" }}>{p.name} · {t("positions.versionNo", { no: p.version_no })}</Tag>
            </Link>
          ))}
          {(editing?.positions ?? ctx?.positions ?? []).length === 0 && <Typography.Text type="secondary">{t("fit.noPositions")}</Typography.Text>}
        </Space>
      </Card>

      {previous && (
        <Card size="small" title={t("fit.previous", { date: formatDate(previous.reviewed_on) })} style={{ marginBottom: 16 }}>
          <Space direction="vertical" size={4}>
            <span><FindingTag rating={previous.result} /> {users.get(previous.created_by_user_id ?? "")?.name ?? ""}</span>
            {previous.note && <Typography.Text>{previous.note}</Typography.Text>}
            {previous.measure && (
              <Typography.Text>
                {t("fit.measure")}: {previous.measure}
                {previous.measure_due_on ? ` (${formatDate(previous.measure_due_on)})` : ""}
                {previous.measure_status ? ` · ${t(`fit.measureStatus.${previous.measure_status}`)}` : ""}
              </Typography.Text>
            )}
          </Space>
        </Card>
      )}

      {noReview ? (
        <Empty description={t("fit.nothingToReview")} />
      ) : (
        <>
          <Table<Row>
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={rows}
            scroll={{ x: "max-content" }}
            style={{ marginBottom: 8 }}
            columns={[
              {
                title: t("fit.requirement"),
                render: (_: unknown, r: Row) => (
                  <div style={{ maxWidth: 420 }}>
                    {r.text}
                    {r.from.length > 0 && (editing?.positions ?? ctx?.positions ?? []).length > 1 && <div style={{ fontSize: 12, opacity: 0.65 }}>{r.from.map(positionName).join(", ")}</div>}
                  </div>
                ),
              },
              {
                title: t("fit.previousFinding"),
                render: (_: unknown, r: Row) => {
                  const p = prevByKey.get(r.key);
                  return p ? <div style={{ maxWidth: 220 }}><FindingTag rating={p.rating} />{p.comment && <div style={{ fontSize: 12 }}>{p.comment}</div>}</div> : <span style={{ opacity: 0.5 }}>{previous ? t("fit.newRequirement") : "—"}</span>;
                },
              },
              {
                title: t("fit.rating.title"),
                render: (_: unknown, r: Row) => (
                  <Radio.Group value={rating[r.key]} onChange={(e) => setRating((x) => ({ ...x, [r.key]: e.target.value as FitRating }))} optionType="button" buttonStyle="solid" size="small">
                    <Radio.Button value="fulfilled">{t("fit.rating.fulfilled")}</Radio.Button>
                    <Radio.Button value="deviation">{t("fit.rating.deviation")}</Radio.Button>
                  </Radio.Group>
                ),
              },
              {
                title: t("fit.comment"),
                render: (_: unknown, r: Row) => (
                  <Input.TextArea autoSize={{ minRows: 1, maxRows: 5 }} maxLength={2000} style={{ minWidth: 240 }} value={comment[r.key] ?? ""} onChange={(e) => setComment((x) => ({ ...x, [r.key]: e.target.value }))} />
                ),
              },
            ]}
          />
          <Button size="small" onClick={() => setRating((x) => ({ ...Object.fromEntries(rows.map((r) => [r.key, "fulfilled" as FitRating])), ...Object.fromEntries(Object.entries(x).filter(([, v]) => !!v)) }))}>{t("fit.allFulfilled")}</Button>

          <Card size="small" title={t("fit.result")} style={{ marginTop: 16, marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <div>
                <Typography.Text type="secondary">{t("fit.overall")}: </Typography.Text>
                {unrated > 0 ? <Tag>{t("fit.unrated", { count: unrated })}</Tag> : <FindingTag rating={hasDeviation ? "deviation" : "fulfilled"} />}
              </div>
              <div>
                <div style={{ marginBottom: 4 }}>{t("fit.note")}</div>
                <Input.TextArea rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div>
                <div style={{ marginBottom: 4 }}>{t("fit.measure")}{hasDeviation ? "" : ` (${t("fit.optional")})`}</div>
                <Input.TextArea rows={2} maxLength={4000} value={measure} onChange={(e) => setMeasure(e.target.value)} placeholder={t("fit.measurePlaceholder")} />
                {measure.trim() && (
                  <Space wrap style={{ marginTop: 8 }}>
                    <DatePicker value={measureDue} onChange={setMeasureDue} placeholder={t("fit.measureDue")} />
                    <Select value={measureStatus} onChange={setMeasureStatus} style={{ width: 160 }} options={[{ value: "open", label: t("fit.measureStatus.open") }, { value: "done", label: t("fit.measureStatus.done") }]} />
                  </Space>
                )}
              </div>
              <Space wrap size={24} align="end">
                <div>
                  <div style={{ marginBottom: 4 }}>{t("fit.reviewedOn")}</div>
                  <DatePicker allowClear={false} value={reviewedOn} onChange={(d) => d && setReviewedOn(d)} disabledDate={(d) => d.isAfter(dayjs(), "day")} />
                </div>
                <div>
                  <div style={{ marginBottom: 4 }}>{t("fit.nextReview")}</div>
                  <Space.Compact>
                    <DatePicker allowClear={false} value={nextOn} onChange={(d) => d && setNextOn(d)} />
                    <Button onClick={() => setNextOn(reviewedOn.add(6, "month"))}>{t("fit.months", { count: 6 })}</Button>
                    <Button onClick={() => setNextOn(reviewedOn.add(1, "year"))}>{t("fit.months", { count: 12 })}</Button>
                    <Button onClick={() => setNextOn(reviewedOn.add(2, "year"))}>{t("fit.months", { count: 24 })}</Button>
                  </Space.Compact>
                </div>
              </Space>
            </Space>
          </Card>
        </>
      )}

      {myTraining.length > 0 && (
        <Card size="small" title={t("fit.trainingContext")} style={{ marginBottom: 16 }}>
          <Space wrap>
            {myTraining.map((s) => <span key={s.training_type_id}>{typeName(s.training_type_id)} <TrainingStatusTag status={s.status} /></span>)}
          </Space>
        </Card>
      )}

      <Space>
        <Button type="primary" disabled={noReview || unrated > 0 || !access.canEdit || nextOn.isBefore(reviewedOn, "day")} loading={saving} onClick={() => void save()}>{t("common.save")}</Button>
        <Button onClick={() => navigate(`/people/${id}`)}>{t("common.cancel")}</Button>
      </Space>
    </Page>
  );
};
