// Ported 1:1 from COMPASS (app/src/pages/planning/boardParts.tsx).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Badge, Button, Card, DatePicker, Modal, Select, Space, Tag, Typography, theme as antdTheme } from "antd";
import { CaretLeftOutlined, CaretRightOutlined, DownOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SwapOutlined, TeamOutlined, UpOutlined, UserOutlined } from "@ant-design/icons";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import dayjs, { type Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";
import { type TaskOverviewRow } from "../../lib/domain";
import { ChecklistTag } from "../../components/checklist/checklistTag";
import { pickName } from "@rbp/module-tasks/src/lib/masterData.ts";

export const PRIORITY_BAR: Record<string, string> = { low: "#bfbfbf", normal: "#4096ff", high: "#fa8c16", urgent: "#f5222d" };
export const TEAM_ROW = "team";
export const BACKLOG = "backlog";
export const DATE = "YYYY-MM-DD";
export const TEAM_STORAGE = "compass.planning.team";
export const LABEL_WIDTH = 160;
export const DAY_WIDTH = 170;
export const INITIAL_WEEKS = 12;
export const GROW_WEEKS = 8;
export const MAX_WEEKS = 104;

export const monday = (d: Dayjs) => d.startOf("day").subtract((d.day() + 6) % 7, "day");
export const cellId = (row: string, date: string) => `${row}|${date}`;
export const bySort = (a: TaskOverviewRow, b: TaskOverviewRow) =>
  a.sort_order < b.sort_order ? -1 : a.sort_order > b.sort_order ? 1 : a.task_number - b.task_number;

export const TaskCard = ({ task, overlay = false, ghost = false, onMove }: { task: TaskOverviewRow; overlay?: boolean; ghost?: boolean; onMove?: (task: TaskOverviewRow) => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      data-task-id={task.id}
      {...(overlay || onMove ? {} : listeners)}
      {...(overlay || onMove ? {} : attributes)}
      onClick={() => !overlay && navigate(`/tasks/${task.id}`)}
      style={{
        opacity: isDragging && !overlay ? 0.35 : 1,
        background: token.colorBgContainer,
        border: `1px ${ghost ? "dashed" : "solid"} ${task.is_overdue ? token.colorError : ghost ? token.colorBorder : token.colorBorderSecondary}`,
        borderLeft: `4px solid ${PRIORITY_BAR[task.priority] ?? token.colorPrimary}`,
        borderRadius: token.borderRadius,
        padding: "6px 8px",
        marginBottom: 6,
        cursor: overlay ? "grabbing" : onMove ? "pointer" : "grab",
        boxShadow: overlay ? token.boxShadow : undefined,
        touchAction: onMove ? "auto" : "none",
        position: "relative",
        width: overlay ? 200 : undefined,
      }}
    >
      {onMove && (
        <Button
          type="text"
          size="small"
          icon={<SwapOutlined />}
          aria-label={t("planning.move")}
          title={t("planning.move")}
          onClick={(e) => { e.stopPropagation(); onMove(task); }}
          style={{ position: "absolute", top: 2, right: 2, width: 32, height: 32 }}
        />
      )}
      <Typography.Text style={{ fontSize: 12 }} type="secondary">#{task.task_number}</Typography.Text>
      {ghost && <Tag style={{ fontSize: 10, marginInlineStart: 6, marginInlineEnd: 0 }} color={task.is_overdue ? "error" : undefined}>{t("planning.dueGhost")}</Tag>}
      <div style={{ fontSize: 13, lineHeight: 1.25, wordBreak: "break-word", paddingRight: onMove ? 32 : undefined }}>{task.title}</div>
      {task.asset_name && <Typography.Text type="secondary" style={{ fontSize: 11 }}>{task.asset_name}</Typography.Text>}
      <ChecklistTag row={task} />
      {(task.items_waiting ?? 0) > 0 && (
        <div><Tag color="gold" style={{ fontSize: 10, marginTop: 2 }}>{t("items.waiting", { count: task.items_waiting })}</Tag></div>
      )}
      {task.status !== "open" && (
        <div><Tag style={{ fontSize: 10, marginTop: 2 }}>{pickName(task.current_step_name, task.current_step_name_de)}</Tag></div>
      )}
    </div>
  );
};

export const Cell = ({ id, tasks, today }: { id: string; tasks: TaskOverviewRow[]; today?: boolean }) => {
  const { token } = antdTheme.useToken();
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-cell={id}
      style={{
        minHeight: 72,
        padding: 6,
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: isOver ? token.colorPrimaryBg : today ? token.colorFillAlter : undefined,
      }}
    >
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} ghost={!t.planned_date} />
      ))}
    </div>
  );
};

export const RowFragment = ({
  row,
  days,
  today,
  cellTasks,
}: {
  row: { id: string; label: string; team: boolean };
  days: Dayjs[];
  today: string;
  cellTasks: (row: string, date: string) => TaskOverviewRow[];
}) => {
  const { token } = antdTheme.useToken();
  return (
    <>
      <div
        style={{
          padding: "8px",
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: row.team ? token.colorFillAlter : token.colorBgContainer,
          position: "sticky",
          left: 0,
          zIndex: 2,
        }}
      >
        <Avatar size="small" icon={row.team ? <TeamOutlined /> : <UserOutlined />} />
        <Typography.Text strong={row.team}>{row.label}</Typography.Text>
      </div>
      {days.map((d) => {
        const date = d.format(DATE);
        return <Cell key={date} id={cellId(row.id, date)} tasks={cellTasks(row.id, date)} today={date === today} />;
      })}
    </>
  );
};

export const BacklogPanel = ({ tasks, open, onToggle }: { tasks: TaskOverviewRow[]; open: boolean; onToggle: () => void }) => {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: BACKLOG });
  const { token } = antdTheme.useToken();
  return (
    <Card
      size="small"
      style={{ flex: open ? "0 0 240px" : "0 0 auto", width: open ? 240 : undefined }}
      title={
        <Space>
          {open && t("planning.backlog")}
          <Badge count={tasks.length} showZero color={token.colorPrimary} />
        </Space>
      }
      extra={<Button type="text" size="small" icon={open ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />} onClick={onToggle} title={open ? t("planning.hideBacklog") : t("planning.showBacklog")} />}
    >
      {/* Stays mounted when folded so it still accepts drops back into the backlog. */}
      <div ref={setNodeRef} data-cell={BACKLOG} style={{ minHeight: open ? 120 : 40, minWidth: open ? undefined : 56, background: isOver ? token.colorPrimaryBg : undefined, borderRadius: 4 }}>
        {open && tasks.length === 0 && <Typography.Text type="secondary">{t("planning.backlogEmpty")}</Typography.Text>}
        {open && tasks.map((x) => <TaskCard key={x.id} task={x} />)}
      </div>
    </Card>
  );
};

export type BoardRow = { id: string; label: string; team: boolean };

export const RowTitle = ({ row }: { row: BoardRow }) => (
  <Space size={8}>
    <Avatar size="small" icon={row.team ? <TeamOutlined /> : <UserOutlined />} />
    <Typography.Text strong>{row.label}</Typography.Text>
  </Space>
);

// Phone layout: a day strip on top, below it one sub-heading per row (team first, then members) with that row's cards.
export const MobileDayView = ({
  day,
  rows,
  cellTasks,
  backlog,
  backlogOpen,
  onToggleBacklog,
  onStep,
  onPick,
  onMove,
}: {
  day: Dayjs;
  rows: BoardRow[];
  cellTasks: (row: string, date: string) => TaskOverviewRow[];
  backlog: TaskOverviewRow[];
  backlogOpen: boolean;
  onToggleBacklog: () => void;
  onStep: (direction: -1 | 1) => void;
  onPick: (d: Dayjs) => void;
  onMove: (task: TaskOverviewRow) => void;
}) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const date = day.format(DATE);
  const isToday = date === dayjs().format(DATE);
  const heading = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", background: token.colorFillAlter, borderBottom: `1px solid ${token.colorBorderSecondary}` } as const;
  return (
    <div>
      <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", gap: 8, padding: "8px 0", background: token.colorBgLayout }}>
        <Button size="large" icon={<CaretLeftOutlined />} aria-label={t("planning.previousDay")} onClick={() => onStep(-1)} />
        <DatePicker
          size="large"
          allowClear={false}
          inputReadOnly
          value={day}
          format={(d) => `${d.format("dd DD.MM.YYYY")} · ${t("planning.weekShort")} ${d.isoWeek()}`}
          onChange={(d) => d && onPick(d)}
          style={{ flex: 1, minWidth: 0, fontWeight: isToday ? 600 : 400 }}
        />
        <Button size="large" type={isToday ? "primary" : "default"} onClick={() => onPick(dayjs())}>{t("planning.todayShort")}</Button>
        <Button size="large" icon={<CaretRightOutlined />} aria-label={t("planning.nextDay")} onClick={() => onStep(1)} />
      </div>

      <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, background: token.colorBgContainer, overflow: "hidden" }}>
        {rows.map((row) => {
          const cards = cellTasks(row.id, date);
          return (
            <div key={row.id}>
              <div style={heading}>
                <RowTitle row={row} />
                <Badge count={cards.length} showZero color={cards.length ? token.colorPrimary : token.colorTextQuaternary} />
              </div>
              {cards.length > 0 && (
                <div style={{ padding: "8px 8px 2px" }}>
                  {cards.map((x) => <TaskCard key={x.id} task={x} ghost={!x.planned_date} onMove={onMove} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, background: token.colorBgContainer, overflow: "hidden" }}>
        <div style={{ ...heading, cursor: "pointer", borderBottom: backlogOpen ? heading.borderBottom : "none" }} onClick={onToggleBacklog} role="button">
          <Space>
            <Typography.Text strong>{t("planning.backlog")}</Typography.Text>
            <Badge count={backlog.length} showZero color={token.colorPrimary} />
          </Space>
          {backlogOpen ? <UpOutlined /> : <DownOutlined />}
        </div>
        {backlogOpen && (
          <div style={{ padding: "8px 8px 2px" }}>
            {backlog.length === 0 && <Typography.Text type="secondary">{t("planning.backlogEmpty")}</Typography.Text>}
            {backlog.map((x) => <TaskCard key={x.id} task={x} onMove={onMove} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// Phone: move a card without dragging. No date puts it into the backlog.
export const MoveModal = ({
  task,
  rows,
  defaultRow,
  defaultDate,
  onClose,
  onSave,
}: {
  task: TaskOverviewRow | null;
  rows: BoardRow[];
  defaultRow: string;
  defaultDate: string | null;
  onClose: () => void;
  onSave: (row: string, date: string | null) => void;
}) => {
  const { t } = useTranslation();
  const [row, setRow] = useState(defaultRow);
  const [date, setDate] = useState<Dayjs | null>(null);
  useEffect(() => {
    if (!task) return;
    setRow(defaultRow);
    setDate(task.planned_date || defaultDate ? dayjs(task.planned_date ?? defaultDate) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);
  return (
    <Modal open={!!task} title={t("planning.moveTitle")} onCancel={onClose} onOk={() => onSave(row, date ? date.format(DATE) : null)} okText={t("common.save")} cancelText={t("common.cancel")} destroyOnClose>
      {task && <Typography.Paragraph type="secondary">#{task.task_number} {task.title}</Typography.Paragraph>}
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div>
          <div style={{ marginBottom: 4 }}>{t("planning.moveRow")}</div>
          <Select style={{ width: "100%" }} size="large" value={row} onChange={setRow} options={rows.map((r) => ({ value: r.id, label: r.label }))} />
        </div>
        <div>
          <div style={{ marginBottom: 4 }}>{t("planning.moveDate")}</div>
          <DatePicker style={{ width: "100%" }} size="large" value={date} onChange={setDate} allowClear inputReadOnly format="dd DD.MM.YYYY" />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("planning.moveDateHint")}</Typography.Text>
        </div>
      </Space>
    </Modal>
  );
};
