# Testy

## Bezpečnosť databázy (RLS)

Na lokálnom PostgreSQL 15+ (bez Supabase) – `supabase-stub.sql` nahradí `auth` a `storage`:

```
createdb dochadzka_test
psql -d dochadzka_test -f test/supabase-stub.sql
for f in supabase/migrations/0*.sql; do psql -d dochadzka_test -f $f; done
psql -d dochadzka_test -f test/rls-test.sql
```

Očakávané chyby v výstupe: „Najprv sa prihlás e-mailom“ (anonym nevytvorí firmu), „row-level security“
(pracovník nezapíše za iného, nenahrá fotku do cudzieho priečinka), „Neplatný kód“, „Pracovník nenájdený“
(cudzí správca nezmení kód), „Položka nenájdená alebo už vybavená“, „Nie si prihlásený“ (hotovosť),
„Nie si správca firmy“, „Najprv pracovníka deaktivuj“ (GDPR: mazanie GPS a anonymizácia).

## Weby bez servera

`mock-supabase.js` je náhrada knižnice supabase-js s dátami v `localStorage`. V prehliadači (napr. Playwright)
stačí presmerovať `vendor/supabase-2.117.2.js` na tento súbor; administrácia aj appka pracovníka potom
fungujú lokálne a vidia spoločné dáta.
