# Web: fjern teksten nederst i bakgrunnsbildet

Ønske 2026-10-19: «fjern teksten fra bakgrunn på web». Vedlegg: `uploads/Screenshot 2026-10-19 at 21.55.45.png`, som viser en understreket lenkelinje nederst i toppbildet: «Delvis skyet · 6° · Tiago Fioreze · Wikimedia Commons».

- Fjern hele denne linjen (vær-tekst + fotograf + kilde) fra toppbildet på web. Ingen tekst over bakgrunnsbildet utenom hilsen, dato og temperatur.
- Gjelder alle bakgrunnstyper (Oslo, Planet, Vær klart/skyet/regn, egen).
- Kreditering (fotograf · lisens · Wikimedia Commons) vises **bare** i Innstillinger → Utseende → Bakgrunn under forhåndsvisningen (som i `claude-code-bakgrunn.md` punkt 3), i liten grå tekst med lenke til filsiden. Kilden er fortsatt `credits.json` / `GET /api/background` → `credit`.
- Sjekk at mobilappen heller ikke viser linjen på Hjem.
- Designet (`Homelab Papir Web.dc.html`) har ingen slik linje. Den finnes bare i den ekte web-koden. Søk etter `credit`, `Wikimedia Commons`, `attribution` i hero-komponenten.
