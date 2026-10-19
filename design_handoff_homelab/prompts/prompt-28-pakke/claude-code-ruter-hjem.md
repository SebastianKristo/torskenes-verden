# Ruter-kortet på Hjem

Fasit: `Mobil Papir App.dc.html` → Hjem → Avganger (skjermbilde 13.33.44 = ønsket utseende).

- **Ingen «Velg stopp»-knapp** på kortet. Kun tittel + «sanntid ›».
- Tittel: `AVGANGER · STOPP1 · STOPP2 · …` (IBM Plex Mono 10.5, `lab`, ellipsis).
- Én flat liste uten gruppeoverskrifter:
  - Flere stopp: neste avgang fra hvert stopp (én rad per stopp).
  - Ett stopp: de neste N avgangene (N fra innstillingen).
- Rad: linjemerke 30×24 radius 6 i linjens farge fra Entur (`presentation.colour`), **hvit** tekst 12/800 · destinasjon 14.5/600 · tid Newsreader 22/600. **0 min vises som «nå» uten «min».**
- **Velge stopp:** hold inne Hjem → wiggle-modus → pille **«✎ Rediger widget»** midt på kortet (sentrert vertikalt og horisontalt) → åpner arket «Hjem · Ruter-kortet» (velg opptil 3 stopp, antall avganger). Som iOS «Rediger widget».
- Trykk på kortet utenfor wiggle-modus åpner Ruter-siden (sanntid).

## Animasjon: åpne/lukke en avgang (Ruter-siden)
Feil (skjermopptak 13.34.08): når en avgang er åpnet og lukkes, hopper/kollapser den rart oppover.
- Stopplisten skal ligge **alltid i layouten** og animere høyde 0 ↔ innhold, ikke settes inn/fjernes med `if`.
  - iOS (SwiftUI): ikke bruk `if open { … }` med `.transition(.move(edge: .top))`. Bruk `.frame(height: open ? nil : 0, alignment: .top).clipped()` + `.animation(.spring(response: 0.32, dampingFraction: 0.9), value: open)`, og innhold med `.opacity(open ? 1 : 0)` og `.offset(y: open ? 0 : -6)`. Listen må ha `.animation` på samme verdi så radene under glir jevnt.
  - Android (Compose): `AnimatedVisibility(open, enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(), exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut())` og `Modifier.animateContentSize()` på raden.
  - Web: `grid-template-rows: 0fr ↔ 1fr` (0.32 s, cubic-bezier(.2,.8,.2,1)) med `overflow:hidden` på barnet.
- Ikke scroll listen når en rad lukkes. Raden skal bli liggende der den er.
- Bare én avgang åpen om gangen. Åpnes en ny, lukkes den forrige samtidig med samme animasjon.
