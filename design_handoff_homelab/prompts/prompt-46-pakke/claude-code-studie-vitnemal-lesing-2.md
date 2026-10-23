# Studie: Glimt klarer fortsatt ikke å lese vitnemål (andre gang)

Ønske 2026-10-23: «den sliter klarer ikke skjønne eller lese data fra vitenemål.»
Første rettelse: `claude-code-studie-vitnemal-analyse-original.md` (prompt 45). Den løste det ikke. **Ikke send hele dokumentet til én modell og håp på det beste.** Del jobben opp.

## Hvorfor det feiler (sannsynlig)
- Et vitnemål er en **tett tabell** (fag, karakter, studiepoeng, semester) over 1–3 sider. `qwen2.5vl:7b` på et nedskalert bilde av en hel A4-side klarer ikke å lese små tall pålitelig, og blander kolonner.
- Bildet skaleres ned (f.eks. til 1024 px), slik at tekst blir uleselig.
- Modellen får hele siden + et langt JSON-skjema i ett kall, og gir ufullstendig eller ugyldig JSON, som da kastes.
- Mange vitnemål (Vitnemålsportalen, Felles studentsystem) er **tekst-PDF**: tekstlaget er perfekt og trenger ingen AI for å leses, men blir likevel rendret til bilde.

## Ny pipeline
1. **Tekst først:** PDF med tekstlag → hent tekst med posisjoner (`pdfplumber` / `pdf.js getTextContent`). Rekonstruer rader ut fra y-posisjon og kolonner ut fra x-posisjon. Ingen AI til å lese tekst.
2. **Kjente formater deterministisk:**
   - **Vitnemålsportalen / FS (UiO, NTNU, UiB, OsloMet …):** kolonner Emnekode · Emnenavn · Semester · Karakter · Studiepoeng. Parse med regler. Karakter A–F, Bestått/Ikke bestått. Studiepoeng som tall med komma.
   - **Videregående (vitnemål VGS):** Fag · Standpunkt · Eksamen skriftlig/muntlig, karakter 1–6. Timer/årstimer.
   - Kjennes ingen av dem igjen → steg 3.
3. **Skannet/bilde:** OCR med **Tesseract** (`nor+eng`, 300 dpi) eller PaddleOCR, med bokser. Bruk OCR-teksten + tabellrekonstruksjon som i steg 1. Visjonsmodellen brukes bare som reserve.
4. **Visjonsmodell (reserve):** del siden i **horisontale striper** (f.eks. 8–12 rader per bit), full oppløsning (min. 1600 px bredde). Ett kall per stripe med kort skjema `{rows:[{code,name,semester,grade,ects}]}` og Ollama `format`. Slå sammen.
5. **Glimt tolker, koden regner:** Modellen (tekstmodellen, liten kontekst) brukes bare til å tolke det uklare: hvilken skole, hvilken grad, og om en rad er en overskrift eller et fag. **Snitt og sum studiepoeng regnes av koden** (A=5 … E=1, vektet med studiepoeng; VGS: snitt av tallkarakterer), aldri av modellen.
6. **Validering:** karakter i gyldig sett, studiepoeng 0–60 per emne, sum studiepoeng mot totalen som står på dokumentet (hvis den finnes). Avvik → merk raden «Sjekk» i gult.

## UI
- Fremdrift per steg: «Leser tekst …» → «Fant 14 emner» → «Regner snitt …».
- Resultatet er **redigerbart**: tabell der hver celle kan rettes, og rader med «Sjekk» er markert. «Legg til emne» nederst.
- Ved siden av: **originalen** med markering av raden man redigerer (bboks fra steg 1/3).
- Feiler alt: «Klarte ikke å lese dokumentet. Er det et bilde? Prøv en skarpere kopi eller PDF fra Vitnemålsportalen.» + **Fyll inn selv**.
- Logg hvilken metode som ble brukt (tekst / regler / OCR / visjon) og tid per steg.

## Test (med ekte filer)
- PDF fra Vitnemålsportalen (UiO og NTNU) → alle emner, riktig snitt, ingen AI-kall for lesing.
- Skannet vitnemål (iPhone-bilde, skrått) → ≥ 90 % riktige rader, resten merket «Sjekk».
- VGS-vitnemål → fag og karakterer 1–6, riktig snitt.
- Be brukeren laste opp vitnemålet som feilet, og bruk det som test.
