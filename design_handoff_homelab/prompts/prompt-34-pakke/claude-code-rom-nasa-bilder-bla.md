# Rom (web): NASA-bildene vises ikke + hele siden i samme blå

Vedlegg: `uploads/Screenshot 2026-10-19 at 20.22.14.png`. «Dagens bilde» og «Siste 7 dager» viser fargede gradienter med «© Eksempel · eksempeldata» i stedet for ekte NASA-bilder. Bare toppanelet er blått, resten er papirfarget.
Fasit: `Rom.dc.html` (`variant="a"`) og `Homelab Papir Web.dc.html` → Rom-fullskjermen.

## 1. Ekte bilder, aldri eksempeldata
- **Fjern eksempeldataene** (gradienter / «Ørnetåken i infrarødt» / «© Eksempel»). De skal aldri vises i produksjon.
- Kjede (på serveren, cache 6 t):
  1. **APOD** `https://api.nasa.gov/planetary/apod?api_key=<EGEN NØKKEL>&thumbs=true&start_date=<i dag − 6>`. DEMO_KEY er begrenset til 30 kall per time per IP og feiler raskt. Skaff gratis nøkkel på api.nasa.gov og legg den i AI-kontroll → API og nøkler (eller `.env NASA_API_KEY`).
  2. Feiler APOD: **NASA Image Library** `https://images-api.nasa.gov/search?media_type=image&year_start=<år−2>&q=<nebula|galaxy|hubble|webb telescope|aurora from space|planet, roteres per dag>`. Sorter på `date_created` og ta 7. Krever ingen nøkkel. Bilde: `links[0].href` (thumb), stort bilde med `~thumb` → `~medium`. Lenke: `https://images.nasa.gov/details/{nasa_id}`. Kilde vises som «NASA».
  3. Feiler begge: tom tilstand «Fikk ikke hentet bilder fra NASA akkurat nå · Prøv igjen», uten falske bilder.
- APOD-videoer: bruk `thumbnail_url`. Mangler den, vis YouTube-thumbnail og ▶.
- Last bildene med `<img loading="lazy" decoding="async">` og `onerror` → thumb-URL. Ikke bruk CSS-bakgrunn uten fallback.
- Server-proxy for bildene (`/api/rom/img?u=…`) hvis CSP/CORS blokkerer.

## 2. Hele siden i samme blå
- Fullskjermen på web: bakgrunn **`#0b1220`**, tekst **`#e9eef7`**. Den faste toppen («Rom» + ✕) har gradient `#0b1220 → transparent`. ✕ er lys (`#e9eef7` med mørkt kryss).
- Kort og flater: `#121d33` (ISS-kort, «Over Oslo nå», rover-kort, bilde-plassholdere `#1b2740`). Linjer `rgba(255,255,255,.07)`.
- Tekst: primær `#e9eef7`, sekundær `#c8d3e6`, dempet `#93a3bd`, svak `#7f8fa8`.
- Seksjonsetiketter («DAGENS BILDE FRA VERDENSROMMET · NASA», «FRA MARS · ROVERNE»): `#e8794a` (oransje, samme som Starlink-prikkene). Valgt dag i «Siste 7 dager» har 2 px kant i `#e8794a`.
- Status «Aktiv» på rovere: grønn `#3fbf9a`.
- Mobil Rom: samme blå palett.

## 3. Zoom i kartet + Norge-visning
Fasit: `Rom.dc.html` → `vw()`, `setVw()`, `bindMap()`, `views`, `zIn/zOut`.
- **Zoom** 1×–14×:
  - Mus: hjul zoomer rundt pekeren, dra panorerer, dobbeltklikk zoomer 2× dit man klikket.
  - Touch: klyp for å zoome, ett finger panorerer (`touch-action: none` på kartet).
  - Knappene **+ / −** nede til høyre viser zoomnivået («×6»).
- **Visninger** nede til venstre (pille): **Verden** (×1) · **Europa** (lon 12, lat 54, ×3,2) · **Norge** (lon 15, lat 65, ×6). Animert overgang 0,42 s (ease-out cubic).
- Projeksjonen er fortsatt ekvirektangulær med senter og zoom: `x = W/2 + (lon − lonC)/360·W·z`, `y = H/2 − (lat − latC)/180·H·z`. Visningen holdes innenfor kartet.
- Fra ×3: norske byer vises som prikker med navn (Oslo, Bergen, Trondheim, Tromsø, Bodø, Stavanger, Kristiansand, Alta). Satellittprikkene blir litt større når man zoomer inn.
- Husk siste visning (`localStorage rom_view`). Valgt by i «Over Oslo nå» kan gjerne sette visningen til Norge.
