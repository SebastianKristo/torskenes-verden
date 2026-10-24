# Prompt 49: Glimt som lærer, planlegger og svarer raskere

Mottatt 2026-10-24. Status: **venter** – starter først når prompt 47 er ferdig og `npm run eval` er grønn på Mac minien (ekte modell). Plan: `docs/glimt-plan-49.md`.

## Forutsetninger (brukerens tekst)
Denne prompten bygger på Glimt-ombyggingen fra prompt 47: kontekstbygger, minne med aliaser, planlegger med JSON-schema, felles datoparser, felles AI-klient og kø, spor per forespørsel og `npm run eval`.
- Ikke start før prompt 47 er ferdig og eval er grønn på Mac minien. Er den ikke det, si fra og vent.
- Gjenbruk modulene fra prompt 47. Ikke lag egne varianter av datoparser, AI-klient, kø eller minne.
- All ny funksjonalitet skal kunne slås av hver for seg i innstillingene.
- «Finansdata forlater aldri huset» og tilsvarende personvernvalg gjelder alt som bygges her. Ingenting sendes til eksterne tjenester uten at innstillingen tillater det.
- Les gjennom dokumentet og vis meg en plan med rekkefølge før du bygger. Mål effekten med eval før og etter hver del.

Maskinen er fortsatt en Mac mini M4 med 16 GB og én hovedmodell (`qwen3:8b`). Alt under skal gjøre Glimt smartere og raskere uten større modell, ved at koden husker, gjenbruker og forbereder mer.

## Del 1 – Oppskrifter som lærer av bruk («skills»)
Når Glimt løser en oppgave riktig, lagres hvordan den ble løst. Neste gang en lignende forespørsel kommer, får planleggeren oppskriften som eksempel, eller den kjøres direkte.

Tabell `recipes`: `id`, `created_at`, `last_used_at`, `use_count`, `success_count`, `fail_count`, `example_query`, `query_template` (f.eks. «når er neste gang jeg skal til {person}»), `intent` og `plan` (planleggerens JSON med argumenter som variabler, f.eks. `{"tool":"calendar_search","args":{"terms":"{person.aliases}","direction":"next"}}`), `slots` (minneoppslag, datoparser, sted), `embedding` av `example_query`, `status`: `candidate` | `active` | `disabled`.

Vellykket bare når: (1) planen validerte på første forsøk eller etter én reparasjon, (2) alle verktøykall lyktes og Steg G-valideringen besto, (3) ingen retting, angring eller omformulering i de neste 2 meldingene eller 5 minuttene, (4) eventuelt tommel opp. Ny oppskrift er `candidate`; blir `active` etter 2 vellykkede bruk eller med én gang ved tommel opp. Aktiv oppskrift som feiler 2 ganger på rad → `disabled` og logges.

Bruk: (1) embedding-søk, topp 3 over terskel, kombinert med intent-filter når det er tydelig; (2) som few-shot før de faste eksemplene, maks ca. 600 tokens; (3) hurtigvei ved likhet ≥ 0,92, `active`, minst 5 vellykkede bruk og 0 feil de siste 10, og alle variabler kan fylles deterministisk i kode – hopp over planleggeren, svarformuleringen kjøres fortsatt, logg det; (4) aldri hurtigvei for handlinger som endrer data (opprette, slette, betale, sende) uten bekreftelse, med mindre det er slått på per oppskrift.

Lære av feil: ved «nei, jeg mente …» lagres feil og riktig plan; den riktige blir ny `candidate`, den feile et negativt eksempel brukt bare når en ny forespørsel ligner sterkt. Rettelser legges automatisk inn som testtilfeller i `eval/learned/`. Ikke rør eksisterende testfiler i `eval/`.

Innsyn: side «Glimt lærer» – se, teste, redigere, slå av og slette oppskrifter, med statistikk per oppskrift.

## Del 2 – Planlagte oppgaver i naturlig språk
Eksempler: «Send meg strømprisene hver morgen kl. 7» · «Minn meg på å betale husleia den 1. hver måned» · «Hver fredag kl. 16: oppsummer hva jeg har brukt penger på denne uka» · «Si fra hvis strømprisen går over 2 kr i morgen» · «Gi meg værmeldingen for Toten hver fredag kl. 15 i vinter» · «Stopp strømprisvarselet» / «Hvilke faste oppgaver har jeg?» / «Flytt morgenbriefen til 06:30».

Tolkning: intent `schedule_create` / `schedule_list` / `schedule_update` / `schedule_delete`; planleggeren returnerer hva (en vanlig Glimt-forespørsel) og når (råtekst). Når tolkes i kode med den felles datoparseren, utvidet med gjentakelse («hver morgen kl. 7», «hver hverdag», «den 1. hver måned», «annenhver tirsdag», «hver fredag i vinter», «i 2 uker») → RRULE (RFC 5545) eller cron med Europe/Oslo og ev. sluttdato. Betingede varsler lagres som oppgave + betingelse evaluert i kode (f.eks. `max(price_nok_kwh) > 2.0`) – modellen vurderer aldri betingelsen. Glimt bekrefter alltid tolkningen før lagring («Hver dag kl. 07:00 sender jeg deg strømprisene for i dag (NO1). Stemmer det?»).

Kjøring: egen scheduler som overlever omstart, jobber i databasen; hver kjøring er en vanlig Glimt-forespørsel med bakgrunnsprioritet; forhåndsberegning (start f.eks. 15 min før); tapte kjøringer kjøres én gang hvis < 2 timer siden, ellers hopp over og logg; stille timer 23–07 med mindre klokkeslettet er bedt om; levering push i appen (Telegram/e-post hvis Del 6), kanal per oppgave; logg hver kjøring (tid, resultat, varighet, levering), vis siste kjøringer per oppgave i innstillingene.

Strømpriser: åpen kilde for spotpris per prisområde (f.eks. hvakosterstrommen.no); sjekk først om Glimt eller Home Assistant allerede henter strømpriser og gjenbruk. NO1 standard, konfigurerbart; vis billigste og dyreste timer.

## Del 3 – Bedre forståelse i samtaler
Samtaletilstand per samtale (siste intent, siste verktøyargumenter, siste entiteter: hendelse-id, person, sted, tidsrom, abonnement); planleggeren får tilstanden og feltet `refers_to_previous: true`. Eval: «Hvordan er været i Oslo i morgen?» → «og i Bergen?»; «Legg inn tannlege fredag kl 10» → «flytt den til 11»; «Hva er det dyreste abonnementet mitt?» → «si opp det».

Entitetsregister: ett felles register over personer, steder, butikker, abonnementer og faste hendelser med aliaser, brukt av minne, kalendersøk, finans og planlagte oppgaver. «Hjemme», «hytta», «Toten», «jobben» og «skolen» slås opp til faktiske steder.

Oppfølgingsspørsmål: ved usikkerhet, spør med konkrete valg («Mener du frisørtimen hos Nina eller middagen med Nina på fredag?»), vist som knapper i appen.

## Del 4 – Raskere svar
- Fast prompt-prefiks for KV-cache: statisk først i fast rekkefølge (systeminstruksjoner, verktøybeskrivelser, faste eksempler), dynamisk etterpå (dato, minne, oppskrifter, historikk, spørsmål). Mål med `prompt_eval_count` og `prompt_eval_duration` i sporet.
- Hold hovedmodellen varm: last `qwen3:8b` ved oppstart og etter visjonsmodellen med et lite oppvarmingskall; `keep_alive` lenge nok.
- Strømming til appen token for token, med statuslinje mens verktøyene jobber («Sjekker kalenderen …»).
- Svar-cache med utløp per datatype: vær 15 min, strømpris til neste time, nyheter 30 min, kalender og finans ingen cache eller til data endres. Nøkkel = normalisert plan.
- Parallelle verktøykall for uavhengige steg; modellkall fortsatt ett om gangen gjennom køen.
- Hurtigveien fra Del 1.
Mål og rapporter median og p90 svartid før og etter, per intent.

## Del 5 – Minnet holder seg ryddig
Nattlig oppsummering kl. 03 (planlagt oppgave): foreslå nye fakta som `pending` til godkjenning; ingenting inn i minnet uten ja. Oppdag motstridende fakta og spør. Fakta som ikke er brukt på lenge markeres, men slettes aldri automatisk.

## Del 6 – Glimt i flere kanaler (valgfritt, bygg sist)
Telegram-bot (ev. Signal via signal-cli) med samme motor, minne, oppskrifter og planlagte oppgaver. Bare brukerens konto (whitelist på bruker-id), alle andre ignoreres og logges. Bilder går inn i kvitteringskjeden fra prompt 48. Planlagte oppgaver kan levere hit.

## Del 7 – Kvalitet over tid
Nattlig eval: planlagt oppgave kjører `npm run eval` og `eval/learned/` mot ekte modell hver natt, varsler bare når noe grønt har blitt rødt. Ukerapport søndag kveld: antall forespørsler, andel løst på første forsøk, rettelser, nye oppskrifter, hurtigvei-andel, median svartid – kort, én melding.

## Eval-tester som skal legges til
1. «Send meg strømprisene hver morgen kl. 7» → bekreftelse med riktig tolkning; etter «ja» finnes en jobb med RRULE daglig 07:00 Europe/Oslo.
2. «Minn meg på å betale husleia den 1. hver måned» → månedlig jobb, dag 1.
3. «Si fra hvis strømprisen går over 2 kr i morgen» → betinget jobb med betingelse i kode, ingen modellvurdering.
4. «Hvilke faste oppgaver har jeg?» → liste fra databasen.
5. «Stopp strømprisvarselet» → riktig jobb deaktiveres etter bekreftelse.
6. Samme spørsmål om Nina stilt 3 ganger → oppskrift blir `active`, og tredje gang brukes den som eksempel (synlig i sporet).
7. Rettelse («nei, jeg mente middagen») → ny oppskrift + negativt eksempel + ny test i `eval/learned/`.
8. «og i Bergen?» etter et værspørsmål → riktig sted, samme tidsrom.
9. «Flytt den til 11» etter opprettet hendelse → riktig hendelse flyttes.
10. Andre identiske værspørsmål innen 15 min kommer fra cache, og sporet viser det.
Hver test 3 ganger, rapporter suksessrate.

## Rekkefølge (brukerens)
1. Del 4 (fast prompt-prefiks, varm modell, strømming). 2. Del 3 (samtaletilstand, entitetsregister). 3. Del 1 (oppskrifter). 4. Del 2 (planlagte oppgaver). 5. Del 5 og 7. 6. Del 6 hvis brukeren sier ja.

## Leveranse
Eval før og etter per del inkl. svartider; hvordan se, redigere og slette oppskrifter og planlagte oppgaver; hva som må gjøres på Mac minien; hvilke deler som er på/av som standard.
