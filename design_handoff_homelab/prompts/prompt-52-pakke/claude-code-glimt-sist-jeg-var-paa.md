# Glimt (Finans): «Sist jeg var på jem & fix» gir et minne-svar

Skjermbilde: `uploads/Screenshot 2026-10-24 at 22.53.21.png`
Spørsmål: «Sist jeg var på jem & fix» (forslagschip).
Svar: «Jeg lagrer bare det du faktisk sa. Si det gjerne som «Nina er frisøren min»» · «Fant 0 treff på 3,68 s · lokalt søk».

## Årsak (sannsynlig)
Minnefunksjonen («husk at …», «X er frisøren min») kjøres **før** finanssøket og trigges på mønstre som «jeg var/er …» eller ord som «på/hos». Teksten blir sendt til minne-tolkeren, som avviser den, og finanssøket kjøres aldri. Dessuten matcher ikke «jem & fix» butikknavnet fordi «&» og små bokstaver ikke normaliseres.

## Fiks
1. **Rekkefølge i rutingen:** kjør `parseIntent()` for finans **først**. Minne skal bare trigges eksplisitt:
   - starter med «husk at», «husk:», «noter at», «lagre at», eller
   - har formen «<Navn> er <rolle> min/mitt/mine» (`/^\p{Lu}\p{L}+ er (\p{L}+) (min|mitt|mine)\b/u`).
   - Aldri for setninger som starter med «sist», «når», «hvor», «hva», «hvilke», «har jeg», «vis», eller som ender med «?».
2. **Intent «sist på butikk»:** `/^(sist|forrige gang|når var)( jeg)?( var| handlet| kjøpte)?( jeg)? (på|hos|i) (.+?)\??$/i` → `{type:'last_visit', merchant:m[6]}`.
3. **Butikkmatch:** normaliser både spørsmål og `merchant_display`: små bokstaver, «&» → «og», fjern tegn som ikke er bokstaver/tall, slå sammen mellomrom. «jem & fix», «Jem og Fix», «JEM&FIX» → `jemogfix`. Prøv eksakt, så `startsWith`, så Levenshtein ≤ 2.
4. **Svar:** «Sist du var på **Jem & Fix** var **<ukedag> <dato>** (<n> dager siden). Du handlet for <beløp> kr.» + transaksjonsraden med logo + lenke til kvittering hvis den finnes. Ingen LLM nødvendig. Ollama kan formulere setningen i bakgrunnen.
5. **0 treff:** «Fant ingen kjøp på «jem & fix». Mente du **Jem & Fix Storo**?» (nærmeste butikker), aldri minnehjelp-teksten.
6. **Test:** «Sist jeg var på jem & fix», «når var jeg på biltema», «forrige gang jeg handlet hos ica?», «Nina er frisøren min» (→ minne), «husk at Pål har fotball tirsdag» (→ minne).
