# Endringer – prompt 03 (17.10.2026)

Gjelder `design/Homelab v2.dc.html`. Ordrette ønsker i `prompts/prompt-03.md`. Prototypen bruker eksempeldata; alt under må kobles til ekte kilder.

## 1. Innstillinger (modal med sidemeny)
- Venstre meny: **Utseende**, **Integrasjoner**, **Innlogging**. Høyre: tittel, undertekst, ×-knapp, rullbart innhold.
- Utseende: bakgrunnsvalg (som før) + søkebar-stil med mini-preview.
- Integrasjoner: ett kort per tjeneste. Lagres i prototypen i `localStorage.hl_cfg` – i produksjon: lagre server-side, hemmeligheter aldri til klienten (proxy via backend).

| Gruppe | Nøkler |
|---|---|
| Vær (MET/Yr) | `wx_place`, `wx_lat`, `wx_lon` |
| Ruter (Entur) | `ruter_stops` (NSR-ID-er, komma), `ruter_count` |
| Kalender | `cal_ics` (iCal-URL), `cal_mazemap` |
| Home Assistant | `ha_url`, `ha_token`*, `ha_sensor` |
| Sonarr | `sonarr_url`, `sonarr_key`*, `sonarr_days` |
| Radarr | `radarr_url`, `radarr_key`*, `radarr_days` |
| Trading 212 | `t212_key`* |
| NASA / CelesTrak | `nasa_key`*, `sat_group` |
| Søk | `search_url` |

\* hemmelighet → backend/env, se README «Hemmeligheter».

## 2. «Kommer ut» – Sonarr/Radarr
- Kort med plakat-rutenett (2:3), dato/status-merke nederst på plakaten, tittel + episode/type under.
- Sonarr: `GET {url}/api/v3/calendar?start=&end=&includeSeries=true` (header `X-Api-Key`). Plakat: `series.images[coverType=poster].remoteUrl`.
- Radarr: `GET {url}/api/v3/calendar?start=&end=`. Plakat: `images[coverType=poster].remoteUrl`. Status: kino / digital / fysisk / «overvåkes».
- Hent via backend (CORS + nøkkel). Klikk → `{url}/calendar`.

## 3. Nyhetslinje (ticker)
- Rett under header. Rødt «SISTE NYTT»-merke, kilde-badge (NRK `#0b4ea2`, VG `#c8102e`), tittel, klokkeslett. Kontinuerlig rulling (~70 s/loop, liste duplisert for sømløs loop), kanter tones ut med mask.
- Kilder: NRK RSS `https://www.nrk.no/toppsaker.rss`, VG RSS `https://www.vg.no/rss/feed/`. Hent server-side, cache 5 min, sorter på tid. Lenke til sak.
- Bør respektere `prefers-reduced-motion` (stopp rulling).

## 4. Søkebar
- Ligger i `data-dnd="top"`-gruppen sammen med Ruter og klokke/vær → kan dras mellom dem (standard: under Ruter, over klokke).
- Av/på i hamburgermenyen (`hl_hide_search`).
- Fire stiler (`hl_srch`): `light` (sentrert, Google-ord over, lyst felt), `dark` (sentrert, mørkt felt), `wideLight`, `wide` (full bredde, Google-ord til venstre i feltet). Google-ordet er farget tekst (#4285f4/#ea4335/#fbbc05/#34a853) – bytt gjerne til offisiell SVG.

## 5. Layout / drag-and-drop
- Header (`data-dnd="head"`) og fanene (`data-dnd="tabs"`) kan omorganiseres.
- Kort kan endre størrelse: usynlig håndtak 18×18 px nederst til høyre (cursor `nwse-resize`), bredde snapper til antall kolonner (`grid-column: span N`), høyde fri (min 120 px). Dobbeltklikk = nullstill. Lagres i `hl_size_{gruppe}_{i}`. «Tilbakestill» i menyen nullstiller også størrelser.
- Masonry: kortrutenett bruker `grid-auto-rows:4px; row-gap:0; grid-auto-flow:row dense`, og hvert kort får `grid-row-end: span ceil((høyde+20)/4)` via ResizeObserver. Kort med ulik høyde pakkes tett. (Kan erstattes med CSS `masonry` når støttet.)

## 6. Kalender-popup
- Klikk på dag → modal sentrert med uskarp bakgrunn: ukedag + dato, liste med tid · fag · type · rom. Lukk med × / klikk utenfor / Esc (legg til).
- Data fra iCal (`cal_ics`), filtrert på valgt dag.
- Mønsteret skal gjenbrukes for andre klikkbare elementer (agenda-rader, plakater, aksjer) – brukeren vil ha popup «hvor som helst».

## 7. Visuelt
- Kortfarge: `rgba(18,25,38,.86)` (dempet midnattsblå, litt gjennomsiktig). Indre rader/felt: `#1d2738`. Øvrige farger/fonter uendret (se README).
- Navn: **Sebastian** (hilsen, meny, avatar «S»). Oppdater også mobil/CV ved behov.

## localStorage-nøkler (prototype)
`hl_cfg`, `hl_srch`, `hl_hide_search`, `hl_order_*`, `hl_size_*`, `hl_bg`, `hl_bgc`, `hl_trusted`, `hl_budget`, `hl_receipts`. I produksjon: brukerinnstillinger lagres på server så de følger brukeren mellom enheter.
