# Fiks: fargefeil på «Kontoer og brukere» (Papir-tema, mobil)

Gjelder: Innstillinger → Profil, brukere og kontoer (skjermbilde IMG_1369 / 13.16.28).

## Feil
Lyst Papir-tema bruker farger fra det **mørke** temaet:
1. **«Legg til konto»** – hvit tekst + ikon på lys rosa (#f5e1df-ish). Nesten usynlig.
2. **«Fjern bildet»** – lys laks (#f08a76 = mørk-tema-aksent) på hvit. For lav kontrast.
3. **«PROFILBILDE»**-etiketten ligger oppå heltebildet (rød på mørkt bilde) og kolliderer med kanten.
4. Bildekreditt («NASA/Apollo 17 crew …») overlapper undertittelen «Profil, brukere og kontoer».

## Regel
Les alltid farger fra aktivt tema-palett (`PAL[mode]` + valgt aksent fra `ACC`), aldri hardkodet. I lyst tema:
- aksent / `lab`: `#b23a2a` (eller valgt aksent sin lyse-variant, kolonne 4 i `ACC`)
- tekst `ink`: `#1b1a17`, dempet `mut`: `#7a7468`, kort `card`: `#fff`, bakgrunn `bg`: `#f3efe6`
- `onLab`: `#fff`
Mørk-aksenten (`#f08a76`, kolonne 5 i `ACC`) brukes **kun** når `mode==='dark'`.

## Endringer
1. **Legg til konto** (primærknapp): `background: lab (#b23a2a)`, `color: onLab (#fff)`, ikon `currentColor`. Pressed: `filter: brightness(.92)`. Deaktivert-tilstand (om brukt): `background: line (#d8d1c2)`, `color: mut` – aldri hvit på lys.
2. **Fjern bildet** (destruktiv tekstknapp): `color: lab (#b23a2a)`, `font-weight: 700`. Ingen opacity.
3. **Logg ut**: beholdes `#b23a2a` (er riktig i dag).
4. **Seksjonsetiketter** (PROFILBILDE, KONTOER): `color: lab`, plasseres i innholdet **under** heltebildet med `margin-top: 24px` – aldri inne i hero.
5. **Hero**: bildekreditt flyttes til nederste høyre hjørne av hero, `font-size: 10px`, `color: rgba(255,255,255,.7)`, `text-shadow: 0 1px 2px rgba(0,0,0,.6)`, én linje med ellipsis, `max-width: 60%`. Undertittel + tittel får `text-shadow: 0 1px 8px rgba(0,0,0,.45)` og egen linje over tittelen uten overlapp.
6. Søk gjennom alle innstillingssider etter hardkodet `#f08a76`, `#FFB08A`, `#FFB68A` og `color:#fff` på lyse bakgrunner, og bytt til palett-tokens.

## Test
- Lyst tema: alle knapper ≥ 4.5:1 kontrast (hvit på #b23a2a ≈ 5.9:1, #b23a2a på #fff ≈ 5.9:1).
- Mørkt tema: uendret (laks-aksent på mørk bakgrunn).
- Bytt aksent (Fjord/Skog …): knapper følger valgt aksent.
