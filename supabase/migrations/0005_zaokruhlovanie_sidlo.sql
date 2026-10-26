-- =====================================================================
-- 0005 – zaokrúhľovanie času, práca v sídle firmy, kód zákazky
--   * zaokrúhľovanie: krok 0 (vypnuté) / 5 / 10 / 15 / 30 min a spôsob
--       employee = v prospech zamestnanca (príchod nadol, odchod nahor)
--       nearest  = na najbližší čas
--       company  = v prospech firmy (príchod nahor, odchod nadol)
--     zaokrúhľuje sa len príchod a odchod, nie presun medzi zákazkami
--     (cont_in / cont_out = záznam začal / skončil presunom)
--   * typ práce: field = v teréne (GPS podľa nastavenia), office = v sídle firmy (bez GPS)
--   * fotky a poznámky v appke sa dajú vypnúť
--   * kód zákazky na QR / čiarový kód
-- Spustiť v Supabase → SQL Editor (celý súbor naraz). Dá sa spustiť aj opakovane.
-- =====================================================================

alter table public.companies add column if not exists round_step     integer not null default 0;
alter table public.companies add column if not exists round_mode     text    not null default 'employee';
alter table public.companies add column if not exists work_mode      text    not null default 'field';
alter table public.companies add column if not exists photos_enabled boolean not null default true;
alter table public.companies add column if not exists notes_enabled  boolean not null default true;
alter table public.companies drop constraint if exists companies_round_step_check;
alter table public.companies add constraint companies_round_step_check check (round_step in (0, 5, 10, 15, 30));
alter table public.companies drop constraint if exists companies_round_mode_check;
alter table public.companies add constraint companies_round_mode_check check (round_mode in ('employee', 'nearest', 'company'));
alter table public.companies drop constraint if exists companies_work_mode_check;
alter table public.companies add constraint companies_work_mode_check check (work_mode in ('field', 'office'));
-- v sídle firmy sa poloha nezaznamenáva nikdy
alter table public.companies drop constraint if exists companies_office_no_gps;
update public.companies set gps_enabled = false where work_mode = 'office' and gps_enabled;
alter table public.companies add constraint companies_office_no_gps check (work_mode = 'field' or not gps_enabled);

alter table public.entries add column if not exists cont_in  boolean not null default false;  -- začal presunom z inej zákazky
alter table public.entries add column if not exists cont_out boolean not null default false;  -- skončil presunom na inú zákazku

alter table public.projects add column if not exists code text;   -- kód na QR / čiarovom kóde
create unique index if not exists projects_code_uq on public.projects(company_id, upper(code)) where code is not null and code <> '';
