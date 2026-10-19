# Logo-oppslag for butikker (uten å la AI gjette)

Problem: kvittering fra Blomsterlandet fikk ingen logo, og «Prøv med AI» hjalp ikke. Ollama (og andre språkmodeller) har ikke internett og kan ikke hente bilder. De finner på domener og URL-er. Bruk AI bare til å rydde navnet, og la koden hente og sjekke logoen.

## Personvern: hvem ser hva
- **Ollama (lokalt)** leser hele kvitteringen: butikk, org.nr., varelinjer, beløp, kortnr. Ingenting forlater hjemmeserveren.
- **Gemini** får bare det ryddede butikknavnet (og evt. by), f.eks. `{"butikk":"Blomsterlandet","land":"NO"}`. Aldri bildet, varelinjer, beløp, org.nr. eller kortdata.
- Håndhev det i koden: én funksjon `logo_lookup(name: str, country: str)` som er den eneste veien til Gemini for logoer. Den tar bare tekst (maks 60 tegn, kun bokstaver, tall, mellomrom, `&-.`), så ingenting annet kan lekke med.
- Gemini-kallet bruker **Google Search grounding** og ber om JSON: `{"domene":"blomsterlandet.no","sikkerhet":0-1}`. Ikke be om logo-URL.
- Logg hva som ble sendt (`ai_audit`: tid, motor, felt sendt) så det kan sjekkes i Innstillinger.
- Innstillinger → AI og tolkning → **PERSONVERN OG LOGOER**: «Les kvitteringer lokalt» (på), «Finn logo med Gemini» (på), «Sjekk logoen før den lagres» (på). Av = hopp over Gemini og gå rett til steg 4.

## Rekkefølge (stopp på første treff)
1. **Egen tabell** `merchant_logos` (navn-nøkkel → domene, logo-fil, kilde, sist sjekket). Manuelle valg vinner alltid.
2. **Rydd navnet** uten AI: store bokstaver → vanlig, fjern `AS`, `ASA`, org.nr., kortnr., butikknummer og sted («BLOMSTERLANDET SKI AS 9812» → `blomsterlandet`). Bruk en liste med kjente kjeder.
3. **Brønnøysundregistrene** (`data.brreg.no/enhetsregisteret/api/enheter?navn=…`): org.nr. og `hjemmeside` gir ofte riktig domene. Kvitteringer har org.nr., så søk på det først.
4. **Gemini (bare butikknavn)** foreslår domene med Google Search. Gå videre bare hvis domenet svarer (se under).
5. **Gjett domene** og sjekk at det svarer: `blomsterlandet.no`, `.com`, `.se`. Krev HTTP 200 og at `<title>` inneholder navnet.
6. **Hent logo fra domenet**, best først: `apple-touch-icon` (180 px) → `<link rel="icon">` SVG/PNG ≥ 64 px → `og:logo` / `og:image` → `/favicon.ico`. Logo-tjeneste som reserve (logo.dev / Brandfetch med API-nøkkel, eller `https://www.google.com/s2/favicons?domain=…&sz=128`).
7. **Klipp logoen fra kvitteringen** lokalt: bildemodell i Ollama (`qwen2.5vl`, `llava`) returnerer en bounding box for logoen øverst på kvitteringen. Klipp ut og lagre som reserve.
8. **Ingen treff**: initialer og fast farge (som i dag), og raden får «Velg logo»: last opp bilde eller lim inn domene.

## Hva Ollama brukes til
- Leser hele kvitteringen (bildemodell) og gir `{butikk, orgnr, dato, sum, linjer}`. Bare `butikk` går videre til Gemini.
- Steg 2 når reglene ikke klarer det: «Hva er kjedenavnet i `BLOMSTERL. SKI 9812`? Svar med ett ord.» Bruk `format: json`, temperatur 0.
- Aldri bruk en logo-URL som modellen har skrevet. Bare domener som er sjekket i steg 4.
- Tekstmodeller (llama3, mistral) kan ikke se bilder. Steg 6 trenger en bildemodell.

## Lagring
- Last ned og lagre logoen lokalt (`/data/logos/{nøkkel}.png`, 128×128, gjennomsiktig bakgrunn bevares). Ikke hotlink.
- Sjekk på nytt hver 90. dag. Logg kilde (`brreg`, `favicon`, `logo.dev`, `kvittering`, `manuell`).
- Ett oppslag per kjede: alle Blomsterlandet-butikker deler logo.

## Test
- `BLOMSTERLANDET SKI AS` → blomsterlandet.no → apple-touch-icon.
- `PLANTASJEN LAMBERTSETER`, `KIWI 123 PILESTREDET`, `VINMONOPOLET MAJORSTUEN`, `CIRCLE K LADING`.
