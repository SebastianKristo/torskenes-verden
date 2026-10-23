# QR-innlogging i onboarding: Finans og Kalender

## Mål
Alle steder man logger inn i Finans (iOS, Android) og Kalender (iOS, Android, Mac) skal man kunne logge inn med QR-kode. En allerede innlogget Finans-app på mobil skal kunne scanne QR-koden som Kalender viser på Mac, Android og iOS, og logge den inn.

## To roller
- **Vis QR (enheten som skal logges inn):** Kalender på Mac/iOS/Android, Finans på iOS/Android (når den ikke er innlogget).
- **Scan QR (enhet som allerede er innlogget):** Finans på mobil (iOS/Android). Kalender på mobil kan også scanne, hvis den er innlogget.

## Flyt
1. Onboarding/innloggingsskjerm får valget **«Logg inn med QR-kode»** ved siden av vanlig innlogging (e-post/passord, server-URL).
2. Enheten ber serveren om en innloggingsøkt: `POST /auth/qr/session` → `{ sessionId, code, expiresAt }`. QR-innhold: `papir://login?s=<sessionId>&c=<engangskode>&srv=<offentlig server-URL>` (bruk offentlig URL, aldri intern Docker-IP).
3. QR vises stort, med nedtelling (2 min) og automatisk ny kode ved utløp. Under QR: «Scan med Papir Finans på mobilen» + lenke til vanlig innlogging.
4. Scanner-appen: i **Finans → Innstillinger → Logg inn på annen enhet** (og en snarvei i Mer-menyen) åpnes kamera. Kameraet tolker `papir://login`.
5. Scanner viser bekreftelse: enhetsnavn, plattform, app (Kalender/Finans), omtrentlig sted/IP, og knappene «Logg inn» / «Avbryt». Krev Face ID/Touch ID/biometri før godkjenning.
6. Scanner kaller `POST /auth/qr/approve { sessionId, code }` med sitt token. Serveren utsteder et eget token for den nye enheten (egen enhetsøkt, ikke kopi av scannerens token).
7. Enheten som viser QR poller `GET /auth/qr/session/:id` (eller bruker WebSocket/SSE) og fullfører innloggingen når den er godkjent, og fortsetter så resten av onboardingen.

## Sikkerhet
- Engangskode, utløper etter 2 min, kan brukes én gang.
- Godkjenning krever biometri/PIN på scanneren.
- Ny enhet vises under **Innstillinger → Enheter** med mulighet for å logge den ut.
- Rate-limit på oppretting og polling av økter.

## Plattformdetaljer
- iOS: AVFoundation/VisionKit DataScanner. Android: CameraX + ML Kit barcode. Be om kameratillatelse med norsk forklaring.
- Mac Kalender: viser kun QR (ingen scanning).
- Registrer `papir://` universal link / app link, slik at scanning med systemkameraet også åpner Finans og godkjenningsskjermen.
- Fold/iPad: QR sentrert, maks 320 pt.

## Test
- Mac Kalender ← Finans iOS, Android Kalender ← Finans Android, iOS Kalender ← Finans Android, Finans iOS ← Finans Android.
- Utløpt kode, kode brukt to ganger, avbryt på scanneren, ingen nett.
