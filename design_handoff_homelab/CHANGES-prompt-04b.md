# Prompt 04 – del 2

## Nye filer
- `FinansHub OS.dc.html` (desktop): 7 Subscription OS, 8 Home OS, Delte mapper, Finn-handler, Domener (Cloudflare), Matplan, Import (CSV/XLSX/tekst).
- `FinansHub Mobil v2.dc.html` (iOS + Android): utgiftsdetalj med AI-beskrivelse og varelinjer, opplastingskø i bakgrunnen, Matplan-fane, meny bak profilbildet (Finans/Matplan + andre OS), av/på for fargebakgrunn på iOS (`localStorage fh_ios_bg`), logoer.

## Logoer
Butikknavn → domene via AI/regelliste (f.eks. «Bilema/Biltema» → biltema.no), deretter `https://www.google.com/s2/favicons?domain=<domene>&sz=64`. Cache logoen server-side (`/finans/api/logo/:domene`). Ukjente navn: be Gemini/Ollama returnere mest sannsynlige domene, lagre mappingen i Regler.

## Bakgrunnsopplasting
`POST /finans/api/receipts` tar flere filer (multipart), svarer straks med jobb-ID-er. Worker-kø (BullMQ/Redis eller SQLite-kø) kjører Gemini én og én. Klient poller `GET /finans/api/receipts/jobs` eller lytter på SSE. Push-varsel når ferdig. iOS: `URLSession` background upload. Android: WorkManager.

## XLSX-import
SheetJS (`xlsx`) i nettleser eller server. Kolonner: Dato, Forklaring, Rentedato, Ut, Inn (DNB-format, `MM/DD/YY`, tusenskille komma). Beskrivelse renses (fjerner «Visa 100021», «Varekjøp», valutakurs) før kategorisering.

## Delte mapper
Tabeller `folders(id,name,owner)`, `folder_members(folder_id,user_id,role)`, `folder_tx(folder_id,tx_id,paid_by,split)`. Invitasjon per e-post, saldo = betalt − andel.

## Finn-handler
Kilde: e-postkvitteringer fra Finn (Trygg betaling, Fiks ferdig, Tillit forsikring) via IMAP. AI trekker ut gjenstand, motpart, beløp og status, matches mot bankpost.

## Cloudflare
Token med Zone:Read, DNS:Read, Registrar:Read i Innstillinger. `GET /client/v4/zones?name=arildkrist.com`, `/zones/:id/dns_records`, `/accounts/:id/registrar/domains`. Cache 15 min.

## Android: innlogging feiler i appen, men ikke i nettleser
Vanlige årsaker, sjekk i denne rekkefølgen:
1. **Cleartext HTTP blokkert** (Android 9+). Legg til `res/xml/network_security_config.xml` som tillater cleartext for 192.168.0.0/16 / `*.local`, og `android:networkSecurityConfig` i manifestet. Capacitor: `server.cleartext: true` og `android.allowMixedContent: true`.
2. **HTTP Basic Auth i WebView** gir ingen popup. Håndter `onReceivedHttpAuthRequest`, eller (bedre) bytt til innlogging via `POST /finans/api/login` som returnerer token. Mobil v2 har eget Server-felt i menyen for dette.
3. **Cookies**: aktiver `CookieManager.setAcceptThirdPartyCookies` og bruk `SameSite=Lax`, ikke `Secure` på http.
4. **Selvsignert sertifikat** på https: legg CA inn i network_security_config.
5. **Autofill/tastatur**: `inputmode="url"` og `autocapitalize="off"` på adressefeltet (stor forbokstav ødelegger URL-en).

## iOS IPA for sideloading
Krever Mac med Xcode. Jeg kan ikke bygge eller signere filen.
1. `npm i @capacitor/core @capacitor/ios && npx cap add ios`
2. `capacitor.config.ts`: `appId: 'no.arildkrist.finanshub'`, `server.url` = FinansHub-adressen, `ios.contentInset: 'always'`.
3. Info.plist: `NSAppTransportSecurity → NSAllowsLocalNetworking = YES`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocalNetworkUsageDescription`.
4. `npx cap open ios` → Signing: personlig Apple-ID (gratis = 7 dager) → Product → Archive → Distribute → Custom → Development → eksporter .ipa.
5. Installer med AltStore/SideStore (fornyer signaturen automatisk) eller Sideloadly.
