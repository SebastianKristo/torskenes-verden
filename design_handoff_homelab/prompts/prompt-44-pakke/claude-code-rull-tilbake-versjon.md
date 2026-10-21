# Innstillinger (web + mobil): rull tilbake til en tidligere versjon

Ønske 2026-10-21: «i innstillinger på web og mobil la meg rulle tilbake, installere en tidligere versjon.»

## Plassering
Innstillinger → **Oppdateringer** (der «Automatiske oppdateringer» og «Oppdater nå» ligger). Ny seksjon **TIDLIGERE VERSJONER** under gjeldende versjon.

## UI
- Øverst: «Du har **Nordlys 4.38** · installert i dag 13:52» + «Hva er nytt».
- Liste med de siste **10 versjonene** (nyeste først). Hver rad: versjonsnummer (mono), dato, 1 linje fra endringsloggen, merkelapp **Forrige** på den du hadde før, **Har backup** når det finnes en backup tatt rett før oppdateringen. Knapp **Installer**.
- Trykk **Installer 4.37** → ark:
  - «Gå tilbake til Nordlys 4.37?»
  - Valg (radio):
    1. **Behold dataene mine** (standard) · bare koden byttes. Bare mulig når databasen er kompatibel (se under).
    2. **Gjenopprett backup fra 21. okt 13:50** · data tilbake til slik de var før oppdateringen. Advarsel: «Endringer etter 13:50 forsvinner (3 gjøremål, 1 hendelse).»
  - Avkrysning «Slå av automatiske oppdateringer i 7 dager» (på som standard, så den ikke oppdaterer seg rett tilbake).
  - Knapp **Installer 4.37** (rød). Krever Face ID / passord. Bare admin eller eier.
- Under installasjonen: samme fremdriftskort og oppstartsskjerm som ved vanlig oppdatering (se `claude-code-oppdatering-hopper-mellom-skjermer.md`), med tittel «Går tilbake til 4.37».
- Etterpå: toast «Kjører Nordlys 4.37 · automatiske oppdateringer er av til 28. okt» + **Oppdater til 4.38 igjen**.
- Mobil: samme liste og ark (bunnark). Web: liste + dialog.

## Server
- Behold Docker-bildene for de siste 10 versjonene (`ghcr.io/…/nordlys:4.37` osv.), og ta en **automatisk backup** av database + config rett før hver oppdatering (behold de siste 5).
- `GET /api/update/versions` → `[{version, date, notes, image, hasBackup, dbSchema, compatible}]`.
- `POST /api/update/rollback {version, restoreBackup: bool, pauseAutoDays: 7}` → samme updater-tjeneste som oppdateringer bruker: hent bildet, (gjenopprett backup), bytt container, sjekk helse, og meld status.
- **Databasekompatibilitet:** hver versjon har `dbSchema`. Er gjeldende skjema nyere enn målversjonen, kjør ned-migrasjoner hvis de finnes. Hvis ikke, er «Behold dataene mine» grået ut med forklaringen «4.38 endret databasen. Du må gjenopprette backupen.»
- Feiler tilbakerullingen (helsesjekk ikke ok innen 90 s), gå automatisk tilbake til versjonen man kom fra og vis «Kunne ikke gå tilbake · kjører 4.38 som før» + logg.
- Mobilappen og web-klienten må tåle eldre serverversjon: hvis appen er nyere enn serveren, vis «Serveren kjører 4.37. Noen nye funksjoner er skjult.» og skjul funksjoner serveren ikke støtter (`/api/version` → `features`).
- Logg `update.rollback from=4.38 to=4.37 restore=false by=sebastian result=ok ms=…`.

## Tegnet (2026-10-21)
Ønske: «tegn det også». Fasit: `Tidligere Versjoner.dc.html` (web til venstre, mobil til høyre, klikkbar: Installer → dialog med Behold data / Gjenopprett backup, pause 7 dager, fremdrift, toast med «Oppdater til 4.38 igjen»).

## Plassering i den ekte appen (2026-10-21)
Ønske: «legg det inn her» (vedlegg `uploads/Screenshot 2026-10-21 at 14.53.50.png`: Innstillinger → SERVER → **System** med «4.22 · Oppdatering tilgjengelig · NordlysOS», «Oppdater nå», Programvareversjon, «Krev passord for å oppdatere»).
- Seksjonen **TIDLIGERE VERSJONER** legges på **System**-siden, rett **under** bryteren «Krev passord for å oppdatere» og teksten «Oppdateringen gjøres av updater-containeren …», og **over** «Dette er Nordlys 4.22 …» / «NYTT I …».
- Samme stil som resten av siden: rød mono-etikett med strek under, liste i kort (versjon i mono, dato, én linje fra endringsloggen, merkelappene «Forrige» og «Har backup», knapp **Installer** / «Kjører nå»). Layout og dialog som i `Tidligere Versjoner.dc.html`.
- «Krev passord for å oppdatere» gjelder også tilbakerulling.
- Tilbakerulling bruker samme updater-container og samme fremdrift/oppstartsskjerm som «Oppdater nå». Det store versjonskortet øverst viser «Går tilbake til 4.21» mens det pågår.
- Mobil: Innstillinger → System (eller Oppdateringer) får samme seksjon på samme sted.
