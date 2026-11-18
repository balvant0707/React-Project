-- A small fixed-window rate limiter for Edge Functions that run without a session (login-help). The caller builds the
-- bucket key (a hash of the client address and the action); service_role only. The COMPASS public ticket report keeps its
-- own limiter in the tickets module.
create table public.rate_limit_buckets (
  bucket_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (bucket_key, window_start)
);
create index rate_limit_buckets_window_idx on public.rate_limit_buckets (window_start);
alter table public.rate_limit_buckets enable row level security;
create policy mfa_required on public.rate_limit_buckets as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
revoke all on public.rate_limit_buckets from anon, authenticated;
grant all on public.rate_limit_buckets to service_role;

-- Counts one request in the current window of the bucket and says whether it is still within the limit.
create function public.rate_limit_hit(p_bucket_key text, p_window_seconds integer, p_max_requests integer) returns boolean
  language plpgsql security definer set search_path to ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_window_seconds < 1 or p_max_requests < 1 then
    raise exception 'rate_limit_hit: window and maximum must be positive' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_buckets as r (bucket_key, window_start, request_count)
  values (p_bucket_key, v_window, 1)
  on conflict (bucket_key, window_start) do update set request_count = r.request_count + 1
  returning request_count into v_count;
  -- Old windows are removed now and then, not on every call.
  if random() < 0.02 then
    delete from public.rate_limit_buckets where window_start < now() - interval '2 days';
  end if;
  return v_count <= p_max_requests;
end;
$$;
alter function public.rate_limit_hit(text, integer, integer) owner to postgres;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
