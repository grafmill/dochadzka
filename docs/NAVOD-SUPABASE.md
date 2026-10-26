# Návod: spustenie databázy v Supabase

Treba to urobiť raz. Trvá asi 5 minút. Všetko sa robí na https://supabase.com/dashboard v projekte
`pwmneidjkeagbqsbkxzc` (organizácia GRAFMILL s.r.o.).

## 1. Vytvoriť tabuľky (SQL)

1. V ľavom menu klikni na **SQL Editor**.
2. Hore klikni na **+ New query** (alebo „New SQL snippet“).
3. Otvor súbor [`supabase/migrations/0001_zaklad.sql`](../supabase/migrations/0001_zaklad.sql),
   skopíruj **celý** obsah a vlož ho do editora.
4. Vpravo dole klikni na **Run** (alebo Ctrl+Enter).
5. Ak sa Supabase spýta na „destructive operation“ (skript obsahuje `drop policy if exists`), potvrď
   **Run this query**. Nič sa nezmaže – len sa prepíšu pravidlá prístupu.
6. Dole má byť „Success. No rows returned“.

Skontroluj: vľavo **Table Editor** – majú tam byť tabuľky `companies`, `workers`, `projects`, `tasks`,
`rates`, `entries`, `absences`, `company_admins`. V **Storage** má byť priečinok (bucket) `fotky`.

## 2. Povoliť prihlásenie pracovníkov kódom

Pracovníci nemajú e-mail ani heslo – appka sa prihlási „anonymne“ a spáruje sa s pracovníkom cez kód.

1. Vľavo **Authentication** → **Sign In / Providers** (v starších verziách *Providers*).
2. Zapni **Allow anonymous sign-ins** → **Save changes**.

## 3. Nastaviť adresu administrácie (pre potvrdzovacie e-maily)

1. **Authentication** → **URL Configuration**.
2. **Site URL**: `https://grafmill.github.io/dochadzka/admin/` → Save.
3. **Redirect URLs** → Add URL: `https://grafmill.github.io/dochadzka/**` → Save.

Na rýchle testovanie môžeš potvrdzovanie e-mailu vypnúť: **Authentication** → **Sign In / Providers** →
**Email** → vypni **Confirm email** → Save. Potom sa po registrácii prihlásiš hneď.
(Bezplatný Supabase pošle len pár e-mailov za hodinu.)

## 4. Vyskúšať

1. Otvor https://grafmill.github.io/dochadzka/admin/ → **Nová firma** → názov firmy, e-mail, heslo.
2. **Nastavenia**: základná sadzba, GPS, prestávky.
3. **Zákazky** → **+ Nová zákazka**: názov, adresa → **Nájsť na mape** (alebo klik do mapy), okruh, rozpočet.
4. **Pracovníci** → **+ Pridať pracovníka** → zobrazí sa kód a odkaz → **Poslať SMS / WhatsApp / Kopírovať**.
5. V mobile otvor odkaz → appka sa prihlási → pridaj na plochu.
   - **iPhone**: appka na ploche má vlastnú pamäť, preto sa po pridaní na plochu ešte raz spýta na kód (je v SMS).
6. V mobile Príchod / Odchod → v administrácii **Prehľad** a **Dochádzka**.

Kto už mal v mobile starú verziu appky, uvidí ukážkové dáta s nápisom „ukážka“. Prihlási sa cez
⚙ Nastavenia → **Prihlásiť sa kódom od zamestnávateľa** (alebo otvorí odkaz s kódom).

## Ďalšie zmeny databázy

Nové zmeny pribudnú ako ďalšie súbory `supabase/migrations/0002_…sql`, `0003_…sql` a spúšťajú sa
rovnako, v poradí čísel. Každý súbor sa dá spustiť aj opakovane.

## Presun k zákazníkovi

- Iný Supabase projekt: kroky 1–3 v novom projekte a v `config.js` zmeniť `supabaseUrl` a `supabaseKey`
  (Project Settings → API Keys → *Publishable key*).
- Vlastný server bez Supabase: migrácie sú čistý PostgreSQL. Treba nahradiť prihlasovanie
  (`auth.uid()`, `auth.jwt()`, tabuľka `auth.users`) a úložisko fotiek (`storage.objects`). Ako vzor
  slúži `test/supabase-stub.sql`.
