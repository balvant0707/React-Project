-- The maximum-DFT trigger reads product_coefficients, which ordinary users can no longer read (20261115140000_npm_products_dft_server):
-- as a plain invoker function it would find no row for them and stop enforcing the limit. It runs as its owner now.
create or replace function public.enforce_maximum_dft_per_coat() returns trigger
  language plpgsql security definer set search_path to ''
as $$
declare
  maximum_dft numeric;
begin
  if new.dry_film_thickness_um is null or new.product_packaging_id is null then
    return new;
  end if;

  select pc.maximum_dft_per_coat_um
  into maximum_dft
  from public.product_packagings pp
  join public.product_coefficients pc on pc.product_id = pp.product_id
  where pp.id = new.product_packaging_id;

  if maximum_dft is not null and new.dry_film_thickness_um > maximum_dft then
    raise exception 'DFT % um exceeds the maximum of % um per coat for this product', new.dry_film_thickness_um, maximum_dft
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
revoke all on function public.enforce_maximum_dft_per_coat() from public, anon, authenticated;
grant execute on function public.enforce_maximum_dft_per_coat() to service_role;
