import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { App as AntdApp, Button, Result, Spin, Typography, theme } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { errorText, supabaseClient } from "@rbp/core";
import { DEFAULT_TICKET_QUEUE_ICON, IconTile, iconFor } from "@rbp/ui";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { AssetSelect } from "@rbp/module-task-family/src/components/assetSelect.tsx";
import { useTicketQueues, type TicketTypeRow } from "@rbp/module-task-family/src/hooks/useTicketQueues.ts";
import { BigChoice } from "../../components/bigChoice";
import { createTicket } from "../../lib/createTicket";

// Andon kiosk board for a shopfloor PC (platform, new; docs/andon.md). Signed in as the PC's device user, without the shell. The
// station is the address: /andon?asset=<asset id> (optionally &queue=<queue key>; a device user who may report in one queue needs
// neither). One tap on a type raises the call through the same createTicket as the ticket form; the strip on top is the on-screen
// light: red = somebody waits for help, amber = somebody is on it, green = no open call. It stays until the ticket is resolved.
type Call = { id: string; ticket_number: number; queue_id: string; type: string; priority: string; status: string; acknowledged_at: string | null };

export const AndonKiosk = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const assetId = params.get("asset");
  const queueKey = params.get("queue");
  const { creatable, typesOf } = useTicketQueues();
  const [pickedQueue, setPickedQueue] = useState<string>();
  const [busy, setBusy] = useState(false);

  const queue = creatable.find((q) => (queueKey ? q.key === queueKey : pickedQueue ? q.id === pickedQueue : creatable.length === 1));
  const types = typesOf(queue?.id);

  const { data: asset } = useQuery({
    queryKey: ["kiosk-asset", assetId],
    enabled: !!assetId,
    queryFn: async () => (await supabaseClient.from("assets").select("id, name").eq("id", assetId!).maybeSingle()).data as { id: string; name: string } | null,
  });
  // The open calls of the station, refreshed every few seconds (the status banner of the app covers a dropped connection).
  const { data: calls = [] } = useQuery({
    queryKey: ["kiosk-calls", assetId],
    enabled: !!assetId,
    refetchInterval: 8000,
    queryFn: async () =>
      ((await supabaseClient
        .from("tickets_overview")
        .select("id, ticket_number, queue_id, type, priority, status, acknowledged_at")
        .eq("asset_id", assetId!)
        .not("status", "in", "(resolved,closed)")
        .order("created_at")).data ?? []) as Call[],
  });

  const raise = async (type: TicketTypeRow) => {
    if (!queue || !assetId || busy) return;
    setBusy(true);
    try {
      const ticket = await createTicket({ queueId: queue.id, type: type.key, assetId, title: localName(type), priority: type.default_priority ?? "normal" });
      message.success(t("kiosk.raised", { number: ticket.ticket_number }));
      await queryClient.invalidateQueries({ queryKey: ["kiosk-calls", assetId] });
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const waiting = calls.some((c) => !c.acknowledged_at);
  const light = !calls.length ? { color: token.colorSuccess, text: t("kiosk.noCalls") } : { color: waiting ? token.colorError : token.colorWarning, text: t("kiosk.openCalls", { count: calls.length }) };

  return (
    <div style={{ minHeight: "100vh", background: token.colorBgLayout, padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Typography.Title level={2} style={{ marginTop: 0 }}>
          {asset?.name ?? t("kiosk.title")}
        </Typography.Title>

        {!assetId && (
          <>
            <Typography.Paragraph>{t("kiosk.pickStation")}</Typography.Paragraph>
            <AssetSelect onChange={(v) => v && setParams({ ...(queueKey ? { queue: queueKey } : {}), asset: v })} style={{ minWidth: 320 }} />
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>{t("kiosk.pickStationHint")}</Typography.Paragraph>
          </>
        )}

        {assetId && (
          <>
            <div style={{ background: light.color, color: "#fff", fontSize: 28, fontWeight: 600, padding: "20px 24px", borderRadius: 8, marginBottom: 24 }}>
              {light.text}
              {calls.length > 0 && <span style={{ fontSize: 18, fontWeight: 400, marginLeft: 16 }}>{waiting ? t("kiosk.waiting") : t("kiosk.acknowledged")}</span>}
            </div>

            {!creatable.length && <Spin />}
            {creatable.length > 0 && !queue && (
              creatable.length > 0 && (queueKey || pickedQueue) ? (
                <Result status="warning" title={t("kiosk.noQueue")} />
              ) : (
                <BigChoice
                  choices={creatable.map((q) => ({ key: q.id, label: localName(q), icon: <IconTile icon={iconFor(q.icon, DEFAULT_TICKET_QUEUE_ICON)} color={q.color} size={40} /> }))}
                  onPick={setPickedQueue}
                  minWidth={240}
                  height={110}
                  fontSize={22}
                />
              )
            )}
            {queue && (
              <>
                <BigChoice
                  choices={types.map((x) => {
                    const call = calls.find((c) => c.queue_id === queue.id && c.type === x.key);
                    return {
                      key: x.key,
                      label: localName(x),
                      accent: x.default_priority,
                      // The type already has an open call here: no second ticket for it.
                      disabled: busy || !!call,
                      note: call ? `#${call.ticket_number} · ${call.acknowledged_at ? t("kiosk.acknowledged") : t("kiosk.waiting")}` : undefined,
                    };
                  })}
                  onPick={(key) => {
                    const type = types.find((x) => x.key === key);
                    if (type) void raise(type);
                  }}
                  minWidth={240}
                  height={120}
                  fontSize={24}
                />
                {creatable.length > 1 && !queueKey && (
                  <Button type="link" style={{ paddingLeft: 0, marginTop: 16 }} onClick={() => setPickedQueue(undefined)}>
                    {t("common.back")}
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
