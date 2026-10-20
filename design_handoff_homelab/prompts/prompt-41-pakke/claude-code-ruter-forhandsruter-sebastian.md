# Ruter: forhåndsruter for Sebastian (skole ⇄ Amagerveien)

Ønske 2026-10-20: «For sebastian bruker i ruter siden. Han skal ha foråndsruter med cknections og gå tid og slikt. Fra skole sone til Frydenlund eller holbersplass, til Majorstuen så buss til Amagerveien enten 45 eller 46 bussen, helst 45 bussen. Hvis trikk fek fra Frydenlund er forsinket vis hvor langt tid det vil ta å gå til Majorstuen i stedet.»
Fasit: `Mobil Papir App.dc.html` → Ruter-siden (sanntid), kortet **MIN REISE · SEBASTIAN** over transportfilteret.

## Hvem og når
- Vises for brukeren **Sebastian** (profil-/bruker-ID, ikke navn i koden). Andre brukere ser ikke kortet før de har egne forhåndsruter.
- Retning velges automatisk: før kl. 12 **Amagerveien → Skole**, etter kl. 12 **Skole → Amagerveien**. «⇄ Snu» bytter.

## Forhåndsruter (lagres per bruker)
`saved_routes (user_id, name, from, to, legs[], prefer_lines[], allow_lines[])`
- **Skole → Amagerveien**
  1. Gå til **Holbergs plass** → trikk til **Majorstuen** → bytte (gå ~2 min) → **buss 45** (eller 46) → Amagerveien.
  2. Gå til **Frydenlund** → trikk til **Majorstuen** → bytte → **buss 45** (eller 46) → Amagerveien.
- **Amagerveien → Skole**: samme baklengs (45/46 til Majorstuen, trikk til Frydenlund/Holbergs plass, gå).
- **45 foretrekkes.** 46 brukes bare når den gir tidligere ankomst enn neste 45, eller når 45 ikke rekkes. Rute med 45 får merket «Foretrukket».
- Linjenumre for trikken, holdeplass-ID-er (NSR:StopPlace) og gangtider hentes fra **Entur Journey Planner v3** (`trip(from, to, modes, whiteListed: {lines})`), ikke hardkodet. Skole-adressen settes i Innstillinger → Ruter → Mine ruter.

## Kortet
- Overskrift `MIN REISE · SEBASTIAN` + «Skole → Amagerveien», knapp «⇄ Snu».
- Én rad per rute: avgang (stor, Newsreader) → ankomst · totaltid, merker «Foretrukket» / «Trikk +10 min» (rødt), og en etappe-stripe: `Gå 6 › Trikk 9 min › Gå 2 › 45`. Linjefarger som ellers på Ruter-siden; gange i bakgrunnsfarge.
- Sortering: tidligste ankomst, men 45-rute først hvis den er maks 3 min senere enn raskeste 46-rute.
- Trykk på en rute åpner detaljer (samme høyde-animasjon som avgangene, `grid-template-rows 0fr ↔ 1fr`): tidslinje med klokkeslett, holdeplass, gangtid og meter, byttetid og ventetid. Gange vises som stiplet linje, kjøring som hel. Forsinkelser i rødt.

## Forsinket trikk fra Frydenlund
- Når trikken fra Frydenlund (sanntid `expectedDepartureTime − aimedDepartureTime`) er **≥ 3 min forsinket**, eller gjør at 45 ikke rekkes:
  - Rødt varselkort øverst: «Trikken fra Frydenlund er 10 min forsinket». Tekst: «Går du fra Frydenlund til Majorstuen i stedet tar det 17 min (1,4 km), og du rekker 45 kl. HH:MM. Med trikken mister du 45 og er hjemme HH:MM med 46.»
  - Stripe: `Gå 17 min › 45` + hjemme-tid.
  - Gangtid Frydenlund → Majorstuen fra Entur (`modes: {directMode: foot}`), ikke fast tall.
- Frydenlund-ruten får merket «Trikk +10 min», og bytte-steget sier «45 kl. HH:MM er gått».
- Varselet vises bare når gange faktisk gir tidligere ankomst eller rekker 45.
- Push (valgfritt, av som standard): «Trikken er forsinket. Gå til Majorstuen, 17 min» når Sebastian er innenfor 300 m av skolen og det er < 15 min til planlagt avgang.

## Oppdatering
- Sanntid hvert 30. s mens siden er åpen, ellers ved åpning. Samme Entur-klient som avgangene (`ET-Client-Name: kristo-homelab`).

## Sjekk
- Etter kl. 12: Skole → Amagerveien, Holbergs plass-ruten med 45 øverst.
- Simuler 10 min forsinkelse på Frydenlund: varselet og «Trikk +10 min» vises, gange gir 45.
- Snu: Amagerveien → Skole med 45 først.

## Skolesoner og kort på Hjem (2026-10-20)
Ønske: «… og når jeg forlater skole sone, la meg også lage flere skolesoner som alle blir begrenet som skole. men vis relevant hvis dette over eller istedet for ruter kortet.»
- **Flere skolesoner:** Ruter → Min reise → «SKOLESONER · ALLE TELLER SOM SKOLE». Chips med navn + radius (f.eks. «Skolen 150 m», «Idrettshallen 80 m») og «+ Sone» (velg punkt på kart, radius 50–300 m). Siste sone kan ikke slettes. Alle soner regnes som «Skole» i rutene og i Hjemlys.
- Data: `school_zones (user_id, name, lat, lon, radius_m)`. Geofence for hver sone (iOS `CLCircularRegion`, maks 20 totalt; Android Geofencing API).
- **Forlater skolen** = går ut av siste skolesone og er ute i ≥ 2 min (unngå flimmer mellom soner). Bare på hverdager 07–18, og ikke hvis det skjer innen 10 min etter at du kom.
- **Kort på Hjem:** «MIN REISE · FORLOT SKOLEN HH:MM» med neste anbefalte avgang, «→ hjemme HH:MM», etappe-stripen og forsinkelsesvarselet kort («Gå til Majorstuen (17 min) og rekk 45 kl. HH:MM.»). Trykk åpner Ruter-siden. Kortet forsvinner når du er hjemme eller etter 90 min.
- Valg «PÅ HJEM NÅR DU FORLATER SKOLEN»: **Over Ruter-kortet** (standard) · **I stedet** (skjuler vanlig Avganger-kort mens reisen er aktiv) · **Av**. Lagres per bruker.
- Live Activity / Live Update «Hjem om 37 min · 45 kl. 16:50» startes samtidig (samme som Hjemlys, men uten varsling til andre med mindre Hjemlys er på).
- Fiks: «Gå17min» manglet mellomrom. Lag hele etiketten i koden («Gå 17 min», «→ 17:09 · 37 min»), ikke som tekst rundt en verdi.

## Min reise på Hjem: bare når relevant + sveip bort (2026-10-20)
Ønske: «den skal ikke vises når den ikke er relevant lenger på hjem. og la meg uansett sweipe den bort på samme meåte som med brief.» (skjermbilde: `vedlegg/min-reise-hjem.png`)
- Kortet vises **kun** når en «forlot skolesone»-hendelse finnes (`left_school_at`), og forsvinner når: du kommer hjem (hjemme-geofence/Wi-Fi eller Hjemlys «Jeg er hjemme»), det har gått 90 min, eller siste relevante avgang har gått uten at du er på vei. Ikke vis kortet basert på klokkeslett alene.
- Tittelen bruker faktisk tidspunkt fra hendelsen («FORLOT SKOLEN 16:31»), ikke «nå minus 3 min».
- **Sveip bort** med samme komponent og oppførsel som Brief-kortet (`SwipeDismiss`): mørk bakside «Sveip for å skjule» → «Slipp for å skjule» → «Min reise skjult», undertekst «Kommer tilbake neste gang du forlater skolen». Toast «Min reise skjult til neste gang du forlater skolen» med **Angre** i 4,5 s.
- Skjult lagres per tur (`papir_rt_hide = left_school_at`), så neste skoledag dukker det opp igjen.
- Når kortet skjules eller utløper og valget er «I stedet», kommer vanlig Avganger-kort tilbake.
- I designet: knappen «Prøv: forlat skolen nå / jeg er hjemme» i Ruter → Min reise er bare for testing. Ikke bygg den i appen (bruk debug-meny).
