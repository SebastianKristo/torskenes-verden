# Finans → Liste: avrundet månedslinje når den er festet

Ønske 2026-10-24: «når man scroller ned her gi den en mer avrunnet utsende» (vedlegg `Screenshot 2026-10-24 at 17.25.32.png`, `17.25.46.png`).
Fasit: `Homelab.dc.html` → Finans → Liste, `stickInit()` og `data-fstick`.

## Feil i dag
Månedsoverskriften («OKTOBER · 3 … Netto −340,37 kr») fester seg øverst som en firkantet, kantløs stripe med tykk svart strek under. Den stikker ut over listekortene og ser ut som en feil.

## Slik skal det være
- **Ikke festet (i flyt):** som i dag: mono-etikett til venstre, netto til høyre, 2 pt svart strek under.
- **Festet øverst (når man har scrollet):**
  - Hjørneradius 16 pt, hele linja blir en flytende pille.
  - Bakgrunn: kortfarge 88 % + bakgrunnsuskarphet (iOS `.ultraThinMaterial` / Android blur 14 dp), tynn 1 pt kontur i linjefarge og myk skygge `0 10 24 −14 rgba(27,26,23,.45)`.
  - Den svarte streken forsvinner.
  - Innvendig luft 10 pt vertikalt, 14 pt horisontalt, 6 pt bredere enn listen på hver side.
  - Avstand 10 pt fra toppen av scrollområdet (under hero/statuslinje).
- **Overgang:** 0,22 s ease mellom de to tilstandene (radius, luft, bakgrunn, skygge). Neste måned skyver den forrige ut som før.
- Gjelder lyst og mørkt tema og alle fargeprofiler (bruk temaets kort-, linje- og bakgrunnsfarger).
- SwiftUI: `LazyVStack(pinnedViews: [.sectionHeaders])` + `GeometryReader`/`onGeometryChange` for å vite når headeren er festet. Compose: `stickyHeader` + sjekk `firstVisibleItemIndex`/offset.
