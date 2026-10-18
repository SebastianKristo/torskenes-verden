# Prompt 20

Startet: 2026-10-18

- 2026-10-18: «ikon vedsida tekst også litt feil litt høyere opp, legg alt fra nå i ny promt. promt 20. takk» (vedlegg: skjermbilde av bunnmenyen, ikonet ◎ ved «Oversikt» sitter høyere enn teksten)
  - Fikset i `Mobil Papir App.dc.html`: ikonet i bunnmenyen er nå sentrert vertikalt mot teksten (fast 18×18-boks, line-height 1, flyttet 1,5 px ned).
- 2026-10-18: «vis google ikon i søkebar på mobil, det er ikke det nå.» (vedlegg: Google «G»-ikon)
  - Lagt inn Google-«G» i søkefeltet i `Mobil Nytt Design.dc.html` (erstattet ⌕) og `Homelab Mobil.dc.html`. `Mobil Papir App.dc.html` hadde det allerede.
- 2026-10-18: «du claude code når den får promten skal lage en intern liste over ikoner og logoer, du skal laste ned kjente butikker og sider spesielt i norge sine logoer, som biltema, clash olhson, rema, komplett, finn, ruter. og mange andre. alt som er vanelig å komme på kviteringer og tranaskjoner.»
  - Skrevet `prompts/claude-code-logobibliotek.md`: internt register (`registry.json`) og nedlastingsskript, logoene følger med i appen, matching av banktekster (VIPPS*, KLARNA*, IZ * osv.) og ca. 250 norske butikker og tjenester i 15 kategorier, med akseptansetest.
- 2026-10-18: «når jeg åpner kartet på android appen krasjer appen. og får dette på kart på pc.» (vedlegg: Leaflet-kart fullt av «403 Access blocked – App is not following the tile usage policy of OpenStreetMap»)
  - `Familie.dc.html` (+ handoff-kopi) bruker nå CARTO Voyager-fliser i stedet for tile.openstreetmap.org.
  - Skrevet `prompts/claude-code-kart-fiks.md`: bytt kartleverandør via backend-proxy/cache og feilsøk Android-krasjen (logcat, osmdroid user agent, API-nøkkel, posisjonstillatelse, null-posisjon, feilgrense).
- 2026-10-18: «logo bibilotiek filen gi den sammen med protmten når jeg spør om den. samme med kart fiks.»
  - Lagt inn regel i CLAUDE.md: prompt-filen leveres alltid sammen med tilhørende Claude Code-filer.
- 2026-10-18: «i mobill gi farge på forskjellige ikoner» (vedlegg: Finans-flisene i mobil, alle ikoner røde)
  - `Mobil Papir App.dc.html`: hver Finans-flis har nå egen ikonfarge med tonet bakgrunn (Budsjett oransje, Kvitteringer rød, Faste lilla, Kontoer blå, Aksjer grønn, Rapporter oker, Subscription OS rosa, Boliger grønnblå, Import indigo, Finn blå, Søk plomme, Innstillinger grå).
- 2026-10-18: «la meg holde inne for rearenge de.»
  - Finans-flisene: hold inne ~0,45 s → redigeringsmodus (flisene vibrerer/vugger), dra for å flytte, «Ferdig» og «Tilbakestill». Rekkefølgen lagres (`papir_fm_order`).
- 2026-10-18: «legg også inn dette bildet i ruter vinduet.» (vedlegg: trikkebildet fra Ruter-sanntidsvisningen)
  - Avganger-kortet på Hjem har nå samme trikkebilde (Ruter-bakgrunnen) som bildefelt øverst, med «AVGANGER · AMAGERVEIEN» og «sanntid ›» i hvitt over bildet.
- 2026-10-18: «ios appen spurte ikke im helse data, det er heller ikke en toggle for det i ios innstlinger odene det.»
  - `Mobil Papir App.dc.html`: onboarding steg 3 har nå «Posisjon» og «Apple Health» / «Health Connect». Ny meny Innstillinger → App → «Helse og posisjon» med hovedbryter, «Be om tilgang», bryter per datatype, posisjonsvalg og «Åpne iOS-innstillinger».
  - Skrevet `prompts/claude-code-helse-ios.md`: HealthKit-capability, Info.plist-tekster, requestAuthorization i onboarding og meny, bakgrunnssynk, Health Connect på Android.
- 2026-10-18: «ordene designet på personer også appen fikk feil design. de to kortene er hvordan det skal se ut fiks det.» (vedlegg 1: appen viser «POSISJON / Familie ›», svarte avatarer, Sebastian to ganger, «Ukjent sted». Vedlegg 2: fasit «POSISJON · FAMILIE / kart ›», 2 kolonner, fargede avatarer med statusprikk, sonenavn)
  - Designfilen har allerede riktig kort. Skrevet `prompts/claude-code-posisjon-kort.md` slik at appen bygges likt: layout, farger, initialer, statusprikk, «Du» uten duplikat, sone/sted i stedet for «Ukjent sted».
- 2026-10-18: «det skal ikke være noe bilde her, bare i ruter tabben. den skal være som før.» (vedlegg: Avganger-kortet på Hjem med trikkebilde)
  - Tilbakestilt: Avganger-kortet på Hjem er uten bilde igjen. Trikkebildet vises bare i Ruter-visningen (sanntid).
- 2026-10-18: «legg filen posisjon kort også i promten.»
  - `claude-code-posisjon-kort.md` står under «Tilhørende filer» og leveres med prompt 20.
- 2026-10-18: «+ stopp knappen må fikses vanakelig å lese.» (vedlegg: «+ Stopp» med gjennomsiktig bakgrunn over trikkebildet)
  - «+ Stopp» i Ruter-visningen har nå kortbakgrunn (`--card`) og mørkere stiplet kant, så teksten er lesbar også over bildet.
- 2026-10-18: «når man i nettsiden er på hjem og skal åpne økonomi siden er det sort laster inn skjerm i kansje ett til 4 sekunder legg til en loading screen som er penere»
  - `Homelab Papir Web.dc.html`: svart bakgrunn byttet med Papir-lasteskjerm (papirbakgrunn, rødt «kr»-merke, «Økonomi» i Newsreader, glidende rød fremdriftslinje, «HENTER KONTOER, BUDSJETT OG KVITTERINGER» og «‹ Hjem»-knapp). Den ligger under FinansHub og dekkes automatisk når siden er lastet.
  - For Claude Code: bruk samme lasteskjerm som Suspense-/route-fallback. Forhåndslast Økonomi-bunten ved hover på lenken (`import()` / `<link rel="modulepreload">`) og hent `/finans/api/oversikt` parallelt, så ventetiden blir kortere.

## Tilhørende filer
- `claude-code-logobibliotek.md`
- `claude-code-kart-fiks.md`
- `claude-code-helse-ios.md`
- `claude-code-posisjon-kort.md`
