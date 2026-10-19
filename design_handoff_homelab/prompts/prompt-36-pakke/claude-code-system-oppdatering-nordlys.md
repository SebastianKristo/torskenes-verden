# System → Oppdatering: ny side + navn «Nordlys OS»

Fasit: `Innstillinger Web.dc.html` → System (åpnes fra sidemenyen SERVER → System). Mobil: banner/rad i `Mobil Papir App.dc.html` bruker samme navn.
Vedlegg: dagens System-side (tekstrader med «Se etter →» og «Oppdater nå →») og OnePlus «Software update» som inspirasjon.

## Navn
- Operativsystemet heter **Nordlys OS** (kort: Nordlys). Versjon vises som «Nordlys 4.22».
- Slagord: «Lys i mørket, kjørt hjemme.»
- Brukes i System-siden, oppdateringsbanneret på Hjem, Innstillinger → PROGRAMVARE («Nordlys OS 4.22.0»), push («Nordlys 4.22 er klar») og i `/api/system/version` (`name: "Nordlys OS"`).

## Layout (web, samme på mobil i full bredde)
1. **Hero-kort** (radius 28, min-høyde 320, padding 30/32): nordlys-gradient på mørk natt-bunn
   - Bunn: `linear-gradient(160deg,#101a2e,#1b2340)` + tre radiale lag: fiolett `oklch(.62 .17 300)` øverst til høyre, grønn `oklch(.72 .16 165)` nederst til venstre, varm rød `oklch(.6 .19 30)` nederst til høyre. To tynne hvite buer (18 % / 12 % opasitet) for dybde.
   - Stort versjonstall **«4.22»** (Manrope 800, 88–148 px, tett sporing) med gradient-tekst hvit → `#ffd9c2` → `#ff8a5c`.
   - Under: status («Oppdatering tilgjengelig» / «Ser etter oppdatering …» / «Oppdaterer …» / «Oppdatert» / «Du har siste versjon»), **Nordlys**OS (800/500), «Homelab · home.kristo.no».
   - Øverst til høyre: glass-pille **Se etter oppdatering** (henter fra GitHub).
   - Under oppdatering: hvit fremdriftslinje i heroen + steg (Tar backup av databasen → Laster ned 4.22.0 → Bygger → Starter serveren på nytt) og prosent.
2. **Programvareversjon**: «4.22.0 · 5ea8cb0 · 48 MB» (mono) og til høyre «Du har 4.21.0» / «Installert» (grønn). Under: «Oppdateringen gjøres av updater-containeren på serveren. .env, data/ og proton/ røres ikke.»
3. **«Dette er Nordlys 4.22. Lys i mørket, kjørt hjemme.»** (serif 26) + «NYTT I 4.22.0 · 19.10.2026» + punktliste fra CHANGELOG.
   - Feil i dagens CHANGELOG: et tomt punkt «Kalender:». Hopp over tomme punkter når listen bygges.
4. **Stor, tydelig knapp rett under hero-kortet** (web: ikke sticky, ingenting går under den): pille 54 px høy, min 240 px, blå `#2b5d8a`, hvit tekst 800 16 px, skygge. Forklaringsteksten står til høyre for knappen på samme linje (brytes under på smal skjerm). På mobil ligger knappen fast nederst (bunnmenyen er skjult der).
   - «Oppdater nå» · under: «Tar backup først · ca. 2 minutter · serveren starter på nytt»
   - Under kjøring: «Oppdaterer … 42 %» (deaktivert) · «Du kan bruke Homelab mens den oppdateres.»
   - Ferdig: grønn «Ferdig» · «Endringene er aktive på web og i appen.»
   - Ingen oppdatering: grå «Du har siste versjon» · «Sist sjekket nå».
- Fjern de gamle radene «Se etter oppdatering → / Oppdater nå →».

## Backend
Uendret fra `claude-code-oppdatering-mobil.md`: `GET /api/system/version`, `POST /api/system/update`, status via SSE. Legg til `name`, `codename`, `tagline`, `sizeBytes` i svaret.

## Passord ved oppdatering (valgfritt)
- **Standard: ingen passord.** Admin starter oppdateringen med ett trykk på «Oppdater nå» (web og mobil, også fra banneret på Hjem).
- Ny bryter under Programvareversjon: **Krev passord for å oppdatere** (av). Undertekst: «Av · admin kan oppdatere med ett trykk» / «Passord kreves før oppdateringen starter».
- Når den er på: «Oppdater nå» åpner dialog «Bekreft med passord» (passordfelt, Avbryt, blå Oppdater). Mobil: Face ID/fingeravtrykk først, passord som reserve.
- Backend: `POST /api/system/update` krever ikke `password` med mindre `settings.update.requirePassword = true`. Da valideres passordet (eller en fersk re-auth-token fra biometri, maks 5 min).
- Kun admin kan endre bryteren. Endringen logges.

## Mobil: egen side «System» (Programvareoppdatering)
Fasit: `Mobil Papir App.dc.html` → Innstillinger → PROGRAMVARE → «Nordlys OS 4.21.0 ›».
Vedlegg: PROGRAMVARE-gruppen med raden «Nordlys OS 2.3.1 · Ny versjon 2.4.0 er klar».
- Raden er nå en navigasjonsrad (›) som åpner siden **System**, undertittel «Programvareoppdatering». Høyre: «Oppdater» (rød) når ny versjon finnes, ✓ ellers.
- Versjonene er rettet til samme som web: 4.21.0 → 4.22.0.
- Siden er lik web-versjonen, tilpasset mobil:
  1. Hero-kort (radius 26, min 300 px) med nordlys-gradient, «4.22» (104 px), status, **Nordlys**OS, «Homelab · home.kristo.no», glass-pille «Se etter». Fremdrift + steg i heroen under oppdatering.
  2. Kort: Programvareversjon (mono) + «Du har 4.21.0»/«Installert», og bryter **Krev Face ID eller passord** (av).
  3. Liten tekst om updater-containeren.
  4. «Dette er Nordlys 4.22. Lys i mørket, kjørt hjemme.» + «NYTT I 4.22.0 · 19.10.2026» + punktliste.
  5. **Stor knapp** sticky over bunnmenyen: full bredde, 54 px, blå #2b5d8a, «Oppdater nå» · «Tar backup først · ca. 2 minutter». Samme tilstander som web (Oppdaterer … %, grønn Ferdig, grå Du har siste versjon).
- **Trykk hvor som helst på oppdateringskortet** (Hjem og Innstillinger) åpner System-siden. Knappene i kortet (Oppdater nå, Hva er nytt, ✕, Ferdig) gjør fortsatt sin egen handling og åpner ikke siden.
- Automatiske oppdateringer og Varsle om nye versjoner blir værende i PROGRAMVARE-gruppen.

### Mobil System-side: ren visning
- **Ingen bakgrunnsbilde** i toppen (planet/foto). Toppen er papirfarget (`bg`), mørk tekst, lavere (128 px): «‹ Tilbake», kicker «Programvareoppdatering», tittel «System».
- **Ingen bunnmeny (navbar) og ingen skann-knapp** på denne siden. Hero-kortet er det eneste fargede elementet.
- «Oppdater nå» ligger **fast helt nederst på skjermen** (utenfor scroll-innholdet): 14 px + safe-area over bunnen, med en fade fra bakgrunnsfargen bak så teksten under ikke kolliderer. Innholdet har 120 px ekstra bunnpadding så siste punkt kan scrolles fri av knappen.
- Hero-kortet skal **ikke** dekke tittelen «System» (ingen negativ toppmarg på denne siden).
- Tilbake-sveip fra venstre kant virker som vanlig.


---
## 2026-10-19: FEIL «Ingen endringsnotater» + logg over tidligere versjoner
Vedlegg: `uploads/Screenshot 2026-10-19 at 21.56.22.png`. Banneret «Nordlys 4.28.0 er klar» viser «Ingen endringsnotater.»

### A. Endringsnotater mangler (feil)
Sannsynlige årsaker. Sjekk alle:
1. `/api/system/update` henter notater fra **installert** versjon, eller fra `main` i stedet for **ny tag**. Les `CHANGELOG.md` fra den nye releasen (`v4.28.0`) eller GitHub Release-body.
2. Parseren finner ikke seksjonen. Overskriften må matche `## [4.28.0]`, `## 4.28.0` og `## v4.28.0 – 19.10.2026` (case-insensitive, valgfri `v`, valgfri dato). Ta punktene til neste `## `.
3. Tomme punkter og bare-overskrift-linjer («Kalender:») hoppes over. Underpunkter flates ut som «Kalender: …».
4. Mangler notater for versjonen: bruk commit-meldinger mellom forrige og ny tag (`git log vA..vB --no-merges --pretty=%s`), filtrer `chore:`/`ci:`, og vis «Generert fra commits».
5. Cache: notatene lagres sammen med versjonen i `update_state`. Tomt resultat skal **ikke** caches.
6. Release-prosessen: CI feiler hvis `CHANGELOG.md` mangler seksjon for taggen som bygges.

### B. Logg over tidligere versjoner (mobil og PC)
Fasit: `Innstillinger Web.dc.html` og `Mobil Papir App.dc.html` (Nordlys-siden), `up.hist`.
- Under «NYTT I x.y.z»: overskrift **TIDLIGERE VERSJONER** (Plex Mono 11, `mut`).
- Liste med rader (min 52 px): **Nordlys 4.27.0** (mono 600) · «17.10.2026 · 3 endringer» · chevron ›.
  - Trykk folder ut punktlisten under raden, og chevron roterer 90°. Én åpen om gangen.
- Data: `GET /api/system/changelog?limit=20&before=4.28.0` → `[{version, date, notes[], commit}]`, parset fra `CHANGELOG.md` i installert release, pluss tidligere installasjoner fra `update_history`. Paginering med «Vis flere».
- Installerte versjoner merkes med «Installert 19.10 kl. 21.40» (fra `update_history`). Feilede forsøk vises med rød «Feilet» og lenke til loggen.
- Samme i banneret: «Hva er nytt» viser bare den nye versjonen. Lenke nederst: «Tidligere versjoner ›» går til Nordlys-siden.


## 2026-10-19: Glimt som Sherlock Holmes ved «Se etter oppdatering»
Vedlegg: `uploads/Screenshot 2026-10-19 at 21.58.59.png` (hero-kortet «4.22 · Nordlys OS» med knappen oppe til høyre).
Fasit: `Innstillinger Web.dc.html` → `sherlock()`, keyframes `shFly`, `shBob`, `shScan`, `shTalk`.
- Trykk på **Se etter oppdatering** → Glimt-figuren (66 px, `glimt-figurer.js`, eller brukerens valgte figur) **flyr inn** i hero-kortet fra øvre høyre hjørne (`scale .45 → 1`, roterer litt).
- **Kostyme:**
  - **Deerstalker-lue** (brun rutete, skygge foran og bak, øreklaffer, sløyfe på toppen).
  - **Rutete Inverness-kappe** over skuldrene.
  - **Forstørrelsesglass** (messingring, lyseblått glass med glans, treskaft).
- **Under søket** (ca. 2,6 s): Glimt svever og «leter» fram og tilbake i kortet (`shFly` 38–80 %), dupper (`shBob` 0,45 s) og sveiper med forstørrelsesglasset (`shScan` 1,1 s, ±20°). Knappen viser «Ser etter …».
- **Resultat:** snakkeboble ved figuren, «Elementært! Du har siste versjon.» eller «Aha! Jeg fant Nordlys 4.28.», så flyr Glimt ut igjen oppover til høyre. Totalt 3,6 s. Status i kortet oppdateres når søket er ferdig.
- Figuren har `pointer-events: none` og dekker ikke versjonstallet (holder seg i høyre halvdel).
- **Mobil (lagt inn):** `Mobil Papir App.dc.html` → Nordlys-siden → «Se etter». Figuren er 52 px, og flybanen er kortere (`shFlyM`: inn fra øvre høyre, leter ca. 110 px fram og tilbake og flyr ut). Lett haptikk ved trykk, og dobbelt tikk når resultatet kommer.
- «Reduser bevegelse»: ingen flyging. Figuren med kostyme toner inn ved knappen, viser boblen og toner ut.
- Kostymet bør være en egen variant i figur-biblioteket (`F(id, S, mood, {outfit:'sherlock'})`), så det kan gjenbrukes, for eksempel ved søk.


## 2026-10-19: Glimt som snekker mens oppdateringen kjører
Vedlegg: `uploads/Screenshot 2026-10-19 at 22.18.07.png` (banneret «Oppdaterer Nordlys OS», rød fremdriftslinje, «Laster ned 4.29.0 … 15 %»).
Fasit: `Mobil Papir App.dc.html` (Hjem-banneret, Innstillinger-banneret og Nordlys-hero) og `Innstillinger Web.dc.html` (Nordlys-hero), metoden `carp()`, keyframes `cpHam`, `cpBob`, `cpChip`.
- Mens status er **Oppdaterer**, **står** Glimt-figuren (28–36 px) **oppå fremdriftslinja**, ved enden av fyllet (`left = pct`, avgrenset så den ikke går utenfor kortet), og flytter seg bortover etter hvert som prosenten øker (0,4 s).
- **Kostyme:**
  - Gul **vernehjelm** med kam og glans.
  - Brunt **verktøybelte** med messingspenne, lommer, skrutrekker og rød blyant.
  - **Hammer** i hånda.
- **Animasjon** (0,62 s loop):
  - Hammeren løftes (−55°) og slår ned (+18°) mot linja.
  - Figuren dukker litt ved slaget (`scaleY .97`), og 3 små **flis/spon** spruter ut fra treffpunktet.
- Linjen får 36–44 px luft over seg, så figuren ikke dekker teksten.
- Web-banneret på Hjem (`Homelab Papir Web` / ekte web-app) får det samme.
- Ferdig: hjelmen av, Glimt vinker (0,8 s) og forsvinner. Feil: Glimt klør seg i hodet ved den røde linja.
- «Reduser bevegelse»: figuren står stille på linja, uten hammerslag.
- Lett haptikk på mobil hvert 25 % (ikke for hvert slag).
- Kostymet bør være en egen variant i figur-biblioteket (`outfit:'snekker'`).
