# iOS: fanelinjen nederst

Ønske (2026-11-27): «på ios den er høyere på skjermen enn den skal være. feil farge på tekst på de andre tabs, de skal ha hvit navn.»
Vedlegg: `uploads/Screenshot 2026-11-27 at 17.51.07.png`, `17.51.23.png`.

Fasit: `Homelab.dc.html`.

## 1. Tekstfarge
Inaktive faner (Oversikt, Chat, Nyheter, Mer) skal ha **hvit** tekst og hvite ikoner: `#ffffff`, både i lyst og mørkt tema. Den aktive fanen er uendret (lys pille, mørk tekst). Badge er uendret.
Token: `navInk = #ffffff`. Den gamle verdien `#b3ada1` slettes.

## 2. Plassering (står for høyt)
Linjen skal stå **12 pt over home-indikatoren**, ikke over en ekstra tom flate.
Årsak: safe-area legges til to ganger. Både WebView/rot-containeren og fanelinjen legger på `env(safe-area-inset-bottom)` (eller `.safeAreaInset` / `contentInset` på native-siden), og avstanden ble dobbelt.
- Native: `WKWebView.scrollView.contentInsetAdjustmentBehavior = .never`. WebView-en fyller hele skjermen (`.ignoresSafeArea()`).
- Web: `<meta name="viewport" content="…, viewport-fit=cover">`.
- Fanelinjen: `bottom: max(12px, env(safe-area-inset-bottom) - 8px)`. Ingen ekstra padding-bottom på `body`/rot.
- Innholdet over får `padding-bottom` = linjehøyde + samme bunnavstand, slik at den siste raden ikke havner under linjen.

Ferdig når: på iPhone med Face ID står fanelinjen like over home-indikatoren, med samme avstand som på sidene (12 pt), og inaktive faner er hvite.

## 3. Fjern den røde tall-prikken (2026-11-27)
Ønske: «det blir feilm fjern rød prikken med 8». Vedlegg: `uploads/Screenshot 2026-11-27 at 17.55.19.png`, `17.55.43.png`.
- Fjern badgen med antall kvitteringer («8») fra Økonomi-fanen i hovedlinjen, både når fanen er aktiv og når den er inaktiv. Den presset navnet ned til «Øko…».
- Fanen viser bare «Økonomi», uforkortet, i samme hvite tekst som de andre.
- Antallet vises fortsatt inne i Økonomi («8 kvitteringer til gjennomgang») og på Finans-kortet på Hjem. Ingen badge andre steder i fanelinjen.
- Fasit: `Homelab.dc.html`. Fanelinjen der har ingen badge.

## 4. Ikon ved siden av valgt fane (2026-11-27)
Ønske: «den skal jo også vise ikonet vedsidan fanene som er vaglt». Vedlegg: `uploads/Screenshot 2026-11-27 at 17.56.00.png`.
- Den aktive fanen (lys pille) viser **ikon + navn** side om side: ikon 20 pt, mellomrom 8 pt, strek 1.8, `currentColor` (#1b1a17). Inaktive faner viser bare navn i hvitt.
- Ikoner: Oversikt = hus, Økonomi = kort, Chat = snakkeboble, Nyheter = avis, Mer = tre prikker. Samme ikoner som i `Homelab.dc.html` (fanelinjen, `t.svg`).
- Den aktive pillen er bredere (flex 1.5) slik at ikon og navn får plass uten «…».
- Fasit: `Økonomi Fanelinje iOS.dc.html` (1a) og `Homelab.dc.html`.

## 5. Den røde Skann-knappen BLIR (rettet 2026-11-27)
Ønske: «fjern den slikt at er over navbaren», og senere: «den rød knappen skal jo fortasttt være der. den skulle ikke fjernes.»
- **Ikke fjern Skann-knappen.** Den skal stå **over** fanelinjen(e), aldri oppå eller bak dem.
- Plassering: `right: 16`, `bottom` = toppen av den øverste linjen + 12 pt. På Hjem (bare hovedlinjen) ≈ 100 pt. I Økonomi (fanelinje + hovedlinje) ≈ 150 pt.
- Den skal ikke dekke tall i listen: innholdets `padding-bottom` tar med knappens høyde.
- Sliders-knappen ved Økonomi-fanene skal fortsatt fjernes.
- Fasit: `Homelab.dc.html` og `Økonomi Fanelinje iOS.dc.html` (1a).
