# Prompt 26

Startet 2026-10-18.

## Ønsker
- 2026-10-18: «i sporing la meg velge å spore en pakke overstyre pakken sporingstjenesten»
  - `Mobil Papir App.dc.html` → Sporing:
    - **Ny pakke:** under sporingsnummeret ligger valgene «✦ Auto · Bring» (viser hva som gjenkjennes), Posten, Bring, PostNord, DHL, Helthjem, UPS, Budbee, Instabox og ParcelsApp. Velg en for å overstyre gjenkjenningen.
    - **Eksisterende pakke:** hold inne og velg én pakke. Da vises **SPOR VIA** med de samme valgene, og «Auto (…)» går tilbake til automatisk. Pakken spores med en gang via valgt tjeneste. Logo, lenke og «Bring · valgt» i underteksten følger valget. Lagres i `papir_tk_car`.
  - For Claude Code: `packages.carrier_override` (null = auto). Statusoppslag (`claude-code-sporing-status.md`) bruker overstyringen først: Posten/Bring-API, PostNord-API, ellers ParcelsApp med `carrier`-hint. Er override satt, skal ikke e-post-tolkningen endre transportøren. Vis «valgt» i appen og på web.
- 2026-10-18: «dette skal lige i innstligner for kalener ikke i kalender siden» (vedlegg: KALENDERE-kortet med Google Kalender og Home Assistant på Bursdager-siden)
  - `Mobil Papir App.dc.html`: ny underside **Innstillinger → Kalendere** med Google Kalender (logg inn, velg kalender, skriv, hent kontakter, synk, logg ut) og Home Assistant (velg `calendar.*`, synk to veier, importer). Den finnes også under Integrasjoner → KALENDERE og i innstillingssøket.
  - `Bursdager.dc.html`: KALENDERE-kortet er fjernet fra Bursdager-siden. Nederst i listen er det en rad «Kalendere · Google … · HA … · Innstillinger ›» som åpner undersiden. Ny prop `calOnly` viser bare kalenderoppsettet, og `onSettings` er lenken. Dataene er felles (`bd_v1`) og oppdateres i begge visningene.
  - For Claude Code: flytt kalenderoppsettet til Innstillinger → Kalendere på iOS, Android og web. Bursdager-siden har bare lenkeraden.
- 2026-10-18: «igjen når jeg feks er i bursdag og trykker på mer åpne mer menyen»
  - Testet i designet: Mer → Bursdager → trykk ⋯ Mer åpner Mer-menyen. Feilen er i appen.
  - Skrevet `prompts/claude-code-mer-fane.md`: trykk på aktiv fane går til fanens rot (Mer-menyen), og trykk en gang til scroller til toppen. Gjelder alle faner og Finans → Mer. Hold inne skal ikke sluke neste trykk. Inneholder kode for SwiftUI, Compose og web, og test.
- 2026-10-18: «lag bedre integrasjon meny i mobil instilineger. hvis hver integraion med navn, mer som i nett versjonen»
  - `Mobil Papir App.dc.html` → Innstillinger → **Integrasjoner** er bygget om etter nettversjonen (`Homelab v2` → Integrasjoner):
    - **Liste gruppert** i Smarthjem · Transport og pakker · Økonomi · AI · Informasjon · Annet. Hver rad har et farget merke (HA, 31, R, B, PN, PA, T, BK, @, F, G, CF, Yr …), navn, kort beskrivelse og status til høyre. Grønn betyr «Tilkoblet», rød betyr «Mangler API-nøkkel». Pil til høyre.
    - **Egen side per integrasjon:** toppkort med merke, navn og status. OPPSETT har feltene, som redigeres rett under raden med hemmeligheter skjult. **SLIK GJØR DU** har nummererte steg for å finne nøkkel eller token. Home Assistant har også synk av lister. Nederst: Test tilkobling og Fjern alle verdier. «‹ Integrasjoner» går tilbake.
    - Kalendere, Trading 212, Bankimport og Gemini åpner sine egne sider.
  - For Claude Code: samme struktur på iOS og Android. Listen hentes fra `GET /api/integrasjoner` (id, navn, kategori, farge, status, felt, guide), og felt lagres med `PUT /api/integrasjoner/:id`. Samme guidetekster som på web.
- 2026-10-18: «i finans som i hjem på mobil la meg holde inne navbar for å rediger navn ikon rekkefølge og slikt.»
  - `Mobil Papir App.dc.html`: hold inne på fanelinjen i Finans for å åpne **«Rediger fanelinjen»** med etiketten FINANS · FANELINJE. Arket er det samme som for Hjem: gi faner nytt navn, velg ikon, flytt med ↑, fjern med −, legg til fra Oversikt, Liste, Finn, Søk, Budsjett, Kvitteringer, Aksjer, Abonnementer, Kontoer og Boliger (maks 5, og Mer ligger alltid sist). Stil og forhåndsvisning er med, og «Tilbakestill til standard» finnes også. Lagres i `papir_fin_nav` (rekkefølge) og `papir_fin_lbl` (navn og ikon).
  - For Claude Code: samme editor for Finans-fanelinjen på iOS og Android (`user_settings.fin_nav` = [{key, label?, icon?}]). Profiler setter startverdien, og egne endringer gjør profilen «Egendefinert».
- 2026-10-18: «lag en fin kalender side meg skolekalender med ukes view måned og agenda.»
  - Ny `Kalender.dc.html` (mobil og web, Papir-stil). I appen ligger den under Mer → **Kalender**, og på web som fanen **Kalender**.
    - **Nå-kort** (mørkt): NÅ med time, rom, lærer, minutter igjen og fremdriftslinje. Ellers NESTE TIME eller NESTE SKOLEDAG, pluss neste prøve («Prøve i engelsk om 5 dager»).
    - **Prøver og frister:** dato, navn, tid og rom, og nedtelling (rød når det er 7 dager eller mindre).
    - **Uke · Måned · Agenda**-velger, ‹ › og «I dag». Filterbrikker: Timeplan · Prøver og frister · Bursdager · Skole.
    - **Uke:** Man–Fre i tidsrutenett 08–16 med fargede blokker per fag (prøver i rød) og rød nå-linje. Hele dagen-rad for frister og bursdager. Uke-nummer og datoer. I helgen vises neste uke.
    - **Måned:** 7 × 6 rutenett med prikker per type, i dag i rødt og valgt dag med ramme, og liste for valgt dag under.
    - **Agenda:** tre uker fremover, gruppert per dag («I DAG · MANDAG 19. OKTOBER»), med tid, fargestripe, tittel, rom og lærer, og PRØVE- eller FRIST-merke.
    - Trykk på en hendelse åpner et **detaljkort** med rom, lærer, fag, merknad, påminnelse (Ingen / 15 min / 1 time / Dagen før) og «Finn rommet i MazeMap ↗».
    - Bursdager hentes fra Bursdager (`bd_v1`). Planleggingsdag fjerner timene den dagen. Valg lagres i `kal_v1`.
  - For Claude Code: se `claude-code-kalender.md`.
- 2026-10-18: «lag widget for mobil ios samsung android. alle tre størrelser.»
  - `Kalender.dc.html`: ny seksjon **WIDGETS PÅ TELEFONEN** med 9 forhåndsvisninger:
    - **iPhone:** liten 158 × 158, medium 338 × 158, stor 338 × 354.
    - **Android Material You:** 2 × 2, 4 × 2 og 4 × 4.
    - **Samsung One UI:** 2 × 2 = 134 × 155 som Samsung Vær, 4 × 2 og 4 × 4.
  - Innhold: liten viser neste time, medium også de tre neste, og stor hele dagen og prøver og frister. Etter skoletid vises neste skoledag.
  - `claude-code-kalender.md`: avsnittet Widgets har mål, innhold, oppdateringstidspunkter, dyplenke og mørk modus.
- Rettet fra kontrollen: hendelser utenfor 08–16 (Foreldremøte 18:00) vises i hele dagen-raden, og prøver og frister er sortert etter dato. Prøve i engelsk er flyttet til torsdag 22.10 og Heldagsprøve R2 til fredag 06.11.
- 2026-10-18: «kalender, la meg rearegne rekkefølgen på korten»
  - `Kalender.dc.html`: hold inne på et kort i 0,5 s for å gå i **rediger-modus**. Kortene får stiplet ramme og ▲ ▼ øverst til høyre, og en pille øverst viser «Flytt kortene med ▲ ▼ · Tilbakestill · Ferdig».
    - Kortene som kan flyttes: Nå-kort, Prøver og frister, Kalendere-lenken, selve kalenderen (Uke/Måned/Agenda) og Widgets.
    - Trykk på innholdet er sperret mens du redigerer. Rekkefølgen lagres i `kal_v1.ord`.
    - På web står kalenderen fast i høyre kolonne. De andre kortene flyttes i venstre kolonne, og Widgets går over hele bredden.
  - For Claude Code: samme oppførsel i appen (som Sporing og Hjem), med rekkefølge per bruker i `user_settings.kalender_order`.
- 2026-10-18: «legg til widget på hjem.»
  - `Mobil Papir App.dc.html` → Hjem: ny widget **KALENDER**. Den viser NÅ, NESTE TIME eller ukedag, fag i Newsreader med fargestripe, rom og lærer, og klokkeslett med «om 1 t 5 min» eller «34 min igjen». Under står de tre neste timene som små brikker, og **NESTE PRØVE** med nedtelling. Trykk åpner Kalender.
    - Den kan flyttes og skjules som de andre Hjem-widgetene og ligger som standard etter Avganger. Har du et lagret oppsett, legges den til nederst.
  - `Kalender.dc.html`: ny prop `mode="widget"` (kompakt kort) og `onOpen`.
- 2026-10-18: «kalender editor la meg skjule kortet.»
  - `Kalender.dc.html` (rediger-modus): hvert kort har en rød **−** ved siden av ▲ ▼ som skjuler kortet. Skjulte kort ligger under pillen som **SKJULT · + Nå-kort · + Widgets …**, og et trykk tar dem tilbake. Minst ett kort må være synlig. «Tilbakestill» viser alle og setter rekkefølgen tilbake. Lagres i `kal_v1.hidC`.
- 2026-10-18: «ordene bredde» (vedlegg: Nå-kortet var smalere enn de andre kortene)
  - `Kalender.dc.html`: alle kortene fyller nå hele bredden på mobil. Kortene ble før bare så brede som innholdet.

## Tilhørende filer
- `claude-code-prompt-26-START.md` (= `00-START-HER.md` i pakken)
- `claude-code-sporing-status.md` (fra prompt 22)
- `claude-code-samsung-widgets.md` (fra prompt 24)
- `claude-code-kalender.md`
- `claude-code-mer-fane.md`
