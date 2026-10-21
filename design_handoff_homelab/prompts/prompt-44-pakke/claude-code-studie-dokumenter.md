# Studie → Dokumenter: last opp vitnemål og karakterutskrift, Glimt leser og analyserer

Ønske 2026-10-21: «for studie la meg f.eks. laste opp vitnemål og karakterutskrift og slike ting og at glimt laster det opp og analyserer innholdet.»
Fasit: `Studie Dokumenter.dc.html` (ny fane **Dokumenter** i Studie, web og mobil).

## Opplasting
- Slippsone + «Velg fil» (PDF, JPG, PNG, HEIC, flere om gangen). Mobil: også «Ta bilde» (dokumentskanner: VisionKit / ML Kit Document Scanner) og Del-ark fra Studentweb/Vitnemålsportalen.
- Glimt viser **ekte steg med tid**: lastet opp og kryptert · leste PDF-teksten / bildet (OCR) · fant skole, dato og type · leste fag og karakterer · regnet ut snitt og studiepoeng.

## Hva Glimt henter ut
- **Type:** vitnemål (vgs), karakterutskrift (høyere utd.), attest, kursbevis, annet.
- **Felter:** skole, studieprogram, dato, og per emne: kode, navn, studiepoeng, karakter (A–F / 1–6 / bestått).
- **Sammendrag** i én–to setninger, og **«Glimt fant»** (f.eks. «90 av 180 sp, ferdig juni 2028», «Svakest: Fysikk (D), kan tas opp igjen», «R2 + Fysikk 2 oppfyller kravet for ingeniørfag», «Snitt C holder for master»).
- Snitt regnes **i backend** (vektet med studiepoeng, A=5 … E=1; vgs: karakterpoeng ×10 + realfagspoeng), aldri av LLM-en. Karakterer fargekodes (A/B, 5/6 grønn · C/4 nøytral · D/3 gul · E/F rød).

## Siden
- Tall øverst: studiepoeng registrert · snitt høyere utdanning (bokstav + tall) · snitt vgs · antall dokumenter.
- Liste (venstre) og valgt dokument (høyre): sammendrag, emnetabell (KODE · EMNE · SP · KAR.), «Glimt fant», spørsmålsfelt («hva er snittet i matte?», «har jeg strøk?») som svarer fra dokumentet.
- Knapper: **Legg emner i Studie** (emnene blir fag med farge i Studie/Kalender) · **Del som PDF** (kopi med vannmerke «Kopi») · Slett.
- Ny utskrift av samme studium: Glimt sammenligner med forrige («3 nye emner, snittet opp fra C til B−») og oppdaterer i stedet for å duplisere.

## Backend og personvern
- `POST /api/studie/docs` (multipart) → lagres kryptert på hjemmeserveren. Tekst: PDF-tekst (pdfplumber), ellers OCR (Tesseract nor+eng / Apple Vision på enheten). Tolkning: lokal modell (qwen2.5vl / gemma3) med JSON-skjema. Ingenting sendes til skyen uten at brukeren har slått det på.
- Bare eieren ser dokumentene. Sletting fjerner fil, tekst og embeddings.
- Gjør dokumentene søkbare for Glimt (`/api/glimt/search` scope «studie»).
