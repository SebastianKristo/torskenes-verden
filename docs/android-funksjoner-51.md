# FinansHub Android – nye funksjoner (prompt 51, runde 3)

Android-appen har fått Planlegging, familiekalenderen, de nye Media-sidene, felles søk, tema per bruker og onboarding for nye familiemedlemmer. Alt bruker server-API-ene fra prompt 51 (FIN51, MEDFAM51 og WEBX51). Web-versjonen oppfører seg likt.

## Planlegging (Finans → Mer → Planlegging)
Siden har fem faner:
- **Sparemål:** mål med beløp, frist, farge og bilde. Du ser fremdriften, hvor mye du må spare i måneden og tempoet ditt. Du kan **sette inn** (minus for uttak), **endre**, **bytte bilde** og **slette** (med bekreftelse). Et mål kan følge en sparekonto, og da er saldoen det som er spart.
  **Rund opp** viser hvor mye kjøpene siden sist ville blitt rundet opp. Du velger trinnet (5–100 kr) og målet, og trykker **Sett inn**. Selve overføringen gjør du i nettbanken.
- **Kalender:** faste trekk og inntekter de neste 30, 60 eller 90 dagene, med saldoprognose per konto eller samlet. Grafen markerer den laveste saldoen, og varsler vises i rødt.
- **Skatt:** fradragsposter med kilde. Du får påminnelse før skattemeldingen og fristen, og **Del CSV** og **Utskrift / PDF** lagrer filen via delingsmenyen. Under «Det du vet best selv» fyller du inn reiseavstand, renter, BSU, IPS og gaver.
- **Priser:** prishistorikk fra varelinjene i kvitteringene. Du kan søke og sortere, og trykker du på en vare, får du en graf per butikk. Kortet «Billigste butikk» sammenligner butikkene for det du faktisk kjøper.
- **Abonnementsjeger:** viser prisøkninger, doble abonnementer og abonnementer du ikke bruker. Knappene er **Jeg bruker den**, **Skjul** og **Skriv oppsigelse**. Oppsigelsen skrives av den lokale modellen og sendes aldri automatisk. Trykk **Kopier** for å bruke teksten.

Dyplenke: `finanshub://plan/spar|kal|skatt|pris|jakt`. Skattevarselet åpner Skatt-fanen.

## Familiekalender (Familie → kortet «Familiekalender»)
Her ser du hendelsene de neste fire ukene, med **bringing** og **henting** som oppgaver.
- På hver oppgave kan du trykke **Jeg kjører**, **Si fra meg**, **Sjåfør** (velg et familiemedlem), **Ruter-forslag** (når du må gå), **Gjort** og **Slett**.
- **Hvem kjører?** viser kjøringene de neste dagene, og hvilke som mangler sjåfør.
- **+ Ny hendelse** lager en hendelse med tittel, dato, tid, sted, hvem den gjelder og om den trenger bringing eller henting.
- **Vis familiekalenderen i Kalender** legger hendelsene inn i Kalender-appen.

Varslene «Du kjører …» og «Hvem kjører?» åpner siden.

## Media (raden under fanene i Media)
- **✦ I kveld:** forslag fra ditt eget bibliotek. Du filtrerer på lengde, film eller serie, sjanger og hvem som ser på. Hjemme-statusen i Familie er valgt fra start. Trykk på et forslag for å åpne det i Media.
- **Fortsett:** lydbøker og podkaster fra Audiobookshelf, med fremdrift og tid igjen. Første gang skriver du brukernavnet ditt i Audiobookshelf.
- **Undertekster:** filmer og episoder som mangler norsk tekst. **Hent undertekster** ber Bazarr om å lete.
- **Lagring** (bare for admin) viser:
  - disker og plass per tjeneste
  - forslag til sletting («sett og stort»). **Slett …** spør først, og under «Slettet nylig» kan du **angre** i 24 timer.
  - **Tøm papirkurven**, som bare sletter filer som er eldre enn 24 timer, og bare etter at du har bekreftet.

## Felles søk
- Når du skriver i søkefeltet på **Hjem**, vises de tre beste treffene fra hele Homelab under feltet. **Søk i alt ›** åpner den store søkesiden.
- Søkesiden åpnes også fra profilmenyen (**Søk i alt**) og med `finanshub://sok`. Treffene er gruppert etter type, og ordene som traff er uthevet.
- Hvert treff kan ha opptil tre handlinger, for eksempel **Fullfør**, **Kopier** eller **Åpne**. Handlinger som sletter noe, spør først.
- Med tomt felt ser du hurtighandlinger og nylige søk. **Tøm** sletter de nylige søkene.

## Tema på alle enheter
Gå til **Innstillinger → Utseende**, og velg **Automatisk tema** eller et av de vanlige valgene:
- **Papir · lys**, **Papir · mørk** og **Følg systemet** lagres nå på kontoen, og følger deg til web og iPhone.
- **Automatisk – etter solen:** mørkt fra solnedgang til soloppgang. Posisjonen kommer fra Familie, ellers brukes Oslo. Appen regner ut tidene selv, så det virker også uten nett.
- **Automatisk – faste klokkeslett:** for eksempel lyst fra 07:00 og mørkt fra 21:00.
- **Liquid Glass** gjelder fortsatt bare den ene telefonen.

Har du endret temaet på to enheter, gjelder det du endret sist.

## Ny i familien (invitasjon)
1. Admin lager en invitasjon på web og får en QR-kode eller en lenke.
2. Den nye personen åpner appen og trykker **Jeg har en invitasjon** på innloggingen. Så skanner hun QR-koden eller limer inn lenken. Hun kan også skanne koden med kameraet, som åpner appen direkte (`papir://join?…`).
3. Hun skriver navn, brukernavn og passord (minst 8 tegn), og velger hva hun vil dele: posisjon, helse og kalender. Helse kan bare deles sammen med posisjon.
4. Når hun trykker **Ferdig – logg inn**, er hun logget inn.

QR-koden inneholder bare en engangskode og serveradressen, aldri en innlogging. Koden kan bare brukes én gang.

## Hva brukeren må gjøre
- Oppdatere serveren til prompt 51, så endepunktene `/finans/api/fin51`, `/api/famcal51`, `/api/media51`, `/api/search51`, `/api/me/theme51` og `/api/onboard51` finnes.
- For Media: sette opp Bazarr og Audiobookshelf som valgfrie containere. Se `docs/media-familie-51.md`.
- Bygge appen: `cd apps/android && ./gradlew assembleDebug` (eller `assembleRelease`).
