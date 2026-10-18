# Til Claude Code: Prompt 22 – start her

Les denne filen først. Designet i `design/` er fasit. Åpne en `.dc.html` direkte i nettleseren for å se den. Der appen eller nettsiden avviker fra designet, er det appen som skal endres.

## Oppgaver (i rekkefølge)
1. **Familie – nøyaktig samme design på iOS og Android** → `claude-code-familie-design.md` + `claude-code-familie-nav.md` + `claude-code-kart-fiks.md`
   Fanelinje Kart · Soner · Helse · Mer, ingen skann-knapp, verktøyrad over kartet, Kartverket-fliser, profilbilder på pins og i lister, soner med ikon og fritt valgt farge.
2. **Værsiden** (fasit `design/Vaer.dc.html`):
   - **Systemfont** bare på værsiden (SF Pro / Roboto). Stor, tynn temperatur.
   - **Kartknapp** nede til venstre → fullskjerm værkart (Windy-embed eller MET-radar) med lagene Nedbør · Temperatur · Vind · Skyer.
   - **☰ nede til høyre** → Steder: søk og legg til (Open-Meteo geocoding). Hold inne og dra for å endre rekkefølge, sveip mot høyre for å slette. Ingen ↑ eller −. Ingen stedspiller i bunnlinjen.
   - **Animert værbakgrunn** etter værkode og dag/natt: stjerner, sol med dempet glorie (maks ca. 60 % lysstyrke, skaleres etter korteste side), drivende skyer, regnstriper, snø, tåke, lyn. Stopp ved «Reduser bevegelse», maks 30 fps.
   - **Yr og Pent** sammenlignes direkte på siden: kort med enighet og 4 dager side om side, og Pent-temperatur i oransje under Yr i timeraden. Pent = StormGeo/ECMWF via Open-Meteo `models=ecmwf_ifs025`, merket som modell.
   - **Detaljark for alle kort** (UV, Føles som, Mot i går, Nedbør, Sikt, Luftfuktighet, Lufttrykk, Vind, Sol, Måne): samme oppsett som «Forhold», med × øverst til høyre, 7-dagers velger, stor verdi, graf for dagen, «Om …»-tekst, og skala for UV.
3. **Standardtema «Lys hovedbok»** for nye brukere og enheter → `claude-code-standard-tema.md`
4. **Huskeliste**
   - Feltet «Ny oppgave …» ligger fast over fanelinjen. FAB viser «+» og legger til oppgaven. Det skal ikke lenger stå et felt øverst.
   - Valgte chips for frist og person er fylte (`ink`-bakgrunn). «Alle» har ingen prikk.
   - **Synk med Home Assistant To-do** → `claude-code-huske-ha.md`
5. **Sporing:** riktige logoer og status som faktisk oppdateres → `claude-code-sporing-status.md` + `claude-code-pakke-logo.md` + `claude-code-logobibliotek.md` + `claude-code-logoer.md`
6. **Google-«G»** i søkefeltet: bruk den offisielle SVG-en (fire baner, 48×48) som egen asset. Ikke tegn den på nytt.

## Filer i pakken
- `prompt-22.md`: brukerens ønsker ordrett, med hva som er gjort i designet
- `claude-code-*.md`: én fil per oppgave
- `design/`: alle designfilene (DC-er) + `support.js`, som åpnes i nettleser

## Fra tidligere prompter (ta med hvis ikke gjort)
Prompt 21: avganger med holdeplasser, strek i Kvitteringer-kø, bakgrunnsbilder (ekte foto), redigering av Hjem-widgets (hold inne og dra). Prompt 20: helse på iOS og posisjonskort. Filene ligger i `prompt-21-pakke/` og `prompt-20-pakke/`.
