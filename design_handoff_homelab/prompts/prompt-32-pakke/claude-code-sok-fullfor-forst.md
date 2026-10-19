# Søkefeltet på Hjem: fullfør selv, send til Chat bare når det tar for lang tid

Vedlegg: «Tenker på «Vis meg oppdatering» …». En enkel oppgave ble behandlet som et AI-spørsmål (og sendt videre til Chat).

Fasit: `Mobil Papir App.dc.html` → `hsAsk()` (NAV-snarveier, `TO`, `handoff()`) og Innstillinger → AI og tolkning → **GLIMT I SØKEFELTET**.

## Rekkefølge
1. **Snarveier (lokalt, umiddelbart):** «vis meg / åpne / gå til / ta meg til / hvor finner jeg / finn …», eller bare 1–2 ord. Treff på side gir boblen «Åpner **Nordlys OS · oppdatering**.» (kilde: Snarvei), og siden åpnes etter 0,45 s.
   - oppdater/nordlys/versjon → Nordlys · kalender/timeplan → Kalender · vær(side) → Vær · innstillinger · pakke/sporing · budsjett · kvittering · finans/økonomi/saldo · abonnement/prøveperiode · domene · familie/posisjon/hvor er · mat/middag/oppskrift · huskeliste/handleliste · bursdag · chat.
2. **Lokale verktøy** (som før): neste time, prøveperiode-påminnelse, vær, legg til time.
3. **AI (Glimt)** svarer **i boblen** i søkefeltet.
4. **Bare hvis svaret tar lengre tid enn grensen** (standard **8 s**), eller AI ikke svarer: boblen viser «Dette tar litt tid. **Fortsetter i Chat** …», og etter 0,7 s åpnes Chat med spørsmålet sendt. Jobben fortsetter der (og gir varsel hvis man har gått ut av appen).
- Knappen «Fortsett i Chat ›» i boblen er der fortsatt for manuell overgang.

## Innstilling
Innstillinger → AI og tolkning → **GLIMT I SØKEFELTET** → «Send til Chat etter» **5 / 8 / 15 / 30 s** (trykk for å bytte). Teksten under: «Enkle oppgaver fullføres i søkefeltet. Tar svaret lengre tid, fortsetter det i Chat.» Lagres i brukerprofilen (`hs_timeout_s`).

## Backend
- Klassifiser intensjon lokalt først (regex og nøkkelord). Kall AI bare når ingen snarvei eller lokalt verktøy treffer.
- Strøm AI-svaret. Brukes grensen opp: avbryt ikke jobben, men flytt den til en Chat-tråd (samme jobb-id), så svaret havner der.
