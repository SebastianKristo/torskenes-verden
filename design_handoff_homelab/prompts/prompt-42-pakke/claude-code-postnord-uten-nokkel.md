# PostNord-sporing uten konto og uten API-nøkkel (som ha-postnord)

Ønske 2026-10-20: «dette er en homeassisntt integratio for postnord. den bruker ikke api, finn ut hvordan den løser det og legg det inn https://github.com/ha-parcel-integrations/ha-postnord»
Fasit i design: `Mobil Papir App.dc.html` → Innstillinger → Integrasjoner → PostNord (nøkkel er nå valgfri).

## Hva ha-postnord gjør
- Sporer PostNord-pakker (SE/DK/NO/FI) **bare med sporingsnummeret**: ingen PostNord-konto og ingen API-nøkkel.
- Den bruker PostNords **offentlige Track & Trace-endepunkt**, altså det samme JSON-kallet som sporingssiden på postnord.no/postnord.se gjør i nettleseren. Det er ikke utviklerportalens nøkkelbelagte API.
- Pakker som ikke er skannet ennå gir ingen sending tilbake. Da står de som `unknown` til første skanning.
- **Dynamisk polling:**
  - ingen kall 00–06 (én sjekk rundt midnatt og rundt 06)
  - **hvert 15. min** når en pakke er `out_for_delivery` (fra 1 t før forventet levering)
  - **hvert 45. min** for andre aktive pakker
  - **stopp** når alt er levert
  - en fast liten forskyvning per installasjon, så ikke alle spør samtidig.
- Normaliserer til felles statuser: `registered · in_transit · out_for_delivery · at_pickup_point · delivered · returning · problem · unknown`. PostNords egen tekst beholdes som `raw_status`.
- Hendelser: `parcel_registered`, `status_changed` (old/new), `delivered`, `delivery_time_changed`. Ingen hendelser ved første oppdatering etter oppstart.
- Valgfri statushistorikk per pakke. Leverte pakker vises i X dager.

## Gjør dette først
Klon repoet og les `custom_components/postnord/`. Les særlig klientfila (`api.py`/`client.py`) og `coordinator.py`. Kopier **nøyaktig** URL, query-parametere (`id`, `locale`) og headere (User-Agent/Accept/Origin) derfra. Ikke gjett.

Svaret er JSON med `shipmentId`, `items[]` → `deliveryInformation` (`deliveryTo`, `deliveryToInfo`), `events[]` (`eventDescription`, `eventTime`, `status` som `INFORMED`/`EN_ROUTE`/`AVAILABLE_FOR_DELIVERY`/`DELIVERED` …, `location.name`), estimert levering og hentested. Python-pakken `postnord-api` (dunderrrrrr) gjør det samme uten nøkkel og kan brukes som referanse.

## Bygg det inn i Homelab (Sporing)
- **Backend:** ny `carriers/postnord.py`:
  - `fetch(tracking_code, locale='nb')` mot det offentlige endepunktet med `httpx`, timeout 15 s og 2 nye forsøk med backoff.
  - Har brukeren lagt inn **egen nøkkel** (valgfritt), brukes det offisielle API-et (`findByIdentifier`) først. Ellers det offentlige.
  - Map PostNord-status til våre statuser: REGISTRERT · PÅ VEI · UTE FOR LEVERING · HENT I DAG · LEVERT · RETUR · PROBLEM (samme som Sporing-trinnene). Lagre `raw_status`.
  - Hent hentested (navn, adresse, frist) til «Kiwi Pilestredet · innen 24.10»-linja, og forventet leveringsvindu.
  - Innfør den **dynamiske pollingen** over i Sporing-jobben for alle transportører, med samme regler.
  - Push ved statusendring (`delivered`, `at_pickup_point`, `delivery_time_changed`) til appen. Glimt bruker det i briefen.
- **Gjenkjenning:** nummer på formen `00370…`, `…SE/DK/NO/FI` eller 2 bokstaver + 9 sifre + SE/DK/NO/FI går automatisk til PostNord når man limer inn i Sporing.
- **Innstillinger → Integrasjoner → PostNord:** «Sporing uten konto og uten nøkkel». Ingen felt er påkrevd, og nøkkelfeltet er merket «valgfri». Teststatus: «OK · offentlig endepunkt».
- **Feil:** 404/tom sending gir «Ikke skannet ennå». Blir vi blokkert (403/429), venter vi lenger (2×) og viser «PostNord svarer ikke akkurat nå». Spør maks én gang per pakke per 15 min, og aldri om leverte pakker.
- Merk i koden at endepunktet ikke er offisielt dokumentert og kan endres. Ha en enkel helsesjekk som varsler admin hvis responsformatet endrer seg.
