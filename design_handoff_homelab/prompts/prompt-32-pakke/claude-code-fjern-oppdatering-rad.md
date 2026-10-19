# Innstillinger: fjern «Oppdatering» under SYSTEM (Nordlys OS gjør det samme)

Vedlegg: Innstillinger i den ekte appen. Under PROGRAMVARE står **Nordlys OS 4.24.0 · Siste versjon** (åpner Nordlys-siden med «Oppdater nå»). Under SYSTEM står også **Oppdatering · Installert 4.24.0 · 8512626**. De gjør det samme.

Fasit: `Mobil Papir App.dc.html` → gruppen PROGRAMVARE (Nordlys OS-raden åpner `nordlys`). Designet har ingen «Oppdatering»-rad under SYSTEM.

## Endring
- **Slett raden «Oppdatering» under SYSTEM**, både på mobil og web, og ruten/siden den åpnet (dersom den er en egen side).
- Det eneste stedet å oppdatere er **PROGRAMVARE → Nordlys OS {versjon}** → Nordlys-siden.
- Flytt informasjonen fra den gamle siden inn på Nordlys-siden, under «Hva er nytt»:
  - «Installert 4.24.0 · build 8512626» (Plex Mono, `mut`, 12 px), med «Kopier».
  - Eventuelle handlinger fra den gamle siden (Se etter oppdatering, Logg) som rader nederst på Nordlys-siden.
- Gamle lenker/deep links til den gamle siden (`/settings/update`, `papir://update`) sendes videre til Nordlys-siden.
- Søk i innstillinger: «oppdatering», «versjon», «update» → treffer Nordlys OS.
- Blir SYSTEM-gruppen tom, skjules overskriften.
