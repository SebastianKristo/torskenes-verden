# Fold (brettet modus): søkefeltet på Hjem skal ligge over tastaturet

Fasit: `Mobil Papir App.dc.html` med `wide` (1c Android brettbar i `FinansHub Mobil v2.dc.html`). Skjermbilde: `uploads/Screenshot 2026-10-23 at 09.28.49.png`.

## Problem
Søkefeltet «Spør om været, eller skriv «time hos …»» med ✦ AI nederst i venstre Glimt-panel blir liggende bak tastaturet når man skriver.

## Ønsket oppførsel
- Når søkefeltet får fokus, løftes **søkefeltet** opp slik at det ligger rett over tastaturet (12 px luft), også når tastaturet er delt eller flytende på Fold.
- Animer løftet sammen med tastaturet (synkront med IME-animasjonen, ingen hopp).
- Brief-kortet over søkefeltet skyves opp eller tones ut hvis det ikke er plass. Hilsen og temperatur kan skjules mens man skriver.
- Svar/forslag fra Glimt vises **over** søkefeltet i panelet, ikke bak tastaturet.
- Høyre panel (Nå · I dag · Hjemme · Økonomi) skal ikke flytte seg eller endre størrelse.
- Når tastaturet lukkes, går alt tilbake til vanlig plass.

## Android-implementasjon
- `WindowCompat.setDecorFitsSystemWindows(window, false)` og `android:windowSoftInputMode="adjustResize"`.
- Compose: `Modifier.imePadding()` (eller `WindowInsets.ime.union(WindowInsets.navigationBars)`) **kun på venstre Glimt-panel / søkefeltets container**, ikke på hele skjermen.
- Synkron animasjon: `WindowInsetsAnimationCompat.Callback` / Compose `imeAnimationTarget`.
- Test: Galaxy Z Fold, brettet ut, stående og liggende, Samsung Keyboard og Gboard (også delt/flytende tastatur), og sammenbrettet skjerm (der skal det fungere som før).

Gjelder også iPad: søkefeltet følger tastaturet (`keyboardLayoutGuide`), samme regler.
