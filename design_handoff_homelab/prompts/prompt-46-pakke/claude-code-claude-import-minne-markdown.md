# Claude-import: støtt minne-eksport (mappe med .md-filer)

Ønske 2026-10-23: brukeren fikk feilen «Fant ikke conversations.json i eksporten (claude-memory-2026-10-21/areas/appliance-monitoring.md, …/areas/arild-kristo-estate.md, …/areas/finanshub.md, …/areas/homelab-networking.md …)».
Gjelder `Claude Import.dc.html`, `AI Kontroll.dc.html` og utvider `claude-code-ai-import-claude-chatgpt-gemini.md`.

## Årsak
Importen godtar bare **samtale-eksporten** (`conversations.json`). Brukeren lastet opp en **minne-eksport**: en ZIP eller mappe `claude-memory-<dato>/` med Markdown-filer, én per tema (`areas/<tema>.md`). Den har ingen `conversations.json`, så importen avviser hele filen, selv om innholdet er nettopp det Glimt skal huske.

## Løsning: gjenkjenn formatet på innholdet, ikke på ett filnavn
Les fillisten i ZIP-en/mappen og velg tolker:
| Funnet | Type | Tolkes som |
|---|---|---|
| `conversations.json` (+ `projects.json`, `users.json`) | Claude samtaler | samtaler |
| `memories.json` / `memory.json` | Claude minner (JSON) | minner |
| `claude-memory-*/**/*.md` eller mange `.md` i `areas/`, `projects/`, `people/` o.l. | **Claude minner (Markdown)** | minner |
| begge deler | blandet | begge |
| ChatGPT `conversations.json` med `mapping` | ChatGPT | samtaler (+ minner hvis de finnes) |
| Google Takeout `Gemini Apps`/`My Activity` | Gemini | samtaler |

Det er bare feil hvis **ingenting** kjennes igjen. Da skal feilmeldingen si hva som ble funnet: «Fant 15 Markdown-filer, men ingen samtaler eller minner Glimt kjenner igjen.»

## Tolking av minne-Markdown
- Én fil = ett **minneområde**. Tittel = første `# Overskrift`, ellers filnavn (`arild-kristo-estate` → «Arild Kristo Estate»). Mappenavnet (`areas`, `projects`, `people`) blir kategori.
- Del opp i minnepunkter på `##`-overskrifter og punktlister. Ta vare på lenker og kodeblokker.
- Datoen fra mappenavnet (`2026-10-21`) blir kilde-dato. Kilde: `claude-memory`.
- Lag embeddings (`nomic-embed-text`), lagre lokalt, merk med kilde, område og filsti.
- **Duplikater:** samme fil importert på nytt oppdaterer området (hash per punkt), og lager ikke kopier.
- Strøm-les store eksporter. Vis fremdrift per fil.

## UI (Claude Import)
- Etter valg av fil: forhåndsvisning «**Claude-minner** · 15 områder · 21. okt 2026» med liste over områdene (navn + antall punkter) og avkrysning per område (alle på).
- Er det både samtaler og minner: to faner, **Samtaler (n)** og **Minner (n)**.
- Knapp **Importer 15 områder**. Etterpå: «Glimt husker nå 15 områder fra Claude» + lenke **Se minnene** (AI-kontroll → Minne, filtrert på kilde).
- Veiledningen på siden forklarer begge eksportene: Innstillinger → Personvern → Eksporter data (samtaler) og Minne → Eksporter (minner).

## Test
- Minne-ZIP fra brukeren (`claude-memory-2026-10-21/areas/*.md`) → 15 områder importert, ingen feil.
- Samtale-eksport → som før. Begge i én ZIP → begge importeres.
- Mappe dratt inn direkte (ikke ZIP) virker også.
- Samme eksport to ganger → ingen duplikater.
