# Testy

## Bezpečnosť databázy (RLS)

Na lokálnom PostgreSQL 15+ (bez Supabase) – `supabase-stub.sql` nahradí `auth` a `storage`:

```
createdb dochadzka_test
psql -d dochadzka_test -f test/supabase-stub.sql
for f in supabase/migrations/0*.sql; do psql -d dochadzka_test -f $f; done
psql -d dochadzka_test -f test/rls-test.sql
psql -d dochadzka_test -f test/rls-naklady.sql
```

Očakávané chyby v výstupe: „Najprv sa prihlás e-mailom“ (anonym nevytvorí firmu), „row-level security“
(pracovník nezapíše za iného, nenahrá fotku do cudzieho priečinka), „Neplatný kód“, „Pracovník nenájdený“
(cudzí správca nezmení kód), „Položka nenájdená alebo už vybavená“, „Nie si prihlásený“ (hotovosť),
„Nie si správca firmy“, „Najprv pracovníka deaktivuj“ (GDPR: mazanie GPS a anonymizácia).
`rls-naklady.sql` (náklady zákaziek a dvojstupňové overenie): „tej istej firme“ (položka k cudzej zákazke), „row-level security“
(cudzí správca, pracovník, správca bez kódu), „Najprv si zapni dvojstupňové overenie“. Riadky s textom v zátvorke ukazujú očakávaný výsledok.

## Weby bez servera

`mock-supabase.js` je náhrada knižnice supabase-js s dátami v `localStorage`. V prehliadači (napr. Playwright)
stačí presmerovať `vendor/supabase-2.117.2.js` na tento súbor (platný kód dvojstupňového overenia je `123456`); administrácia aj appka pracovníka potom
fungujú lokálne a vidia spoločné dáta.
