# Kalender: rask time med AI (lege, frisør, tannlege …)

Fasit: `Kalender.dc.html` (mobil og web). Mobil: **+** åpner «Legg til time». Web: knappen **«✦ Skriv time»** ved siden av «+ Ny hendelse».

## Arket «Legg til time»
- Grep-strek, etikett «✦ AI · RASK TIME» (IBM Plex Mono, `lab`), tittel «Legg til time» (Newsreader 24), ✕.
- Stort tekstfelt (3 linjer): *«F.eks. «time hos Nina frisør 14.30 25.09» eller lim inn meldingen fra legekontoret»*.
- Chips: **Lim inn melding** (leser utklippstavlen) · Frisør · Lege · Tannlege · Fysio (fyller inn «Time hos …»).
- **Forhåndsvisning live** mens man skriver: tittel, dato + tid, sted, «Privat · varsel 1 time før». Mangler dato: rød tekst «Fant ikke dato. Skriv f.eks. «25.09» eller «tirsdag».»
- Primærknapp **«Legg til i kalenderen»** (`lab`, hvit tekst). Sekundær **«Fyll ut selv»** åpner vanlig skjema.
- Fotnote: «Du kan lukke appen. Timen legges til i bakgrunnen.»

## Bakgrunn
- Ved «Legg til» lukkes arket **med en gang**. Jobben legges i en kø på serveren (`POST /api/calendar/quick {text}` → `202 {jobId}`).
- Mens jobben kjører: liten pille øverst «✦ Legger til i kalenderen …» (flere: «Legger til 2 timer …»).
- Ferdig: banner «✓ Nina frisør · fre 25. sep · 14:30» med **Angre** og **Vis** (hopper til dagen). Lukket app: push-varsel med samme tekst (trykk åpner dagen).
- Feiler tolkningen: åpne skjemaet ferdig utfylt med det som ble funnet + feilmelding, og originalteksten i notat.

## Tolkning (backend)
1. **Ollama** (`qwen3:8b`/`llama3.1:8b`, `format:"json"`, `temperature:0`) med prompt:
   ```
   Dagens dato er {YYYY-MM-DD} ({ukedag}). Tidssone Europe/Oslo.
   Hent ut én avtale fra teksten. Svar KUN JSON:
   {"tittel":string,"dato":"YYYY-MM-DD"|null,"start":"HH:MM"|null,"slutt":"HH:MM"|null,
    "sted":string|null,"type":"lege"|"tannlege"|"frisør"|"fysio"|"psykolog"|"optiker"|"annet","sikkerhet":0-1}
   Regler: dd.mm uten år = neste gang den datoen kommer. "14.30" er klokkeslett, "25.09" er dato.
   Ikke finn på tid eller dato.
   ```
2. **Lokal reserve** (samme regler som `QP()` i fasiten) hvis Ollama er nede eller sikkerhet < 0,6:
   - Datoer: `25.09`, `25.09.2026`, `3. november`, `i dag`, `i morgen`, `i overmorgen`, ukedager (neste forekomst), `neste uke`.
   - Tid: `14.30`, `14:30`, `kl 9`, `kl. 09:15`, intervall `14.30–15.15`. «14.30» vs «25.09»: minutter > 12 → tid, dag > 23 → dato, ellers den som mangler.
   - Tittel: tekst etter «hos» frem til dato/tid («Nina frisør», «Fastlege Hansen», «Dr. Berg»). Ellers type («Frisør», «Lege» …).
   - Sted: etter «Adresse:», «Sted:», «Oppmøte:» eller «på <Stort ord>».
   - Varighet når slutt mangler: frisør 45 · lege 30 · tannlege 60 · fysio 45 · psykolog 50 · optiker 30 · vaksine 15 · ellers 60.
3. Lagres i **Privat**, varsel 60 min før, kilde «AI · rask time». Ved lang innlimt melding lagres teksten i notat.

## Snarveier
- iOS Snarvei / Siri: «Legg til time …» → samme endepunkt.
- Del-ark: del en SMS/e-post til appen → åpner arket med teksten ferdig innlimt.
