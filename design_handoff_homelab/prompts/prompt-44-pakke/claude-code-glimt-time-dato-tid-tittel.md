# Glimt-søk (Hjem): «time 12.5 16:30 kino dune.»

Ønske 2026-10-21 (vedlegg `uploads/Screenshot 2026-10-21 at 13.02.10.png`): skriver man «time 12.5 16:30 kino dune.» i Glimt-feltet på Hjem, skal det bli en **time i kalenderen 12. mai kl. 16:30 med navnet «Kino dune»**.
Fasit: `Mobil Papir App.dc.html` → `QAP.QP()`.

## Feilen
Tittelen ble hentet som «teksten før første tall». Når tittelen står **etter** dato og tid, ble den tom og falt tilbake til «Avtale».

## Regel
1. Finn dato og tid først: `12.5` (dag.måned), `12.05`, `12/5`, `12. mai`, `16:30`, `16.30`, `kl 16`, `1630`, `i morgen`, `fredag`, `neste uke`.
2. **Tittel = alt som er igjen** når dato, tid, «kl», ukedager, «i morgen» og innledningsord (`time`, `avtale`, `legg til`, `book`, `ny`) er fjernet, uansett hvor i teksten tittelen står. Fjern tegn i start og slutt (`. , ; : –`), stor forbokstav.
3. «time hos X» bruker X som før. Kjente typer (frisør, tannlege, lege …) gir varighet.
4. Dato uten år som har vært: neste år. Ingen tid: hele dagen.

## Tester (skal passere)
| Tekst | Tittel | Dato | Tid |
|---|---|---|---|
| time 12.5 16:30 kino dune. | Kino dune | 12. mai | 16:30–17:30 |
| time hos frisør Nina 24.10 kl 14 | Frisør Nina | 24. okt | 14:00–14:45 |
| tannlege fredag 0930 | Tannlege | fredag | 09:30–10:30 |
| kino 1630 i morgen | Kino | i morgen | 16:30–17:30 |

Ollama (hvis brukt) får den lokale tolkningen som fasit og skal bare rette tittel/sted, aldri dato og tid (se `claude-code-kalender-glimt-klokkeslett.md`). Samme parser brukes i Kalender, Hjem (mobil) og Hjem (web).
