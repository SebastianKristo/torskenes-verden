# Kvitteringer i appene og på web (prompt 51)

Kort veiledning for det som er nytt i kvitteringsskjemaet i FinansHub på web/PWA, iPhone og Android.

## Hva det gjør
- **Kilden til butikknavnet** vises som en merkelapp ved butikkfeltet:
  - «fra org.nr.» – navnet er slått opp på organisasjonsnummeret på kvitteringen (lokal kopi av Enhetsregisteret, eller et navn du har lært Glimt).
  - «kjent butikk» – Glimt kjenner butikken fra tidligere kvitteringer.
  - «modellens forslag» – modellen gjettet navnet. Sjekk det.
  - «rettet av deg» – du har skrevet navnet selv.
- **Rådata** (sammenleggbar, lukket som standard): hvilken OCR-motor som leste kvitteringen (Mac Vision, Tesseract, iPhone, Android), bildestørrelsen den leste, tid, forbehandling (rotert, perspektiv rettet …) og alle radene i fast bredde. Står teksten riktig i Rådata, men feltene er feil, ligger feilen i modellen. Mangler teksten eller er den feil, ligger feilen i OCR-en.
- **Glimt lærer butikknavn**: Retter du butikknavnet, husker serveren koblingen org.nr. → navn. Neste kvittering fra samme butikk får navnet ditt automatisk («fra org.nr.»).
- **Full oppløsning**: Bildet sendes i full oppløsning til serveren (OCR-en trenger minst ca. 2000 px). Er «Lagre originalbildet» av, sendes et bilde på høyst 2560 px (web og iPhone) eller ca. 2000 px (Android) i stedet for 1600 px som før.

## Hva du må gjøre
- Ingenting. Åpne en kvittering under Til godkjenning (eller skjemaet etter skanning) og trykk «Rådata» for å se OCR-radene.
- Rett butikknavnet når det er feil – det er slik Glimt lærer. Ser org.nr. feil ut i skjemaet, rett det også før du lagrer.
- Eldre kvitteringer har ingen lagrede OCR-rader; da vises ikke Rådata.

## For utviklere
- Feltene: `merchant_source`, `merchant_label`, `ocr_raw` på kvitteringen; læring med `POST /finans/api/receipts/:id/merchant {merchant, org_number?}` (eldre server: `PATCH merchant`).
- Web: `public/finans/js/rcpt51.js` + `public/css/receipts51.css` (brukes i `desktop.js` og `mobile-p23.js`).
- iPhone: `apps/ios/FinansHub/Sources/Receipt51Raw.swift`. Android: `Receipt51.kt` og `ui/Receipt51Ui.kt`.
