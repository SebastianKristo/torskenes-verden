# Søkehistorikk: logges på mobil, vises bare på web (samme bruker)

Vedlegg: web-søket på Dashboard viser «Nylige søk» (hvordan er været, ørn, Paris opera, https://www.finn.no/, pro) med «Tøm historikk» og ✕ per rad.

## Regler
- **Mobil viser ikke «Nylige søk».** Når søkefeltet på Hjem får fokus på mobil, vises ingen historikkliste, bare tastaturet (og eventuelt Glimt-forslag mens man skriver).
- **Mobil logger søk.** Alt som sendes fra søkefeltet på mobil (Glimt, Google, DuckDuckGo, snarveier, «time hos …») lagres i brukerens historikk med `device: 'mobil'`. Fasit: `Mobil Papir App.dc.html` → `hsLog()` (lokal nøkkel `hl_search_hist` i designet).
- **Web viser historikken fra begge.** «Nylige søk» på web henter brukerens historikk fra serveren: søk fra web og mobil, sortert etter tid, maks 8, ingen duplikater (siste vinner, uavhengig av store/små bokstaver).
  - Rad: klokkeikon · søketekst · liten etikett «mobil» (Plex Mono 10 px, `mut`) for søk fra telefonen · ✕ (sletter fra serveren, og forsvinner da også fra mobilloggen).
  - «Tøm historikk» sletter alt for brukeren (begge enheter). Bekreft med toast «Historikken er tømt · Angre».
  - Trykk på en rad fyller feltet og kjører søket på nytt med samme motor.
- **Per bruker:** historikken tilhører innlogget bruker. Andre i familien/husstanden ser aldri dine søk.

## Backend
- `search_history(id, user_id, q, engine, device, created_at)`. Indeks på `(user_id, created_at desc)`. Behold 90 dager eller de siste 200.
- `POST /api/search-history` (mobil og web logger), `GET /api/search-history?limit=8` (bare web bruker den), `DELETE /api/search-history/:id`, `DELETE /api/search-history`.
- Innstilling i Personvern: **Lagre søkehistorikk** (på). Av → ingenting logges, og «Nylige søk» skjules også på web.
- Ikke logg passord, koder eller tekst som ser ut som kortnummer eller personnummer (regex-filter før lagring).
