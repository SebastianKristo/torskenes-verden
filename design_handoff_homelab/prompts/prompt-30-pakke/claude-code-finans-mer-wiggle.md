# Finans → Mer: wiggle-redigering + skjul sider

Fasit: `Mobil Papir App.dc.html` → Finans → Mer (rutenett) → hold inne en flis.
Vedlegg: «Tilbakestill» og ✓ ligger oppå første rad med fliser, ingen måte å skjule sider på.

## Fiks overlapp
- Samme regel som Hjem: når redigering er på, får innholdet **64 px padding-top** (animert), så verktøylinja aldri dekker flisene.

## Samme utseende som Hjem-wiggle
- Flisene wiggler (±0,45°, 0,6 s, annenhver motsatt). Den som dras wiggler ikke, får skala 1,04 og skygge.
- **Minus-merke** øverst til venstre (−9/−9 px): hvit sirkel 28 px, kant `line`, skygge, svart «−». Trykk = skjul siden.
- **Innstillinger** har lås-merke (kan ikke skjules).
- Verktøylinje: **+ N** (antall skjulte) til venstre, **✓** til høyre. «Tilbakestill» er flyttet ned i Skjult-seksjonen som «Tilbakestill rekkefølge».

## Skjul sider
- Skjulte sider lagres per bruker (`finance_more_hidden: string[]`). Vises ikke i rutenettet.
- **+** viser seksjonen «SKJULT · TRYKK + FOR Å VISE» under rutenettet: skjulte fliser i 55 % opasitet med hvitt **+**-merke. Trykk = vis igjen (legges sist).
- Sider som ligger i bunnmenyen vises ikke her (uendret).
- Haptikk 8 ms ved skjul/vis.
