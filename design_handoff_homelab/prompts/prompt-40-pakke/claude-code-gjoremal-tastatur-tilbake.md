# Gjøremål (mobil): baren over tastaturet + tilbake går alltid til Hjem

Fasit: `Mobil Papir App.dc.html` → `hk.b`, `fab.b`, `back`, `backLbl`.

## 1. «Ny oppgave …»-baren følger tastaturet
- Når du trykker i baren nederst på Gjøremål, skal **baren og Glimt-knappen (✦) løftes opp og ligge rett over tastaturet** (8 px luft), ikke bli liggende bak det.
- Høyden måles med `visualViewport` (samme `kbH` som Chat bruker): `bottom = kbH + 8px` når tastaturet er åpent, ellers `max(18px, safe-area + 8px)`.
- Bevegelsen animeres (`bottom .24s cubic-bezier(.2,.8,.2,1)`) så den glir opp sammen med tastaturet.
- Siden skal ikke scrolle eller hoppe; lista bak blir stående.
- iOS: bruk `visualViewport` resize/scroll og nullstill `window.scrollTo(0,0)` når iOS skyver siden.
- Android: `WindowInsets.ime` (Compose `imePadding()`) på baren. React Native: `KeyboardAvoidingView`/`useAnimatedKeyboard`.
- Lukkes tastaturet (✓ eller trykk utenfor) glir baren tilbake.

## 2. Tilbake fra Gjøremål går alltid til Hjem
- Gjøremål kan åpnes fra Hjem-widgeten eller fra **Mer → Gjøremål**. Uansett skal tilbakeknappen hete **«‹ Hjem»** og gå til Hjem (historikken nullstilles).
- Sveip fra venstre kant / Android tilbake-knapp gjør det samme.
