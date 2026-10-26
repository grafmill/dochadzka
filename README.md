# Dochádzka na stavbe

Dochádzka pre stavebnú firmu: mobilná appka pre pracovníkov a webová administrácia pre zamestnávateľa.

| Časť | Adresa (GitHub Pages) | Súbor |
|---|---|---|
| Appka pre pracovníka (PWA) | https://grafmill.github.io/dochadzka/ | `index.html`, `sw.js`, `manifest.json` |
| Administrácia | https://grafmill.github.io/dochadzka/admin/ | `admin/index.html` |
| Databáza (PostgreSQL / Supabase) | – | `supabase/migrations/*.sql` |
| Pripojenie na server | – | `config.js` |

Appka v mobile: otvor odkaz od zamestnávateľa a pridaj si appku na plochu
(Android: menu ⋮ → Pridať na plochu / Inštalovať, iPhone: Safari → Zdieľať → Pridať na plochu).

## Ako to funguje

- **Zamestnávateľ** sa zaregistruje v administrácii (e-mail + heslo), pridá pracovníkov, zákazky, úlohy a sadzby.
- **Pracovník** dostane odkaz s kódom (`…/dochadzka/?kod=ABCD1234`). Appka sa ním prihlási bez e-mailu a hesla.
- Záznamy sa ukladajú najprv v mobile a odošlú sa hneď, ako je signál (offline režim).
- Úpravu času pracovníkom označí databáza sama (červený výkričník, pôvodný čas ostáva) – pracovník ju nevie skryť.
- **Kto je kde**: hlavná obrazovka administrácie je zoskupená podľa zákaziek (ľudia, úlohy, rozpočet, upozornenia).
  V mobile má spodnú lištu a ostatné veci sú v Menu. Administrácia sa dá pridať na plochu ako samostatná appka.
- **Zálohy a vyúčtovanie**: Doplatiť = cena práce − zálohy ± hotovosť − mínus z minulého mesiaca; mínus sa prenáša sám.
- **Pokladňa**: hotovosť daná na nákup svieti ako nevyúčtovaná, kým pracovník nepošle fotku bločku a správca ju nepotvrdí.
  Nákup za vlastné peniaze sa po potvrdení pripočíta k výplate.
- Bezpečnosť je v databáze (Row Level Security): pracovník vidí a zapisuje len svoje záznamy, zamestnávateľ celú svoju firmu.

## Nasadenie

Návod krok za krokom: [docs/NAVOD-SUPABASE.md](docs/NAVOD-SUPABASE.md).

Riešenie je prenositeľné: databáza je čistý PostgreSQL (zo Supabase sa používa len prihlasovanie `auth.*`
a úložisko fotiek `storage.*`), weby sú statické súbory bez buildu. Pri presune k zákazníkovi stačí
spustiť migrácie na novom serveri a zmeniť `config.js`.

## Knižnice (v `vendor/`, bez CDN)

supabase-js 2.117.2 (MIT), Leaflet 1.9.4 (BSD-2), SheetJS xlsx 0.18.5 mini (Apache-2.0). Mapové podklady © OpenStreetMap.

## Testy

Pozri [test/README.md](test/README.md).
