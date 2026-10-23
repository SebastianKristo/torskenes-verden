# Import av chat og minner: Claude (fiks), ChatGPT og Gemini

Fasit: `Claude Import.dc.html`, `AI Kontroll.dc.html`.

## Fiks Claude-import
- Claude-eksport er en ZIP med `conversations.json`, `projects.json`, `users.json` (og evt. memories). Støtt både ZIP og løse JSON-filer.
- Strøm-parse store filer (ikke last hele i minnet); vis fremdrift.
- Vis faktisk feilårsak ved feil.

## Nye kilder
- **ChatGPT**: ZIP med `conversations.json` (tre-struktur `mapping` → flat ut til meldinger i rekkefølge) og evt. minner.
- **Gemini**: Google Takeout → «Gemini Apps Activity» (HTML/JSON i `My Activity`). Parse spørsmål/svar-par med tidspunkt.
- UI: velg kilde (Claude · ChatGPT · Gemini) med logo, steg-for-steg-veiledning for eksport, dra-og-slipp fil, forhåndsvisning (antall samtaler, periode), velg hva som importeres (samtaler / minner), Importer.
- Importerte data lagres lokalt, indekseres som Glimt-minne (embeddings `nomic-embed-text`), merket med kilde.
