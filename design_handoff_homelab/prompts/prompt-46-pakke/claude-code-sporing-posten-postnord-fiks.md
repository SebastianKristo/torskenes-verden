# Sporing: få Posten/Bring og PostNord til å virke (bygget på åpne HA-integrasjoner)

Ønske: «posten og postnord funker fortsatt ikke … den er for homeassistant men du bør kunne kopiere og få det til å funke.»
Kilder (MIT-lisens, les koden selv før du porter):
- https://github.com/jumpingmushroom/nordic-parcel (Bring API v2 med Mybring-nøkkel, PostNord med egen API-nøkkel, Helthjem OAuth2)
- https://ha-parcel-integrations.github.io/ → `ha-parcel-integrations/ha-posten-bring` og `ha-parcel-integrations/ha-postnord` (nyere, mer info, **krever ingen utviklernøkkel**)
- Felles kontrakt: https://ha-parcel-integrations.github.io/contract/

**Anbefaling:** port logikken fra `ha-posten-bring` og `ha-postnord` til vår egen backend (Node/Python-tjeneste i homelab). Ikke kjør det via Home Assistant. Behold nordic-parcel bare som reserve når brukeren har egne Mybring-/PostNord-nøkler.

## 0. Finn rotårsaken først
Logg HTTP-status og body (uten tokens) for et ekte sporingsnummer fra hver transportør. Typiske feil i dag:
- PostNord: gammelt endepunkt `findByIdentifier.json` uten gyldig `apikey` gir 401/403. Uten nøkkel må `recipientview` + `X-Bap-Key` brukes (se under).
- Bring: `api.bring.com/tracking/api/v2` krever `X-Mybring-API-Uid` + `X-Mybring-API-Key` + `X-Bring-Client-URL`. Mangler én av dem, blir svaret 401.
- Kall direkte fra app/nettleser blokkeres av CORS. Alt skal gå via vår server-proxy.

## 1. PostNord, sporing med nummer (uten konto, uten nøkkel)
- `GET https://api2.postnord.com/rest/shipment/v5/trackandtrace/recipientview?id={kode}&locale=en`
- Header `X-Bap-Key: web-ncp` (fast offentlig web-nøkkel; annen verdi gir 403).
- Parse med `content_type=None`, siden den kan komme som text/plain.
- Svar: `TrackingInformationResponse.shipments[0]`. **Tom liste = ukjent eller ikke skannet ennå (ikke feil)**: vis «Venter på første skanning».
- Status-enum → vår status: CREATED/INFORMED→registrert, EN_ROUTE→underveis, AVAILABLE_FOR_DELIVERY→klar på hentested, DELIVERY→ute for levering, DELIVERED→levert, DELIVERY_IMPOSSIBLE/EXPECTED_DELAY/STOPPED/DELAYED→problem, RETURNED/DELIVERY_REFUSED→returneres, OTHER→ukjent.
- Event-kode **113** under EN_ROUTE = «ute for levering». Kodene **45 / z2F** = forlenget liggetid på hentested (fortsatt klar for henting).
- Lenke: `https://tracking.postnord.com/no/tracking?id={kode}`.

## 2. PostNord, konto (finner pakkene automatisk)
- OAuth2 PKCE, offentlig klient: authorize `https://account.postnord.com/auth`, token `https://account.postnord.com/oauth2/token`, `client_id=receiverappprod3gvTgY5ATtYWZZy`, `redirect_uri=com.postnord.app://redirect`, scopes som i `const.py` (openid, offline_access, …/receiverapp-bff/track, …/trackedshipments/track osv.).
- Redirecten kan ikke åpne appen vår. Brukeren limer inn den endelige `com.postnord.app://redirect?code=…&state=…`-URLen (vis en kort guide), eller vi fanger den i en innebygd WebView (iOS `ASWebAuthenticationSession` med `callbackURLScheme: "com.postnord.app"`, Android Custom Tab + intent-filter).
- Pakker: `GET https://api2.postnord.com/rest/customer/v2/receiverapp/tracking?summary=false&apikey=1ecf161be47543b19fce03f953a6e8d2`, headere `Authorization: Bearer …`, `context: mobileapp`. Svaret har `activeShipments` og `archivedShipments`.
- Ved 401/403: refresh én gang. Avvises det fortsatt etter refresh, er app-nøkkelen byttet (kompatibilitetsfeil). Da skal brukeren **ikke** bes logge inn på nytt.
- Lagre roterte refresh-tokens med en gang.

## 3. Posten / Bring, konto (finner pakkene automatisk, uten Mybring-nøkkel)
- OAuth via Posten-ID. Merke `posten`: host `https://id.posten.no`, `redirect_uri=posten://login`. Merke `bring`: host `https://login.bring.com`, `redirect_uri=bring://login`. Bruk client_id/secret fra `ha-posten-bring/const.py` (`BRANDS`).
- Authorize: `{host}/api/oauth/authorizations/new?response_type=code&client_id=…&redirect_uri=…&state=…&lang=no&is_app=true&brand=posten`.
- Token: `POST {host}/api/oauth/accesstoken`, `Authorization: Basic base64(client_id:client_secret)`, form-body (`authorization_code` / `refresh_token`). **Ingen PKCE.** Refresh-token roteres hver gang og må lagres umiddelbart.
- Innboks: `POST https://api.posten.no/parcel-api/v1/parcel` med Bearer og JSON `{lastUpdated: nå−30d, exclude: [...]}`. Bla videre mens `remainingCount > 0`, maks 25 sider, og fjern duplikater på `parcelNumber`.
- Statuser er **små bokstaver**: notified→registrert, underway→underveis, collectable→klar på hentested, return_underway/return_collectable→returneres. `archived`/`archived_by_user` har ingen egen levert-status: sjekk siste event av typen `delivered`/`delivered_bag_on_door` (levert) eller `return`/`delivered_sender` (returnert). Ignorer `added_by_user`.
- Felter: `sender.name`, `recipient.name`, `weightInKg`, `dimensions.{length,width,height}InCm`, `delivery.deliveryTime.deliveryWindow.{start,end}` (bruk bare `deliveryTime.date` hvis vindu mangler), `pickupPoint.name`, `events[]` (`date`, `type`, `description`), `direction` (receive/send).
- Lenke: `https://sporing.posten.no/sporing/{kode}`.

## 4. Bring med Mybring-nøkkel (reserve, fra nordic-parcel)
- `GET https://api.bring.com/tracking/api/v2/tracking.json?q={kode}&lang=no` med `X-Mybring-API-Uid`, `X-Mybring-API-Key` og `X-Bring-Client-URL`. `consignmentSet[0].packageSet[]` → én pakke per `packageNumber`, med `eventSet[]` (nyeste først, `dateIso`, `status`, `city`, `country`).

## 5. Felles datamodell i appen (følg kontrakten)
`{carrier, barcode, sender, receiver, status ∈ registered|in_transit|out_for_delivery|at_pickup_point|delivered|returning|problem|unknown, raw_status, delivered, delivered_at, planned_from, planned_to, pickup, pickup_point, url, weight, dimensions{length,width,height,text}, history[{timestamp,status,raw_status}]}`
- Norsk visning: Registrert, Underveis, Ute for levering, Klar for henting (+ hentested), Levert, Returneres, Problem, Ukjent.
- Ukjent status: logg én advarsel med råverdien, så den kan kartlegges.

## 6. Polling
- Bare mens det finnes aktive pakker. Hver 15. min når en pakke er «ute for levering» eller har leveringsvindu innen 1 t, ellers hver 45. min. Stille mellom 00 og 06. Legg på en fast forskyvning per installasjon.
- Levert: behold i 7 dager, deretter til «Arkiv».

## 7. Innstillinger → Integrasjoner → Sporing
- Posten/Bring: «Logg inn med Posten» / «Logg inn med Bring» (konto). Valgfritt Mybring-nøkkel.
- PostNord: «Spor med nummer» (alltid på, ingen nøkkel) + «Logg inn med PostNord» (konto).
- Status per kilde: «Tilkoblet · 4 pakker · oppdatert 14:02» / «Må logge inn på nytt» / «PostNord har endret app-nøkkelen, oppdatering kreves».

## 8. Tester
Enhetstester med lagrede ekte svar (anonymiserte) for hver kilde: tom `shipments`, ute for levering via kode 113, klar for henting, levert via arkiv og events, `added_by_user` etter levering, retur, 401 med vellykket refresh, 401 etter refresh, roterende refresh-token, paginering med `remainingCount`. Til slutt: ekte sporingsnummer fra Posten og PostNord skal vise riktig status i Sporing på mobil og web.

## Rapport
Skriv rotårsaken (hva som feilet før), hvilke filer som er endret, testresultatene, og om innlogging via WebView fungerer eller om brukeren må lime inn URLen.
