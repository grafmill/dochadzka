-- =====================================================================
-- 0006 – zameranie firmy a zaradenie pracovníka
--   * companies.focus: stavba = stavebná firma, kovo = kovovýroba / zámočnícka dielňa,
--       vseob = všeobecná firma. Podľa zamerania administrácia ponúkne predvolený zoznam úloh.
--   * workers.role: zaradenie pracovníka (napr. Zvárač, Montážnik) – len popis
--   * workers.default_task: úloha, ktorá sa pracovníkovi nastaví pri prvom Príchode dňa
-- Spustiť v Supabase → SQL Editor (celý súbor naraz). Dá sa spustiť aj opakovane.
-- =====================================================================

alter table public.companies add column if not exists focus text not null default 'stavba';
alter table public.companies drop constraint if exists companies_focus_check;
alter table public.companies add constraint companies_focus_check check (focus in ('stavba', 'kovo', 'vseob'));

alter table public.workers add column if not exists role         text;
alter table public.workers add column if not exists default_task integer;
alter table public.workers drop constraint if exists workers_default_task_check;
alter table public.workers add constraint workers_default_task_check check (default_task is null or default_task between 0 and 99);
