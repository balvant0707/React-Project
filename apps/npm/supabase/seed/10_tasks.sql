-- RADAR task types and task rights (plan: task types are seeds per app). Step action labels come from the frontend
-- (tasks.actions.<key>); a step without a role is worked by whoever may edit the task.

insert into public.task_types (key, name, description, default_due_days, show_on_start_page, owner_user_id) values
  ('general', 'Task', 'A plain to-do: one step, done when completed.', null, true, null),
  ('follow_up', 'Follow-up', 'Chase something by a date: a customer answer, a supplier confirmation, an offer.', 7, true, null),
  ('review', 'Task with review', 'Done by the assignee, then checked by the person who asked for it.', null, true, null);

insert into public.task_type_steps (task_type_id, step_key, step_order, name, status, assignee_kind, actions)
select tt.id, s.step_key, s.step_order, s.name, s.status, s.assignee_kind, s.actions::jsonb
from public.task_types tt
join (values
  ('general', 'work', 1, 'Work', 'open', 'role', '[{"key": "complete", "to": null}]'),
  ('follow_up', 'follow_up', 1, 'Follow up', 'open', 'role', '[{"key": "complete", "to": null}]'),
  ('review', 'work', 1, 'Work', 'open', 'task_owner', '[{"key": "send", "to": "review", "label": {"en": "Send for review", "de": "Zur Prüfung senden"}}]'),
  ('review', 'review', 2, 'Review', 'waiting_for_approval', 'requester',
   '[{"key": "approve", "to": null, "kind": "positive"}, {"key": "reject", "to": "work", "kind": "negative", "requires_comment": true}]')
) s (type_key, step_key, step_order, name, status, assignee_kind, actions) on s.type_key = tt.key;

-- Every type may be a subtask of every type.
insert into public.task_type_subtask_types (task_type_id, subtask_type_id, sort_order)
select p.id, c.id, row_number() over (partition by p.id order by c.key)
from public.task_types p cross join public.task_types c;

-- Rights: everybody works their own and their team's tasks; admins and managers all of them.
insert into public.role_permissions (role_id, permission)
select r.id, p
from public.roles r,
     unnest(array['tasks.create.created', 'tasks.create.team', 'tasks.edit.created', 'tasks.edit.assigned', 'tasks.view.team',
                  'tasks.delete.created']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission)
select r.id, p
from public.roles r,
     unnest(array['tasks.create.all', 'tasks.edit.all', 'tasks.delete.all', 'task_types.edit.all']) p
where r.name in ('Admin', 'Manager')
on conflict do nothing;

-- A new task starts as a plain "Task" (setting default_task_type_id).
update public.app_settings set value = (select id::text from public.task_types where key = 'general') where key = 'default_task_type_id';
