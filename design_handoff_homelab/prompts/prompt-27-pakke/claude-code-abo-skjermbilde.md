# Nytt abonnement fra skjermbilde

Fasit: `Subscription OS.dc.html` → «+ Legg til abonnement» → **Fra skjermbilde**.
- Brukeren velger et skjermbilde (kvittering i appen, App Store-abonnement, e-post, kontoside).
- Backend: Ollama med bildemodell (`qwen2.5vl:7b`) og `format: json`: `{tjeneste, plan, pris, valuta, syklus: "mnd"|"år", neste_trekk: "YYYY-MM-DD", sikkerhet: {felt: 0–1}}`. Bildet sendes aldri til sky og slettes etter lesing.
- Normaliser: kjente tjenester (Spotify, Netflix, Disney+, YouTube Premium, Viaplay, iCloud+, ChatGPT …) får logo og kategori. Pris i NOK; annen valuta regnes om og vises «≈».
- Mangler trekkdato: bruk dagens dato + syklus og merk «Sjekk».
- Visning: miniatyr av bildet, rader Tjeneste · Plan · Pris · Syklus · Neste trekk · Kategori med ✓ eller «Sjekk» (sikkerhet < 0,8). Knapper «+ Legg til …» og «Rediger først» (åpner skjemaet ferdig utfylt).
- Finnes tjenesten allerede: tilby å oppdatere plan/pris i stedet.
