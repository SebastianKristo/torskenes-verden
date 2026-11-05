# Brief: nye kort skal vises med en gang, ikke dukke opp etter noen sekunder

Gjelder kortene fra `Glimt Brief Nye Kort.dc.html` (Dagens fokus, Regninger denne uka, Min reise, Huskeliste, Nytt i kveld, Homelab-status, Domener og SSL m.fl.) på iOS, Android og web.

Symptom: når Brief åpnes, mangler flere av de nye kortene. De dukker opp etter noen sekunder og skyver innholdet ned.

## Regel
Alle aktiverte kort skal ha plassen sin fra første bilde. Ingen kort skal dukke opp eller forsvinne etter at Brief er vist.

## Fiks
1. **Rendre kortlista fra innstillingene, ikke fra data.** Hvilke kort som vises og rekkefølgen kommer fra brukerens Brief-oppsett (lokalt lagret). Ikke vent på API-svar for å bestemme om et kort skal finnes.
2. **Vis sist kjente data umiddelbart (cache).** Lagre siste svar per kort lokalt (MMKV/AsyncStorage/DataStore på mobil, localStorage/IndexedDB på web) med tidsstempel. Vis det med en gang, hent nytt i bakgrunnen og bytt innhold stille.
3. **Skjelett når cache mangler.** Kortet vises i full høyde med tittel og grå plassholderlinjer i papirstil (#e6dfd1 på #fffdf8), samme høyde som ferdig kort. Ingen spinner midt i kortet.
4. **Hent parallelt.** Start alle kortkilder samtidig (`Promise.all`/`async { }` per kort), ikke etter hverandre. Ett tregt kort skal ikke holde igjen de andre.
5. **Tidsavbrudd per kort: 6 s.** Etter det vises cache med liten tekst «Oppdatert kl. HH:MM», eller «Klarte ikke hente» med «Prøv igjen». Kortet blir stående.
6. **Tomt innhold:** Har kortet ingenting (f.eks. ingen regninger denne uka), vis kort tomtekst («Ingen regninger denne uka»). Skjul ikke kortet etter at det er vist.
7. **Forhåndshent:** Start henting når appen kommer i forgrunnen og når Hjem vises, så dataene er klare før Brief åpnes. Maks hvert 5. min.
8. **Ingen layout-hopp:** ingen innfadings-animasjon som starter når data kommer. Bytt innhold uten at kortets høyde endres mer enn nødvendig.

## Test
- Åpne Brief med nett på: alle kort er der fra første bilde (cache eller skjelett), ingenting skyves ned.
- Kald start uten cache: skjeletter vises, fylles inn etter hvert.
- Flymodus: alle kort vises med cachet innhold og «Oppdatert kl. …».
- Gjelder også Glimt Brief Oversikt.
