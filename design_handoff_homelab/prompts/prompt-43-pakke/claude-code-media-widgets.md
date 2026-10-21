# Media-widgets: Hjem i appen, iOS, Android og Samsung

Ønske 2026-10-21: «lag widgets for media, både for hjem i appen og for ios, android samsung.»
Fasit: `Media Widgets.dc.html` (1a iOS, 1b Android Material You, 1c Samsung One UI) og Hjem-widgeten **h12 «Media»** i `Mobil Papir App.dc.html`.

## Hjem i appen (h12)
- Nytt kort i wiggle-systemet: `LAB.h12 = "Media"`, med i `PG.hjem` etter Pakker. Finnes ikke i lagret rekkefølge → legges sist (eksisterende brukere) og kan flyttes/skjules som de andre. Fold-fanen **Hjemme** viser den.
- Innhold: «MEDIA · LASTES NED» + «alle ›», tre nedlastinger (navn, episode, %, tynn linje; står fast i gult), skillelinje, «KOMMER» med to neste (fargefelt/plakat, tittel, «S05E10 · man 09:00»). Trykk → Media (qBittorrent-fanen hvis noe lastes ned, ellers Kommer snart).
- Skjules automatisk når ingenting lastes ned og ingenting kommer de neste 7 dagene (samme regel som Pakker, med bryter i «Rediger widget»).

## iOS (WidgetKit)
- **Liten:** MEDIA, total fart (Newsreader 30), «3 aktive · ↑ 1,2», øverste nedlasting med linje.
- **Medium:** to nedlastinger til venstre, «NESTE»-kort med plakat til høyre.
- **Stor:** fart + **Pause alt / Fortsett** (`Button(intent: PauseAllIntent())`, iOS 17), tre nedlastinger, «KOMMER» med tre plakater.
- **Låseskjerm:** rektangulær (fart, øverste nedlasting, neste episode), sirkulær `Gauge` med % og en med antall aktive.
- Oppdatering: `TimelineProvider` hvert 5. min mens noe lastes ned, ellers hver time. Push via WidgetKit (`WidgetCenter.reloadTimelines`) når webhook «On Grab/On Import» kommer.

## Android (Glance) · Material You
- Følger dynamiske farger (`GlanceTheme`). 2×2: fart + linje. 4×2: «Lastes ned · fart» + **Pause alt** (`actionRunCallback`) + to nedlastinger. 4×3: «Kommer denne uka» med plakater.
- Oppdateres med WorkManager hvert 15. min, og straks ved FCM-push fra webhooks.

## Samsung One UI
- Samme Glance-widgets, men når `Build.MANUFACTURER == "samsung"`: hvit, 26 dp hjørner, store tall («3 lastes ned»), blå linjer (#1f6fe5), gul for står fast. Støtt «Widget-stabel» og Smart Suggestions.

## Felles
- Data fra `/api/media/widget` (aktiv kø + 3 neste fra kalenderen), cachet 60 s. Alle tall i norsk format.
- Trykk på en nedlasting → Media → qBittorrent → den torrenten. Trykk på «Kommer» → serie/film-siden.
