# Glimt-søk i Finans: rask søkedatabase (butikk + vare + dato) før Ollama

Ønske 2026-10-20: «slike søk, burde gå fort. du har butikken i spørsmålet, og mat typen og slikt. lag en database som ollama glimt kan lese fort og effektivt igjennom.» (vedlegg `uploads/Screenshot 2026-10-20 at 21.04.54.png`: «kvittering til tomater på ica» står på «Ollama tenker … 0 s»).
Henger sammen med `claude-code-finans-glimt-abonnement.md` (hurtigvei og tidsmåler).

## Mål
«kvittering til tomater på ica» skal gi svar på **under 300 ms**, uten LLM. Ollama brukes bare til fritekst som ikke lar seg tolke, og da med ferdig utvalgte rader (maks 40).

## 1. Søkedatabase (SQLite FTS5, eller Postgres `tsvector` + `pg_trgm`)
Ny tabell som oppdateres når en kvittering leses, en transaksjon importeres eller noe endres:
```
search_items(
  id, kind ('line'|'receipt'|'tx'), receipt_id, tx_id, home_id,
  date, merchant_id, merchant_norm,   -- «ica kvantum» → «ica»
  item_text, item_norm,               -- «TOMATER CHERRY 250G» → «tomat cherry»
  item_category,                      -- «grønnsaker», «frukt», «kjøtt», «meieri», «kaffe», «batteri»…
  amount, qty, unit, account, has_image
)
FTS: search_fts(item_norm, merchant_norm, item_category, synonyms) med tokenizer for norsk (unicode61 + egen stemming: tomater→tomat, lyspærer→lyspære).
Indekser: (merchant_id, date), (item_category, date), (home_id, date).
```
- **Normalisering:** små bokstaver, fjern størrelser/vekt/koder (`250G`, `1,5L`, `4PK`, varenummer), fold æøå-varianter, stem norske flertall.
- **Synonymer og varekategori** (tabell `item_synonyms`): tomat → tomater, cherrytomat, plommetomat; kaffe → espresso, filterkaffe, kapsler; melk → lettmelk, helmelk … Varekategori settes én gang når linjen lagres (regler først, Glimt/LLM i bakgrunnen for ukjente). Ikke ved spørring.
- **Butikk-alias** fra logobiblioteket (`ICA KVANTUM 1234`, `ICA NÆR` → `ica`; `REMA 1000` → `rema`).

## 2. Tolking av spørsmålet (lokalt, regex + ordlister, < 20 ms)
`parseQuery("kvittering til tomater på ica")` →
`{intent:'find_receipt', item:'tomat', merchant:'ica', period:null}`.
- **Intensjon:** finn kvittering / sist kjøpt / hvor mye brukt / hvor ofte / sum per måned / liste.
- **Butikk:** match mot butikk-alias («på ica», «fra biltema», «hos clas ohlson»).
- **Vare/kategori:** match mot synonymer og varekategori («tomater», «mat», «kaffe», «lading»).
- **Periode:** i dag, i går, denne uka, i oktober, i fjor, siste 3 mnd, «sist».
Bruk felles `parseIntent()`/`parseDay()` fra Kalender og Huskeliste.

## 3. Svar uten LLM
- SQL mot `search_items` med filtrene → sorter på dato (nyeste først) og relevans (FTS `bm25`).
- **Finn kvittering:** kort per kvittering med butikk, dato, linjen som matchet (uthevet: «TOMATER CHERRY 250G · 29,90»), sum og «Vis original». Flere treff: lista, gruppert per kvittering.
- **Hvor mye / hvor ofte:** tall + liten søyle per måned.
- Tekstsvaret bygges fra mal: «Du kjøpte tomater på ICA 3 ganger i oktober, sist 18. okt (29,90 kr). Her er kvitteringen.»
- Hele svaret vises med en gang. Glimt (Ollama) kan legge på én setning i bakgrunnen, men brukeren venter aldri på den.

## 4. Når LLM trengs
- Bare når `parseQuery` ikke finner verken vare, butikk eller intensjon, eller når spørsmålet er åpent («hva bør jeg kutte ned på?»).
- Send **kun** et kort sammendrag + maks 40 relevante rader (ikke hele databasen), med verktøy `finans.search(item, merchant, period, category)` slik at modellen kaller søket i stedet for å lese rådata.
- Liten modell (qwen2.5:3b / llama3.2:3b), `keep_alive: 30m`, forvarm når søkefeltet får fokus, `stream: true`, og ingen svar etter 6 s → vis SQL-treffene og la LLM fortsette i bakgrunnen.

## 5. UI
- Under søket: «Fant 2 kvitteringer på 0,12 s · lokalt søk» (eller «· Glimt (Ollama)» når LLM ble brukt). Aldri «Ollama tenker … 0 s» for spørsmål som hurtigveien klarer.
- Etiketten heter «✦ Glimt · lokalt» (ikke «AI-SØK»), og knappen heter «Spør Glimt».

## 6. Vedlikehold og test
- Bakgrunnsjobb som bygger indeksen for eksisterende kvitteringer én gang (migrering), deretter inkrementelt.
- Logg `parse_ms, sql_ms, llm_used, hits` per søk i AI Kontroll.
- Test: «kvittering til tomater på ica», «sist jeg kjøpte kaffe», «hvor mye mat i oktober», «batterier fra jula», «lyspærer i år»: alle < 300 ms og uten LLM.

## 7. Vis sekunder og hvordan Glimt tenker (ønske 2026-10-20: «vis også sekunder og tankemåten til glimt. skriv at glimt tenker.»)
- Mens søket pågår står det **«Glimt tenker … 1,4 s»** (aldri «Ollama tenker»). Telleren går med tiendeler (oppdateres hvert 100 ms) fra `startedAt`, som settes én gang.
- Under står **tankestegene** live som en liste som hukes av, med tid per steg:
  - ✓ Forstod spørsmålet: kvittering · vare «tomat» · butikk «ICA» · 0,01 s
  - ✓ Søkte i 1 284 varelinjer · fant 3 · 0,08 s
  - ✓ Fant kvitteringene · 0,02 s
  - ◌ Glimt skriver svaret … (bare når LLM brukes, med skimmer)
- Når svaret er ferdig: «Glimt tenkte i 0,12 s · lokalt søk» eller «Glimt tenkte i 3,8 s · Ollama (qwen2.5:3b)». Stegene kan foldes inn/ut med «Vis hvordan Glimt tenkte ▾» (lagres per bruker).
- Glimt-orben roterer raskt mens Glimt tenker og saktere når svaret er ferdig. Fremdriftslinjen følger stegene, ikke en falsk tidtaker.
- Backend sender stegene som hendelser (`event: step {label, detail, ms}`) over SSE, så web, iOS og Android viser det samme.
