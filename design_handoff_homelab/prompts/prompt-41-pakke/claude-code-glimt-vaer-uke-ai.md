# Glimt i søket: værspørsmål om uka skal tenkes gjennom med AI og ukesdata

Ønske 2026-10-20: «her ga den svar med engang men svarte ikke på det jeg spurte om glimt tenkte klart ikke, den brukte ikke ollama ai til å finen svar med å lese værdata for uken.» (skjermbilde: `vedlegg/glimt-vaer-feil-svar.png`)
Fasit: `Mobil Papir App.dc.html` → `wxComplex`, `wxWeek` (brukes av søkefeltet på Hjem og av Chat).

## Feil
Alle værspørsmål går til en fast mal for i dag/i morgen («I dag er det 19 % sjanse for nedbør … Du klarer deg uten paraply.»). Spørsmål om uka, bestemte dager eller «når/hvilken dag» blir besvart med feil svar uten at AI brukes.

## Riktig
- **Enkle spørsmål** (≤ 9 ord, bare nå/i dag/i morgen, f.eks. «trenger jeg paraply i morgen») → hurtigsvar som i dag.
- **Alt annet** → AI: inneholder uke/uka/helg/dager/neste/når/hvilken dag/beste/ukedager/sammenlign/tur/trening/fremover, eller er lengre enn 9 ord.
  1. Pillen viser «Tenker på «…» …» og steget «Leser værdata for uken …».
  2. Hent 7 dager fra Open-Meteo (`daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset`, `forecast_days=7`) for stedet i spørsmålet (geokoding som i dag), ellers hjemmet.
  3. Send spørsmålet + en kompakt tabell per dag til **Ollama** (modell fra «✦ Auto», normalt Llama 3.1 8B / DeepSeek R1 for «beste dag»-spørsmål). Systemprompt: svar kort (1–3 setninger) med konkrete dager og tall, uthev hovedsvaret med **…** én gang, ikke finn på data.
  4. Vis svaret i pillen med uthevingen i fet skrift, kilde «✦ Ollama · Open-Meteo 7 dager · Oslo», og «Åpne Vær for Oslo ›».
- Tar AI-en lengre tid enn grensen i Innstillinger (standard 8 s): «Fortsetter i Chat» med spørsmålet. Chat bruker samme `wxWeek` og svarer med ukesdataene (ikke malen).
- Svarer ikke Ollama innen 20 s: lokal reserve som faktisk svarer på spørsmålet (regndager / tørreste dager / varmeste og kaldeste dag), merket «uten AI».
- Samme logikk i Chat: værverktøyet sender ukesspørsmål videre til modellen med dataene i stedet for å svare med malen.

## Eksempler
- «Når blir det mest regn denne uka?» → «**Mest regn torsdag 22.10, rundt 6 mm (80 %).** Fredag er også våt, mens helgen ser tørr ut.»
- «Hvilken dag er best for å sykle til skolen?» → «**Onsdag ser best ut: tørt, 9° og lite vind.**»
