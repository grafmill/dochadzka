-- =====================================================================
-- Migrácia 0003: zálohy a hotovosť na nákupy (s dokladmi).
-- Spustenie: SQL Editor → New query → vložiť celý súbor → Run. Dá sa spustiť aj opakovane.
-- =====================================================================

alter table public.companies add column if not exists cash_writeoff_limit numeric(10,2) not null default 2;  -- drobné sa odpíšu samé
alter table public.companies add column if not exists cash_overdue_days   integer not null default 3;         -- po koľkých dňoch bez dokladu červené

-- Zálohy vyplatené pracovníkovi (odrátajú sa pri vyúčtovaní mesiaca podľa dátumu)
create table if not exists public.advances (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  worker_id   uuid not null references public.workers(id),
  amount      numeric(10,2) not null check (amount > 0),
  paid_on     date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists advances_company_idx on public.advances(company_id, paid_on);

-- Hotovosť na nákup a nákupy za vlastné peniaze
--   kind 'issued' = zamestnávateľ dal hotovosť (given), pracovník doloží bloček (spent)
--   kind 'own'    = pracovník kúpil za svoje (given = 0), po schválení sa mu suma pripočíta k výplate
--   status: open (čaká na doklad) → reported (doklad poslaný) → done; returned = vrátené na opravu
--   settle_mode pri done: none (sedí na cent) | returned (vrátil zvyšok) | payroll (rozdiel cez výplatu) | writeoff (odpísané)
--   vplyv na výplatu pri payroll: + (spent - given) → kladné = doplatiť pracovníkovi, záporné = strhnúť
create table if not exists public.cash_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  worker_id     uuid not null references public.workers(id),
  kind          text not null default 'issued' check (kind in ('issued','own')),
  given         numeric(10,2) not null default 0 check (given >= 0),
  purpose       text not null default '',
  issued_at     timestamptz not null default now(),
  spent         numeric(10,2) check (spent >= 0),
  photos        text[] not null default '{}',
  worker_note   text,
  reported_at   timestamptz,
  status        text not null default 'open' check (status in ('open','reported','returned','done')),
  admin_note    text,
  settle_mode   text check (settle_mode in ('none','returned','payroll','writeoff')),
  settled_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists cash_items_company_idx on public.cash_items(company_id, status);

alter table public.advances   enable row level security;
alter table public.cash_items enable row level security;

drop policy if exists advances_admin on public.advances;
create policy advances_admin on public.advances for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
drop policy if exists advances_worker on public.advances;
create policy advances_worker on public.advances for select to authenticated
  using (worker_id = public.my_worker_id());

drop policy if exists cash_admin on public.cash_items;
create policy cash_admin on public.cash_items for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
drop policy if exists cash_worker on public.cash_items;
create policy cash_worker on public.cash_items for select to authenticated
  using (worker_id = public.my_worker_id());

revoke all on public.advances, public.cash_items from anon;
grant select, insert, update, delete on public.advances, public.cash_items to authenticated;

-- Pracovník vyúčtuje hotovosť (minutá suma + fotky bločkov). Mení len svoje položky čakajúce na doklad.
create or replace function public.report_cash(p_id uuid, p_spent numeric, p_photos text[], p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_spent is null or p_spent < 0 then raise exception 'Zadaj minutú sumu'; end if;
  update public.cash_items
     set spent = p_spent, photos = coalesce(p_photos, '{}'), worker_note = nullif(trim(coalesce(p_note,'')), ''),
         reported_at = now(), status = 'reported'
   where id = p_id and worker_id = public.my_worker_id() and status in ('open','returned');
  if not found then raise exception 'Položka nenájdená alebo už vybavená'; end if;
end $$;

-- Pracovník zapíše nákup za vlastné peniaze (id generuje mobil, kvôli fotkám).
create or replace function public.add_own_purchase(p_id uuid, p_spent numeric, p_purpose text, p_photos text[], p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare wid uuid := public.my_worker_id(); cid uuid := public.my_worker_company();
begin
  if wid is null then raise exception 'Nie si prihlásený'; end if;
  if p_spent is null or p_spent <= 0 then raise exception 'Zadaj sumu'; end if;
  insert into public.cash_items(id, company_id, worker_id, kind, given, purpose, spent, photos, worker_note, reported_at, status)
  values (p_id, cid, wid, 'own', 0, coalesce(trim(p_purpose), ''), p_spent, coalesce(p_photos, '{}'),
          nullif(trim(coalesce(p_note,'')), ''), now(), 'reported')
  on conflict (id) do nothing;
end $$;

revoke execute on function public.report_cash(uuid, numeric, text[], text),
  public.add_own_purchase(uuid, numeric, text, text[], text) from public, anon;
grant execute on function public.report_cash(uuid, numeric, text[], text),
  public.add_own_purchase(uuid, numeric, text, text[], text) to authenticated;
