// Ported 1:1 from COMPASS (app/src/components/taskGantt.tsx).
import { moveDueDate } from "../lib/reschedule";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, App as AntdApp, Button, Input, Modal, Select, Space, Typography, theme as antdTheme } from "antd";
import { CaretDownOutlined, CaretRightOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import dayjs, { type Dayjs } from "dayjs";
import { supabaseClient } from "@rbp/core";
import type { TaskTreeRow } from "../lib/domain";
import { conflictText } from "../lib/taskDates";
import { DateConflictTag } from "./dateConflicts";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";

// Gantt chart of an initiative: one row per task below it, a bar from the planned date to the due date. Rows with
// subtasks fold in and out; the thin bracket under such a row spans everything below it. A bar is moved by dragging
// it, its left edge changes the planned date, its right edge the due date. The planned date goes through
// task_plan(), the due date through an update that asks for a reason (like on the task page, for the punctuality
// statistics). A task with only one of the two dates is drawn as a single marker.

const MONTH_CHOICES = [1, 3, 6, 12] as const;
const MONTHS_STORAGE = "compass.gantt.months";
const PX_PER_DAY: Record<number, number> = { 1: 32, 3: 12, 6: 6, 12: 3 };
const LABEL_WIDTH = 300;
const LABEL_WIDTH_PHONE = 128;
const ROW_HEIGHT = 32;
const BAR_HEIGHT = 18;
const HEADER_HEIGHT = 52;
const DATE_FORMAT = "YYYY-MM-DD";

type Drag = { id: string; mode: "move" | "start" | "end"; originX: number; delta: number };
type Pending = { row: TaskTreeRow; planned: string | null; due: string | null };

const isClosed = (row: TaskTreeRow) => row.status === "done" || row.status === "cancelled";
const days = (a: string, b: string) => dayjs(b).diff(dayjs(a), "day");
const shift = (date: string, by: number) => dayjs(date).add(by, "day").format(DATE_FORMAT);

// First and last day a row occupies; null without any date.
const spanOf = (row: TaskTreeRow): [string, string] | null => {
  const a = row.planned_date ?? row.due_date;
  const b = row.due_date ?? row.planned_date;
  if (!a || !b) return null;
  return a <= b ? [a, b] : [b, a];
};

export const TaskGantt = ({ rows }: { rows: TaskTreeRow[] }) => {
  const { t, i18n } = useTranslation();
  // Phone: read-only (a finger cannot hit the 6 px edges, and dragging fights with scrolling) with a narrow label column.
  const readOnly = useIsMobile();
  const labelWidth = readOnly ? LABEL_WIDTH_PHONE : LABEL_WIDTH;
  const { token } = antdTheme.useToken();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const rootId = rows[0]?.id;
  const tasks = useMemo(() => rows.slice(1), [rows]);

  const [months, setMonths] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(MONTHS_STORAGE));
      return (MONTH_CHOICES as readonly number[]).includes(stored) ? stored : 6;
    } catch {
      return 6;
    }
  });
  const [rangeStart, setRangeStart] = useState<Dayjs>(() => dayjs().startOf("month"));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  // Phone: a tap on a bar shows its dates (the title tooltip does not exist on touch).
  const [peekId, setPeekId] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const px = PX_PER_DAY[months] ?? 6;
  const rangeEnd = rangeStart.add(months, "month");
  const totalDays = rangeEnd.diff(rangeStart, "day");
  const chartWidth = totalDays * px;
  const startKey = rangeStart.format(DATE_FORMAT);
  const xOf = (date: string) => days(startKey, date) * px;

  const changeMonths = (value: number) => {
    setMonths(value);
    try {
      localStorage.setItem(MONTHS_STORAGE, String(value));
    } catch {
      /* not remembered */
    }
  };

  // Structure: which rows have children, which are hidden by a folded ancestor, the span of everything below a row.
  const { parentsWithChildren, visible, rollup } = useMemo(() => {
    const withChildren = new Set<string>();
    for (const r of tasks) if (r.parent_task_id) withChildren.add(r.parent_task_id);
    const hidden = new Map<string, boolean>();
    const shown: TaskTreeRow[] = [];
    for (const r of tasks) {
      const parentHidden = r.parent_task_id ? (hidden.get(r.parent_task_id) ?? false) || collapsed.has(r.parent_task_id) : false;
      hidden.set(r.id, parentHidden);
      if (!parentHidden) shown.push(r);
    }
    const below = new Map<string, [string, string]>();
    for (const r of [...tasks].reverse()) {
      if (!r.parent_task_id) continue;
      const own = spanOf(r);
      const sub = below.get(r.id);
      const candidates = [own, sub].filter((x): x is [string, string] => !!x);
      if (candidates.length === 0) continue;
      const lo = candidates.map((c) => c[0]).sort()[0];
      const hi = candidates.map((c) => c[1]).sort().at(-1)!;
      const current = below.get(r.parent_task_id);
      below.set(r.parent_task_id, current ? [current[0] < lo ? current[0] : lo, current[1] > hi ? current[1] : hi] : [lo, hi]);
    }
    return { parentsWithChildren: withChildren, visible: shown, rollup: below };
  }, [tasks, collapsed]);

  // Month and week scale.
  const monthCells = useMemo(() => {
    const cells: { key: string; left: number; width: number; label: string }[] = [];
    const formatter = new Intl.DateTimeFormat(i18n.language, { month: "short", year: "numeric" });
    for (let m = rangeStart; m.isBefore(rangeEnd); m = m.add(1, "month")) {
      const from = m.diff(rangeStart, "day");
      const to = Math.min(m.add(1, "month").diff(rangeStart, "day"), totalDays);
      cells.push({ key: m.format("YYYY-MM"), left: from * px, width: (to - from) * px, label: formatter.format(m.toDate()) });
    }
    return cells;
  }, [rangeStart, rangeEnd, totalDays, px, i18n.language]);
  const weekCells = useMemo(() => {
    if (months > 3) return [];
    const cells: { key: string; left: number; label: string }[] = [];
    let d = rangeStart.day(1);
    if (d.isBefore(rangeStart)) d = d.add(7, "day");
    for (; d.isBefore(rangeEnd); d = d.add(7, "day")) cells.push({ key: d.format(DATE_FORMAT), left: d.diff(rangeStart, "day") * px, label: String(d.date()) });
    return cells;
  }, [months, rangeStart, rangeEnd, px]);

  const today = dayjs().format(DATE_FORMAT);
  const todayLeft = today >= startKey && today < rangeEnd.format(DATE_FORMAT) ? xOf(today) + px / 2 : null;

  // ---- dragging -----------------------------------------------------------------------------------------------

  const begin = (e: ReactPointerEvent, row: TaskTreeRow, mode: Drag["mode"]) => {
    if (readOnly || isClosed(row) || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const next = { id: row.id, mode, originX: e.clientX, delta: 0 };
    dragRef.current = next;
    setDrag(next);
  };
  const move = (e: ReactPointerEvent) => {
    const current = dragRef.current;
    if (!current) return;
    const delta = Math.round((e.clientX - current.originX) / px);
    if (delta === current.delta) return;
    const next = { ...current, delta };
    dragRef.current = next;
    setDrag(next);
  };
  const finish = (e: ReactPointerEvent, row: TaskTreeRow) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!current || current.delta === 0) return;
    const { planned, due } = datesAfter(row, current);
    if (planned === row.planned_date && due === row.due_date) return;
    if (due !== row.due_date) {
      setPending({ row, planned, due });
      setReason("");
    } else void apply(row, planned, due);
  };

  // New planned / due date of a row for a drag; a date the task does not have stays empty.
  const datesAfter = (row: TaskTreeRow, d: Pick<Drag, "mode" | "delta">) => {
    let planned = row.planned_date;
    let due = row.due_date;
    if (d.mode === "move" || !(planned && due)) {
      if (planned) planned = shift(planned, d.delta);
      if (due) due = shift(due, d.delta);
    } else if (d.mode === "start") {
      planned = shift(planned!, d.delta);
      if (planned > due!) planned = due;
    } else {
      due = shift(due!, d.delta);
      if (due < planned!) due = planned;
    }
    return { planned, due };
  };

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["task-tree"] }),
      queryClient.invalidateQueries({ queryKey: ["initiative-board", rootId] }),
      queryClient.invalidateQueries({ queryKey: ["task"] }),
      queryClient.invalidateQueries({ queryKey: ["task-original-due"] }),
      queryClient.invalidateQueries({ queryKey: ["punctuality"] }),
    ]);

  const apply = async (row: TaskTreeRow, planned: string | null, due: string | null, why?: string) => {
    queryClient.setQueryData<TaskTreeRow[]>(["task-tree", rootId], (old) =>
      (old ?? []).map((x) => (x.id === row.id ? { ...x, planned_date: planned, due_date: due } : x)),
    );
    try {
      if (planned !== row.planned_date) {
        const { error } = await supabaseClient.rpc("task_plan", {
          p_task_id: row.id,
          p_team_id: row.team_id,
          p_assigned_user_id: row.assigned_user_id,
          p_planned_date: planned,
          p_sort_order: null,
        });
        if (error) throw error;
      }
      if (due !== row.due_date) {
        if (why) {
          const failure = await moveDueDate(row.id, row.due_date, due, why, (v) => t("punctuality.rescheduleComment", v));
          if (failure) throw new Error(failure.message === "not allowed" ? t("gantt.notAllowed") : failure.message);
          void queryClient.invalidateQueries({ queryKey: ["feed", "tasks", row.id] });
        } else {
          const { data, error } = await supabaseClient.from("tasks").update({ due_date: due }).eq("id", row.id).select("id");
          if (error) throw error;
          if (!data?.length) throw new Error(t("gantt.notAllowed"));
        }
      }
    } catch (error) {
      message.error(errorText(error));
    }
    await refresh();
  };

  const { data: originalDue } = useQuery({
    queryKey: ["task-original-due", pending?.row.id],
    enabled: !!pending,
    queryFn: async () => ((await supabaseClient.from("tasks").select("original_due_date").eq("id", pending!.row.id).maybeSingle()).data?.original_due_date ?? null) as string | null,
  });

  const confirmReason = () => {
    const p = pending!;
    const why = reason.trim();
    setPending(null);
    setReason("");
    void apply(p.row, p.planned, p.due, why);
  };

  // ---- rendering ----------------------------------------------------------------------------------------------

  const step = Math.max(1, Math.floor(months / 2));
  const barColor = (row: TaskTreeRow) =>
    row.status === "cancelled" ? token.colorTextQuaternary : row.status === "done" ? token.colorSuccess : row.is_overdue ? token.colorError : token.colorPrimary;

  const renderBar = (row: TaskTreeRow) => {
    const span = spanOf(row);
    if (!span) return null;
    let [from, to] = span;
    const active = drag?.id === row.id ? drag : null;
    if (active) {
      const next = datesAfter(row, active);
      const a = next.planned ?? next.due!;
      const b = next.due ?? next.planned!;
      [from, to] = a <= b ? [a, b] : [b, a];
    }
    const single = !(row.planned_date && row.due_date);
    const left = xOf(from);
    const width = single ? px : Math.max((days(from, to) + 1) * px, px);
    if (left + width < 0 || left > chartWidth) return null;
    const closed = isClosed(row);
    const color = barColor(row);
    const title = `#${row.task_number} ${row.title}\n${single ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`}${row.date_conflict ? `\n${conflictText(t, row)}` : ""}`;
    const peeking = readOnly && peekId === row.id && !active;
    const caption = peeking && (
      <span style={{ position: "absolute", left: single ? left + px + 6 : left + width + 6, top: 0, lineHeight: `${ROW_HEIGHT}px`, fontSize: 12, whiteSpace: "nowrap", color: token.colorText, background: token.colorBgContainer, pointerEvents: "none", zIndex: 1 }}>
        {single ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`}
        {row.date_conflict ? ` · ${conflictText(t, row)}` : ""}
      </span>
    );
    const common = {
      onPointerMove: move,
      onPointerUp: (e: ReactPointerEvent) => finish(e, row),
      onPointerCancel: (e: ReactPointerEvent) => finish(e, row),
    };
    if (single) {
      const size = BAR_HEIGHT - 2;
      return (
        <>
        {caption}
        <div
          title={title}
          onClick={() => readOnly && setPeekId(peeking ? null : row.id)}
          onPointerDown={(e) => begin(e, row, "move")}
          {...common}
          style={{ position: "absolute", left: left + px / 2 - size / 2, top: (ROW_HEIGHT - size) / 2, width: size, height: size, background: color, transform: "rotate(45deg) scale(.8)", borderRadius: 2, cursor: closed || readOnly ? "default" : "grab", touchAction: readOnly ? undefined : "none" }}
        />
        </>
      );
    }
    return (
      <>
      {caption}
      <div
        title={title}
        onClick={() => readOnly && setPeekId(peeking ? null : row.id)}
        onPointerDown={(e) => begin(e, row, "move")}
        {...common}
        style={{ position: "absolute", left, width, top: (ROW_HEIGHT - BAR_HEIGHT) / 2, height: BAR_HEIGHT, background: color, borderRadius: 4, opacity: closed ? 0.55 : 1, cursor: closed || readOnly ? "default" : "grab", touchAction: readOnly ? undefined : "none", boxShadow: active ? token.boxShadowSecondary : row.date_conflict ? `0 0 0 2px ${token.colorWarning}` : undefined }}
      >
        {!closed && !readOnly && (
          <>
            <div onPointerDown={(e) => begin(e, row, "start")} {...common} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize" }} />
            <div onPointerDown={(e) => begin(e, row, "end")} {...common} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize" }} />
          </>
        )}
        {active && (
          <span style={{ position: "absolute", left: width + 6, top: 0, lineHeight: `${BAR_HEIGHT}px`, fontSize: 12, whiteSpace: "nowrap", color: token.colorText }}>
            {formatDate(from)} – {formatDate(to)}
          </span>
        )}
      </div>
      </>
    );
  };

  // Conflict: a dashed line on the day the parent is due, so the overhang of the bar (or today, for an overdue one) shows.
  const renderParentLimit = (row: TaskTreeRow) => {
    if (!row.date_conflict || !row.parent_due_date) return null;
    const left = xOf(row.parent_due_date) + px;
    if (left < 0 || left > chartWidth) return null;
    return <div title={conflictText(t, row)} style={{ position: "absolute", left, top: 0, bottom: 0, borderLeft: `2px dashed ${token.colorWarning}`, pointerEvents: "none" }} />;
  };

  const renderBracket = (row: TaskTreeRow) => {
    const span = rollup.get(row.id);
    if (!span) return null;
    const left = xOf(span[0]);
    const width = Math.max((days(span[0], span[1]) + 1) * px, px);
    if (left + width < 0 || left > chartWidth) return null;
    const cap = { position: "absolute" as const, bottom: 0, width: 2, height: 7, background: token.colorTextSecondary };
    return (
      <div title={`${formatDate(span[0])} – ${formatDate(span[1])}`} style={{ position: "absolute", left, width, bottom: 4, height: 7, pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: token.colorTextSecondary }} />
        <div style={{ ...cap, left: 0, top: 0 }} />
        <div style={{ ...cap, right: 0, top: 0 }} />
      </div>
    );
  };

  if (!rootId) return null;
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const undated = tasks.filter((x) => !x.planned_date && !x.due_date).length;
  const lineColor = token.colorBorderSecondary;

  return (
    <div style={{ marginTop: 16 }}>
      <Space size={8} wrap style={{ marginBottom: 8 }}>
        <Button size="small" icon={<LeftOutlined />} onClick={() => setRangeStart(rangeStart.subtract(step, "month"))} />
        <Button size="small" onClick={() => setRangeStart(dayjs().startOf("month"))}>{t("gantt.today")}</Button>
        <Button size="small" icon={<RightOutlined />} onClick={() => setRangeStart(rangeStart.add(step, "month"))} />
        <Select
          size="small"
          value={months}
          onChange={changeMonths}
          style={{ width: 130 }}
          options={MONTH_CHOICES.map((m) => ({ value: m, label: t("gantt.months", { count: m }) }))}
        />
        {parentsWithChildren.size > 0 && (
          <>
            <Button type="link" size="small" onClick={() => setCollapsed(new Set())}>{t("tasks.expandAll")}</Button>
            <Button type="link" size="small" onClick={() => setCollapsed(new Set(parentsWithChildren))}>{t("tasks.collapseAll")}</Button>
          </>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t(readOnly ? "gantt.hintPhone" : "gantt.hint")}</Typography.Text>
        {undated > 0 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("gantt.undated", { count: undated })}</Typography.Text>}
      </Space>

      <div style={{ overflow: "auto", maxHeight: "70vh", border: `1px solid ${lineColor}`, borderRadius: token.borderRadius, background: token.colorBgContainer }}>
        <div style={{ width: labelWidth + chartWidth, position: "relative" }}>
          {/* header: months, weeks */}
          <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 3, height: HEADER_HEIGHT, background: token.colorBgContainer, borderBottom: `1px solid ${lineColor}` }}>
            <div style={{ position: "sticky", left: 0, zIndex: 4, width: labelWidth, flex: "none", background: token.colorBgContainer, borderRight: `1px solid ${lineColor}`, padding: "0 12px", display: "flex", alignItems: "center" }}>
              <Typography.Text strong>{t("tasks.subtasks")}</Typography.Text>
            </div>
            <div style={{ position: "relative", width: chartWidth, flex: "none" }}>
              {monthCells.map((c) => (
                <div key={c.key} style={{ position: "absolute", left: c.left, width: c.width, top: 0, height: weekCells.length ? 26 : HEADER_HEIGHT, borderLeft: `1px solid ${lineColor}`, padding: "4px 6px", fontSize: 12, fontWeight: 500, overflow: "hidden", whiteSpace: "nowrap" }}>
                  {c.label}
                </div>
              ))}
              {weekCells.map((c) => (
                <div key={c.key} style={{ position: "absolute", left: c.left, top: 26, height: 26, borderLeft: `1px solid ${lineColor}`, paddingLeft: 4, fontSize: 11, lineHeight: "26px", color: token.colorTextSecondary }}>
                  {c.label}
                </div>
              ))}
            </div>
          </div>

          {/* body */}
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: labelWidth, top: 0, bottom: 0, width: chartWidth, pointerEvents: "none" }}>
              {monthCells.map((c) => (
                <div key={c.key} style={{ position: "absolute", left: c.left, top: 0, bottom: 0, borderLeft: `1px solid ${lineColor}` }} />
              ))}
              {todayLeft != null && <div style={{ position: "absolute", left: todayLeft, top: 0, bottom: 0, borderLeft: `2px solid ${token.colorError}`, opacity: 0.6 }} />}
            </div>
            {visible.map((row) => {
              const depth = row.depth - 1;
              const hasChildren = parentsWithChildren.has(row.id);
              const open = !collapsed.has(row.id);
              return (
                <div key={row.id} style={{ display: "flex", height: ROW_HEIGHT, borderBottom: `1px solid ${lineColor}` }}>
                  <div style={{ position: "sticky", left: 0, zIndex: 2, width: labelWidth, flex: "none", background: token.colorBgContainer, borderRight: `1px solid ${lineColor}`, display: "flex", alignItems: "center", paddingRight: 8, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignSelf: "stretch", paddingLeft: 8 }}>
                      {Array.from({ length: depth }, (_, i) => (
                        <div key={i} style={{ width: readOnly ? 8 : 16, borderLeft: `1px solid ${token.colorBorder}` }} />
                      ))}
                    </div>
                    {hasChildren ? (
                      <Button type="text" size="small" style={{ width: 22, minWidth: 22, padding: 0 }} icon={open ? <CaretDownOutlined /> : <CaretRightOutlined />} onClick={() => toggle(row.id)} />
                    ) : (
                      <span style={{ width: 22, flex: "none" }} />
                    )}
                    <Link to={`/tasks/${row.id}`} title={row.title} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: hasChildren ? 600 : undefined, textDecoration: row.status === "cancelled" ? "line-through" : undefined }}>
                      #{row.task_number} {row.title}
                    </Link>
                    <DateConflictTag row={row} />
                  </div>
                  <div style={{ position: "relative", width: chartWidth, flex: "none" }}>
                    {renderParentLimit(row)}
                    {renderBracket(row)}
                    {renderBar(row)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Modal
        open={!!pending}
        title={t("punctuality.rescheduleTitle")}
        okText={t("common.save")}
        okButtonProps={{ disabled: !reason.trim() }}
        onOk={confirmReason}
        onCancel={() => { setPending(null); setReason(""); }}
        destroyOnClose
      >
        {pending && (
          <>
            <Typography.Paragraph>
              #{pending.row.task_number} {pending.row.title}: {formatDate(pending.row.due_date)} → {formatDate(pending.due)}
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              {t("punctuality.rescheduleHint", { date: formatDate(originalDue ?? pending.row.due_date) })}
            </Typography.Paragraph>
            {pending.due && pending.row.parent_due_date && pending.due > pending.row.parent_due_date && (
              <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t("dateConflicts.dragWarning", { date: formatDate(pending.due), parent: formatDate(pending.row.parent_due_date) })} />
            )}
            <Input.TextArea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("punctuality.rescheduleReason")} />
          </>
        )}
      </Modal>
    </div>
  );
};
