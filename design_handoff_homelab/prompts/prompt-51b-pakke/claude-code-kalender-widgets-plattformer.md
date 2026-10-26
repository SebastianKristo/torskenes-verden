# Kalender-appen: widgets for iOS, Android og One UI

Fasit: `Kalender Widgets.dc.html` (også i `Kalender App Oversikt.dc.html` → KALENDER · WIDGETS). Samme data som appen (App Group `group.no.kristo.kalender` / delt Room-DB), kalenderfarger fra innstillingene.

## Felles
- Viser kommende hendelser fra nå (ferdige i dag skjules), hele dagen og frister med egen tekst («Hele dagen», «Frist 23:59»).
- Fargestrek/-prikk = kalenderens farge (Personlig, Skole, Bursdager, frister).
- Trykk: dato → dagen, hendelse → hendelsen, + → ny hendelse (skrivefelt med Glimt). Lenker `kalender://dag/…`, `kalender://hendelse?id=…`, `kalender://ny`.
- Oppdatering: tidslinje ved hver start/slutt + midnatt; reload ved endring i appen eller push fra Homelab.
- Tom tilstand: «Ingen flere i dag» + neste dag med hendelser.

## iOS (WidgetKit)
- **Liten:** ukedag (rød), stor dato, neste hendelse (2 linjer) med fargestrek, «+N til».
- **Medium:** dato, måned, UKE nn til venstre; tre neste til høyre.
- **Stor:** månedsrutenett (i dag rød sirkel, prikk på dager med hendelser), UKE, + (App Intent), to neste.
- **Låseskjerm:** inline («Man 26. ▦ 15:15 Tannlege»), sirkulær (ukedag + dato), rektangulær (neste hendelse, tid, sted). Bruk `.widgetAccentable()`.
- StandBy/tonet modus: `containerBackground` + accentable på dato og streker.

## Samsung · One UI
- Gjennomsiktig hvit (78 %) med blur, radius 28, SamsungOne. Gjennomsiktighet og mørk modus følger One UI-innstillingen for widgets.
- **2×2:** dato + ukedag, to neste med prikk.
- **4×2:** «Mandag 26. oktober · uke 44», + , tre rader (tid · prikk · tittel · dag).
- **4×4:** måned med ‹ › (bla uten å åpne appen) og blå + (One UI-blå `#1259C3`), i dag i blå sirkel; to neste under.
- Kan stables i One UI-widgetstabel sammen med Prøveperioder.

## Android · Material You (Glance)
- Dynamiske farger fra bakgrunnen (`GlanceTheme.colors`), radius 28, Google Sans.
- **2×2:** ukedag-pille, stor dato, neste hendelse.
- **4×2:** mørk datoblokk (ukedag, dato, uke) + tre hendelser som avrundede rader.
- **4×3 agenda (kan skaleres):** dagens dato, «N hendelser igjen i dag», «+ Ny»-knapp, gruppert I dag / I morgen / ukedag. `LazyColumn` så den kan scrolles.
- Responsive størrelser via `SizeMode.Responsive`.
