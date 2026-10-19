# Ruter-kortet på Hjem og Ruter-widgets

Fasit: `Mobil Papir App.dc.html` (Hjem → Avganger) og `Widgets.dc.html` (2a iPhone, 2b Android, 2c Samsung).
- «Velg stopp» på kortet åpner arket **Velg stopp**: kryss av opptil 3 av Mine stopp, og velg 1–4 avganger per stopp. Lagres i `papir_av_home` = `{stops:[id], n}` (synk til `user_settings.home_departures`).
- Kortet viser én gruppe per stopp (navn over når flere). Sanntid fra Entur `estimatedCalls` per stopp, oppdater hvert 30. s når Hjem er synlig.
- «Legg til eller fjern stopp ›» åpner Avganger i redigeringsmodus.
- **Widgets:** iOS WidgetKit (liten = neste avgang, medium = 3 avganger, stor = 2 stopp + avvik, låseskjerm sirkel/rektangel), Android Glance (2×2, 4×2 med ↻, 4×1 stripe), Samsung One UI (liten, bred, stabel). Konfigurasjon per widget: stopp, linjer, retning. Standard = stoppene fra Hjem-kortet. Oppdater via WidgetKit timeline / WorkManager hvert 5. min (Entur), og tidslinje med beregnede minutter imellom.
