# Web: «✦ AI» i søkefeltet skal åpne samtalen, ikke chat-forsiden

Fasit: `Homelab Papir Web.dc.html` → søkefeltet på forsiden → knappen «✦ AI».

## Feil
Trykk på «✦ AI» med tekst i feltet sendte brukeren til chat-forsiden. Spørsmålet ble ikke sendt, fordi sendingen skjedde på en timer etter navigering og ble avvist når en tidligere svar-strøm fortsatt sto som «opptatt».

## Riktig oppførsel
1. Tomt felt: åpne Chat som før.
2. Tekst i feltet:
   - Stopp eventuell pågående svar-strøm først (lagre det som er kommet, merket «Stoppet»).
   - Opprett en **ny samtale** med spørsmålet som første melding, og gjør den aktiv.
   - Start svaret (samme modell, data og nettsøk som standard i Chat).
   - Naviger til Chat **etter** at samtalen finnes, så første skjerm er selve samtalen med spørsmålet øverst og svaret som strømmer inn.
   - Tøm søkefeltet.
3. Hvis valgt modell er en skymodell og data er på: vis det vanlige personvernvalget inne i den nye samtalen (ikke på forsiden).
4. Ingen `setTimeout` mellom navigering og sending. Rekkefølgen er: opprett samtale → send → naviger.

## Test
- Skriv «hva skjer i helgen» → «✦ AI» → du står i en ny samtale med spørsmålet, svaret strømmer.
- Gjør det samme mens et annet svar strømmer i Chat → forrige stoppes, ny samtale åpnes med spørsmålet.
