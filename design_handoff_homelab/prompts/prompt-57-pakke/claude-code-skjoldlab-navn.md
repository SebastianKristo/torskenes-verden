# Nytt navn: Homelab → Skjoldlab

Ønske 2026-11-14: «hele homelab har nå nytt navn, Skjoldlab»

Designfilene er oppdatert (all synlig tekst «Homelab» → «Skjoldlab», «HOMELAB» → «SKJOLDLAB»). Filnavnene (`Homelab.dc.html` osv.) er beholdt.

## Gjør i koden
- All synlig tekst i web, PWA, iOS, Android, Mac og widgets: «Homelab» → «Skjoldlab». Gjelder også sammensetninger («Skjoldlab-appen», «Skjoldlab-backup», «Skjoldlab-server», «Skjoldlab OS»).
- Store bokstaver i mono-etiketter: «SKJOLDLAB».
- App-navn: iOS `CFBundleDisplayName` / `CFBundleName`, Android `app_name`, PWA `manifest.json` (`name`, `short_name`), `<title>`, Mac-appen, widget-galleriet (widgetene ligger under «Skjoldlab»), Live Activities, varsler (avsendernavn), Siri/App Intents-fraser.
- Innlogging og QR: «Logg inn på Skjoldlab», «Åpne Skjoldlab på mobilen → Innstillinger → Konto …».
- Kalender-appen: «Logg inn med Skjoldlab-appen», «Åpne Skjoldlab igjen», menyraden «Skjoldlab» (se `claude-code-kalender-homelab-i-meny.md`).
- i18n: nøkler og engelske tekster («Sign in to Skjoldlab», «Start Skjoldlab»).
- iCal-eksport: `PRODID:-//Skjoldlab//Matplan//NO`.
- E-post/push-maler, feilmeldinger («Fikk ikke kontakt med Skjoldlab»), docs (`docs/homelab.md` overskrifter og tekst), README, CHANGELOG-oppføring.

## Ikke endre (tekniske id-er)
- Repo-, mappe- og filnavn, `homelab://` URL-skjema og universal links, bundle-id / applicationId, localStorage-/UserDefaults-nøkler, databasenavn, Docker-tjenestenavn, `ET-Client-Name: kristo-homelab`, `home.kristo.no`.
- Grunn: endring av disse logger ut brukere, bryter dype lenker og gamle installasjoner. Kan tas senere med migrering.

## Merk
- Det finnes allerede en modul som heter **Skjold Lab**. Med nytt appnavn «Skjoldlab» blir det forvirrende. Gi modulen et annet navn (avklares med Sebastian) før dette slippes.

## Test
- Søk i klientkoden etter `Homelab` (stor H) i synlig tekst: skal gi null treff utenom kommentarer/id-er.
- Hjemskjerm-ikon, appbytter, widget-galleri og varsler viser «Skjoldlab».
- Gammel innlogging og dype lenker (`homelab://…`) virker fortsatt.
