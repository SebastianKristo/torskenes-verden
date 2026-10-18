# Lokal OCR-reserve (Tesseract)

Når AI-kallet for kvitteringer feiler (nedetid, nettverk, kvote, timeout), leses bildet lokalt i containeren med OpenCV + Tesseract (norsk). Ingenting sendes ut av huset.

## Filer
- `Dockerfile` – installerer `tesseract-ocr`, `tesseract-ocr-nor`, `tesseract-ocr-eng` og OpenCV-avhengigheter.
- `requirements.txt` – `pytesseract`, `opencv-python-headless`, `numpy`, `Pillow`.
- `ocr_fallback.py` – `klassisk_ocr_fallback(image_path)`.
- `main_integration.py` – try/except rundt AI-kallet.

## Hva funksjonen gjør
1. Skalerer opp små bilder, gjør om til gråtoner, fjerner støy og retter opp skjevhet.
2. Adaptiv terskel (binarisering) for maks kontrast. Tåler skygger og bleknet termopapir bedre enn én global terskel.
3. Tesseract med `lang="nor+eng"`, `--psm 4` (kolonnetekst).
4. Regex:
   - **Org.nr:** 9 siffer etter «Org.nr», «Foretaksregisteret» eller «NO … MVA», validert med MOD11.
   - **Totalbeløp:** prioritert «Å betale» › «Til betaling» › «Betalt» › «Total» › «Sum». Uten nøkkelord brukes største beløp med lav sikkerhet.
   - **Dato, MVA, butikk** (første tekstlinje).
5. Returnerer samme form som AI-svaret, med `provider: "tesseract"` og `needs_review: true`.

## Slå av og på
- Miljøvariabel: `OCR_FALLBACK=on|off` (standard `on`).
- I appen: **Innstillinger → AI og tolkning → Lokal OCR-reserve**. Valget lagres i brukerinnstillingene og overstyrer miljøvariabelen.
- Valgfritt: **Bruk ved lav AI-sikkerhet** sammenligner AI-svaret med lokal OCR når sikkerheten er under `AI_MIN_CONFIDENCE`.

## Test lokalt
```bash
docker build -t finanshub .
docker run --rm --network none -v $PWD/test.jpg:/app/test.jpg finanshub \
  python -c "from ocr_fallback import klassisk_ocr_fallback as f; import json; print(json.dumps(f('test.jpg'), ensure_ascii=False, indent=2))"
```
`--network none` beviser at den virker uten internett.

Image-størrelsen øker med rundt 60–80 MB.
