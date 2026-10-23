# Studie (web): vitnemål blir ikke analysert + vis originalfil

## Feil
Opplastet vitnemål ga ingen karakterer/fag. Undersøk hele kjeden: opplasting → filtype (PDF med tekst, skannet PDF, HEIC/JPG/PNG) → OCR/tekstuttrekk → Glimt (`qwen2.5vl:7b` for bilder) → parsing → lagring.
- Skannede PDF-er: rendre hver side til bilde og send til visjonsmodellen. Tekst-PDF: bruk tekstlaget først.
- HEIC: konverter til JPG før analyse.
- Strukturert output (JSON-skjema): skole, dato, fag[], karakter, studiepoeng, snitt. Valider; manglende felter merkes «Ikke funnet» i stedet for å gi tom side.
- Vis tydelig status: «Analyserer …», «Fant 14 fag», eller feilmelding med «Prøv igjen».
- Logg teknisk feil i Docker-loggen.

## Se originalen
- I dokumentdetaljen: knapp **«Vis original»** + miniatyr. Åpner fullskjerm-visning (PDF-visning med sider / bilde med zoom), med Last ned og ✕.
- Gjelder web og mobil.
