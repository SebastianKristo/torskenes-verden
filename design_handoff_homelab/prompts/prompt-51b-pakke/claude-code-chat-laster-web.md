# Chat på web: lasteside i stedet for «Laster Chat …»

Fasit: `Chat Laster Web.dc.html` (tweak `tilstand`: laster · treg · feil). Vedlegg: `uploads/Screenshot 2026-10-26 at 14.46.36.png` (i dag: bare tekst midt på en tom side).

## Oppsett
- **Skjelett av hele Chat med en gang** (første tegning, før data): sidemeny 280 px med «Chat», Ny chat, søk, FESTET og SISTE 7 DAGER som grå linjer med skimmer, topplinje med modellpille og to runde knapper, skrivefeltet nederst (nedtonet, 75 %).
- **Midt på:** Glimt-orben (fargering som roterer sakte, ansiktet puster), tittel i Newsreader 28 «Laster Chat …», undertekst «Henter samtalene dine og gjør klar Glimt.»
- **Steg-liste** under: Kobler til Homelab (`home.kristo.no`) → Henter samtaler (`42 samtaler`) → Laster modell (`llama3.1:8b`). Ikon: grå prikk = venter, spinner = pågår, grønn ✓ = ferdig. Modellpillen øverst får grønn prikk og modellnavn når modellen er klar.

## Tilstander
- **laster** (normal): som over. Vis ikke lastesiden hvis alt er klart på under 300 ms (unngå blink).
- **treg** (> 8 s): tittel «Tar litt lengre tid enn vanlig», undertekst om at Homelab svarer sakte, sekunder teller på steget som henger, knapper «Prøv igjen» og «Bruk lokal modell».
- **feil** (tidsavbrudd 20 s eller nettverksfeil): «Fikk ikke kontakt med Homelab», orben grå og trist, steget får rød «!» og «svarer ikke», samme knapper. Ingen skimmer.

## Raskere lasting
- Tegn skjelettet fra statisk HTML/CSS (ikke etter at JS-bunten er lastet).
- Vis samtalelista fra cache (`localStorage`/IndexedDB: titler, sist brukt) med en gang, synk i bakgrunnen og bytt ut uten hopp.
- Hent samtaler og modelliste parallelt; skrivefeltet blir aktivt så snart modellen er valgt, selv om eldre samtaler fortsatt lastes.
- Lazy-load meldingene i en samtale (siste 30 først).

## Overgang
Når alt er klart: skjelettlinjene byttes med ekte rader (fade 150 ms), orben og stegene glir ut, og den tomme Chat-visningen (eller siste samtale) vises. Skrivefeltet får fokus.
