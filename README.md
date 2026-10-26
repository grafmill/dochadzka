# Dochádzka

Dochádzka pre firmy, ktoré pracujú na zákazkách (v teréne aj v sídle firmy): mobilná appka pre pracovníkov a webová administrácia pre zamestnávateľa.

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
- **Ochrana údajov (GDPR)**: poloha len pri Príchode a len so súhlasom (s dátumom a časom), GPS súradnice a fotky k práci
  sa po nastaviteľnej lehote mažú, anonymizácia bývalého pracovníka, export údajov pracovníka, obrazovka „Ochrana údajov“
  v appke. Podklady a návody: [docs/gdpr.html](docs/gdpr.html), [docs/navod-pracovnik.html](docs/navod-pracovnik.html),
  [docs/navod-zamestnavatel.html](docs/navod-zamestnavatel.html).
- **Typ práce**: *v teréne* (zákazky na rôznych miestach, GPS podľa nastavenia) alebo *v sídle firmy* (bez GPS;
  bez zákaziek len Príchod/Odchod, so zákazkami „Na čom robím“). Fotky a poznámky sa dajú vypnúť.
- **QR / čiarový kód zákazky**: pole Kód pri zákazke, tlač QR štítkov v administrácii, pracovník kód naskenuje
  a appka zapíše Príchod alebo presun. Fotoaparát beží len počas skenovania, obraz sa nikam neposiela.
- **Zaokrúhľovanie času** (5/10/15/30 min, v prospech zamestnanca / na najbližší / v prospech firmy): len prvý príchod
  a posledný odchod, nie presun medzi zákazkami (`cont_in`/`cont_out`). Skutočný čas sa ukladá presne.
- Bezpečnosť je v databáze (Row Level Security): pracovník vidí a zapisuje len svoje záznamy, zamestnávateľ celú svoju firmu.

## Nasadenie

Návod krok za krokom: [docs/NAVOD-SUPABASE.md](docs/NAVOD-SUPABASE.md).

Riešenie je prenositeľné: databáza je čistý PostgreSQL (zo Supabase sa používa len prihlasovanie `auth.*`
a úložisko fotiek `storage.*`), weby sú statické súbory bez buildu. Pri presune k zákazníkovi stačí
spustiť migrácie na novom serveri a zmeniť `config.js`.

## Knižnice (v `vendor/`, bez CDN)

supabase-js 2.117.2 (MIT), Leaflet 1.9.4 (BSD-2), SheetJS xlsx 0.18.5 mini (Apache-2.0),
html5-qrcode 2.3.8 (Apache-2.0, čítanie QR a čiarových kódov), qrcode-generator 1.4.4 (MIT, tlač QR štítkov), písma Barlow a Barlow Condensed
(SIL OFL, `vendor/fonts/`, bez Google Fonts). Mapové podklady © OpenStreetMap.

## Testy

Pozri [test/README.md](test/README.md).
