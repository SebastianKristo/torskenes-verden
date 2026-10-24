# Dine egne kvitteringer (ikke i git)

Alt i denne mappa unntatt denne fila er i `.gitignore`. Legg inn bilder av ekte kvitteringer her, med en fasit ved siden av:

```
tests/receipts/real/
  rema-2026-10-20.jpg          bildet (jpg, png, heic eller webp)
  rema-2026-10-20.json         fasit (påkrevd)
  rema-2026-10-20.device_ocr.json   valgfritt: lagret OCR fra telefonen (felles OCR-format) → vei B
```

Fasit, kort form (det evalen sjekker):

```json
{ "merchant": "REMA 1000", "date": "2026-10-20", "total": 412.30, "items_count": 14 }
```

- `merchant`: godtas når svaret inneholder navnet (store/små bokstaver, æøå og tegnsetting spiller ingen rolle).
  Har butikken flere navn, legg til `"merchant_aliases": ["REMA 1000 Torshov"]`.
- `items_count`: antall varelinjer slik evalen teller dem: pant og tips er egne varelinjer, rabatter er ikke varelinjer.
- `today` (valgfri, `"YYYY-MM-DD"`): dagen evalen later som det er. Uten den brukes dagens dato, og kvitteringer eldre enn
  2 år feiler datokontrollen (som i appen).

Sjekk at bildet ikke blir med i git: `git check-ignore -v tests/receipts/real/rema-2026-10-20.jpg`.
Resultatene (`tests/receipts/results/`) inneholder det modellen leste fra kvitteringene dine og er også i `.gitignore`.
