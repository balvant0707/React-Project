// Ported 1:1 from COMPASS (app/src/modules/absences/planner.tsx).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, DatePicker, Empty, Segmented, Select, Space, Spin, Tooltip, Typography, theme as antdTheme } from "antd";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "@rbp/core";
import { LeavePlannerDetail } from "./plannerDetail";
import { useHolidayCoverage, useLeaveEnterable, useLeavePlannerDays, useLeavePlannerLoad, useLeavePlannerPeople, useLeavePlannerTeams, useTeamLoad } from "./useLeave";
import { useMe } from "@rbp/core";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { addDays, formatDays, isWeekend, isoDay, loadRatio, weekStart, type PlannerDay, type PlannerScope } from "./leave";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";

dayjs.extend(isoWeek);

type View = "day" | "week";
const NAME_WIDTH = 190;
const DAY_WIDTH = 34;
const WEEK_WIDTH = 92;
const CHUNK_WEEKS = 10;
const MAX_WEEKS = 150;

const APPROVED = "#52c41a";
const REQUESTED = "#faad14";

// Colour of the load row: free .. at the limit .. over it.
const loadColor = (ratio: number) => (ratio <= 0 ? "transparent" : ratio < 0.5 ? "#d9f7be" : ratio <= 1 ? "#ffe58f" : "#ff7875");

// A cell filled with the approved share (green), then the waiting share (amber); the rest stays empty. In the week view this is
// the gradient of the week; in the day view a half day fills the lower half.
const gradient = (approved: number, requested: number, vertical = false) => {
  const a = Math.round(Math.min(1, approved) * 100);
  const r = Math.round(Math.min(1, approved + requested) * 100);
  const dir = vertical ? "to top" : "to right";
  return `linear-gradient(${dir}, ${APPROVED} ${a}%, ${REQUESTED} ${a}%, ${REQUESTED} ${r}%, transparent ${r}%)`;
};

type Col = { key: string; start: string; days: string[] };

// Continuous planner: one row per person, scrolling to the right into the future (the window grows while you scroll, there are
// no month or year pages). Day view: one column per day. Week view: one column per week, a cell shows the days away in that
// week and fills like a gradient; the load row shows the peak day of the week.
export const LeavePlanner = ({ onRequest }: { onRequest?: (range: [string, string], forUserId: string) => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { userId } = useMe();
  const { data: enterable } = useLeaveEnterable();
  const { data: people } = usePeople();
  const { data: teams } = useLeavePlannerTeams();
  const today = isoDay(new Date());

  // Without a choice: people without reports start on "only me", supervisors on their team members.
  const [chosenScope, setChosenScope] = useState<PlannerScope | null>(null);
  const { data: reportIds, isLoading: loadingReports } = useLeavePlannerPeople("reports");
  const hasReports = (reportIds ?? []).some((id) => id !== userId);
  const scope: PlannerScope = chosenScope ?? (loadingReports || hasReports ? "reports" : "me");
  const setScope = setChosenScope;
  const yearMode = scope === "me";
  const [year, setYear] = useState(() => dayjs().year());
  const [view, setView] = useState<View>("week");
  const [start, setStart] = useState(() => addDays(weekStart(today), -7));
  const [weeks, setWeeks] = useState(CHUNK_WEEKS * 2);
  const scroller = useRef<HTMLDivElement>(null);
  // Picking a period like on a travel site: first day, then last day (hover shows the range), Escape cancels.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [pickUser, setPickUser] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAnchor(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor]);

  const { data: userIds, isLoading: loadingPeople } = useLeavePlannerPeople(scope);
  const weeksEnd = addDays(start, weeks * 7 - 1);
  // "Only me" shows one calendar year, months below each other; otherwise the window scrolls to the right.
  const from = yearMode ? `${year}-01-01` : start;
  const end = yearMode ? `${year}-12-31` : weeksEnd;
  const { data: days } = useLeavePlannerDays(userIds, from, end);
  const teamId = scope.startsWith("team:") ? scope.slice(5) : null;
  const { data: teamLoad } = useTeamLoad(teamId, from, end);
  const { data: holidays } = useQuery({
    queryKey: ["public-holidays", from, end],
    staleTime: 60 * 60_000,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("public_holidays").select("holiday_date, name, site").is("site", null).gte("holiday_date", from).lte("holiday_date", end);
      if (error) throw error;
      return (data ?? []) as { holiday_date: string; name: string }[];
    },
  });
  const { data: holidaysUntil } = useHolidayCoverage();
  // Outside the team scope the row shows the worst team per day among the people shown (the rule is per team).
  const { data: worstTeam } = useLeavePlannerLoad(userIds, from, end, !teamId && !yearMode);

  // The window grows to the right while the user scrolls towards its end.
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollLeft + el.clientWidth > el.scrollWidth - 600) setWeeks((w) => Math.min(MAX_WEEKS, w + CHUNK_WEEKS));
  }, []);
  useEffect(() => {
    setWeeks(CHUNK_WEEKS * 2);
    scroller.current?.scrollTo({ left: 0 });
    setAnchor(null);
  }, [start, view, scope]);

  const holiday = useMemo(() => new Map((holidays ?? []).map((h) => [h.holiday_date, h.name])), [holidays]);
  const nonWorking = (d: string) => isWeekend(d) || holiday.has(d);

  const columns: Col[] = useMemo(() => {
    const out: Col[] = [];
    for (let w = 0; w < weeks; w++) {
      const monday = addDays(start, w * 7);
      const wd = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
      if (view === "week") out.push({ key: monday, start: monday, days: wd });
      else for (const d of wd) out.push({ key: d, start: d, days: [d] });
    }
    return out;
  }, [start, weeks, view]);

  const byUser = useMemo(() => {
    const m = new Map<string, Map<string, PlannerDay>>();
    for (const r of days ?? []) {
      const inner = m.get(r.user_id) ?? new Map<string, PlannerDay>();
      inner.set(r.day, r);
      m.set(r.user_id, inner);
    }
    return m;
  }, [days]);

  const rows = useMemo(
    () => (userIds ?? []).map((id) => people?.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p).sort((a, b) => (a.id === userId ? -1 : b.id === userId ? 1 : personName(a).localeCompare(personName(b)))),
    [userIds, people, userId],
  );

  // Load per day: the whole team on the server, or the worst team of the people shown.
  const load = useMemo(() => {
    const out = new Map<string, { away: number; size: number; allowed: number; team?: string }>();
    if (teamId) {
      const name = teams?.find((x) => x.id === teamId)?.name;
      for (const r of teamLoad ?? []) out.set(r.day, { away: r.away, size: r.team_size, allowed: r.allowed, team: name });
    } else {
      for (const r of worstTeam ?? []) out.set(r.day, { away: r.away, size: r.team_size, allowed: r.allowed, team: r.team_name });
    }
    return out;
  }, [teamId, teamLoad, worstTeam, teams]);

  const weekMode = !yearMode && view === "week";
  const widthOf = view === "day" ? DAY_WIDTH : WEEK_WIDTH;
  const monthLabel = (d: string) => dayjs(d).format("MMMM YYYY");
  const months: { label: string; span: number }[] = [];
  for (const c of columns) {
    const label = monthLabel(c.start);
    if (months.length && months[months.length - 1].label === label) months[months.length - 1].span++;
    else months.push({ label, span: 1 });
  }

  const cellStyle = (extra: React.CSSProperties = {}): React.CSSProperties => ({ minWidth: widthOf, width: widthOf, height: 30, padding: 0, textAlign: "center", borderRight: `1px solid ${token.colorSplit}`, borderBottom: `1px solid ${token.colorSplit}`, ...extra });
  const stickyName: React.CSSProperties = { position: "sticky", left: 0, zIndex: 2, background: token.colorBgContainer, minWidth: NAME_WIDTH, width: NAME_WIDTH, textAlign: "left", padding: "0 8px", borderRight: `1px solid ${token.colorBorder}`, borderBottom: `1px solid ${token.colorSplit}` };

  const scopeOptions = [
    { value: "reports", label: t("leave.planner.reports") },
    { value: "me", label: t("leave.planner.me") },
    ...(teams ?? []).map((tm) => ({ value: `team:${tm.id}`, label: `${tm.name} (${tm.member_count})` })),
  ];

  // Week cell: days away, split into the approved and the waiting share of the week's working days.
  const weekCell = (id: string, c: Col) => {
    const perUser = byUser.get(id);
    let approved = 0;
    let requested = 0;
    let working = 0;
    let requestId: string | undefined;
    for (const d of c.days) {
      if (nonWorking(d)) continue;
      working++;
      const r = perUser?.get(d);
      if (!r) continue;
      requestId = requestId ?? r.request_id;
      if (r.status === "approved") approved += r.fraction;
      else requested += r.fraction;
    }
    const total = approved + requested;
    return { total, requestId, style: total > 0 ? { background: gradient(approved / Math.max(1, working), requested / Math.max(1, working)) } : undefined };
  };

  // The period picked so far: day view = days, week view = whole weeks (Monday to Friday).
  const selection = (): [string, string] | null => {
    if (!anchor) return null;
    const other = hover ?? anchor;
    const [a, b] = anchor <= other ? [anchor, other] : [other, anchor];
    return weekMode ? [a, addDays(b, 4)] : [a, b];
  };
  const inSelection = (col: Col) => {
    const sel = selection();
    if (!sel) return false;
    return weekMode ? col.start >= sel[0] && col.start <= weekStart(sel[1]) : col.start >= sel[0] && col.start <= sel[1];
  };
  // First click sets the start, second click the end and opens the request dialog with the period.
  // Leave can be entered in your own row and in the rows the server lists (people you approve leave for, everybody for HR).
  const canPick = (p: { id: string }) => !!onRequest && (p.id === userId || !!enterable?.has(p.id));
  const pick = (col: Col, personId: string) => {
    if (!anchor || pickUser !== personId) {
      setPickUser(personId);
      setHover(null);
      return setAnchor(col.start);
    }
    const other = col.start;
    const [a, b] = anchor <= other ? [anchor, other] : [other, anchor];
    setAnchor(null);
    setHover(null);
    onRequest?.(weekMode ? [a, addDays(b, 4)] : [a, b], personId);
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select value={scope} onChange={(v) => { setScope(v as PlannerScope); setAnchor(null); setPickUser(null); setHover(null); }} options={scopeOptions} style={{ minWidth: 220 }} />
        {yearMode ? (
          <>
            <Button onClick={() => setYear(dayjs().year())}>{t("leave.planner.today")}</Button>
            <DatePicker allowClear={false} picker="year" value={dayjs(`${year}-01-01`)} onChange={(d) => d && setYear(d.year())} />
          </>
        ) : (
          <>
            <Segmented value={view} onChange={(v) => setView(v as View)} options={[{ value: "day", label: t("leave.planner.day") }, { value: "week", label: t("leave.planner.week") }]} />
            <Button onClick={() => setStart(addDays(weekStart(today), -7))}>{t("leave.planner.today")}</Button>
            <DatePicker allowClear={false} value={dayjs(start)} onChange={(d) => d && setStart(weekStart(d.format("YYYY-MM-DD")))} />
          </>
        )}
        <Space size={4}>
          <span style={{ width: 12, height: 12, background: APPROVED, display: "inline-block", borderRadius: 2 }} /> {t("leave.statuses.approved")}
          <span style={{ width: 12, height: 12, background: REQUESTED, display: "inline-block", borderRadius: 2, marginLeft: 8 }} /> {t("leave.statuses.requested")}
        </Space>
      </Space>

      {/* One line for both states, so the grid does not move under the mouse after the first click. */}
      {rows.some(canPick) && (
        <Typography.Paragraph type={anchor ? undefined : "secondary"} style={{ marginBottom: 8, minHeight: 22, lineHeight: "22px" }}>
          {anchor ? (
            <>
              <strong>{t("leave.planner.picking", { from: formatDate(anchor), to: formatDate(selection()![1]) })}</strong>{" "}
              <Button size="small" type="link" onClick={() => setAnchor(null)}>{t("common.cancel")}</Button>
            </>
          ) : (
            t("leave.planner.pickHint")
          )}
        </Typography.Paragraph>
      )}
      {loadingPeople ? (
        <Spin />
      ) : rows.length === 0 ? (
        <Empty description={t("leave.planner.empty")} />
      ) : yearMode ? (
        <div style={{ border: `1px solid ${token.colorBorder}`, borderRadius: 6, overflowX: "auto" }}>
          {rows.map((p) => {
            const perUser = byUser.get(p.id);
            return (
              <table key={p.id} style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", width: "100%", minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ width: 90, height: 24, borderRight: `1px solid ${token.colorBorder}`, borderBottom: `1px solid ${token.colorSplit}`, fontSize: 12, fontWeight: 600 }}>{year}</th>
                    {Array.from({ length: 37 }, (_, i) => (
                      <th key={i} style={{ height: 24, fontWeight: 400, fontSize: 11, textAlign: "center", color: i % 7 >= 5 ? token.colorTextSecondary : undefined, background: i % 7 >= 5 ? token.colorFillQuaternary : undefined, borderRight: `1px solid ${token.colorSplit}`, borderBottom: `1px solid ${token.colorSplit}` }}>{dayjs().isoWeekday((i % 7) + 1).format("dd")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, m) => {
                    const first = dayjs(`${year}-${String(m + 1).padStart(2, "0")}-01`);
                    return (
                      <tr key={m}>
                        <td style={{ height: 30, padding: "0 8px", fontWeight: 600, whiteSpace: "nowrap", borderRight: `1px solid ${token.colorBorder}`, borderBottom: `1px solid ${token.colorSplit}` }}>{first.format("MMMM")}</td>
                        {Array.from({ length: 37 }, (_, i) => {
                          // Columns are weekdays (Mo..So, repeated), so every weekend lines up under the others.
                          const dayOfMonth = i - (first.isoWeekday() - 1) + 1;
                          const edge = { height: 30, padding: 0, borderRight: `1px solid ${token.colorSplit}`, borderBottom: `1px solid ${token.colorSplit}` };
                          if (dayOfMonth < 1 || dayOfMonth > first.daysInMonth()) return <td key={i} style={{ ...edge, background: token.colorFillQuaternary }} />;
                          const d = first.date(dayOfMonth).format("YYYY-MM-DD");
                          const r = perUser?.get(d);
                          const grey = nonWorking(d);
                          const bg = r ? (r.fraction < 1 ? gradient(r.status === "approved" ? r.fraction : 0, r.status === "requested" ? r.fraction : 0, true) : r.status === "approved" ? APPROVED : REQUESTED) : grey ? token.colorFillSecondary : undefined;
                          const cell = (
                            <td
                              key={i}
                              onClick={() => (r ? !anchor && setDetailId(r.request_id) : canPick(p) ? pick({ key: d, start: d, days: [d] }, p.id) : undefined)}
                              onMouseEnter={() => p.id === pickUser && anchor && setHover(d)}
                              style={{ ...edge, background: !r && p.id === pickUser && inSelection({ key: d, start: d, days: [d] }) ? token.colorPrimaryBorder : bg, cursor: r ? "pointer" : canPick(p) ? "cell" : undefined, outline: d === today ? `1px solid ${token.colorPrimary}` : undefined, textAlign: "center", fontSize: 11, color: token.colorTextSecondary }}
                            >{dayOfMonth}</td>
                          );
                          const tip = r ? `${formatDate(d)}: ${t(`leave.statuses.${r.status}`)}${r.fraction < 1 ? ` (${formatDays(r.fraction)})` : ""}` : holiday.get(d);
                          return tip ? <Tooltip key={i} title={tip}>{cell}</Tooltip> : cell;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })}
        </div>
      ) : (
        <div ref={scroller} onScroll={onScroll} style={{ overflow: "auto", maxHeight: "calc(100vh - 300px)", border: `1px solid ${token.colorBorder}`, borderRadius: 6 }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ ...stickyName, top: 0, zIndex: 4, height: 24 }} />
                {months.map((m, i) => (
                  <th key={i} colSpan={m.span} style={{ ...cellStyle({ height: 24, position: "sticky", top: 0, zIndex: 3, background: token.colorBgContainer, textAlign: "left", padding: "0 6px" }), whiteSpace: "nowrap" }}>
                    <span style={{ position: "sticky", left: NAME_WIDTH + 8 }}>{m.label}</span>
                  </th>
                ))}
              </tr>
              <tr>
                <th style={{ ...stickyName, top: 24, zIndex: 4 }}>
                  <Typography.Text type="secondary">{t("leave.planner.person")}</Typography.Text>
                </th>
                {columns.map((c) => {
                  const isToday = c.days.includes(today);
                  return (
                    <th key={c.key} style={cellStyle({ position: "sticky", top: 24, zIndex: 3, background: isToday ? token.colorPrimaryBg : token.colorBgContainer, fontWeight: 400, fontSize: 12, lineHeight: "14px" })}>
                      {view === "day" ? (
                        <>
                          <div style={{ color: token.colorTextSecondary }}>{dayjs(c.start).format("dd")}</div>
                          <div>{dayjs(c.start).format("D")}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ color: token.colorTextSecondary }}>{t("leave.planner.weekShort", { week: dayjs(c.start).isoWeek() })}</div>
                          <div>{dayjs(c.start).format("D.M.")}</div>
                        </>
                      )}
                    </th>
                  );
                })}
              </tr>
              <tr>
                <th style={{ ...stickyName, top: 54, zIndex: 4 }}>
                  <Typography.Text strong style={{ fontSize: 12 }}>{teamId ? t("leave.planner.teamLoad") : t("leave.planner.worstTeamLoad")}</Typography.Text>
                </th>
                {columns.map((c) => {
                  const dl = c.days.filter((d) => !nonWorking(d)).map((d) => ({ d, l: load.get(d) })).filter((x) => x.l);
                  const peak = dl.reduce<{ away: number; size: number; allowed: number; team?: string } | null>((best, x) => (!best || x.l!.away / Math.max(1, x.l!.allowed) > best.away / Math.max(1, best.allowed) ? x.l! : best), null);
                  const ratio = peak ? loadRatio(peak.away, peak.allowed) : 0;
                  return (
                    <th key={c.key} style={cellStyle({ position: "sticky", top: 54, zIndex: 3, background: ratio > 0 ? loadColor(ratio) : token.colorBgContainer, fontWeight: 400, fontSize: 12 })}>
                      {peak && (
                        <Tooltip title={t("leave.planner.loadTip", { team: peak.team ?? "", away: formatDays(peak.away), size: peak.size, allowed: peak.allowed })}>
                          <span style={{ display: "block", lineHeight: "30px" }}>{formatDays(peak.away)}</span>
                        </Tooltip>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...stickyName, height: 30 }}>
                    <Space size={6} style={{ whiteSpace: "nowrap" }}>
                      <PersonAvatar person={p} size={20} />
                      <span style={{ fontWeight: p.id === userId ? 600 : 400 }}>{personName(p)}</span>
                    </Space>
                  </td>
                  {columns.map((c) => {
                    const grey = view === "day" && nonWorking(c.start);
                    const isToday = c.days.includes(today);
                    if (view === "week") {
                      const cell = weekCell(p.id, c);
                      return (
                        <td
                          key={c.key}
                          onClick={() => (cell.requestId && !anchor ? setDetailId(cell.requestId) : canPick(p) && !cell.requestId ? pick(c, p.id) : undefined)}
                          onMouseEnter={() => p.id === pickUser && anchor && setHover(c.start)}
                          style={cellStyle({ ...cell.style, ...(p.id === pickUser && inSelection(c) ? { background: token.colorPrimaryBorder } : {}), cursor: cell.requestId ? "pointer" : canPick(p) ? "cell" : undefined, outline: isToday ? `1px solid ${token.colorPrimary}` : undefined, fontSize: 12, fontWeight: 600 })}
                        >
                          {cell.total > 0 ? formatDays(cell.total) : ""}
                        </td>
                      );
                    }
                    const r = byUser.get(p.id)?.get(c.start);
                    const bg = r ? (r.fraction < 1 ? gradient(r.status === "approved" ? r.fraction : 0, r.status === "requested" ? r.fraction : 0, true) : r.status === "approved" ? APPROVED : REQUESTED) : grey ? token.colorFillQuaternary : undefined;
                    const cell = (
                      <td
                        key={c.key}
                        onClick={() => (r ? !anchor && setDetailId(r.request_id) : canPick(p) ? pick(c, p.id) : undefined)}
                        onMouseEnter={() => p.id === pickUser && anchor && setHover(c.start)}
                        style={cellStyle({ background: !r && p.id === pickUser && inSelection(c) ? token.colorPrimaryBorder : bg, cursor: r ? "pointer" : canPick(p) ? "cell" : undefined, outline: isToday ? `1px solid ${token.colorPrimary}` : undefined })}
                      />
                    );
                    const tip = r ? `${formatDate(c.start)}: ${t(`leave.statuses.${r.status}`)}${r.fraction < 1 ? ` (${formatDays(r.fraction)})` : ""}` : holiday.get(c.start);
                    return tip ? <Tooltip key={c.key} title={tip}>{cell}</Tooltip> : cell;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(!holidaysUntil || end > holidaysUntil) && <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>{t("leave.holidaysMissing", { date: holidaysUntil ? formatDate(holidaysUntil) : "—" })}</Typography.Paragraph>}
      <LeavePlannerDetail requestId={detailId} userId={userId} days={days ?? []} onClose={() => setDetailId(null)} />
      {weeks >= MAX_WEEKS && <Typography.Text type="secondary">{t("leave.planner.limit")}</Typography.Text>}
    </div>
  );
};
