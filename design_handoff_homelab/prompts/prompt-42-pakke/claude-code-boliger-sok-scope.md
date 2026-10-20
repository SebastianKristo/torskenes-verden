# FinansHub: søk og Glimt i toppen er avgrenset til Boliger (og boligen man er i)

Ønske 2026-10-20: «når boliger er åpen vis man søker med glimt i toppen søk bare i boliger og i boligen man er inni» (vedlegg `uploads/Screenshot 2026-10-20 at 21.00.49.png`).
Fasit: `FinansHub v3 Temaer.dc.html` (plassholder etter `bolScope`) + `Boliger Web.dc.html` (sender `boliger-scope`-event med boligen som er åpen).

- På Boliger-siden endres søkefeltet i toppen: «Søk i Boliger …» (alle boligene) eller «Søk i Strømstad …» når en bolig er åpen. Med Glimt på: «Spør Glimt om Strømstad …».
- En liten scope-brikke i feltet («Strømstad ×») viser avgrensningen. × fjerner den og søker i hele økonomien.
- Søk og Glimt-spørsmål sendes med `scope: {module:'boliger', home_id}`. Backend filtrerer på boligens utgifter, kvitteringer, varelinjer, kategorier og prosjekter. Glimt får bare den boligens data i konteksten.
- Treff vises inne i Boliger (som Utgifter-lista filtrert, med «Viser treff for «basseng» i Strømstad · Nullstill»), ikke på Transaksjoner-siden.
- Glimt-svar i Boliger kan handle: «legg alle kjøp om basseng i prosjektet Basseng», «flytt Jula-kjøpet til Toten hytte», «hva har vi brukt på maling i år?».
- Går man ut av Boliger, tilbakestilles feltet til «Søk i transaksjoner …».

- **Søkeboksen åpnes i Boliger** (ønske 2026-10-20: «når glimt og vanlig søk åpne søkeboksen i boliger»): Enter i toppfeltet på Boliger-siden går ikke til Transaksjoner. I stedet åpnes et resultatkort øverst i Boliger: Glimt-orb, «Søk: «maling»» / «Glimt: «…»», «2 treff i Strømstad · 1 934 kr · 0,03 s», og treffene (dato, butikk, beskrivelse · kategori, beløp; trykk åpner utgiften). Ingen bolig åpen = søk i alle boligene (bolignavn vises per treff). **Lukk** fjerner kortet.
- **«Søk med Glimt»-knapp** i boligens topp (ved siden av «Rediger bolig»): åpner et Glimt-søkefelt øverst på siden (pille med orb, «Spør Glimt om Strømstad …», knappen **Spør Glimt**), med fokus i feltet. Svaret vises i det samme resultatkortet som toppsøket. Trykk på knappen igjen lukker feltet.
- Resultatkortet fra Glimt/søk vises **rett under Glimt-søkefeltet** i boligen (over årsboksene og fanene). På oversikten over alle boligene står det øverst.
