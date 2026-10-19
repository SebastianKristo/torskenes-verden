# Wiggle-modus: + og ✓ ligger oppå første widget

Fasit: `Mobil Papir App.dc.html` → Hjem → hold inne en widget.

## Feil
Verktøylinja (+ legg til widget til venstre, ✓ Ferdig til høyre) var plassert absolutt øverst i innholdet. Den dekket søkefeltet og minus-knappen øverst til venstre på første widget.

## Fiks
- Når redigeringsmodus er på (Hjem-widgets, Familie/Finans-rekkefølge, alle wiggle-menyer): legg **64 px padding-top** på scroll-innholdet så første widget flyttes ned under verktøylinja.
- Animer: `padding-top 0 → 64px`, 280 ms, `cubic-bezier(.2,.8,.2,1)`. Tilbake til 0 når man trykker ✓.
- Verktøylinja beholder posisjonen øverst (8 px under toppen av innholdet). Den skal aldri overlappe minus-knappen (−) til en widget.
- iOS: `.safeAreaInset(edge: .top)` med verktøylinja eller en `Spacer().frame(height: 64)` med `withAnimation(.snappy)`. Android: `AnimatedVisibility` + `animateDpAsState` for toppadding.
