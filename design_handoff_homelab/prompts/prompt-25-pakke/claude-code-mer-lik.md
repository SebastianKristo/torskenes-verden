# Til Claude Code: «Mer»-menyen skal være lik på Android og iPhone (og som designet)

Fasit: `design/Mobil Papir App.dc.html` → side `mer` (og Finans → Mer = side `fmer`). Android avviker fra iPhone og designet. Bygg **én felles komponent** med identiske verdier på iOS (SwiftUI) og Android (Compose). Ikke bruk Material `ListItem`, `NavigationDrawer`, `ModalBottomSheet` eller systemets innstillingsliste.

## Global «Mer» (side `mer`)
1. **Topp:** felles toppbilde med «‹ Hjem» (eller ingen tilbake hvis Mer er en fane), profilbilde, undertittel og tittel **Mer** (Newsreader 500, 40). Første kort overlapper toppbildet med −23 pt, som på de andre sidene.
2. **Ett kort** (radius 20, `card`, skygge `0 10 30 -14 / 30 %`, `overflow:hidden`). Hver rad:
   - padding 13 / 14
   - tittel i **Newsreader 500, 19**
   - undertekst Manrope 12.5 `mut`
   - «›» til høyre i `mut`
   - skillelinje **bare mellom** rader (1 px `line`)
   - **ikon til venstre**: boks 40 × 40 (radius 12, `bg`-farge) med strekikon 21 (strek 1.9) i fargene fra ikonpaletten, samme som i Innstillinger (Hjem hus, Domener globus, Sporing pakke, Bursdager gave, Huskeliste avkrysning, Familie og kart pin, Media play, Finans kort, Nyhetsleser RSS, Innstillinger tannhjul)
   - ingen egne kort per rad, ingen Material-rippel med grå bakgrunn (bruk kort trykk-opasitet 0,6)
3. **Rekkefølge og tekster:**
   | Rad | Undertekst |
   |---|---|
   | Sporing *(eller Domener hvis Sporing ligger i fanelinjen)* | «N pakker på vei» / «Pakker og sendinger» |
   | Bursdager | «Hvem har bursdag snart» |
   | Huskeliste | «Oppgaver og widgets» |
   | Familie og kart | «Posisjon, soner og helse» |
   | Media | «Spilles nå og historikk» |
   | Finans | «Oversikt, liste, Finn og mer» |
   | Nyhetsleser | «RSS med AI-sammendrag» |
   | Innstillinger | «Tema, bakgrunn og konto» |
   - Skjulte moduler (Innstillinger → Moduler) og faner som allerede ligger i fanelinjen tas ut av listen.
4. **Fanelinje:** «Mer» er markert (lys pille med ⋯ og tekst) mens Mer eller en underside av Mer er åpen. Skann-knappen (FAB) vises som på Hjem.

## Finans → Mer (side `fmer`)
- Rutenett `repeat(auto-fill, minmax(150, 1fr))`, gap 10. Fliser 132 høye, radius 20, `card`.
- **Fargede ikoner** i 42 × 42-boks (radius 12, 14 % farge blandet i kortfargen). Fargene: Budsjett `#c0562a`, Kvitteringer `#b23a2a`, Faste `#7a5ad6`, Kontoer `#2b5d8a`, Aksjer `#2f7d4f`, Rapporter `#a8661a`, Subscription OS `#c2417a`, Boliger `#3f7a6e`, Import `#4a5bbf`, Finn `#2b6cb0`, Søk `#7a3b6b` og Innstillinger `#6b6558`.
- Tittel Newsreader 500 20, verdi under 12.5 (`pos` ved ▲). Merke med antall øverst til høyre (Kvitteringer).
- **Hold inne og dra** for å endre rekkefølgen. Pillen «Dra for å flytte · Tilbakestill · Ferdig» er hvit med skygge. Rekkefølgen lagres.

## Fanelinje
Ikon ved siden av tekst: se avsnittet «Fanelinje – ikon ved siden av tekst» i `claude-code-familie-design.md` (18 pt boks, 16 pt glyf, sentrert og 1,5 pt ned, `includeFontPadding = false` på Android).

## Mørkt tema
Samme struktur. `card` `#211f19`, `ink` `#f3efe6`, `line` `#34312a`, `mut` `#8a8578`.

## Test
Åpne Mer og Finans → Mer på iPhone 15 og Pixel 8 / Galaxy S24, i lyst og mørkt tema. Legg skjermbildene ved siden av designet i 390 bredde. Rader, fonter (Newsreader-titler), skillelinjer, ikonfarger og overlapp mot toppbildet skal være like.
