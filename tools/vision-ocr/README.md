# vision-ocr – Apple Vision OCR på Mac mini-en

En liten, egen tjeneste på Mac mini-en som leser tekst i bilder med Apple Vision og svarer i
**felles OCR-format** (samme format som iPhone og Android sender, se
`shared/schemas/receipt-ocr.schema.json`). Glimt bruker den som steg C i kvitteringskjeden
(Mac Vision → qwen3:8b). Den er uavhengig av Glimt og kan også brukes til vitnemål og fakturaer.

- Swift, macOS 14+, ingen eksterne pakker.
- `POST /ocr` og `GET /health` på `http://10.69.1.173:8765`.
- Svarer bare når **både** avsender-IP-en står på tillatelseslista (standard `10.69.1.39` = Glimt-serveren)
  **og** riktig nøkkel er sendt (`Authorization: Bearer …`).
- Kjører som LaunchAgent `com.local.vision-ocr` med automatisk omstart. Loggen ligger i `~/Library/Logs/vision-ocr.log`.
- Skal **aldri** eksponeres via Cloudflare eller internett. Den lytter bare på LAN-adressen.

## Installer (én kommando)

På Mac mini-en, som brukeren som er logget inn (ikke `sudo`):

```bash
cd ~/git/torskenes-verden/tools/vision-ocr     # der repoet ligger på Mac-en
./install.sh
```

Andre adresser:

```bash
./install.sh --ip 10.69.1.173 --allow 10.69.1.39      # standardverdiene
./install.sh --allow 10.69.1.39 --allow 10.69.1.40    # flere tillatte avsendere
./install.sh --rotate-key                             # ny nøkkel (oppdater Homelab etterpå)
./install.sh --test                                   # kjør swift test først
```

Skriptet

1. sjekker macOS 14+, Xcode Command Line Tools og Swift (mangler de: `xcode-select --install`),
2. bygger med `swift build -c release`,
3. installerer binæren i `~/Library/Application Support/vision-ocr/vision-ocr`,
4. lager en nøkkel med `openssl rand -hex 32` hvis det ikke finnes en, og skriver
   `~/Library/Application Support/vision-ocr/config.json` med rettigheter `600`,
5. sjekker at Mac-en har adressen (`--ip`, standard `10.69.1.173`) og advarer hvis ikke,
6. skriver `~/Library/LaunchAgents/com.local.vision-ocr.plist` (RunAtLoad, KeepAlive, logg),
7. kjører `launchctl bootout` / `bootstrap gui/$UID` og sjekker at porten lytter,
8. skriver ut adressen, nøkkelen og ferdige `curl`-tester.

Det er trygt å kjøre `./install.sh` på nytt, for eksempel etter `git pull`. Nøkkelen, adressen,
tillatelseslista og egne valg i `config.json` blir beholdt hvis du ikke gir nye.

Avinstaller med `./uninstall.sh`. Da beholdes `config.json` med nøkkelen. Med `./uninstall.sh --purge`
slettes også nøkkelen og loggen.

## Legg adressen og nøkkelen inn i Homelab

I Homelab › **Innstillinger** (som admin), under AI › Mac-OCR:

| Felt | Verdi |
|---|---|
| Adresse (`macOcrUrl`) | `http://10.69.1.173:8765` |
| Nøkkel (`macOcrKey`) | nøkkelen som `install.sh` skrev ut |

Serveren lagrer nøkkelen kryptert, på samme måte som de andre hemmelighetene. Den sendes aldri til
nettleseren og skrives aldri til loggen. Finner du ikke nøkkelen igjen, ligger den i
`~/Library/Application Support/vision-ocr/config.json` på Mac-en:

```bash
plutil -extract key raw -o - ~/Library/Application\ Support/vision-ocr/config.json
```

## Test fra Glimt-serveren

Kjør testene på Glimt-serveren (LXC-en med `10.69.1.39`). `install.sh` skriver dem ut med riktig
nøkkel. Bytt ut `NØKKEL`:

```bash
# Helse. Skal gi {"ok":true,"languages":[…],…}
curl -sS -H "Authorization: Bearer NØKKEL" http://10.69.1.173:8765/health

# OCR av en kvittering (multipart, feltet image)
curl -sS -H "Authorization: Bearer NØKKEL" -F "image=@kvittering.jpg" http://10.69.1.173:8765/ocr

# Samme som JSON med base64
printf '{"image_base64":"%s"}' "$(base64 -w0 kvittering.jpg)" | \
  curl -sS -H "Authorization: Bearer NØKKEL" -H "Content-Type: application/json" --data-binary @- http://10.69.1.173:8765/ocr

# Uten nøkkel. Skal gi 401
curl -sS -o /dev/null -w '%{http_code}\n' http://10.69.1.173:8765/health
```

Fra Glimt-containeren, som har `node` men ikke nødvendigvis `curl`:

```bash
docker exec <glimt-container> node -e "fetch('http://10.69.1.173:8765/health',{headers:{authorization:'Bearer NØKKEL'}}).then(r=>r.text()).then(console.log)"
```

Docker sender ut via LXC-ens adresse (NAT), så Mac-en ser avsenderen som `10.69.1.39`.

Fra Mac-en selv får du **403**. Det er riktig: avsenderen er da `10.69.1.173`, som ikke står på
tillatelseslista. Vil du teste OCR lokalt på Mac-en, uten nettverket:

```bash
~/Library/Application\ Support/vision-ocr/vision-ocr --ocr-file kvittering.jpg
~/Library/Application\ Support/vision-ocr/vision-ocr --print-languages
```

## launchctl

```bash
# Status (pid, siste avslutningskode)
launchctl print gui/$(id -u)/com.local.vision-ocr | head -n 30

# Start på nytt (f.eks. etter endring i config.json)
launchctl kickstart -k gui/$(id -u)/com.local.vision-ocr

# Stopp og fjern fra launchd (til neste innlogging eller bootstrap)
launchctl bootout gui/$(id -u)/com.local.vision-ocr

# Start igjen
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.local.vision-ocr.plist

# Logg
tail -f ~/Library/Logs/vision-ocr.log

# Lytter den?
lsof -nP -iTCP:8765 -sTCP:LISTEN
```

En LaunchAgent kjører bare mens brukeren er logget inn. Slå derfor på **automatisk innlogging** på
Mac mini-en (Systeminnstillinger › Brukere og grupper), slik at tjenesten starter igjen etter
strømbrudd eller oppdateringer. Ollama gjør det samme i dag.

## API

Alle forespørsler må komme fra en tillatt IP og ha `Authorization: Bearer <nøkkel>`.

| Svar | Når |
|---|---|
| `403 {"error":"forbidden"}` | Avsender-IP-en er ikke på lista. Sjekkes før noe leses. |
| `401 {"error":"unauthorized"}` | Nøkkelen mangler eller er feil. Sjekkes før bildet leses, på konstant tid. |

### `GET /health`

```json
{
  "ok": true, "service": "vision-ocr", "version": "1.0.0", "source": "mac_vision",
  "languages": ["da-DK", "sv-SE", "en-US"], "norwegian": false,
  "language_note": "Norsk er ikke støttet av Vision på denne macOS-versjonen – …",
  "language_correction": true, "supported_languages": ["en-US", "fr-FR", "…"],
  "busy": false, "queued": 0, "served": 12, "failed": 0, "uptime_s": 3600,
  "max_bytes": 20971520, "timeout_s": 60, "macos": "15.1.0"
}
```

### `POST /ocr`

Bildet (HEIC, JPEG, PNG, TIFF m.fl., maks 20 MB) kan sendes på tre måter:

- `multipart/form-data` med feltet `image`. Dette er det Glimt bruker.
- `application/json` med `{"image_base64": "…"}`. Prefikset `data:image/jpeg;base64,` er lov.
- Rått som `image/jpeg`, `image/heic` eller `application/octet-stream`.

Valgfritt: `crop=0` (i spørrestrengen, som multipart-felt eller i JSON) slår av dokumentsegmentering og
perspektivkorrigering. Da gjelder bbox det oppreiste originalbildet, og ikke det beskårne.

Svaret er det felles OCR-formatet:

```json
{
  "source": "mac_vision",
  "lines": [ { "text": "MELK 1L", "confidence": 0.97, "bbox": [0.05, 0.2, 0.3, 0.02] },
             { "text": "24,90",   "confidence": 0.95, "bbox": [0.75, 0.205, 0.15, 0.02] } ],
  "rows": [ "MELK 1L 24,90" ],
  "full_text": "MELK 1L 24,90",
  "image_size": [1240, 3100],
  "ms": 812
}
```

- `bbox` er `[x, y, w, h]`, normalisert til 0–1 med origo **øverst** til venstre. Vision har origo nede
  til venstre, og tjenesten konverterer.
- `bbox` og `image_size` gjelder bildet etter forbehandling: oppreist, beskåret og rettet opp. Bruk `crop=0`
  hvis koordinatene skal passe på originalbildet.
- `rows` er linjer med overlappende y-intervall. Overlappen må være minst halve linjehøyden. Linjene
  sorteres på x og slås sammen med mellomrom, så vare og pris havner på samme rad. `full_text` er radene
  skilt med linjeskift.
- Hodefeltene `X-OCR-Languages`, `X-OCR-Cropped` (1/0) og `X-OCR-Bands` viser hva som ble gjort.

Andre feil: `400` (ikke noe bilde, ugyldig base64 eller multipart), `411` (Content-Length mangler,
chunked støttes ikke), `413` (for stort), `415` (feil innholdstype), `422` (bildet kan ikke leses),
`503` (opptatt, med `Retry-After`), `504` (OCR tok for lang tid) og `500` (Vision feilet).
Feilene er JSON: `{"error": "…"}`.

## Hvordan det virker

1. **Innlesing:** ImageIO leser HEIC, JPEG og PNG og roterer etter EXIF-orienteringen. Bilder over
   120 megapiksler avvises, og den lengste siden begrenses til 8192 px.
2. **Beskjæring:** `VNDetectDocumentSegmentationRequest` finner kvitteringen, og `CIPerspectiveCorrection`
   retter den opp. Dette hoppes over hvis Vision er usikker (konfidens under 0,5), hvis firkanten er liten
   (under 15 % av bildet, trolig feil objekt) eller hvis den dekker nesten hele bildet.
3. **Bånd:** Er bildet høyere enn 2,5 × bredden (lange kvitteringer), deles det i bånd på 2 × bredden med
   10 % overlapp. Midt i hver overlapp går et snitt, og hvert bånd beholder bare linjene på sin side av
   snittet. Linjer som er kuttet i kanten av et bånd, er da hele i nabobåndet. Linjer som likevel er lest
   to ganger (lik tekst, nesten samme y og overlapp i x), dedupliseres, og den med høyest konfidens beholdes.
4. **OCR:** `VNRecognizeTextRequest` med `.accurate`, `usesLanguageCorrection = true` og vanlige ord fra
   norske kvitteringer som `customWords` (TOTAL, Å BETALE, PANT, RABATT, MVA …).
5. **Kø:** Én OCR-jobb kjøres om gangen, og de andre venter i kø i opptil 60 s. Det er maks 8 samtidige
   tilkoblinger, og lesing av forespørselen har tidsavbrudd.

### Språk

Ved oppstart spør tjenesten Vision hvilke språk som er støttet (`supportedRecognitionLanguages()` for `.accurate`):

1. Er norsk støttet (`nb-NO`, `no-NO`, `nn-NO` …), brukes norsk + `en-US`.
2. Ellers brukes de av `da-DK`, `sv-SE` og `en-US` som er støttet. Dansk og svensk gir æ/ø/å og ä/ö.
3. Ellers brukes `en-US`. Da kan æ/ø/å bli lest feil, og `language_note` i `/health` sier fra.

Valget står i loggen og i `/health`. Du kan overstyre det i `config.json`, og det beholdes når du kjører
`install.sh` på nytt:

```json
{ "languages": ["sv-SE", "en-US"], "language_correction": true }
```

Start tjenesten på nytt etterpå: `launchctl kickstart -k gui/$(id -u)/com.local.vision-ocr`.

### config.json

```json
{
  "bind_ip": "10.69.1.173",
  "port": 8765,
  "key": "<64 heksadesimale tegn>",
  "allow": ["10.69.1.39"],
  "max_bytes": 20971520,
  "timeout_seconds": 60,
  "max_connections": 8
}
```

Tjenesten nekter å starte hvis `bind_ip` er `0.0.0.0` eller `127.x`, hvis nøkkelen er kortere enn
32 tegn, eller hvis `allow` er tom eller har et nett som er videre enn `/16`.

## Sikkerhet

- Tjenesten lytter bare på LAN-adressen og aldri på `0.0.0.0`. Den skal ikke ha noen Cloudflare-tunnel,
  portviderekobling eller offentlig DNS.
- To krav: avsender-IP-en må stå på tillatelseslista, og Bearer-nøkkelen må stemme. Nøkkelen sammenlignes
  på konstant tid.
- `config.json` har rettigheter 600, og mappen har 700. Nøkkelen står ikke i LaunchAgent-filen.
- Loggen inneholder ingen bilder, ingen OCR-tekst og ingen nøkkel. Den har bare IP, sti, status, tid,
  størrelse og antall linjer.
- Vil du i tillegg sperre i UniFi, tillat TCP 8765 til `10.69.1.173` bare fra `10.69.1.39`.

## Feilsøking

| Symptom | Løsning |
|---|---|
| `Kan ikke lytte på 10.69.1.173:8765 … Can't assign requested address` i loggen | Mac-en har ikke adressen. Sjekk den faste IP-en i UniFi, eller installer med `--ip`. Tjenesten prøver igjen hvert 5. sekund. |
| Glimt får tidsavbrudd, men porten lytter | macOS-brannmuren er på: `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add ~/Library/Application\ Support/vision-ocr/vision-ocr` og `… --unblockapp …`. Sjekk også Systeminnstillinger › Personvern og sikkerhet › Lokalt nettverk. |
| `403` fra Glimt | Glimt-serveren har en annen avsender-IP. Se `avvist`-linjen i loggen og installer med `--allow <ip>`. |
| `401` | Nøkkelen i Homelab stemmer ikke med `config.json`. |
| `launchctl bootstrap` feiler over SSH | Ingen er logget inn på skrivebordet. Logg inn (eller slå på automatisk innlogging) og kjør `install.sh` igjen. |
| æ/ø/å blir feil | Se `language_note` i `/health`. Prøv `"languages": ["da-DK", "sv-SE", "en-US"]` eller `"language_correction": false`. |

## Utvikling og tester

```
Package.swift
Sources/VisionOCRCore/   rene funksjoner: bbox, bånd, rows, sikkerhet, HTTP-tolking, språk, config
Sources/vision-ocr/      Vision/ImageIO/CoreImage og HTTP-serveren på BSD-sokler
Tests/VisionOCRCoreTests XCTest (swift test)
Tests/Fixtures/          felles eksempeldata for Swift- og node-testene
node-test/               samme rows-, bbox- og båndalgoritme portert til JavaScript
```

```bash
swift build -c release
swift test                                   # på Mac-en. Krever XCTest (Xcode eller nyere Command Line Tools)
node --test node-test/logic.test.mjs         # hvor som helst med Node 20+, også mot det delte schemaet
```

Algoritmene i `node-test/logic.mjs` er en port av `Sources/VisionOCRCore/Geometry.swift`. Endrer du den
ene, må du endre den andre og fixturene.
