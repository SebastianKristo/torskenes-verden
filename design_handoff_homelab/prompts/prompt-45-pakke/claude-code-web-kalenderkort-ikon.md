# Web · Hjem: ikonet i Kalender-kortet er feiltegnet

Skjermbilder: `uploads/pasted-1792741454596-0.png` (hele kortet) og `uploads/pasted-1792741468914-0.png` (ikonet).
Fasit for stil: `claude-code-hjem-web-widgets-2c.md` + `Hjem Web Varianter.dc.html` → 2c (Kalender · neste time, helfarge `#2F7A4F`).

## Feil
1. **Ikonruta** bak klokka er en skjev «klatt» i stedet for en avrundet firkant.
2. «NESTE PRØVE» er kuttet i venstre kant («VESTE PRØVE»).
3. «10 dager»-pillen er kuttet skrått i høyre kant.

Alle tre tyder på at kortet (eller en forelder) har en `clip-path`, `mask`/`-webkit-mask` eller en SVG-squircle-maske som også treffer barna, eventuelt `transform: skew/rotate` (f.eks. etter wiggle eller hover-tilt) som ikke nullstilles. Fjern dette fra innholdet i kortet. Kortets runde hjørner skal bare komme fra `border-radius: 20px` + `overflow: hidden` på selve kortet.

## Riktig ikonrute
- 28 × 28 px, `border-radius: 9px`, bakgrunn `rgba(255,255,255,.18)`, hvit klokke-ikon 16 px (`stroke-width 2.2`), sentrert med `display:grid; place-items:center`.
- Ingen `clip-path`, `mask` eller `transform` på ruta.
- Til høyre: «KALENDER · NÅ» i IBM Plex Mono 10,5 px, `letter-spacing .12em`, hvit. Dato/«I dag · Fredag 23. okt ›» høyrejustert på samme linje, `rgba(255,255,255,.72)`.

## Bunnlinjen (neste prøve)
- Rad med `display:flex; align-items:center; gap:8px; padding-top:10px; border-top:1px solid rgba(255,255,255,.18)`, innenfor kortets padding (18 × 20). Ingen negativ marg.
- «NESTE PRØVE» (Plex Mono 10 px, `rgba(255,255,255,.72)`) · «Oblig 45» (fet, ellipsis) · pille «10 dager» (`rgba(255,255,255,.18)`, radius 999, padding 3 × 10, `flex:none`).

## Sjekk
Samme sjekk for alle helfargede kort på Hjem (I dag på skolen, Vær, Penger, Spilles nå): ingen ikonruter eller piller som er kuttet eller forvrengt, i Chrome, Safari og Firefox, og etter wiggle-redigering.
