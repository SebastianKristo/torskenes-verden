# FEIL: Glimt i Huskeliste deler fortsatt ikke opp beskjeden

Vedlegg: `uploads/Screenshot 2026-10-20 at 19.30.51.png`. Original beskjed:
> «Husk å ta med pakke de må pakke må sendes fra butikken før vi drar til Strømstad Strømstad må huske å ta med tilhengeren hjem siden vi skal ha med noen store ting opp til Toten og da må jeg ha ha tilhenger»

Glimt jobbet (merket «LAGET MED GLIMT»), men resultatet ble **én** oppgave der tittelen er nesten hele teksten, og resten havnet i notatet. Den skulle blitt flere oppgaver.
Tidligere: `claude-code-huskeliste-glimt-ai-bakgrunn.md`, `claude-code-huskeliste-glimt-forstar.md`.

## Forventet resultat for denne teksten
1. **Ta med pakken som skal sendes fra butikken** · frist: før Strømstad-turen · liste: Handel/Ærend
2. **Ta med tilhengeren hjem fra Strømstad** · sted: Strømstad (påminn ved ankomst) · notat: «Trengs til store ting opp til Toten»
3. *(valgfritt, hvis Glimt finner det)* **Kjør store ting opp til Toten med tilhenger** · knyttet til 2

Kortet viser «Glimt delte beskjeden i 2 oppgaver» med **Angre** (slår sammen igjen) og **Endre**.

## Årsak (sannsynlig)
- Resultatet fra LLM-en brukes ikke. Koden lager oppgaven fra den lokale tolkningen først, og når AI-svaret kommer i bakgrunnen, oppdaterer den bare tittel/notat på **samme** oppgave i stedet for å erstatte den med flere.
- Eller: prompten ber om ett objekt (`{title, note}`) i stedet for en liste, eller JSON-svaret parses feil (kodeblokk ```json …```), og koden faller tilbake til «første setning = tittel».
- Splitting på punktum/linjeskift alene virker ikke her: teksten har verken punktum eller komma.

## Fiks
1. **Kontrakt:** Glimt skal alltid returnere en **liste**:
   ```json
   {"tasks":[{"title":"…","note":"…","due":null,"dueText":"før Strømstad-turen","place":null,"list":"…","linkTo":null}],"confidence":0.0}
   ```
   Lag en streng JSON-schema / `format: "json"` (Ollama) / `responseSchema` (Gemini). Fjern ```-gjerder før parsing. Ved ugyldig JSON: ett nytt forsøk med «Svar kun med gyldig JSON».
2. **Prompt** (kort, norsk):
   - Del beskjeden i separate, konkrete gjøremål. Hvert gjøremål starter med et verb i imperativ («Ta med», «Hent», «Send», «Kjøp»).
   - Fjern fyllord og gjentakelser («må huske å», «de må», doble ord som «Strømstad Strømstad», «ha ha»).
   - Begrunnelser («siden vi skal …») blir notat, ikke egen oppgave.
   - Steder blir `place`, tidsuttrykk blir `due`/`dueText`.
   - Maks 60 tegn i tittel.
   - Gi 2–3 korte eksempler i prompten, deriblant én uten tegnsetting (som denne).
3. **Bruk svaret riktig:** når AI-svaret kommer, **erstatt** den midlertidige oppgaven med `tasks[]` (behold id på den første, opprett resten). Behold originalteksten på alle («LAGET MED GLIMT · ORIGINAL BESKJED»). Det skal være én Angre-handling som tilbakestiller alt.
4. **Lokal forhåndsdeling** (før AI-en svarer, og hvis AI-en feiler): del på punktum/linjeskift/«og så»/«og husk», og på gjentatt stedsnavn («… Strømstad Strømstad må …» = grense). Fjern «husk å», «må huske å», «de må», «jeg må» i starten.
5. **Lengdevakt:** blir en tittel over 60 tegn, eller inneholder den flere verb-fraser («ta med … må … ta med …»), regnes svaret som mislykket. Da: nytt forsøk med større modell (Gemini) før det lagres.
6. **Logg** `input_len, model, tasks_count, parse_ok, path (local|ai)` per beskjed.

## Test
- Teksten over gir 2 (eventuelt 3) oppgaver som i forventet resultat.
- «kjøp melk egg og brød og hent pakken på kiwi i morgen» → «Kjøp melk, egg og brød» + «Hent pakken på Kiwi» (frist i morgen).
- «ring tannlegen» → én oppgave, uendret.
- Angre etter deling gir én oppgave med originalteksten.
