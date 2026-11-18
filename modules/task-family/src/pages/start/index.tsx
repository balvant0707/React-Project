// Ported 1:1 from COMPASS (app/src/pages/start/index.tsx).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { List } from "@rbp/core";
import { TaskFormModal, useTaskTypes } from "../tasks/taskForm";
import { localName, taskTypeShortDescription } from "@rbp/module-tasks/src/lib/masterData.ts";
import { usePermissions } from "@rbp/core";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { OfferTiles, type Offer } from "../../components/offerTiles";
import { useTicketQueues } from "../../hooks/useTicketQueues";
import { useRecordSlot } from "@rbp/core";

// Platform: the permission modules of the task family come from the permissions registry (COMPASS: permissions.json).
const useTaskFamilyModules = () =>
  useQuery({
    queryKey: ["task-family-permission-modules"],
    staleTime: 5 * 60_000,
    queryFn: async () => new Set(((await supabaseClient.from("permissions").select("module").eq("task_family", true)).data ?? []).map((r: { module: string }) => r.module)),
  }).data ?? new Set<string>();

// The start page: the task types a user may start and an admin put on this page, with a search over name, short
// description and keywords. Who sees a type follows the same rules as everywhere else (role_task_types through
// useTaskTypes(…, forCreate), plus a create right of the type's permission module); show_on_start_page only promotes.
export const StartPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: types, isLoading } = useTaskTypes(true, true);
  const { hasAny, admin, ready } = usePermissions();
  const [startTypeId, setStartTypeId] = useState<string | null>(null);
  const [ticketQueueId, setTicketQueueId] = useState<string | null>(null);
  const { creatable: queues } = useTicketQueues();
  const TASK_FAMILY = useTaskFamilyModules();
  // Platform: the ticket form comes from the tickets module (slot task-family.start.ticketForm).
  const TicketFormModal = useRecordSlot("task-family.start.ticketForm")[0]?.Component;

  const offered: Offer[] = [
    ...(types ?? [])
      .filter((x) => x.show_on_start_page && hasAny(`${TASK_FAMILY.has(x.key) ? x.key : "tasks"}.create`))
      .map((x): Offer => ({ kind: "task", id: x.id, name: x.name, keywords: x.keywords, icon: x.icon, color: x.color, label: localName(x), summary: taskTypeShortDescription(t, x) })),
    // Every ticket queue the user may report in is a card too (the database checks again on insert).
    ...queues.map((q): Offer => ({ kind: "ticket", id: q.id, name: q.name, keywords: `ticket ${t("tickets.new")}`, icon: q.icon, color: q.color, label: localName(q), summary: q.description })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  const open = (x: Offer) => (x.kind === "ticket" ? setTicketQueueId(x.id) : setStartTypeId(x.id));

  return (
    <List title={t("start.title")} headerButtons={admin ? <Link to="/admin/task-types">{t("start.configure")}</Link> : null}>
      <OfferTiles
        offers={offered}
        loading={isLoading || !ready}
        placeholder={t("start.searchPlaceholder")}
        emptyText={t("start.nothingOffered")}
        noMatchText={t("start.noMatch")}
        caption={(x) => (x.kind === "ticket" ? t("start.ticketCaption") : null)}
        onPick={open}
      />
      {TicketFormModal && <TicketFormModal
        open={ticketQueueId !== null}
        queueId={ticketQueueId ?? undefined}
        onClose={() => setTicketQueueId(null)}
        onSaved={(id: string) => {
          setTicketQueueId(null);
          navigate(`/tickets/${id}`);
        }}
      />}
      <TaskFormModal
        open={startTypeId !== null}
        fixedTypeId={startTypeId ?? undefined}
        onClose={() => setStartTypeId(null)}
        onSaved={(id) => {
          setStartTypeId(null);
          navigate(`/tasks/${id}`);
        }}
      />
    </List>
  );
};
