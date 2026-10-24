# Finans: Planlegging (prompt 51, fase 2)

Planlegging er en ny side i FinansHub. Den samler sparemål, en kalender over faste trekk med saldoprognose, skattehjelp, prishistorikk og en abonnementsjeger. Siden bruker bare ditt eget regnskap, og ingenting sendes ut av huset. Den eneste AI-bruken er oppsigelsesteksten, og den skrives av den lokale modellen på hjemmeserveren.

**Her finner du den:**

- Nettleser (desktop): FinansHub → **Planlegging** i sidemenyen (`/finans/#/plan`).
- Mobil/PWA: Finans → **Mer** → **Planlegging** (`/finans/plan51`). Faner kan lenkes direkte: `#spar`, `#kal`, `#skatt`, `#pris` og `#jakt`.

## Sparemål

- Hvert mål har navn, beløp, frist og farge, og du kan legge til et bilde (JPEG, PNG eller WebP, maks 4 MB).
- Du ser hvor mye som er spart, hvor mye som gjenstår og hvor mye du må spare i måneden for å nå fristen. Du ser også om du er «I rute» ut fra tempoet de siste 90 dagene.
- **Sett inn** registrerer et innskudd. Et negativt beløp registreres som et uttak.
- **Følg en sparekonto:** da er «spart» lik saldoen på kontoen. Innskudd gjør du da i nettbanken, og målet oppdateres når transaksjonen er importert.
- **Rund opp:** kjøpene dine siden sist (maks 30 dager) rundes opp til nærmeste 5, 10, 20, 50 eller 100 kr. Med «Sett inn» legges differansen på målet du velger. De samme kjøpene blir ikke foreslått igjen.

## Kalender og saldoprognose

- Kalenderen viser trekk og innbetalinger de neste 30, 60 eller 90 dagene. Kildene er abonnementer, faste utgifter, gjentakende trekk som er funnet i transaksjonene, og lønn eller annen inntekt som kommer hver måned. Samme tjeneste telles bare én gang.
- Du ser saldoen dag for dag, både for hver konto og for alle kontoene samlet. Du får et varsel hvis en konto går i minus.
- Når et abonnement ikke har noen konto, brukes kontoen tjenesten vanligvis trekkes fra, og ellers den første brukskontoen. Legg til kontoer under Kontoer for å få riktig prognose.

## Skattehjelp

- Siden samler fradragsposter for inntektsåret: rentefradrag, reisefradrag (et anslag ut fra avstand og arbeidsdager), gaver til godkjente organisasjoner (minst 500 kr per organisasjon og maks 25 000 kr), fagforeningskontingent (maks 8 000 kr), BSU og IPS.
- Postene hentes fra transaksjonene dine. Det som ikke står der, legger du inn selv under «Det du vet best selv».
- Mangler renter på lån, lages et anslag fra Hjem → Bolig (lån × rente) når det er fylt ut.
- **Last ned CSV** åpner i Excel og Numbers. **Utskrift / PDF** åpner en utskriftsvennlig side, der du velger «Lagre som PDF».
- Påminnelser: fra 15. februar vises et banner. Du får et varsel 15. mars («skattemeldingen er klar») og 20. april («fristen nærmer seg»), én gang per år. Du kan slå av påminnelsene i skjemaet.
- **Forbehold:** alt her er anslag og ikke skatteråd. Satsene for 2026 er foreløpige (de samme som for 2025). Kontroller alltid i skattemeldingen på skatteetaten.no.

## Prishistorikk

- Prisene kommer fra varelinjene på kvitteringene dine (bokførte og de som venter på gjennomgang). Varenavnene normaliseres, slik at «TINE LETTMELK 1 L» og «Tine Lettmelk 1L» regnes som samme vare. Vektvarer får pris per kg.
- Butikkene samles per kjede, slik at «REMA 1000 Majorstuen» blir «REMA 1000».
- For hver vare ser du prisen over tid per butikk, en tekst som «Har økt 13,7 % siden mars 2025 hos REMA 1000» og hvilken butikk som er billigst. Øverst står butikken som er billigst for varene du faktisk kjøper. Det krever at minst tre varer er kjøpt i minst to butikker.

## Abonnementsjeger

- **Prisøkninger** finnes både i abonnementene (forrige pris) og i banktrekkene (siste trekk høyere enn de forrige).
- **Doble** er samme tjeneste registrert to ganger, flere tjenester som gjør det samme (musikk, skylagring, passordbehandler, VPN, lydbøker), eller to trekk fra samme tjeneste i samme måned.
- **Ubrukte** vises bare når det finnes et bruk-signal: «Jeg bruker den» i jegeren, eller avspilling på Plex eller Jellyfin for et Plex- eller Jellyfin-abonnement. Abonnementet regnes som ubrukt når det siste signalet er eldre enn N uker (standard 6). Abonnementer du har merket «Lite brukt» vises også.
- **Skriv oppsigelse** lager et utkast med den lokale modellen. Svarer ikke modellen, får du en ferdig mal. Teksten sendes aldri automatisk: du kopierer den og sender den selv.
- **Skjul** fjerner et funn. «Vis skjulte igjen» henter dem tilbake.

## Hva du må gjøre

Ingenting må settes opp. Etter en oppdatering er siden der. Data og påminnelser er per bruker, og alle brukerne har sin egen side.

For å teste lokalt:

```bash
npm test                           # alle testene
node --test test/p51-fin.test.js   # bare Planlegging
```

API-et er beskrevet i seksjon FIN51 i SERVER51-API.md: `/finans/api/fin51/*`. Det godtar både innlogget økt og FinansHub-token. Appklientene kommer i neste runde.
