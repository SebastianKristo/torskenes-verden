# Mer: når seksjonstittelen er fjernet, fjern også mellomrommet

Skjermbilder: `uploads/Screenshot 2026-10-23 at 11.53.34.png`, `uploads/Screenshot 2026-10-23 at 11.53.45.png`. Fasit: `Mer Ny.dc.html`. Følger opp `claude-code-mer-tittel-og-store-bokser.md`.

## Feil
Når tittelen «Hverdag og familie» slettes, forsvinner bare teksten. Raden den sto i (høyde + `gap` + `margin`) blir stående, så det blir et tomt felt på ca. 60 px mellom søkefeltet og de store kortene.

## Rett
- Er tittelen tom/skjult og man **ikke** er i wiggle-redigering: **ikke render tittelraden i det hele tatt** (`display:none` eller fjern elementet). Da forsvinner også `gap` og marg. Ikke bare tøm teksten.
- Kortene starter da samme avstand under søkefeltet som søkefeltet har til tittelen ellers (16 px).
- I wiggle-redigering vises raden igjen, med «+ Legg til tittel» og Store/Lave-bryteren, så tittelen kan legges tilbake.
- Gjelder også Finans → Mer (`mode="finans"`) og alle seksjonstitler (Verktøy osv.).
- Telefon, Fold, iPad og web.
