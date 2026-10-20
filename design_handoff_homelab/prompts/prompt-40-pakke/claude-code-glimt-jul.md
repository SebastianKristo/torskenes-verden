# Glimt i julemodus (1. desember – 13. januar) + nytt Økonomi-ikon

Ønske 2026-10-20: «også fra 1 december til 13 januar gi glimt en julepersonlighet. lag ogs et nytt ikon for økonomi siden.»
Fasit: `Glimt Jul og Okonomi-ikon.dc.html` (1a faser, 1b i appen, 2a–2c ikonforslag). Figuren bygger på `glimt-figurer.js`.

## Når
Automatisk etter lokal dato (Europe/Oslo), fire faser:
| Fase | Datoer | Antrekk | Tone |
|---|---|---|---|
| Advent | 1.–23. des | rød nisselue + grønt skjerf med hvite striper | nedtelling «11 dager til jul», adventsluke i morgenbriefen |
| Jul | 24.–30. des | lue, skjerf, liten gave | «God jul!» på julaften, rolig i romjula |
| Nyttår | 31. des – 1. jan | svart festhatt med gull + gnister | årsoppsummering (økonomi, trening, serier, steder) |
| Vinter | 2.–13. jan | blå strikkelue + rødt skjerf | vanlig tone; lua av på tjugendedag jul (13. jan) |

## Figur
- Legg til `outfit` i figurbiblioteket: `'nisse' | 'jul' | 'nyttar' | 'vinter'` (samme mønster som `outfit:'prest'`). Tilbehøret tegnes over figuren og skaleres med størrelsen. Alle humør virker.
- Vugger rolig (3 s). «Reduser bevegelse»: ingen vugging, gnister eller snø.
- Brukes overalt der Glimt vises: brief, chat, varsler, søk, oppstartssiden og Hjem-widgeten. Valgfritt: alternativt app-ikon med lue (iOS `setAlternateIconName`, Android activity-alias).

## Gjelder overalt (fiks 2026-10-20)
- Julemodus var bare et valg; figuren endret seg ikke. Nå legger **figurbiblioteket selv** på antrekket når julemodus er aktiv (`julOn()` i `glimt-figurer.js`): alle steder som tegner Glimt (Hjem-briefen, brief-siden, chat, widgets, varsler, søk) får lue/skjerf uten egen kode. Unntak: `{noJul:true}` (f.eks. figurvelgeren).
- Når valget endres sendes en hendelse (`glimt-jul` i web / `NotificationCenter` på iOS / `Flow` på Android), og alle åpne skjermer tegner figuren på nytt med en gang. Widgets på hjemskjermen oppdateres (`WidgetCenter.reloadAllTimelines` / `GlanceAppWidget.updateAll`).
- Valget synkes til serveren, så det gjelder på alle enheter.

## Personlighet
- Samme svarkvalitet og fakta. Varmere tone og høyst ett juleord per svar.
- **Brief:** nedtelling til julaften, «Dagens luke» (ett nyttig tips per dag 1.–24. des: tilbud, julemarked, lys på hytta …), juleavtaler fra kalenderen.
- **Gaver:** foreslår en «Julegaver»-liste i Gjøremål og kobler pakker i Sporing til den. Pakker som kan være gaver skjules for andre i husstanden.
- **Vær:** snøfall i Vær-popupen og briefen når det snør eller er minus.
- **Nyttår:** «Året ditt»-oppsummering i briefen 31. des.

## Innstillinger → Glimt
Plassering (fasit `Glimt Brief.dc.html`, mode settings): rett under figurvalget («GLIMT-FIGUR») og teksten om vennene, før Glimt-brief-bryteren. Kort med rød lue-ikonrute, «Julemodus», status («På nå · slås av 13. januar» / «Slås på 1. desember» / «Av hele året» / «På · Advent»), segment **Auto · Av · På**, og fasevalg når På er valgt.

- **Julemodus:** Auto (standard, 1. des–13. jan) / Av / **På** (manuelt). Velger man På, vises fasevalg: Advent · Jul · Nyttår · Vinter. Manuelt På gjelder til man slår det av eller velger Auto. Lagres som `glimt_jul` + `glimt_jul_p`.
- **Snø i Vær og brief:** På/Av.
- **Julelyd på varsler:** Av (standard) / myk bjelle (lav og kort).
- Per bruker, synkes.

## Økonomi-ikon
Kombinasjoner av 2b og 2c (ønsket 2026-10-20):
- **3c (valgt retning):** 3a i fargen fra 3b: hvit lommebok med budsjettringen som lås på mørk blå `#1B2A40`.
- **3a «Lommebok med budsjettring»:** hvit lommebok på varm gradient `#E8794A → #B23A2A`, låsen er en liten ring i tre farger (gull, mint, rosa).
- **3b «Ring over lommebok»:** mørk blå `#1B2A40`, hvit lommebok, budsjettringen som mynt som stikker opp.

Tidligere forslag:
- **2a «kr med kurve»:** «kr» i Newsreader med stigende gull-kurve på grønn `#1F7A6E`.
- **2b «Budsjettring»:** ring i tre farger (budsjettkategoriene) på mørk blå `#1B2A40`.
- **2c «Lommebok»:** hvit lommebok på varm gradient `#E8794A → #B23A2A`.
- Leveres som SVG, app-ikon 1024 px (iOS), adaptivt ikon (Android) og 32/40 px i menyer.
