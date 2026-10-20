# Vær: julefigur-fiks, rediger kort (wiggle) og Glimt skiføre

Ønske 2026-10-20: «ordne glimt personene med julemodus. få også vær på bunn eller på topp legg til wiggle editor i vær popup, jeg vil ha en glimt anbefaling for smøring av ski og hvordan ski føre er, dette skal vises hvis det er skimuligheter. la meg også skru det av.» (skjermbilde: `vedlegg/jul-sky-feil.png`)
Fasit: `glimt-figurer.js` (`dress(…, id)` med ankerpunkter), `Vaer.dc.html` (`voVals`, `skiVals`).

## 1. Julemodus på figurene
- Feil: på **Sky** (sky-figuren) svevde nissehua over skyen, og skjerf + gave hang langt under kroppen.
- Fiks: tilbehør plasseres per figur med ankerpunkter (`hT` hatt-topp, `hX` hatt-senter, `hS` hattskala, `sB` skjerf-bunn, `sW` skjerf-bredde, `gB/gR` gave). Sky: `{hT:-.18,hX:.6,hS:.78,sB:.07,sW:.92,gB:.05,gR:-.08}` – hua sitter på den høyre «bulen», skjerfet rundt nedre del av skyen, gaven inntil.
- Runde figurer (Glimt, Boble, Ugle, Stjerne, Gris, Spire, Dråpe) beholder standardplassering. Legg inn anker for nye figurer når de lages. Test alle figurer i julemodus (Advent, Jul, Nyttår, Vinter) i 54 og 90 pt.

## 2. Rediger kort i Vær (wiggle)
- **Hold inne** et kort i Vær-popupen (0,6 s, uten bevegelse) eller trykk **«Rediger kort»** nederst → kortene vugger (±0,6°) og arket **«Rediger Vær»** kommer opp nederst.
- Arket: alle kort i rekkefølge (Nå, Skiføre, Time for time, 10 dager, Yr mot Storm, Vind, Måne, Detaljer, Glimt · uka) med **↑ ↓** og bryter for vis/skjul. Knapper: **«Glimt-kortet øverst / nederst»**, **«Vis ski-eksempel»** (bare i designet), **Nullstill**, **Ferdig**.
- Rekkefølge og skjulte kort lagres per bruker (`vaer_layout`) og gjelder mobil og brett. Scroll må virke mens du redigerer (bare hold-inne starter redigering).

## 3. Glimt skiføre (vises bare når det er skimuligheter)
- Data: Open-Meteo for **Nordmarka** (59.99, 10.67): `snow_depth`, `snowfall_sum` siste 3 dager, temperatur, fukt, maks-temp (tining). Vis kortet når snødybde ≥ 15 cm (eller Skisporet melder preparerte løyper). Senere: velg område (Nordmarka, Østmarka, Hafjell/hytta).
- Kort: «SKIFØRE · NORDMARKA», Spire-figuren, «✦ GLIMT ANBEFALER», **smøring** i stor tekst (f.eks. «Blå (V30) · nysnø»), kort forklaring av føret, fire tall (snødybde, ny snø, temp, fukt), brikker **Feste** og **Glid**, «Løyper ↗» (skisporet.no).
- Regler (feste): skare/gjenfrosset → blå klister · ≤ −10° → grønn (V20) · −10 til −3° → blå (V30 ved nysnø, ellers blå ekstra V40) · −3 til 0° → fiolett (V45) · over 0° → rød (V55) eller universalklister / felleski. Glid: kald (≤ −8°), universal (−8 til −2°), varm (over −2°).
- La Glimt (Ollama) skrive teksten ut fra tallene når serveren svarer, med reglene over som reserve.
- **Skru av:** bryteren «Skiføre» i Rediger Vær (`ski:false`). Av = kortet vises aldri, heller ikke ved snø.

## Oppfølging (2026-10-20)
Ønske: «ordene glimt figuren animajson, legg også vis relevant kortet eller ivertfall info i brief.» (skjermbilde: `vedlegg/vaer-ski-figur.png`)
- **Figuranimasjon i Vær:** Vær-siden manglet `@keyframes gf*` (gfBob, gfHop, gfBlink, gfTalk, gfTw, gfLeaf, gfJul …), så figurene sto stille. Samme animasjoner som i Brief er lagt inn. I appene: alle steder som viser Glimt-figurer må laste samme animasjonssett (én delt modul).
- **Spire i julemodus:** egne ankerpunkter (`spire:{hT:-.08,hX:.56,hS:.8,sB:-.13,sW:.98,gB:-.1,gR:-.12}`) så lua sitter på hodet og skjerfet under ansiktet. Alle 13 figurer er kontrollert i julemodus.
- «Feste:Blå» manglet mellomrom: etikettene lages nå ferdige i koden («Feste: Blå (V30)»).
- **Brief:** når skikortet er relevant (snø ≥ 15 cm og «Skiføre» ikke slått av), får briefen brikken «Ski: blå» og et eget kort **Skiføre · NORDMARKA**: «Nysnø i Nordmarka: 42 cm snø og −4°. Glimt anbefaler blå (V30) i festesonen.» + brikker (snødybde, nysnø, feste). Glimt kan også nevne det i talebriefen («Det er fint skiføre i marka i dag»).
