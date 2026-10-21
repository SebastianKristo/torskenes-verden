# Kalender: Glimt forstår klokkeslett uten «kl.»

Ønske 2026-10-21: «I kalender glimt ai ollama i søkefelt la meg bare skrive 16:00 for å skjønne at det er klokke»
Fasit: `Kalender App.dc.html` → `parse(txt)`.

## Regel
Klokkeslett leses **lokalt før** teksten sendes til Ollama, og resultatet sendes med som fasit (`{"start":"16:00"}`). Ollama skal bare finne tittel, sted og kalender, aldri tolke tiden på nytt.

## Det som skal forstås som tid
- `16:00`, `16.00`, `kl 16`, `kl. 16`, `klokka 16`
- `1600`, `0930`, `kl1600` (4 siffer, gyldig 00:00–23:59)
- `16h`, `16t`
- Bare `16` (et frittstående tall 6–23) når det ikke finnes annen tid: «frisør 16» → 16:00
- Intervall `16:00-17:30`, `16-17`
- Bare tid uten tittel («16:00») → «Ny hendelse» i dag 16:00 (i morgen hvis tiden er passert), varighet fra innstillingen.

## Det som er dato
- `25.10`, `25/10`, `25.10.26`. Tall med «:» er alltid tid. Første del > 23 er dato. Andre del > 12 er tid.

## Forhåndsvisning
Forhåndsvisningen over feltet viser tolket tid med en gang man skriver («Ny hendelse · i dag · 16:00–17:00»), før Ollama svarer. Ollama-kall: `format: "json"`, `temperature: 0`, tidsavbrudd 4 s. Svarer ikke Ollama i tide, brukes den lokale tolkningen.
