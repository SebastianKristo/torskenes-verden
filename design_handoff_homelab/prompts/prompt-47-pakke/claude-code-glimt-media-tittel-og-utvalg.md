# Glimt i Media: forstår ikke «Last ned siste episode fra 9-1-1»

Skjermbilde: `uploads/Screenshot 2026-10-23 at 18.32.45.png`. Dette er bare ett eksempel. Fiksen skal være generell.

## Hva som skjer
- Bruker skriver: «Last ned siste episode fra 9-1-1».
- Glimt viser «Søker i Sonarr og Radarr» og svarer «Fant ingenting som heter «siste episode fra 9-1-1»».
- Serien finnes. Den ligger øverst i listen rett under, med S10E02 «Fire in the Hole» merket «Mangler».

## Rotårsak
Glimt fjerner verbet («Last ned») og sender **resten av setningen som søketekst** til Sonarr/Radarr. Ingen trekker ut hva som er tittelen, og hva som er en beskrivelse av hvilken episode brukeren vil ha. «siste episode fra» er en instruks, ikke en del av navnet. Det samme skjer ved «neste episode av», «sesong 3 av», «filmen Dune», «den nye Bond-filmen» og lignende.

Det er også feil at Glimt søker i Radarr: ordet «episode» betyr TV-serie.

## Fiks: tolk til strukturerte felt før søk
1. **Tolking (Ollama, JSON-skjema):** modellen returnerer felt, ikke fritekst:
   ```json
   { "handling": "last_ned", "type": "serie", "tittel": "9-1-1",
     "utvalg": "siste_episode", "sesong": null, "episode": null }
   ```
   - `handling`: last_ned | søk | legg_til | status | slett
   - `type`: serie | film | ukjent. «episode», «sesong», «S01E02» → serie. «film» → film.
   - `utvalg`: siste_episode | neste_episode | manglende | hel_sesong | bestemt_episode | alt
   Bruk Ollamas `format`-parameter med skjemaet og valider svaret. Er JSON ugyldig, prøv én gang til. Feiler det igjen, si «Skjønte ikke helt – mente du …?».
2. **Slå opp tittelen i biblioteket først**, ikke i fritekst-søk:
   - Normaliser begge sider: små bokstaver, fjern bindestrek, punktum og mellomrom («9-1-1» = «911» = «9 1 1»).
   - Eksakt treff vinner. «9-1-1» skal velge **9-1-1**, ikke «9-1-1: Nashville» eller «9-1-1: Lone Star».
   - Ingen eksakt treff: fuzzy (token-likhet ≥ 0,85). Flere like gode treff: vis valgknapper («9-1-1 · 9-1-1: Nashville»).
   - Ikke i biblioteket: søk i Sonarr/Radarr lookup og tilby «Legg til».
3. **Løs `utvalg` mot Sonarr-data:**
   - `siste_episode`: siste episode med `airDateUtc` ≤ nå (ikke spesialer, sesong 0).
   - `neste_episode`: første med `airDateUtc` > nå. Svar med dato, ikke last ned.
   - `manglende`: alle med `hasFile = false` og sendt.
   - `hel_sesong`: `SeasonSearch`.
4. **Utfør:** `POST /api/v3/command { name: "EpisodeSearch", episodeIds: [...] }`. Sett episoden som overvåket først hvis den ikke er det.
5. **Svar:** «Søker etter 9-1-1 S10E02 «Fire in the Hole»». Vis kortet med status, som oppdateres til «Lastes ned» når qBittorrent har den.

## Statuslinjer
Vis det som faktisk skjer: «Forstår forespørselen → 9-1-1 · siste episode», «Søker i Sonarr». Ikke «Sonarr og Radarr» når typen er kjent.

## Tester (mock Sonarr)
- «Last ned siste episode fra 9-1-1» → 9-1-1 S10E02, EpisodeSearch.
- «last ned nyeste 911» / «hent siste av 9 1 1» → samme.
- «Last ned siste episode av Nashville» → 9-1-1: Nashville S02E02.
- «Når kommer neste episode av Law & Order?» → dato, ingen nedlasting.
- «Last ned alle manglende fra SVU» → Law & Order: Special Victims Unit, manglende episoder.
- «Last ned sesong 3 av 9-1-1» → SeasonSearch.
- «Last ned Dune» → film, Radarr.
- Ukjent tittel → tilby «Legg til», ikke «fant ingenting».
- Tvetydig tittel → valgknapper.
