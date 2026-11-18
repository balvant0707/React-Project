-- Trigger helper for tables that carry updated_by_user_id. Copied 1:1 from COMPASS (public.set_updated_at_and_by); NPM had the
-- same function (it lived in the npm-base core delta until the tasks module needed it in every app).
CREATE FUNCTION public.set_updated_at_and_by() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  new.updated_by_user_id = auth.uid();
  return new;
end;
$$;
REVOKE ALL ON FUNCTION public.set_updated_at_and_by() FROM PUBLIC, anon;
