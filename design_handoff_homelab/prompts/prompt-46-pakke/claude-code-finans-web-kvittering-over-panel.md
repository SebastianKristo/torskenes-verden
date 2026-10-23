# Økonomi (web): «Vis original kvittering» havner under sidepanelet

Ønske 2026-10-23: «i økonomi på web. når jeg åpener orginal kvittering viser sidebaren til høyere over.»
Skjermbilde: `uploads/Screenshot 2026-10-23 at 12.00.37.png` (FinansHub → Boliger → Strømstad → utgift Clas Ohlson → «Vis original kvittering»).
Fasit: `Boliger Web.dc.html` (utgiftspanel `z-index:55`, original kvittering `z-index:200`, fullskjerm `z-index:210`).

## Feil
Vinduet «ORIGINAL KVITTERING» åpnes **bak** utgiftspanelet til høyre. Panelet dekker høyre del av vinduet (Lukk-knappen, Endre/Last ned og verdiene i tabellen er kuttet), og mørkleggingen treffer bare midtflaten.

## Årsak (sjekk)
Kvitteringsvinduet rendres inne i hovedinnholdet (eller i et element med `transform`, `filter`, `backdrop-filter` eller `overflow:hidden` + egen `z-index`), som lager en egen stacking context. Da hjelper ikke høy `z-index`, og panelet, som ligger i rot-laget, havner over.

## Rett
- Render alle modaler og ark (original kvittering, fullskjerm-visning, bekreftelser) i en **portal på `document.body`** (React `createPortal`), ikke inne i siden.
- Faste lag i hele web-appen: sidemeny 10 · toppfelt 20 · høyrepanel 55 · modal 200 · fullskjerm-bilde 210 · toast 300.
- Mørkleggingen i modalen dekker **hele** vinduet, også panelet.
- Når modalen lukkes, står panelet åpent som før (ingen tap av utfylte felter).
- «Se originalen ⤢» i modalen åpner fullskjermvisningen over alt.
- Sjekk de samme vinduene i Transaksjoner, Kvitteringer, Finn-handler og Subscription OS.
