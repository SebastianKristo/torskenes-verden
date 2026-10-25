# FinansHub iOS – nye funksjoner i prompt 51

Gjelder iPhone og iPad (Papir-stil, to–tre kolonner på brede skjermer). Krever at serveren er oppdatert til prompt 51
(FIN51, MEDFAM51 og WEBX51). Mangler en funksjon på serveren, viser appen «Serveren har ikke denne funksjonen ennå».

## Planlegging (Finans → Mer → Planlegging)
- **Sparemål**: mål med beløp, frist, farge og bilde. Fremdrift, «i rute / bak skjema», tempo per måned. «Sett inn» (minus = uttak),
  eller la målet følge en sparekonto. **Rund opp**: kjøpene siden sist rundes opp til nærmeste 5/10/20/50/100 kr og settes inn på valgt mål.
- **Kalender**: faste trekk, abonnementer og inntekter de neste 30/60/90 dagene med saldoprognose dag for dag, per konto eller alle.
  Varsel når saldoen går under null.
- **Skatt**: fradragsposter for inntektsåret (renter, reise, gaver, fagforening, BSU, IPS) med kilde og anslått verdi.
  «Det du vet best selv» fylles inn én gang. «Del CSV» og «Utskrift / PDF» åpner delingsarket. Påminnelse i mars og april kan slås av.
- **Priser**: prishistorikk fra kvitteringslinjer – hva som har økt, og hvilken butikk som er billigst for det du kjøper.
- **Abonnementsjeger**: prisøkninger, doble og ubrukte abonnementer. «Skriv oppsigelse» lager en tekst med lokal modell (sendes aldri automatisk) – «Kopier» og lim inn.

## Familiekalender med «hvem kjører?»
Familie (stripen under personene) eller Mer → Familiekalender. Hendelser fire uker frem, bringing/henting som oppgaver:
«Jeg kjører», «Si fra meg», velg sjåfør, «Gjort» og «Ruter-forslag» (krever et sted av typen hjem i Familie → Steder).
«Ny hendelse» øverst. «Vis familiekalenderen i Kalender» legger hendelsene inn i Kalender. Varsler om kjøring åpner siden.

## Media: «Hva skal vi se i kveld?»
Media (TV-knappen i toppen) eller Mer → «Hva skal vi se i kveld?».
- **I kveld**: forslag fra eget bibliotek og historikk. Velg hvem som ser på, lengde, sjanger og film/serie. «Formuler med lokal modell»
  endrer bare teksten. «Åpne» går til filmen/serien i Media, «Undertekster» sjekker norsk tekst.
- **Fortsett**: lydbøker og podkaster fra Audiobookshelf. Skriv brukernavnet ditt i Audiobookshelf hvis det er et annet.
- **Undertekster**: titler som mangler norske undertekster, med «Hent undertekster» (Bazarr).
- **Lagring** (bare admin): diskplass, «sett og stort», «Slett …» med bekreftelse – kan angres i 24 timer – og tøm papirkurven (skriv SLETT).

## Felles søk
Dra Hjem langt ned (lenger enn for å oppdatere), Mer → «Søk i alt», eller ⌘K på iPad med tastatur. Søker i gjøremål, handleliste,
kalender, kvitteringer, transaksjoner, familie, pakker, studie, chat og bursdager. Trykk på et treff gjør standardhandlingen
(f.eks. «Fullfør»), ⋯ viser de andre. Uten søketekst vises hurtighandlinger og nylige søk.

## Tema per bruker og automatisk tema
Innstillinger → Utseende. Lys, mørk og «Følg systemet» synkes nå mellom enhetene dine. **Automatisk** bytter etter soloppgang/solnedgang
(fra posisjonen din i Familie, ellers Oslo) eller faste klokkeslett. Liquid Glass er fortsatt et valg bare på denne enheten.

## Ny i familien (onboarding)
Admin lager invitasjonen på web (Innstillinger → Familie → Inviter). Den nye personen trykker «Har du fått en invitasjon?» på
innloggingen og skanner QR-koden (eller åpner lenken). Velg navn, brukernavn, passord og hva som deles (posisjon, helse sammen med
posisjon, kalender) – appen logger inn med en gang. QR-koden har bare en engangskode, aldri et token, og kontoen blir en vanlig bruker.

## Dyplenker
`finanshub://planlegging[/spar|kal|skatt|pris|jakt]` · `finanshub://familiekalender` · `finanshub://ikveld[/fortsett|subs|lagring]` ·
`finanshub://sok?q=melk` · `finanshub://tema` · `papir://join?i=…&c=…&srv=…` (invitasjon).

## Hva brukeren må gjøre
Ingenting i appen. Oppdater serveren (prompt 51). For Fortsett og Undertekster må Audiobookshelf og Bazarr være satt opp på serveren
(`ABS_URL`/`ABS_TOKEN`, `BAZARR_URL`/`BAZARR_API_KEY` i `.env`).
