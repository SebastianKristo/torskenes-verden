# Til Claude Code: «Posisjon»-kortet på Hjem har feil design i appen

## Nå (feil)
- Overskrift «POSISJON» og lenke «Familie ›».
- Én kolonne. Svarte runde avatarer med én bokstav.
- Brukeren selv står to ganger («Sebastian», «Sebastian»).
- Nesten alle står som «Ukjent sted».

## Skal være (fasit: `Mobil Papir App.dc.html`, kort `h6`, og Hjem på web)
- **Topplinje:** `POSISJON · FAMILIE` til venstre (IBM Plex Mono 600, 10.5px, letter-spacing .12em, `--lab`), og `kart ›` til høyre (12px, `--mut`). Hele kortet åpner Familie → Kart.
- **Rutenett** med 2 kolonner (`grid-template-columns: repeat(2, minmax(0,1fr))`, gap 10px 12px). På brede skjermer/Fold: samme 2 kolonner som strekkes.
- **Avatar** 34×34, rund, med personens **egen farge** fra Familie (`member.color`). Den skal ikke være svart. Initialer er **2 bokstaver** (`Du`, `In`, `På`, `Ka`), Manrope 800 12px, hvit. Har personen profilbilde, vis bildet i stedet.
- **Statusprikk** 10×10 nede til høyre på avataren, med 2px kant i `--card`: grønn `#2f7a4f` = posisjon delt og fersk (< 15 min), gul `#d9a400` = eldre enn 15 min, grå `#8a8578` = deling av eller ukjent.
- **Tekst:** navn (13.5px, 700) og linje 2 (12px, `--mut`, ellipsis):
  - Inne i en sone → sonenavn (`Hjem`, `Skole`, `Mormor`).
  - I bevegelse → `Går · Bislett`, `I bil · Ring 3` (aktivitet fra bevegelsessensor + nærmeste sted/strøk).
  - Utenfor sone → strøk eller by (`Grünerløkka`, `Oslo`) via omvendt geokoding (Nominatim/Kartverket, cache 24 t).
  - Ingen posisjon → `Sist sett 14:32` hvis den finnes, ellers `Deler ikke posisjon`. «Ukjent sted» skal ikke vises.

## Data
1. Innlogget bruker vises først som **«Du»**, og listes bare én gang. Fjern duplikat ved å sammenligne `member.user_id === session.user_id`.
2. Rekkefølge: Du, deretter familiemedlemmer i rekkefølgen fra Familie → Personer.
3. Maks 4 personer på kortet. Flere enn 4 → siste rute blir `+N` som åpner Familie.
4. Hent fra `GET /api/familie/posisjoner` → `[{id, navn, farge, bilde, sone, aktivitet, sted, oppdatert}]`. Mangler endepunktet feltene `sone`/`sted`, legg dem til i backend (sone-match mot Familie → Soner, radius i meter).
5. Kortet skal se likt ut på iOS, Android, Fold og web.

## Test
Logget inn som Sebastian med Cybele og Rune i familien → kortet viser `Du`, `Cybele`, `Rune` (ingen duplikat), hver med egen farge og to-bokstavs initialer, sonenavn eller sted i stedet for «Ukjent sted», og `POSISJON · FAMILIE` / `kart ›` i toppen.
