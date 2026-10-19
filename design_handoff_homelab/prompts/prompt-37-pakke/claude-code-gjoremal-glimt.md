# Gjøremål: Glimt-funksjoner (alle 11)

Ønske 2026-10-19: «legg til alt det», det vil si alle forslagene til hva Glimt kan gjøre i Gjøremål.
Fasit: `Huskeliste.dc.html` → `gRun()`, `gParse()`, `gAsk()`, `guess()`, `matIng()`, `packList()`, `splitSugg()`, `tips`, `geo`, `mode="brief"`. Brief-kortet er innbygd i `Glimt Brief.dc.html`.

## Glimt-feltet (øverst på siden, under liste-chipsene)
«Spør Glimt eller skriv en oppgave …», med ✦-spinner, 📷-knapp (bilde) og send. Under feltet står forslagschips. Svaret vises i kortet, med resultatliste og **Angre**.

1. **Vanlig tekst → oppgave med felter.** «Påminn meg å kansellere Overleaf 21.09 kl 9, viktig, hver måned» gir tittel, dato, tid, Viktig (alarm), Gjenta og liste. Støtter i dag/i morgen/overmorgen/ukedag/neste uke, dd.mm(.åå), kl hh(.mm), «påminn X min/t/dag før», #tagger og navn (Ingrid/Pål/Emma) som ansvarlig. «Kjøp melk, egg og kaffe» blir én vare per ting i Handel.
2. **Lim inn tekst / bilde.**
   - Lim inn flere linjer (SMS, e-post, oppskrift): én oppgave per linje, punkttegn fjernes.
   - 📷 Bilde av handlelapp/oppskrift: lokal visjonsmodell (Qwen 2.5 VL / Gemma 3) leser varene → Handel med #handlelapp. Prototypen viser eksempelvarer.
3. **Fra Mat.** «Legg ukas matplan i handlelisten» leser `hl_matplan` (siste uke, rettenes ingredienser) og legger dem i Handel med #matplan. Varer som allerede står åpne i Handel, hoppes over, og svaret sier hvor mange som ble hoppet over.
4. **Del opp.** I detaljarket: **✦ Del opp med Glimt** gir 3–6 deloppgaver (LLM, med lokale maler som fallback: flytting, hytte, bursdag, filter, domene).

## Holde orden
5. **Sortere.** I detaljarket: «✦ Glimt foreslår: Handel · Pål · #hytte · påminn ved butikk» + **Bruk**. Bygger på nøkkelord (dagligvarer → Handel, hytte → Hytta, jobb-ord → Jobb, hjem-ord → Hjem) og navn i teksten. I appen: LLM-klassifisering med lokal fallback.
6. **Slå sammen like.** Glimt-kort: «2× «Melk» i Handel» + **Slå sammen** (beholder én, slår sammen tagger og deloppgaver).
7. **Rydde i forfalte.** Ved ≥ 2 forfalte: «4 gjøremål er forfalt» + **Flytt til i morgen** / **Arkiver**.

## Huske på for deg
8. **Stedspåminnelse.**
   - Detaljarket har **Påminn på sted**: Ved matbutikk / Når jeg kommer hjem / Når jeg drar hjemmefra / På jobb / På hytta.
   - Glimt-kort i Handel: «Påminn meg ved butikken» + **Slå på**. Varselet blir «Du er ved Kiwi Pilestredet: Melk, egg, kaffe …» + **Vis**. Prototypen viser det som et banner (**Test varsel**).
   - Appen: iOS `CLMonitor`/region monitoring med opptil 20 geofencer. Butikker hentes fra MapKit/Places nær brukeren. Hjem/hytte kommer fra Familie-soner. Android: `GeofencingClient`.
   - Bare for brukerens egne lister og delte lister hen er medlem av.
9. **Now Brief.** Kortet «Gjøremål · 3 gjøremål i dag» med de tre første (forfalt + i dag) og avkrysning rett i briefen, + «Åpne Gjøremål ›». Glimt leser det opp: «Du har tre gjøremål i dag, ett er forfalt.»
10. **Fra kalenderen.** Når en hendelse nærmer seg (Hytta · Hafjell om 12 dager): «Lage pakkeliste og huske brøyting?» → **Lag pakkeliste** legger 6 ting i Hytta (#pakkeliste) + «Bestill brøyting» to dager før. Generelt: reise/hytte/bursdag/eksamen gir passende maler. Kortet vises én gang per hendelse, og «Ikke nå» skjuler det.

## Spørre
11. Spørsmål i Glimt-feltet (spørreord eller «?»):
   - «Hva har jeg igjen i dag?» viser i dag og forfalte.
   - «Hva har Ingrid lagt til i Handel?» bruker `by` (hvem som opprettet) eller ansvarlig.
   - «Når kjøpte vi sist kaffe?» viser siste avkryssede vare med dato og hvem.
   - «Hva er forfalt?»
   - Ukjent: «Spør meg i Chat for mer.»

## Data
- Ny på oppgaven: `by` (opprettet av), `place` (stedspåminnelse), `tags` (inkl. matplan/handlelapp/pakkeliste), `doneAt` (brukes til «sist kjøpt»).
- Alt Glimt legger til kan angres i 10 s, og vises med ✦ i historikken.
- Tilgang følger listemedlemskap (private/delte lister). Glimt ser aldri andres private lister.


## Endring 2026-10-19: Glimt ligger i den runde knappen (ikke på siden)
Vedlegg: `uploads/Screenshot 2026-10-19 at 23.47.24.png`.
- På mobil er Glimt-kortet (felt + 📷 + forslag) **fjernet fra siden**. Den røde runde knappen nede til høyre har nå **Glimt-ikonet** (fylt ✦, standard Glimt-stjerne) i stedet for **+**. Tooltip: «Glimt · skriv eller spør».
- **Trykk:**
  - Tomt «Ny oppgave …»-felt: åpner **Glimt-arket** nedenfra (håndtak, ✦ Glimt + **Ferdig**, så felt/📷/send, forslagschips og svar/angre).
  - Står det tekst i «Ny oppgave …»: teksten sendes til Glimt (tolkes med dato/tid/liste osv.), og arket åpnes med resultatet.
- «Ny oppgave …»-feltet + Enter legger fortsatt til en vanlig oppgave raskt.
- Glimt-kortene (like oppgaver, forfalte, butikk, hytte) står fortsatt i listen.
- Web/brett (uten dokket felt): Glimt-kortet vises inline øverst som før.
- **Fiks (vedlegg `uploads/Screenshot 2026-10-19 at 23.50.02.png`):** «Ny oppgave …»-feltet og Glimt-knappen la seg **oppå** Glimt-arket. Nå sender Gjøremål `huske-sheet {open}` når et ark åpnes (Glimt, Detaljer eller Liste), og appen skjuler da det dokkede feltet og knappen til arket lukkes. Native: dokk og FAB er en del av siden og skjules når `.sheet` vises.
