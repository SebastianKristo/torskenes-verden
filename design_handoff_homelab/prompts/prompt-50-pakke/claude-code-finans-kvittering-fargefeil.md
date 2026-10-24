# Finans · Bekreft kvittering: fargefeil i «Lav sikkerhet»-boksen (lyst tema)

## Symptom (skjermbilde 14.19.25)
Boksen under «Sjekk beløp – usikker utlesing» har lyseblå bakgrunn (~#dde4ee) med mørk marineblå kant (~#2b3a7a). Teksten «Lav sikkerhet fra Lokal OCR …» er nesten usynlig (lys lilla/blå på lyseblått), og «✦ Analyser på nytt med Gemini» ser deaktivert ut (grå tekst på grå knapp). Det ser ut som farger fra mørkt tema (eller en hardkodet `#4f63ff`-tone med lav opasitet) brukes i lyst tema.

## Fiks
Bruk temavariablene (samme som resten av kortet), ingen hardkodede blåtoner:
- **Boks:** bakgrunn `var(--b-surface-2)` / sand (~#efeadf), kant `1px solid var(--b-line)` (~#ddd6c8), radius som i dag. Ingen marineblå kant.
- **Tekst:** `color: var(--b-ink-2)` (~#5f5a50), minst 4.5:1 mot bakgrunnen. Ingen opasitet på teksten.
- **«✦ Analyser på nytt med Gemini»:** primærknapp – `background: var(--b-acc)` (blå #4f63ff som «Prøv igjen»), `color:#fff`, font-weight 600. Den skal se klikkbar ut. Kun grå/deaktivert når den faktisk er `disabled` (f.eks. Gemini er av), og da med tooltip/undertekst som sier hvorfor.
- **«Les med lokal OCR»:** sekundær – `var(--b-surface)` + `1px solid var(--b-line)`, `color: var(--b-ink)` (som i dag, ok).
- Rekkefølge/layout: tekst øverst, knappene på én rad under (`display:flex; gap:10px; flex-wrap:wrap`), Gemini først.

## Sjekk også
- Mørkt tema: boks `var(--b-surface-2)` mørk, tekst `var(--b-ink-2)` lys – verifiser kontrast.
- Søk etter samme komponent andre steder (web Kvitteringer, Boliger «Les på nytt», mobil kvitteringsark) og rett likt.
- Kontrastsjekk: all tekst ≥ 4.5:1 i begge temaer.
