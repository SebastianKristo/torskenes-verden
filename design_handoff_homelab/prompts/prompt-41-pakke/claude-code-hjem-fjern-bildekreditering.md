# Fiks: fjern bilde-kreditering under været på Hjem (iOS)

Ønske 2026-10-20: «få fjernet teksten her, jeg vil ikke se den. dette er fra ios appen.» (skjermbilder: `vedlegg/hjem-hero-kreditering-1.png`, `vedlegg/hjem-hero-kreditering-2.png`)

## Feil
Under «Skyet · 16:18 ›» i hero på Hjem vises en ekstra linje: «Skyet · 8° · Free Nature Stock · Wikimedia Commo…». Den finnes ikke i designet.

## Riktig (fasit: `Mobil Papir App.dc.html` → Hjem-hero)
- Høyre side av hero: kun temperatur (stor) og «Skyet · 16:18 ›». Ingen linje under.
- Fjern hele kreditering-/bildetekst-raden (vær-oppsummering + fotograf/kilde) fra hero på iOS. Sjekk samme visning på Android, web, Mac og widgets, og fjern den der også hvis den finnes.
- Ikke la det stå tom plass etter raden: «Skyet · 16:18 ›» skal ligge nederst i hero med samme bunnmarg som hilsenen til venstre.
- Kreditering for bakgrunnsbilder (Wikimedia Commons-lisens) flyttes til **Innstillinger → Tilpass → Bakgrunn**, som en liten linje under valgt bilde: «Foto: {forfatter} · {lisens} · Wikimedia Commons» med lenke til filsiden. Ikke på Hjem.
- Gjelder alle bakgrunner (Vær nå, Oslo, Planeter …), ikke bare skybildet.

## Sjekk
- Hjem i lys og mørk modus, alle bakgrunnsvalg: ingen tekst under «Skyet · 16:18 ›».
- VoiceOver leser ikke krediteringen på Hjem.
