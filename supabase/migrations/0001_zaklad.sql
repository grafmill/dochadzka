-- =====================================================================
-- Dochádzka na stavbe – databáza (PostgreSQL 15+, Supabase)
-- Migrácia 0001: tabuľky, bezpečnosť (RLS), funkcie, úložisko fotiek.
--
-- Spustenie v Supabase: SQL Editor → New query → vložiť celý súbor → Run.
-- Skript sa dá spustiť aj opakovane (nič nezmaže).
--
-- Prenositeľnosť: všetko je čistý PostgreSQL. Zo Supabase sa používa len
--   auth.uid(), auth.jwt() a tabuľka auth.users (prihlasovanie),
--   storage.objects / storage.buckets (fotky).
-- Pri inom hostingu treba tieto 3 veci nahradiť (napr. PostgREST + vlastné JWT).
-- =====================================================================

-- ---------------------------------------------------------------------
-- TABUĽKY
-- ---------------------------------------------------------------------
create table if not exists public.companies (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  gps_enabled          boolean not null default false,  -- zaznamenávať polohu pri príchode/odchode
  breaks_enabled       boolean not null default false,  -- tlačidlo Prestávka v appke
  default_radius       integer not null default 500 check (default_radius between 50 and 5000),
  default_rate         numeric(10,2) not null default 0, -- základná hodinová sadzba firmy (€/h)
  forgot_checkout_hour integer not null default 18 check (forgot_checkout_hour between 0 and 23),
  max_shift_hours      integer not null default 12 check (max_shift_hours between 1 and 24),
  budget_warn_pct      integer not null default 80 check (budget_warn_pct between 1 and 100),
  created_at           timestamptz not null default now()
);

-- kto spravuje firmu (zamestnávateľ, kancelária)
create table if not exists public.company_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workers (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name         text not null,
  phone        text,
  type         text not null default 'TPP' check (type in ('TPP','SZCO')),  -- SZCO = živnostník
  hourly_rate  numeric(10,2),                 -- prázdne = základná sadzba firmy
  active       boolean not null default true,
  user_id      uuid unique references auth.users(id) on delete set null,  -- mobil, ktorý je prihlásený
  invite_code  text unique,                   -- kód na prihlásenie v appke
  gps_consent  boolean,                       -- null = ešte neodpovedal
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists workers_company_idx on public.workers(company_id);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  address     text,
  lat         double precision,
  lng         double precision,
  radius      integer check (radius between 50 and 5000),  -- prázdne = podľa firmy
  budget      numeric(12,2),                               -- rozpočet na prácu (€)
  active      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists projects_company_idx on public.projects(company_id);

create table if not exists public.tasks (
  company_id  uuid not null references public.companies(id) on delete cascade,
  num         integer not null check (num between 0 and 99),
  name        text not null,
  active      boolean not null default true,
  primary key (company_id, num)
);

-- Výnimky zo sadzby. Prázdne pole = platí pre všetkých/všetky.
-- Platí najkonkrétnejšie pravidlo: úloha > zákazka > pracovník.
create table if not exists public.rates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  worker_id   uuid references public.workers(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  task_num    integer check (task_num between 0 and 99),
  rate        numeric(10,2) not null check (rate >= 0),
  created_at  timestamptz not null default now(),
  check (project_id is not null or task_num is not null)
);
create index if not exists rates_company_idx on public.rates(company_id);

create table if not exists public.entries (
  id          uuid primary key,                -- generuje mobil (kvôli offline)
  company_id  uuid not null references public.companies(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,  -- null = Iné
  other_text  text not null default '',
  task_num    integer not null default 0,
  note        text not null default '',
  photos      text[] not null default '{}',     -- cesty v úložisku "fotky"
  start_at    timestamptz not null,
  end_at      timestamptz,                      -- null = ešte v práci
  start_orig  timestamptz,                      -- pôvodný čas pred úpravou pracovníkom
  end_orig    timestamptz,
  edited      boolean not null default false,   -- pracovník menil čas → červený výkričník
  gps_start   jsonb,                            -- {lat,lng,acc,auto}
  gps_end     jsonb,
  breaks      jsonb not null default '[]',      -- [{start,end}] v ms
  by_admin    boolean not null default false,   -- záznam pridal/upravil zamestnávateľ
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);
create index if not exists entries_company_start_idx on public.entries(company_id, start_at);
create index if not exists entries_worker_start_idx on public.entries(worker_id, start_at);
create index if not exists entries_open_idx on public.entries(company_id) where end_at is null;

-- neprítomnosť (len TPP): dovolenka, PN, voľno
create table if not exists public.absences (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  kind        text not null check (kind in ('dovolenka','PN','volno')),
  date_from   date not null,
  date_to     date not null,
  note        text,
  created_at  timestamptz not null default now(),
  check (date_to >= date_from)
);
create index if not exists absences_company_idx on public.absences(company_id, date_from);

-- ---------------------------------------------------------------------
-- POMOCNÉ FUNKCIE (kto je prihlásený)
-- ---------------------------------------------------------------------
create or replace function public.my_admin_company() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.company_admins where user_id = auth.uid()
$$;

create or replace function public.is_company_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.company_admins where user_id = auth.uid() and company_id = cid)
$$;

create or replace function public.my_worker_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.workers where user_id = auth.uid() and active
$$;

create or replace function public.my_worker_company() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.workers where user_id = auth.uid() and active
$$;

-- kód na prihlásenie: 8 znakov bez zameniteľných (0/O, 1/I/L)
create or replace function public.gen_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(abc, (get_byte(b, i) % length(abc)) + 1, 1);
  end loop;
  return code;
end $$;

-- ---------------------------------------------------------------------
-- TRIGGERY
-- ---------------------------------------------------------------------
create or replace function public.workers_before_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.invite_code is null then new.invite_code := public.gen_invite_code(); end if;
  return new;
end $$;
drop trigger if exists workers_bi on public.workers;
create trigger workers_bi before insert on public.workers
  for each row execute function public.workers_before_insert();

-- Úpravu času pracovníkom označí databáza sama – pracovník ju nevie skryť.
create or replace function public.entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  adm boolean := public.is_company_admin(coalesce(old.company_id, new.company_id));
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if not adm then new.by_admin := false; end if;
    return new;
  end if;

  if adm then
    if new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at
       or new.project_id is distinct from old.project_id or new.task_num is distinct from old.task_num then
      new.by_admin := true;
    end if;
    return new;
  end if;

  -- pracovník
  new.company_id := old.company_id;
  new.worker_id  := old.worker_id;
  new.by_admin   := old.by_admin;
  new.created_at := old.created_at;
  if abs(extract(epoch from new.start_at - old.start_at)) >= 60 then
    new.start_orig := coalesce(old.start_orig, old.start_at);
    new.edited := true;
  else
    new.start_orig := coalesce(old.start_orig, new.start_orig);
  end if;
  if old.end_at is not null and (new.end_at is null or abs(extract(epoch from new.end_at - old.end_at)) >= 60) then
    new.end_orig := coalesce(old.end_orig, old.end_at);
    new.edited := true;
  else
    new.end_orig := coalesce(old.end_orig, new.end_orig);
  end if;
  new.edited := old.edited or new.edited;
  return new;
end $$;
drop trigger if exists entries_biu on public.entries;
create trigger entries_biu before insert or update on public.entries
  for each row execute function public.entries_guard();

-- ---------------------------------------------------------------------
-- FUNKCIE VOLANÉ Z APIEK
-- ---------------------------------------------------------------------
-- Registrácia firmy: prihlásený používateľ (e-mail) sa stane jej správcom.
create or replace function public.create_company(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Najprv sa prihlás e-mailom';
  end if;
  if exists(select 1 from public.company_admins where user_id = auth.uid()) then
    raise exception 'Tento účet už spravuje firmu';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Zadaj názov firmy'; end if;
  insert into public.companies(name) values (trim(p_name)) returning id into cid;
  insert into public.company_admins(user_id, company_id) values (auth.uid(), cid);
  insert into public.tasks(company_id, num, name)
  select cid, t.num, t.name from (values
    (0,'Nezaradené'),(1,'Príprava pracoviska'),(2,'Doprava materiálu'),(3,'Upratovanie'),(4,'Lešenie'),
    (5,'Búranie'),(6,'Penetrácia'),(7,'Maľovanie'),(8,'Montáž SDK'),(9,'Murovanie'),
    (10,'Omietky'),(11,'Obklady a dlažby'),(12,'Elektroinštalácia'),(13,'Vodoinštalácia'),(14,'Podlahy'),
    (15,'Zatepľovanie'),(16,'Okná a dvere'),(17,'Stierky'),(20,'Strecha'),(30,'Výkopové práce'),
    (40,'Betonáž'),(41,'Armovanie'),(50,'Nákup materiálu'),(99,'Oprava reklamácie')
  ) as t(num, name);
  return cid;
end $$;

-- Pracovník zadá kód v appke → jeho mobil sa spáruje s ním.
-- Kód ostáva platný (napr. pre preinštalovanie), kým ho zamestnávateľ nezmení.
create or replace function public.claim_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare wid uuid; code text := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'Chýba prihlásenie'; end if;
  if length(code) <> 8 then raise exception 'Neplatný kód'; end if;
  select id into wid from public.workers where invite_code = code and active;
  if wid is null then raise exception 'Neplatný kód'; end if;
  update public.workers set user_id = null where user_id = auth.uid() and id <> wid;
  update public.workers set user_id = auth.uid() where id = wid;
  return wid;
end $$;

-- Nový kód: starý prestane platiť a doterajší mobil sa odhlási (stratený mobil).
create or replace function public.new_invite_code(p_worker uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text := public.gen_invite_code();
begin
  update public.workers set invite_code = code, user_id = null
   where id = p_worker and public.is_company_admin(company_id);
  if not found then raise exception 'Pracovník nenájdený'; end if;
  return code;
end $$;

create or replace function public.set_gps_consent(p_consent boolean) returns void
language sql security definer set search_path = public as $$
  update public.workers set gps_consent = p_consent where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- BEZPEČNOSŤ (RLS): pracovník vidí a píše len svoje, správca celú firmu
-- ---------------------------------------------------------------------
alter table public.companies      enable row level security;
alter table public.company_admins enable row level security;
alter table public.workers        enable row level security;
alter table public.projects       enable row level security;
alter table public.tasks          enable row level security;
alter table public.rates          enable row level security;
alter table public.entries        enable row level security;
alter table public.absences       enable row level security;

drop policy if exists companies_sel on public.companies;
create policy companies_sel on public.companies for select to authenticated
  using (public.is_company_admin(id) or id = public.my_worker_company());
drop policy if exists companies_upd on public.companies;
create policy companies_upd on public.companies for update to authenticated
  using (public.is_company_admin(id)) with check (public.is_company_admin(id));

drop policy if exists admins_sel on public.company_admins;
create policy admins_sel on public.company_admins for select to authenticated
  using (user_id = auth.uid());

drop policy if exists workers_admin on public.workers;
create policy workers_admin on public.workers for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
drop policy if exists workers_self on public.workers;
create policy workers_self on public.workers for select to authenticated
  using (user_id = auth.uid());

drop policy if exists projects_admin on public.projects;
create policy projects_admin on public.projects for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
drop policy if exists projects_worker on public.projects;
create policy projects_worker on public.projects for select to authenticated
  using (company_id = public.my_worker_company());

drop policy if exists tasks_admin on public.tasks;
create policy tasks_admin on public.tasks for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
drop policy if exists tasks_worker on public.tasks;
create policy tasks_worker on public.tasks for select to authenticated
  using (company_id = public.my_worker_company());

drop policy if exists rates_admin on public.rates;
create policy rates_admin on public.rates for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

drop policy if exists entries_admin on public.entries;
create policy entries_admin on public.entries for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
drop policy if exists entries_worker_sel on public.entries;
create policy entries_worker_sel on public.entries for select to authenticated
  using (worker_id = public.my_worker_id());
drop policy if exists entries_worker_ins on public.entries;
create policy entries_worker_ins on public.entries for insert to authenticated
  with check (worker_id = public.my_worker_id() and company_id = public.my_worker_company());
drop policy if exists entries_worker_upd on public.entries;
create policy entries_worker_upd on public.entries for update to authenticated
  using (worker_id = public.my_worker_id())
  with check (worker_id = public.my_worker_id() and company_id = public.my_worker_company());

drop policy if exists absences_admin on public.absences;
create policy absences_admin on public.absences for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
drop policy if exists absences_worker on public.absences;
create policy absences_worker on public.absences for select to authenticated
  using (worker_id = public.my_worker_id());

-- práva: anonymný (neprihlásený) návštevník nevidí nič
revoke all on public.companies, public.company_admins, public.workers, public.projects,
  public.tasks, public.rates, public.entries, public.absences from anon;
grant select, insert, update, delete on public.companies, public.company_admins, public.workers,
  public.projects, public.tasks, public.rates, public.entries, public.absences to authenticated;
revoke execute on function public.create_company(text), public.claim_invite(text),
  public.new_invite_code(uuid), public.set_gps_consent(boolean) from public, anon;
grant execute on function public.my_admin_company(), public.is_company_admin(uuid),
  public.my_worker_id(), public.my_worker_company() to authenticated;
grant execute on function public.create_company(text), public.claim_invite(text),
  public.new_invite_code(uuid), public.set_gps_consent(boolean) to authenticated;

-- ---------------------------------------------------------------------
-- FOTKY (úložisko): cesta = firma/pracovník/záznam/súbor.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fotky', 'fotky', false)
on conflict (id) do nothing;

drop policy if exists fotky_worker_ins on storage.objects;
create policy fotky_worker_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'fotky'
    and (storage.foldername(name))[1] = public.my_worker_company()::text
    and (storage.foldername(name))[2] = public.my_worker_id()::text);
drop policy if exists fotky_sel on storage.objects;
create policy fotky_sel on storage.objects for select to authenticated
  using (bucket_id = 'fotky' and (
    (storage.foldername(name))[1] = public.my_admin_company()::text
    or (storage.foldername(name))[2] = public.my_worker_id()::text));
drop policy if exists fotky_admin_del on storage.objects;
create policy fotky_admin_del on storage.objects for delete to authenticated
  using (bucket_id = 'fotky' and (storage.foldername(name))[1] = public.my_admin_company()::text);
