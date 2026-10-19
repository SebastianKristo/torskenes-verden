# Glimt-brief (morgen / dag / kveld) + widgets + Hjem-kort + Glimt-figur

Inspirasjon: vedlegg `uploads/pasted-1792434461040-0.png` (en «brief» på telefonen). Eget design i Papir-stil.
Fasit: `Glimt Brief.dc.html` (`mode`: page | card | ios | android | samsung). Oversikt: `Glimt Brief Oversikt.dc.html`. Integrert i `Mobil Papir App.dc.html` (Hjem-kort øverst og brief-side som fullskjerm).

## Brief-siden
- Tittel etter tid: **Morgenbrief** (før 11) / **Dagsbrief** (11–17) / **Kveldsbrief** (etter 17). «GLIMT · …» i rød mono og **Ferdig**-pille.
- **Oppsummering** fra Glimt (Newsreader 17), f.eks. «God kveld, Sebastian. Lettskyet og 8° i Oslo, regn fra ca. 20. Neste er Tannlege kl. 15:15. Ta med paraply.». Bygges av backend/LLM fra dataene under. Prototypen bruker en mal.
- **Vær** (blått kort `#22476b`):
  - ikon, temperatur nå, sted og høy/lav
  - **nedbør neste 12 t** som søyler
  - «Sammenlignet med i går» (X grader kaldere/varmere) og solnedgang
  - Data: Open-Meteo/MET (`current`, `hourly.precipitation`, `daily` med `past_days=1`).
- **Kalender:** de 3 neste (i dag/i morgen) med tid, fargestripe, tittel og sted. Topp-høyre: «NESTE OM 40 MIN». Trykk åpner **Kalender-appen** på dagen (`kalender://dag/…`).
- **Nyheter:** 3 saker fra Nyhetsleser-kildene (NRK, VG, E24) med kilde og tid. Trykk åpner saken.
- Bunn: «Laget av Glimt 20:31 · Vær: … · Nyheter: …».

## Glimt-figuren (interaktiv)
- En liten figur: krem fjes i Glimts regnbuering (roterer sakte), to øyne som blunker, rosa kinn og rød munn. En stjerne over hodet glitrer, og én arm vinker. Den svever opp og ned (2,6 s).
- **Guide-runde** starter automatisk første gang briefen åpnes (kan slås av):
  1. «Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din?» [Vis meg]
  2. Scroller til **Vær**: kortet får en pulserende rød ring, og figuren lener seg mot kortet og «snakker» (munnen beveger seg, ringen spinner raskere). Teksten forklarer været.
  3. **Kalender** → neste avtale.
  4. **Nyheter**.
  5. «Det var alt for nå. Trykk på meg når du vil ha en ny runde.»
  
  Boble med **Neste** / **Hopp over**. Trykk på figuren starter eller avslutter runden. Lett haptikk ved hvert steg.
- Senere: figuren kan svare på spørsmål («hva betyr det for løpeturen?») ved å åpne Glimt-chat med briefen som kontekst.
- Respekter «Reduser bevegelse»: ingen svev eller spinn, bare fade.
- Native: tegn figuren som vektor (SwiftUI Shapes / Compose Canvas, eller Lottie/Rive) med tilstandene **idle**, **talk**, **point** og **wave**.

## Hjem-kort
Øverst på Hjem (over widgetene, kan flyttes og skjules i wiggle-modus som widget `h12` «Glimt-brief»). Blått kort med «KVELDSBRIEF · GLIMT», oppsummering (3 linjer), chips (8° lettskyet · Tannlege 15:15 · 3 nyheter) og figuren til høyre. Trykk åpner briefen.

## Widgets
- **iPhone (WidgetKit):**
  - Liten: blå, figur + temperatur, «KVELDSBRIEF» og neste avtale.
  - Medium: krem, figur + oppsummering til venstre, og VÆR / NESTE / NYHET til høyre.
  - Trykk → `homelab://brief`.
- **Android (Glance, Material You):** 4×2 med `primaryContainer`, figur, tittel, temperatur-pille, oppsummering (2 linjer) og chips.
- **Samsung (One UI):** 4×2, hvit 78 % med blur, tittel, oppsummering, «Åpne brief ›», figur + temperatur.
- Oppdatering: kl. 06:30 (morgen), 11:00 og 17:00, og ved store endringer (ny avtale innen 2 t, regnvarsel). Varsel «Morgenbrief er klar» kan slås av.

## Backend
`GET /api/brief?kind=morning|day|evening` → `{title, summary, weather{now,hi,lo,cond,rain12h[],vsYesterday,sunset}, events[], news[], generatedAt}`. Lages av Glimt (rute «Glimt · brief» i AI-kontroll, standard lokal modell) og caches til neste vindu.
