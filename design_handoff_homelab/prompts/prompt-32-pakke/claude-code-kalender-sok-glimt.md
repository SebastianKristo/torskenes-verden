# Kalender: ny søkemeny med Glimt (AI)

Fasit: `Kalender.dc.html` → `sr` (søk), `srLocal()` (lokale svar), `srCloud()` (AI-fallback), `srMark()`.

## Utseende
- Web: «Spotlight»-panel, 640 px, festet 10 vh fra toppen, radius 24, stor skygge. Bakgrunnen dempes og blurres (`rgba(20,18,14,.38)` + `blur(6px)`). Mobil: ark fra bunnen (maks 92 %).
- Søkefelt (50 px pille, kant): 🔍 · «Søk, eller spør Glimt …» · ✕ tøm · **✦ Spør** (mørk pille når det står noe i feltet). Lukk-knapp (44 px rund) til høyre.
- Filterchips under feltet: **Alle** · Timeplan · Prøver og frister · Skole (iCal) · Privat · Familie · Bursdager (farget prikk). Gjelder både søk og «Snart».

## Tomt felt
- **SPØR GLIMT**: fire forslag med ✦-ikon («Hva har jeg i morgen?», «Når er neste prøve?», «Er jeg ledig fredag ettermiddag?», «Hva skjer neste uke?»). Trykk = spør.
- **SNART**: de neste fire hendelsene (ukedag + dato, fargestripe, tittel, tid · sted).

## Mens man skriver (vanlig søk)
- Live-treff i tittel, sted, notat og fag, fra 30 dager bakover til 120 dager fremover.
- **Gruppert per dag**: «Tirsdag 20. oktober», «i morgen» / «om 6 dager» / «3 dager siden». Kommende først, så tidligere.
- Rad: fargestripe · tid (mono) · tittel med **markert treff** (gul markering) · sted/notat (uten URL).
- Teller: «12 treff» / «4 treff i Privat».

## Spør Glimt (Enter eller ✦ Spør)
- Svarkort øverst: Glimt-merket (spinner mens den jobber, grønn når ferdig) · «GLIMT» · spørsmålet i anførsel · svar (16 px) · opptil 6 hendelser som kan trykkes.
- Forstår lokalt (raskt, uten nett):
  - **Dag/periode**: i dag, i morgen, i overmorgen, mandag–søndag, neste uke, resten av uka → «I morgen har du 3 ting, 2 av dem i timeplanen. Først ut: MEK1300 kl. 08:15.»
  - **Ledig tid**: «ledig fredag ettermiddag» → «Fredag 23. oktober er du ledig 12:00–14:00, 16:15–20:00.» (08–20, ettermiddag 12–20, formiddag 08–12, minst 30 min).
  - **Prøver/frister**: «når er neste prøve» → neste prøve + antall etter.
  - **Neste X**: «når er neste fysioterapi» → «Fysioterapi er torsdag 5. november kl. 14:00 (om 17 dager).»
- Ellers: send spørsmålet + de neste 14 dagene i kalenderen til AI (lokal modell / Glimt). Svar i maks to setninger, kun ut fra kalenderen.
- Svaret blir stående til feltet endres. Gikk brukeren ut av appen: send svaret som varsel (se `claude-code-ai-bakgrunnsvarsel.md`).

## Tastatur (web)
- Cmd/Ctrl+K eller / åpner søket. Esc lukker. ↑/↓ flytter markering, Enter åpner (eller spør Glimt hvis ingen rad er markert).
