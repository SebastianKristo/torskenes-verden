# Finans: overstyr butikklogo (mobil + web)

## Hva
La brukeren bytte logo på en butikk/forhandler i Finans når den automatiske logoen er feil eller mangler.

## Hvor
- Mobil (iOS + Android): trykk på butikklogoen i transaksjonsdetaljer eller på butikksiden → ark «Endre logo».
- Web: klikk på logoen i transaksjonspanelet / butikkraden → samme ark som modal/sidepanel.

## Arket «Endre logo»
1. Søkefelt øverst: «Søk etter butikk», forhåndsutfylt med butikknavnet.
2. Resultatliste fra logo-databasen: logo (40×40, rund 10px) + navn + domene. Søket går mot **alle** butikker i databasen, ikke bare de brukeren har handlet hos.
3. Valg nederst: «Last opp eget bilde» og «Bruk initialer (standard)».
4. Trykk på et treff → forhåndsvisning → «Bruk denne logoen».
5. Hvis logoen allerede er overstyrt: vis «Tilbakestill til automatisk».

## Database / backend
- Søk: `GET /api/finans/logos?q=…` → `[{ id, name, domain, logoUrl }]`. Søk på navn, alias og domene, ufølsomt for store/små bokstaver og æ/ø/å. Debounce 250 ms.
- Kilder: egen logotabell (samme logobibliotek som abonnement/aksjer), deretter domene-favikon/logo-tjeneste som fallback. Cache bilder lokalt via backend-proxy.
- Overstyring lagres per butikk (merchant-ID / normalisert butikknavn), ikke per transaksjon: `PUT /api/finans/merchants/{id}/logo { logoId | uploadId | null }`.
- Gjelder alle eksisterende og fremtidige transaksjoner fra samme butikk, synkes mellom mobil og web.
- Opplastede bilder: beskjær til kvadrat, maks 512×512, lagres på serveren.

## Visning
Overstyrt logo brukes overalt i Finans: lister, kvitteringer, statistikk, Glimt-kort og søk.

## Design
Se `Lagre og logo.dc.html` (1a mobil, 1b web).

## Stil
Papir-designet (som Homelab Papir): bakgrunn #f3efe6, kort #fff, kant #d8d1c2, tekst #1b1a17, dempet #8f897c, aksent #b23a2a. Overskrift Newsreader, brødtekst Manrope, små etiketter IBM Plex Mono med store bokstaver. Primærknapp mørk (#1b1a17 / #f3efe6). Ikke mørkt glass-tema.

Lagt inn i `FinansHub v3 Temaer.dc.html` (papir-Finans): trykk på logoen i transaksjonspanelet → «Endre logo». Overstyringen brukes i transaksjonslisten og panelet, lagres per butikknavn (prototype: localStorage `fh_logo_ov`; i appen: server).
