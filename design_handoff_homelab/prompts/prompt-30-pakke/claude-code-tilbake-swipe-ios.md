# Tilbake-swipe på iPhone virker ikke alltid

Fasit: `Mobil Papir App.dc.html` → `swInit()`.

## Årsaker (typiske)
1. Navigasjon er bare state (`page`, `hist`). Nettleseren/WebView har ingen historikk å gå tilbake i, så systemgesten gjør ingenting eller lukker appen.
2. Indre elementer fanger horisontale berøringer: karuseller, sveip-for-å-slette, kart (Leaflet/Windy-iframe), `touch-action: pan-y`/`none`, `preventDefault` i touchmove.
3. Iframes (kart, vær) svelger alle berøringer.

## Løsning
### A. Native skall (WKWebView / Capacitor)
- `webView.allowsBackForwardNavigationGestures = true`.
- **Hver** sideovergang og hvert fullskjermark gjør `history.pushState({page}, '')`. Lytt på `popstate` → kjør samme `back()` som tilbake-knappen. Da virker systemgesten og Android-tilbake likt.
- Ark/popuper legger også en historikk-oppføring, så swipe lukker arket først.

### B. Egen kantsveip (fasiten, fungerer også i PWA/Safari)
- Lytter på `document` i **capture**-fasen (`touchstart`/`touchmove` med `passive:false`/`touchend`), så indre komponenter ikke kan stjele gesten.
- Start kun hvis fingeren er ≤ 28 px fra venstre kant, man ikke er på Hjem og ingen redigeringsmodus/ark er åpen.
- Lås retning etter 8 px: horisontal hvis |dx| > 1,2·|dy| og dx > 0. Da `preventDefault()` + `stopPropagation()`.
- Siden følger fingeren (`translateX(dx)`) med skygge til venstre. Slipp > min(110 px, 28 % av bredden) → animer ut (260 ms, `cubic-bezier(.2,.8,.2,1)`), lett haptikk, `back()`. Ellers fjærer den tilbake.
- Legg en **usynlig 20 px kantsone** over iframes (kart) så gesten når frem.
- Ikke bruk `touch-action:none` på hele sider. Bruk `pan-y` kun på elementer som trenger horisontal sveip, og la dem ignorere berøringer som starter i kantsonen.

### Test
Sveip tilbake fra: Finans → transaksjon, Vær (over kart og timeslinje), Boliger (sveip-rader), Kalender (ukevisning), Chat (med tastatur oppe), Innstillinger → underside.
