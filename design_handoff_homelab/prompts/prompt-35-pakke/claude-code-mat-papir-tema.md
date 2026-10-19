# Mat (web): samme design og tema som resten av Homelab (Papir)

Vedlegg: `uploads/Screenshot 2026-10-19 at 20.21.37.png`. Mat er mørk (`#15140F`) med oransje (`#FF8A4C`), limegrønt «i dag»-kort (`#D4F25A`) og fontene Bricolage/Instrument Serif/Geist. Det passer ikke med resten av appen.
Fasit: `Matplan.dc.html` (gammel versjon: `Matplan v1.dc.html`).

## Fargetokens (bytt 1:1)
| Før | Etter | Bruk |
|---|---|---|
| `#15140F` | `#f3efe6` | bakgrunn |
| `#1D1C16`, `#1C1C1E` | `#fffdf8` | kort / dagkort / ark |
| `#24231C` | `#f7f3ea` | innfelte flater (Skann oppskrift, søk) |
| `#2E2C24`, `#3A3A3C` | `#ddd5c5` | kanter / linjer |
| `#26262A` | `#ece6da` | chips |
| `#F2EEE4` | `#1b1a17` | tekst (og valgt chip-bakgrunn → mørk med lys tekst) |
| `#C9C4B6` | `#3d3a33` | sekundær tekst |
| `#9A9588` | `#6b665c` | dempet tekst |
| `#7E7A6E`, `#77726C` | `#8a8478` | svakere tekst |
| `#FF8A4C`, `#FFB27F`, `#F59A8F` | `#b23a2a` | aksent (✦, «Sebastians beste», primærknapper, feil) |
| `#1A0C04` | `#ffffff` | tekst på aksentknapp |
| `#2A1A10`, `#3A2216` | `#fbeee8`, `#f6e3dc` | aksent-tint |
| `#4A2614`, `#7A3A1C` | `#e8c4b8` | aksentkant |
| `#D4F25A` (i dag) | `#1b1a17` | **i dag-kortet er mørkt** med lys tekst `#f3efe6` og dempet `#c9c1b1`, som «valgt» ellers i appen |
| `#7FD08A` / `#1E3321` | `#2f7a4f` / `#e3efe6` | OK / HelloFresh-merke |

## Typografi
- Rettnavn (Pizza, Biff …): **Newsreader 500** (ingen Bricolage 800 på i dag-kortet). «Denne uka» Newsreader 500 36 px, «Retter» Newsreader 500 34 px (antallet «13» i Manrope).
- Brødtekst og knapper: **Manrope**. Ukedag / «UKE 43 · 19.–25. OKT» / MAPPER: **IBM Plex Mono** 600, sperret.
- `color-scheme: light`.

## Komponenter
- **Primærknapp** («✦ Ny ukeplan med AI», «Kamera»): `#b23a2a` med hvit tekst. Sekundær: kantpille `#ddd5c5` på `#fffdf8`.
- Bryter («Ny plan hver søndag»): samme bryter som resten av appen: 44 × 26, radius 13, knott 20 px hvit med skygge `0 1px 3px rgba(0,0,0,.2)`, `top: 3px`, `left: 3px` (av) / `21px` (på), `transition: left .2s`. På = `#b23a2a`, av = `#ddd5c5`. Feilen i skjermbildet `uploads/Screenshot 2026-10-19 at 20.25.25.png` var at knotten lå skjevt fordi `padding` ble lagt til utenfor bredden (`box-sizing`).
- Personvelger (Sebastian ▾) og «Fast» som Papir-piller.
- Mappe-chips: valgt = `#1b1a17` / `#f3efe6`, ellers `#fffdf8` med kant.
- Mørkt tema i appen: bruk de samme tokenene som Kalender-appens `THM.dark` (`#161513` / `#211f1b` / `#efe9de` / aksent `#ec7a64`), ikke den gamle Mat-paletten.

## Kokkvelger og «Fast» får plass (navn kuttes ikke)
Vedlegg: `uploads/Screenshot 2026-10-19 at 20.33.05.png` («Sebast…» kuttet).
- Raden: `display:flex; gap:6px`. Velgeren har `flex: 1 1 0; min-width: 0` (fjern `max-width:170px`). «Fast» er `flex: none`.
- Velger: høyde 40, `padding: 0 28px 0 13px`, Manrope 14,5 / 600, pil 10 px fra høyre. «Fast»: høyde 40, `padding: 0 11px`, 13,5 / 600.
- «Sebastian» skal stå helt i kort ned til ca. 230 px bredde. Smalere kort: ellipsis + `title` med hele navnet. Under 200 px kortbredde: vis fornavn-initial i en rund avatar (32 px) i stedet for tekst.
