# Lokale modeller fra Desert Ant Labs (prompt 53)

Åtte små modeller kjører på serveren (Node, native kjerne på Linux x64/arm64 og macOS arm64). Alt de gjør skjer lokalt.
Hver modell står bak et feature flag som er **på** som standard. Til en modell er klar (eller hvis den mangler/feiler) brukes
dagens oppførsel – ingen forespørsel venter på at en modell lastes.

| Modell | Hva den gjør i Homelab | Flagg | Reserve |
| --- | --- | --- | --- |
| Eye | Bilder i Glimt-chatten: kvittering/dokument/skjermbilde → OCR-kjeden, foto → visjonsmodellen. Rotasjon rettes før Tesseract. Kvitteringsopplasting får en advarsel hvis bildet er et vanlig foto. | `dal_eye53` | OCR-tetthetsheuristikken og EXIF-rotasjon |
| Redact | Chat med sky-modell: navn, adresser, e-post, telefon, kontonummer, fødselsnummer o.l. byttes med plassholdere (`[GIVEN_NAME_1]`) før sending, og svaret får originalene tilbake lokalt (også mens det strømmer). Nettsøk: e-post, telefon, kort-/kontonummer og id-numre fjernes fra søkeordene (navn beholdes). | `dal_redact53` | Teksten sendes som før |
| Gist | Emner på nyhetssaker (lagres per sak). Saker uten kjent kategori får sport/teknologi/økonomi/kultur fra emnet, og «For deg» treffer interesser mot emnene. | `dal_gist53` | Nøkkelord, kilde og AI-kategorisering |
| Tongue | Språket i meldingen til Glimt – svaret kommer på samme språk. Norsk ved tvil (dansk/svensk krever høy sikkerhet). | `dal_tongue53` | Språket fra innstillingene |
| Emo | `POST /api/emo53/suggest` – emoji-forslag for gjøremål, kalender og huskeliste. | `dal_emo53` | Norske nøkkelord → emoji |
| Moderator | Barnekontoer (Innstillinger → Brukere / brief-tilgang fra prompt 52): bilder de laster opp i Glimt-chatten og bilder de ser via bildeproxyen sjekkes. Upassende → skjult med forklaring. | `dal_moderator53` | Ingen sjekk (som før) |
| Clear + Voz | `POST /api/voice53/transcribe` – lyd → Clear → Voz/Phonon → tekst med ordtider. | `dal_voice53` | 503 «ikke klar» |

## Norsk tale til tekst

**Voz støtter ikke norsk.** npm-pakken sier «25 languages» uten liste; tallet stemmer med modellfamilien Voz og Phonon-2.5
bygger på (25 europeiske språk: bg, hr, cs, da, nl, en, et, fi, fr, de, el, hu, it, lv, lt, mt, pl, pt, ro, sk, sl, es, sv, ru, uk),
og norsk er ikke med. Modellkortet på Hugging Face kunne ikke leses fra utviklingsmiljøet (blokkert), så sjekk
<https://huggingface.co/desert-ant-labs/voz> når du har nett. Phonon-2.5 på Mac mini-en (FERMION53) har samme liste – heller ikke norsk.

Derfor: ber brukeren om norsk (`language=no`, standard for norske brukere), svarer serveren **422 `language_unsupported`** med en
tydelig tekst. Velger brukeren et støttet språk (f.eks. `en` eller `sv`), brukes Phonon først (når Mac mini-en svarer), ellers Voz.
En Whisper-tjeneste kan legges til senere med `registerAsrBackend53({id:'whisper', languages:null, …})` i `server/dal53/asr.js`.

## Hva du må gjøre

1. Bygg og start serveren på nytt (nye npm-pakker; imaget blir større, ca. 0,5 GB for linux-x64 etter at de andre plattformenes
   binærfiler er fjernet i Dockerfile, pluss ffmpeg):
   ```sh
   docker compose build homelab && docker compose up -d homelab
   ```
2. Forhåndslast modellene (laster ned vektene fra Hugging Face til `DATA_DIR/models/dal53/`, noen hundre MB, Voz ca. 400 MB):
   Innstillinger → System → **Lokale modeller** → «Forhåndslast alle». Eller:
   ```sh
   curl -X POST -H "Cookie: …" https://<server>/api/admin/dal53/preload -d '{}' -H 'content-type: application/json'
   ```
   Uten dette lastes hver modell første gang den trengs (i bakgrunnen).
3. Følg med på helsa samme sted (`GET /api/admin/dal53/health`). Slå av en modell under Kvalitet → Feature flags.

Miljøvariabler (valgfrie): `DAL53_AUTOLOAD=0` slår av lasting ved første bruk (bare forhåndslasting), `HF_TOKEN` hvis Hugging Face
krever innlogging, `DAL_LICENSE_ENDPOINT` for lisenskallene (se under).

## Personvern og nettkall

- Tekst, bilder og lyd behandles bare på serveren (og Mac mini-en for Phonon). Originalverdiene fra Redact logges aldri – bare
  antall og type («GIVEN_NAME×2»).
- Den native kjernen gjør to slags nettkall: **nedlasting av vektene fra Hugging Face** (én gang) og **lisenskall til Desert Ant
  Labs** (aktivering og telling av aktive enheter). Lisenskallene inneholder app-/enhets-id, ikke innhold. Enhets-id-en er en
  hash av serveren (`DAL_DEVICE_ID`), aldri en bruker – hele huset teller som én enhet per modell.

## Utvikling og tester

`test/p53-dal.test.js` (mocket – huggingface.co er blokkert her). Ekte kjøring som er verifisert: pakkene installeres, den native
kjernen lastes med koffi på linux-x64 (nedlastingen feiler raskt uten nett), og Tongue (vektene ligger i pakken) gjenkjenner
norsk/dansk/svensk/engelsk riktig. **Ikke kjørt ekte:** Eye, Redact, Gist, Emo, Moderator, Clear og Voz med ekte vekter.
