# Studie (web): nytt design

Ønske 2026-10-21: «lag helt nytt design i studie fanen» (vedlegg `uploads/Screenshot 2026-10-21 at 13.29.05.png`)
Fasit: `Studie Web Ny.dc.html` (klikkbar). Erstatter dagens Studie-side i `Homelab Papir Web.dc.html`. Papir-tema, følger valgt tema.

## Oppsett (maks 1280, flytende)
- **Topp:** «ONSDAG 21. OKTOBER · UKE 43» (mono, rød) + **Studie** (Newsreader 64). Til høyre faner **Oversikt · Uke · Karakterer · Dokumenter**. Strek 2 px under.
- **Glimt-felt** i full bredde (Glimt-orb, «Spør Glimt: …», rød «✦ Spør»). Svaret vises som et mørkt kort under feltet med ✕.
- **Oversikt**
  - **Nå-kort** (mørkt): rom, fag (Newsreader 52), fremdrift i timen + «34 min igjen», «NESTE» fag/rom/tid nederst. Utenfor skoletid: neste time med nedtelling.
  - **I dag** som tidslinje 08–15 med blokker og rød nå-strek. Glimt-tips under (friminutt, hva du bør lese).
  - Tre kolonner: **Frister** (nedtellingsbrikke: rød ≤ 2 dager, gul ≤ 5, nøytral ellers), **Karakterer** (6 felt-stolpe 1–6, grønn ≥ 5, svart 4, gul ≤ 3, snitt i overskriften), **Dokumenter** (2 siste + «Last opp»).
- **Uke:** én kolonne per skoledag. I dag er markert. Frister og prøver er røde brikker.
- **Karakterer:** tall-kort (snitt vgs, snitt høyere utdanning, studiepoeng, stryk) + alle fag med stolpe.
- **Dokumenter:** opplastingsfelt + liste til venstre, **Glimt har lest** til høyre (sammendrag, tabell kode/fag/SP/karakter med fargebrikker, «Legg emner i Studie», «Del som PDF», «Slett»). Logikk som i `claude-code-studie-dokumenter.md`.

## Data
Timeplan fra Kalender (`cal=s`, tp.uio.no / iCal), frister fra Canvas/kalender, karakterer fra Studie + leste dokumenter. Glimt-spørsmål går til Ollama med timeplan, frister og karakterer som kontekst.
