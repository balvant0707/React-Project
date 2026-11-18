-- The platform's mails (daily digest, test mail, login mails) can leave through a Microsoft 365 mailbox, as NPM's own
-- digest did (send-system-email): transport 'graph', Edge Function mail-transport-graph, settings
-- email_settings.transport_config = {"mailbox_id": "<mailboxes.id>"} (picked on Admin > Configuration > Email).
select public.email_transport_register('graph', 'Microsoft 365 mailbox (Graph)', 'npm-email', 10);
