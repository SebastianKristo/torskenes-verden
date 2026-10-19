# Sporing: API-nøkler deles i husstanden, pakker er private

Ønske 2026-10-19: «del også API-nøkler og slikt for sporing, ikke del sporingsnummeret og pakker, men API-nøkler.»

## Regel
- **Delt for hele husstanden (server-nivå):** alle integrasjonsnøkler og innloggingsoppsett for Sporing:
  - ParcelsApp API-nøkkel og kvote
  - PostNord / Posten (Bring) / Helthjem / DHL / UPS / Instabox / Porterbuddy API-nøkler
  - e-post-kilde for sporingsmail (IMAP/Gmail-tilkobling, hvis den er satt opp for husstanden)
  - webhook-hemmeligheter
  - Én admin legger dem inn, og alle brukere kan spore uten å legge inn egne nøkler.
- **Privat per bruker:** sporingsnumre, pakker, sendinger, historikk, hentekoder, varsler og «Klar for henting»-info. Andre brukere ser **aldri** dine pakker, heller ikke i søk, Glimt, widgets eller Hjem.

## Backend
- `tracking_credentials {provider, key_enc, scope:'household', added_by, updated_at}`, kryptert at rest (libsodium/AES-GCM med servernøkkel). API-et returnerer bare maskert verdi (`••••a91f`) og status (OK/feil/kvote).
- `shipments {id, user_id, number, carrier, …}`. **Alle** spørringer filtreres på `user_id = current_user`. Ingen admin-visning av andres pakker.
- Kvote: felles teller per leverandør (f.eks. ParcelsApp 20/mnd), og per bruker vises «Du har brukt 3 av husstandens 20 oppslag denne måneden».
- Rate limiting per bruker, så én bruker ikke tømmer kvoten (standard maks 50 % av kvoten per bruker, kan endres av admin).
- Migrering: nøkler som i dag ligger per bruker, flyttes til husstanden (nyeste gyldige vinner). Pakkene beholdes hos eieren.

## UI
- **Innstillinger → Integrasjoner → Sporing** (alle brukere): én rad per leverandør med logo, «Delt i husstanden · lagt inn av Sebastian», status-prikk og maskert nøkkel.
  - Admin kan **Endre / Fjern / Test**. Andre ser «Administreres av admin».
- **Sporing-siden:** under listen står en diskret linje: «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen». Ingen nøkkel-felt for vanlige brukere.
- Legg til sending: uendret og privat. Feltet «Del med …» finnes ikke for pakker.
- Hjem-widgeten «Pakker» viser bare egne pakker. Uten egne aktive pakker skjules den (se `claude-code-wiggle-krasj-ios.md`).

## Akseptkriterier
- [ ] Ingrid kan spore en pakke uten å ha lagt inn noen nøkkel.
- [ ] Sebastian ser ikke Ingrids pakker, hverken i Sporing, Hjem, søk eller Glimt («hva er på vei?»).
- [ ] Nøkkelen vises aldri i klartekst etter lagring, og vises aldri for ikke-admin.
