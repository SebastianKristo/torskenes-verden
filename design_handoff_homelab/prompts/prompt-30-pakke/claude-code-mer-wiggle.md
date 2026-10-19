# Mer: redigering med samme wiggle-design som Hjem

Fasit: `Mobil Papir App.dc.html` → Mer → hold inne en rad.
Vedlegg: gammel visning med kortet «REDIGERER MER · Dra ≡ for å flytte. Trykk − for å skjule. · Ferdig», røde −/grønne + sirkler i én samlet liste.

## Nytt
- **Ingen header-kort.** Samme flytende verktøylinje som Hjem: **+** (med antall skjulte) til venstre, **✓ Ferdig** (ink-pille) til høyre. Innholdet skyves 64 px ned (se `claude-code-wiggle-verktoylinje.md`).
- Listen deles opp i **separate kort** (radius 18, gap 10, skygge `0 8px 20px -14px rgba(0,0,0,.3)`), som widgets på Hjem.
- Hvert kort **wiggler** (±0,45°, 0,6 s, annenhver rad motsatt fase). Kortet som dras wiggler ikke.
- **Minus-merke** øverst til venstre (−9 px/−9 px): hvit sirkel 28 px, kant `line`, skygge, svart «−». Innstillinger har et lås-merke i samme stil (kan ikke skjules).
- Dra ≡ til høyre for å flytte (uendret).
- **+** viser/skjuler seksjonen «SKJULT · TRYKK + FOR Å VISE» under. Skjulte moduler er egne kort med hvitt **+**-merke i samme stil. Ikke wiggle.
- Lett haptikk ved start (12 ms), flytting og ✓.
- Samme komponent (`WiggleEditor`) skal brukes for Hjem, Finans, Mat, Familie og Mer.
