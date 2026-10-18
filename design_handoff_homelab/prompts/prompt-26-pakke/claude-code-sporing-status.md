# Til Claude Code: Sporing – feil Posten-logo og status står fast på «Registrert»

## Symptom (iOS-appen, Sporing)
1. Kortet for **Posten** viser en rød firkant med en hvit sirkel og pil. Det er ikke Postens logo.
2. Pakker funnet i e-post (f.eks. `LL134336179NO`, «Funnet i e-post · 17.10 23:31») står som **«Registrert – Ingen leveringsdato ennå»**, selv om de allerede er levert. Status oppdateres aldri etter at pakken er funnet.
3. Tittelen er «Posten · 79NO» (fraktselskap + slutten av nummeret). Se `claude-code-pakke-logo.md`: tittelen skal være varenavn eller butikk.

## 1. Riktig logo
- Ikke bruk første favicon som dukker opp. Logo for fraktselskap skal komme fra det **interne logobiblioteket** (`claude-code-logobibliotek.md`) med manuelt kontrollerte filer:
  - **Posten:** offisiell Posten-logo (rød bakgrunn `#E32D22`, hvitt Posten-symbol). Hent fra Posten Brings merkevare-/presseside eller Wikimedia Commons (søk «Posten Norge logo»), lagre som `posten.png`/`posten.svg`.
  - Det samme for **Bring** (grønn `#7BC144`), **PostNord**, **DHL**, **Helthjem**, **Instabox**, **Budbee**, **UPS** og **FedEx**.
- Sett `kilde: "manuell"` i `registry.json` for disse, så `fetch_logos.py` ikke overskriver dem.
- Legg til en enkel visuell sjekk i `fetch_logos.py`: lag `logos/preview.html` med alle logoene i et rutenett, og se over den før commit.

## 2. Status skal oppdateres
Pakker funnet i e-post må spores med en gang, og deretter jevnlig.

**Kilder i prioritert rekkefølge:**
1. **Posten / Bring:** Mybring Tracking API `GET https://api.bring.com/tracking/api/v2/tracking.json?q=<nr>&lang=no` med headerne `X-Mybring-API-Uid` og `X-Mybring-API-Key` (gratis Mybring-konto, nøkkel i Innstillinger → Integrasjoner). Statuser fra `eventSet[].status`: `PRE_NOTIFIED` → Registrert, `IN_TRANSIT`/`TRANSPORT_TO_RECIPIENT` → I transport, `HANDED_IN` → Hentet, `READY_FOR_PICKUP` → Hentested (med `unitInformation`/hentested og frist), `DELIVERED`/`DELIVERED_SENDER` → Levert, `RETURN` → Returnert.
2. **PostNord:** `https://api2.postnord.com/rest/shipment/v5/trackandtrace/findByIdentifier.json?id=<nr>&locale=no&apikey=…`
3. **Andre / reserve:** ParcelsApp (eksisterende, 3 oppslag/mnd på gratisplan). Brukes bare når selskapets eget API mangler eller feiler.

**Når det sjekkes:**
- Straks pakken er funnet (e-post, Finn eller manuelt).
- Hver 30. minutt for aktive pakker, hver 6. time hvis «Registrert» > 3 dager. Stopp når Levert/Returnert.
- Ved pull-to-refresh i Sporing.
- **Gamle e-poster:** Er e-posten eldre enn 14 dager og API-et svarer «Levert» (eller ikke finner pakken etter 30 dager), legg pakken direkte i **Arkiv** med status Levert. Den skal ikke ligge som aktiv «Registrert».

**Visning:**
- Tidslinjen (Registrert · Hentet · I transport · Hentested · Levert) markerer faktisk status, med dato og klokkeslett under siste steg.
- «Ingen leveringsdato ennå» vises bare når status er Registrert og API-et ikke har `estimatedDelivery`.
- Siste hendelse fra API-et vises som én linje, f.eks. «Ankommet terminal · Oslo · 18.10 06:12».
- Feil fra API-et → liten tekst «Kunne ikke oppdatere · prøver igjen 20:15». Ikke vis «Registrert» som om det var sant.

## Test
- `LL134336179NO` (levert) → status Levert, flyttes til Arkiv, ekte Posten-logo.
- Ny Bring-pakke i transport → I transport med siste hendelse og forventet levering.
- Pakke klar på hentested → «Hentested», navn på hentested og frist, varsel «Klar for henting».
- API-nøkkel mangler → tydelig melding under Innstillinger, ParcelsApp brukes som reserve.
