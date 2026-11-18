// Ported 1:1 from the NPM tool (app/src/components/emailThreadLinks.tsx).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp, Button, Modal, Radio, Select, Space, Tag } from "antd";
import { LinkOutlined, PlusOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { errorText } from "@rbp/core";

// The records an email thread belongs to (email_thread_entity_links) as chips that open the record, with add / remove.
// Offers and orders share a conversation (their Emails tab lists every thread of the offer and its orders), so
// linking a thread to an offer is enough to see it on the offer's orders as well.

type LinkRow = { entity_type: string; entity_id: string; label: string };

const KIND = { specifications: { label: "Offer", path: "/specifications/" }, orders: { label: "Order", path: "/orders/" } } as const;

async function labelsFor(rows: { entity_type: string; entity_id: string }[]): Promise<LinkRow[]> {
  const ids = (type: string) => rows.filter((r) => r.entity_type === type).map((r) => r.entity_id);
  const [specs, orders] = await Promise.all([
    ids("specifications").length
      ? supabaseClient.from("specifications").select("id, specification_number, version").in("id", ids("specifications"))
      : Promise.resolve({ data: [] as any[] }),
    ids("orders").length ? supabaseClient.from("orders").select("id, order_number").in("id", ids("orders")) : Promise.resolve({ data: [] as any[] }),
  ]);
  const names = new Map<string, string>();
  for (const s of (specs.data ?? []) as any[]) names.set(s.id, `${s.specification_number} v${s.version}`);
  for (const o of (orders.data ?? []) as any[]) names.set(o.id, o.order_number);
  return rows.map((r) => ({ ...r, label: names.get(r.entity_id) ?? r.entity_id.slice(0, 8) }));
}

export function EmailThreadLinks({ threadId }: { threadId: string }) {
  const { message } = AntdApp.useApp();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"specifications" | "orders">("specifications");
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [picked, setPicked] = useState<string | undefined>();

  const load = useCallback(async () => {
    const { data } = await supabaseClient.from("email_thread_entity_links").select("entity_type, entity_id").eq("email_thread_id", threadId);
    setLinks(await labelsFor((data as any[]) ?? []));
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const search = async (term: string, type = kind) => {
    const query =
      type === "orders"
        ? supabaseClient.from("orders").select("id, order_number").order("order_number", { ascending: false })
        : supabaseClient.from("specifications").select("id, specification_number, version").order("specification_number", { ascending: false });
    const filtered = term.trim() ? query.ilike(type === "orders" ? "order_number" : "specification_number", `%${term.trim()}%`) : query;
    const { data } = await filtered.limit(20);
    setOptions(
      ((data as any[]) ?? []).map((r) => ({ value: r.id, label: type === "orders" ? r.order_number : `${r.specification_number} v${r.version}` })),
    );
  };

  const add = async () => {
    if (!picked) return;
    const { error } = await supabaseClient.from("email_thread_entity_links").insert({ email_thread_id: threadId, entity_type: kind, entity_id: picked });
    if (error) {
      message.error(errorText(error));
      return;
    }
    setAdding(false);
    setPicked(undefined);
    load();
  };

  const remove = async (l: LinkRow) => {
    const { error } = await supabaseClient
      .from("email_thread_entity_links")
      .delete()
      .eq("email_thread_id", threadId)
      .eq("entity_type", l.entity_type)
      .eq("entity_id", l.entity_id);
    if (error) message.error(errorText(error));
    else load();
  };

  return (
    <Space size={[4, 4]} wrap>
      {links.map((l) => {
        const k = KIND[l.entity_type as keyof typeof KIND];
        return (
          <Tag key={`${l.entity_type}:${l.entity_id}`} icon={<LinkOutlined />} closable onClose={(e) => { e.preventDefault(); remove(l); }}>
            {k ? <Link to={`${k.path}${l.entity_id}`}>{k.label} {l.label}</Link> : l.label}
          </Tag>
        );
      })}
      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => { setAdding(true); search(""); }}>
        Link record
      </Button>
      <Modal open={adding} title="Link this conversation to a record" onCancel={() => setAdding(false)} onOk={add} okText="Link" okButtonProps={{ disabled: !picked }}>
        <Radio.Group
          value={kind}
          onChange={(e) => { setKind(e.target.value); setPicked(undefined); search("", e.target.value); }}
          options={[{ value: "specifications", label: "Offer" }, { value: "orders", label: "Order" }]}
          optionType="button"
          style={{ marginBottom: 12 }}
        />
        <Select showSearch filterOption={false} onSearch={(t) => search(t)} options={options} value={picked} onChange={setPicked} style={{ width: "100%" }} placeholder="Search by number" />
      </Modal>
    </Space>
  );
}
