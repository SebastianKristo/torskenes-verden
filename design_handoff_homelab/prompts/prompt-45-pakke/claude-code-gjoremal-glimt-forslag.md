# Gjøremål · Glimt-forslag: ingen pakkeliste for bursdager

Ønske 2026-10-20: «i gjøremål foreslår glimt at jeg skal lage pakkeliste for en person har bursdag, slike forslag er ikke nødvendig»

Fasit: `Huskeliste.dc.html` → `tips` (linjen med «Lag pakkeliste»). I designet kommer forslaget bare fra en **flerdags reise** («Hytta · Hafjell om 12 dager»).

## Regler for kalender-baserte forslag i Gjøremål
- **Pakkeliste foreslås bare når alle disse gjelder:**
  - hendelsen varer minst 2 dager (`days ≥ 2`) **eller** har reise-ord: hytte, tur, reise, ferie, fly, tog, hotell, camping, leir
  - stedet er et annet enn hjemme (ikke Oslo-adressen / hjemmesonen)
  - hendelsen starter om 1–14 dager
  - det finnes ingen pakkeliste for den hendelsen fra før
- **Aldri pakkeliste for:**
  - bursdager (`cal === 'b'` / `kind === 'bursdag'`)
  - jubileer og merkedager
  - timer (lege, frisør, tannlege)
  - skole/forelesning, prøver, frister
  - møter, middager og abonnementer
- **Bursdager i Gjøremål:** ingen forslag. Gavepåminnelser hører hjemme i Bursdager-modulen og briefen («+ Gave i Gjøremål»), og bare når brukeren trykker selv.
- **Maks ett** kalender-forslag om gangen, og ikke det samme to ganger. «Ikke nå» skjuler forslaget for den hendelsen for godt (`huske_tip_dismiss[eventId] = true`).
- **Ny knapp** på forslagskortet: «Ikke foreslå slike» → slår av den forslagstypen (`huske_tip_off.pack = true`). Kan slås på igjen i Gjøremål → Innstillinger → «Forslag fra Glimt» (pakkelister, like gjøremål, forfalte, stedspåminnelse, hver for seg).

## Hvis LLM lager forslaget
Systemprompten skal få hendelsestypen (`kind`, `cal`, `days`, `loc`) og reglene over. Et forslag godtas bare hvis det består regelsjekken i koden. Modellen alene avgjør ikke.

## Test
- Bursdag i morgen («Sebastian 12 år») → ingen forslag i Gjøremål.
- «Hytta · Hafjell» 3 dager om 12 dager → ett forslag «Lag pakkeliste».
- «Ikke foreslå slike» → ingen pakkeliste-forslag igjen før det slås på.
