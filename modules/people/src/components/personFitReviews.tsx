// Ported 1:1 from COMPASS (app/src/components/personFitReviews.tsx).
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, List, Modal, Space, Table, Tag, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useUserMap } from "@rbp/core";
import { useFitAccess, useFitReviews, useFitStatus } from "../hooks/useFitReviews";
import { usePositionHolders } from "../hooks/usePositions";
import { FIT_STATUS_COLOR, type FitReview } from "../lib/positions";
import { formatDate } from "@rbp/ui";

export const FitResultTag = ({ result }: { result: "fulfilled" | "deviation" }) => {
  const { t } = useTranslation();
  return <Tag color={result === "deviation" ? "red" : "green"} style={{ margin: 0 }}>{t(`fit.rating.${result}`)}</Tag>;
};

// The items of one review as a read-only table.
const FitReviewItems = ({ review }: { review: FitReview }) => {
  const { t } = useTranslation();
  const rows = review.items;
  return (
    <Table
      size="small"
      pagination={false}
      rowKey="id"
      dataSource={rows}
      columns={[
        { title: t("fit.requirement"), dataIndex: "text" },
        { title: t("fit.rating.title"), render: (_: unknown, i) => <FitResultTag result={i.rating} /> },
        { title: t("fit.comment"), dataIndex: "comment" },
      ]}
    />
  );
};

// Suitability reviews on the person page: status of the next review, button to start one, history with the findings.
// Only people who may see reviews get the card; it stays empty for people without a position and without a review.
export const PersonFitReviews = ({ personId }: { personId: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const access = useFitAccess();
  const users = useUserMap();
  const { data: reviews } = useFitReviews(personId, access.canView);
  const { data: status } = useFitStatus(access.canView);
  const { data: holders } = usePositionHolders();
  const [open, setOpen] = useState<FitReview | null>(null);
  if (!access.canView) return null;
  const holds = (holders ?? []).some((h) => h.user_id === personId);
  const mine = (status ?? []).find((s) => s.user_id === personId);
  if (!holds && !(reviews ?? []).length) return null;

  return (
    <Card
      size="small"
      title={t("fit.cardTitle")}
      style={{ marginBottom: 16 }}
      extra={
        <Space>
          {(reviews ?? []).length > 0 && <Button size="small" icon={<PrinterOutlined />} onClick={() => navigate(`/people/${personId}/fit-review/print`)}>{t("common.print")}</Button>}
          {access.canEdit && holds && <Button size="small" type="primary" onClick={() => navigate(`/people/${personId}/fit-review`)}>{t("fit.start")}</Button>}
        </Space>
      }
    >
      {mine && (
        <Space wrap style={{ marginBottom: 8 }}>
          <Tag color={FIT_STATUS_COLOR[mine.status]}>{t(`fit.status.${mine.status}`)}</Tag>
          {mine.next_review_on && <Typography.Text type="secondary">{t("fit.nextReview")}: {formatDate(mine.next_review_on)}</Typography.Text>}
          {mine.deviation_open && <Tag color="red">{t("fit.deviationOpen")}</Tag>}
        </Space>
      )}
      <List
        size="small"
        locale={{ emptyText: t("fit.noReviews") }}
        dataSource={reviews ?? []}
        renderItem={(r) => (
          <List.Item
            actions={[
              <Button key="open" size="small" type="link" onClick={() => setOpen(r)}>{t("fit.details")}</Button>,
              ...(access.canEdit ? [<Link key="edit" to={`/people/${personId}/fit-review?review=${r.id}`}>{t("fit.correct")}</Link>] : []),
            ]}
          >
            <Space wrap size={12}>
              <span style={{ width: 90, display: "inline-block" }}>{formatDate(r.reviewed_on)}</span>
              <FitResultTag result={r.result} />
              <span>{users.get(r.created_by_user_id ?? "")?.name ?? ""}</span>
              {r.measure && <Typography.Text type="secondary">{t("fit.measure")}: {r.measure}{r.measure_status ? ` (${t(`fit.measureStatus.${r.measure_status}`)})` : ""}</Typography.Text>}
            </Space>
          </List.Item>
        )}
      />
      <Modal open={!!open} onCancel={() => setOpen(null)} footer={null} width={760} title={open ? `${t("fit.cardTitle")} ${formatDate(open.reviewed_on)}` : ""}>
        {open && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Space wrap>{open.positions.map((p) => <Tag key={p.position_id}>{p.name} · {t("positions.versionNo", { no: p.version_no })}</Tag>)}</Space>
            {open.note && <Typography.Paragraph>{open.note}</Typography.Paragraph>}
            <FitReviewItems review={open} />
          </Space>
        )}
      </Modal>
    </Card>
  );
};
