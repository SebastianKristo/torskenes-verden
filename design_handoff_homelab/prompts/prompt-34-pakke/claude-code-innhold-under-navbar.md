# Mobil: innholdet skal scrolle UNDER fanelinjen (ingen fargestripe bak navbaren)

Vedlegg:
- `uploads/Screenshot 2026-10-19 at 19.52.16.png` (ekte app, **feil**): innholdet kuttes rett over fanelinjen («Prøveperioder»-kortet stopper brått), og bak og under fanelinjen står en flat bakgrunnsstripe.
- `uploads/Screenshot 2026-10-19 at 20.19.31.png` (prototypen, **riktig**): kortene fortsetter under den svevende fanelinjen og skannknappen og er synlige mellom og under dem.

Fasit: `Mobil Papir App.dc.html` → scroll-containeren (`scRef`): `margin-bottom: 0`, `padding-bottom: 112px` (svevende) / `calc(100px + env(safe-area-inset-bottom))` (fast). Fanelinjen er `position: absolute; bottom: 12px; z-index: 5` **over** innholdet.

## Fiks
1. **Scroll-containeren går helt til bunnen av skjermen**, også bak fanelinjen og hjemstreken. Fjern `margin-bottom`/`bottom: <navbarhøyde>`/`height: calc(100% - 84px)` og lignende på scroll-containeren og forelderen.
2. **Plass til siste kort:** `padding-bottom: calc(navbarhøyde + 24px + env(safe-area-inset-bottom))` ≈ 112 px, så siste kort kan scrolles helt opp over fanelinjen.
3. **Fanelinjen (og skann-knappen) ligger oppå** (`position: fixed/absolute; bottom: 12px + safe-area`). Den skal **ikke** ligge i en egen rad/wrapper med bakgrunnsfarge. Ingen `background` på wrapperen rundt navbaren. Bare selve pillen har `#1b1a17` + `backdrop-filter: blur(14px)`.
4. Sjekk at ingen forelder har `overflow: hidden` med en høyde som slutter over navbaren. Det var det som kuttet «Prøveperioder» i skjermbildet.
5. `html, body` og app-roten skal ha samme bakgrunn som siden (`#f3efe6` / bakgrunnsbilde), `height: 100dvh`, og `viewport-fit=cover` i meta viewport.
6. Gjelder **alle sider** med fanelinje (Hjem, Finans, Mat, Sporing, Søk, Mer, Familie …) og begge stiler (svevende og fast). Med fast stil skjuler den mørke linjen innholdet bak seg, men innholdet skal likevel gå bak den og ikke stoppe over den.
7. Native (Capacitor): `ios.contentInset: 'never'`, så WKWebView ikke legger til egen bunnmarg.

## Test
- Hjem: scroll sakte. Kortene skal gli under fanelinjen og skannknappen, og kunne sees mellom dem og under pillen. Ingen flat stripe.
- Siste kort kan scrolles helt opp over fanelinjen.
- iPhone med og uten hjemknapp. Rotér skjermen.
