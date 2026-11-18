// Ported 1:1 from COMPASS (app/src/pages/planning/board.tsx).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { App as AntdApp, Button, Empty, Select, Space, Switch, theme as antdTheme } from "antd";
import { CaretLeftOutlined, CaretRightOutlined } from "@ant-design/icons";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { useTranslation } from "react-i18next";
import { List } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { FINAL_TASK_STATUSES, type TaskOverviewRow, userLabel } from "../../lib/domain";
import { useTeamMembers, useTeams, useUsers, usersFor } from "@rbp/core";
import { useMe } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { TEAM_ROW, BACKLOG, DATE, TEAM_STORAGE, LABEL_WIDTH, DAY_WIDTH, INITIAL_WEEKS, GROW_WEEKS, MAX_WEEKS, monday, bySort, TaskCard, RowFragment, BacklogPanel, MobileDayView, MoveModal } from "./boardParts";
import { TeamSearchSelect } from "../../components/teamSearchSelect";

dayjs.extend(isoWeek);

// Planning board: rows = the team (first) and its members, columns = days. A card is a task; every move goes through
// task_plan(), which also writes the history entry into the task's feed.
// A task without a planned date but with a due date is shown (dashed, tagged "Due") in the column of its due date, in
// the row of its team / person; moving it plans it. The backlog keeps what has neither a date nor a row to sit in.
// The grid is one long strip of days: it starts one week back, shows 12 weeks and grows by 8 weeks near its right end
// (up to two years); the arrows page by a week and "Today" scrolls back.
// Phone: one day at a time, the rows become sub-headings, and a card is moved with its "move" button instead of
// dragging, which would fight with scrolling.

export const PlanningBoard = () => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { message } = AntdApp.useApp();
  const { userId } = useMe();
  const isMobile = useIsMobile();
  const { data: groups } = useTeams();
  const { data: members } = useTeamMembers();
  const { data: users } = useUsers();
  const [startWeek, setStartWeek] = useState(() => monday(dayjs()).subtract(7, "day"));
  const [weeks, setWeeks] = useState(INITIAL_WEEKS);
  const [backlogOpen, setBacklogOpen] = useState(() => localStorage.getItem("compass.planning.backlog") !== "closed");
  const scroller = useRef<HTMLDivElement>(null);
  const pendingShift = useRef(0);
  const scrolledToToday = useRef(false);
  const [showWeekend, setShowWeekend] = useState(false);
  const [selectedDay, setSelectedDay] = useState(() => dayjs().startOf("day"));
  const [moving, setMoving] = useState<TaskOverviewRow | null>(null);
  const [mobileBacklogOpen, setMobileBacklogOpen] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(() => localStorage.getItem(TEAM_STORAGE));
  // Initiative filter: only the tasks below one initiative. Lives in the URL (?initiative=<id>, linked from the
  // initiative page) and is not remembered, so a forgotten filter cannot hide work.
  const [searchParams, setSearchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiative");
  const setInitiativeId = useCallback(
    (id: string | null) => {
      setSearchParams(id ? { initiative: id } : {}, { replace: true });
    },
    [setSearchParams],
  );
  const { data: initiatives } = useQuery({
    queryKey: ["planning-initiatives"],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from("initiatives_overview")
        .select("id, task_number, title, status")
        .order("task_number", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { id: string; task_number: number; title: string; status: string }[];
    },
  });
  const [tasks, setTasks] = useState<TaskOverviewRow[]>([]);
  const [active, setActive] = useState<TaskOverviewRow | null>(null);
  const reloadTimer = useRef<number | undefined>(undefined);

  // Default team: one of mine, else the first.
  useEffect(() => {
    if (teamId && groups?.some((g) => g.id === teamId)) return;
    if (!groups?.length || !members) return;
    const mine = members.find((m) => m.user_id === userId);
    setTeamId(mine?.team_id ?? groups[0].id);
  }, [groups, members, teamId, userId]);
  useEffect(() => {
    if (teamId) localStorage.setItem(TEAM_STORAGE, teamId);
  }, [teamId]);

  const memberUsers = useMemo(() => {
    const ids = new Set((members ?? []).filter((m) => m.team_id === teamId).map((m) => m.user_id));
    // A locked member keeps a row only while tasks are still on it (nobody plans new work for them).
    const withTasks = tasks.map((x) => x.assigned_user_id).filter((id): id is string => !!id);
    return usersFor(users, withTasks).filter((u) => ids.has(u.id));
  }, [members, users, teamId, tasks]);

  const days = useMemo(
    () => Array.from({ length: weeks * 7 }, (_, i) => startWeek.add(i, "day")).filter((d) => showWeekend || d.day() % 6 !== 0),
    [startWeek, weeks, showWeekend],
  );
  const rangeStart = startWeek.format(DATE);
  const rangeEnd = startWeek.add(weeks * 7 - 1, "day").format(DATE);

  const load = useCallback(async () => {
    if (!teamId) return;
    const base = () => {
      const query = supabaseClient.from("tasks_overview").select("*").not("status", "in", `(${FINAL_TASK_STATUSES.join(",")})`);
      return initiativeId ? query.eq("root_task_id", initiativeId) : query;
    };
    const [week, backlog] = await Promise.all([
      base().gte("planned_date", rangeStart).lte("planned_date", rangeEnd).limit(1000),
      base().is("planned_date", null).limit(1000),
    ]);
    if (week.error || backlog.error) {
      message.error(errorText(week.error ?? backlog.error));
      return;
    }
    setTasks([...(week.data ?? []), ...(backlog.data ?? [])] as TaskOverviewRow[]);
  }, [teamId, initiativeId, rangeStart, rangeEnd, message]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: others planning at the same time.
  useEffect(() => {
    const channel = supabaseClient
      .channel("planning-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        window.clearTimeout(reloadTimer.current);
        reloadTimer.current = window.setTimeout(() => void load(), 400);
      })
      .subscribe();
    return () => {
      window.clearTimeout(reloadTimer.current);
      void supabaseClient.removeChannel(channel);
    };
  }, [load]);

  const weekWidth = (showWeekend ? 7 : 5) * DAY_WIDTH;

  const scrollToToday = useCallback((smooth: boolean) => {
    const box = scroller.current;
    // The week of today at the left edge (next week when it is the weekend and weekends are hidden).
    const now = dayjs();
    const target = !showWeekend && now.day() % 6 === 0 ? monday(now).add(7, "day") : monday(now);
    const head = box?.querySelector<HTMLElement>(`[data-week="${target.format(DATE)}"]`);
    if (!box || !head) return;
    const x = head.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    box.scrollTo({ left: Math.max(0, x - LABEL_WIDTH), behavior: smooth ? "smooth" : "auto" });
  }, [showWeekend]);

  // First load: land on today, not on the left edge.
  useEffect(() => {
    if (scrolledToToday.current || !teamId) return;
    scrolledToToday.current = true;
    window.setTimeout(() => scrollToToday(false), 0);
  }, [teamId, scrollToToday]);

  // Earlier weeks were added on the left: keep what the user looks at in place.
  useLayoutEffect(() => {
    if (pendingShift.current && scroller.current) {
      scroller.current.scrollLeft += pendingShift.current;
      pendingShift.current = 0;
    }
  }, [startWeek]);

  const pageBy = (direction: -1 | 1) => {
    const box = scroller.current;
    if (!box) return;
    if (direction < 0 && box.scrollLeft < weekWidth) {
      pendingShift.current = 4 * weekWidth;
      setStartWeek((w) => w.subtract(28, "day"));
      setWeeks((w) => Math.min(MAX_WEEKS, w + 4));
    }
    box.scrollBy({ left: direction * weekWidth, behavior: "smooth" });
  };

  // Near the right end: more future.
  const onScroll = () => {
    const box = scroller.current;
    if (box && weeks < MAX_WEEKS && box.scrollWidth - box.scrollLeft - box.clientWidth < weekWidth * 2) {
      setWeeks((w) => Math.min(MAX_WEEKS, w + GROW_WEEKS));
    }
  };

  const toggleBacklog = () => {
    setBacklogOpen((open) => {
      localStorage.setItem("compass.planning.backlog", open ? "closed" : "open");
      return !open;
    });
  };

  const memberIds = useMemo(() => new Set(memberUsers.map((u) => u.id)), [memberUsers]);

  // Which board row a task sits in: the team row (team set, nobody assigned) or its person's row.
  const rowOf = useCallback(
    (task: TaskOverviewRow) => (task.assigned_user_id ? task.assigned_user_id : task.team_id === teamId ? TEAM_ROW : null),
    [teamId],
  );

  // Weekend columns hidden: a deadline on Saturday / Sunday shows on the Friday before.
  const dueColumn = useCallback(
    (x: TaskOverviewRow) => {
      if (x.planned_date || !x.due_date) return null;
      const d = dayjs(x.due_date);
      return (showWeekend ? d : d.day() === 6 ? d.subtract(1, "day") : d.day() === 0 ? d.subtract(2, "day") : d).format(DATE);
    },
    [showWeekend],
  );
  const dayIds = useMemo(() => new Set(days.map((d) => d.format(DATE))), [days]);
  // The row a deadline-only task sits in: its team / person; work nobody has claimed yet is offered in the team row of
  // the selected team (dragging it there claims it for the team).
  const ghostRow = useCallback((x: TaskOverviewRow) => rowOf(x) ?? (!x.team_id && !x.assigned_user_id ? TEAM_ROW : null), [rowOf]);
  // Unplanned, has a deadline inside the shown weeks and a row to sit in.
  const isGhost = useCallback((x: TaskOverviewRow) => {
    const column = dueColumn(x);
    return column !== null && dayIds.has(column) && ghostRow(x) !== null;
  }, [dueColumn, dayIds, ghostRow]);

  const cellTasks = useCallback(
    (row: string, date: string) => tasks.filter((x) => (x.planned_date === date && rowOf(x) === row) || (isGhost(x) && dueColumn(x) === date && ghostRow(x) === row)).sort(bySort),
    [tasks, rowOf, isGhost, dueColumn, ghostRow],
  );

  // Backlog: unscheduled work of this team and its members, plus work nobody has claimed yet. With an initiative
  // filter it holds all of the initiative's unscheduled work, whoever owns it.
  const backlog = useMemo(
    () =>
      tasks
        .filter((x) => !x.planned_date && !isGhost(x))
        .filter((x) => !!initiativeId || x.team_id === teamId || (x.assigned_user_id && memberIds.has(x.assigned_user_id)) || (!x.team_id && !x.assigned_user_id))
        .sort(bySort),
    [tasks, teamId, memberIds, isGhost, initiativeId],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as { task: TaskOverviewRow }).task);

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const task = (e.active.data.current as { task: TaskOverviewRow } | undefined)?.task;
    if (!task || !e.over || !teamId) return;
    const targetId = String(e.over.id);

    let row: string | null;
    let date: string | null;
    if (targetId === BACKLOG) {
      row = rowOf(task);
      date = null;
    } else {
      [row, date] = targetId.split("|");
    }

    const newUser = targetId === BACKLOG ? task.assigned_user_id : row === TEAM_ROW ? null : row;
    const newTeam = targetId === BACKLOG ? task.team_id : row === TEAM_ROW ? teamId : task.team_id && memberIdsOfTeam(task.team_id, newUser) ? task.team_id : null;

    // Position inside the target cell from where the pointer was released.
    const pointer = e.activatorEvent instanceof MouseEvent || e.activatorEvent instanceof PointerEvent
      ? { y: e.activatorEvent.clientY + e.delta.y }
      : { y: 0 };
    const cellTasksNow = (targetId === BACKLOG ? backlog : cellTasks(row!, date!)).filter((x) => x.id !== task.id);
    const cards = Array.from(document.querySelectorAll<HTMLElement>(`[data-cell="${CSS.escape(targetId)}"] [data-task-id]`)).filter((el) => el.dataset.taskId !== task.id);
    let index = cards.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return pointer.y < r.top + r.height / 2;
    });
    if (index < 0) index = cellTasksNow.length;

    const prev = cellTasksNow[index - 1]?.sort_order ?? null;
    const next = cellTasksNow[index]?.sort_order ?? null;
    let sortOrder: string;
    let renormalize = false;
    try {
      sortOrder = generateKeyBetween(prev, next);
    } catch {
      // Neighbours share a key (rows seeded with the default): re-key the whole cell once.
      renormalize = true;
      sortOrder = "";
    }

    const ordered = [...cellTasksNow.slice(0, index), task, ...cellTasksNow.slice(index)];
    const keys = renormalize ? generateNKeysBetween(null, null, ordered.length) : [];
    const finalKey = renormalize ? keys[index] : sortOrder;

    const previousTasks = tasks;
    setTasks((cur) =>
      cur.map((x) => {
        if (x.id === task.id) return { ...x, assigned_user_id: newUser, team_id: newTeam, planned_date: date, sort_order: finalKey };
        const at = ordered.findIndex((o) => o.id === x.id);
        return renormalize && at >= 0 ? { ...x, sort_order: keys[at] } : x;
      }),
    );

    const call = (id: string, team: string | null, user: string | null, plannedDate: string | null, key: string) =>
      supabaseClient.rpc("task_plan", { p_task_id: id, p_team_id: team, p_assigned_user_id: user, p_planned_date: plannedDate, p_sort_order: key });

    const results = [await call(task.id, newTeam, newUser, date, finalKey)];
    if (renormalize && !results[0].error) {
      for (let i = 0; i < ordered.length; i++) {
        const o = ordered[i];
        if (o.id === task.id) continue;
        results.push(await call(o.id, o.team_id, o.assigned_user_id, o.planned_date, keys[i]));
      }
    }
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setTasks(previousTasks);
      message.error(errorText(failed.error));
    }
  };

  // Phone: move a card to a row and a day (or the backlog), at the end of that cell.
  const moveTo = async (task: TaskOverviewRow, row: string, date: string | null) => {
    if (!teamId) return;
    const newUser = row === TEAM_ROW ? null : row;
    const newTeam = row === TEAM_ROW ? teamId : task.team_id && memberIdsOfTeam(task.team_id, newUser) ? task.team_id : null;
    const others = (date ? cellTasks(row, date) : backlog).filter((x) => x.id !== task.id);
    let key = task.sort_order;
    try {
      key = generateKeyBetween(others[others.length - 1]?.sort_order ?? null, null);
    } catch {
      // Keep the old key: the order inside the cell is then arbitrary but valid.
    }
    const previousTasks = tasks;
    setTasks((cur) => cur.map((x) => (x.id === task.id ? { ...x, assigned_user_id: newUser, team_id: newTeam, planned_date: date, sort_order: key } : x)));
    const { error } = await supabaseClient.rpc("task_plan", { p_task_id: task.id, p_team_id: newTeam, p_assigned_user_id: newUser, p_planned_date: date, p_sort_order: key });
    if (error) {
      setTasks(previousTasks);
      message.error(errorText(error));
    }
  };

  // Phone: the day shown. A weekend day is nudged to the next Monday while weekends are hidden; the loaded range is
  // moved or grown so the day is always inside it.
  const shownDay = !showWeekend && selectedDay.day() % 6 === 0 ? monday(selectedDay).add(7, "day") : selectedDay;
  const goToDay = (d: Dayjs) => {
    const day = d.startOf("day");
    setSelectedDay(day);
    if (day.isBefore(startWeek) || day.isAfter(startWeek.add(weeks * 7 - 15, "day"))) {
      setStartWeek(monday(day).subtract(7, "day"));
      setWeeks(INITIAL_WEEKS);
    }
  };
  const stepDay = (direction: -1 | 1) => {
    let d = shownDay.add(direction, "day");
    while (!showWeekend && d.day() % 6 === 0) d = d.add(direction, "day");
    goToDay(d);
  };

  // A task keeps its team when the new person is in that team, otherwise it becomes personal.
  const memberIdsOfTeam = (team: string, user: string | null) => !user || (members ?? []).some((m) => m.team_id === team && m.user_id === user);

  const planningRows = useMemo(
    () => [{ id: TEAM_ROW, label: groups?.find((g) => g.id === teamId)?.name ?? "", team: true }, ...memberUsers.map((u) => ({ id: u.id, label: userLabel(u), team: false }))],
    [groups, teamId, memberUsers],
  );

  const gridColumns = `${LABEL_WIDTH}px repeat(${days.length}, ${DAY_WIDTH}px)`;
  const today = dayjs().format(DATE);

  return (
    <List
      hint={t(isMobile ? "planning.hintMobile" : "planning.hint")}
      headerButtons={
        <>
          <TeamSearchSelect use="tasks" allowClear={false} style={{ minWidth: 200, width: isMobile ? "100%" : undefined }} value={teamId ?? undefined} onChange={(v) => v && setTeamId(v)} />
          <Select
            style={{ minWidth: 220, maxWidth: 320, width: isMobile ? "100%" : undefined }}
            value={initiativeId ?? undefined}
            onChange={(v) => setInitiativeId(v ?? null)}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t("planning.allInitiatives")}
            options={(initiatives ?? []).map((i) => ({ value: i.id, label: `#${i.task_number} ${i.title}` }))}
          />
          <Space size={4}>
            <Switch checked={showWeekend} onChange={setShowWeekend} />
            <span>{t("planning.weekend")}</span>
          </Space>
          {!isMobile && (
            <Space.Compact>
              <Button icon={<CaretLeftOutlined />} onClick={() => pageBy(-1)} />
              <Button onClick={() => scrollToToday(true)}>{t("planning.today")}</Button>
              <Button icon={<CaretRightOutlined />} onClick={() => pageBy(1)} />
            </Space.Compact>
          )}
        </>
      }
    >
      {!teamId ? (
        <Empty description={t("planning.noTeams")} />
      ) : isMobile ? (
        <>
          <MobileDayView
            day={shownDay}
            rows={planningRows}
            cellTasks={cellTasks}
            backlog={backlog}
            backlogOpen={mobileBacklogOpen}
            onToggleBacklog={() => setMobileBacklogOpen((o) => !o)}
            onStep={stepDay}
            onPick={goToDay}
            onMove={setMoving}
          />
          <MoveModal
            task={moving}
            rows={planningRows}
            defaultRow={moving ? rowOf(moving) ?? TEAM_ROW : TEAM_ROW}
            defaultDate={moving ? moving.planned_date ?? dueColumn(moving) ?? shownDay.format(DATE) : null}
            onClose={() => setMoving(null)}
            onSave={(row, date) => {
              if (moving) void moveTo(moving, row, date);
              setMoving(null);
            }}
          />
        </>
      ) : (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div ref={scroller} onScroll={onScroll} style={{ flex: "1 1 700px", minWidth: 0, overflowX: "auto", border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, background: token.colorBgContainer }}>
              <div style={{ width: LABEL_WIDTH + days.length * DAY_WIDTH }}>
                <div style={{ display: "grid", gridTemplateColumns: gridColumns, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                  <div style={{ position: "sticky", left: 0, zIndex: 3, background: token.colorBgContainer, borderRight: `1px solid ${token.colorBorderSecondary}`, borderBottom: `1px solid ${token.colorBorderSecondary}` }} />
                  {days.map((d) => {
                    const date = d.format(DATE);
                    const firstOfWeek = d.isoWeekday() === 1 || date === days[0].format(DATE);
                    return (
                      <div
                        key={date}
                        data-today={date === today ? "" : undefined}
                        data-week={d.isoWeekday() === 1 ? date : undefined}
                        style={{
                          padding: "4px 8px",
                          fontWeight: date === today ? 600 : 400,
                          color: date === today ? token.colorPrimary : undefined,
                          borderRight: `1px solid ${token.colorBorderSecondary}`,
                          borderBottom: `1px solid ${token.colorBorderSecondary}`,
                          borderLeft: d.isoWeekday() === 1 ? `2px solid ${token.colorBorder}` : undefined,
                          background: date === today ? token.colorPrimaryBg : undefined,
                        }}
                      >
                        <div style={{ fontSize: 11, height: 14, color: token.colorTextSecondary }}>
                          {firstOfWeek ? `${t("planning.weekShort")} ${d.isoWeek()} · ${d.format("MMM YYYY")}` : ""}
                        </div>
                        {d.format("dd DD.MM.")}
                      </div>
                    );
                  })}

                  {planningRows.map((row) => (
                    <RowFragment key={row.id} row={row} days={days} today={today} cellTasks={cellTasks} />
                  ))}
                </div>
              </div>
            </div>

            <BacklogPanel tasks={backlog} open={backlogOpen} onToggle={toggleBacklog} />
          </div>
          <DragOverlay>{active ? <TaskCard task={active} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
    </List>
  );
};
