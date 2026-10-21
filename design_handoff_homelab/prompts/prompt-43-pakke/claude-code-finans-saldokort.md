# Finans → Oversikt: nytt saldokort (4b i Papir)

Ønsker 2026-10-21: «lag nytt design på denne» → «den skal ikke være noe spesielt stort, ikke vis inn eller igjen» → «lag den litt større» → «3a er riktig innhold bare lag et kulere litt større design» → «4b er bra bare gi riktig papir theme».
Fasit: `Mobil Papir App.dc.html` → Finans → Oversikt → kort **f1** (`finSal`). Retninger: `Finans Saldo Varianter.dc.html` (4b er oppsettet, men i Papir-farger).

## Innhold (bare to tall)
1. **Saldo · alle kontoer** (stort). Ikke «Inn» og ikke «Igjen».
2. **Brukt i <måned>** med dagen i måneden.

## Oppsett
- Kort: `card`, 26 pt hjørner, 20 pt luft, tynn kant i `line` (70 %) og myk skygge. Hele kortet kan trykkes → **Kontoer**.
- Rad 1: «SALDO · ALLE KONTOER» (IBM Plex Mono 10,5, sperret, `lab`) + rund «›»-knapp (30 pt, `bg`).
- Rad 2: saldo i **Newsreader 500, 52 pt**, «kr» i 30 pt `mut`. Minus vises med ekte minustegn (−).
- Rad 3: innfelt flate (`bg`, 18 pt hjørner): **månedsring** 46 pt (conic, `lab` for andel av måneden som har gått, resten `line`) med dagnummer **«21.» på én linje** i midten (tall og punktum i samme tekst, ikke to elementer i et grid — da havner punktumet under tallet) · «Brukt i oktober · dag 21 av 31» (12,5 `mut`) · beløp i Newsreader 26 pt.
- Mørk modus: samme oppsett med mørke `card/bg/ink/line`. Ingen hardkodede farger.
- Høyde ca. 170 pt.

## Data
- Saldo = sum av alle kontoer (Brukskonto + Sparekonto + Kredittkort).
- Brukt = sum utgifter fra 1. i måneden til i dag (samme tall som Liste filtrert på måneden).
- Ringen = `dagIMåned / dagerIMåned`.
