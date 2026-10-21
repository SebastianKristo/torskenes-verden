# Gjøremål: synk med Home Assistant flyttes til Innstillinger

Ønske 2026-10-21: «legg synk fra gjøremål inn i innstillinger» (vedlegg `uploads/Screenshot 2026-10-21 at 13.46.56.png`)
Fasit: `Mobil Papir App.dc.html` → Innstillinger → **Gjøremål** (`SUBP.huske`) og `Huskeliste.dc.html`.

- **Innstillinger → Gjøremål** (ny rad under Kalendere, undertekst «Synk med Home Assistant · på/av»). Siden har kortet **SYNK MED HOME ASSISTANT · SYNKET 20:41**: Synkroniser lister (av/på), én rad per liste (**Mine, Jobb, Hjem, Handel, Hytta**, og nye lister automatisk) med valgt `todo.*`-entitet eller «Ikke koblet», trykk for å velge (åpner liste over HA-entiteter i appen), **↻ Synk nå**, og forklaringen under.
- **I Gjøremål** er det store kortet borte. I stedet: én rad «⇄ Synk med Home Assistant · Synket 20:41 · endres i Innstillinger → Gjøremål ›». Trykk åpner Innstillinger → Gjøremål direkte (`papir-open-settings` med `detail:'huske'`).
- Samme lagring som før (`huske_ha`: `{on, map:{liste: entity}, t}`), så ingenting må kobles på nytt.
- Integrasjoner → Home Assistant viser «Gjøremål: 2 lister koblet ›» som også går hit.
- Web: Innstillinger → Gjøremål med samme kort.
