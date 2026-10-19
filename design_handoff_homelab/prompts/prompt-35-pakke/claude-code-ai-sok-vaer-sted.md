# AI-søk på Hjem: været for hvilket som helst sted

Feil: «været i New York» ga svar for Oslo (eller ingenting). Søket brukte fast Oslo (59.91, 10.75).
Fasit: `Mobil Papir App.dc.html` → vær-grenen i AI-søket (`geo.then(P=>…)`).

1. **Finn stedet i teksten:** etter «i / på / in / for / at / ved / rundt», fram til «i morgen / i dag / i kveld / nå / tomorrow …» eller slutten. Ignorer «i morgen», «i dag», «i helgen» osv. som sted. Eksempler:
   - «været i new york» → New York
   - «hvordan er været i Strømstad i morgen» → Strømstad
   - «regn i Bergen?» → Bergen
   - «weather in Paris» → Paris
2. **Geokoding:** Open-Meteo Geocoding `/v1/search?name=…&count=1&language=nb`. Ingen treff → Nominatim (OSM). Ikke norsk sted → vis «New York, USA».
3. **Værdata:** Open-Meteo `forecast` med stedets `latitude/longitude` og `timezone=auto`, slik at «i dag» og «i morgen» gjelder stedets tid. For norske steder: MET Locationforecast.
4. **Svar:** «Lettskyet og **14°** i New York, USA nå, vind 4 m/s. I dag 11–17°.» Uten sted brukes **brukerens posisjon** (eller Oslo som standard).
5. Fant ikke stedet: «Fant ikke stedet «Nwe Yrok». Prøv en annen stavemåte.» Glimt kan foreslå «Mente du New York?» via LLM.
6. Samme logikk i Glimt-chat, Kalender-Glimt og web-søket. Trykk på svaret åpner **Vær** for stedet (legg det til midlertidig i bylista).
