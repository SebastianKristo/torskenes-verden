# Huskeliste: Glimt bruker ekte AI, jobber i bakgrunnen, og «Laget med Glimt»

Ønske 2026-10-20: «glimt i huskeliste tror jeg ikke bruker noe ai glimt, "vi skal levere pakke på butikken før vi skal til toten hvor vi må huske å ta med tilhengrern hjem til oslo siden vi skal ha med møbelerer til strømstad. " den burde klare å skjønne innhooldet å dele opp. dette kan gått skje i bakgrunnen siden det kan ta litt tid. vis også orginal beskjeden i en egen meny med navn laget med glimt.»
Fasit: `Huskeliste.dc.html` (mobil og web).

## Feilen i dag
Teksten over blir ett punkt. Glimt sender bare tekst til AI når den finner ord som «først/deretter» eller flere setninger. Ellers brukes regex. Lange beskjeder med «før vi skal», «hvor vi må», «siden» går forbi.

## Når AI brukes
- Alltid når teksten har ≥ 12 ord og et verb som «må/skal/huske», eller koblinger som «før vi skal», «hvor vi må», «og så», «siden/fordi», eller flere setninger.
- Korte enkeltoppgaver («Kjøp melk i morgen») parses fortsatt lokalt, det går raskest.
- Motor: samme kjede som Glimt ellers (Groq → Gemini → Ollama lokalt). **Ikke** regex som førstevalg.

## Prompt (server)
Som før (JSON `items[]` med `n, list, who, date, time, place, after, tags`) **pluss**:
- `note`: begrunnelser («siden», «fordi») blir note på punktet de gjelder, ikke eget punkt.
- Del også opp setninger koblet med «før vi skal», «hvor vi må», «og så»: ett punkt per handling/sted.
- Rett åpenbare skrivefeil, stedsnavn med stor forbokstav.

Forventet resultat for eksempelet:
1. Lever pakke på butikken
2. Kjør til Toten (etter 1)
3. Ta med tilhengeren hjem til Oslo (etter 2) · note: «Skal ha med møbler til Strømstad»

## I bakgrunnen
- Når du sender: Glimt-arket lukkes med en gang. Øverst i lista vises en stiplet rad «Glimt deler opp beskjeden …» med beskjeden i «». Du kan bruke appen eller lukke den.
- Server: `POST /api/huske/glimt-jobs {text, list?}` → `202 {job_id}`. Kjøres som jobb i køen (timeout 60 s, 2 nye forsøk, så lokal reserve-parser).
- Ferdig: punktene legges inn, lett vibrering, og en rad «Glimt lagde 3 punkter i riktig rekkefølge · Se / ✕» i 10 s. Er appen lukket: push-varsel med samme tekst. Trykk åpner «Laget med Glimt».
- Flere jobber kan gå samtidig (én rad hver).

## «Laget med Glimt» (ny meny)
- Egen fane i liste-raden (rød prikk, antall beskjeder) som bare vises når det finnes minst én.
- Ett kort per beskjed: **ORIGINAL BESKJED** + tid, beskjeden ordrett i kursiv, meta («3 punkter · Glimt AI», «1 slettet», «av Ingrid»).
- Under: punktene den lagde, nummerert i rekkefølge, med avkrysning, liste, sted og note. Trykk = åpne punktet.
- Knapper: «✦ Del opp på nytt» (sletter ufullførte punkter fra beskjeden og kjører på nytt), «Glem beskjeden» (punktene blir).
- I redigeringsarket for et punkt laget av Glimt: kort «LAGET MED GLIMT · ORIGINAL BESKJED «…»» over Organisering. Trykk → fanen.
- Data: `huske_glimt_src (id, user_id, text, created_at, engine, item_ids[])`, `huske_items.src_id`. Behold de siste 60 beskjedene.

## Sjekk
- Eksempelteksten gir 3 punkter i riktig rekkefølge med note på tilhengeren.
- Lukk appen mens jobben går → push når ferdig.
- Ingen nett: lokal parser deler likevel opp på «før vi skal / hvor vi må / siden».

## Fra søkefeltet på Hjem (2026-10-20)
Ønske: «jeg vil også kunne legge til slike meldinger fra søk på hjem og få samme glimt animasjon som frisør timer og sånt får.»
Fasit: `Mobil Papir App.dc.html` (Hjem → søkefelt) + `Huskeliste.dc.html`.
- Søkefeltet kjenner igjen huskebeskjeder: starter med «husk / påminn meg / legg til i huskeliste / ny oppgave», eller ≥ 6 ord med «må/skal/huske» og «vi/jeg/meg/oss». Ikke spørsmål, ikke timer (timer går fortsatt til Kalender).
- Under feltet: samme mørke forslag-rad som «Legg i kalender», med avkryssingsikon, beskjeden og knappen **«Legg i Huskeliste»** (undertekst «Glimt deler opp i punkter»). Enter gjør det samme.
- Samme Glimt-animasjon som for frisørtimer (AI-toasten med stjerne, trykk for detaljer): tittel «Legger til i Huskeliste», steg *Leser beskjeden → Deler opp i punkter → Finner rekkefølge og steder → Lagrer i Huskeliste*, felt Beskjed / Liste / Original. Når svaret kommer mens toasten vises, byttes feltene ut med de nummererte punktene.
- Ferdig: «✓ Glimt lagde 3 punkter i Huskeliste». Tar AI lengre tid enn animasjonen: «✦ Glimt deler opp i bakgrunnen …», så samme ✓-melding (eller push) når den er ferdig.
- Samme bakgrunnsjobb og samme «Laget med Glimt»-oppføring som fra Huskeliste. Server: samme `POST /api/huske/glimt-jobs` med `origin: "home_search"`.
