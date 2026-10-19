# Kalender, Måned: bakgrunn på alle hendelser

Fasit: `Kalender.dc.html` → `mo.cells[].chips`.

- Før: tidsbestemte hendelser (f.eks. «14:45 Nina Frisør») var bare farget tekst uten bakgrunn, mens prøver og frister var fylte brikker.
- Nå får **alle** hendelser en brikke (samme form: radius 6, 2 px × 6 px innrykk, én linje med «…»):
  - Prøver, frister og heldagshendelser: fylt med kalenderfargen, hvit tekst (som før).
  - Andre (avtaler, timer): bakgrunn `color-mix(in oklab, {farge} 18%, var(--card))`, tekst `color-mix(in oklab, {farge} 78%, var(--ink))`, så den er lesbar i både lys og mørk modus.
  - Samlebrikken «N timer» er uendret.
- Samme regel på web og mobil. I Dag/3 dager/Uke bruker hendelsesboksene allerede 22 % farge (se `claude-code-kalender-fargekontrast.md`).
