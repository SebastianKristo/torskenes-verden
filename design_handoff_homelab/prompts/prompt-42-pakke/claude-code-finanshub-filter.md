# FinansHub: filterverktøy i hele appen (butikk + periode i måneder, uker eller datoer)

Ønske 2026-10-20: «legg inn i hele finans hub filter verktøy, kan velge butikk, dato feks fra juli til september eller uke 34 til 50».
Fasit: `FinansHub v3 Temaer.dc.html`: filterraden under toppfeltet (`fl`) og filtreringen av `txList`.

## Plassering
- Filterraden ligger rett under toppfeltet på **alle** sider: Oversikt, Transaksjoner, Kvitteringer, Boliger, Subscription OS, Kontoer og Glimt.
- Knappen **Filter** (blir «Filter · 2» når filtre er aktive) åpner et panel. Aktive filtre vises som brikker med × («Butikk: ICA KVANTUM, Biltema ×», «Juli–september ×», «Uke 34–50 ×»), pluss **Nullstill** og «12 treff».

## Panel
- **Butikk:** brikker for alle butikker (fra logobiblioteket/normalisert butikknavn), flervalg, med søkefelt når det er mange.
- **Periode:** velg Måneder / Uker / Datoer.
  - **Måneder:** Fra [juli] til [september]. Inkluderer hele månedene.
  - **Uker:** Uke [34] til uke [50], ISO-uker (mandag–søndag). Spenner perioden over nyttår, gjelder den årsskiftet (uke 50 → uke 6).
  - **Datoer:** fra–til med datovelger.
  - Velg år (standard: i år) når Måneder eller Uker er valgt.
- **Bruk filter** lukker panelet.

## Virkemåte
- Filteret er **globalt**: det lagres i URL-en (`?shop=ica,biltema&from=2026-07&to=2026-09` / `?wk=34-50`) og per bruker, og gjelder alle sider til det nullstilles.
- Oversikt: nøkkeltall, grafer og «Siste transaksjoner» følger filteret. Kvitteringer, Boliger (utgifter og årsbokser), Subscription OS (trekk) og Kontoer (bevegelser) filtreres på samme måte.
- **Glimt** får filteret som kontekst: «hvor mye brukte jeg?» med filteret «ICA · uke 34–50» svarer bare for det. Forbruksrapporten (PDF) bruker valgt periode og butikker, med periode i tittelen.
- Kategori-brikkene på Transaksjoner kombineres med filteret (OG).
- Backend: `GET /api/tx?shops=…&from=…&to=…`. Uker regnes om til datoer på serveren. Indeks på (merchant_id, date).

## Mobil
- Samme filter i Finans-appen: en filterknapp i toppen åpner et ark med de samme valgene (hjul for uke/måned), og aktive filtre står som brikker under tittelen.

## Endring 2026-10-20 («når filter åpnes åpne en egen side som viser hver transaksjon i liste. legg heller filter i sidemeny under glimt»)
- Filterraden under toppfeltet fjernes. **Filter** blir et eget punkt i sidemenyen rett under Glimt (ikon: tre linjer, farge `#2b7a8a`).
- Filter-siden: panelet (Butikk, Periode: Måneder / Uker / Datoer) står alltid åpent øverst, deretter aktive filterbrikker med × og Nullstill, og så **lista med hver transaksjon** som passer (dato, butikk + beskrivelse, kategori med prikk, beløp), med antall og sum øverst.
- Transaksjoner-siden er ufiltrert som før. Filteret lagres i URL-en på Filter-siden (`/filter?shop=…&wk=34-50`), så det kan deles og bokmerkes. Glimt og PDF-rapporten kan åpnes med det aktive filteret (knapper «Spør Glimt om dette» / «Lag rapport»).
- **Søk etter butikk** (ønske 2026-10-20: «i filter la meg søke etter butikk når man skal velge det som filter»): søkefelt over butikkbrikkene («Søk etter butikk …», ×). Lista snevres inn mens man skriver (bokstavfolding og butikk-alias, «ica» finner ICA KVANTUM og ICA Nær). Valgte butikker står alltid synlige. **Enter** velger første treff og tømmer feltet. Ingen treff: «Ingen butikker heter «…»».
- **Beløp** (ønske 2026-10-20: «legg også til at man kan velge beløp, feks mellom 500 kr og 5000 kr»): «Mellom [500] og [5 000] kr» (tomt felt = ingen grense), pluss hurtigvalg Under 100 · 100–500 · 500–5 000 · Over 5 000. Gjelder beløpet uten fortegn (både utgifter og inntekter). Brikke: «500–5 000 kr ×» / «Over 5 000 kr ×». URL: `&min=500&max=5000`.
- **Glimt-søk i Filter** (ønske 2026-10-20: «legg til glimt ai søk ved siden av for raskere og mer avansert søk»): øverst i panelet, en Glimt-pille med orb, «Spør Glimt, f.eks. «ICA mellom 500 og 5000 kr i uke 34 til 50»» og **Spør Glimt**. Glimt tolker teksten lokalt (samme `parseQuery` som i `claude-code-glimt-sokedatabase.md`: butikk-alias, beløp «mellom/over/under», uker, måneder, datoer, kategori og vare). Den fyller ut filterfeltene, som brukeren ser og kan justere. Svarlinje: «✦ Glimt satte filteret: ICA KVANTUM · 500–5000 kr · uke 34–50 · 0,04 s». Ukjent tekst går til Ollama med verktøyet `set_filter(...)`, og «Glimt tenker … 1,2 s» vises mens det pågår.
- **Kategori og Bolig** (ønske 2026-10-20: «la meg også velge kategori, og velge boliger som filter og en spesifikk bolig»): Kategori = flervalg-brikker med fargeprikk. Bolig = «Alle boliger» (alle transaksjoner som er koblet til en bolig) eller én bestemt bolig (Strømstad, Toten, Toten hytte, Arnebråtveien 51). Koblingen kommer fra importreglene og utgiftene i Boliger (`tx.home_id`). Brikker: «Kategori: Hjem ×», «Bolig: Strømstad ×». Glimt forstår «hjem-kjøp i Strømstad over 500 kr» og «alt til hytta i år». URL: `&cat=hjem&home=str`.
- Glimt-feltet og «Søk etter butikk …» står **ved siden av hverandre** øverst i panelet: Glimt til venstre (bredest), butikksøk til høyre, med samme høyde (54 px) og pilleform. Brytes under hverandre på smal skjerm.
- **Ikke overfylt** (ønske 2026-10-20: «ordne det slik at menyen ikke blir oversvømt med kategorier og butikker når man har mange»): Butikk og Kategori viser bare de **6 mest brukte** (valgte står alltid først), pluss «+ 9 flere» / «Vis færre». Når man skriver i butikksøket, vises alle treff. Det samme gjelder i mobilappen.
- **Åpne kvitteringer fra Filter** (ønske 2026-10-20: «la meg åpne kvitteringene»): hver rad er klikkbar. Under beløpet står «Kvittering ›» (grønn) eller «Ingen kvittering». Trykk åpner et panel fra høyre med logo, butikk, dato · konto · kategori, beløp, ✦ AI-beskrivelse og **selve kvitteringen** (originalbildet/PDF-en når den finnes; i demoen en kvitteringsrull med varelinjene), pluss **Last ned original**. Uten kvittering: «Last opp kvittering», og Glimt leser den.
