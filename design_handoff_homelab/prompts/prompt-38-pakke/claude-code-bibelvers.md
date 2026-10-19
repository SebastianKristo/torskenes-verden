# Dagens bibelvers: Now Brief, Hjem-widget og widgets for iOS, Android og Samsung

Ønske 2026-10-19: «lag et kort i now brief om morgen og kveld og en app widget for hjem i app og for ios android og samsung. dette skal være daglig bibelvers.»
Fasit: `Bibelvers.dc.html` (`mode="overview"` viser alt; `mode="brief"` er kortet i briefen; `mode="home"` er widgeten på Hjem). Innbygd i `Glimt Brief.dc.html` (etter Vær) og i `Mobil Papir App.dc.html` (Hjem, under brief-kortet).

## Tekst og kilde
- **Bibelen 1930-oversettelsen** (Det Norske Bibelselskap). Fri bruk, og den er brukt i prototypen. Bibel 2011 er opphavsrettsbeskyttet og krever avtale med Bibelselskapet.
- Lag en egen tabell `bible_verses` (`ref`, `text`, `period: morgen|kveld`, `tags`) med minst 365 + 365 vers. Det velges **ett vers per dag og periode**, deterministisk (`dayOfYear % antall`), så alle enheter viser det samme verset.
- Morgen: håp, styrke og nåde (Klag 3,22–23, Sal 118,24, Fil 4,13, Jes 41,10, Sal 23,1 …). Kveld: fred, hvile og trygghet (Sal 4,9, Matt 11,28, 1 Pet 5,7, Joh 14,27 …).
- Valgfritt på sikt: oversettelse i innstillinger (1930 / 2011 med lisens / engelsk KJV).

## Now Brief
- **Morgenbrief (05–11) og kveldsbrief (17–05)**: kortet «MORGENVERS · GLIMT» / «KVELDSVERS · GLIMT» med dato til høyre, verset i Newsreader kursiv 22 px med «…», og referansen i fet skrift.
  - Morgen: varm fersken-gradient. Kveld: dyp indigo med svak gyllen glød.
- Knappene **Kopier** (kopierer «vers» + ref, og viser «Kopiert» i 1,6 s) og **↻** (nytt vers, bare for denne visningen).
- Glimt leser verset høyt når stemme er på («Dagens vers er fra Salme 4 …»).
- Vises ikke i dagsbriefen (11–17).

## Hjem i appen
- Widget «DAGENS BIBELVERS» (ref til høyre, vers i kursiv 19 px) i papir-temaet. Kan flyttes, skjules og endres i størrelse i wiggle-modus som de andre widgetene.
- Trykk åpner et ark med hele verset, konteksten (versene før og etter), Del og Kopier.

## Hjemskjerm og låseskjerm
- **iOS (WidgetKit):**
  - Liten (2×2): «BIBELVERS», vers (maks 5 linjer) og ref.
  - Medium (4×2): morgen- eller kveldsvarianten med gradient.
  - Låseskjerm rektangulær: «✝︎ Salme 4,9» + 2 linjer.
  - Timeline: oppdater kl. 05:00 og 17:00 (`TimelineReloadPolicy.after`).
- **Android (Glance / Material You):** 4×2 med dynamiske farger, ✝-brikke, «Dagens vers», vers og ref. Rund 2×2-variant (ref + «Trykk for å lese»).
- **Samsung (One UI):** 4×2 med hvit glass-bakgrunn, «Bibelvers» + dato, vers, ref og «Neste ›». Bruker One UI-radius og SamsungOne-font.
- Trykk på en widget åpner verset i appen. «Neste ›» (Samsung/Android) bytter til morgendagens vers bare i widgeten.

## Innstillinger
Innstillinger → Glimt → **Bibelvers**: på/av, i morgenbrief og/eller kveldsbrief, varsel kl. 07:00 og 21:00 (av som standard), oversettelse.


## Bare for brukeren Sebastian
Ønske 2026-10-19: «bibelvers, i now brief og i hjem på appen skal bare brukeren sebastian ha.»
- Bibelvers er en **personlig modul per bruker**, ikke felles for husstanden. Standard er **på for `sebastian`** og **av for alle andre**.
- Backend: `user_features` (`user_id`, `feature='bible_verse'`, `enabled`, `morning`, `evening`, `notify`). Migrering: `enabled=true` bare for brukernavn `sebastian`.
- Når den er av: **ingen** kort i Now Brief, **ingen** Hjem-widget, ikke tilgjengelig i «+ Legg til widget», ikke i Glimt-svar og ikke i oppleste brief. Hjemskjerm- og låseskjerm-widgeten finnes ikke i widget-galleriet for den brukeren (`WidgetCenter`: returner tom konfigurasjon / Android: `isEnabled=false` på receiver per konto).
- Innstillinger → Glimt → Bibelvers vises **bare** for brukere som har modulen. Admin kan slå den på for andre under Brukere → [bruker] → Moduler.
- Prototype: `Bibelvers.dc.html` tar `user` (prop eller `hl_user`) og `allowed` (standard `['sebastian']`). `Mobil Papir App` viser Hjem-widgeten bare når `userName` er Sebastian. Oversikten (`mode="overview"`) vises alltid, for design.


## Hjem: verset forsvinner når det er lest, eller sveipes bort → nederst i briefen
Ønske 2026-10-19: «dagens bibelvers når appen er åpen om morgenen og man har vært på hjemskjermen lenge nok til å lese den, fjern den neste gang man åpner appen, eller la man sveipe den vekk fra venstre til høyre, så resten av dagen legg det i bunnen av brief.»
Fasit: `Bibelvers.dc.html` (`hiddenHome()`, `sw`, `place`) og `Glimt Brief.dc.html` (to plasseringer).
- **Lest:** Hjem-widgeten måler hvor lenge den har vært **synlig** på skjermen (IntersectionObserver ≥ 60 %, appen i forgrunnen). Lesetid = 4 s + 45 ms per tegn (maks 14 s). Når tiden er nådd, settes `read` for i dag.
  - Verset blir stående **resten av denne økten**, så det ikke rykkes bort mens man ser på det.
  - **Neste gang appen åpnes** (ny økt / fra bakgrunnen etter > 5 min) samme dag, vises det ikke på Hjem.
- **Sveip bort:** venstre → høyre på kortet (samme gest og animasjon som brief-kortet):
  - Feltet bak blir grønt ved 38 %, med teksten «✓ Slipp for å skjule · Nederst i briefen resten av dagen».
  - Kortet flyr ut, høyden kollapser, og det kommer haptikk.
- **Etterpå (resten av dagen):** verset står **nederst i Now Brief** (over «Laget av Glimt …»), uansett tid på dagen. Det står ikke lenger øverst i morgen- eller kveldsbriefen. Ny dag nullstiller alt.
- Lagring: `bibel_home = {d: dato, read, gone, s: økt}` per bruker og enhet. Synkes ikke (lest på mobil betyr ikke lest på web).


## Bibel-side (bare Sebastian): rekke, leseplan og lagrede vers
Ønske 2026-10-20: «lag en bibelside med days streak og bibelting».
Fasit: `Bibelvers.dc.html` → `mode="page"` (`pageVals()`). Den åpnes fra **Mer → Bibel** (raden finnes bare for Sebastian) og ved trykk på Hjem-kortet «Dagens bibelvers».
- **Rekke-kort** (indigo, gyllen glød):
  - Flamme-brikke (oransje og vuggende når dagens er lest, ellers dempet).
  - Stort tall «7 dager på rad» og «LENGSTE 12 dager».
  - **Uke-prikker** M–S, der ✓ betyr lest og dagens dag har ring.
  - Hint: «Les dagens vers for å holde rekken på 7 dager.» / «Bra! Kom tilbake i morgen.»
- **Dagens vers** (morgen/kveld-farge):
  - **Jeg har lest** teller i rekken, med haptikk og grønn «✓ Lest i dag».
  - **♡ Lagre**.
  - **✦ Forklar**: Glimt gir 3–4 setninger om sammenheng og betydning (LLM, med lokal fallback).
  - **Kopier**.
- **Leseplan:** Johannes på 21 dager / Salmene på 30 / Ordspråkene på 31 / Markus på 16 (chips).
  - Fremdriftslinje og «Dag 8 av 21».
  - **I DAG: Johannes 8** med **Les ›** (bibel.no) og **Ferdig**. Ferdig teller også i rekken.
- **Statistikk:** dager lest · lagrede vers · leseplan i %.
- **Lagrede vers:** liste med ×. Tom liste viser «Trykk Lagre …».
- **Daglig påminnelse** (bryter): kl. 07:00 «Dagens vers er klart». Native lokalt varsel. Ved brutt rekke (ikke lest innen 21:00): «Hold rekken: dagens vers venter».
- **Regler for rekken:** en dag teller når verset er markert lest eller dagens kapittel er fullført. Rekken brytes hvis en hel dag mangler. I dag teller ikke før det er lest, men rekken vises fra i går.
- **Data per bruker:** `bible_progress {user_id, read_days[], best_streak, saved[{ref,text}], plan, plan_day, plan_done_date, reminder}`, synket mellom enheter.
- **Widget (valgfritt):** «🔥 7» på låseskjermen og i den små hjemskjerm-widgeten.
- Hjem-kortet kan fortsatt sveipes bort uten at det åpner siden (klikk ignoreres rett etter sveip).


## Glimt i prestekjole / bibelsk drakt (brief + Bibel-side)
Ønske 2026-10-20: «i brief for bibelvers og i bibel-side, gi Glimt-personen et presteantrekk, Jesus-antrekk.»
Fasit: `Bibelvers.dc.html` → `priest(S)` (bruker `glimt-figurer.js` for ansiktet).
- **Drakt:**
  - lys **kjortel/alb** (`#f6f1e7`) med en rød **stola** (to bånd med gullstripe) og et brunt belte
  - en liten mørk **bibel** med gyllent ✝ i hånda
  - en svak, pulserende **gylden glorie** over hodet (2,8 s)
  - Holdes varm og respektfull, ikke karikert.
- **Plassering:**
  - Brief-kortet (morgen- og kveldsvers): figuren (46 px) oppe til høyre, ved dato og etikett.
  - Bibel-siden: figuren (72 px) i «Dagens vers»-kortet med teksten «Glimt leser dagens vers med deg».
- Figuren dupper rolig (3 s). Når Glimt leser verset høyt, brukes humøret «snakker». «Reduser bevegelse» betyr ingen dupping og fast glorie.
- Lag drakten som en egen variant i figur-biblioteket (`outfit:'prest'`), så den kan gjenbrukes, for eksempel søndag i briefen eller ved påske og jul.
