# Mal for din første ekte kvittering (prompt 51, Del E 14)

`tests/receipts/real/` er i `.gitignore` (bildene og fasitene dine kommer aldri i git). Denne mappa har bare malen.

1. Ta bilde av kvitteringen i full oppløsning (ikke skjermbilde, ikke nedskalert).
2. Kopier bildet og malen inn i `real/` med samme navn:
   ```sh
   cp ~/Downloads/IMG_1234.jpg tests/receipts/real/forste-kvittering.jpg
   cp tests/receipts/real-mal/forste-kvittering.json tests/receipts/real/forste-kvittering.json
   ```
3. Fyll inn fasiten fra papirkvitteringen: butikk, dato, total og **alle** varelinjer (pant og tips er egne linjer, rabatter
   står i `discounts` med negativt beløp). Ta med org.nr. – evalen viser da om butikknavnet kom fra org.nr.-oppslaget.
   Evalen godtar butikknavnet når svaret inneholder `merchant` eller et av `merchant_aliases`.
4. Kjør evalen bare på dine egne kvitteringer:
   ```sh
   make eval-receipts ARGS="--only ekte"
   npm run eval:receipts -- --only ekte --routes T,kjede     # bare Tesseract-veien og hele kjeden
   ```
5. Sjekk at bildet ikke er med i git: `git check-ignore -v tests/receipts/real/forste-kvittering.jpg`.

Ser du feil butikknavn eller feil varer: åpne kvitteringen i FinansHub og fold ut «Rådata». Er radene feil, ligger feilen i
OCR (bildet/forbehandlingen); er radene riktige, ligger den i modellen.
