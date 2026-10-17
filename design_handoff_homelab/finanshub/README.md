# FinansHub

Selvhostet privatøkonomi-app – «Tripletex for privatpersoner». Bokfør inntekter og utgifter, hold budsjett, og skann kvitteringer med mobilen. En AI-modell (lokal **Ollama** eller **Google Gemini**) leser kvitteringen, du bekrefter, og appen bokfører og matcher mot banktransaksjonen.

> Status: planlegging/design. Designforslag ligger i canvaset «FinansHub design» (desktop-oversikt, mobil hjem, mobil bekreft kvittering).

---

## Innhold

1. [Funksjoner](#funksjoner)
2. [Arkitektur](#arkitektur)
3. [Teknologivalg](#teknologivalg)
4. [AI-motor: Ollama eller Gemini](#ai-motor-ollama-eller-gemini)
5. [Kvitteringsskanning – flyt](#kvitteringsskanning--flyt)
6. [Datamodell](#datamodell)
7. [Bankdata](#bankdata)
8. [Mobil (PWA)](#mobil-pwa)
9. [Installasjon](#installasjon)
10. [Konfigurasjon (.env)](#konfigurasjon-env)
11. [Sikkerhet og personvern](#sikkerhet-og-personvern)
12. [Backup](#backup)
13. [Prosjektstruktur](#prosjektstruktur)
14. [API-oversikt](#api-oversikt)
15. [Designprinsipper](#designprinsipper)
16. [Veikart](#veikart)

---

## Funksjoner

| Modul | Hva den gjør |
|---|---|
| **Oversikt** | Inn/ut denne måneden, igjen av budsjett, sparing hittil i år, graf per måned, kø med kvitteringer til gjennomgang |
| **Transaksjoner** | Alle bevegelser på tvers av kontoer, søk, filter, kategori, vedlagt kvittering |
| **Kvitteringer (bilag)** | Skann/last opp bilde eller PDF → AI-utlesing → bekreft → bokfør. Originalen lagres alltid |
| **Budsjett** | Månedsbudsjett per kategori, varsler ved 80 % og 100 % |
| **Faste utgifter** | Abonnementer og regninger med neste trekkdato, oppdages automatisk fra gjentakende transaksjoner |
| **Kontoer** | Brukskonto, sparekonto, kredittkort, kontanter – saldo og avstemming |
| **Rapporter** | Måned/år, per kategori, per butikk, CSV/PDF-eksport, grunnlag for skattemeldingen (f.eks. reiser, gaver, utleie) |
| **Innstillinger** | Valg av AI-motor, kategorier, regler for auto-kategorisering, brukere |

Ingenting bokføres automatisk uten at du har sett over det – AI foreslår, du bestemmer.

---

## Arkitektur

```
 Mobil (PWA) / Desktop-nettleser
              │  HTTPS (Cloudflare Tunnel eller LAN)
              ▼
 ┌────────────────────────────┐
 │  Frontend (React + Vite)   │  statiske filer servert av backend
 └────────────┬───────────────┘
              │ REST /api
 ┌────────────▼───────────────┐      ┌───────────────────────┐
 │  Backend (FastAPI, Python) │─────▶│  AI-provider-lag      │
 │  - auth                    │      │  ├─ OllamaProvider ───┼──▶ Ollama (LAN, GPU-boks)
 │  - bilag/transaksjoner     │      │  └─ GeminiProvider ───┼──▶ Gemini API
 │  - matching/regler         │      └───────────────────────┘
 │  - bankimport              │
 └──────┬──────────────┬──────┘
        │              │
 ┌──────▼─────┐  ┌─────▼────────────┐
 │ PostgreSQL │  │ Fillagring        │  /data/receipts/ÅÅÅÅ/MM/<uuid>.jpg
 │ (eller     │  │ (lokal disk/NAS)  │
 │  SQLite)   │  └───────────────────┘
 └────────────┘
```

Skanningen kjøres som en bakgrunnsjobb (ARQ/Redis eller enkel `asyncio`-kø), slik at mobilen får svar umiddelbart og ser status «Leser …».

---

## Teknologivalg

| Lag | Valg | Hvorfor |
|---|---|---|
| Frontend | React + Vite + TypeScript, Tailwind eller CSS-variabler | Rask, enkel PWA-støtte |
| Grafer | Recharts eller Chart.js | Nok for søyle/linje/budsjett |
| Backend | FastAPI (Python 3.12) | Kjent fra MEK1300, god typing med Pydantic, lett å kalle Ollama/Gemini |
| ORM / migreringer | SQLAlchemy 2 + Alembic | |
| Database | PostgreSQL 16 (SQLite holder for start) | |
| Jobbkø | ARQ + Redis (valgfritt) | Bakgrunnsskanning |
| Bildebehandling | Pillow | Roter (EXIF), skaler ned til ~1600 px, komprimer før AI-kall |
| Drift | Docker Compose på Unraid eller Proxmox LXC/VM | |
| Ekstern tilgang | Cloudflare Tunnel + Cloudflare Access | Ingen åpne porter |

---

## AI-motor: Ollama eller Gemini

Appen har et felles grensesnitt, så motoren byttes i `.env` eller i Innstillinger:

```python
class ReceiptProvider(Protocol):
    async def extract(self, image: bytes, mime: str) -> ReceiptExtraction: ...
```

Begge motorer får samme prompt og samme JSON-skjema, og svaret valideres med Pydantic. Ugyldig svar → ett nytt forsøk → ellers markeres bilaget «må fylles ut manuelt».

### Sammenligning

| | **Ollama (lokalt)** | **Gemini (sky)** |
|---|---|---|
| Kostnad | Gratis (strøm + GPU) | Gratis-tier med grenser, ellers betaling per bruk |
| Personvern | Bildet forlater aldri huset | Bildet sendes til Google. På gratis-tier kan Google bruke data til å forbedre tjenestene – sjekk gjeldende vilkår |
| Presisjon | God på tydelige kvitteringer, svakere på krøllete/dårlig lys | Svært god, også på håndskrift og dårlige bilder |
| Hastighet | 5–30 s avhengig av GPU/modell | 1–4 s |
| Krav | Helst GPU med ≥ 8 GB VRAM for 7B-modeller | API-nøkkel fra Google AI Studio |

**Anbefalt oppsett:** `AI_PROVIDER=ollama` som standard, med `AI_FALLBACK=gemini` når Ollama er utilgjengelig eller sikkerheten er lav. Fallback kan slås av helt hvis du vil holde alt lokalt.

### Ollama

1. Installer Ollama på en maskin med GPU (Unraid-app, Proxmox LXC med GPU-passthrough, eller egen PC).
2. Hent en vision-modell:
   ```bash
   ollama pull qwen2.5vl:7b        # anbefalt start
   # alternativer: gemma3:12b, llama3.2-vision:11b, minicpm-v
   ```
3. Sørg for at Ollama lytter på LAN: `OLLAMA_HOST=0.0.0.0:11434`.
4. Test:
   ```bash
   curl http://<ollama-ip>:11434/api/tags
   ```

Kall fra backend (strukturert output via `format` med JSON-skjema):

```python
async def extract_ollama(image_b64: str) -> dict:
    payload = {
        "model": settings.OLLAMA_MODEL,
        "stream": False,
        "format": ReceiptExtraction.model_json_schema(),
        "options": {"temperature": 0},
        "messages": [{
            "role": "user",
            "content": RECEIPT_PROMPT,
            "images": [image_b64],
        }],
    }
    r = await http.post(f"{settings.OLLAMA_URL}/api/chat", json=payload, timeout=120)
    return json.loads(r.json()["message"]["content"])
```

### Gemini

1. Lag API-nøkkel i Google AI Studio.
2. Sett `GEMINI_API_KEY` og `GEMINI_MODEL` i `.env` (bruk en Flash-modell – billig og rask; sjekk hvilke modeller som er aktuelle i dokumentasjonen, navnene endres).
3. Installer SDK: `pip install google-genai`

```python
from google import genai
from google.genai import types

client = genai.Client(api_key=settings.GEMINI_API_KEY)

async def extract_gemini(image: bytes, mime: str) -> dict:
    resp = await client.aio.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=[types.Part.from_bytes(data=image, mime_type=mime), RECEIPT_PROMPT],
        config=types.GenerateContentConfig(
            temperature=0,
            response_mime_type="application/json",
            response_schema=ReceiptExtraction,
        ),
    )
    return json.loads(resp.text)
```

### Felles prompt

```text
Du leser en norsk kvittering. Returner KUN JSON etter skjemaet.
- Beløp i kroner som tall med punktum som desimalskille (386.50).
- Dato i ISO-format (YYYY-MM-DD). Hvis året mangler, bruk inneværende år.
- mva: summer per sats (25, 15, 12, 0) hvis oppgitt.
- Foreslå kategori fra listen: {kategorier}.
- Sett confidence (0–1) per felt. Gjett ikke: ukjent felt = null.
```

### Skjema

```python
class Line(BaseModel):
    description: str
    quantity: float | None
    amount: float

class VatLine(BaseModel):
    rate: int            # 25, 15, 12, 0
    amount: float

class ReceiptExtraction(BaseModel):
    merchant: str | None
    org_number: str | None
    date: date | None
    total: float | None
    currency: str = "NOK"
    vat: list[VatLine] = []
    lines: list[Line] = []
    payment_method: str | None   # kort, vipps, kontant
    card_last4: str | None
    suggested_category: str | None
    confidence: dict[str, float] = {}
```

Sikkerhetsregel i appen: hvis `confidence["total"] < 0.85`, eller summen av varelinjer avviker fra totalen, markeres bilaget gult («Sjekk beløp») i gjennomgangskøen.

---

## Kvitteringsskanning – flyt

1. **Ta bilde** – PWA åpner kameraet direkte (`<input type="file" accept="image/*" capture="environment">`), eller del et bilde/PDF til appen.
2. **Forbehandling** – roter etter EXIF, beskjær/skaler til ~1600 px lang side, JPEG 85 %. Original lagres urørt.
3. **AI-utlesing** – valgt motor returnerer JSON (status: `pending → processing → needs_review`).
4. **Matching** – appen leter etter banktransaksjon med samme beløp ±1 kr og dato ±3 dager (og evt. kortets siste fire siffer). Treff vises som «Matchet mot kortkjøp».
5. **Auto-kategori** – regler (f.eks. «REMA*» → Mat og dagligvarer) går foran AI-forslaget.
6. **Bekreft** – du retter eventuelle felt og trykker *Bokfør*. Status → `booked`.
7. **Læring** – rettelser lagres som nye regler (butikk → kategori).

E-post-innboks (valgfritt): videresend e-postkvitteringer til en egen adresse, så hentes vedleggene inn via IMAP og går samme løype.

---

## Datamodell

```sql
CREATE TABLE accounts (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,             -- "Brukskonto"
  type          TEXT NOT NULL,             -- checking | savings | credit | cash
  last4         TEXT,                       -- kun siste fire siffer, aldri fullt nummer
  opening_balance NUMERIC(12,2) DEFAULT 0
);

CREATE TABLE categories (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id INT REFERENCES categories(id),
  kind      TEXT NOT NULL                   -- expense | income | transfer
);

CREATE TABLE transactions (
  id            SERIAL PRIMARY KEY,
  account_id    INT REFERENCES accounts(id),
  date          DATE NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,     -- negativ = ut
  description   TEXT,
  merchant      TEXT,
  category_id   INT REFERENCES categories(id),
  source        TEXT,                       -- manual | csv | psd2 | receipt
  external_id   TEXT UNIQUE,                -- dedup ved import
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE receipts (
  id             UUID PRIMARY KEY,
  file_path      TEXT NOT NULL,
  mime           TEXT NOT NULL,
  status         TEXT NOT NULL,             -- pending | processing | needs_review | booked | rejected
  provider       TEXT,                      -- ollama | gemini
  model          TEXT,
  extraction     JSONB,                     -- rå AI-svar
  transaction_id INT REFERENCES transactions(id),
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE receipt_lines (
  id          SERIAL PRIMARY KEY,
  receipt_id  UUID REFERENCES receipts(id) ON DELETE CASCADE,
  description TEXT,
  quantity    NUMERIC(10,3),
  amount      NUMERIC(12,2),
  vat_rate    INT
);

CREATE TABLE budgets (
  id          SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(id),
  month       DATE NOT NULL,                -- første dag i måneden
  amount      NUMERIC(12,2) NOT NULL,
  UNIQUE (category_id, month)
);

CREATE TABLE recurring (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  amount      NUMERIC(12,2),
  interval    TEXT NOT NULL,                -- monthly | yearly | weekly
  next_date   DATE,
  category_id INT REFERENCES categories(id),
  account_id  INT REFERENCES accounts(id)
);

CREATE TABLE rules (
  id          SERIAL PRIMARY KEY,
  pattern     TEXT NOT NULL,                -- "REMA*"
  category_id INT REFERENCES categories(id),
  priority    INT DEFAULT 100
);
```

Overføringer mellom egne kontoer får kategori av typen `transfer` og telles verken som inntekt eller utgift.

---

## Bankdata

Tre nivåer – start enkelt:

1. **CSV-import** (fase 1): last ned fra nettbanken, importer med en mappingprofil per bank (kolonner, datoformat, fortegn). Dedup på `external_id` eller hash av dato+beløp+tekst.
2. **PSD2 / open banking** (fase 3): via en aggregator som Enable Banking (har hatt gratis tilgang for personlig bruk – sjekk gjeldende vilkår). Samtykke fornyes hver 90.–180. dag avhengig av bank.
3. **Manuell** registrering for kontanter og Vipps-overføringer.

---

## Mobil (PWA)

- `manifest.webmanifest` med navn, ikoner og `display: standalone` → «Legg til på Hjem-skjerm» i Safari.
- Service worker cacher appskallet, så den åpner raskt også på dårlig nett. Skann tatt uten nett legges i kø (IndexedDB) og lastes opp når nettet er tilbake.
- `capture="environment"` gir bakkameraet direkte. Valgfritt: egen kameravisning med `getUserMedia` og kantdeteksjon (OpenCV.js) for automatisk beskjæring.
- iOS-snarvei: «Del → FinansHub» via en Snarvei som POST-er bildet til `/api/receipts` med token – raskeste vei fra Bilder-appen.
- Store trykkflater (≥ 44 px), stor skanneknapp midt i bunnmenyen.

---

## Installasjon

### Forutsetninger

- Docker + Docker Compose (Unraid, Proxmox LXC/VM eller annen Linux-boks)
- Ollama på LAN **og/eller** en Gemini API-nøkkel

### Docker Compose

```yaml
services:
  finanshub:
    image: ghcr.io/<deg>/finanshub:latest   # eller build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "8080:8000"
    volumes:
      - /mnt/user/appdata/finanshub/receipts:/data/receipts
    depends_on: [db, redis]

  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: finanshub
      POSTGRES_USER: finanshub
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - /mnt/user/appdata/finanshub/postgres:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped
```

```bash
cp .env.example .env      # fyll inn
docker compose up -d
docker compose exec finanshub alembic upgrade head
docker compose exec finanshub python -m app.cli create-user sebastian
```

### Utvikling lokalt

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# frontend
cd frontend
npm install
npm run dev               # Vite proxy til :8000
```

---

## Konfigurasjon (.env)

```ini
# Database
DATABASE_URL=postgresql+asyncpg://finanshub:${DB_PASSWORD}@db/finanshub
DB_PASSWORD=bytt-meg

# Lagring
RECEIPT_DIR=/data/receipts
MAX_UPLOAD_MB=15

# Auth
SECRET_KEY=generer-med-openssl-rand-hex-32
SESSION_DAYS=30

# AI
AI_PROVIDER=ollama            # ollama | gemini
AI_FALLBACK=gemini            # gemini | none
AI_MIN_CONFIDENCE=0.85

OLLAMA_URL=http://10.69.1.xxx:11434
OLLAMA_MODEL=qwen2.5vl:7b
OLLAMA_TIMEOUT=120

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash # sjekk aktuelt modellnavn

# Valgfritt
REDIS_URL=redis://redis:6379
IMAP_HOST=
IMAP_USER=
IMAP_PASSWORD=
```

---

## Sikkerhet og personvern

- **Ekstern tilgang kun via Cloudflare Tunnel + Access** (e-post-OTP eller passkey). Ingen åpne porter i ruteren.
- Innlogging med passord (argon2) + valgfri TOTP; API-tokens for iOS-snarvei med begrenset omfang (`receipts:write`).
- **Lagre aldri fulle kort- eller kontonumre** – kun siste fire siffer. Kvitteringsbilder kan inneholde dette, så bildemappen må ha samme beskyttelse som databasen.
- Med `AI_PROVIDER=ollama` og `AI_FALLBACK=none` forlater ingen data hjemmenettet.
- Med Gemini: bruk betalt tier hvis du ikke vil at data kan brukes til trening, og vurder å maskere kortnummer i bildet før opplasting.
- Loggfør hvilken motor og modell som leste hvert bilag (`receipts.provider/model`).

---

## Backup

- `pg_dump` hver natt til NAS (Unraid User Scripts eller cron), behold 30 dager.
- Kvitteringsmappen synkes med restic/borg til ekstern lagring (kryptert).
- Bokføringsloven gjelder ikke privatpersoner, men behold kvitteringer for garanti/reklamasjon (inntil 5 år) og skattefradrag.

---

## Prosjektstruktur

```
finanshub/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models/            # SQLAlchemy
│   │   ├── schemas/           # Pydantic
│   │   ├── api/               # routers: receipts, transactions, budgets, ...
│   │   ├── ai/
│   │   │   ├── base.py        # ReceiptProvider + prompt + skjema
│   │   │   ├── ollama.py
│   │   │   └── gemini.py
│   │   ├── services/          # matching, rules, recurring, import
│   │   └── workers/           # bakgrunnsjobber
│   ├── alembic/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── pages/             # Oversikt, Transaksjoner, Kvitteringer, ...
│   │   ├── components/
│   │   ├── lib/api.ts
│   │   └── sw.ts              # service worker
│   └── public/manifest.webmanifest
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API-oversikt

| Metode | Sti | Beskrivelse |
|---|---|---|
| `POST` | `/api/receipts` | Last opp bilde/PDF → returnerer `id`, status `pending` |
| `GET` | `/api/receipts?status=needs_review` | Gjennomgangskø |
| `GET` | `/api/receipts/{id}` | Utlest data + forslag til match |
| `POST` | `/api/receipts/{id}/book` | Bekreft (med eventuelle rettelser) og bokfør |
| `POST` | `/api/receipts/{id}/reprocess?provider=gemini` | Les på nytt med annen motor |
| `GET/POST` | `/api/transactions` | Liste/opprett |
| `POST` | `/api/import/csv` | Bankimport |
| `GET/PUT` | `/api/budgets/{month}` | Budsjett per måned |
| `GET` | `/api/reports/summary?year=2026` | Tall til oversikt og grafer |
| `GET` | `/api/health/ai` | Status for Ollama/Gemini (vises i sidemenyen) |

---

## Designprinsipper

Designet ligger i canvaset «FinansHub design».

- **Mørkt, rolig grunnlag:** bakgrunn `#0D0F12`, flater `#15181D`, kanter `#22262D`, tekst `#EDEFF2`, sekundærtekst `#A0A7B2`.
- **To signalfarger som skilles på lyshet, ikke bare farge:** blå `#7AA7FF` for inn/primærhandling, oransje `#F2A65A` for ut og varsler. Ingen rød/grønn-avhengighet.
- **Typografi:** Geist for tekst, Geist Mono med tabulære tall for alle beløp, slik at kolonner står rett.
- **Én primærhandling per skjerm:** «Skann kvittering» på desktop, stor kameraknapp midt i bunnmenyen på mobil, «Bokfør» på bekreft-skjermen.
- **Gjennomgangskø framfor automatikk:** alt AI har lest havner i «Trenger gjennomgang» med motor og sikkerhet synlig.
- **Mobil først for skanning, desktop for oversikt og rapporter.**

---

## Veikart

**Fase 1 – MVP**
- [ ] Backend-skjelett, auth, kontoer, kategorier, transaksjoner
- [ ] Kvitteringsopplasting + Ollama-utlesing + gjennomgangskø
- [ ] Oversiktsside og PWA-installasjon
- [ ] CSV-import fra nettbanken

**Fase 2**
- [ ] Gemini som alternativ/fallback, reprocess-knapp
- [ ] Automatisk matching kvittering ↔ transaksjon
- [ ] Budsjett med varsler, regler for auto-kategori
- [ ] Faste utgifter (gjenkjenning av gjentakende trekk)

**Fase 3**
- [ ] PSD2-bankkobling
- [ ] E-postinnboks for digitale kvitteringer
- [ ] Rapporter/eksport, skattemeldingsgrunnlag
- [ ] Home Assistant-integrasjon (f.eks. sensor for «igjen av budsjett», varsel ved ny kvittering)
- [ ] Flere brukere i husstanden med delte kontoer
