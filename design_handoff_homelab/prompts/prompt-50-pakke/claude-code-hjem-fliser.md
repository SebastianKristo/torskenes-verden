# Hjem: fliser (retning 1d) i mobilappen

Fasit: `Mobil Papir App.dc.html` → widget `h4` (tidligere «Snarveier»/minikort, nå «Fliser») og `tl` i `renderVals()`. Designmal: `Hjem Retninger.dc.html` 1d.

## Plassering
Hero, Dagsbrief, Bibelvers og søkefeltet er uendret. Der de tre minikortene (Finans · Mat · Domener) sto, kommer et rutenett med 2 kolonner og 10px mellomrom, med 24px radius på flisene.

| Flis | Størrelse | Farge | Innhold | Trykk |
|---|---|---|---|---|
| Avgang | 1 kol × 2 rader, min 212px | #1b1a17 / tekst #f3efe6 | AVGANG (#f29a8a), linjemerke, stoppnavn, **minutter 64px + «min» ved siden av**, «Så 20 Galgeberg · 2 min» på én linje (ellipsis) | Avganger-siden |
| Finans | 1×1 | kort | FINANS, beløp, «2 kvitteringer» (lab) | Finans |
| Middag | 1×1 | #f4e3cf / #3a2410 | MIDDAG (#8a4f12), rett | Mat |
| Familie | 1×1 | #e1ece4 | FAMILIE (#2f6b4a), avatarer som overlapper hverandre, «Alle på plass» | Familie |
| Domener | 1×1 | kort | DOMENER, besøk, «● alle oppe» (pos) | Domener |

- Rekkefølge: Avgang til venstre over to rader, med Finans og Middag til høyre. Familie og Domener på raden under.
- Når fliser er på, skjules det gamle Avganger-kortet (Min reise vises fortsatt) og Posisjon-kortet (`h6`), så ingenting står dobbelt.
- Huskeliste, Kalender, Bursdager, Bolig, Media og Nyheter står som før under flisene.
- «Familie»-teksten: «Alle på plass» når alle er i en kjent sone, ellers «Ingrid · Går · Bislett» for den første som er på vei.
- Lagres i `papir_home_tiles` (standard på, `'0'` = gamle minikort). Legg en bryter i Innstillinger → Utseende: «Hjem som fliser».
- Mørkt tema: Avgang beholder mørk bakgrunn med en tynn kant `1px solid rgba(255,255,255,.08)`. Middag og Familie får mørke toner (oklch med samme fargetone, L ≈ 0.3) og lys tekst.
- Fold/iPad: rutenettet får 4 kolonner (Avgang 1×2, de andre 1×1).
- Flisen er én widget i redigeringsmodus (kan flyttes og skjules som før).
