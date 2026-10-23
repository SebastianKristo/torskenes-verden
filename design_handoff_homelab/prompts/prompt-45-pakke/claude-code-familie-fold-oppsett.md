# Familie på Fold/iPad: eget oppsett for stor skjerm

Fasit: `Familie.dc.html` med `variant="fold"`, brukt i `Mobil Papir App.dc.html` når `wide` er på (1c i `FinansHub Mobil v2.dc.html`).

## Oppsett
- **Venstre navbar** (samme vertikale navbar som resten av brettet modus) med Familie-fanene: Kart · Soner · Helse · Vel fremme, og Hjem-knappen øverst.
- Innholdet deles i **to kolonner**:
  - **Venstre (ca. 56 %)**: kartet, høyt (skjermhøyde − ca. 150 px, minst 460 px), med knapperaden (Ny sone, Vis alle, Oppdater) over. Kolonnen er **sticky**, så kartet blir stående mens høyre side scrolles.
  - **Høyre (minst 300 px)**: personkort, valgt person (detaljer, batteri, hastighet, sist sett), soner, helse og Vel fremme, avhengig av fane.
- Trykk på en person i høyre kolonne → kartet zoomer til personen (ingen sidebytte). Trykk på en pin i kartet → personens kort åpnes i høyre kolonne.
- Soner-fanen: listen til høyre, kartet viser alle soner til venstre. Ny sone plasseres direkte i kartet.
- Helse og Vel fremme: kartet blir stående til venstre (viser hvor personene er), innholdet til høyre.
- 24 px mellomrom mellom kolonnene. Samme kort, farger og typografi som mobil (Papir).
- Sammenbrettet / telefon: uendret (én kolonne).
- **Full bredde:** Familie på brettet skjerm har ingen maksbredde (tidligere 720 px sentrert, som ga mye tomrom på sidene). Innholdet fyller hele flaten fra navbaren til høyre kant (16 px marg).

## Native
- Android: `WindowSizeClass` Expanded → `Row` med kart (`weight 1.3f`) + `LazyColumn` (`weight 1f`, `widthIn(min = 300.dp)`).
- iPad: `NavigationSplitView`-lignende `HStack` med samme forhold.
