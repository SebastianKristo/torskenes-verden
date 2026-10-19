# Kalender: Mac-appen og web skal være helt like

Ønske 2026-10-20: «gjør kalender-appen for Mac og kalender i web-versjonen helt lik.»

## Regel: én kodebase, én UI
- **Kalender på web** (Homelab → Kalender) og **Kalender.app for Mac** er **samme komponent med samme visning**. Fasit i designet: begge bruker `Kalender.dc.html` med `variant="web" full` (`Homelab Papir Web.dc.html` åpner nå Kalender i **fullskjerm** som standard, likt Mac-vinduet i `Kalender Mac.dc.html`).
- **Mac-appen = web-bundelen** pakket i Tauri (anbefalt) eller Electron, og laster samme build som `home.kristo.no/kalender`. Ingen egen Mac-UI-kode.
  - **Bare** dette er Mac-spesifikt:
    - native vindusramme (trafikklys, tittel «Kalender»)
    - menylinje-kalenderen
    - Dock-ikon med dato
    - native varsler
    - ⌘-snarveier (⌘N ny hendelse, ⌘T i dag, ⌘1–5 visninger, ⌘F søk, ⌘, innstillinger)
    - widgets
  - Alt annet er felles: visninger (År/Mnd/Uke/3 d/Dag/Liste), sidemeny med kalendere og farger, Glimt-felt + rød +, søk, detaljark med kart, fag-farger, ukenummer, zoom, innstillinger, mørkt tema.
- **Ny funksjon** legges inn én gang i den felles komponenten og kommer i både web og Mac i samme release. Det samme gjelder funksjonene fra iPhone-appen (`Kalender App.dc.html`) som web mangler:
  - Glimt-asistenten med «i morgen» og skoleprøve-intensjon
  - farge per fag
  - adresse og kart ved Glimt-hendelser
  - zoom-overganger
  - tastatur- og ark-oppførsel
  Desse portes til den felles web-komponenten, så Mac får dem automatisk.
- **Fullskjerm på web:** web åpner Kalender i fullskjerm (som Mac). ✕ oppe til høyre går tilbake til Dashboard. Valget «Vis i meny» finnes fortsatt i Innstillinger (`hl_kal_full = '0'`).
- **Test:** samme skjermbilde av Uke-visningen i Safari (1320 × 860) og Kalender.app skal være piksel-likt, bortsett fra vindusrammen.
