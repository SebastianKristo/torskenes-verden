# Til Claude Code: Kartet krasjer på Android og viser «403 Access blocked» på web

## Symptom
- **Web (PC):** Leaflet-kartet viser bare «403 Access blocked – App is not following the tile usage policy of OpenStreetMap's volunteer-run servers».
- **Android:** appen krasjer når Kart/Familie åpnes.

## Årsak (web)
Appen henter kartfliser direkte fra `tile.openstreetmap.org`. OSM blokkerer apper som ikke sender riktig `Referer`/`User-Agent`, som henter mye, eller som kjører i produksjon. OSM-serverne er ikke ment for apper.

## Løsning – bytt kartleverandør (web + app)
1. Lag én felles konfig `MAP_TILES` (backend `/api/config` + frontend):
   - **Standard:** Kartverket topo \`https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png\` (gratis, ingen nøkkel, merk rekkefølgen y/x), attribution \`© Kartverket\`. NB: CARTO viser nå «API KEY REQUIRED» uten nøkkel.
   - **Alternativ:** CARTO Voyager (krever nøkkel) `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`, subdomains `abcd`, attribution `© OpenStreetMap-bidragsytere © CARTO`.
   - **Mørkt tema:** `.../dark_all/{z}/{x}/{y}{r}.png`. **Papir-tema:** `.../light_all/...` med CSS `filter: sepia(.25) saturate(.8)`.
   - **Alternativ med nøkkel** (Innstillinger → Integrasjoner → Kart): MapTiler, Stadia Maps eller Kartverket (`https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png`, gratis og norsk).
2. **Proxy og cache i backend** (anbefalt): `GET /tiles/{style}/{z}/{x}/{y}.png`. Den henter fra leverandøren med egen `User-Agent: KristoHomelab/1.0 (kontakt@kristo.no)`, lagrer i `/data/tiles` i 30 dager og svarer med `Cache-Control: public, max-age=2592000`. Klientene bruker bare proxyen, så kildene kan byttes uten ny app-versjon.
3. Leaflet: sett `maxZoom: 19`, `detectRetina: true`, `crossOrigin: true` og en `errorTileUrl` (nøytral grå flis). Aldri vis leverandørens feilbilde.
4. Fjern alle gjenværende `tile.openstreetmap.org`-referanser (søk i hele repoet).

## Android-krasj – feilsøk og fiks
1. Kjør `adb logcat *:E` mens kartet åpnes, og finn stacktrace. Typiske årsaker:
   - **osmdroid uten user agent:** sett `Configuration.getInstance().userAgentValue = BuildConfig.APPLICATION_ID` og `load(context, prefs)` *før* `MapView` opprettes.
   - **Google Maps SDK uten API-nøkkel** i `AndroidManifest.xml` (`com.google.android.geo.API_KEY`), eller Play Services mangler.
   - **Manglende posisjonstillatelse:** `ACCESS_FINE_LOCATION` må spørres om i runtime. Ikke kall `myLocation`/`requestLocationUpdates` før tillatelsen er gitt. Fang `SecurityException`.
   - **Null-posisjon:** familiemedlem uten siste posisjon → ikke anta `lat/lon != null`. Hopp over markøren.
   - **WebView-kart:** `setJavaScriptEnabled(true)`, `setDomStorageEnabled(true)`, `android:usesCleartextTraffic` er ikke nødvendig når alt er HTTPS.
   - **Health Connect-kall på hovedtråden** fra helsekortene i Familie → flytt til coroutine (`Dispatchers.IO`).
2. Pakk kartskjermen i en feilgrense: ved exception vises «Kartet kunne ikke lastes» + «Prøv igjen» i stedet for krasj. Logg til Sentry/lokal logg.
3. Bruk samme tile-proxy (`/tiles/...`) som web.

## Test
- Web: kartet viser fliser i lyst, mørkt og Papir-tema. Ingen 403 i Network-fanen.
- Android: åpne Kart med og uten posisjonstillatelse, i flymodus (cache vises, ingen krasj) og med et familiemedlem uten posisjon.
- iOS: samme test.
