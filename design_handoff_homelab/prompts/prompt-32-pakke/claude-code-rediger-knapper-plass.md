# Redigeringsmodus (wiggle): + og ✓ skal ha egen plass

Fasit: `Mobil Papir App.dc.html` → `eb` (knapperaden) + `ePt` / `clip` på scroll-containeren.

## Feil
I redigeringsmodus på Hjem lå «+» og «✓» oppå første widget (søkefeltet) og over «−»-merket, særlig når man hadde scrollet litt.

## Fiks
- Knapperaden (+ / + N skjulte · ✓ Ferdig) ligger fast øverst i innholdsområdet, 8 px fra toppen, 40 px høy.
- I redigeringsmodus får innholdet **74 px toppadding**, så første widget og «−»-merket (stikker 14 px opp) starter under knappene med luft.
- Når man scroller i redigeringsmodus, **klippes innholdet 62 px fra toppen** (ellers 23 px). Widgets glir da under en ren stripe og aldri bak knappene.
- Gjelder alle wiggle-redigeringer: Hjem, Mer, Finans-navbar.
- iOS: legg knappene i en egen `safeAreaInset(edge: .top)` over `ScrollView`, ikke som overlay.
