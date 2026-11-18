-- The task notifications COMPASS mails in its daily digest (email_notification_types): flagged in the platform registry
-- (platform email digest, 20261110195000).
select public.notification_types_set_email(array['task_assigned', 'task_step_changed', 'task_forwarded']);
