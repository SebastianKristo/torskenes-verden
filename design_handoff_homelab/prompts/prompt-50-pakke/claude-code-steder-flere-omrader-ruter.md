# Steder med flere områder, og Ruter henter Skole fra Steder

Ønske 2026-10-24: «i ruter så kan jeg velge skole soner, ta skole sonene fra steder her. la meg legge til fler soner i en sone.»
Design: `Familie Redesign.dc.html` 2a (4 · Steder og 4b · Sted med flere områder) og `Mobil Papir App.dc.html` (Ruter › Min reise).

## Datamodell (én kilde)
- `places (id, family_id, name, type: hjem|skole|jobb|annet, color, notify jsonb)`
- `place_areas (id, place_id, name, lat, lon, radius_m)`: et sted har 1..n områder.
- Migrer: hver eksisterende sone blir et sted med ett område. Ruters `school_zones` flyttes inn som områder i stedet med type **skole** (opprett «Skole» hvis det ikke finnes), og tabellen fjernes.
- «I stedet» = innenfor minst ett område. «Forlot stedet» = utenfor alle områder i minst 2 min (samme regel som skole i dag, nå for alle steder).

## Familie › Steder
- Kortet viser områdene som brikker («Skolen 150 m · Idrettshallen 80 m · Biblioteket 60 m») og «N her nå · 3 områder».
- Trykk → redigering (4b): kart med alle områdene som sirkler, liste med navn, radius (trykk for å endre, 25–1000 m) og ✕, «+ Legg til område på kartet» (trykk på kartet → sirkel → navn), type Hjem/Skole/Jobb/Annet, og en linje om hvem som bruker stedet (Ruter, varsler).
- Det siste området kan ikke fjernes (slett heller stedet).

## Ruter › Min reise
- Seksjonen heter «SKOLE · FRA FAMILIE › STEDER» og viser områdene i stedet med type skole, bare som visning (ingen ✕ eller + Sone).
- «Endre i Steder ›» åpner Familie på Steder-fanen med Skole valgt.
- Finnes ingen sted med type skole: «Ingen skole valgt · Legg til i Steder ›».

## Geofencing
- Én region per område (iOS `CLCircularRegion`, maks 20 totalt: prioriter Hjem og Skole, så nærmeste). Android Geofencing API.
- Endringer i Steder oppdaterer regionene på alle enhetene i familien.

## Test
- Skole med 3 områder: gå fra Skolen til Idrettshallen → ingen «forlot»-hendelse. Gå ut av alle → «forlot skolen» etter 2 min, og Min reise vises.
- Nytt område i Steder vises i Ruter uten omstart.
- Migrering: eksisterende Ruter-skolesoner havner i stedet Skole.
