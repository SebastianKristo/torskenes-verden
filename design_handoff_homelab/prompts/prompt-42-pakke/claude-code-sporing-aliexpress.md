# Sporing: støtte for AliExpress (fra e-postmappen «AliExpress»)

Referanse: https://github.com/yohaybn/HA_aliexpress_package_tracker_sensor (Home Assistant-sensor for AliExpress-pakker). Bruk den som mal for oppslag og statusmapping. Les repoet for gjeldende endepunkt og felt, og ikke kopier HA-spesifikk kode.
Fasit: `Sporing.dc.html` → ny transportør `aliexpress` («AliExpress · Cainiao», merke «AE», `#E62E04`) i `CAR`, og eksempelsendingen «AliExpress · USB-C-kabler».

## 1. Hent fra e-post (mappen «AliExpress»)
- Les **bare** mappen `AliExpress` i e-postkontoen (Proton Mail via Bridge-IMAP, samme oppsett som dagens e-postskanning). Mappenavn kan endres under Sporing → Kilder → E-post («Mappe for AliExpress: AliExpress»).
- IMAP: `SELECT "AliExpress"`, `SEARCH SINCE <siste kjøring − 1 d>`, og lagre `UID` som er behandlet (`track_mail_seen`), så ingenting leses to ganger. Kjør hvert 15. minutt og ved «Sjekk nå».
- Gjenkjenn e-postene (avsender `@aliexpress.com`, `@mail.aliexpress.com`, `transaction@notice.aliexpress.com`):
  - **Ordrebekreftelse:** ordrenummer, varenavn, bilde, pris, butikk.
  - **«Your order has shipped» / «Pakken din er sendt»:** sporingsnummer + ordrenummer.
  - **Leveringsoppdateringer:** status og eventuelt nytt nummer (lokalt nummer fra Posten/PostNord/Bring).
- Hent ut med regex fra både HTML og tekst:
  - ordrenummer `\b\d{15,19}\b` nær «Order»/«Ordre»
  - sporingsnummer `\b(LP\d{12,}|AEG?\d{10,}|CN[A-Z0-9]{10,}|[A-Z]{2}\d{9}(CN|NO|SE))\b` nær «Tracking»/«Sporing»
  - varenavn (første produktlinje)
- Finner ikke regex et nummer: send e-postteksten til Glimt (lokal Ollama) med et kort prompt for å hente `{order, tracking, items[]}`.
- Én sendelse per sporingsnummer. Flere varer i samme ordre slås sammen («AliExpress · USB-C-kabler + 2 til»). Samme ordre med flere pakker blir én sendelse per nummer, merket «Ordre 8195…4402 · pakke 1 av 2».

## 2. Spor sendingen
- **Transportør `aliexpress`** (Cainiao): nummerformater over. `LP…` er AliExpress/Cainiao, **ikke** Posten (flyttet fra Posten-regexen).
- Oppslag som i repoet (Cainiao/AliExpress sin offentlige sporing, uten innlogging). Kjør på serveren (CORS) med cache 30 min og maks 1 oppslag per nummer per 30 min.
- **Statusmapping** til våre 5 steg (Registrert · Hentet · I transport · Klar for henting · Levert):
  - «order placed / waiting for pickup / seller shipped» → Registrert
  - «accepted by carrier / departed warehouse» → Hentet
  - «export customs / in transit / arrived at destination country / import customs» → I transport (vis delsteg i hendelseslista)
  - «arrived at pickup point / ready for collection» → Klar for henting
  - «delivered» → Levert
- **Overlevering til norsk transportør:** når Cainiao-hendelsene viser et lokalt nummer (f.eks. `CV…NO` eller `00370…`), lagre det som `localNo` og spor videre hos Posten/PostNord/Bring. Hentested og «Klar for henting» kommer derfra. Begge numrene vises i detaljene.
- Fallback: ParcelsApp/17TRACK (som i dag) hvis Cainiao ikke svarer.

## 3. Visning
- Kort: logo AliExpress, navn fra ordren, kilde-merke «E-post · AliExpress», referanse «Funnet i e-postmappen AliExpress, 06.10 · ordre 8195…4402».
- ETA fra AliExpress-ordren («Ventet 22.–29.10») til lokal transportør gir bedre dato.
- Detaljer: lenke **Åpne ordren i AliExpress** (`https://www.aliexpress.com/p/order/detail.html?orderId=…`) og **Se hos Cainiao**.
- Kilder-raden: «✦ E-post · N funnet i Proton Mail (inkl. AliExpress-mappen)».

## 4. Varsler
Som andre sendinger: «Klar for henting» og «Levert». I tillegg (av som standard): «Pakken har kommet til Norge» (import customs i Norge).

## 5. Datamodell
`shipments`: `carrier='aliexpress'`, `no`, `localNo`, `localCarrier`, `orderId`, `items[]`, `source='mail:aliexpress'`, `mailUid`, `lastCheck`, `events[]`.

## Test
- Legg en ekte «shipped»-e-post i mappen AliExpress → sendingen dukker opp innen ett minutt etter «Sjekk nå», med navn og ordrenummer.
- `LP00512345678901` blir gjenkjent som AliExpress, ikke Posten.
- Sending som får norsk nummer underveis, viser Posten-hentested når den er klar.
- Samme e-post to ganger gir ikke duplikat.
