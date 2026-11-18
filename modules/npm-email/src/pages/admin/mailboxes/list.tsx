// Ported 1:1 from the NPM tool (app/src/pages/admin/mailboxes/list.tsx).
import { useCallback, useEffect, useState } from "react";
import { useTable, useModalForm } from "@rbp/core";
import { List } from "@rbp/core";
import { useDelete } from "@rbp/core";
import { Table, Button, Modal, Form, Input, Popconfirm, Radio, Select, Tag, Tooltip, App as AntdApp } from "antd";
import { PlusOutlined, DeleteOutlined, LinkOutlined } from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import { supabaseClient, SUPABASE_URL } from "@rbp/core";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { formatDate, formatDateTime } from "@rbp/ui";

type Mailbox = {
  id: string;
  address: string;
  display_name: string;
  color: string | null;
  kind: "personal" | "shared";
  owner_user_id: string | null;
  team_id: string | null;
  created_at: string;
};

// mailbox_connections' token columns are never selectable by this client
// (column-level grant, see 20260922120000_mailbox_connections.sql) - only
// the health/status fields the admin UI needs. See
// ~/npm_tool/docs/email-outbound-connection-plan.md.
type MailboxConnection = {
  mailbox_id: string;
  connected_by_user_id: string;
  status: "ok" | "error";
  last_synced_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  connected_at: string;
};

type Option = { value: string; label: string };

// Admin-only, create+delete like groups/roles (see admin/groups/list.tsx) -
// renaming/re-coloring/re-owning a mailbox is a delete+recreate for now,
// same minimal precedent those pages set.
export const MailboxList = () => {
  const { tableProps } = useTable<Mailbox>({
    resource: "mailboxes",
    syncWithLocation: true,
    pagination: { pageSize: 100 },
  });
  const { mutate: deleteMailbox } = useDelete();
  const { message } = AntdApp.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState<Option[]>([]);
  const [groups, setGroups] = useState<Option[]>([]);
  const [connections, setConnections] = useState<Record<string, MailboxConnection>>({});

  useEffect(() => {
    (async () => {
      const [userRows, { data: groupRows }] = await Promise.all([
        loadUserOptions(),
        supabaseClient.from("teams").select("id, name, oa:team_uses!left(use)").eq("oa.use", "owner_associate").is("oa", null).order("name"),
      ]);
      setUsers(userRows);
      setGroups((groupRows ?? []).map((g) => ({ value: g.id, label: g.name })));
    })();
  }, []);

  const loadConnections = useCallback(async () => {
    const { data } = await supabaseClient
      .from("mailbox_connections")
      .select("mailbox_id, connected_by_user_id, status, last_synced_at, last_error, last_error_at, connected_at");
    const byMailbox: Record<string, MailboxConnection> = {};
    for (const row of (data as MailboxConnection[]) ?? []) byMailbox[row.mailbox_id] = row;
    setConnections(byMailbox);
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Round-trips through Microsoft's consent screen (email-oauth-authorize ->
  // email-oauth-callback), which lands back here with ?connected=<mailbox_id>
  // or ?connect_error=<message> - surface it once, then drop the params so
  // a refresh doesn't re-show the toast.
  useEffect(() => {
    const connected = searchParams.get("connected");
    const connectError = searchParams.get("connect_error");
    if (!connected && !connectError) return;
    if (connected) {
      message.success("Mailbox connected");
      loadConnections();
    }
    if (connectError) message.error(`Couldn't connect mailbox: ${connectError}`);
    const next = new URLSearchParams(searchParams);
    next.delete("connected");
    next.delete("connect_error");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { modalProps, formProps, show } = useModalForm<Mailbox>({
    resource: "mailboxes",
    action: "create",
  });

  const kind = Form.useWatch("kind", formProps.form) as Mailbox["kind"] | undefined;

  const optionLabel = (options: Option[], id: string | null) => options.find((o) => o.value === id)?.label ?? id;

  const connectMailbox = async (mailboxId: string) => {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      message.error("Not signed in");
      return;
    }
    // A real form navigation (Microsoft's consent screen needs the browser); POST keeps the token out of the URL.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${SUPABASE_URL}/functions/v1/email-oauth-authorize`;
    for (const [name, value] of Object.entries({ mailbox_id: mailboxId, token })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <List
      title="Mailboxes"
      headerButtons={
        <Button icon={<PlusOutlined />} type="primary" onClick={() => show()}>
          New mailbox
        </Button>
      }
    >
      <Table {...tableProps} rowKey="id">
        <Table.Column
          dataIndex="display_name"
          title="Name"
          render={(value: string, record: Mailbox) => (
            <>
              {record.color && <Tag color={record.color} style={{ marginRight: 8 }}>&nbsp;</Tag>}
              {value}
            </>
          )}
        />
        <Table.Column dataIndex="address" title="Address" />
        <Table.Column
          dataIndex="kind"
          title="Kind"
          render={(value: Mailbox["kind"]) => (value === "shared" ? "Shared" : "Personal")}
        />
        <Table.Column
          title="Owner / Group"
          render={(_, record: Mailbox) =>
            record.kind === "personal" ? optionLabel(users, record.owner_user_id) : optionLabel(groups, record.team_id)
          }
        />
        <Table.Column
          title="Connected via"
          render={(_, record: Mailbox) => {
            const c = connections[record.id];
            if (!c) return <Tag>Not connected</Tag>;
            const connectedByName = optionLabel(users, c.connected_by_user_id) ?? c.connected_by_user_id;
            if (c.status === "error") {
              return (
                <Tooltip title={c.last_error ? `${c.last_error} (${formatDateTime(c.last_error_at)})` : "Connection needs reconnecting"}>
                  <Tag color="error">Needs reconnecting - {connectedByName}</Tag>
                </Tooltip>
              );
            }
            return (
              <Tooltip title={`Last synced ${formatDateTime(c.last_synced_at)}`}>
                <Tag color="success">OK - {connectedByName}</Tag>
              </Tooltip>
            );
          }}
        />
        <Table.Column dataIndex="created_at" title="Created" render={formatDate} />
        <Table.Column
          title="Actions"
          render={(_, record: Mailbox) => {
            const c = connections[record.id];
            return (
              <>
                <Button
                  icon={<LinkOutlined />}
                  onClick={() => connectMailbox(record.id)}
                  style={{ marginRight: 8 }}
                >
                  {c ? "Reconnect" : "Connect"}
                </Button>
                <Popconfirm
                  title="Delete this mailbox?"
                  description="Threads already in it are removed too - only delete an empty or retired mailbox."
                  onConfirm={() => deleteMailbox({ resource: "mailboxes", id: record.id, meta: { select: "*" } })}
                >
                  <Button icon={<DeleteOutlined />} danger />
                </Popconfirm>
              </>
            );
          }}
        />
      </Table>

      <Modal {...modalProps} title="New mailbox">
        <Form {...formProps} layout="vertical" initialValues={{ kind: "shared" }}>
          <Form.Item
            label="Display name"
            name="display_name"
            rules={[{ required: true, message: "Display name is required" }]}
          >
            <Input placeholder="e.g. Sales" />
          </Form.Item>
          <Form.Item
            label="Address"
            name="address"
            rules={[{ required: true, message: "Address is required" }]}
          >
            <Input placeholder="e.g. sales@nipponpaint-marine.eu" />
          </Form.Item>
          <Form.Item label="Color tag" name="color">
            <Input type="color" style={{ width: 64, padding: 2 }} />
          </Form.Item>
          <Form.Item label="Kind" name="kind" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              options={[
                { label: "Shared", value: "shared" },
                { label: "Personal", value: "personal" },
              ]}
              onChange={() => formProps.form?.setFieldsValue({ owner_user_id: undefined, team_id: undefined })}
            />
          </Form.Item>
          {kind === "personal" ? (
            <Form.Item
              label="Owner"
              name="owner_user_id"
              rules={[{ required: true, message: "Personal mailboxes need an owner" }]}
            >
              <Select options={users} showSearch optionFilterProp="label" />
            </Form.Item>
          ) : (
            <Form.Item
              label="Group"
              name="team_id"
              rules={[{ required: true, message: "Shared mailboxes need a group" }]}
            >
              <Select options={groups} showSearch optionFilterProp="label" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </List>
  );
};
