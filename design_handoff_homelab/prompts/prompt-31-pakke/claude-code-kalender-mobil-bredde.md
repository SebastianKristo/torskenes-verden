# Kalender mobil: lange steder (URL) gjorde visningen for bred

Fasit: `Kalender.dc.html`.

## Feil
Hendelser fra timeplan-import har sted som «Pilestredet park 35 U2005 https://link.mazemap.com/…». Den lange URL-en uten mellomrom presset NÅ-/NESTE-kortet bredere enn skjermen, så hele kalenderen ble bredere. Bunnmenyen (Dag · 3 dager · Uke · Måned) ble kuttet til høyre, og dagkolonnen ble strukket.

## Fiks
- **Fjern URL-er fra stedsteksten** overalt der den vises kort (NÅ-kort, hendelsesbokser, liste, søk): `noUrl = t => t.replace(/\s*https?:\/\/\S+/g,'').trim()`. URL-en beholdes i hendelsen og vises som lenke («Åpne kart ↗») i detaljarket.
- Stedspillen i NÅ-kortet: `flex: 0 1 auto; min-width: 0; max-width: 55%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
- NÅ-kortet: `min-width: 0; max-width: calc(100% - 24px)`.
- Rotcontaineren: `width: 100%; min-width: 0; overflow: hidden`, så ingen tekst kan gjøre kalenderen bredere enn skjermen.
- iOS: `.lineLimit(1)` + `.truncationMode(.tail)` på sted, `.frame(maxWidth: .infinity)` på kortet. Bruk `NSDataDetector` til å skille ut lenken.
