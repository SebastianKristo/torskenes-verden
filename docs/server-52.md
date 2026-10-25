# Server – prompt 52

Kort om hva som er nytt på serveren, og hva du må gjøre. API-formene står i `SERVER52-API.md` (seksjon SRV52).

## Kvitteringer leses bare lokalt
- Gemini er tatt helt ut av kvitteringslesingen, også som reserve og også når «Finansdata forlater aldri huset» er av.
  Kjeden er: telefonen → Mac Vision → Tesseract → lokal modell (qwen3:8b) på OCR-radene → kø/prøv igjen.
- «Les på nytt» / «Analyser på nytt» leser alltid lokalt. Eldre apper som ber om Gemini får lest kvitteringen lokalt i stedet.
- Roboflow-beskjæringen av kvitteringsbildet er også fjernet. Strekkoder er uendret.
- Lagrede valg migreres automatisk ved oppstart (`aiTasks.receipts` → `ollama`, Gemini-steget fjernes fra `receipts48`).
- Prøver noe likevel å sende et kvitteringsbilde til en sky-tjeneste, stoppes det, og loggen får en linje som begynner med
  `[kvittering] ADVARSEL`.
- «Finn logo med Gemini» (bare butikknavnet sendes) finnes fortsatt under Personvern og logoer, men er av som standard.

## Boliger
- Kvitteringer i Boliger går gjennom samme leser som Transaksjoner (`/finans/api/receipts/scan` med `home_id`), og panelet får samme
  kvitteringsdata (`receiptFull`) og butikklogo.

## Glimt
- «Sist jeg var på Jem & Fix», «når var jeg på Biltema», «forrige gang jeg handlet hos ICA?» svares direkte fra transaksjonene og
  kvitteringene dine (uten AI), med dato, hvor lenge siden og beløp. «&» og «og» regnes som det samme, og små skrivefeil tåles.
  Finner Glimt ingenting, foreslår den nærmeste butikk.
- Glimt lagrer bare minner når du sier det rett ut: «husk at …», «noter at …», «lagre at …» eller «Nina er frisøren min».
- Kalenderbeskjeder («jeg skal ha møte med lalila på olvia») tolkes først med regler, så av den lokale tolkemodellen (maks 5 s).
  Navn og steder rettes mot Bursdager, familien og tidligere steder i kalenderen. Ord du retter i bekreftelsesarket huskes for deg.
- Glimt-figuren lagres på profilen din. Ny figur: Blekksprut. Admin kan sette standardfigur per bruker
  (`PUT /api/admin/glimt-char52/<bruker-id> {"default":"blekk"}`); brukerens eget valg vinner.
- Chatten viser tankegangen: modellens egne steg når den tenker, ellers Glimts egne steg. Tankegangen lagres på meldingen,
  men sendes aldri tilbake til modellen.

## Brief
- `GET /api/brief52` gir kortene for den som er logget inn: Dagens fokus, Min reise, Huskeliste, Regninger, Klær, Nytt i kveld,
  Homelab, Domener og Aksjer. Admin får alt. Homelab, Domener og Aksjer vises bare for admin og de admin gir tilgang.
  Barn får ikke Regninger eller Media.
- Admin velger barn og tilgang med `PUT /api/admin/brief52/access {"children":[…], "homelab":[…], "domains":[…], "stocks":[…]}` (bruker-id-er).
- «Start» på Homelab-kortet (bare admin) starter en stoppet tjeneste eller starter en tjeneste med feil på nytt via Docker-proxyen.

## «Nytt i versjon»
- Endringsloggen gis som punkter med overskrift og kort tekst. Interne merknader som «prompt 51» vises ikke.

## Kommandoer
```sh
node --test test/p52-server.test.js
```
