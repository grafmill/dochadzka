# HANDOFF – Dochádzka (GRAFMILL)

Odovzdávací súhrn pre zlúčenie do novej spoločnej aplikácie. Stav k 3. 11. 2026.
Zdroj pravdy je repozitár `grafmill/dochadzka`, vetva `main` (po PR #10).

---

## 1. Účel a miesto v procese zákazky

**Účel:** dochádzka pracovníkov na zákazkách (mobilná appka + webová administrácia), z ktorej sa počíta cena práce, výplaty a výsledok (zisk) zákazky.

| Časť procesu zákazky | Rieši tento projekt? |
|---|---|
| CAD, výkresy | **Nie** |
| Príprava výroby (nesting, rezné plány) | **Nie** (nesting je iný projekt, `grafmill/grafmill-web`, prepojenie len navrhnuté) |
| Ohýbanie | **Nie** |
| Kooperácie | **Nie** samostatne. Faktúru od kooperanta je možné zapísať ručne ako náklad zákazky (doklad → položka → kategória). |
| Kalkulácia | **Čiastočne**: nie predbežná kalkulácia ceny, ale *dodatočný výsledok*: predajná cena − (náklady z dokladov + vlastná práca) = zisk, rozpočet práce s upozornením. |
| Výstupy | **Áno**: mesačné výkazy (na pracovníka, na zákazku, jeden pracovník na A4), výplaty (zálohy, hotovosť, doplatok), Excel, PDF (tlač), výsledok zákazky, pokladňa. |

Čo projekt rieši: **kto, kedy, kde a na čom robil** (dochádzka podľa zákazky a úlohy, GPS, fotky, poznámky), **mzdové náklady** (sadzby, zaokrúhľovanie, výplaty, zálohy, hotovosť), **náklady a zisk zákaziek** (1. etapa), **výstupy** (výkazy, exporty).

---

## 2. Stav

### Hotové a funguje (nasadené, SQL 0001–0007 spustené v Supabase)
- **Appka pre pracovníka (PWA)** – https://grafmill.github.io/dochadzka/ – Android aj iOS, inštalácia na plochu, offline režim (outbox), prihlásenie 8-znakovým kódom z odkazu `?kod=…`.
  Príchod / presun na inú zákazku / Odchod, výber zákazky (+ „Iné“), úloha 0–99 (rýchla voľba číslom), poznámka, fotka, priebežné hodiny, úprava času (označí sa červeným „!“), prestávky (ak sú zapnuté), GPS so súhlasom a automatický výber zákazky podľa polohy, QR/čiarový kód zákazky, upozornenie na zabudnutý odchod, nočná zmena, pokladňa (bloček k vydanej hotovosti, nákup za vlastné), obrazovka Ochrana údajov.
- **Administrácia zamestnávateľa** – https://grafmill.github.io/dochadzka/admin/ – registrácia e-mail + heslo, voliteľné 2FA (TOTP), mobilná verzia so spodnou lištou.
  Kto je kde (podľa zákaziek, živo, obnova 30 s), zákazky (mapa Leaflet, okruh, rozpočet, kód + tlač QR štítkov), pracovníci (TPP / živnostník, sadzba, zaradenie s predvolenou úlohou, pozvánkový odkaz, deaktivácia, anonymizácia), úlohy 0–99, sadzby s výnimkami, neprítomnosť (dovolenka/PN/voľno, len TPP), ručné záznamy, výkazy + Excel/PDF, výkaz jedného pracovníka na 1 A4 (aj bez peňazí), zálohy a vyúčtovanie, Pokladňa / hotovosť, Nastavenia (GPS, prestávky, zaokrúhľovanie, typ práce teren/sídlo, fotky/poznámky, zameranie firmy, GDPR prevádzkovateľ, lehoty mazania).
- **Náklady a zisk zákaziek – 1. etapa** (PR #8): predajná cena, odberateľ, stav zákazky, doklady (faktúra/bloček/iné) s položkami rozdelenými na zákazky a kategórie, výsledok zákazky cena − náklady = zisk.
- **GDPR**: GPS len pri Príchode a so súhlasom, mazanie GPS po 90 dňoch a fotiek po 365 dňoch, export údajov pracovníka, anonymizácia. Podklady `docs/gdpr.html` (finálne má potvrdiť právnik).
- **Návody**: všeobecné (`docs/navod-pracovnik.html`, `docs/navod-zamestnavatel.html`) a pre klienta PROFE Industry (`docs/profe/`).
- **Prvý klient PROFE Industry** (kovovýroba Žilina): firma založená v administrácii, prezentácia, návody a balík pre klienta.

### Rozrobené / čaká na rozhodnutie
- **Náklady zákaziek, etapa 2**: bločky z Pokladne automaticky do nákladov zákazky – čaká na „pokracuj“.
- **Etapy 3–5** (len návrh, `/mnt/project-files/navrhy/navrh-sprava-zakaziek.html`): faktúry (PAY by square, neskôr e-faktúra XML), prepojenie s nestingom, plán, stroje, réžia, prehľady.
- **Upratanie PC priečinka** (vlákno „Uložiť, upratať a zálohovať“): navrhnuté zmazanie duplikátov, čaká na súhlas používateľa.
- **Finálny hosting u zákazníka**: rozhodnuté, že sa nerieši teraz (pozri nižšie).

### Opustené / odložené
- **AI vyčítanie faktúr** – vynechané (nie je jasné, ako to účtovať zákazníkom).
- **Vlastné servery** (VPS `iqzumpa-01`, Websupport hosting) – na testovanie sa nepoužívajú; beží GitHub Pages + Supabase free.
- **Schvaľovanie úprav času** – zámerne nie (úprava sa len označí).
- **Prístup pre zákazníka (odberateľa)** – zatiaľ nie.
- **Prvá verzia appky bez servera** (`/mnt/project-files/appka-pracovnik/`) – zastaraná, nahradená repom.

---

## 3. Štruktúra súborov

### Repozitár `grafmill/dochadzka`
| Cesta | Obsah |
|---|---|
| `index.html`, `sw.js`, `manifest.json`, `icon-*.png` | Appka pracovníka (jeden HTML súbor, vanilla JS, bez buildu) |
| `admin/index.html` | Administrácia (jeden HTML súbor, vanilla JS) |
| `admin/naklady.js` | Modul Náklady a zisk zákaziek (načítaný pred hlavným skriptom admin) |
| `admin/manifest.json`, `admin/sw.js` | PWA administrácie |
| `config.js` | URL a verejný kľúč Supabase (jediné miesto na zmenu servera) |
| `supabase/migrations/0001…0007_*.sql` | **Tabuľky, RLS, funkcie** – celá databáza |
| `test/` | `rls-test.sql`, `rls-naklady.sql` (testy bezpečnosti), `supabase-stub.sql` (náhrada auth/storage pre čistý Postgres), `mock-supabase.js` (appky bez servera, dáta v localStorage) |
| `docs/` | Návody (HTML), GDPR podklady, `NAVOD-SUPABASE.md` (nasadenie) |
| `docs/profe/` | Návody pre PROFE Industry v ich farbách + logá |
| `vendor/` | Knižnice a písma (bez CDN) |

### Zdieľaná zložka projektu `/mnt/project-files/`
| Cesta | Obsah | Aktuálne? |
|---|---|---|
| `navrhy/navrh-sprava-zakaziek.html` | Návrh správy zákaziek s nákladmi (etapy 1–5) | áno, ako podklad |
| `navrhy/ukazka-vykaz-pracovnika.pdf` | Vzor výkazu jedného pracovníka | áno |
| `profe-industry/` | Logá, návody PDF/HTML, balíky ZIP pre klienta, postup založenia firmy | áno (ZIP obsahuje heslo správcu PROFE – nezdieľať) |
| `server/` | Kópie SQL 0001–0003, 0007, návod Supabase, zistenia o serveroch | čiastočne (úplné SQL sú v repe) |
| `zalohy/Dochadzka_ZALOHA_2026-11-02.zip` | Záloha: repo s históriou (git bundle) + PC priečinok + podklady, bez dát Supabase | áno |
| `zalohy/sync-2026-11-02/` | Súbory použité na synchronizáciu PC | dočasné |
| `appka-pracovnik/`, `navody/`, `export/` | Staršie verzie | **zastarané** |

### PC používateľa
- `C:\Users\26605\Desktop\PROJEKTY\Dochadzka` – zrkadlo repa (po PR #10) + balíky PROFE.
- `C:\Users\26605\Desktop\PROJEKTY\Zalohy\Dochadzka_ZALOHA_2026-11-02.zip` – záloha.

### Šablóny a vzorové podklady
- Predvolené úlohy podľa zamerania firmy (Stavebná / Kovovýroba / Všeobecná) – v SQL (0001, 0006) a v administrácii.
- Predvolené kategórie nákladov – v `0007_naklady_zakaziek.sql`.
- Vzor výkazu: `navrhy/ukazka-vykaz-pracovnika.pdf`. Vzor predajnej prezentácie: PROFE (artifact, súkromný).

---

## 4. Vstupy a výstupy

### Vstupy
| Odkiaľ | Dáta |
|---|---|
| Pracovník (mobil) | záznam `entries`: `id` (UUID z mobilu), `worker_id`, `project_id` (null = Iné) + `other_text`, `task_num` 0–99, `note`, `photos[]`, `start_at`, `end_at`, `start_orig`/`end_orig` + `edited`, `gps_start` `{lat,lng,acc,auto}`, `breaks` `[{start,end}]` v ms, `cont_in`/`cont_out` (presun), súhlas s GPS; bloček k hotovosti (`spent`, fotky, poznámka) |
| Zamestnávateľ | firma (`companies`: sadzba, GPS, okruh, prestávky, zaokrúhľovanie, typ práce, zameranie, lehoty, koeficient TPP, prah marže, 2FA), pracovníci (`workers`: meno, telefón, typ TPP/SZCO, sadzba, zaradenie, predvolená úloha), zákazky (`projects`: názov, adresa, lat/lng, okruh, rozpočet práce, kód), úlohy (`tasks`), výnimky sadzieb (`rates`), neprítomnosť (`absences`), zálohy (`advances`), hotovosť (`cash_items`), financie zákazky (`project_finance`: odberateľ, cena bez DPH, stav, termín), doklady (`cost_docs` + `cost_items`: dodávateľ, číslo, dátum, DPH, súbory, položky suma bez DPH → zákazka + kategória) |
| Formáty | JSON cez Supabase REST/RPC; fotky JPEG v Supabase Storage (`fotky`, `doklady`); QR/čiarový kód = text kódu zákazky |

### Výstupy
- **Kto je kde** (živý prehľad podľa zákaziek, upozornenia na rozpočet, zabudnutý odchod, nevyúčtovanú hotovosť).
- **Výkazy za mesiac**: na pracovníka (dni, hodiny, cena práce, zálohy, hotovosť, prenos, doplatiť, neprítomnosť, počet úprav), na zákazku, jeden pracovník (denný rozpis, súčty na zákazku/úlohu, A4, s peniazmi aj bez).
- **Excel** (SheetJS): `dochadzka-RRRR-MM.xlsx`, `vykaz-<meno>-RRRR-MM[-hodiny].xlsx`, `pokladna-<dátum>.xlsx`, `udaje-<meno>.xlsx` (GDPR export).
- **PDF**: tlač prehliadača (`window.print`).
- **QR štítky** zákaziek na tlač.
- **Výsledok zákazky**: cena, náklady podľa kategórií, práca podľa úloh (hodiny + €), zisk a marža v %.

---

## 5. Výpočtové pravidlá a vzorce

*Ohyby, prídavky, kooperácie, časy strojov: projekt nerieši.*

- **Odpracovaný čas záznamu** = (koniec − začiatok) − súčet prestávok; otvorený záznam počíta po „teraz“.
- **Zaokrúhľovanie** (voliteľné, krok 5/10/15/30 min): len prvý príchod a posledný odchod dňa (nie presun, `cont_in`/`cont_out`).
  - v prospech zamestnanca (predvolené): príchod nadol, odchod nahor;
  - na najbližší;
  - v prospech firmy: príchod nahor, odchod nadol.
  Uloží sa skutočný čas, zaokrúhlený sa len počíta.
- **Hodinová sadzba záznamu**: najkonkrétnejšia výnimka z `rates` (skóre: úloha 4 + zákazka 2 + pracovník 1, vyhrá najvyššie) → inak sadzba pracovníka → inak základná sadzba firmy.
- **Cena práce (mzda)** = hodiny × sadzba. Sadzba = mzda pracovníka, nie predajná cena pre zákazníka.
- **Výplata za mesiac**: `Doplatiť = cena práce − zálohy ± hotovosť + prenesený mínus`. Mínus sa prenáša do ďalšieho mesiaca automaticky (`carry = min(0, práca + hotovosť − zálohy + carry)`), nič sa neukladá.
- **Hotovosť**: rozdiel bločku a vydanej sumy do limitu (predvolene 2 €) sa odpíše sám; väčší → Vrátil / Z výplaty / Odpísať. Doklad do 3 dní (nastaviteľné), potom červené. Nákup za vlastné sa po potvrdení pripočíta k výplate.
- **Záloha** vyššia než zarobené → červené upozornenie (uložiť sa dá).
- **Náklad práce na zákazke** = cena práce × koeficient (TPP: `tpp_coef`, predvolene 1,36 = odvody zamestnávateľa; živnostník 1,0).
- **Výsledok zákazky** = predajná cena (bez DPH) − (súčet položiek dokladov bez DPH + náklad práce). Marža % = zisk / cena. Farba: záporný = červená, pod `margin_warn_pct` (10 %) = oranžová.
- **Rozpočet práce zákazky**: upozornenie pri `budget_warn_pct` (80 %) – počíta sa z ceny práce **bez** koeficientu TPP.
- **GPS**: vzdialenosť od zákazky (haversine, `dist_m`), okruh predvolene 500 m (50–5000); pri Príchode sa vyberie najbližšia zákazka v okruhu.
- **Zabudnutý odchod**: podľa `max_shift_hours` (12 h) od príchodu (nie podľa dátumu); hodiny sa rátajú do dňa príchodu. Pripomenutie v appke po `forgot_checkout_hour` (18:00).
- Ceny sú všade bez DPH; DPH dokladu je len informatívne.

---

## 6. Technológie a závislosti
- Statické weby bez buildu: HTML + vanilla JavaScript, PWA (service worker, manifest), hosting GitHub Pages.
- Backend: **Supabase** (free, org GRAFMILL s.r.o.): PostgreSQL + Row Level Security, Auth (e-mail+heslo pre správcu, anonymné prihlásenie + kód pre pracovníka, TOTP MFA), Storage na fotky a doklady. Databáza je čistý Postgres; zo Supabase sa používa len `auth.*` a `storage.*` → prenositeľné.
- Knižnice vo `vendor/`: supabase-js 2.117.2, Leaflet 1.9.4 (+ mapy OpenStreetMap), SheetJS xlsx 0.18.5 mini, html5-qrcode 2.3.8, qrcode-generator 1.4.4, písma Barlow / Barlow Condensed (bez Google Fonts).
- Testy: lokálny PostgreSQL 15+ so stubom, Playwright s `mock-supabase.js` (kód 2FA v mocku `123456`).
- Pripojenie: `config.js` (URL + verejný publishable kľúč). Tajný kľúč (service role) sa nikde nepoužíva a nie je v repe.

---

## 7. Repozitáre, vetvy, PR
- **Repo:** https://github.com/grafmill/dochadzka (public), vetva `main`, GitHub Pages z `main`.
- **PR #1–#10 sú všetky zlúčené**, otvorené PR neexistujú (okrem PR s týmto súborom).
  #1 administrácia + Supabase · #2 deaktivácia pracovníkov, nočná zmena · #3 mobilná administrácia, zálohy, pokladňa · #4 návody + GDPR · #5 prevádzkovateľ v poliach, zaokrúhľovanie, práca v sídle, QR · #6 návod: sadzba = mzda · #7 zameranie firmy, zaradenie, výkaz pracovníka · #8 náklady a zisk zákaziek + 2FA · #9, #10 návody PROFE.
- Staré pracovné vetvy `claude/project-thread-*` (0vrk3h, f76oa5, fhjypv, msgisx, rk6dtu) sú zlúčené, dajú sa zmazať.
- Súvisiace repo (nie súčasť projektu): `grafmill/grafmill-web` (nesting `laser.grafmill.sk`), `grafmill/iqzumpa-server` (VPS).

---

## 8. Vlákna projektu
| Vlákno | Čo vzniklo | Aktuálne? |
|---|---|---|
| Vytvoriť appku pre pracovníka | Prvá PWA pre pracovníka, nasadenie na GitHub Pages | Áno (kód ďalej vyvíjaný v repe) |
| Zistiť server pre dochádzku | Prehľad serverov GRAFMILL a odporúčanie VPS | Nie – rozhodnuté GitHub Pages + Supabase |
| Vytvoriť administráciu zamestnávateľa | Administrácia, databáza Supabase, zálohy, pokladňa, mobilná verzia (PR #1–#3) | Áno |
| Napísať návody a GDPR podklady | Návody pre pracovníka a zamestnávateľa, GDPR úpravy, zaokrúhľovanie, práca v sídle, QR (PR #4–#6) | Áno |
| Sledovať náklady a zisk zákaziek | Návrh správy zákaziek (5 etáp) a 1. etapa + 2FA (PR #8) | Áno; etapa 2+ čaká |
| Navrhnúť zameranie firmy a zaradenie pracovníkov | Zameranie firmy, predvolená úloha pracovníka, výkaz jedného pracovníka na A4 (PR #7) | Áno |
| Pripraviť dochádzku a prezentáciu pre Profe Industry | Predajná prezentácia, návody v ich farbách, balík pre klienta (PR #9, #10) | Áno |
| Uložiť, upratať a zálohovať projekt Dochádzka | Synchronizácia PC, záloha ZIP 2026-11-02, návrh upratania | Záloha áno; upratanie čaká na súhlas |
| Pripraviť odovzdávací súhrn projektu Dochádzka | Tento `HANDOFF.md` | Áno |

---

## 9. Čo prevziať do novej aplikácie
**Prevziať:**
- Dátový model a RLS zo `supabase/migrations/` (firma → pracovníci, zákazky, úlohy, záznamy, sadzby, neprítomnosť, zálohy, hotovosť, financie zákaziek, doklady). Najmä: offline záznamy s UUID z mobilu, označenie úpravy pracovníkom databázou, oddelenie `project_finance` od `projects` (pracovníci nevidia ceny), finančné dáta len pre správcu s 2FA.
- Výpočty z bodu 5 (sadzby, zaokrúhľovanie, výplata s prenosom mínusu, hotovosť, náklad práce s koeficientom TPP, výsledok zákazky).
- Appku pracovníka ako samostatnú jednoduchú PWA (minimum klikania) – v novej appke by mala ostať jednoduchá.
- Zákazku ako spoločný objekt: dochádzka a náklady sa majú viazať na rovnakú zákazku ako CAD/výroba/kalkulácia v novej appke (napr. číslo zákazky / kód QR).
- GDPR riešenie (súhlas, lehoty mazania, export, anonymizácia) a testy RLS.
- Návody a prezentáciu ako podklad (po úprave názvov).

**Neprevziať / prerobiť:**
- Architektúru „jeden veľký HTML súbor“ (admin ~160 KB) – v spoločnej appke rozdeliť na moduly.
- Predvolené stavebné úlohy napevno v SQL funkcii registrácie.
- Staré kópie v `/mnt/project-files/appka-pracovnik/`, `navody/`, `export/`.
- PROFE-špecifické veci (heslo správcu, ZIP balíky) do spoločného kódu.
- Napojenie na konkrétny projekt Supabase – v novej appke nové prostredie a migrácia dát.

---

## 10. Otvorené otázky a známe problémy
- **Kalkulácia vs. výsledok**: v novej appke rozhodnúť, či predbežná kalkulácia (ceny materiálu, laseru, ohýbania, kooperácií) a výsledok zákazky z tohto projektu majú byť jedna obrazovka.
- **Nákladové ceny pre nesting** (nákupná €/kg, hodina laseru) – chýbajú; nesting má len predajné ceny.
- **Etapa 2** (bločky z Pokladne do nákladov) a ďalšie etapy – čakajú na rozhodnutie.
- **AI vyčítanie faktúr** – nevyriešené obchodné podmienky.
- **Hosting u zákazníka** – riešenie je prenositeľné, ale migráciu dát (nie len štruktúry) zatiaľ nikto netestoval. Záloha neobsahuje dáta zo Supabase.
- **Supabase free**: projekt sa po neaktivite pozastavuje, limit úložiska fotiek – pre ostrú prevádzku platený plán alebo vlastný server.
- **iPhone**: po pridaní na plochu treba kód zadať znova (oddelené úložisko Safari a PWA).
- Mazanie starých GPS a fotiek spúšťa administrácia pri prihlásení (nie plánovač) – ak sa nikto neprihlási, nemaže sa.
- Prehľad „Kto je kde“ sa obnovuje každých 30 s, nie realtime.
- Jedna firma = jeden správca (viac správcov / role majiteľ–majster–účtovníčka len navrhnuté).
- PDF je tlač prehliadača, nie generovaný súbor.
- GDPR podklady má finálne potvrdiť právnik.
- Z cloudových relácií nie je sieťový prístup na Supabase; testovalo sa lokálne (Postgres + mock).
- Upratanie duplikátov v PC priečinku čaká na súhlas.

---

**Kontakt dodávateľa:** Peter Melek, GRAFMILL, s.r.o., IČO 44398255, +421 948 266 050, grafmill@gmail.com, grafmill.sk
