# Handoff: FinansHub-moduler, Matplan, Home OS, Domener og mobil v2

## Om filene
Filene i `design/` er **designreferanser laget i HTML** (prototyper som viser utseende og oppførsel), ikke produksjonskode. Oppgaven er å gjenskape dem i den eksisterende kodebasen (samme stack som resten av homelab/FinansHub). All demo-data i filene skal erstattes med API-kall. Fidelitet: **high-fidelity** – farger, typografi, avstander og tekster er endelige.

Les også: `README.md` (homelab), `FINANSHUB-MOBIL.md`, `CHANGES-prompt-04.md`, `CHANGES-prompt-04b.md` (Android-innlogging, IPA, bakgrunnskø, Cloudflare).

## Plassering (viktig)
| Modul | Hvor | Fil |
|---|---|---|
| Subscription OS (7) | FinansHub v2 sidemeny | `FinansHub v2 Moduler.dc.html` side `sub` |
| Delte mapper | FinansHub v2 sidemeny | side `dir` |
| Finn-handler | FinansHub v2 sidemeny | side `finn` |
| Import (CSV/XLSX/tekst) | FinansHub v2 sidemeny | side `imp` |
| Home OS (8) | Homelab v2 fane «Hjem» | side `home` |
| Matplan | Homelab v2 fane «Matplan» + mobilapp-fane | side `mat` |
| Domener (Cloudflare) | Homelab v2 fane «Domener» | side `dom` |

`FinansHub v2 Moduler.dc.html` er en intern delkomponent uten egen side; den tar `startPage`. I ekte kode: lag én komponent per side og monter dem direkte. Mobilappene er fortsatt **kun FinansHub** (+ Matplan); ikke Home OS/Domener.

## Design tokens (desktop FinansHub)
- Bakgrunn `#0A0A0C`, kort `#141418`, kantlinje `#1E1E23`, input-kant `#2A2A31`, hover/aktiv nav `#1E1E23`, underflate `#1B1B20`, skjema-boks `#101013`
- Tekst `#F2F2F4`, sekundær `#A0A0AA`, dempet `#6E6E78`
- Aksent `#FF7A3D` (tekst på aksent `#1A0C04`), aksent-lys `#FFB08A`, aksent-flate `rgba(255,122,61,.12)` + kant `rgba(255,122,61,.3)`
- Positiv `#9FE3C6` på `#1F3A2F`; blå (kjøpt) `#A9C3FF` på `rgba(122,167,255,.15)`; HelloFresh-merke `#C2E27A` på `rgba(145,193,30,.18)`
- Font: Geist 400/500/600/700, tall: Geist Mono 500/600
- Radius: kort 18, små kort 16, knapper/inputs 9–10, chips 8, logo 7–9
- Tittel 32/600 −0.02em; KPI-tall 24–28 Geist Mono; brødtekst 14; meta 12–13
- Homelab v2 bruker egne tokens (Outfit/JetBrains Mono, `#07080b`, `#a8d4fb`) – se README.md

Mobil: iOS `#07070A` + glass `rgba(255,255,255,.08)` blur 30 saturate 180, aksent `#FF7A3D`/`#FFB08A`. Android M3: flate `#19120E`, kort `#261E19`, felt `#31281F`, primærcontainer `#763300`/`#FFDBC8`, primær `#FFB68A`/`#532200`, tertiær `#45462A`/`#E6E6AE`, sekundærcontainer `#5D4033`. Roboto Flex med `wdth` 110–120 på store tall.

## Felles: logoer
`logo(navn)`: butikknavn → domene (regelliste + AI-fallback) → `https://www.google.com/s2/favicons?domain=<d>&sz=64`. Vises på hvit flate med 3–6 px padding, radius som ikonet. Proxy/cache server-side: `GET /finans/api/logo/:domain`. Eksempler: Biltema/«Bilema» → biltema.no, Ruterappen → ruter.no, Lånekassen → lanekassen.no, Proton → proton.me, HelloFresh → hellofresh.no.

## Felles: AI-sammendrag (✦)
Hver transaksjon/kvittering har et kort sammendrag (én linje, maks ~60 tegn) vist under navnet i `#FFB08A` 12 px med prefiks «✦ ». Detaljvisning (mobil) har en lengre beskrivelse (2–3 setninger) + varelinjer.
- Generer med Gemini ved bokføring/import: prompt med butikk, beløp, varelinjer, kategori → `{short, long}`. Lagre i `tx.ai_short`, `tx.ai_long`.
- Mens jobben kjører: «Gemini leser kvitteringen …».
- Prototypen bruker en regex-tabell (`AISUM`) som plassholder.

## Sider

### Subscription OS
- 3 KPI-kort (auto-fit min 200): Per måned, Per år, «Lite brukt, kan sies opp» (aksent-flate).
- «Legg til abonnement»-boks med modusknapper: **Nytt abonnement** (Tjeneste, Plan, kr/mnd, Neste trekk dd.mm → Legg til), **Kvittering** (filopplasting, flere filer, AI fyller felt), **Fra transaksjoner** (liste over siste tx; klikk gjør den til abonnement).
- Liste: logo 32 · navn+plan+✦ · neste trekk · bruk (oransje hvis lite brukt) · pris · knapp Aktiv/Si opp/Sagt opp.
- Data: `subscriptions(id,name,plan,price,cycle,next_date,usage_note,low_use,active,domain)`.

### Delte mapper
- Venstre 300 px: mappekort (navn, antall medlemmer, total), aktiv har kant `#FF7A3D`. «Ny delt mappe»: navn + inviter e-post (kommaseparert) → Opprett.
- Høyre: navn, medlemmer, total; saldo-chips per medlem (betalt − likt andel; grønn +, oransje −); «Legg til i mappen» med samme tre moduser (Ny utgift: beskrivelse, beløp, betalt av; Kvittering; Fra transaksjoner); liste med logo, beskrivelse, dato · betalt av, ✦, fordeling, beløp.
- Data: `folders`, `folder_members(role: owner|member)`, `folder_entries(folder_id, tx_id?, receipt_id?, desc, amount, paid_by, split)`. Medlemmer ser bare egne mapper. Invitasjon via e-postlenke.

### Finn-handler
- 3 KPI: Kjøpt i år, Solgt i år, Pågående. Rader: rolle-chip (Kjøpt blå / Solgt grønn), gjenstand, motpart · dato, steg-chips (fullført = grønn), beløp.
- Kilde: Finn-e-poster (Trygg betaling, Fiks ferdig, Tillit forsikring) via IMAP + AI-uttrekk, matches mot bankpost.

### Import
- «Velg filer (.xlsx, .csv, .txt)» (multiple) + tekstfelt for innliming. XLSX via SheetJS (`XLSX.read`, `sheet_to_json({header:1,raw:false})`).
- DNB-format: `Dato(MM/DD/YY) | Forklaring | Rentedato | Ut | Inn`, tusenskille komma. Rensing: fjern `Visa 100021`, `Lønn 363…`, `Varekjøp`, `Eur 1,00`, `Valutakurs…`, `Dato 12.10 kl…`; `Vipps:pal wengard` → «Vipps · Pal Wengard».
- Forhåndsvisning: logo, dato dd.mm, renset navn + ✦ + rå tekst, kategori-gjett, beløp (inn grønn). «Importer N poster» → kategorisering i bakgrunnen.

### Home OS (Homelab v2)
- 4 KPI: Boligverdi, Restgjeld (bank, rente, mnd), Faste boutgifter (spesifisert), Inventar (sum, antall).
- Rom-filter (chips, aktiv hvit). Inventar: logo butikk, navn, rom · kjøpt dato hos butikk, garanti (oransje hvis < 60 dager), kvitteringstype, verdi.
- Data: `home(value,loan,…)`, `inventory(id,name,room,store,date,price,warranty_until,receipt_id)`. Kvitteringer fra FinansHub kan sendes hit.

### Domener (Homelab v2)
- Nøkkelinfo-grid: Domene, Status, Plan, Registrar, Fornyes, SSL, Navnetjenere, Forespørsler 24 t. DNS-tabell: Type, Navn, Innhold, Proxy (Proxied oransje).
- Cloudflare API med token (Zone:Read, DNS:Read, Registrar:Read, Analytics:Read) fra Innstillinger. Cache 15 min.

### Matplan (Homelab v2 + mobil)
- Verktøylinje: «✦ Ny ukeplan med Gemini» (aksent), «Automatisk hver søndag: på/av», «Google Kalender: synkronisert/av», statustekst.
- 7 dagskort (auto-fit min 150, min-høyde 190): ukedag, kilde-chip (Gemini/HelloFresh/Fast/Egen), rett, kokk-velger, kostnad, ✦ (ny rett for dagen), «Fast» (låser retten til ukedagen; grønn når på). Dagens kort har kant `#FF7A3D`.
- HelloFresh-panel: ukas retter + målvelger (dag) → «Legg til».
- «Ny rett»: navn, kostnad, dag (eller bare bibliotek), «Fast rett denne ukedagen».
- Faste retter-liste, Kokker-liste. Handleliste med avkrysning; estimert ukekost trekkes fra «Mat og dagligvarer».
- Backend:
  - `meals(id,name,cost,source,hf_id?)`, `meal_plan(date,meal_id,cook_user_id,source)`, `fixed_meals(weekday,meal_id)`, `cooks(user_id)`.
  - Gemini: `POST /mat/api/plan {scope:'week'|'day', date}` → respekterer faste retter, siste 3 ukers historikk, budsjett og preferanser; returnerer JSON `[{date,name,cost,source,ingredients[]}]`.
  - Cron søndag 18:00 når «Automatisk» er på.
  - HelloFresh: ingen offentlig API – importer fra ukesmeny-e-post eller lim inn URL; parse oppskrift med Gemini.
  - Google Kalender: OAuth (`calendar.events`), egen kalender «Middag», hendelse 17:00–18:00 per dag, kokk som deltaker (e-post), oppdater ved endring (lagre `event_id`).

## Mobil v2 (`FinansHub Mobil v2.dc.html`)
- **Profilbilde** åpner meny: segment Finans | Matplan, liste «Andre OS» (Subscription OS, Delte mapper, Finn-handler), iOS: bryter «Fargebakgrunn» (`fh_ios_bg`), Android: Server-felt (lokal adresse, passord, Koble til).
- Faner: Hjem, Liste, Budsjett, Matplan. Skanne-/FAB-knapp åpner **Last opp**.
- **Last opp**: velg flere filer; hver fil i kø med status I kø → «Gemini leser … N %» → «Klar · trykk for å bekrefte». Pille på forsiden viser fremdrift. Kø kjører i bakgrunnen (iOS URLSession background, Android WorkManager), push når ferdig.
- **Utgiftsdetalj**: trykk på rad → logo 60, navn, dato, beløp, ✦ AI-beskrivelse-kort (iOS glass / Android primærcontainer), varelinjer, metadata (Kategori, Konto, Kvittering, Delt mappe).
- **Budsjett**: oppsummering (Budsjett, Brukt, Dager igjen) + per kategori: brukt/total, stolpe, «X kr igjen · Y kr/dag» eller «Over med X kr», «% brukt», chips: antall kjøp, mest brukt butikk, trend mot forrige måned.
- **Søkefelt**: SVG-forstørrelsesglass 18 px, høyde 46 (iOS) / 56 (Android), placeholder «Søk i transaksjoner».
- **Android hjem-kort**: «Inn i oktober» (pil-badge, 7 mini-stolper, siste grønn) og «Spart i år» (konisk ring 58 px mot årsmål, beløp av mål, gjenstående). Asymmetriske M3-hjørner 28/10.

## Homelab v2 topplinje
Venstrejustert (`justify-content:flex-start`). Innstillinger → Utseende → Topplinje: «Mellomrom mellom seksjoner» 0–120 px (`hl_head_gap`, std 16), «Mellomrom mellom faner» 0–40 (`hl_tab_gap`, std 2), «Bredde på faner» 6–24 px horisontal padding (`hl_tab_pad`, std 12). Nye faner: Hjem, Matplan, Domener (mellom Økonomi og Nettverk).

## API-oversikt (nye)
```
GET/POST   /finans/api/subscriptions
GET/POST   /finans/api/folders            POST /finans/api/folders/:id/entries  POST /finans/api/folders/:id/invite
GET        /finans/api/finn
POST       /finans/api/import             (multipart: csv/xlsx/txt, flere filer)
POST       /finans/api/receipts           (flere filer → jobb-id-er)   GET /finans/api/receipts/jobs (SSE)
GET        /finans/api/logo/:domain
POST       /finans/api/login              (token for mobil)
GET/POST   /mat/api/plan   /mat/api/meals   /mat/api/fixed   POST /mat/api/calendar/sync
GET        /home/api/inventory  /home/api/property
GET        /domains/api/cloudflare
```

## Filer
- `design/FinansHub v2.dc.html` – desktop FinansHub med nye menypunkter
- `design/FinansHub v2 Moduler.dc.html` – alle nye moduler (sider via `startPage`)
- `design/Homelab v2.dc.html` – faner Hjem/Matplan/Domener, topplinje-innstillinger
- `design/FinansHub Mobil v2.dc.html` – iOS (1a), Android (1b), brettbar (1c)
- `prompts/prompt-04.md` – brukerens ønsker ordrett
