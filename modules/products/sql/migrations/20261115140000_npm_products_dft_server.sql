-- The DFT proposal is calculated on the server; the coefficient master data (product_coefficients, coefficient_curves,
-- coefficient_points) is no longer readable by ordinary users, only managed by admins (the policies "Only admins manage ..."
-- already cover reading for them). Before, every signed-in user could read the polishing rates, derates and curves.
--   * dft_proposal(...)   the DFT of one coat line, the same calculation as the former client code (dftProposal.ts)
--   * product_max_dft(..) the maximum DFT per coat of products (a product limit the area editor checks against)

drop policy if exists "Authenticated users can read product coefficients" on public.product_coefficients;
drop policy if exists "Authenticated users can read coefficient curves" on public.coefficient_curves;
drop policy if exists "Authenticated users can read coefficient points" on public.coefficient_points;

-- Value of a curve at x: linear between the two nearest points, clamped to the end points (null: no such curve / no points).
create function public.dft_curve_value(p_curve_id uuid, p_x double precision) returns double precision
  language plpgsql stable security definer set search_path to ''
as $$
declare
  lo_x double precision; lo_c double precision; hi_x double precision; hi_c double precision;
begin
  if p_curve_id is null or p_x is null then return null; end if;
  select x_value, coefficient into lo_x, lo_c from public.coefficient_points where curve_id = p_curve_id and x_value <= p_x order by x_value desc limit 1;
  select x_value, coefficient into hi_x, hi_c from public.coefficient_points where curve_id = p_curve_id and x_value >= p_x order by x_value asc limit 1;
  if lo_x is null then return hi_c; end if;
  if hi_x is null or hi_x = lo_x then return lo_c; end if;
  return lo_c + (p_x - lo_x) / (hi_x - lo_x) * (hi_c - lo_c);
end;
$$;
revoke all on function public.dft_curve_value(uuid, double precision) from public, anon, authenticated;
grant execute on function public.dft_curve_value(uuid, double precision) to service_role;

-- The DFT for a coat line of a packaging's product, in um, or null when the product has no coefficients or an input is missing
-- (the caller then uses the product's own default). p_location: 'vertical' | 'flat_bottom' | 'boottop'. p_prior_coats: coat lines of
-- the same product directly above this one: every coat but the last gets the maximum per coat, the last the rest.
create function public.dft_proposal(
  p_packaging_id uuid, p_speed double precision, p_temperature double precision, p_activity_days double precision,
  p_service_months double precision, p_location text default 'vertical', p_prior_coats integer default 0
) returns double precision
  language plpgsql stable security definer set search_path to ''
as $$
declare
  c public.product_coefficients;
  speed_c double precision; temp_c double precision; sea_days double precision; anchoring double precision;
  derate double precision; total double precision; coats integer;
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_speed is null or p_temperature is null or p_activity_days is null or p_service_months is null then return null; end if;
  select pc.* into c from public.product_packagings pp join public.product_coefficients pc on pc.product_id = pp.product_id where pp.id = p_packaging_id;
  if not found or c.polishing_rate is null or c.maximum_dft_per_coat_um is null or c.maximum_dft_per_coat_um <= 0 then return null; end if;
  speed_c := public.dft_curve_value(c.speed_curve_id, p_speed);
  temp_c := public.dft_curve_value(c.temperature_curve_id, p_temperature);
  if speed_c is null or temp_c is null then return null; end if;

  sea_days := ceil(p_activity_days / 275 * 100) / 100;
  anchoring := case when c.anchoring_dft_um is not null and c.anchoring_sea_days_threshold is not null and p_activity_days < c.anchoring_sea_days_threshold
                    then c.anchoring_dft_um else 0 end;
  derate := case p_location when 'flat_bottom' then coalesce(c.flat_bottom_derate_pct, 100) when 'boottop' then coalesce(c.boottop_derate_pct, 100) else 100 end;
  total := floor((c.polishing_rate * speed_c * temp_c * sea_days * p_service_months + anchoring) * (derate / 100) / 5 + 0.5) * 5;
  if c.minimum_dft_um is not null then total := greatest(total, c.minimum_dft_um); end if;

  coats := greatest(1, ceil(total / c.maximum_dft_per_coat_um));
  if p_prior_coats + 1 > coats then return null; end if;
  if p_prior_coats + 1 < coats then return c.maximum_dft_per_coat_um; end if;
  return total - (coats - 1) * c.maximum_dft_per_coat_um;
end;
$$;
revoke all on function public.dft_proposal(uuid, double precision, double precision, double precision, double precision, text, integer) from public, anon;
grant execute on function public.dft_proposal(uuid, double precision, double precision, double precision, double precision, text, integer) to authenticated, service_role;

create function public.product_max_dft(p_product_ids uuid[]) returns table (product_id uuid, maximum_dft_per_coat_um numeric)
  language sql stable security definer set search_path to ''
as $$
  select pc.product_id, pc.maximum_dft_per_coat_um from public.product_coefficients pc
  where pc.product_id = any (p_product_ids) and pc.maximum_dft_per_coat_um is not null and (select auth.uid()) is not null
$$;
revoke all on function public.product_max_dft(uuid[]) from public, anon;
grant execute on function public.product_max_dft(uuid[]) to authenticated, service_role;
