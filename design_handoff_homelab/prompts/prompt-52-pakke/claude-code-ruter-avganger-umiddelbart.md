# Ruter: avgangene skal vises med en gang

Ønske 2026-10-24: «når jeg åpner ruter siden på mobil tar det 1 sekund før alle avreisene dukker opp jeg vil at de skal dukke opp med engang.»
Fasit: `Homelab.dc.html` → `avPrefetch()`, `avFetch()`, `loading` i Ruter-verdiene.

## Feil i dag
Entur hentes først når siden åpnes (`openIt` → `avFetch`). Til svaret kommer (~1 s) vises «Henter sanntid fra Entur …» og tom liste.

## Slik skal det virke
1. **Hurtigbuffer på disk:** hvert vellykket svar lagres per stopp (`papir_av_cache`: `{ [NSR-id]: { calls, at } }`). Native: lagre i app-gruppe/DataStore så widgeten også kan bruke det.
2. **Forhåndshenting:** ved oppstart, og hvert 60. sekund mens appen er i forgrunnen, hentes **alle** lagrede stopp (Ruter-listen + Hjem-widgetens stopp), ikke bare Hjem-stoppene. Også ved retur fra bakgrunn.
3. **Vis buffer straks:** ved oppstart lastes bufferen inn før nettverkskall. Avganger med planlagt tid mer enn 1 min tilbake filtreres bort, minutter regnes på nytt fra klokka.
4. **Åpne Ruter:** listen tegnes fra bufferen i første frame. Ny henting bare hvis dataene er eldre enn 30 s; den skjer i bakgrunnen og bytter radene stille (ingen spinner, ingen tom liste).
5. **«Henter sanntid …»** vises kun når stoppet ikke har noen data i det hele tatt (første gang).
6. **Feil ved henting:** behold gamle data hvis de finnes; vis feilmelding bare når det ikke finnes noe å vise.
