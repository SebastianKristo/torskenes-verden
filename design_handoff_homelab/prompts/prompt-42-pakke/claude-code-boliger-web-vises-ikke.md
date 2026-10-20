# FEIL: nytt Boliger-design (2a + 1b) vises ikke i FinansHub web

Vedlegg: `uploads/Screenshot 2026-10-20 at 19.01.12.png`. FinansHub web → Boliger viser fortsatt den gamle siden: boligkort til venstre med «Bare deg / Du: eier / 0 kr i år», tallkort «Brukt i år / Snitt per måned / Strøm i år / Kategorier», «Utgifter per måned», «Prosjekter», «Faste regninger» og «+ Ny bolig i Innstillinger».
Det nye designet skal være der: `claude-code-boliger-web-forside-2a.md` (forside) og `claude-code-boliger-web-kontobok.md` (inne i en bolig). Fasit: `Boliger Web v2.dc.html` → 2a og 1b.

## Sannsynlig årsak
Det finnes **to Boliger-sider** i koden. Den nye ble laget i en annen komponent eller rute (f.eks. Homelab-appen eller mobil `Boliger`-komponenten), mens FinansHub web fortsatt bruker den gamle siden.

## Gjør dette
1. **Finn den gamle siden:** søk i web-koden etter tekstene på skjermbildet: `Ny bolig i Innstillinger`, `Utgifter, prosjekter og regninger per bolig`, `Snitt per måned`, `Strøm i år`, `Du: eier`, `Bare deg`. Filen som treffer, er siden som faktisk vises på `/finans/boliger` (typisk `web/src/pages/finans/Boliger.tsx`, `BoligerPage`, `HomesView` e.l.).
2. **Sjekk ruten:** se i routeren hvilken komponent `/finans/boliger` (og menypunktet «Boliger» i FinansHub-sidemenyen) peker på. Pek den til den nye forsiden (2a), og legg til `/finans/boliger/:id` → Kontobok (1b).
3. **Erstatt, ikke legg ved siden av:** slett eller arkiver den gamle komponenten (`BoligerLegacy` bak `?gammel=1` i én versjon hvis ønskelig), så det bare finnes én Boliger-side på web. Fjern feature-flagg som skjuler den nye (`NEW_HOMES`, `homesV2` e.l.), eller sett dem på som standard.
4. **Bygg og deploy web:** kjør web-bygget på nytt og deploy (Docker-image / `npm run build` + restart). Sjekk at bygget faktisk inneholder den nye koden (søk etter «Dette må gjøres» i `dist/`).
5. **Cache:** tøm service worker / PWA-cache (øk `CACHE_VERSION`, `skipWaiting()` + `clients.claim()`), og sett `Cache-Control: no-cache` på `index.html`. Test med hard reload (⌘⇧R) og i et privat vindu.
6. **Data:** den nye siden henter `GET /api/boliger/oversikt?year=2026`. Sjekk at endepunktet finnes på serveren som web snakker med (lokal og ekstern adresse). Svarer det 404, faller siden ikke tilbake til den gamle. Den viser feilmelding.

## Ferdig når
- FinansHub web → Boliger viser 2a: «Boliger», «4 boliger · … brukt hittil i år», «Dette må gjøres» (når det finnes noe), fire boligkort med **Åpne …**-knapp og «+ Legg til bolig».
- **Åpne Strømstad** gir 1b Kontobok for Strømstad. «‹ Alle boligene» tilbake.
- Ingen av tekstene fra den gamle siden finnes lenger i web-koden (sjekk med søk).
- Samme resultat lokalt og eksternt, etter hard reload og i privat vindu.

## Merk
Beløpene står som «0 kr i år» på alle boligene, selv om Strømstad har en utgift (Blomsterlandet 2 058 kr, 26.04). Sjekk at utgiftene er koblet til boligen (`home_id` på utgift/kvittering) og at summen regnes for riktig år, og ikke bare for transaksjoner fra banken.
