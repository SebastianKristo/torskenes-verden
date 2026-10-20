# FEIL: PostNord-sporing funker fortsatt ikke («Status ukjent · Kunne ikke oppdatere»)

Vedlegg: `uploads/Screenshot 2026-10-20 at 19.30.32.png`. Pakke `005731329019…` (PostNord, lagt inn manuelt): «Status ukjent», «Kunne ikke oppdatere · prøver igjen 20:21». Hendelseslista har bare våre egne linjer («Spores via PostNord (auto)», «(valgt)», «Lagt til i Sporing»). Det har aldri kommet et eneste svar fra PostNord.
Forrige forsøk: `claude-code-postnord-uten-nokkel.md` (ha-postnord, uten nøkkel).

## 1. Finn ut hva som faktisk feiler (gjør dette først)
- Logg **hele** kallet for denne pakken: URL, headere, HTTP-status, de første 500 tegnene av svaret og hvilket lag som feilet (klient / backend / PostNord). Vis det i Sporing → pakken → «Detaljer for feilsøking» (bare admin).
- Kjør samme kall med `curl` fra **serveren** (ikke nettleseren). Lim inn resultatet i loggen til oppgaven.
- Typiske årsaker, sjekk alle:
  1. **Kallet går fra appen/nettleseren** i stedet for backend, og blir stoppet av CORS. Alle transportørkall skal gå via `/api/sporing/track` på serveren.
  2. **Feil endepunkt:** utviklerportalens API (`api2.postnord.com/rest/shipment/v5/trackandtrace/findByIdentifier.json`) **krever `apikey`**, og gir 401/403 uten. Det offentlige endepunktet som postnord.no/postnord.se bruker i nettleseren, er et annet. Hent **nøyaktig** URL, parametere og headere fra ha-postnord-koden (`custom_components/postnord/`) eller Python-pakken `postnord-api`, og ikke gjett.
  3. **Headere mangler:** det offentlige endepunktet avviser kall uten nettleserlik `User-Agent`, `Accept: application/json` og `Origin/Referer: https://www.postnord.no`.
  4. **Nummerformat:** `00573…` er et **SSCC/kollinummer** (20 sifre med «00» foran). Noen oppslag vil ha det **uten** de to første nullene (18 sifre), andre med. Prøv i rekkefølge: slik det står → uten ledende `00` → som `itemId` i stedet for `shipmentId`. Lagre varianten som virket.
  5. **Land/locale:** prøv `locale=no`, så `en`. Svensk avsender (GS1-prefiks 73…) kan kreve oppslag mot PostNord SE. Bruk samme endepunkt med `countryCode=SE` hvis parameteren finnes.
  6. **Timeout/blokkering:** 403/429 fra PostNord betyr rate-limit. Følg reglene i forrige oppgave (maks 1 kall per pakke per 15 min).
- Svar 200 med tom `shipments`/`items` betyr «Ikke skannet ennå». Det er ikke en feil, og skal vises som det.

## 2. Reserve når PostNord ikke svarer
- Etter **2 mislykkede** PostNord-forsøk: prøv automatisk **ParcelsApp** (hvis nøkkel/kvote) og deretter **17TRACK**, og vis resultatet med merke «via ParcelsApp». Prøv PostNord igjen ved neste runde. Bytt tilbake når PostNord svarer.
- «Spor via»-raden viser hvilken kilde som ga sist vellykkede data.

## 3. Bedre feilmelding i kortet
Erstatt «Kunne ikke oppdatere» med årsaken:
- «Ikke skannet hos PostNord ennå. Prøver igjen 20:21.»
- «PostNord krever nøkkel for dette oppslaget. Legg inn nøkkel under Integrasjoner eller bruk ParcelsApp.» (401/403)
- «PostNord svarer ikke akkurat nå. Prøver igjen 20:45.» (5xx/timeout/429)
- «Fant ikke nummeret hos PostNord. Sjekk nummeret eller velg en annen transportør.» (404 på alle varianter)
Vis meldingen **én** gang (i dag står den både øverst og nederst). Fjern de interne linjene «Spores via PostNord (auto/valgt)» fra hendelseslista. De hører hjemme i «Detaljer for feilsøking».

## 4. Test
- Denne pakken (`005731329019…`): enten ekte hendelser fra PostNord, eller tydelig årsak + data fra reserve.
- Et kjent `00370…`-nummer og et `…SE`-nummer gir hendelser.
- Logg viser URL, status og variant for hvert kall.
