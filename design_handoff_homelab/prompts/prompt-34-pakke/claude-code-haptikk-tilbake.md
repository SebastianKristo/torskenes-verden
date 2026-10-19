# Haptikk på alle tilbake-knapper (mobil)

Fasit: `Mobil Papir App.dc.html` → `hapBack()`, kalt fra `back` (sidehodet «‹ Hjem / ‹ Finans»), `st.back` (Innstillinger ‹ Alle innstillinger / Integrasjoner), `chExit` (Chat ‹), `backLogin`, lukking av Finn-annonse og `go('hjem')` (Hjem-fanen fra en annen side).

- **Lett** impuls (`Haptics.impact({style: ImpactStyle.Light})` i Capacitor, `UIImpactFeedbackGenerator(style: .light)` på iOS, `HapticFeedbackConstants.KEYBOARD_TAP` / `CONFIRM` på Android). Fallback: `navigator.vibrate(10)`.
- Gjelder også:
  - **Sveip tilbake** fra venstre kant: når sveipet passerer terskelen og siden lukkes, ikke ved start.
  - Android-systemets tilbake-knapp/-gest (`App.addListener('backButton')`).
  - Tilbake i Kalender-appen («◀ Homelab»), Vær ✕, Rom ✕ og AI-kontroll Ferdig.
- Ikke dobbel haptikk: ett trykk = én impuls (debounce 120 ms).
- Følger innstillingen **Varsler og haptikk → Haptikk** (av = ingen).
