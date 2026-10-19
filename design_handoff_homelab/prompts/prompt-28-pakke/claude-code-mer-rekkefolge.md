# Mer: hold inne for å endre rekkefølge og skjule moduler

Fasit: `Mobil Papir App.dc.html` → fanen **Mer**.

## Oppførsel
- **Hold inne** en rad i 0,48 s → redigeringsmodus (lett haptikk). Avbrytes hvis fingeren flytter seg > 8 pt før tiden.
- Slipp etter langt trykk åpner **ikke** modulen.
- Redigeringsmodus:
  - Øverst: eget kort (`card`, radius 18, samme skygge som listen) med etikett «REDIGERER MER» (IBM Plex Mono 10.5, `lab`) over «Dra ≡ for å flytte. Trykk − for å skjule.» i `ink` 13/600 + knapp **Ferdig** (`ink` bakgrunn, `bg` tekst, pille 36 pt). Teksten skal aldri ligge rett på toppbildet (grå på mørkt bilde kan ikke leses).
  - Venstre: rød minus-sirkel 26 pt (`lab`) → skjuler modulen. **Innstillinger** kan ikke skjules (viser hengelås).
  - Høyre: ≡-håndtak (44×44 treffflate, `touch-action:none`). Dra opp/ned; raden løftes (scale 1.02 + skygge), naboer glir på plass (transform .18 s).
  - Under listen: seksjon **SKJULT** med dempede rader (opacity .5) og grønn pluss-sirkel (`pos`) for å vise igjen.
- Vanlig modus: chevron › og hint «Hold inne for å endre rekkefølgen eller skjule moduler.»

## Lagring
- `papir_mer = { o: [nøkler i rekkefølge], h: [skjulte nøkler] }` (localStorage i prototypen).
- I appen: lagres per konto på serveren (`/api/prefs/mer`) så rekkefølgen følger brukeren mellom enheter.
- Nye moduler som ikke finnes i `o` legges sist i standardrekkefølge.

## Native
- iOS: `List` + `.onMove` + `.onDelete`-lignende skjul, `EditButton` erstattes av langt trykk → `editMode = .active`; `UIImpactFeedbackGenerator(.light)`.
- Android: `LazyColumn` + reorderable (long-press drag), `HapticFeedbackType.LongPress`.

## Skann-knappen
- Den røde skann-knappen (FAB og + i fanelinjen) vises **ikke** på Mer-siden. Skjul den når `page == 'mer'`.

## Ny rad
- **Subscription OS** («Abonnementer og faste trekk») legges inn rett etter Finans i Mer. Ikon: to piler i ring (SF Symbol `arrow.triangle.2.circlepath`). Åpner Subscription OS-siden. Kan flyttes/skjules som de andre.
