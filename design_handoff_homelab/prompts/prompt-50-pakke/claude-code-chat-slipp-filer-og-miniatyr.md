# Chat: slipp filer i chatten + miniatyrbilde i meldingen

Vedlegg: skjermbilde 15.54.44 (web-chat, gpt-oss:latest). Gjelder web og mobil (iPad/Fold med dra-og-slipp, telefon med deling/innliming).

## Feil i dag
1. Bildet vises bare som tekstpille («Bruktefile.jpeg» / «Bilde»), ikke som bilde.
2. Modellen svarer «jeg ser ingen kvittering». **gpt-oss er kun tekst og kan ikke se bilder**, så bildet ble aldri lest.

## 1. Dra og slipp
- Hele chatområdet (meldingslisten + feltet) tar imot `dragenter/dragover/drop`. Teller `dragenter/dragleave` så det ikke blinker over barneelementer.
- Mens man drar: et lag over chatten med `rgba(243,239,230,.92)`, stiplet ramme `2px dashed #1b1a17` med radius 24px og innfelt 16px, og midt på teksten **«Slipp for å legge ved»** (Newsreader 28px) med «Bilder, PDF, tekst · maks 20 MB» under (14px #6b665c).
- Også: lim inn bilde fra utklippstavlen (`paste`) i feltet, og «+»-knappen som før.
- Flere filer samtidig (maks 10). For store eller ukjente filer får en melding i appen: «Filen er for stor (maks 20 MB)».

## 2. Vedlegg i feltet før sending
- Over tekstfeltet: en rad med miniatyrer (64×64, radius 12, `object-fit:cover`) og en rund ×-knapp (22px) øverst til høyre på hver.
- PDF og andre filer: et 64×64-kort med filtype (PDF i mono) og filnavn i ellipsis under.
- Mens filen lastes opp: en tynn fremdriftslinje i bunnen av miniatyren. Send-knappen er av til alt er lastet opp.

## 3. Miniatyr i meldingen
- Brukerens boble: bildet(e) over teksten, høyrejustert. Ett bilde vises med maks bredde 240px og maks høyde 240px (radius 16). Flere bilder vises i et rutenett med 2 kolonner, 120px hver og 4px mellomrom.
- Trykk åpner bildet i full skjerm (lysboks) med «Lukk», «Last ned» og sveip mellom bildene. Esc og sveip ned lukker.
- Filpillen ved Glimt-svaret («Bruktefile.jpeg») blir en liten miniatyr (28px, radius 6) + filnavn, og trykk åpner lysboksen.
- Lagre miniatyrbilder (maks 480px, webp) sammen med samtalen, så historikken laster fort og synkes mellom mobil og web. Originalen hentes først når lysboksen åpnes.

## 4. Riktig modell for bilder
- Sjekk hva modellen kan via Ollama `/api/show` → `capabilities` inneholder `vision` (lagre i modellisten).
- Bilde vedlagt + valgt modell uten vision:
  - **Auto** (standard): send til beste lokale vision-modell (f.eks. gemma3:12b / qwen2.5vl / llava) for akkurat denne meldingen. Vis den under svaret: «Lest med gemma3:12b fordi gpt-oss ikke kan se bilder».
  - Ingen vision-modell installert: kjør OCR (tesseract-nor, som for kvitteringer) og send teksten til gpt-oss med «[Tekst fra bilde: …]». Vis «Lest med lokal OCR».
- I modellvelgeren: et lite «Ser bilder»-merke på modeller med vision.
- Kvittering i chat («les kvitteringen og skriv det i en tabell») bruker samme kvitteringsleser som Finans og svarer med en markdown-tabell (Vare | Antall | Pris), med «Legg i Finans ›» under.

## Test
- Dra et JPG inn i chatten: laget vises, slipp, miniatyren står i feltet, send, og bildet vises i boblen.
- Med gpt-oss valgt: svaret leser faktisk kvitteringen (via vision-modell eller OCR) og sier hvilken modell som ble brukt.
- Last inn samtalen på nytt eller åpne den på mobil: miniatyrene er der.
