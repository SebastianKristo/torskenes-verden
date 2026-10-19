# Mobil: Innstillinger uten bunnmeny og skann-knapp

Fasit: `Mobil Papir App.dc.html` → `navVis`, `fab.on`, `cPb`.

- I **Innstillinger** og alle undersidene (Integrasjoner, Varsler, Backup, Profil …) skjules den flytende bunnmenyen og den røde skann-knappen. Samme som Nordlys/System, Chat og Kalender.
- Navigasjon skjer med «‹ Mer» / «‹ Alle innstillinger» oppe til venstre, og med tilbake-sveip.
- Bunnpadding på innholdet: 28 px + safe-area (i stedet for 112 px), så siste gruppe ikke får tom plass under.
- iOS: push Innstillinger med `.toolbar(.hidden, for: .tabBar)`, og skjul FAB-overlayet når ruten er i Innstillinger.
