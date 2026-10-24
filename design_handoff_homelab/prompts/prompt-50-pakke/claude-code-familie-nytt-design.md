# Familie: nytt design (alle plattformer)

Ønske 2026-10-24: «kom opp med helt nytt deisgn for alle sidene i familie …» → valgt kombinasjon: «jeg likte disse».
Design: `Familie Redesign.dc.html`, seksjon **2a**. Klikkbar fasit i appen: `Familie App.dc.html` (åpnes fra Familie i `Mobil Papir App.dc.html`, fullskjerm med egen fanelinje). Data og funksjoner er de samme som i dag (posisjon, sensorer, soner, Helse, Vel fremme). Bare oppsett og navigasjon endres.

## Navigasjon
Fanelinje nederst (mørk pille som i dag): **Folk · Steder · Helse · Fremme**. Folk er startsiden. Tilbake-sveip og «‹ Hjem» som ellers i appen.

## 1. Folk (startside) – fra 1a
- Overskrift «Familie», under: «4 personer · oppdatert nå». Knapp + (ny sone / inviter).
- 2×2 rutenett med ett kort per person: avatar, batteripille (grønn; rød bakgrunn under 25 %, ⚡ ved lading), navn, **sted** stort i Newsreader (sonenavn, «På vei», «I bil» eller stedsnavn), og under: «siden 08:05» / «går · 4,8 km/t» / «38 km/t · nær Mormor».
- Kort med lavt batteri får rød kant.
- Kartstripe (120 pt) med alle personer og knappen «Åpne kart».
- «I DAG»: siste hendelser (kom/forlot sone) med tid. Hver rad har personens profilbilde (28 pt, rundt; initialer i personens farge som reserve) foran teksten.
- Trykk på et kort → Personside.

## 2. Kart – fra 1b
- Kartet fyller skjermen. «‹ Familie» og «finn meg»-knapp øverst.
- Ark nederst (dras opp/ned) med «4 personer» og rader: avatar, navn, «sted · tid», batteri og avstand fra deg.
- Personer utenfor utsnittet: merkelapp i kanten, f.eks. «Kari · 7,4 km sør ↓». Trykk sentrerer på personen.
- Trykk på rad eller nål → Personside.

## 3. Personside – fra 1b
- Kart sentrert på personen med nøyaktighetssirkel. Ark med: stort navn, «Går · 4,8 km/t · forlot Hjem 09:00».
- Tre knapper: **Ring**, **Melding**, **Veibeskrivelse** (åpner Apple Kart / Google Maps).
- 2×2-kort: Batteri (lader/lader ikke), Nøyaktighet (enhet), Skritt i dag (mål), Søvn (hvilepuls).
- «SKRITT · SISTE 7 DAGER» med søyler, i dag mørkest.
- Helse vises bare hvis personen deler med deg. Ellers: «Kari deler ikke helse med deg».

## 4. Steder – fra 1a
- Kort per sone: farget ikon, navn, «N her nå» / «Ingen her nå», avatarer for hvem som er der.
- Linje med bjelle: hvem som varsles («Varsler når Ingrid og Pål kommer og drar») og «Endre».
- «+ Nytt sted» (stiplet knapp) → plasser på kart med radius.

## 5. Helse – fra 1c
- Overskrift «Helse» og en setning som oppsummerer: «Ingrid har nådd målet. Du mangler 1 580 skritt.» (generert fra tallene, ikke AI).
- Ett kort per person: navn, skritt i dag, søvn, og søyler for siste 7 dager (i dag i personens farge, resten lys).
- Personer som ikke deler: nedtonet med «Ikke delt».
- Hvert kort viser også søvn, hvilepuls og aktive kalorier, og har ›. Personer som ikke deler: «Deler ikke helse med deg · Be om deling ›».
- Trykk på kort → **Helse for personen** (5b).

### 5b. Helse for personen
- «‹ Helse» og «Posisjon ›» (går til Personside).
- Avatar, navn, «I dag · enhet · kilde».
- Stort kort: skritt i dag, merke «Målet nådd», søyler for 7 dager med stiplet mållinje og dagnavn, «Snitt denne uken · nådd målet N av 7 dager».
- 2×2: Søvn i natt (leggetid–våknet), Hvilepuls (puls nå), Aktive kalorier, Batteri.
- Linje om hva personen deler med deg, med «Deling ›».

## 6. Sjekk inn (erstatter Vel fremme)
Ønske: «vel fremme er mer en check in løsning, feks er på fest eller bursdag la meg sended check in til et familiemedlem,»
Fanen heter **Sjekk inn**.
- **Hvor:** forslag fra kalender + posisjon («Bursdag hos Mari · Nordstrand · ± 12 m»), eller nærmeste sted/adresse. «Endre» for å velge selv.
- **Hva vil du si?** Hurtigvalg: «Er på bursdag/fest, alt bra» (tilpasses hendelsen), «Er framme», «Blir sent», «Hent meg», eller egen tekst.
- **Til:** velg ett eller flere familiemedlemmer (avatar med ✓).
- **Minn meg på å sjekke inn igjen** (valgfritt klokkeslett).
- Hovedknapp «Sjekk inn til <navn>». Sekundært: «På vei hjem» (dagens Vel fremme-tur med ETA og varsel hvis sen) og «Be noen sjekke inn» (sender forespørsel; mottaker svarer med ett trykk fra varselet).
- **Etter sending (6b):** mørkt kort «Sjekket inn 19:42 · Sett av Ingrid», meldingen og stedet, påminnelse, knappene «Hent meg» og «Sjekk inn igjen».
- **I dag i familien:** logg over innsjekker og forespørsler med profilbilde, tekst, sted og tid. Ubesvarte forespørsler markeres «Venter» i rødt.
- Mottaker får push med sted og melding, og kan svare «👍 / Ring / Hent». Posisjonen deles bare i selve innsjekken (ikke kontinuerlig).
- «Hent meg» sender høy-prioritets varsel med posisjon til valgte personer.

## Fold og iPad
To kolonner: venstre = Folk-kortene (eller listen på aktiv fane), høyre = kart eller personside. Bruker hele bredden.

## Test
- Alle fire faner på iOS, Android og web. Tilbake fra Personside går til der du kom fra (Folk, Kart eller Helse).
- Person med lavt batteri, person som ikke deler helse og person utenfor kartutsnittet vises riktig.
