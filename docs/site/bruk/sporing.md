# Sporing

Sporing samler pakkene dine på ett sted. På web er det fanen **Sporing**, og i appene er det en egen fane.

![Sporing på web](../assets/homelab-sporing.webp){ loading=lazy }

## Hvordan pakkene kommer inn

| Kilde | Hvordan |
|---|---|
| **E-post** | Sporingsnumre hentes fra e-postene i IMAP-mappen din, se [Integrasjoner → IMAP](integrasjoner.md#imap-og-proton-mail-bridge) |
| **Finn** | Fiks ferdig-handler får sporingsnummeret automatisk |
| **Manuelt** | Lim inn sporingsnummeret og trykk **Spor** (web), eller **Ny sending** (app). I iOS-appen kan du skanne strekkoden. |

Kildene E-post og Finn kan slås av og på under Sporing → Kilder. Pakker som allerede er levert, går rett til **Arkiv**. Med «Arkiver automatisk» arkiveres leverte pakker etter 3 dager.

## Transportører

Transportøren gjenkjennes ut fra sporingsnummeret:

| Transportør | Statuskilde | Nøkkel |
|---|---|---|
| **Posten** og **Bring** | Mybring | Ja, gratis. Se [Integrasjoner → Mybring](integrasjoner.md#mybring-posten-og-bring) |
| **PostNord** | PostNords offentlige sporing, eller API med nøkkel | **Nei**, nøkkel er valgfri. Se [PostNord](integrasjoner.md#postnord) |
| **DHL** | DHL Unified Tracking | `DHL_API_KEY` |
| **UPS** | UPS Tracking (OAuth) | `UPS_CLIENT_ID` og `UPS_CLIENT_SECRET` |
| **Helthjem, Budbee, Instabox, GLS, FedEx …** | 17TRACK eller ParcelsApp | `TRACK17_API_KEY` eller ParcelsApp-nøkkel |
| Alle | **ParcelsApp** som siste reserve | Ja. 3 oppslag i måneden på gratisplanen. |

Uten nøkkel for en transportør får pakken en «Åpne hos …»-lenke, men statusen oppdateres ikke automatisk.

## Overstyre transportøren («Spor via»)

Noen ganger gjenkjennes feil selskap, eller du vil bruke ParcelsApp direkte.

- **Ny pakke:** velg **Auto** (gjenkjent) eller en bestemt tjeneste: Posten, Bring, PostNord, DHL, Helthjem, UPS, Budbee, Instabox eller ParcelsApp.
- **Eksisterende pakke:** hold inne på pakken → **Spor via** → velg tjeneste.

Valget lagres på pakken, og tidslinjen får hendelsen «Spores via … (valgt)». Nye e-poster om pakken endrer ikke valget. Med **ParcelsApp** valgt hentes status bare når du selv ber om det (ny pakke, Spor via eller Oppdater), så kvoten spares.

## Status og oppdatering

- Status sjekkes straks pakken er funnet, og deretter jevnlig. Pakker på vei sjekkes oftere enn pakker som bare er registrert.
- Kortet viser siste hendelse, tidslinjen (Registrert → Hentet → I transport → Klar for henting / Levert), og eventuell feilmelding fra kilden.
- Butikkens logo vises med et lite merke for fraktselskapet. Tittelen er varen eller butikken, ikke sporingsnummeret.
- **Varsler:** velg selv under Sporing → Varsler (funnet, ute for levering, klar for henting, levert, forsinket).
- **Flere på en gang:** velg flere og arkiver eller slett dem.

## Eksempel med API

```bash
# Legg til en pakke og tving PostNord
curl -s https://os.example.no/api/tracking \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"trackingNo":"00370726201234567","name":"Komplett · skjerm","carrierOverride":"postnord"}'

# Hvilken transportør gjenkjennes?
curl -s "https://os.example.no/api/tracking/detect?no=CV704411234NO" -H "Authorization: Bearer $TOKEN"
```

Flere eksempler står i [API](../utvikling/api.md#sporing).
