# Kalender: web skal se nøyaktig ut som Mac-appen

Ønske 2026-10-20: «mac kalender appen skal ikke se ut som web kalener, web kalender skal se nøyaktig lik ut som mac kalender.»

**Erstatter retningen i `claude-code-kalender-mac-lik-web.md`.** Fasit er nå **Kalender.app for Mac** slik den ser ut i dag (skjermbilde: `vedlegg/mac-kalender-fasit.png`). Ikke endre Mac-appen. Endre web-kalenderen (Homelab → Kalender, `home.kristo.no/kalender`) til den er lik.

## Fremgangsmåte
1. Ikke rør Mac-UI-koden. Rull tilbake eventuelle endringer fra forrige runde som gjorde Mac lik web.
2. Flytt Mac-appens kalender-komponent (layout, stiler, ikoner) til en felles pakke, og la web rendre **den** komponenten. Slett den gamle web-kalender-UI-en.
3. Bare vindusramme, menylinje, Dock, native varsler, ⌘-snarveier og widgets er Mac-spesifikke.

## Det web må ha (fra fasit, Uke-visning)
- **Toppfelt:** sidemeny-knapp · stor serif-tittel «19.–25. okt» + rød mono «UKE 43 · 2026» · ‹ › i runde knapper · segment Dag / 3 dager / Uke / Måned / År / Liste (aktiv = svart pille) · søk · i dag-ikon (dato) · «✦ Skriv time» (lys pille) · «+ Ny hendelse» (svart pille).
- **Neste-kort** under toppfeltet: farget venstrestrek, «NESTE» (rød mono) + tid + «i dag», tittel i fet + sted, nedtelling til høyre («6 t 1 min / til start»).
- **Sidemeny venstre:** minikalender med serif-månedsnavn, ukenummer-kolonne, søndag rød, i dag = rød sirkel, prikker under dager med hendelser · «KALENDERE» + «Rediger» (rød) · liste med fargeprikk + farget avkrysning + navn + antall + «Google»-merke · «+ Legg til kalender» (stiplet) · Glimt-kort nederst («GLIMT · DAGEN DIN»).
- **Ukegrid:** «U43» øverst til venstre, dagkolonner «MAN 19» med vær-ikon og temperatur, i dag = rød sirkel og tonet kolonne, rad «HELE DAGEN», timeetiketter i mono (07:00), rød nå-linje med prikk.
- **Hendelser:** tonet bakgrunn i fagfarge, farget venstrestrek, fagkode + tittel i fet, tid i mono, sted avkortet med «…».
- Samme fonter, farger, radier, avstander og fagfarger som Mac.

## Oppdatering 2026-10-20 (2): «her er designet for kalender for web, web skal se helt likt ut som mac appen»
Ny fasit-skjermbilde: `vedlegg/mac-kalender-fasit-2.png` (Uke-visning med U43, vær i dagtoppen, HELE DAGEN-rad, Neste-kort og Glimt · dagen din nederst i sidemenyen).
- **Status:** web viser fortsatt sin egen kalender. Det skal den ikke. Web-ruten `/kalender` (og Kalender-fullskjerm fra Dashboard) skal mounte **akkurat samme React-komponent som Mac-appen** (`<CalendarApp platform="web" />`), fra samme pakke og samme build. Den gamle web-kalenderkomponenten **slettes**, så den ikke kan brukes ved et uhell.
- **Sjekkliste**, alt skal være likt Mac:
  - toppfelt med «19.–25. okt» + «UKE 43 · 2026», ‹ ›, segment Dag/3 dager/Uke/Måned/År/Liste, søk, i dag, «✦ Skriv time», «+ Ny hendelse»
  - Neste-kortet med nedtelling
  - sidemeny med minikalender (ukenummer, røde søndager, prikker), KALENDERE + Rediger, «+ Legg til kalender» og Glimt · dagen din
  - uke-grid: U43, dag + vær, HELE DAGEN, timeetiketter i mono, rød nå-linje, i dag-kolonne tonet, hendelseskort med fagfarge og venstrestrek
- **Kalenderlisten** skal (både på Mac og web) vise bare de fire fra `claude-code-kalendere-fire-google.md`: Personlig · Bursdager · Skole · Helligdager. Skjermbildet viser fortsatt 12 rader (Jobb, Studie ×2, Familie, Helse ×2, Personlig ×2, «Sebastian… Google»). Det er feilen som skal ryddes, ikke fasit.
- **Eneste forskjeller som er lov på web:** ingen trafikklys/vindusramme, og nettleserens egen rullefelt-stil.
- **Test:** åpne Mac-appen og `home.kristo.no/kalender` side om side i samme størrelse (1440×900), Uke-visning. Ta skjermbilde av begge og legg dem over hverandre: ingen forskjell utenom vindusrammen.

## Test
Uke-visning i Safari (samme vindusstørrelse) og Kalender.app side om side: piksel-likt bortsett fra vindusrammen. Sjekk også Dag, 3 dager, Måned, År, Liste og mørkt tema.
