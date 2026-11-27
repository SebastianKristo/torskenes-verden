# Prompt 57

Startet: 2026-11-14

## Ønsker (ordrett)

- 2026-11-14: «når jeg refresher, ofte får dobbel refresh ikon animasjon, og den blir alltdig ferdig, må lukke appen for at den går itlbake til normal» (vedlegg: uploads/IMG_1582.PNG)
- 2026-11-14: «kolidrer der. og den burde ha glimt logoen og plaseres et annet sted.» (vedlegg: uploads/IMG_1581.PNG, uploads/Screenshot 2026-11-14 at 14.37.13.png, uploads/Screenshot 2026-11-14 at 14.37.22.png)
- 2026-11-14: Spesifikasjon «Innstillinger → Backup: «Gjenopprett fra fil»» (full tekst ordrett i `prompts/claude-code-backup-gjenopprett-fil.md`, seksjonene Hva funksjonen gjør, Hvor den ligger, Flyt, Lista, Feiltilstander, Design). Lever designfil `Backup Gjenopprett fra fil.dc.html` med alle stegene og feiltilstandene, i lyst og mørkt, 1440 og 390 px.
- 2026-11-14: «ikke vis gå tilbake til homealb i header. hjem det heller bak hamburger menyen. med de andre tignene der.» (vedlegg: uploads/Screenshot 2026-11-14 at 14.47.10.png, uploads/Screenshot 2026-11-14 at 14.47.27.png)
- 2026-11-14: Prompt «Tailscale i Homelab OS (torskenes-verden)» (full tekst ordrett i `prompts/claude-code-tailscale.md`). Svar i skjema: design av alle skjermene + Claude Code-fil; skjermer: Nettverk-fanen Tailnet, enhetsdetalj (popup), Glimt-svar, mobilapp-liste; web 1440 + mobil 390; tema Papir; én variant.
- 2026-11-14: «legg Tailscale Tailnet.dc.html inn i web og mobil»
- 2026-11-14: «hele homelab har nå nytt navn, Skjoldlab»

## Tilhørende filer

- `prompts/claude-code-refresh-fiks.md`
- `prompts/claude-code-glimt-statuspille.md`
- `prompts/claude-code-backup-gjenopprett-fil.md`
- `Backup Gjenopprett fra fil.dc.html`
- `prompts/claude-code-kalender-homelab-i-meny.md`
- `prompts/claude-code-tailscale.md`
- `Tailscale Tailnet.dc.html`
- `Homelab Papir Web.dc.html` (Nettverk-fanen viser Tailnet øverst)
- `Homelab.dc.html` (Mer → Tailnet)
- `prompts/claude-code-skjoldlab-navn.md` (alle designfiler oppdatert med nytt navn)

- 2026-11-14: «går ut av siden» (vedlegg Screenshot 19.48.56 / 19.49.01): servervelgeren i Media (web) går utenfor høyre kant. Fiks: menyen forankres til høyre kant av knappen (right:0 i stedet for left:0), max-width calc(100vw − 32px).

- 2026-11-14: «bruk denne videoen or innloging siden» (vedlegg video + Screenshot 20.12.28): venstre panel på innloggingssiden bruker nå videoen `assets/innlogging-bakgrunn.mp4` (autoplay, muted, loop, playsinline, object-fit:cover) i stedet for den tegnede scenen. Mørk gradient nederst beholdes for lesbar tekst.

- 2026-11-14: «feil med live actiivty på ios.» (vedlegg Screenshot 21.09.24 / 21.09.47 → `vedlegg/la-nrk-feil-1.png`, `-2.png`): ny seksjon i `claude-code-live-activities.md`. Pause-knappen var kuttet (over 160 pt), ikonet og tittelen sto ikke på linje, «0 %» vistes mens den komprimerte, og meta-raden gjentok tittelen. Løsning: faser i ContentState, lavere bottom-region, knapper på 34 pt.

- 2026-11-15: «legg til mulighet får å rediger hvilke av disse som skal vises og ikke vises» (vedlegg Screenshot 01.00.55, toppmenyen web): blyant-knapp sist i fanemenyen åpner «Faner i menyen» med av/på-bryter per fane. Dashboard er alltid synlig. Aktiv fane vises selv om den er skjult. «Vis alle» nullstiller. Lagres i localStorage `skj_hidTabs`.

- 2026-11-15: «den redigersi menyen kan ligge bak profieln i denne menyen» (vedlegg Screenshot 01.06.46): blyant-knappen er fjernet fra fanemenyen. «Faner i menyen» åpnes nå fra profilmenyen via punktet «Rediger faner», som ligger mellom «Tilpass forside og meny» og «Rediger widgets».

- 2026-11-15: «eller bedre, når man holder inne får man mulughet til å endre rekkefølge som man alerde kan og et lite rødt - ikon som på ios får å fjerne. så et plus i en luste for å legge til». Fanemenyen fungerer nå som på iOS. Hold inne en fane i 0,5 s for å gå i redigeringsmodus. Fanene vibrerer og kan dras til ny rekkefølge. Rødt «−»-merke skjuler en fane (ikke Dashboard). «+» sist åpner «Legg til fane» med liste over skjulte faner. «Ferdig» eller Esc avslutter. «Rediger faner» i profilmenyen åpner samme modus. Lagres i `skj_tabOrd` og `skj_hidTabs`. Det gamle av/på-panelet er fjernet.

- 2026-11-27: «er det en måte å legge opp mobil appen, slik at vis jeg gjør endrig er kan de endirnge skje uten å oppdatere appen fra app store?.» Svart med alternativer (OTA-oppdatering av JS, server-styrt UI/remote config, web-innhold i native skall). Ingen designendring.

- 2026-11-27: «på ios den er høyere på skjermen enn den skal være. feil farge på tekst på de andre tabs, de skal ha hvit navn.» (vedlegg 17.51.07 / 17.51.23). Inaktive faner i fanelinjen er nå hvite (navInk #ffffff, lyst og mørkt tema). Plasseringen er beskrevet i `claude-code-ios-fanelinje.md`: safe-area ble lagt til to ganger.

- 2026-11-27: «også lag nytt design for denne, den ligner ikke og stikker ut. også på øknonmi, jeg ser ikke ting under navbaren, det skal jeg kunne» (vedlegg 17.52.24). Ny fil `Økonomi Fanelinje iOS.dc.html` med 1a (glass-faner over hovedlinjen) og 1b (festet øverst). Hvit tekst, ingen bakgrunnsflate, innholdet ruller under linjene. Instruks: `claude-code-okonomi-fanelinje-ios.md`.

- 2026-11-27: «1a er greit.» → 1a er valgt for Økonomi-fanelinjen. 1b er fjernet fra `claude-code-okonomi-fanelinje-ios.md`.

- 2026-11-27: «det blir feilm fjern rød prikken med 8» (vedlegg 17.55.19 / 17.55.43): badgen på Økonomi-fanen skal fjernes. Den finnes bare i appen, ikke i designet. Lagt til som punkt 3 i `claude-code-ios-fanelinje.md`.

- 2026-11-27: «den skal jo også vise ikonet vedsidan fanene som er vaglt» (vedlegg 17.56.00): kort-ikon og navn på den aktive Økonomi-pillen, badgen er fjernet i `Økonomi Fanelinje iOS.dc.html`. Lagt til som punkt 4 i `claude-code-ios-fanelinje.md`.

- 2026-11-27: «hva gjør denne» (vedlegg 17.56.49, tilpass-knappen ved Økonomi-fanene). Svar: den åpner redigering av Økonomi-fanelinjen. Der velger du hvilke faner som vises og i hvilken rekkefølge, samme som «FINANS · FANELINJE» i `Homelab.dc.html`. Ingen designendring.

- 2026-11-27: «fjern den slikt at er over navbaren» (vedlegg 17.57.15): den røde Skann-knappen er fjernet på mobil i `Homelab.dc.html` og i `Økonomi Fanelinje iOS.dc.html`. Glimt- og Sporing-knappene blir. Lagt til som punkt 5 i `claude-code-ios-fanelinje.md`.

- 2026-11-27: «ordene denne dropdwon menyen, gjør den bedre og pener og at den går ut av profil der den blir aktivert fra» (vedlegg 17.57.39): bakgrunnsvelgeren er tegnet på nytt i `Homelab.dc.html`. Den vokser ut fra «Vær nå ▾» med en pil mot knappen og viser et 2×2-rutenett med store forhåndsvisninger, valgt bakgrunn med ring og ✓. Ny rekkefølge: Vær nå, Planeter, Oslo, Gradient («Nåværende» heter nå «Gradient»). Instruks: `claude-code-bakgrunnsvelger.md`.

- 2026-11-27: «innstligner ikonet er ikke fjernet og er heller ikke der lenger» (vedlegg 17.58.53 / 17.58.59 / 17.59.11): sliders-knappen er fjernet fra `Økonomi Fanelinje iOS.dc.html`, og fanene redigeres ved å holde inne. Punkt 6 i `claude-code-ios-fanelinje.md`: begge knappene skal ut av appen.

- 2026-11-27: «den rød knappen skal jo fortasttt være der. den skulle ikke fjernes.» Skann-knappen er satt tilbake i `Homelab.dc.html` og i `Økonomi Fanelinje iOS.dc.html`. Den står over linjene. Punkt 5 og 6 i `claude-code-ios-fanelinje.md` er erstattet med «den blir, plassert over fanelinjen».

## Avklart 2026-11-27 (før koden)

- Navnet: appen heter **Skjoldlab**. Modulen som het «Skjold Lab» (skuffene, delene og LED-skapet) heter **Verksted**.
- Designfilene (`Homelab.dc.html` ny, `Økonomi Fanelinje iOS.dc.html`, `Tailscale Tailnet.dc.html`, `Live Activities.dc.html`, `Backup Gjenopprett fra fil.dc.html`) var ikke med i pakken. Koden bygges etter instruksfilene. Designfilene kan sendes senere for justering.
- Tailscale: begge kildene, valgt automatisk (LocalAPI-socketen montert lesende hvis den finnes, ellers Tailscale-API-et med OAuth-nøkkel lagret på serveren).
- Allerede gjort før denne pakken ble levert: «Gjenopprett fra fil» i Backup (`f74271e`), Live Activities-API og iOS-visningene (`0f2d0a3`, `8620843`), animert innloggingsbakgrunn (`be1ab2c`).
