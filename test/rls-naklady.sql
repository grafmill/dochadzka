-- Test bezpečnosti nákladov zákaziek (0007). Spúšťa sa po rls-test.sql (používa jeho firmy a používateľov).
-- Očakávané chyby: „row-level security“ (pracovník, cudzí správca, správca bez kódu), „tej istej firme“, „Najprv si zapni“.
\set ON_ERROR_STOP 0
create or replace function public._aal(u text, aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub',u,'is_anonymous',false,'aal',aal)::text, false) $$;
set role authenticated;
-- admin A: kategória, cena zákazky, doklad s položkou
select _aal('00000000-0000-0000-0000-00000000000a', 'aal1');
select id as ca from companies \gset
select id as p1 from projects where name = 'Stavba 1' \gset
insert into cost_categories(company_id, name) values (:'ca', 'Materiál') returning id as cat1 \gset
insert into project_finance(project_id, company_id, customer, price) values (:'p1', :'ca', 'Odberateľ s.r.o.', 8400);
insert into cost_docs(company_id, supplier, doc_no) values (:'ca', 'Ferona', 'F-1') returning id as d1 \gset
insert into cost_items(company_id, doc_id, project_id, category_id, amount) values (:'ca', :'d1', :'p1', :'cat1', 1200);
select 'A vidi naklady (1 1 1 1)', (select count(*) from project_finance), (select count(*) from cost_categories), (select count(*) from cost_docs), (select count(*) from cost_items);
-- admin B nevidí nič z A a nevie priradiť položku k zákazke A
select _aal('00000000-0000-0000-0000-00000000000b', 'aal1');
select id as cb from companies \gset
select 'B vidi naklady A (0 0 0 0)', (select count(*) from project_finance), (select count(*) from cost_categories), (select count(*) from cost_docs), (select count(*) from cost_items);
insert into cost_docs(company_id, supplier) values (:'cb', 'X') returning id as db1 \gset
insert into cost_items(company_id, doc_id, project_id, amount) values (:'cb', :'db1', :'p1', 1);
insert into cost_items(company_id, doc_id, amount) values (:'ca', :'d1', 1);
update project_finance set price = 1 where project_id = :'p1';
-- pracovník A nevidí peniaze
select _as('00000000-0000-0000-0000-0000000000a1', true);
select 'pracovnik vidi naklady (0 0 0 0)', (select count(*) from project_finance), (select count(*) from cost_categories), (select count(*) from cost_docs), (select count(*) from cost_items);
insert into cost_docs(company_id, supplier) values (:'ca', 'hack');
-- dvojstupňové overenie: A si zapne zariadenie → bez kódu (aal1) nevidí nič, s kódom (aal2) áno
reset role;
insert into auth.mfa_factors(user_id, status) values ('00000000-0000-0000-0000-00000000000a', 'verified');
set role authenticated;
select _aal('00000000-0000-0000-0000-00000000000a', 'aal1');
select 'A bez kodu (0 0)', (select count(*) from cost_docs), (select count(*) from project_finance);
insert into cost_docs(company_id, supplier) values (:'ca', 'bez kodu');
select 'A bez kodu vidi dochadzku (1)', count(*) > 0 from workers;
select _aal('00000000-0000-0000-0000-00000000000a', 'aal2');
select 'A s kodom (1 1)', (select count(*) from cost_docs), (select count(*) from project_finance);
-- firma vyžaduje overenie: B bez zariadenia ho nevie zapnúť bez kódu
select _aal('00000000-0000-0000-0000-00000000000b', 'aal1');
update companies set mfa_required = true where id = :'cb';
select 'B mfa_required (f)', mfa_required from companies;
-- A (s kódom) ho zapne → aj bez zariadenia potom treba kód
select _aal('00000000-0000-0000-0000-00000000000a', 'aal2');
update companies set mfa_required = true where id = :'ca';
reset role; delete from auth.mfa_factors; set role authenticated;
select _aal('00000000-0000-0000-0000-00000000000a', 'aal1');
select 'A firma vyzaduje, bez kodu (0)', count(*) from cost_docs;
select _aal('00000000-0000-0000-0000-00000000000a', 'aal2');
select 'A firma vyzaduje, s kodom (1)', count(*) from cost_docs;
-- zmazanie zákazky: položka ostane nepriradená
delete from projects where id = :'p1';
select 'po zmazani zakazky nepriradena (t)', project_id is null from cost_items where doc_id = :'d1';
