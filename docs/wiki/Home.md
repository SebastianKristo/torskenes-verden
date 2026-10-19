<p align="center"><img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/assets/banner.svg?sanitize=true" alt="Homelab OS" width="100%"></p>

# Homelab OS – wiki

Homelab OS er et selvhostet «operativsystem» for hjemmet. Du får **Homelab-dashboardet** i nettleseren, økonomiappen **FinansHub** på `/finans/`, en **PWA**, og native apper for **iOS** og **Android**. Alt kjører på én Node-server med SQLite, i Docker på din egen maskin.

<img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/images/hero.webp" alt="Dashboardet og tre telefoner" width="100%">

## Hvor skal jeg begynne?

| Jeg vil … | Les |
|---|---|
| installere serveren for første gang | [Installasjon](Installasjon) |
| oppdatere uten å miste data | [Oppdatering og backup](Oppdatering-og-backup) |
| legge til familien og forstå hva de ser | [Brukere og personvern](Brukere-og-personvern) |
| få appen på telefonen | [Mobilapper](Mobilapper) |
| koble til Home Assistant, Google, Plex, Mybring og andre | [Integrasjoner](Integrasjoner) |
| sette opp AI for kvitteringer og søk | [AI og tidsgrenser](AI-og-tidsgrenser) |
| bruke FinansHub: import, kvitteringer, budsjett og Boliger | [FinansHub](FinansHub) |
| få skoletimeplanen og bursdager inn | [Kalender og Bursdager](Kalender-og-Bursdager) |
| spore pakker | [Sporing](Sporing) |
| dele posisjon og lage soner | [Familie og kart](Familie-og-kart) |
| lage egne skript, snarveier eller Home Assistant-sensorer | [API](API) |
| løse et problem | [Feilsøking](Feilsøking) |

## Modulene kort

| Modul | Hvor | Hva |
|---|---|---|
| **Hjem / Dashboard** | `/` | Avganger, vær, kalender, pakker, familie, nyheter, media og strøm |
| **FinansHub** | `/finans/` | Kontoer, transaksjoner, kvitteringer, budsjett, faste utgifter, aksjer, abonnementer, Finn, Boliger |
| **Kalender** | Fanen Kalender (web), Mer → Kalender (app) | Skoletimeplan, prøver og frister, bursdager og Google |
| **Bursdager** | Fanen Bursdager, Mer → Bursdager | Bursdager med påminnelse, Google- og Home Assistant-synk |
| **Familie** | Fanen Familie | Posisjon, soner, helse, varsler |
| **Sporing** | Fanen Sporing | Pakker fra e-post, Finn og manuelt |
| **Vær** | Trykk på temperaturen | Timer, 7 dager, detaljark, Yr og Pent |
| **Huskeliste** | Fanen Huskeliste | Delte lister med sanntid og Home Assistant To-do |
| **Mat** | Fanen Mat | Ukeplan, oppskrifter, handleliste |
| **Domener** | Fanen Domener | Cloudflare-statistikk, oppetid og DNS |

## Versjon

Wikien gjelder **4.19.0** og nyere. Se [endringsloggen](https://github.com/SebastianKristo/torskenes-verden/blob/main/CHANGELOG.md) for hva som er nytt.

> Alle skjermbilder er tatt med `MOCK_DATA=1`, så navn, tall og pakker er eksempeldata.
