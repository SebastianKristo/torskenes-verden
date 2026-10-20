# Hjem → pakkekortet: PostNord-logoen vises ikke (bare blå boks med teksten «PostNord»)

Ønske 2026-10-20: «fortsatt feil, viser ikke PostNord-logoen» (vedlegg `uploads/Screenshot 2026-10-20 at 21.57.57.png`, `…21.58.08.png`: «REGISTRERT · Pakke fra PostNord» med en blå firkant der det står «PostNord» i liten blå tekst).
Forrige forsøk: `prompts/claude-code-pakke-logo.md`. Den blå boksen er **tekst-reserven**, altså fant appen ingen logo.

## Sannsynlige årsaker (sjekk alle)
1. **Navnematch:** fraktselskapet kommer inn som `POSTNORD`, `PostNord AB`, `PostNord Norge`, `Postnord` eller `postnord_no` fra ParcelsApp/e-post. Oppslaget er case-sensitivt eller krever eksakt `PostNord` og faller til reserven.
2. **Logoen ligger ikke i det interne biblioteket.** Appen prøver favicon fra `postnord.com`, som gir 404, omdirigerer eller blokkeres (ATS/CORS), og ingen feil logges.
3. **Reserven tegnes før bildet laster** og byttes aldri ut (state settes ikke når `onLoad` kommer, eller `AsyncImage` bruker reserven ved første `failure` uten nytt forsøk).

## Fiks
- **Normaliser fraktselskap** én gang ved lagring: `carrier_id = slug(lowercase, fjern « ab|as|norge|norway|sverige|_no|_se»)` → `postnord`. Bruk `carrier_id`, ikke visningsnavnet, til oppslag.
- **Legg PostNord-logoen i det interne logobiblioteket** (`backend/logos/files/postnord.svg`) og pakk den med appen (iOS Asset Catalog `carrier-postnord`, Android `res/drawable/carrier_postnord.xml`). Ingen nettoppslag for fraktselskaper. Gjør det samme for Posten, Bring, DHL, Helthjem, Instabox, Budbee, UPS, FedEx, GLS, DB Schenker og Porterbuddy.
  - PostNord-merket: blått `#00A0D6`, hvitt ordmerke. Hent offisiell SVG fra PostNords presserom / brand-portal (logo-pakke).
- **Vis logoen** på hvit flis 52 × 52, radius 14, `contentMode: .fit`, 12 % padding (PostNord er bred, så la den fylle bredden). Ikke legg den på blå bakgrunn med tekst.
- **Reserven** brukes bare når `carrier_id` er ukjent: farget flis med 1–3 bokstaver (`PN`), aldri hele navnet i 9 pt.
- **Logg** i AI Kontroll / debug: `logo_miss carrier="POSTNORD" normalized="postnord" source=parcelsapp`, så nye varianter fanges.

## Test
- `PostNord`, `POSTNORD`, `PostNord AB`, `postnord_no` → PostNord-logo.
- Flymodus → logoen vises fortsatt (pakket med appen).
- Komplett via PostNord → Komplett-logo + liten PostNord-merkelapp.
- Ukjent «Fraktfirma X» → «FX»-flis.
