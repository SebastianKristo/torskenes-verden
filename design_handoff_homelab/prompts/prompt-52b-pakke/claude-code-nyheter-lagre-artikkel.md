# Nyheter: lagre artikler offline (mobil + web)

## Hva
La brukeren lagre en nyhetsartikkel slik at hele artikkelen lastes ned og kan leses senere, også uten nett og etter at den er fjernet fra kilden.

## Hvor
- Mobil (iOS + Android): bokmerke-knapp i artikkelvisningen (øverst til høyre) og «Lagre» i hold-meny på artikkelkort.
- Web: bokmerke-knapp i artikkelvisningen og ved hover på artikkelkort.
- Ny fane/filter i Nyheter: «Lagret».

## Viktig: hele artikkelen, ikke RSS-sammendraget
RSS-feeden inneholder bare tittel, ingress og ev. et kort sammendrag. Det er **ikke** nok å lagre RSS-elementet.
- Ved lagring skal backend alltid hente selve artikkelsiden fra `item.link` og lagre full brødtekst.
- RSS-feltene (`title`, `description`, `content:encoded`) brukes bare som fallback og til metadata.
- Sjekk etter uttrekk: hvis brødteksten er omtrent like lang som RSS-sammendraget (f.eks. < 1,5× eller < 800 tegn), regn det som mislykket og prøv igjen med alternativ uttrekker / AMP-versjon (`<link rel="amphtml">`) / headless nettleser for JS-rendrede sider.
- Først når alt feiler: lagre sammendraget og merk tydelig «Kun sammendrag» med knapp «Prøv å laste ned på nytt».
- Lagrede artikler skal åpnes fra lokal kopi, aldri hente RSS på nytt.

## Nedlasting
1. Ved lagring henter backend artikkelens URL og trekker ut lesbart innhold (Readability-lignende): tittel, ingress, forfatter, dato, kilde, brødtekst, bilder.
2. Bilder lastes ned og lagres på serveren (ikke hotlink).
3. Lagres som HTML + metadata i databasen: `POST /api/news/saved { url }` → `{ id, status }`.
4. Status på kortet: «Laster ned…» → «Lagret». Ved feil (betalingsmur, blokkert): lagre det som finnes (tittel, ingress, bilde, lenke) og merk «Kun sammendrag».
5. Mobil: last ned lagrede artikler til lokal lagring også, så de kan leses offline.

## Lesing
- Lagrede artikler åpnes i appens egen leservisning (samme typografi som Nyhetsleser), ikke i nettleser.
- Vis «Lagret 28. okt.» og lenke «Åpne original».
- Fjern: sveip (mobil) eller «Fjern fra lagret».

## Synk
Lagrede artikler synkes mellom mobil og web via kontoen. Glimt kan søke i lagrede artikler.

## Design
Se `Lagre og logo.dc.html` (1c artikkel mobil, 1d Lagret mobil, 1e Lagret web).
