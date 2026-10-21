# Kalender (mobil): åpne og redigere en avtale

Ønske 2026-10-21: «la meg åpne avtale Kalender kunne redigere avtale event»
Fasit: `Kalender App.dc.html` (detaljarket `hasDet`, `editDet`, `saveNew` med `editId`).

## Åpne
- **Måned:** trykk på en hendelse-chip i en dag → detaljarket åpnes (stopper klikket så dagen ikke åpner uke). Trykk utenfor chipene → uke som før. Hold inne → ny hendelse.
- Uke / 3 dager / dag / liste: trykk på hendelsen → detaljarket (som før).
- Trykk rett etter et sveip ignoreres.

## Redigere
- Detaljarket har **Rediger** ved siden av «Ferdig» (ikke for helligdager og abonnementstrekk, de er skrivebeskyttet).
- Rediger åpner samme ark som «Ny hendelse», men med tittel **Rediger** og knapp **Lagre**, utfylt med tittel, sted, dato, start/slutt, hele dagen, kalender og varsel.
- Lagre: oppdaterer hendelsen, går tilbake til detaljarket, toast «Lagret «…»» med **Angre**.
- Egne hendelser endres direkte. Synkede hendelser (iCloud/Google/Studie) lagres som endring og sendes tilbake til kilden: CalDAV `PUT` med `If-Match: etag` · Google `events.patch`. Ved konflikt (412): «Endret et annet sted. Behold din eller deres?».
- Gjentakende: spør «Bare denne» / «Denne og fremtidige» / «Alle».
- Native: samme ark (`.sheet` / `ModalBottomSheet`) med `EventEditor(mode: .edit(event))`.
