-- Platform core: the private bucket for profile photos. The object key is "<user id>/avatar" (a re-upload replaces the old
-- photo); users.photo_url holds that path and the frontend signs it. Who may write: the person themself with the literal
-- users.photo.own (the column itself is guarded by restrict_user_self_update), and everybody who manages users.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Read avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy "Write own avatar" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.rls_has('users.photo.own')))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.rls_has('users.photo.own')));

create policy "Manage avatars" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (select public.can_manage_users()))
  with check (bucket_id = 'avatars' and (select public.can_manage_users()));
