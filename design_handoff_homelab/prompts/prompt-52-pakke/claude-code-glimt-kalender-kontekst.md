# Glimt: forstå kalenderbeskjeder i naturlig språk

Problem: «jeg skal ha møte med lalila på olvia» ga en dårlig tittel. Forventet: **Møte med Laila**, sted **Olivia**.

## Endret i designet (`Homelab.dc.html`, `Kalender.dc.html`)
Ny hjelper `QCX` (rett før `QP`) som kjøres før og etter tolkningen:

1. **Forhånd (`QCX.pre`)**
   - Fjerner innledninger: «jeg/vi skal (ha/på/til)», «jeg har», «husk at jeg skal», «minn meg på at …», «legg inn», «sett opp».
   - Retter skrivefeil i navn og steder med Damerau-Levenshtein mot et ordforråd: avstand ≤ 1 for ord på 4–6 tegn, ≤ 2 for 7+.
   - Ordforråd = vanlige norske fornavn + kjente steder/restauranter + navn fra Bursdager (`bd_v1`) + egne ord i `localStorage.glimt_lex`.
   - Vanlige ord (møte, lunsj, med, på, ukedager …) står i en stoppliste og rettes aldri.
2. **Etter (`QCX.post`)**
   - Fanger «på/hos X» som sted også når X er skrevet med liten bokstav (rettes og får stor forbokstav i steg 1).
   - Fjerner «på X» fra tittelen og gir tittelen stor forbokstav.
3. **Søkefeltet (`hsVals`)**: «møte», «lunsj», «middag med», «kaffe med», «kino», «fest» osv. tolkes nå som kalender. Mangler dato, foreslås i dag (bekreftelsesarket viser datoen så den kan endres).

Eksempler:
- «jeg skal ha møte med lalila på olvia» → Møte med Laila · Olivia · i dag
- «husk at jeg skal på kino med ingird fredag» → Kino med Ingrid · fredag
- «lunsj med kari på egon kl 11:30» → Lunsj med Kari · Egon · 11:30–12:30

## I den ekte appen
- Bruk regelparseren først (rask, offline). Er Ollama tilgjengelig, send teksten til lokal modell med JSON-skjema `{title, date, start, end, location, people[]}` og la svaret overstyre feltene regelparseren er usikker på (tittel, sted, personer). Timeout 2 s, ellers bruk regelresultatet.
- Gi modellen kontekst: liste over kontakter, tidligere steder fra kalenderen og dagens dato.
- Lær: når brukeren retter et navn/sted i bekreftelsesarket, legg det rettede ordet i `glimt_lex`.

## Oppdatering: AI-tilkoblingen brukes nå
Ønske: «slike type meldinger … burde den korten ned å skjønne, bruk ai tilkoblingen … dette er ikke komplekse spørsmål.»

- Når du skriver minst 3 ord i Glimt-søket (motor = Glimt), sendes teksten til AI-tilkoblingen etter 450 ms pause (`hsAiParse`). Svaret caches per tekst.
- Prompten får dagens dato og ukedag, klokkeslett, kjente personer (Bursdager + familie) og tidligere steder fra kalenderen, og ber om JSON: `{type, title, date, start, end, location}`. type = kalender | huske | spørsmål | annet.
- AI-svaret overstyrer regelparseren: kalender → forslagsknappen viser «Møte med Laila · i dag · Olivia» og lagres med sted; huske → Huskeliste; spørsmål → vanlig svar.
- Mens AI tenker står «✦ tolker …» på forslaget. Trykker du Enter før svaret er klart, venter Glimt opptil 2,5 s og bruker AI-svaret.
- Uten AI eller ved timeout (5 s) brukes regelparseren (`QCX` + `QP`) som før.
- I den ekte appen: bruk samme JSON-prompt mot Ollama (`/api/generate` med `format: "json"`, liten modell som `llama3.2:3b` eller `qwen2.5:3b`, `temperature: 0`). Det er en enkel oppgave og skal svare på under 1 s lokalt.
