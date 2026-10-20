# Fanelinja: valgfri Hjem-knapp (Tilpass → Fanelinje → Hjem-knapp)

Ønske 2026-10-20: «kan du finne en bedre løsning på navbaren, at man alltid har en hjem-knapp så man slipper pilen tilbake øverst» → forslag i `Navbar Hjem-knapp Forslag.dc.html` → «legg inn alle designene som mulige navbar-design, la meg velge i tilpass-menyen til navbar og vis preview».
Fasit: `Mobil Papir App.dc.html` (`navHome()`, `nhVals()`, `nhHide()`, nøkkel `papir_navhome`).

## Valg (Innstillinger → Tilpass → Fanelinje → **Hjem-knapp** › åpner et ark med forhåndsvisning)
- **Standard:** «‹ Hjem» øverst, som i dag.
- **1a Egen Hjem-knapp:** rund knapp (samme høyde og bakgrunn som fanelinja) til venstre, fanelinja flyttes 74 px til høyre.
- **1b Hjem først i linjen:** Hjem-ikon som første plass i pillen, med en tynn strek mellom Hjem og fanene.
- **1c Hjem i midten:** hevet rød knapp (60 px, 5 px ring i bakgrunnsfargen) midt i fanelinja, med fanene fordelt rundt.
- **1d Modulvelger:** første plass viser modulen du er i («kr Finans ▴»). Trykk åpner et rutenett (3 kolonner) med **Hjem** (rød) og alle modulene. Gjeldende modul er markert, og trykk utenfor lukker. Også synlig på Hjem («⌂ Hjem ▴»).
- Arket viser hvert valg som et kort med navn, kort forklaring og en **liten forhåndsvisning** av fanelinja. Valgt har mørk kant og ✓. Endringen skjer med en gang (lett haptikk), og **Ferdig** lukker.

## Oppførsel
- Med 1a–1d skjules «‹ Hjem» øverst på modulens toppsider (Finans, Familie, Mat …), og tittelen står alene. På undersider (f.eks. en transaksjon) vises fortsatt «‹ Oversikt».
- Hjem-knappen vises ikke på Hjem selv (der er Hjem første fane), unntatt modulvelgeren i 1d.
- Sider uten fanelinje (Chat, Kalender, Innstillinger, Huskeliste, Bibel, Bursdager) beholder «‹ Tilbake» øverst.
- Lagres per bruker og synkes mellom enheter. iPad/web (bred visning) bruker sidemenyen som før.
- iOS: tegn med SwiftUI `ZStack` over `TabView`, eller egen tab bar. Android: egen `NavigationBar`-komposisjon. Hjem-knappen er en vanlig knapp, ikke en `Tab`, så den ikke tar et fanevalg.

## Også i «Rediger fanelinjen» (ønske 2026-10-20: «legg til de nye navbarene her»)
- Under «STIL · FORHÅNDSVISNING» (Tekst / Bare ikoner / Ikoner + navn på valgt) kommer en ny seksjon **HJEM-KNAPP · FORHÅNDSVISNING**: kort i 2 kolonner for Standard, 1a Egen Hjem-knapp, 1b Hjem først i linjen, 1c Hjem i midten og 1d Modulvelger. Hvert kort har en liten forhåndsvisning av fanelinja, navn, kort forklaring og ✓ på valgt. Trykk endrer med en gang (samme innstilling som Innstillinger → Fanelinje → Hjem-knapp).

## Rettelse 2026-10-20 («viser ikke ny navbar når valgt. husk at det kommer an på hvilken navbar som er valgt om tilbake-knappene vises»)
- Den valgte fanelinja vises på **alle** sider, også på Hjem. Med 1a/1b/1c fjernes «Hjem»-fanen fra fanelista, og Hjem-knappen er markert (lys bakgrunn / lys ring) når du står på Hjem.
- «‹ Tilbake» øverst styres av valget: **Standard** viser «‹ Hjem» på modulsidene. **1a–1d** skjuler den på modulens toppsider og viser den bare på undersider (f.eks. «‹ Oversikt» fra en transaksjon) og på sider uten fanelinje.
