# Fiks: abonnement fra skjermbilde (AI) virker ikke

Gjelder: Subscription OS → «+ Legg til abonnement» → **Skjermbilde**. Brukeren melder at lesingen ikke virker. Gå gjennom alle punktene, logg hvert steg, og vis en konkret feilmelding i stedet for å feile stille.

## 1. Bildet før sending
- iPhone gir **HEIC**. Ollama leser ikke HEIC. Konverter alltid til **JPEG** på klienten (iOS: `UIImage.jpegData(compressionQuality: 0.85)`; web: tegn til `<canvas>` → `toBlob('image/jpeg', .85)`).
- Skaler ned til maks **1600 px** på lengste side. Skjermbilder fra iPhone er 1290×2796 og gir for mange bilde-tokens.
- Send **ren base64** i `images: [...]`, **uten** `data:image/jpeg;base64,`-prefiks. Dette er den vanligste feilen.

## 2. Kallet til Ollama
- Bruk `POST /api/chat` med bildet på meldingen:
  ```json
  {"model":"<vision-modell>","stream":false,"format":"json","keep_alive":"10m",
   "options":{"temperature":0,"num_ctx":8192},
   "messages":[{"role":"user","content":"<prompt>","images":["<base64>"]}]}
  ```
- **Modellen må støtte bilder.** Sjekk med `POST /api/show` at `capabilities` inneholder `"vision"`. Rekkefølge: `qwen2.5vl:7b` → `gemma3`/`gemma4` (har bilde) → `llama3.2-vision`. Har ingen vision: vis «Ingen bildemodell installert» + knapp **Installer qwen2.5vl** (`POST /api/pull`, vis fremdrift).
- Ikke bruk modellen som er valgt i Chat hvis den ikke har vision (f.eks. `qwen3:8b`).
- **Timeout 120 s.** Første kall laster modellen (30–60 s). Vis «Laster bildemodellen …» etter 5 s.

## 3. Svaret
- Tenkemodeller kan legge `<think>…</think>` foran JSON. Fjern alt før første `{` og etter siste `}` før `JSON.parse`.
- Godta både norske og engelske nøkler (`tjeneste|service`, `pris|price`, `syklus|cycle`, `neste_trekk|next_charge`).
- Pris kan komme som `"129,00 kr"` → normaliser komma, fjern valuta.
- Valider: tjeneste ≠ tom og pris > 0, ellers vis «Fant ikke et abonnement i bildet».

## 4. Prompt (ordrett)
```
Du leser et skjermbilde av et abonnement (App Store, e-post, kvittering eller kontoside).
Svar KUN med JSON: {"tjeneste":string,"plan":string|null,"pris":number,"valuta":"NOK"|"USD"|"EUR"|string,
"syklus":"mnd"|"år"|"uke","neste_trekk":"YYYY-MM-DD"|null,"sikkerhet":{"tjeneste":0-1,"pris":0-1,"neste_trekk":0-1}}.
Bruk null hvis noe ikke står i bildet. Ikke gjett pris.
```

## 5. Reserve
- Feiler Ollama (nede, timeout, ingen vision): tilby **«Les med Gemini»**. Kun etter at brukeren trykker, aldri automatisk, siden bildet da sendes ut.
- Gemini: `gemini-2.5-flash`, `responseMimeType: "application/json"`, samme prompt.

## 6. Feilmeldinger i arket (Papir-farger)
| Tilfelle | Tekst | Knapp |
|---|---|---|
| Ollama svarer ikke | Får ikke kontakt med Ollama på hjemmeserveren. | Prøv igjen · Les med Gemini |
| Ingen bildemodell | Ingen bildemodell installert. | Installer qwen2.5vl |
| Timeout | Bildemodellen brukte for lang tid. | Prøv igjen |
| Ugyldig JSON / tomt | Fant ikke et abonnement i bildet. | Skriv inn selv |
Kort: `card`, tekst `ink`, knapp `lab` med hvit tekst.

## 7. Test
- HEIC fra iPhone, PNG-skjermbilde, App Store-abonnement, Netflix-e-post, bilde uten abonnement.
- Med `qwen3:8b` valgt i Chat: lesingen skal likevel bruke en vision-modell.
- Logg til serveren: modell, bildestørrelse etter skalering, svartid, rått svar (de første 500 tegnene).
