# Ruter: innstillingene i «Min reise» vises bare i wiggle-redigering

Ønske 2026-10-23: «de innstlingen får heller ligge på krottet når jeg rediger i wiggle mode i ruter.»
Skjermbilder: `uploads/Screenshot 2026-10-23 at 11.56.28.png`, `uploads/Screenshot 2026-10-23 at 11.56.38.png`.
Gjelder Ruter → «Min reise»-kortet (`claude-code-ruter-forhandsruter-sebastian.md`, `claude-code-ruter-anbefalt-antall.md`).

## Normal visning (ikke redigering)
Kortet viser bare reisen: «MIN REISE · SEBASTIAN», «Amagerveien → Skole», **Snu**, og de anbefalte avgangene med etappe-stripen. Disse tre seksjonene **skjules**:
- SKOLESONER · ALLE TELLER SOM SKOLE (chips + «+ Sone» + posisjonstekst)
- ANTALL ANBEFALTE REISER (1 · 2 · 3)
- PÅ HJEM NÅR DU FORLATER SKOLEN (Over Ruter-kortet · I stedet · Av)

## I wiggle-redigering (hold inne i Ruter)
- Kortet vippes som de andre, og innstillingene vises **inne i kortet**, under avgangene, skilt med en tynn linje og etiketten «INNSTILLINGER FOR KORTET».
- Samme kontroller og stil som i dag. Endringer lagres med en gang.
- «Ferdig» lukker redigeringen og skjuler innstillingene igjen.
- Overgang: høyden animeres (grid-rows 0fr → 1fr, 0,3 s), så kortet ikke hopper.

## Ellers
- Varselet om posisjon «Alltid» vises fortsatt i normal visning **hvis** posisjon mangler (som en liten linje under avgangene med «Slå på ›»), siden skolesonene ikke virker uten den.
- Samme oppførsel på telefon, Fold, iPad og web (web: «Rediger» øverst til høyre i stedet for å holde inne).
- Speil valgene i Innstillinger → Ruter (se `claude-code-innstillinger-samlet.md`).
