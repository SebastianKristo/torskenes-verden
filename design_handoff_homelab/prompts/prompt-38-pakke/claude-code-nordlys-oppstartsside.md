# «Starter opp»-side med Glimt mens serveren starter på nytt

Ønske 2026-10-19: «i mens serveren starter opp igjen etter oppdatering lag en starter opp page, med glimt.»
Fasit: `Nordlys Starter.dc.html` (bruker `glimt-figurer.js`).

## Når den vises
- Etter «Oppdater nå» når updater-containeren restarter tjenestene (steget «Starter tjenestene på nytt …», ca. 85 %), og når web eller app mister kontakt med serveren (`/api/health` svarer ikke / 502 / 503 / WebSocket lukket).
- Web: hele vinduet (`position: fixed; inset: 0; z-index: 9999`). Mobil: fullskjerm over appen. Navbaren skjules.
- Serves fra **updater-containeren** eller som en statisk side i reverse-proxyen (Caddy/Nginx `handle_errors 502 503` → `/starting.html`), så den virker mens appen er nede. Inlinet: én HTML-fil med figuren, uten eksterne avhengigheter utenom font (fallback system-ui).

## Innhold (topp → bunn, sentrert, maks 440 px)
1. **Glimt** (128 px) i en **fremdriftsring** (Ø 208, strek 5, gradient grønn → fersken → oransje), med 3 små lysende prikker som går i bane (9 s) og en «% »-pille under.
   - **Sover** (z z z stiger opp) mens databasen og migrasjonene kjører.
   - **Våken** (svever, 3,2 s) mens API og AI starter.
   - **Snakker** når alt er klart.
2. «STARTER OPP» / «KLAR» (Plex Mono) · **NordlysOS 4.29** (versjonen i gradient) · én linje fra Glimt:
   - «Serveren starter på nytt etter oppdateringen. Glimt sover litt …»
   - «Glimt våkner og sjekker at alt er på plass.»
   - «Nesten klar. Glimt varmer opp modellene.»
   - «Alt kjører! Laster inn Homelab …»
3. **Stegliste** i glass-kort:
   - Starter databasen → Kjører migrasjoner → Starter web og API → Vekker Glimt og AI-modellene → Kobler til integrasjoner.
   - Hvert steg har spinner (aktiv), ✓ grønn med pop (ferdig, + tid i sekunder) eller grå prikk (venter).
4. Bunntekst: «Siden lastes inn automatisk når serveren svarer · 23 s».
   - Etter 40 s vises lenken **Last inn på nytt nå**.
   - Etter 3 min: «Det tar lengre tid enn vanlig» + **Vis logg** (fra updater).
- Bakgrunn: samme nordlys-gradient som Nordlys-kortet, med sakte bevegelse (14 s) og blur.

## Logikk
- Poll `GET /api/health` hvert 1,5 s (med `cache:'no-store'`). Svaret har `{ready:bool, steps:[{id,status,ms}]}` fra en oppstartsstatus som backend skriver mens den starter. Ingen svar betyr at første steg er aktivt.
- Når `ready` er true: vis «Klar» i 0,8 s, og deretter **hard reload** (`location.reload()` + service worker `skipWaiting`, jf. cache-fiksen) på web. Mobil: kall `/api/system/version` på nytt og fjern overlayet.
- «Reduser bevegelse»: ingen bane-prikker eller sveving, ringen og ✓ uten pop.


## FEIL 2026-10-20: siden flimrer inn og ut
Vedlegg: `uploads/Screenshot 2026-10-20 at 00.55.34.png`.
Årsaker:
1. Nordlys-bakgrunnen var et stort lag med `filter: blur(10px)` som animeres (`transform`). Det rasteriseres på nytt hver frame og blinker i Safari/WebKit.
2. Hele siden rendres hvert sekund (sekundtelleren). Glimt-figuren ble bygd på nytt hver gang.
3. Prototypen startet animasjonen på nytt (fra 0 %) 4 s etter «Klar».
Fiks:
- Ingen `filter: blur` på animerte lag. Bruk myke radial-gradienter (72 % fade) + `will-change: transform; transform: translateZ(0); backface-visibility: hidden`. Langsommere bevegelse (18 s).
- Figur og bakgrunn bygges én gang (memo per humør). Bare footer-teksten oppdateres hvert sekund. Stopp telleren når serveren er klar.
- Ingen restart: etter «Klar» står siden til reload. Demo-loop bare med `loop`-prop.
- Overgang til appen: fade ut 0,3 s **før** `location.reload()`, så det ikke blinker hvitt (sett `<meta name="theme-color">` og `html{background:#101a2e}` på oppstartssiden og appens første frame).
