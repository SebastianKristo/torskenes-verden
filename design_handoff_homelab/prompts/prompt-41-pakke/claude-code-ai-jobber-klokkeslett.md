# AI-innstillinger → Jobber: vis klokkeslett

Ønske 2026-10-20: «i jobber i ai innstligner vis klokkeslett» (skjermbilde: `vedlegg/ai-jobber-uten-tid.png`)
Fasit: `AI Kontroll.dc.html` → Jobber.

- Hver jobbrad får en tidskolonne til høyre (før Avbryt / Prøv igjen), IBM Plex Mono 11,5:
  - **Kjører:** «startet 17:31».
  - **I kø:** «lagt i kø 17:33», eller planlagt tid som før.
  - **Ferdig / feilet:** klokkeslett for når den sluttet («17:29»), og under i grått «4 min siden» / «2 t siden». Eldre enn i dag: «i går 21:14» / «18.10 21:14».
- Sammenslåtte feil («27 selvtester feilet …»): vis tidsrommet, f.eks. «16:02–17:20», og når den siste feilet. Utvidet liste viser tid per jobb.
- Bruk serverens tidsstempler (`ai_jobs.created_at`, `started_at`, `finished_at`) i brukerens tidssone. Oppdater «… siden» hvert minutt.
