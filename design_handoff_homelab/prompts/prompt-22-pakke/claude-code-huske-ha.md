# Til Claude Code: Synk Huskeliste med Home Assistant (To-do)

## Mål
Hver liste i Huskeliste (Hjem, Handel, Hytta …) kan kobles til en To-do-liste i Home Assistant (`todo.*`-entitet, f.eks. `todo.handleliste` fra Shopping List eller Local To-do). Synken går begge veier: legg til, fullfør, endre navn, frist og slett.

## UI (fasit: `design/Huskeliste.dc.html` → «SYNK MED HOME ASSISTANT»)
- Bryter «Synkroniser lister». Status til høyre: «Av», «Kobler til …», «Synket 19:44» eller «Feil · prøv igjen» (`--lab`).
- Én rad per liste: fargeprikk, navn, valgt entitet i mono (`todo.handleliste`) eller «Ikke koblet». Trykk → velger med alle `todo.*`-entiteter fra HA, pluss «Ikke koblet» og «+ Lag ny liste i HA».
- «↻ Synk nå».
- Samme innstillinger i Innstillinger → Integrasjoner → Home Assistant på web.

## Backend
1. Bruk eksisterende HA-tilkobling (URL + long-lived token, se Homelab → Hjem / Home Assistant). Lagre koblinger i `huske_ha_map(list_id, entity_id, user_id)`.
2. **Hent entiteter:** `GET /api/states`, filtrer `entity_id` som starter med `todo.`.
3. **Les:** WebSocket `{"type":"todo/item/list","entity_id":"todo.handleliste"}` → `items[{uid, summary, status: needs_action|completed, due, description}]`.
4. **Skriv:** service-kall
   - `todo.add_item` `{entity_id, item, due_date?, description?}`
   - `todo.update_item` `{entity_id, item: <uid eller summary>, rename?, status?, due_date?}`
   - `todo.remove_item` `{entity_id, item}`
5. **Sanntid fra HA:** abonner via WebSocket `{"type":"todo/item/subscribe","entity_id":…}`. Faller tilbake til `subscribe_events` / `state_changed` på entiteten og henter listen på nytt. Pushes til klientene via eksisterende SSE/WebSocket.
6. **Mapping:** lagre `ha_uid` på hver oppgave. Felt: `n ↔ summary`, `done ↔ status`, `due ↔ due` (dato), `who` → `description` («Tildelt: Ingrid»), siden HA ikke har tildeling.
7. **Konflikter:** sist endret vinner (`updated_at` lokalt mot HA-hendelsens tid). Sletting på én side sletter på den andre. Ved første kobling: slå sammen og fjern duplikater (samme tekst, store og små bokstaver likt).
8. **Offline:** endringer i appen legges i samme nettverkskø som kvitteringer og sendes når HA svarer igjen.

## Test
- Koble Handel → `todo.handleliste`. Legg til «Melk» i appen → dukker opp i HA innen 2 s.
- Si «Legg til egg på handlelisten» til HA Assist → dukker opp i appen og widgeten.
- Kryss av i HA → krysses av i appen. Slett i appen → borte i HA.
- HA nede → endringer køes og synkes når HA er oppe igjen. Status viser «Feil · prøv igjen» i mellomtiden.
