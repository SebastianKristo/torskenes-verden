# Media (Sonarr): slett episoder som ikke er overvåket

- I seriedetaljen (Sonarr) og per sesong: knapp **«Slett uovervåkede»** i ⋯-menyen.
- Viser bekreftelsesark: «Slette 12 episodefiler (8,4 GB) som ikke er overvåket?» med liste, avkryssing per episode og «Slett filer».
- Bruker Sonarr API: finn episoder med `monitored=false` og `hasFile=true` → `DELETE /api/v3/episodefile/{id}` (eller bulk `/episodefile/bulk`).
- Også mulig på tvers av alle serier: Media → Sonarr → ⋯ → «Rydd uovervåkede».
- Radarr tilsvarende for filmer som ikke er overvåket.
- Respekter valgt server i serverdropdown.
