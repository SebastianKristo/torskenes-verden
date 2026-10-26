# Mikrofon i søkefeltet på Hjem – nytt ikon og opptaksvisning

Referanse: `uploads/Screenshot 2026-10-26 at 14.13.06.png` (mørkt kort med tekst øverst og kontroller nederst). Fasit: `Homelab.dc.html` (`micVals()`, søkefeltet på Hjem).

## Ikon i søkefeltet (hvile)
- Fjern den røde runde knappen. Nytt ikon: kapsel (6×11,5, radius 3) + bue + fot, strek 1,9, farge = tekst (ink), ingen bakgrunn.
- 36 px rund trykkflate (44 px treffområde på iOS/Android), lys bakgrunn (`--bg`) ved trykk/hover. Står mellom tekstfeltet og «✦ AI».

## Opptak (trykk på mikrofonen)
Søkefeltet utvides til et kort i **samme farge som søkefeltet** (`--card`, tekst `--ink`, ingen fargebytte), radius 26, samme bredde. Ingen egen rad under feltet lenger («Lytter … 0:01 · trykk igjen for å stoppe · Avbryt» fjernes).
- **Øverst:** teksten som blir sagt, live (17 pt Manrope), med blinkende markør. Tomt: «Snakk nå …» i dempet farge.
- **Nederst, fra venstre:**
  - **×** (40 px, `--bg`): avbryt, forkast teksten.
  - **Bølgeform i full bredde** (fyller all plass mellom × og ■): én høy strek (start) + streker/prikker som ruller mot venstre og følger lydnivået (høye streker når man snakker, prikker i stillhet). Streker i `--ink`. Tid «0:03» i mono, dempet, etter.
  - **■ Stopp** (40 px, samme grå): stopper opptaket, teksten legges i søkefeltet så man kan rette den.
  - **↑ Send** (40 px, terrakotta `#C8633F`): stopper og sender med en gang (samme som Enter).
- Lett haptikk når opptaket starter.

## Teknisk
- iOS: `SFSpeechRecognizer(locale: nb-NO)` med `shouldReportPartialResults`; nivå fra `AVAudioEngine`-tap (RMS → strekhøyde 3–22 pt), 11 oppdateringer/s.
- Android: `SpeechRecognizer` + `onRmsChanged` for bølgeformen.
- Web: `webkitSpeechRecognition` (`lang='nb-NO'`, `interimResults`).
- Bølgeform tegnes i egen liten komponent (egen timer), ikke ved å rendre hele Hjem på nytt.
- Overgang felt → kort: høyden animeres 0,25 s; tastaturet lukkes.
