# Fold/iPad: knappene for wiggle-redigering flyttes til navbaren

Fasit: `Mobil Papir App.dc.html` med `wide`.

Problem: i brettet modus kolliderte +-knappen (Legg til widget), Tilbakestill og ✓ (Ferdig) øverst med headeren.

## Ny oppførsel (kun brettet modus: Fold utbrettet, iPad)
- Under redigering vises **ikke** knapperaden øverst.
- Knappene ligger i stedet **nederst i den vertikale navbaren**, stablet loddrett, 46 px runde:
  1. **+ Legg til widget**: glass `rgba(255,255,255,.14)`, med et lite merke som viser antall skjulte widgets
  2. **Tilbakestill** (↺), bare når oppsettet er endret
  3. **✓ Ferdig**: aksentfarge (`--lab`)
- Knappene spretter inn (scale + fade, 320 ms) når redigeringen starter.
- Skann-knappen (+) i navbaren skjules mens man redigerer, så det ikke blir to +-knapper.
- Innholdet får ikke ekstra toppmarg under redigering i brettet modus.
- Telefon / sammenbrettet: uendret (knapperaden øverst).
