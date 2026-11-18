// Admin > Configuration > Email, transport "Microsoft 365 mailbox (Graph)": the sender mailbox of the platform's mails
// (slot "admin.email.transport" of the core page; stored as email_settings.transport_config.mailbox_id). Replaces NPM's
// own "Email delivery" page (pages/admin/emailDelivery), whose sender mailbox picker this is.
import { Form, Select } from 'antd';
import { useEffect, useState } from 'react';
import { supabaseClient } from '@rbp/core';

export const GraphTransportFields = ({ transport }: { transport?: string }) => {
  const [mailboxes, setMailboxes] = useState<{ id: string; address: string; display_name: string }[] | null>(null);
  const isLoading = transport === 'graph' && mailboxes === null;
  useEffect(() => {
    if (transport !== 'graph' || mailboxes) return;
    void supabaseClient.from('mailboxes').select('id, address, display_name').order('display_name').then(({ data }) => setMailboxes(data ?? []));
  }, [transport, mailboxes]);
  if (transport !== 'graph') return null;
  return (
    <Form.Item
      name={['transport_config', 'mailbox_id']}
      label="Sender mailbox"
      style={{ width: 420 }}
      rules={[{ required: true, message: 'Pick the mailbox the mails are sent from' }]}
      extra="The mails go out from this mailbox through its Microsoft 365 connection (Admin > Configuration > Mailboxes)."
    >
      <Select loading={isLoading} options={(mailboxes ?? []).map((m) => ({ value: m.id, label: `${m.display_name} <${m.address}>` }))} />
    </Form.Item>
  );
};
