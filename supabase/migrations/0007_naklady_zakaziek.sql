-- =====================================================================
-- 0007 – náklady a výsledok zákaziek (1. etapa), dvojstupňové overenie
--   * companies.costs_enabled: modul „Náklady a výsledok zákaziek“ (predvolene vypnutý)
--   * companies.tpp_coef: koľkokrát viac stojí firmu hodina TPP oproti sadzbe (odvody zamestnávateľa)
--   * companies.margin_warn_pct: pod túto maržu (%) sa zákazka označí oranžovou
--   * companies.mfa_required: všetci správcovia musia mať dvojstupňové overenie
--   * project_finance: zákazník, predajná cena bez DPH, stav, termín – len pre správcu
--     (pracovníci tabuľku projects čítajú, preto peniaze nie sú v nej)
--   * cost_categories: kategórie nákladov (materiál, pálenie, striekanie…), firma si ich upraví
--   * cost_docs + cost_items: doklad (faktúra, bloček…) s prílohou a jeho rozdelenie
--     na zákazky a kategórie; položka bez zákazky = nepriradená
--   * úložisko „doklady“: cesta = firma/doklad/súbor
-- Peniaze firmy vidí len správca. Kto má zapnuté dvojstupňové overenie (alebo ho firma vyžaduje),
-- dostane ich až po zadaní kódu – databáza ich bez toho nevydá ani s ukradnutým heslom.
-- Spustiť v Supabase → SQL Editor (celý súbor naraz). Dá sa spustiť aj opakovane.
-- =====================================================================

alter table public.companies add column if not exists costs_enabled   boolean      not null default false;
alter table public.companies add column if not exists tpp_coef        numeric(4,2) not null default 1.36;
alter table public.companies add column if not exists margin_warn_pct integer      not null default 10;
alter table public.companies add column if not exists mfa_required    boolean      not null default false;
alter table public.companies drop constraint if exists companies_tpp_coef_check;
alter table public.companies add constraint companies_tpp_coef_check check (tpp_coef between 1 and 3);
alter table public.companies drop constraint if exists companies_margin_warn_check;
alter table public.companies add constraint companies_margin_warn_check check (margin_warn_pct between 0 and 100);

-- ---------------------------------------------------------------------
-- dvojstupňové overenie: kto má overené zariadenie (alebo ho firma vyžaduje), musí byť prihlásený s kódom (aal2)
-- ---------------------------------------------------------------------
create or replace function public.mfa_ok(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not (coalesce((select mfa_required from public.companies where id = cid), false)
              or exists(select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'))
$$;
-- správca firmy, ktorý smie vidieť peniaze
create or replace function public.is_finance_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_company_admin(cid) and public.mfa_ok(cid)
$$;

-- ---------------------------------------------------------------------
-- TABUĽKY
-- ---------------------------------------------------------------------
create table if not exists public.project_finance (
  project_id  uuid primary key references public.projects(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  customer    text,                                   -- odberateľ
  price       numeric(12,2) check (price >= 0),       -- predajná cena bez DPH
  status      text not null default 'bezi' check (status in ('ponuka','bezi','hotova','fakturovana','zaplatena')),
  due_on      date,                                   -- termín
  updated_at  timestamptz not null default now()
);
create index if not exists project_finance_company_idx on public.project_finance(company_id);

create table if not exists public.cost_categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  sort        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists cost_categories_company_idx on public.cost_categories(company_id, sort);

create table if not exists public.cost_docs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  kind        text not null default 'faktura' check (kind in ('faktura','blocek','ine')),
  supplier    text,                                   -- dodávateľ
  doc_no      text,                                   -- číslo faktúry / bločku
  issued_on   date not null default current_date,
  vat         numeric(12,2) check (vat >= 0),         -- DPH z dokladu (len pre informáciu, náklady sú bez DPH)
  files       text[] not null default '{}',           -- cesty v úložisku „doklady“
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists cost_docs_company_idx on public.cost_docs(company_id, issued_on);

create table if not exists public.cost_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  doc_id      uuid not null references public.cost_docs(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,          -- null = nepriradené
  category_id uuid references public.cost_categories(id) on delete set null,
  amount      numeric(12,2) not null,                 -- bez DPH (dobropis môže byť záporný)
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists cost_items_doc_idx on public.cost_items(doc_id);
create index if not exists cost_items_project_idx on public.cost_items(project_id);
create index if not exists cost_items_company_idx on public.cost_items(company_id);

-- položka patrí k tej istej firme ako doklad (a zákazka a kategória)
create or replace function public.cost_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.cost_docs where id = new.doc_id and company_id = new.company_id)
     or (new.project_id is not null and not exists(select 1 from public.projects where id = new.project_id and company_id = new.company_id))
     or (new.category_id is not null and not exists(select 1 from public.cost_categories where id = new.category_id and company_id = new.company_id)) then
    raise exception 'Doklad, zákazka a kategória musia patriť tej istej firme';
  end if;
  return new;
end $$;
drop trigger if exists cost_items_biu on public.cost_items;
create trigger cost_items_biu before insert or update on public.cost_items
  for each row execute function public.cost_items_guard();

create or replace function public.project_finance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.projects where id = new.project_id and company_id = new.company_id) then
    raise exception 'Zákazka patrí inej firme';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists project_finance_biu on public.project_finance;
create trigger project_finance_biu before insert or update on public.project_finance
  for each row execute function public.project_finance_guard();

-- ---------------------------------------------------------------------
-- BEZPEČNOSŤ: len správca (s dvojstupňovým overením, ak ho má), pracovník nič
-- ---------------------------------------------------------------------
alter table public.project_finance enable row level security;
alter table public.cost_categories enable row level security;
alter table public.cost_docs       enable row level security;
alter table public.cost_items      enable row level security;

drop policy if exists project_finance_admin on public.project_finance;
create policy project_finance_admin on public.project_finance for all to authenticated
  using (public.is_finance_admin(company_id)) with check (public.is_finance_admin(company_id));
drop policy if exists cost_categories_admin on public.cost_categories;
create policy cost_categories_admin on public.cost_categories for all to authenticated
  using (public.is_finance_admin(company_id)) with check (public.is_finance_admin(company_id));
drop policy if exists cost_docs_admin on public.cost_docs;
create policy cost_docs_admin on public.cost_docs for all to authenticated
  using (public.is_finance_admin(company_id)) with check (public.is_finance_admin(company_id));
drop policy if exists cost_items_admin on public.cost_items;
create policy cost_items_admin on public.cost_items for all to authenticated
  using (public.is_finance_admin(company_id)) with check (public.is_finance_admin(company_id));

-- zapnúť povinné dvojstupňové overenie smie len ten, kto ho sám má (inak by sa zamkol)
create or replace function public.companies_mfa_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mfa_required and not old.mfa_required
     and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Najprv si zapni dvojstupňové overenie pre seba';
  end if;
  return new;
end $$;
drop trigger if exists companies_mfa_bu on public.companies;
create trigger companies_mfa_bu before update on public.companies
  for each row execute function public.companies_mfa_guard();

revoke all on public.project_finance, public.cost_categories, public.cost_docs, public.cost_items from anon;
grant select, insert, update, delete on public.project_finance, public.cost_categories, public.cost_docs, public.cost_items to authenticated;
revoke execute on function public.mfa_ok(uuid), public.is_finance_admin(uuid) from public, anon;
grant execute on function public.mfa_ok(uuid), public.is_finance_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- DOKLADY (úložisko): cesta = firma/doklad/súbor
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('doklady', 'doklady', false)
on conflict (id) do nothing;

drop policy if exists doklady_admin_sel on storage.objects;
create policy doklady_admin_sel on storage.objects for select to authenticated
  using (bucket_id = 'doklady' and (storage.foldername(name))[1] = public.my_admin_company()::text
         and public.is_finance_admin(public.my_admin_company()));
drop policy if exists doklady_admin_ins on storage.objects;
create policy doklady_admin_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'doklady' and (storage.foldername(name))[1] = public.my_admin_company()::text
         and public.is_finance_admin(public.my_admin_company()));
drop policy if exists doklady_admin_del on storage.objects;
create policy doklady_admin_del on storage.objects for delete to authenticated
  using (bucket_id = 'doklady' and (storage.foldername(name))[1] = public.my_admin_company()::text
         and public.is_finance_admin(public.my_admin_company()));
