-- =====================================================================
-- Migrácia 0002: zmazanie pracovníka nesmie zmazať jeho dochádzku.
-- Pracovníka so záznamami databáza zmazať nedovolí (ostáva len "neaktívny").
-- Zmazanie celej firmy funguje ďalej (záznamy sa zmažú cez firmu).
-- Spustenie: SQL Editor → New query → vložiť → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
alter table public.entries drop constraint if exists entries_worker_id_fkey;
alter table public.entries add constraint entries_worker_id_fkey
  foreign key (worker_id) references public.workers(id) on delete no action;
