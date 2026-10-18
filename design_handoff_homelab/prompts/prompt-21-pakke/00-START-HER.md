# Til Claude Code: Prompt 21 – start her

Les denne filen først. Hver oppgave under har en egen fil med detaljer. Designet i `design/` er fasit: der appen eller nettsiden avviker fra designet, er det appen som skal endres.

## Rekkefølge
1. **Bakgrunnsbilder** → `claude-code-bakgrunn.md`
   Bruk ekte foto (Oslo, Vær nå, Planeter: Jorda, Månen, Jupiter, Mars, Saturn) i stedet for tegnet planet, både i app og på nettside.
2. **Logobibliotek** → `claude-code-logobibliotek.md` + `claude-code-logoer.md`
   Internt register med norske butikker og tjenester, nedlastet og pakket med appen. Felles `<Logo>`-komponent.
3. **Pakkekort med logo** → `claude-code-pakke-logo.md` (bygger på 2)
4. **Kart** → `claude-code-kart-fiks.md`
   Bytt til Kartverket-fliser via backend-proxy. CARTO viser nå «API KEY REQUIRED», og OSM gir 403. Fiks Android-krasjen i Kart.
5. **Familie: Kart · Soner · Helse i fanelinjen nederst** (se `design/Mobil Papir App.dc.html`, side `kart`)
   Når Familie er åpen, viser bunnmenyen Kart, Soner, Helse og Mer, som i Subscription OS. Knappene øverst i Familie skjules i appen.
6. **Avganger med holdeplasser** → `claude-code-avgang-stopp.md`
7. **Redigering av Hjem-widgets (hold inne og dra)**
   - Langt trykk (500 ms) virker på hele widgeten, også på lenker og knapper. Klikket etter et langt trykk skal **ikke** åpne siden.
   - I redigeringsmodus blokkeres alle trykk inne i widgetene, unntatt ▲ ▼ −.
   - Dra for å flytte (widgeten følger fingeren, litt forstørret og gjennomsiktig). Pilene virker fortsatt. Rekkefølgen lagres per side og synkroniseres.
   - Fingeren flyttes mer enn 8 px før 500 ms → avbryt, la scrolling skje.
   - iOS: `onLongPressGesture` + `.onDrag`/`.onDrop` med `simultaneousGesture` slik at `NavigationLink` ikke trigges. Android: `detectDragGesturesAfterLongPress` i Compose. Bruk `consume()`.
   - Samme for Finans → Mer-flisene: hold inne, dra og lagre (`fm_order`). Redigeringslinjen («Dra for å flytte · Tilbakestill · Ferdig») er en hvit pille med skygge, ikke gjennomsiktig over toppbildet.
8. **Strek over KØ i Kvitteringer** → `claude-code-kvittering-strek.md`
9. **Fargede ikoner på Finans-flisene** (se designet, `fmtiles`): Budsjett `#c0562a`, Kvitteringer `#b23a2a`, Faste `#7a5ad6`, Kontoer `#2b5d8a`, Aksjer `#2f7d4f`, Rapporter `#a8661a`, Subscription OS `#c2417a`, Boliger `#3f7a6e`, Import `#4a5bbf`, Finn `#2b6cb0`, Søk `#7a3b6b` og Innstillinger `#6b6558`. Ikonboksen har 14 % av fargen blandet inn i kortbakgrunnen.
10. **Lasteskjerm for Økonomi på web** (se `design/Homelab Papir Web.dc.html`)
    Papir-bakgrunn, rødt «kr»-merke, «Økonomi», glidende rød linje, «‹ Hjem». Bruk som Suspense-fallback. Forhåndslast bunten ved hover og hent `/finans/api/oversikt` parallelt.

## Fra prompt 20 (ta med hvis ikke gjort)
- `claude-code-helse-ios.md`: HealthKit-tillatelse og meny «Helse og posisjon»
- `claude-code-posisjon-kort.md`: Posisjon · Familie-kortet på Hjem

## Åpent (ikke implementer ennå)
- «Sveip på iOS-appen på den måten» (skjermopptak). Venter på hvilken sveip som menes.

## Designfiler i `design/`
- `Mobil Papir App.dc.html`: mobilappen (iPhone, Android, Fold)
- `Homelab Papir Web.dc.html`: nettsiden
- `Familie.dc.html`: Kart, Soner og Helse (tar imot `tab`- og `hide-tabs`-prop)
- Øvrige DC-er som importeres: Huskeliste, Boliger, Aksjer Mobil, Subscription OS, Vaer, Nyhetsleser, Homelab Domener Papir og FinansHub v2
- `support.js`: kjøremiljø for å åpne `.dc.html` i nettleser

Åpne en `.dc.html` direkte i nettleseren for å se fasiten.
