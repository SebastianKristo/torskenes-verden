# Fold/iPad: skann-ikon i navbaren + søkefeltet i Glimt-panelet virker

Fasit: `Mobil Papir App.dc.html` med `wide`. Skjermbilde: `uploads/Screenshot 2026-10-23 at 09.31.56.png`.

## 1. Skann-ikon
- Skann-knappen i den vertikale navbaren viser **skann-ikonet** (fire hjørner + strek i midten, samme som den flytende skann-knappen på telefon), ikke «+».
- 46 px rund, aksentfarge (`--lab`), hvitt ikon 22 px. Oppførsel uendret (trykk = valg, hold = last opp).

## 2. Søkefeltet i venstre Glimt-panel
Feil: feltet «Spør om været, eller skriv «time hos …»» var bare en knapp som prøvde å fokusere et skjult søkefelt, så ingenting skjedde.
- Gjør det til et **ekte tekstfelt** i panelet (samme søkelogikk som Hjem-søket: Glimt, Google, DuckDuckGo).
- Trykk → tastaturet åpnes, og feltet løftes over tastaturet (se `claude-code-fold-sok-over-tastatur.md`).
- Enter eller **✦ AI** sender. ✕ tømmer feltet når det er tekst.
- Forslag over feltet mens man skriver: «Legg i kalender» (når teksten er en avtale) og «Legg i huskelisten» (når det er en oppgave).
- Svaret fra Glimt vises i et kort rett over feltet («GLIMT · spørsmålet», «Glimt tenker …» → svaret med kilde), med ✕ for å lukke. Maks 220 px høyt, kan scrolles.
