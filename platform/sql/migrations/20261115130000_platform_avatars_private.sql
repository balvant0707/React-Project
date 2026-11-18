-- The avatars bucket is private (20261109170000_platform_avatars_bucket.sql); a project whose bucket existed before the
-- platform kept its old public flag because that migration inserts with `on conflict do nothing`. The frontend only reads
-- signed paths, so nothing depends on the public URL.
update storage.buckets set public = false where id = 'avatars' and public;
