# Søkepillen på Hjem: dra ned for å åpne i Chat

Ønske 2026-10-20: «la meg dra den pillen ned fra pille ikonet å så fin animasjon som åpner den inn i en chat.» (skjermbilde: `vedlegg/sok-pille-dra.png`)
Fasit: `Mobil Papir App.dc.html` → Hjem → søk med Glimt → svar-pillen («Tenker på «…» …» / svaret).

## Gest
- Håndtaket nederst i pillen (34×4 pt) får et større treffområde (hele bunnen, 22 pt høyt). Dra kan starte hvor som helst på pillen unntatt knapper.
- **Opp** = lukk (som i dag).
- **Ned** = åpne i Chat:
  - Pillen strekker seg: bunnmargen vokser (0,65 × dra) og pillen flytter seg litt ned (0,35 × dra). Håndtaket blir bredere (34 → 80 pt).
  - Tekst under innholdet tones inn: «Dra ned for å åpne i Chat» → ved 70 pt «Slipp for å åpne i Chat», håndtaket blir lysere, lett haptikk (`UIImpactFeedbackGenerator(.light)`) når terskelen passeres, begge veier.
  - Etter 70 pt gir draget motstand (0,4).
  - Slipper du før 70 pt: fjærer tilbake (0,25 s, cubic-bezier(.2,.8,.2,1)).

## Animasjon inn i Chat
- Slipp etter 70 pt: pillen vokser fra sin egen ramme til fullskjerm på 0,4 s (matched geometry). Hjørner 26 → 0, bakgrunn mørk glass → appens bakgrunn.
- Pilleinnholdet («Åpner i Chat …») tones ut på 0,15 s. Chat-innholdet tones inn med 0,12 s forsinkelse: Glimt-tittel, spørsmålet som din boble til høyre, og «skriver»-prikker.
- Ved 0,4 s byttes til ekte Chat (ny samtale) med spørsmålet allerede sendt. Svaret som var på vei i pillen brukes hvis det er ferdig, ellers fortsetter strømmen i Chat (ikke spør på nytt).
- iOS: `matchedGeometryEffect` mellom pillen og chat-containeren + `.transition(.opacity)` på innhold. Android: `SharedTransitionLayout` / `sharedBounds`. Web: FLIP (mål pillens rect, animer top/left/width/height til 0/0/100%/100%).
- «Fortsett i Chat ›»-knappen bruker samme animasjon.
- Redusert bevegelse: hopp over vekst-animasjonen, bruk 0,2 s krysstoning.
