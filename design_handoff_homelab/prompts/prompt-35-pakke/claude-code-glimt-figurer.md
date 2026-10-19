# Glimt-figurer: 7 søte varianter

Fasit: `Glimt Figurer.dc.html` (funksjonen `fig(id, størrelse, humør)`). Trykk på en figur for å bytte humør. «Velg» lagrer valget i `localStorage glimt_char` og sender hendelsen `glimt-char`. I appen lagres det i profilen og synkes.

## Figurene (id · navn · bruk)
- **glimt · Glimt** (standard): krem fjes i regnbuering (konisk gradient som roterer, 6 s / 1,4 s når den snakker). Oransje gnist over hodet.
- **sky · Sky:** hvit skybolle av tre sirkler, blågrå øyne, rosa kinn. Små regndråper drypper fra bunnen (fin når det er meldt regn).
- **stjerne · Stjerne:** femtakket stjerne med oransje gradient (`#ffb38a → #ff6a3c`), glans, fjes midt på og en liten gul stjerne som glitrer ved siden av.
- **drape · Dråpe:** vanndråpe (`border-radius: 50% 0 50% 50%` rotert −45°) i blå gradient med glans.
- **ugle · Ugle:** brun gradient-kropp med ørefjær, krem bryst med flekker, store øyne med gul ring, gult nebb som «snakker» og vinger som vifter.
- **gris · Gris:** rosa sparegris (`#f6b3c1 → #e98aa0`) med ører, sparebøsse-spalte på toppen, tryne med to nesebor (beveger seg når den snakker), krøllete hale som vifter (fort når den er glad) og små bein. Når den er glad, glitrer en gul **kr**-mynt ved siden av. Standardfigur i **Finans** og **Budsjett** (kan endres).
- **spire · Spire:** grønn bolle med en stilk og to blader som vifter (2 s).

## Humør (alle figurer)
- **Rolig** (`idle`): svever (2,6 s) og blunker (~4 s).
- **Glad** (`glad`): ^^-øyne, smil med rød munn og hopp med squash & stretch (1 s).
- **Snakker** (`talk`): munnen beveger seg (0,3 s). Brukes mens Glimt svarer eller guider.
- **Sover** (`sover`): lukkede øyne, liten munn og «z» som flyter opp. Brukes om natten og i stille timer.

## Bruk
- Alle steder med Glimt-figuren bruker den valgte figuren: Glimt-brief (guide), Hjem-kortet, widgets (statisk idle), Glimt-chat og Kalender-Glimt.
- Valg: Innstillinger → AI → **Glimt-figur** (rutenett med de 6 og forhåndsvisning). Også ved første oppstart («Velg din Glimt»).
- Humør automatisk: snakker når den svarer, glad når en oppgave er ferdig eller noe er lagt til, sover mellom 23 og 06. Sky drypper når det er regn i dag.
- Native: tegn som vektor (SwiftUI `Shape`/Canvas, Compose Canvas) eller eksporter til Lottie/Rive med de fire tilstandene. Størrelser: 26 (widget-ikon), 48 (liste), 76 (guide), 150 (velger). «Reduser bevegelse» betyr ingen svev, hopp eller spinn.

## Runde 2: varianter i samme familie som Glimt (ring-fjeset)
Fasit: `Glimt Figurer.dc.html` → seksjonen «RUNDE 2» (2a–2f). Samme fjes og humør som originalen.
- **2a · halo · Glimt Halo:** tykkere regnbuering (11 % av størrelsen). Bak den ligger en uskarp glorie i samme regnbue som «puster» (`gfGlow` 3,2 s, opasitet .55–.9), og tre gnister (gul, oransje og lilla) blinker forskjøvet.
- **2b · boble · Glimt Boble:** blank glasskule. Regnbuen roterer bak en krem kjerne (52 %), med et hvitt glanspunkt øverst til venstre, en svak glanskant og en liten lilla skygge under.
- **2c · antenne · Glimt Antenne:** originalringen (7,5 %). En tynn svart antenne med oransje stjerne vipper (`gfSway` 1,8 s), og to små armer: venstre vinker når den er glad eller snakker.
- **2d · bane · Glimt Bane:** krem kule uten fast ring. To tynne elliptiske baner (oransje/gul og grønn/lilla) går hver sin vei rundt (4 s / 5,5 s, raskere når den snakker), som en liten planet.
- **2e · pastell · Glimt Pastell:** tykk pastellring (`#f4a6a0 → #f7c9a0 → #f6e3a1 → #a8e0c8 → #c3b4ef`). Litt større øyne, rundere og rosa kinn, en liten oransje hårlokk på toppen og en rosa gnist.
- **2f · natt · Glimt Natt:** mørkt fjes (`#2a2a3a → #141420`) med lysende kremgule øyne og munn (`#ffe7a8`) i regnbueringen og en svak glorie. Standard i mørkt tema og i kveldsbrief etter 21.

## Glimt-familien: personligheter etter situasjon
Fasit: `Glimt Brief.dc.html` (guide-runden) + felles figurkode i `glimt-figurer.js` (`window.GlimtFigMake(React)` → `fig(id, størrelse, humør)`), som brukes av både `Glimt Figurer` og `Glimt Brief`.

**Glimt er verten.** Når temaet bytter, kommer en venn inn med en pop-animasjon (`gbPop` 0,45 s, skaler fra 0,4 med litt sprett), snakker, og gir ordet tilbake. Boblen viser hvem som snakker (`GLIMT` / `SKY` / `DRÅPE` / `UGLE` i figurens farge).

| Situasjon | Figur | Eksempel |
|---|---|---|
| Vert / generelt | **Glimt** (dag) · **Glimt Natt** (21–06) | «Hei! Jeg er Glimt …» |
| Vær, oppholdsvær | **Sky** | «Hei, det er Sky! Lettskyet, 8° nå …» → «Sky her igjen: sola går ned 17:58. Nå tar Glimt over!» |
| Vær, regn/snø | **Dråpe** | «Hei, det er Dråpe! Regn … Jeg drypper litt, så ta med paraply!» |
| Kalender og påminnelser | **Ugle** | «Uhu, Ugle her med kalenderen …» |
| Finans, budsjett, abonnement, prøveperioder | **Gris** | «Nøff! 2 dager igjen av Viaplay-prøven …» |
| Mat, handleliste, vaner | **Spire** | «Middag i dag er Kyllingsalat!» |
| Feiring, ferdig oppgave, nyhet om rekord | **Stjerne** (glad, hopper) | «Ferdig! Backupen er tatt.» |
| Tenker / jobber (AI-jobber) | **Glimt Bane** (banene spinner raskt) | i Jobber og mens chat svarer |

- Ved hvert bytte: lett haptikk. Gammel figur skaleres ned og den nye spretter inn.
- Humør: snakker mens boblen vises, sover mellom 23 og 06, glad når noe er fullført.
- Brukerens valgte figur (Innstillinger → AI → Glimt-figur) erstatter **verten**. Vennene beholder rollene sine. Bryter: «La Glimt få besøk av venner» (på som standard). Av betyr at bare verten vises.
- Samme logikk i Glimt-chat (avatar per svar etter tema), Hjem-kortet (verten), widgets (tema-figuren for innholdet, f.eks. Dråpe på regndager) og varsler (ikon).
