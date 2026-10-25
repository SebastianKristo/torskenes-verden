# FinansHub web: kvitteringspanelet scroller med hele siden

Skjermbilde: `uploads/Screenshot 2026-10-24 at 23.00.44.png` (Transaksjoner → valgt «jem & fix» til høyre).
Problem: når en transaksjon er åpen i høyrepanelet, må man bla ned hele siden for å se resten av kvitteringen (varelinjer osv.). Scroll inne i panelet flytter hele siden.

## Fiks
Panelet skal være **sticky og ha egen scroll**, uavhengig av transaksjonslista.

```css
.tx-layout { display: grid; grid-template-columns: minmax(0,1fr) 420px; gap: 24px; align-items: start; }
.tx-detail {
  position: sticky;
  top: 24px;                              /* under toppfeltet; bruk høyden på headeren hvis den er sticky */
  max-height: calc(100vh - 48px);         /* 100dvh på Safari */
  overflow-y: auto;
  overscroll-behavior: contain;           /* scroll i panelet ruller ikke siden når du når bunnen */
  scrollbar-gutter: stable;
}
.tx-detail__head { position: sticky; top: 0; z-index: 1; background: inherit; } /* logo, navn, × alltid synlig */
```

- Forelderen (grid/flex-containeren) må **ikke** ha `overflow: hidden/auto`, ellers virker ikke `position: sticky`. Sjekk alle forfedre opp til scroll-containeren.
- Hvis siden selv scroller i en `<main>` med `overflow-y:auto` (ikke `window`), regnes `top` fra den. Bruk `max-height: calc(100% - 48px)` relativt til den høyden, eller sett `height` på `main` til `100vh`.
- Når du velger en ny transaksjon: `detailEl.scrollTop = 0`, ikke `window.scrollTo`.
- Er vinduet smalere enn ca. 1100 px og panelet havner under lista: vis det i stedet som et skuff/ark fra høyre (`position: fixed; inset: 0 0 0 auto; width: min(480px, 100vw); overflow-y: auto`) med mørk bakgrunn bak, og lås scroll på `body` mens det er åpent.
- Esc lukker panelet.

## Test
1. Åpne en transaksjon med mange varelinjer. Scroll med musa over panelet: bare panelet ruller, lista står stille.
2. Scroll lista: panelet blir stående i ro i toppen.
3. Bytt transaksjon: panelet starter øverst.
