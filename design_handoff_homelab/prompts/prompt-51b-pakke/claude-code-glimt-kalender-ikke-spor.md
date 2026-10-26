# FEIL: Glimt spør «Hvilken kalender?» i stedet for å legge inn avtalen

Ønske 2026-10-26: «jeg prøvde å spørre i ai søk at legg til i kalender at jeg og pappa skal se på dune på colosseum kino 17 desember kl 17:30. og den gir bare denne menyen som heller ikke er en bra meny, og slik melding i kalender appen funker ikke»
Vedlegg: `vedlegg/glimt-hvilken-kalender.png`. Fasit: `Glimt Kalender Svar.dc.html`.

**Valgt 2026-10-26: A.** Avtalen legges inn med en gang i standardkalenderen og bekreftes med kort A. Dette kortet brukes overalt: Hjem, Kalender-appen og Glimt-chat (C er samme kort i Kalender-appens farger). B er bare det som skjer når man trykker på kalender-pillen i A.
Bygger på `claude-code-glimt-kalender-standardkalender.md`. Den regelen er ikke fulgt.

## Hva som skjer i dag
1. Glimt svarer med tekst «Hvilken kalender? Personlig (Google) · Jobb · Studie · Familie · Helse · Bursdager» + samme liste som punkter.
2. Appen gjør teksten om til en **iOS-systemmeny** (UIMenu/confirmationDialog) over hele skjermen. Lista står da to ganger.
3. I Kalender-appen stopper det på samme spørsmål. Valget blir aldri lagt inn.

## Rett oppførsel
- **Ikke spør om kalender når brukeren ikke nevner en.** Bruk standardkalenderen (Innstillinger → Kalender → Standardkalender, nå Personlig (Google)). Spørsmålet skal bare komme hvis brukeren nevner en kalender som ikke finnes eller ikke kan skrives til.
- **Legg inn med en gang** og vis bekreftelseskortet (A):
  - «✓ LAGT I KALENDEREN», datoblokk (DES 17 tor), tittel «Kino: Dune», «17:30–20:15 · Colosseum kino», «Med pappa».
  - Piller: **kalender ▾** (fargeprikk + navn) og varsel. Knapper: «Åpne i Kalender» og «Angre» (10 s).
- **Bytte kalender (B):** trykk på pillen → lista folder seg ut **inne i kortet** (ikke systemmeny, ikke ark). Rader 44 pt med fargeprikk, navn og kilde; ✓ på valgt. Valget flytter avtalen med en gang (PATCH `calendarId`).
- **Forslag:** Nevner brukeren familie («pappa», «mamma», «Ingrid», «familien»), står Familie øverst med «Foreslått», men standard brukes til brukeren velger noe annet. Personer som er Homelab-brukere legges til som deltakere (`claude-code-kalender-deltakere-invitasjon.md`).
- **Kalender-appen (C):** samme motor og samme kort i Glimt-feltet. Ingen tekstspørsmål.

## Tolking av eksempelet
| Felt | Verdi |
|---|---|
| Tittel | «Kino: Dune» (aktivitet + film, stor forbokstav) |
| Sted | Colosseum kino, Fridtjof Nansens vei 6, Oslo (stedssøk) |
| Start | 17.12.2026 17:30 (neste 17. desember fra i dag) |
| Slutt | Filmens lengde fra TMDB (Dune: Part Two 2 t 46 min → 20:15), ellers 2 t |
| Deltakere | Pappa (fra Familie, hvis koblet) |
| Kalender | Standardkalender |
| Varsel | Kalenderens standard (1 t før) |

## Når spørsmål faktisk trengs
Bare for ting som mangler og ikke kan gjettes (f.eks. ingen dato). Da svarer Glimt med **ett kort spørsmål og knapper i kortet** («Hvilken dag?» · I dag · I morgen · Velg dato). Aldri en liste i teksten, aldri systemmeny. Modellen returnerer strukturert `{type:"ask", field, options[]}`, ikke fritekst.

## Implementasjon
- Verktøykall `calendar.create` får `calendarId` fra serveren (standard) når modellen ikke setter den. Valideringen skal aldri gi «velg kalender» tilbake til modellen.
- Fjern koden som parser «Hvilken …?»-tekst til `UIMenu`/`confirmationDialog`/Android `AlertDialog`.
- Samme endepunkt fra Hjem, Kalender-appen og Glimt-chat.

## Test
- Eksempelsetningen → lagt inn i Personlig (Google) tor 17. des 17:30–20:15, kort A vises, ingen meny.
- «… i familiekalenderen» → Familie, ingen spørsmål.
- «… i jobbkalenderen» når Jobb er skrivebeskyttet → kort med «Jobb er skrivebeskyttet. Legg i Personlig?» og to knapper.
- Bytt kalender i kortet → avtalen flytter seg (sjekk i Google).
- Samme setning i Kalender-appen → samme resultat.
