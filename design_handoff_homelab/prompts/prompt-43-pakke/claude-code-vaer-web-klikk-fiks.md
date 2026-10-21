# Vær (web): ingenting kan trykkes eller åpnes

Ønske 2026-10-21: «jeg får ikke trykket eller åpnet noe som helst på vær i web» (vedlegg `uploads/Screenshot 2026-10-21 at 10.06.40.png`: Vær i desktop-oppsett med stedsliste til venstre, Strömstad valgt, regn-animasjon).
Fasit: `Vaer.dc.html` (desktop: `dk.on`) og `Vaer Web.dc.html`. Der virker alle klikk.

## Symptom
Siden tegnes riktig, men ingen klikk når fram: stedskortene, søkefeltet, «+», «Forhold ›», modusknappene, dagradene, kartet, «Fullskjerm», solnedgang-kortet og lukk-X. Musepekeren endrer seg ikke over knappene. Det betyr nesten alltid at et usynlig lag ligger over alt.

## Finn laget først
I nettleserkonsollen på Vær-siden:
```js
document.elementFromPoint(innerWidth/2, innerHeight/2)
document.elementsFromPoint(160, 140).slice(0,5)   // over Oslo-kortet
```
Er det første elementet ikke selve knappen/kortet, er det synderen. Fiks det laget, ikke flere z-index-hack.

## Sannsynlige årsaker (sjekk i denne rekkefølgen)
1. **Vær-effekten (regn/snø/sol) mangler `pointer-events: none`.** Canvas eller div for `fx` ligger `position:absolute; inset:0` over innholdet. Fasit: canvaset har `pointerEvents:'none'`, og glød-laget under har `pointer-events:none`.
2. **Et lukket ark/modal er fortsatt montert**, bare med `opacity:0` eller `visibility` på innholdet (stedssøk, kart-fullskjerm, sammenlign, måling-ark, «Rediger»). Bakteppet med `inset:0; z-index:22–23` fanger da alle klikk. Lukkede ark skal **avmonteres** (fasit: `sc-if` på `mp.open`, `cmp.open`, `pl.open`, `ms`), eller få `pointer-events:none` når de er lukket.
3. **Sticky toppfelt med stor høyde.** Fasit: den sticky tittellinjen har `height:0` og `pointer-events:none`; bare knappene inni har `pointer-events:auto`. Er den laget som full høyde eller uten `pointer-events:none`, dekker den alt.
4. **Ytre ramme i Homelab web.** Vær monteres i en `position:fixed; inset:0`-beholder. Sjekk at bakgrunnsbildet, mørkleggings-gradienten (`OV`) og evt. side-overgangslag over den har `pointer-events:none` og lavere z-index enn Vær.
5. **Haptikk-hjelperen.** Den skjulte `<label>` med `<input switch>` skal være `position:fixed; left:-99px; width:1px; height:1px; opacity:0; pointer-events:none`. Er den laget med `inset:0` eller full størrelse, blokkerer den hele siden.
6. **Kart-iframen (Windy/Yr).** Kartet i rutenettet skal ha fast høyde i kortet. Har iframen `position:absolute`/`fixed` uten en `position:relative; overflow:hidden`-forelder, kan den legge seg over siden og spise klikkene.

## Regel som skal gjelde alle lag
- Pyntelag (effekter, gradienter, glød, bakgrunnsbilder, sticky skall): `pointer-events: none`.
- Interaktive barn inni slike lag: `pointer-events: auto`.
- Ark og modaler: monteres bare når de er åpne. Esc og klikk på bakteppet lukker og avmonterer.

## Test
- Klikk Bergen i lista → hovedvisningen bytter til Bergen.
- Søkefeltet og «+» åpner stedssøk; Esc lukker, og siden kan klikkes igjen etterpå.
- «Forhold ›», modusknappene (sky/dråpe/vind), en dagrad, kart-fanene og «Fullskjerm», solnedgang-kortet og lukk-X virker.
- Gjenta med regn, snø og klart vær (alle effektene), og etter å ha åpnet og lukket hvert ark én gang.
- `document.elementFromPoint` over et kort skal returnere kortet eller et barn av det.
