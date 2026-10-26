-- =====================================================================
-- 0004 – ochrana osobných údajov (GDPR)
--   * lehoty uchovávania: GPS súradnice a fotky k práci sa po lehote mažú
--     (z GPS ostane len "na stavbe áno/nie" a vzdialenosť)
--   * údaje prevádzkovateľa pre obrazovku "Ochrana údajov" v appke
--   * dátum a čas súhlasu s polohou
--   * anonymizácia bývalého pracovníka
-- Spustiť v Supabase → SQL Editor (celý súbor naraz). Dá sa spustiť aj opakovane.
-- =====================================================================

alter table public.companies add column if not exists gps_keep_days      integer not null default 90;   -- po koľkých dňoch zmazať GPS súradnice
alter table public.companies add column if not exists photo_keep_days    integer not null default 365;  -- po koľkých dňoch zmazať fotky k práci (nie bločky)
alter table public.companies add column if not exists privacy_controller text;                          -- prevádzkovateľ: názov, sídlo, IČO, kontakt
alter table public.companies add column if not exists privacy_url        text;                          -- odkaz na plnú informáciu o spracúvaní
alter table public.companies drop constraint if exists companies_gps_keep_days_check;
alter table public.companies add constraint companies_gps_keep_days_check check (gps_keep_days between 7 and 3650);
alter table public.companies drop constraint if exists companies_photo_keep_days_check;
alter table public.companies add constraint companies_photo_keep_days_check check (photo_keep_days between 60 and 3650);

alter table public.workers add column if not exists gps_consent_at timestamptz;  -- kedy pracovník naposledy súhlasil / odvolal súhlas
alter table public.workers add column if not exists anonymized_at  timestamptz;

-- súhlas s polohou: ukladá sa aj čas
create or replace function public.set_gps_consent(p_consent boolean) returns void
language sql security definer set search_path = public as $$
  update public.workers set gps_consent = p_consent, gps_consent_at = now() where user_id = auth.uid();
$$;

-- vzdialenosť v metroch (haversine)
create or replace function public.dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- GPS bod → len výsledok kontroly: {"purged":true,"on_site":true/false/null,"dist":m}
create or replace function public.gps_summary(g jsonb, p_project uuid, p_default_radius integer)
returns jsonb language sql stable set search_path = public as $$
  select case
    when g is null or not (g ? 'lat') then g
    else coalesce((
      select jsonb_build_object('purged', true,
        'on_site', public.dist_m((g->>'lat')::float8, (g->>'lng')::float8, p.lat, p.lng) <= coalesce(p.radius, p_default_radius),
        'dist', round(public.dist_m((g->>'lat')::float8, (g->>'lng')::float8, p.lat, p.lng)))
      from public.projects p where p.id = p_project and p.lat is not null and p.lng is not null),
      jsonb_build_object('purged', true, 'on_site', null, 'dist', null))
  end;
$$;

-- zmaže GPS súradnice starších záznamov firmy (volá administrácia pri prihlásení)
create or replace function public.purge_old_gps() returns integer
language plpgsql security definer set search_path = public as $$
declare cid uuid := public.my_admin_company(); n integer;
begin
  if cid is null then raise exception 'Nie si správca firmy'; end if;
  update public.entries e
     set gps_start = public.gps_summary(e.gps_start, e.project_id, c.default_radius),
         gps_end   = public.gps_summary(e.gps_end,   e.project_id, c.default_radius)
    from public.companies c
   where c.id = cid and e.company_id = cid
     and e.start_at < now() - make_interval(days => c.gps_keep_days)
     and ((e.gps_start ? 'lat') or (e.gps_end ? 'lat'));
  get diagnostics n = row_count;
  return n;
end $$;

-- anonymizácia bývalého (neaktívneho) pracovníka: meno, telefón, poznámka, prihlásenie a GPS preč;
-- hodiny a náklady zákaziek ostávajú
create or replace function public.anonymize_worker(p_worker uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w public.workers;
begin
  select * into w from public.workers where id = p_worker;
  if w.id is null or not public.is_company_admin(w.company_id) then raise exception 'Pracovník nenájdený'; end if;
  if w.active then raise exception 'Najprv pracovníka deaktivuj'; end if;
  update public.workers set name = 'Bývalý pracovník ' || upper(left(id::text, 4)), phone = null, note = null,
         user_id = null, invite_code = public.gen_invite_code(), gps_consent = null, gps_consent_at = null, anonymized_at = now()
   where id = p_worker;
  update public.entries e
     set gps_start = public.gps_summary(e.gps_start, e.project_id, c.default_radius),
         gps_end   = public.gps_summary(e.gps_end,   e.project_id, c.default_radius)
    from public.companies c
   where c.id = e.company_id and e.worker_id = p_worker;
  update public.absences set note = null where worker_id = p_worker;
end $$;

revoke execute on function public.purge_old_gps(), public.anonymize_worker(uuid) from public, anon;
grant execute on function public.purge_old_gps(), public.anonymize_worker(uuid) to authenticated;
