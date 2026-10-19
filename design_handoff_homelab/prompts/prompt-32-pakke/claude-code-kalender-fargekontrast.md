# Kalender: hendelsesfarge forsvant mot dagens kolonne

Fasit: `Kalender.dc.html` (Dag/3 dager/Uke).

## Feil
Dagens kolonne hadde en svak rødlig tone (`lab` 5 %). Fag med varme farger (f.eks. MEK1300, oransje `#b8691c`) fikk bakgrunn `farge 17 % + kort`, som ble nesten lik kolonnen. Boksen var nesten usynlig, og bare stripen til venstre syntes.

## Fiks
- **Ingen bakgrunnstone på dagens kolonne.** I dag markeres med rød dato-sirkel i hodet og rød nålinje (som i iOS Kalender).
- Helgekolonner beholder en svak grå tone (`line` 30 %).
- Hendelsesbakgrunn: `color-mix(in oklab, {farge} 22%, var(--card))`, med venstrestripe 3 px i full farge. Prøver: fylt med fagfargen og hvit tekst.
- Regel: en hendelses bakgrunn skal aldri ligne kolonnebakgrunnen. Har kolonnen en tone, må hendelsen være minst ΔL 6 % lysere eller mørkere.
