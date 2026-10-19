# Prompt 37: pakke til Claude Code

Start med `prompt-37.md`. Den har alle ønskene ordrett med dato. Hvert ønske peker på en `claude-code-*.md`, og fasiten ligger i `design/`.

## Instrukser (anbefalt rekkefølge)
1. `claude-code-wiggle-krasj-ios.md`: **FEIL**, krasj ved flytting i wiggle-modus på iOS. Sporing-widgeten kan skjules når det ikke er pakker.
2. `claude-code-onboarding-profil.md`: onboarding der bruker kobles til profil, og profil-modellen (bruker ≠ profil).
3. `claude-code-huskeliste-uten-navbar.md`: Gjøremål:
   - uten navbar
   - nytt navn
   - detaljark (dato, tid, viktig, gjenta, sted, prioritet, flagg, tagger, deloppgaver)
   - personlige og delte lister
   - ark inne i appen
4. `claude-code-gjoremal-glimt.md`: Glimt i Gjøremål (11 funksjoner) via den runde ✦-knappen.
5. `claude-code-sporing-delte-nokler.md`: API-nøkler for sporing deles i husstanden. Pakker er private.
6. `claude-code-abo-provetid.md`: Subscription OS:
   - gratis prøveperioder
   - wiggle-redigering
   - delte abonnementer (Starlink)
7. `claude-code-kalender-app.md`: Kalender-appen:
   - Glimt tolker «i morgen?» riktig
   - «prøve på skolen» er ikke en prøveperiode
   - farge per fag
   - adresse og kart
   - tastatur og grå hjørner
   - zoom
   - ukenummer
8. `claude-code-glimt-brief.md`: Brief:
   - Vær-kortet åpner Vær
   - fjernet etikett
   - fast bredde og ring
   - sveip bort
9. `claude-code-bibelvers.md`: bibelvers (bare Sebastian):
   - brief, Hjem og widgets
   - lest eller sveipet bort → nederst i briefen
   - Bibel-side med rekke og leseplan
10. `claude-code-sok-hvor-er.md`: «Hvor er Ingrid?» svarer med posisjon.
11. `claude-code-konto-profilbilde.md`: profilbildet øverst åpner Innstillinger.

## Design (åpnes direkte i nettleseren)
`design/`: alle relevante `.dc.html` + `support.js`, `glimt-figurer.js`, `i18n.js`, `domener-kart.js`, `image-slot.js` og `assets/`.
- Hovedfil mobil: `Mobil Papir App.dc.html`
- Nye: `Onboarding.dc.html`, `Bibelvers.dc.html` (`mode=overview|brief|home|page`)

## Vedlegg
`vedlegg/`: skjermbildene brukeren la ved, komprimert til .jpg. `Påminnelser.png` er inspirasjon til detaljarket.
