# Gratis prøveperioder: «påminn meg om å avslutte» + varsel

Fasit:
- Uten AI: `Abonnement Legg til ark.dc.html` → nytt valg **Gratis prøveperiode** (med ✦ AI-merke).
- Med AI: `Mobil Papir App.dc.html` → søkefeltet på Hjem (System-AI) og Chat. Prøv: «Viaplay gratis i 14 dager, påminn meg om å avslutte» eller «Storytel prøve til 25.11, 179 kr».
Bakgrunn: en av brukerne starter ofte gratis prøver og glemmer dem.

## Uten AI (skjema)
- Legg til abonnement → **Gratis prøveperiode** → ark «Prøveperiode» · «Vi minner deg på å avslutte før den blir betalt.»
- Øverst: felt **✦ Skriv det med egne ord** + «Fyll ut» (tolker teksten og fyller feltene under). Kan hoppes over.
- Felter: Tjeneste · Prøven slutter (dato) · Pris etterpå.
- **VARSLE MEG** (flervalg): Samme dag · 1 dag før (standard) · 3 dager før · 1 uke før.
- **Forhåndsvisning av varselet** (som iOS-banner): «HOMELAB · fre 31. okt 09:00» / «Viaplay-prøven slutter i morgen» / «Avslutt før lør 1. nov for å slippe 149 kr/mnd. Trykk for å åpne oppsigelsessiden.»
- **Lagre påminnelse** (rød).

## Med AI
- Gjenkjenn intensjon: prøve/prøveperiode, gratis, avslutt, si opp, oppsigelse, trial.
- Tolkning: tjeneste (kjent liste: Viaplay, Netflix, HBO Max, Disney+, Spotify, TV 2 Play, Storytel, BookBeat, Apple TV+, YouTube Premium, Amazon Prime, Audible, Strava, Tidal, ChatGPT … ellers første ord med stor forbokstav), varighet («14 dager», «1 uke», «en måned») eller dato («25.11»), pris («179 kr»). Mangler noe → spør kort i boblen/Chat.
- Søkefeltet: svarboble «Jeg minner deg på å avslutte Viaplay **fredag 31. oktober kl. 09**, dagen før prøven slutter lørdag 1. november.» · kilde «Abonnementer · varsel planlagt».
- Chat: verktøy-chip «Abonnementer» + samme setning.
- Standard varsel: 1 dag før kl. 09:00.

## Varsling
- Push til brukeren som la den inn (APNs/FCM), til valgte tidspunkter. Tittel «Viaplay-prøven slutter i morgen», tekst «Avslutt før … for å slippe 149 kr/mnd.»
- Handlinger på varselet: **Avslutt nå** (åpner oppsigelsessiden for tjenesten, kjente lenker i en tabell), **Behold** (gjør den om til vanlig abonnement), **Minn meg i morgen**.
- Prøven vises i Subscription OS med merke «Prøve · 12 dager igjen» og i Kalender som heldagshendelse på sluttdato.
- Ingen respons innen sluttdato → siste varsel kl. 18 på sluttdagen.

## Backend
- Tabell `trials {id, user_id, service, ends_at, price_after, remind_offsets_days[], status: active|cancelled|kept}`.
- `POST /api/subscriptions/trials`, `PATCH …/{id}` (status), scheduler som sender push. AI-ruten bruker `POST /api/assist` → intent `trial.create`.
