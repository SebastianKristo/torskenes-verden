# Web · Hjem: widgetområdet i stil 2c («Helfarge på de viktigste»)

Valgt 2026-10-20: «jeg velger valg 2c i hjem web varianter for hjem i web».
Fasit: `Hjem Web Varianter.dc.html` → **2c** (alle widgets, riktige plasser) og `Homelab Papir Web.dc.html` → `dashView` (bygget inn).
Vedlegg med dagens oppsett: `vedlegg/hjem-web-i-dag.png`.

## Hva som IKKE endres
Alt over widgetene: toppmeny, hilsen, Glimt-brief, temperatur, søkefelt og nyhetslinja. Widgetene beholder **samme plass, innhold og funksjon** (trykk, lenker, hold inne for å flytte/skjule).

## Hva som endres
Hver widget blir et eget kort, så de er lette å skille, med mer farge:
- **Kort:** radius 20, padding 18 × 20, gap 14 mellom kortene, kortene i samme rad er like høye.
- **Topp i hvert kort:** 24 × 24 ikonrute (radius 8) + etikett i IBM Plex Mono 10,5 px, `letter-spacing .12em`.
- **Helfargede kort** (hvit tekst, dempet tekst `rgba(255,255,255,.72)`, linjer `rgba(255,255,255,.18)`, skygge `0 14px 30px -18px rgba(0,0,0,.45)`, ikonrute `rgba(255,255,255,.18)`):
  - I dag på skolen `#2B5D8A`
  - Kalender · neste time `#2F7A4F`
  - Vær `linear-gradient(170deg,#6F8FB5,#3E5878)`
  - Penger `#1F7A6E`
  - Mediehistorikk og Media / Spilles nå `#231F1A` (etikett i Plex-gul `#E5A00D`)
- **Lyse kort** (`#FFFDF8`, linjer `#ECE5D8`, ikonrute og etikett i widgetens farge):
  - Avganger `#D4231B` · Posisjon/Familie `#6B4FA0` · Bursdager `#C2477A` · Skolekalender `#3F7A6E` · Energi `#D98C1F` · Kommer ut `#8A6A3A` · Snarveier `#55524D` · Trading 212 `#5B5BD6` · Pakker `#A8661A` · Økonomi `#B23A2A`
- Dagens dato i skolekalenderen, siste søyle i energi og fremdriftslinjer bruker widgetens farge.
- Snarveier blir små piller (`#F1ECE2`, radius 15) med fargeprikk.
- Ikoner: se `IC2` i fasiten (skole, buss/trikk, familie, gave, kalender, klokke, play, lyn, lommebok, lenke, sky, graf, pakke, kakediagram).

## Plassering (3 kolonner, som i dag)
1. Skole · Avganger · Familie
2. Skolekalender (2 rader høy) · Neste time · Bursdager
3. (kalender) · Energi · Spilles nå
4. Kommer ut · Snarveier · Penger
5. Mediehistorikk (full bredde)
6. Vær · Trading 212 · Media (2 rader høy)
7. Pakker · Økonomi · (media)

## Rediger-modus
Uendret funksjon. Kortene får stiplet ramme i widgetfargen når man holder inne, og samme «Flytt / Skjul»-meny som i dag.

## Mørk modus
Helfargede kort beholder fargen. Lyse kort blir `#211F1B` med tekst `#EFE9DE`; ikonrute og etikett beholder widgetfargen.
