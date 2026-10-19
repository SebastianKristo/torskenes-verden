# Matplan: alltid delt mellom alle brukere

Ønske 2026-10-19: «del også alltid matplan mellom alle brukere».

## Regel
Matplanen er **én felles plan for hele husstanden** (alle brukere på serveren). Den er aldri privat og kan ikke slås av per bruker.

Gjelder:
- ukeplan (middag per dag + hvem lager)
- faste dager («alltid taco på fredag»)
- retter/oppskrifter med lenker og filer
- kokker
- handleliste fra matplanen

## Backend
- Tabellene `meal_weeks`, `meal_fixed`, `dishes`, `cooks` og `meal_shopping` har **ingen `owner_id`-filter** ved lesing. Bruk `household_id` (én husstand per server). Fjern eventuelle `WHERE user_id = ?` på disse.
- Migrering: slå sammen eksisterende private planer.
  - Retter dedupliseres på navn (case-insensitive). Lenker og filer slås sammen.
  - Ved konflikt på samme dag vinner nyeste `updated_at`. Den andre legges i `meal_history`.
  - Logg det som ble slått sammen.
- Alle endringer lagrer `updated_by` + `updated_at`.
- **Sanntid:** endringer sendes til alle klienter via SSE/WebSocket (`meal:changed`), så mobil og web oppdateres uten refresh.
- Samtidig redigering: optimistisk lås per dag (`version`). Ved konflikt tas siste versjon, og det vises en toast «Oppdatert av Nina».
- Rettigheter: alle innloggede brukere kan lese og endre. Gjester/barn med begrenset rolle kan bare lese (følger eksisterende rollemodell).

## UI (mobil + web, `Matplan.dc.html` / Mat i web)
- Fjern alle «Del matplan»/«Privat»-valg. Matplanen har ingen deleknapp.
- Liten tekst under tittelen: «Felles for husstanden · Endret av Nina 18.42».
- Hver dag kan vise en liten avatar for den som sist endret (valgfritt, diskret).
- Varsel (kan slås av i Varsler): «Kristoffer satte fredag til Taco».
- AI-ukeplan («Lag uke med AI») lager planen for hele husstanden og tar hensyn til alle kokker.

## Akseptkriterier
- [ ] Bruker A legger til en rett på tirsdag, og bruker B ser den med en gang på mobil og web.
- [ ] Faste dager og retter er like for alle brukere.
- [ ] Ingen innstilling kan gjøre matplanen privat.
- [ ] Eksisterende private planer er slått sammen uten tap.
