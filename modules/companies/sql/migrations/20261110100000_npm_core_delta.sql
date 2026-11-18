-- NPM core delta.
-- Adds what the NPM modules need from the core and does not change what COMPASS uses:
--   * teams.kind + owner_associate_teams: NPM's "tenants" (selling entities, UI name "Owner Associate") are teams of the kind
--     'owner_associate'. The extension row holds the link to the company (FK added with the companies module).
--   * countries (reference data used by companies, products, hull events, offers). Ports moved to the offers module (their only user)
--     on 2026-11-13 (20261110100100_npm_ports.sql there); the content role "Sales Admin" and sales_admin_grant() are gone
--     (operational roles are created when the people move to the platform).
--   Moved from the npm-base module to companies on 2026-11-13.
alter table public.teams add column kind text check (kind is null or kind ~ '^[a-z][a-z_]*$');
create index teams_kind_idx on public.teams (kind) where kind is not null;

create table public.owner_associate_teams (
  team_id uuid primary key references public.teams(id) on delete cascade,
  company_id uuid,
  short_code text not null check (btrim(short_code) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index owner_associate_teams_short_code_key on public.owner_associate_teams (lower(short_code));
create unique index owner_associate_teams_company_key on public.owner_associate_teams (company_id) where company_id is not null;
alter table public.owner_associate_teams enable row level security;
create policy "Read owner associates" on public.owner_associate_teams for select to authenticated using (true);
create policy "Team managers manage owner associates" on public.owner_associate_teams for all to authenticated
  using ((select public.can_manage_teams())) with check ((select public.can_manage_teams()));
create policy mfa_required on public.owner_associate_teams as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
create trigger set_updated_at before update on public.owner_associate_teams for each row execute function public.set_updated_at();
grant select on public.owner_associate_teams to authenticated;
grant insert, update, delete on public.owner_associate_teams to authenticated;
grant all on public.owner_associate_teams to service_role;

-- A team of kind owner_associate always has an extension row; the other way round the row forces the kind.
create function public.owner_associate_set_kind() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  update public.teams set kind = 'owner_associate' where id = new.team_id and kind is distinct from 'owner_associate';
  return new;
end; $$;
create trigger owner_associate_set_kind after insert on public.owner_associate_teams
  for each row execute function public.owner_associate_set_kind();
revoke all on function public.owner_associate_set_kind() from public, anon, authenticated;

-- Creates the team and its extension in one call (the NPM create_tenant(), now without the company side: the companies module
-- adds the company handling around it).
create function public.owner_associate_create(p_name text, p_short_code text default null, p_company_id uuid default null) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_name text := btrim(p_name);
begin
  if not (select public.can_manage_teams()) then
    raise exception 'Not allowed to manage teams' using errcode = '42501';
  end if;
  if nullif(v_name, '') is null then raise exception 'An owner associate needs a name'; end if;
  insert into public.teams (name, kind, created_by_user_id) values (v_name, 'owner_associate', auth.uid()) returning id into v_id;
  insert into public.owner_associate_teams (team_id, company_id, short_code) values (v_id, p_company_id, coalesce(nullif(btrim(p_short_code), ''), v_name));
  return v_id;
end; $$;
revoke all on function public.owner_associate_create(text, text, uuid) from public, anon;
grant execute on function public.owner_associate_create(text, text, uuid) to authenticated, service_role;

-- New records start with the creator's default owner associate (NPM default_tenant_of_creator, column name is a parameter).
create function public.default_team_of_creator() returns trigger
  language plpgsql security definer set search_path to '' as $$
declare v_col text := tg_argv[0]; v_cur uuid;
begin
  v_cur := nullif(to_jsonb(new) ->> v_col, '')::uuid;
  if v_cur is null then
    select u.default_team_id into v_cur from public.users u where u.id = auth.uid();
    if v_cur is not null then new := jsonb_populate_record(new, jsonb_build_object(v_col, v_cur)); end if;
  end if;
  return new;
end; $$;
revoke all on function public.default_team_of_creator() from public, anon;

-- set_updated_at_and_by() is a platform function (platform/sql/migrations/20261109190500_platform_set_updated_at_and_by.sql).

-- Countries (copied from NPM).
create table public.countries (
  id uuid primary key default public.uuid_generate_v7(),
  iso3 text not null unique,
  name_en text not null,
  team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  region text check (region = any (array['EUX','GRE','MET'])),
  continent text check (continent = any (array['Europe','Asia','Middle East','Africa','North America','South America','Oceania']))
);
comment on column public.countries.region is 'Sales territory region. EUX = Europe excl. Greece (the whole continent, not just EU members, excl. Russia). GRE = Greece. MET = Middle East + Turkey + Egypt. Null = no region assigned.';
create index countries_team_id_idx on public.countries (team_id);
alter table public.countries enable row level security;
create policy "Authenticated users can read countries" on public.countries for select to authenticated using (true);
create policy "Team managers manage countries" on public.countries for all to authenticated
  using ((select public.can_manage_teams())) with check ((select public.can_manage_teams()));
create policy mfa_required on public.countries as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
create trigger set_updated_at before update on public.countries for each row execute function public.set_updated_at();
grant select on public.countries to authenticated;
grant insert, update, delete on public.countries to authenticated;
grant all on public.countries to service_role;



-- Reference data: countries (from the NPM seed).
insert into public.countries (iso3, name_en, region, continent) values ('AFG','Afghanistan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('AGO','Angola',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('ALB','Albania','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('AND','Andorra','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('ARE','United Arab Emirates','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('ARG','Argentina',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('ARM','Armenia',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('ATG','Antigua and Barbuda',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('AUS','Australia',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('AUT','Austria','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('AZE','Azerbaijan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('BDI','Burundi',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('BEL','Belgium','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('BEN','Benin',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('BFA','Burkina Faso',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('BGD','Bangladesh',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('BGR','Bulgaria','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('BHR','Bahrain','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('BHS','Bahamas',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('BIH','Bosnia and Herzegovina','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('BLR','Belarus','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('BLZ','Belize',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('BMU','Bermuda',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('BOL','Bolivia',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('BRA','Brazil',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('BRB','Barbados',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('BRN','Brunei Darussalam',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('BTN','Bhutan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('BWA','Botswana',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('CAF','Central African Republic',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('CAN','Canada',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('CHE','Switzerland','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('CHL','Chile',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('CHN','China',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('CIV','Cote d''Ivoire',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('CMR','Cameroon',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('COD','Congo (Democratic Republic of the)',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('COG','Congo',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('COL','Colombia',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('COM','Comoros',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('CPV','Cabo Verde',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('CRI','Costa Rica',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('CUB','Cuba',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('CYP','Cyprus','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('CZE','Czechia','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('DEU','Germany','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('DJI','Djibouti',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('DMA','Dominica',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('DNK','Denmark','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('DOM','Dominican Republic',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('DZA','Algeria',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('ECU','Ecuador',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('EGY','Egypt','MET','Africa');
insert into public.countries (iso3, name_en, region, continent) values ('ERI','Eritrea',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('ESH','Western Sahara',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('ESP','Spain','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('EST','Estonia','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('ETH','Ethiopia',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('FIN','Finland','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('FJI','Fiji',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('FLK','Falkland Islands',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('FRA','France','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('FRO','Faroe Islands','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('FSM','Micronesia (Federated States of)',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('GAB','Gabon',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('GBR','United Kingdom','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('GEO','Georgia',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('GGY','Guernsey','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('GHA','Ghana',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('GIB','Gibraltar','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('GIN','Guinea',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('GMB','Gambia',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('GNB','Guinea-Bissau',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('GNQ','Equatorial Guinea',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('GRC','Greece','GRE','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('GRD','Grenada',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('GRL','Greenland',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('GTM','Guatemala',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('GUM','Guam',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('GUY','Guyana',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('HKG','Hong Kong',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('HND','Honduras',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('HRV','Croatia','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('HTI','Haiti',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('HUN','Hungary','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('IDN','Indonesia',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('IMN','Isle of Man','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('IND','India',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('IRL','Ireland','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('IRN','Iran','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('IRQ','Iraq','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('ISL','Iceland','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('ISR','Israel','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('ITA','Italy','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('JAM','Jamaica',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('JEY','Jersey','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('JOR','Jordan','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('JPN','Japan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('KAZ','Kazakhstan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('KEN','Kenya',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('KGZ','Kyrgyzstan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('KHM','Cambodia',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('KIR','Kiribati',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('KNA','Saint Kitts and Nevis',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('KOR','Korea (Republic of)',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('KWT','Kuwait','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('LAO','Lao People''s Democratic Republic',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('LBN','Lebanon','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('LBR','Liberia',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('LBY','Libya',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('LCA','Saint Lucia',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('LIE','Liechtenstein','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('LKA','Sri Lanka',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('LSO','Lesotho',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('LTU','Lithuania','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('LUX','Luxembourg','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('LVA','Latvia','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('MAC','Macao',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('MAR','Morocco',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('MCO','Monaco','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('MDA','Moldova','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('MDG','Madagascar',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('MDV','Maldives',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('MEX','Mexico',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('MHL','Marshall Islands',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('MKD','North Macedonia','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('MLI','Mali',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('MLT','Malta','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('MMR','Myanmar',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('MNE','Montenegro','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('MNG','Mongolia',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('MOZ','Mozambique',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('MRT','Mauritania',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('MUS','Mauritius',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('MWI','Malawi',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('MYS','Malaysia',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('NAM','Namibia',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('NCL','New Caledonia',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('NER','Niger',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('NGA','Nigeria',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('NIC','Nicaragua',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('NLD','Netherlands','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('NOR','Norway','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('NPL','Nepal',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('NRU','Nauru',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('NZL','New Zealand',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('OMN','Oman','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('PAK','Pakistan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('PAN','Panama',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('PER','Peru',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('PHL','Philippines',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('PLW','Palau',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('PNG','Papua New Guinea',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('POL','Poland','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('PRI','Puerto Rico',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('PRK','Korea (Democratic People''s Republic of)',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('PRT','Portugal','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('PRY','Paraguay',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('PSE','Palestine','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('PYF','French Polynesia',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('QAT','Qatar','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('ROU','Romania','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('RUS','Russian Federation',null,'Europe');
insert into public.countries (iso3, name_en, region, continent) values ('RWA','Rwanda',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('SAU','Saudi Arabia','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('SDN','Sudan',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('SEN','Senegal',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('SGP','Singapore',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('SLB','Solomon Islands',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('SLE','Sierra Leone',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('SLV','El Salvador',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('SMR','San Marino','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('SOM','Somalia',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('SRB','Serbia','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('SSD','South Sudan',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('STP','Sao Tome and Principe',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('SUR','Suriname',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('SVK','Slovakia','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('SVN','Slovenia','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('SWE','Sweden','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('SWZ','Eswatini',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('SYC','Seychelles',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('SYR','Syrian Arab Republic','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('TCD','Chad',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('TGO','Togo',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('THA','Thailand',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('TJK','Tajikistan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('TKM','Turkmenistan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('TLS','Timor-Leste',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('TON','Tonga',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('TTO','Trinidad and Tobago',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('TUN','Tunisia',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('TUR','Turkey','MET','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('TUV','Tuvalu',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('TWN','Taiwan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('TZA','Tanzania',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('UGA','Uganda',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('UKR','Ukraine','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('URY','Uruguay',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('USA','United States of America',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('UZB','Uzbekistan',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('VAT','Holy See','EUX','Europe');
insert into public.countries (iso3, name_en, region, continent) values ('VCT','Saint Vincent and the Grenadines',null,'North America');
insert into public.countries (iso3, name_en, region, continent) values ('VEN','Venezuela',null,'South America');
insert into public.countries (iso3, name_en, region, continent) values ('VNM','Viet Nam',null,'Asia');
insert into public.countries (iso3, name_en, region, continent) values ('VUT','Vanuatu',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('WSM','Samoa',null,'Oceania');
insert into public.countries (iso3, name_en, region, continent) values ('YEM','Yemen','MET','Middle East');
insert into public.countries (iso3, name_en, region, continent) values ('ZAF','South Africa',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('ZMB','Zambia',null,'Africa');
insert into public.countries (iso3, name_en, region, continent) values ('ZWE','Zimbabwe',null,'Africa');
