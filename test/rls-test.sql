-- Test bezpečnosti (RLS). Spustenie: pozri test/README.md. Chyby "row-level security" a "Neplatný kód" sú očakávané.
\set ON_ERROR_STOP 0
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000a2'),('00000000-0000-0000-0000-0000000000a3');
create or replace function public._as(u text, anon bool default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub',u,'is_anonymous',anon)::text, false) $$;
-- admin A vytvorí firmu
set role authenticated;
select _as('00000000-0000-0000-0000-00000000000a');
select create_company('Firma A') as ca \gset
select count(*) as tasks_seeded from tasks;
insert into workers(company_id,name,type) values (:'ca','Peter','TPP') returning id as w1, invite_code as code1 \gset
insert into workers(company_id,name,type) values (:'ca','Jano','SZCO') returning id as w2, invite_code as code2 \gset
insert into projects(company_id,name,lat,lng) values (:'ca','Stavba 1',48.1,17.1) returning id as p1 \gset
\echo kod1 :code1
-- admin B
select _as('00000000-0000-0000-0000-00000000000b');
select create_company('Firma B') as cb \gset
select 'B vidi workers A (0 ocakavane)', count(*) from workers;
select 'B update A firmy', count(*) from (select 1) x; update companies set name='hack' where id=:'ca';
select _as('00000000-0000-0000-0000-00000000000a'); select 'meno A', name from companies;
-- anonym B nevie create_company
select _as('00000000-0000-0000-0000-0000000000a1', true);
select create_company('X');
-- pracovník a1 claim
select 'claim', claim_invite(lower(substr(:'code1',1,4))||'-'||substr(:'code1',5)) = :'w1';
select 'worker vidi workers', count(*) from workers;
select 'worker vidi projekty', count(*) from projects;
select 'worker vidi tasks', count(*) from tasks;
select 'worker vidi firmu', name, gps_enabled from companies;
select set_gps_consent(true);
-- vloží záznam
insert into entries(id,company_id,worker_id,project_id,task_num,start_at) values ('11111111-1111-1111-1111-111111111111',:'ca',:'w1',:'p1',5,'2026-10-26 07:00+01');
-- nesmie vložiť za iného
insert into entries(id,company_id,worker_id,start_at) values ('22222222-1111-1111-1111-111111111111',:'ca',:'w2','2026-10-26 07:00+01');
-- odchod (normálny)
update entries set end_at='2026-10-26 15:00+01' where id='11111111-1111-1111-1111-111111111111';
select 'po odchode edited', edited, start_orig, end_orig from entries;
-- úprava príchodu cez upsert s edited=false (pokus skryť)
insert into entries(id,company_id,worker_id,project_id,task_num,start_at,end_at,edited) values ('11111111-1111-1111-1111-111111111111',:'ca',:'w1',:'p1',5,'2026-10-26 06:30+01','2026-10-26 15:00+01',false)
 on conflict (id) do update set start_at=excluded.start_at,end_at=excluded.end_at,edited=excluded.edited,start_orig=excluded.start_orig,end_orig=excluded.end_orig;
select 'po uprave', edited, start_orig, end_orig from entries;
update entries set end_at='2026-10-26 16:00+01', start_orig=null, edited=false;
select 'po 2. uprave', edited, start_orig, end_orig from entries;
update entries set worker_id=:'w2';
delete from entries; select 'po delete', count(*) from entries;
-- storage
insert into storage.objects(bucket_id,name) values ('fotky', :'ca'||'/'||:'w1'||'/e/1.jpg');
insert into storage.objects(bucket_id,name) values ('fotky', :'ca'||'/'||:'w2'||'/e/1.jpg');
-- iný pracovník a2 (ešte nespárovaný) nevidí nič
select _as('00000000-0000-0000-0000-0000000000a2', true);
select 'cudzi entries', count(*) from entries; select 'cudzi projekty', count(*) from projects;
select claim_invite('ZZZZZZZZ');
-- admin A vidí záznam, fotku, zmení kód
select _as('00000000-0000-0000-0000-00000000000a');
select 'admin entries', count(*), bool_and(edited) from entries; select 'admin fotky', count(*) from storage.objects;
update entries set task_num=7; select 'by_admin', by_admin from entries;
select 'novy kod', length(new_invite_code(:'w1'));
select 'user_id po novom kode', user_id from workers where id=:'w1';
select _as('00000000-0000-0000-0000-00000000000b'); select 'B entries', count(*) from entries; select new_invite_code(:'w1');
reset role;
