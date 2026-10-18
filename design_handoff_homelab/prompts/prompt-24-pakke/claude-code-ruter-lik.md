# Til Claude Code: Ruter-visningen skal være lik på Android og iPhone (og som designet)

Fasit: `design/Mobil Papir App.dc.html` → overlegget `av` (åpnes fra Avganger-kortet på Hjem, «sanntid ›»). Android-appen avviker i dag: annen topp («Ruter#»-logo, «Sanntid fra Ruter og Entur»), stoppene ligger i et eget hvitt kort «HOLDEPLASSER · 1 / Rediger», linjen «NESTE AVGANGER · Oppdater ↻» med tykk strek, egne kort per avgang, store tall «28 min» og ingen filter. Bygg **samme komponent** på iOS og Android, piksel-likt med designet.

## Struktur (ovenfra og ned)
1. **Toppbilde** i full bredde (trikkebildet, `background-size: cover`). Padding 52 / 16 / 40, med mørk gradient for lesbarhet.
   - Rad: «‹ Hjem» (pille 36 høy, `rgba(27,26,23,.55)` + blur, Manrope 600 13) til venstre, **«↻ 21:10»** (samme pille, siste oppdatering, trykk = oppdater) til høyre. **Ingen Ruter-logo.**
   - 26 pt ned: *«Sanntid · Ruter»* (Newsreader kursiv 17, 92 %), **stoppnavn** (Newsreader 500, 40, linjehøyde 1.02, tekstskygge), og under «Trikk og buss · 2 min gange» (Manrope 13, 90 %).
2. **Innhold** starter **−34 pt opp i bildet** (overlapper), med gap 14.
3. **Stopp-piller** i én vannrett scrollrad (ikke i et kort): valgt stopp = mørk pille (`ink`/`bg`), de andre = kortfarge med `line`-kant, høyde 36, radius 999, Manrope 600 13. Til slutt «+ Stopp» (kortbakgrunn, stiplet kant 1,5 px `mut`).
   - **Hold inne** på raden (550 ms) → kortet **«Mine stopp»**: liste med ↑ og −, søkefelt «Søk etter holdeplass» (Entur geocoder), treff med «+ Legg til», «Ferdig». Ingen egen «Rediger»-knapp.
4. Statuslinjer: «Henter sanntid fra Entur …» / «Fikk ikke kontakt med Entur. Trykk ↻ for å prøve igjen.» (`lab`).
5. **Filter-segment**: Alle · Trikk · Buss · T-bane · Tog (bare typene som finnes), i kortfarget pille med 4 pt padding. Valgt = `ink`-pille, høyde 34.
6. Avviksmelding (hvis Entur har `situations`): kort med rød «!» og tekst 13.
7. **Avgangsliste i ÉTT kort** (radius 20, kortfarge, `overflow:hidden`). Skillelinjer **bare mellom** rader (`line`). Det skal ikke være separate kort per avgang og ingen «NESTE AVGANGER»-overskrift med tykk strek.
   - Rad (padding 12 / 14): linjemerke (min 34 × 28, radius 7, linjefarge, tekst `#1b1a17` 13/800, hvit tekst på mørke linjefarger), destinasjon (Manrope 600 15), status under (12, `mut` eller `lab` ved forsinkelse: «Buss · 3 min forsinket»), til høyre **minutter** (Newsreader 500 **24**, ikke større) og klokkeslett (11.5, `mut`).
   - Trykk → utvidet stoppliste (se `claude-code-avgang-stopp.md`) og «Åpne i Ruter ›».
8. Fotnote: «Sanntid fra Entur/Ruter når tilkoblet. Trykk på en avgang for å se stoppene.» (12, `mut`).
9. **Ingen fanelinje og ingen skann-knapp** i denne visningen, på iOS og Android. Visningen er et fullskjerm-overlegg (iOS: `.fullScreenCover` eller push med `.toolbar(.hidden, for: .tabBar)`, Android: egen destinasjon utenfor `NavigationBar`-scaffolden). Tilbake = «‹ Hjem» eller sveip fra kanten.
10. **Fasit for iPhone** er skjermbildet av designet (1a): toppbilde, «‹ Hjem» og «↻ 21:11», «Sanntid · Ruter», «Amagerveien», «Trikk og buss · 2 min gange», piller Amagerveien · Majorstuen · Nationaltheatret, segment Alle · Trikk · Buss, og listen med «17 Grefsen st. · Trikk · plattform B · i rute · 2 min · 21:13». Android skal se ut akkurat slik.

## Implementasjon
- Én delt UI-spesifikasjon: tokens, avstander og fonter fra `claude-code-familie-design.md`. iOS: SwiftUI-view `RuterView`. Android: Compose `RuterScreen` med **identiske** verdier (dp = pt). Ikke bruk `Card`/`ListItem` fra Material, de gir egen elevasjon og padding.
- Linjefarger fra Entur `line.presentation.colour` / `textColour`. Fallback: buss `#e60000`, trikk `#0b91ef`, T-bane `#ec700c`, tog `#e1eb00`.
- Begrens til 20 avganger. Oppdater hvert 30. sekund når visningen er åpen.

## Test
Åpne Ruter-visningen på iPhone 15 og Pixel 8 / Galaxy S24 med samme stopp. Legg skjermbildene ved siden av designet i 390 bredde. Toppen, pillene, filteret og listen (ett kort, 24 pt minutter) skal være like.
