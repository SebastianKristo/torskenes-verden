# Huskeliste (mobil): uten navbar

Ønske 2026-10-19: «fjern navbaren fra huskeliste». Vedlegg: `uploads/Screenshot 2026-10-19 at 23.27.22.png`. Navbaren (Finans · Mat · Sporing · Søk · Mer) ligger under «Ny oppgave …» og den røde +, og dekker listen.
Fasit: `Mobil Papir App.dc.html` → `navVis` (`page==='huske'` → skjult), `hk.b` og `fab.b`.
- Navbaren **skjules** i Huskeliste, som i Chat, Kalender, Nordlys og Innstillinger. Man går tilbake med **‹ Mer** oppe til venstre eller sveip fra venstre kant.
- «Ny oppgave …»-feltet og den røde **+** flyttes ned til bunnen: `bottom: max(18px, safe-area + 8px)` (≈ 42 px på iPhone med hjemstrek). Ingen tom plass der navbaren var.
- Listen får `padding-bottom` = felthøyde (60) + bunnmarg + 16, så siste oppgave kan scrolles over feltet.
- Når tastaturet er oppe: feltet ligger rett over tastaturet (samme teknikk som Chat og Kalender).


## Nytt navn: **Gjøremål** + alltid i Mer
Ønske 2026-10-19: «legg til huskeliste i mer, og kall den et to-do-list-aktig navn». Vedlegg: `uploads/Screenshot 2026-10-19 at 23.30.37.png` (Mer uten Huskeliste).
- Modulen heter nå **Gjøremål** i alt brukeren ser:
  - Mer-raden: «Gjøremål · To-do for hele familien», ☑-ikon.
  - Sidetittelen: «To-do for hele familien / Gjøremål».
  - Navbar-valg, Hjem-widget og etiketter i wiggle-modus.
  - Innstillinger → Home Assistant-kobling.
  - Web-fanen: «Gjøremål».
  - Glimt- og søk-ord: «gjøremål», «to-do», «todo», «huskeliste» og «handleliste» går alle hit.
- Intern nøkkel er fortsatt `huske`. Ingen datamigrering nødvendig.
- **Synlig i Mer:** raden var skjult i brukerens Mer-oppsett (`papir_mer.h`). Én gangs migrering fjerner `huske` fra skjult-listen (`papir_mer_huske_v1`). Etterpå kan brukeren skjule den igjen selv.
- i18n (engelsk): «To-do».


## Gjøremål: detaljark for en oppgave
Vedlegg: `uploads/Påminnelser.png` (detaljarket i Apple Påminnelser som inspirasjon). Fasit: `Huskeliste.dc.html` → `ed` (ark nederst, åpnes ved trykk på teksten i en rad).
- **Topp:** ✕ (rund) · «Detaljer» (Newsreader) · **Ferdig** (mørk pille). Alt lagres med en gang, uten egen lagre-knapp.
- **Kort 1:** tittel (Newsreader 22) + «Notater og lenke» (flere linjer). Lenker gjøres klikkbare i visning.
- **DATO OG TID:**
  - **Dato** (bryter + datovelger)
  - **Tid** (bryter + klokkeslett; slås dato på automatisk)
  - **Viktig** (bryter). Under står: «Viktige oppgaver ringer som en alarm, også i Fokus og stille-modus.» iOS: Critical Alerts / `AlarmKit`. Android: `setAlarmClock` + fullskjerm-varsel.
- **Gjenta:** Aldri / Hver dag / Ukedager / Hver uke / Annenhver uke / Hver måned / Hvert år. Når en gjentagende oppgave fullføres, lages neste forekomst.
- **Tidlig påminnelse:** Ingen / 5 min / 15 min / 30 min / 1 time / 1 dag / 2 dager / 1 uke før.
- **ORGANISERING:**
  - **Liste** (chips med fargeprikk)
  - **Ansvarlig** (Sebastian / Ingrid / Pål / Ingen; husstandens brukere)
  - **Prioritet** (Ingen / Lav / Middels / Høy, vist som ! / !! / !!! foran tittelen)
  - **Flagg** (⚑ oransje)
  - **Tagger** (#tagg, Enter legger til, trykk fjerner)
  - **Deloppgaver** (liste med avkrysning, «+ Ny deloppgave», teller «1 / 3»)
- **Slett oppgave** (rød tekst nederst).
- Hver rad har en ikonbrikke (30 px, radius 9) i farge per type. Brytere og ark følger papir-temaet (bunnflate i arkets farge bak tastaturet).
- **Raden i listen** viser: ⚑, ! / !! / !!!, og i metalinjen: dato + tid, ↻ (gjentas), ⏰ (viktig), deloppgaver «1/3», ansvarlig, liste og #tagger.
- Datamodell: `{id, n, notes, l, due, time, urgent, rep, early, prio, flag, tags[], who, subs:[{n,done}], done, doneAt, arch}`. Synkes til Home Assistant `todo` (`due_date`/`due_datetime`, `description` = notater). Felter HA ikke støtter, lagres bare lokalt.
- Glimt kan fylle ut feltene fra tekst: «påminn meg å kansellere Overleaf 21.09 kl 9, viktig, hver måned».


## Gjøremål: personlige lister + delte lister
Ønske 2026-10-19: «huskeliste skal være for hver enkelt bruker, men man kan lage delte huskelister.»
Fasit: `Huskeliste.dc.html` → `lists()`, `LDEF`, `shInfo`, `lsv` (listeark), chips med avatarer.

### Modell
- `todo_lists {id, name, color, owner_id, created_at}` + `todo_list_members {list_id, user_id, role: owner|member}`. Oppgaver hører til én liste.
- **Standard per bruker:** hver bruker får en privat liste «Mine» (bare seg selv). Eksisterende felles lister (Hjem, Handel, Hytta) migreres som **delte** lister med alle i husstanden som medlemmer. Brukeren kan forlate dem.
- **Tilgang:** man ser bare lister man er medlem av, og bare oppgaver i dem. «Alle» = alle lister man er medlem av. Søk, Glimt, widgets og Home Assistant-sync respekterer dette. Andres private lister vises aldri.
- Alle medlemmer kan legge til, endre, krysse av og slette oppgaver. Bare eieren kan endre navn, farge og medlemmer, og slette listen. Andre kan **forlate** den.
- Sanntid til alle medlemmer (`todo:changed` over SSE/WebSocket). Push (kan slås av): «Ingrid la til Melk i Handel».

### UI
- **Liste-chips:** delte lister viser opptil 3 små **avatarer** (initial + brukerfarge, 18 px, overlappende) etter navnet. Private lister vises uten. Siste chip er **+ Ny liste** (stiplet kant).
- Trykk på den **aktive** chipen åpner listearket. Under chipsene står et infokort for valgt liste:
  - Delt: «Delt med Ingrid og Pål · Alle i listen kan legge til, endre og krysse av.» + **Administrer**.
  - Privat: «Bare du ser denne listen · Privat. Del den for å gjøre den felles.» + **Del**.
- **Listeark** (samme stil som detaljarket): ✕ · «Ny liste / Liste» · **Opprett / Lagre**.
  - Navn (Newsreader), fargevalg (8 swatches).
  - **DEL MED:** husstandens brukere med avatar og bryter. Du selv står alltid på, og bare eieren kan endre.
  - Hint: privat eller delt.
  - **Forlat listen** (medlem) / **Slett listen** (eier, sletter oppgavene, med bekreftelse).
- **Ansvarlig** i detaljarket viser bare medlemmer av oppgavens liste.
- Nye oppgaver fra «Alle» legges i første synlige liste (standard «Mine»). Det kan endres i Innstillinger → Gjøremål → Standardliste.
- Home Assistant: hver delt liste kan kobles til en `todo`-entitet. Private lister synkes bare til brukerens egen entitet, om den er valgt.


## FEIL: detaljarket i Gjøremål ligger utenfor appen
Vedlegg: `uploads/Screenshot 2026-10-19 at 23.44.38.png`. Arket «Detaljer» (og listearket og stedsvarselet) er `position: fixed` og la seg over hele nettleservinduet, bredere enn appen og bak telefonrammen. «Ny oppgave»-feltet lå også utenfor.
**Fiks:**
- App-roten i `Mobil Papir App` har `transform: translateZ(0); isolation: isolate`. Da blir den containing block for alle `fixed`-ark inni appen, så de holder seg innenfor appflaten.
- Ark: `max-width: 560px; margin: 0 auto` (sentrert på brett og sammenleggbar). Stedsvarsel: maks 520 px.
- Native: arkene er `.sheet` / `ModalBottomSheet` fra appens egen view, ikke webview-overlay. På iPad og sammenleggbar: `.presentationDetents([.large])` med `.presentationSizing(.form)`.
