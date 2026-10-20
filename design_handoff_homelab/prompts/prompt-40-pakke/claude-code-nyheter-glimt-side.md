# Nyheter: egen Glimt-side med langt sammendrag, kilder og bilder

Ønske 2026-10-20: «I brief for nyheter la meg åpne en egen ai glimt side i nyhetssiden som viser en lang samendrag med referanser og bilder fra annonser, la meg velge innholdet den skal ta fra.»
(«annonser» tolket som artiklene/sakene. Ingen reklame brukes.)
Fasit: `Nyhetsleser.dc.html` (`gl`, `glArts`, `glRun`, `glLocal`, `glVals`), `Glimt Brief.dc.html` (`openNews`), `Mobil Papir App.dc.html` (`briefNews`, `rssGl`).

## Veier inn
- **Now Brief → Nyheter-kortet:** knapp «✦ Glimt-sammendrag ›» ved tittelen. Lukker briefen, åpner Nyhetsleseren rett på Glimt-siden.
- **Nyhetsleseren:** det øverste kortet «✦ GLIMT · SAMMENDRAG» (kort ingress) er trykkbart: «Les hele sammendraget med kilder og bilder ›».
- «‹ Nyheter» går tilbake til nyhetslista.

## Glimt-siden
- Topp: «‹ Nyheter», «▶ Les opp» (talesyntese nb-NO, samme stemme som briefen) og «Innhold».
- Kicker «✦ GLIMT · NYHETSOPPSUMMERING», tittel («Dette skjer i dag» / «Siste døgn» / «Uka i nyheter»), meta: dato · antall saker · kilder · kort/langt.
- **Ingress** i kursiv serif (2 setninger).
- **Seksjoner per tema** (Norge og Oslo, Økonomi, Verden, Sport, Teknologi, Kultur): overskrift + avsnitt. Hver setning har **referansebrikker** [1] [3] som åpner saken (artikkelarket med AI-sammendrag og «Åpne saken»).
- **Bilder:** fra sakene (`og:image` / RSS `media:content` / `enclosure`). Første seksjon 16:9, resten 3:2. Bildetekst: «Bilde fra saken [n] · NRK». Kort sammendrag viser bilder i de tre første seksjonene, langt i alle.
- **KILDER**-liste nederst: [n], miniatyr, tittel, kilde og tid. Bare saker som faktisk er brukt.
- Fot: «Laget av Glimt kl. 09:20 fra kildene du har valgt. Trykk på et tall for å lese saken.»

## Velg innholdet («Innhold»)
- **Kilder:** chips for hver RSS-kilde brukeren har (NRK, VG, E24, Aftenposten, Tek.no …).
- **Temaer:** Norge, Verden, Økonomi, Sport, Teknologi, Kultur.
- **Periode:** I dag · 24 t · Uke. **Lengde:** Kort · Lang.
- «✦ Lag sammendrag (14 saker)» viser antallet som matcher valgene. Valgene lagres per bruker (`hl_rss_glimt` → server `user_prefs.news_glimt`) og brukes også av Nyheter-kortet i briefen.

## Backend
- `POST /api/glimt/news-digest` `{sources[], topics[], period, length}` → henter sakene (tittel, ingress, lenke, bilde, tid) fra RSS-cache, maks 30.
- Modell (lokal først, sky som reserve) får nummererte saker med **tittel + ingress/første avsnitt**, og svarer KUN JSON: `{ingress, seksjoner:[{tittel, avsnitt:[{tekst, ref:[n]}], bilde:n}]}`.
- Regler i prompten: bare det som står i sakene, nøktern tone («NRK melder at …»), alle setninger med referanse, ingen tall som ikke finnes i kilden.
- Valider: ref må peke på en sak i lista; ellers fjernes brikken. Feiler AI → lokalt sammendrag av titlene, gruppert per tema (som i designet).
- Cache per (bruker, valg, time). Generer på nytt når nye saker kommer eller valgene endres.
- Varsel (valgfritt): «Glimt-sammendraget for i dag er klart» kl. 07:00.
