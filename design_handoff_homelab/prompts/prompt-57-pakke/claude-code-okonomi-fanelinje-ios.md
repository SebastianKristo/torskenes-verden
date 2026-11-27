# iOS: Økonomi-fanelinjen (Oversikt · Transaksjoner · Finn · Glimt · Mer)

Ønske (2026-11-27): «også lag nytt design for denne, den ligner ikke og stikker ut. også på øknonmi, jeg ser ikke ting under navbaren, det skal jeg kunne»
Vedlegg: `uploads/Screenshot 2026-11-27 at 17.52.24.png`.
Fasit: `Økonomi Fanelinje iOS.dc.html` **Valgt: 1a**, fanene ligger over hovedlinjen. Se bort fra 1b.

## Stil (lik hovedlinjen)
- Pille: `rgba(27,26,23,.62)` + `backdrop-filter: blur(18px) saturate(1.4)`, radius 999, padding 4, skygge `0 10px 22px -12px rgba(0,0,0,.5)`.
- Fanene tar bredden navnet trenger (`flex: 1 1 auto`). Inaktive faner: **hvit** tekst (#fff), 12,5 px, Manrope 600. Aktiv fane: lys pille `#f3efe6` med tekst `#1b1a17`, 32 pt høy.
- «Transaksjoner» forkortes til «Transaksj.» (ikke «Transa…»).
- **Tilpass-knappen (sliders-ikonet) fjernes.** Fanepillen fyller hele bredden. Du redigerer fanene ved å holde inne en fane (vibrering, dra for å endre rekkefølge, rødt − fjerner, + legger til), på samme måte som på web.
- Den lyse/grå stripen bak fanene fjernes helt.

## Innholdet skal synes bak linjene
- Rullevisningen går helt ned til bunnen av skjermen (`ignoresSafeArea(.container, edges: .bottom)`). Det er ingen hvit eller beige flate bak fanelinjen eller hovedlinjen.
- `padding-bottom` på innholdet = høyden på hovedlinjen + fanelinjen + 12 + safe-area (≈ 170 pt). Da kan den siste raden rulles fram.
- Skann-knappen (rød) står over linjene: bottom ≈ 150 pt.

Ferdig når: listen kan rulles under begge linjene og synes gjennom glasset, faneteksten er hvit, og linjen ser ut som hovedlinjen.
