# «Nytt i versjon»-boksen: lesbar på web og mobil

## Problem (skjermbilde 2026-10-25 10.19.14)
- Boksen er halvgjennomsiktig glass over værbildet. Bakgrunnen skinner gjennom, særlig nederst der hero-bildet slutter.
- Datolinja («25.10.2026 · kvitteringsrettingen …») er gul/beige på lys bakgrunn: nesten usynlig.
- Lang punktliste uten struktur, teksten kuttes midt i en linje nederst.
- «Ok»-knappen har dobbel ring (fokusring + kant) og blå farge som ikke finnes ellers i appen.

## Fiks
**Flate:** helt ugjennomsiktig papirkort, ingen backdrop-filter.
```css
.whatsnew{background:#fbf8f2;color:#1b1a17;border:1px solid #d8d1c2;border-radius:24px;
  box-shadow:0 24px 60px -20px rgba(27,26,23,.45);width:min(440px,calc(100vw - 32px));
  max-height:min(640px,calc(100vh - 48px));display:flex;flex-direction:column;overflow:hidden}
```
Legg et dempet slør bak (`rgba(27,26,23,.35)`) så boksen skiller seg fra bildet. På mobil: bunnark i full bredde.

**Hode (fast, scroller ikke):** padding 22px 24px 14px, border-bottom 1px #d8d1c2
- Etikett: `NYTT I HOMELAB` – IBM Plex Mono 600 10.5px, letter-spacing .12em, #b23a2a
- Tittel: «Versjon 4.45.0» – Newsreader 500 28px/1.1, #1b1a17
- Dato: «25. oktober 2026» – Manrope 500 13px, **#6b665c** (aldri gul/beige). Interne merknader som «prompt 51» skal ikke vises for brukeren.

**Innhold (scroller):** `flex:1;overflow-y:auto;overscroll-behavior:contain;padding:16px 24px 8px`
- Hvert punkt som egen blokk, ikke én lang bullet:
  - Overskrift: Manrope 700 15px #1b1a17 (f.eks. «Bedre lesing av kvitteringer»)
  - Brødtekst: Manrope 400 14px/1.55 #3d3a34, maks 3–4 linjer. Kutt teknisk detalj (modellnavn, px, org.nr.-detaljer) eller legg den bak «Les mer».
  - 14px luft mellom punktene, 1px #e6dfd2 skillelinje.
- Fade nederst i scrollflaten (`linear-gradient(transparent,#fbf8f2)`, 28px) så teksten ikke kuttes hardt.

**Bunn (fast):** padding 14px 24px 20px, border-top 1px #d8d1c2, knapp til høyre
- «Ok»: height 46px, padding 0 26px, radius 23px, background #1b1a17, color #f3efe6, Manrope 700 14.5px, ingen kant.
- Fokus: `outline:2px solid #b23a2a;outline-offset:3px` kun ved `:focus-visible` (ikke ved klikk).

**Kontrast-krav:** all tekst ≥ 4.5:1 mot #fbf8f2. #6b665c = 5.3:1, #3d3a34 = 10:1.

## Test
- Åpne over regn-/natt-bakgrunn: ingen bakgrunn synlig gjennom boksen.
- Lang changelog: hodet og Ok-knappen står fast, bare listen scroller, siste linje fader.
- Tastatur: Tab til Ok gir rød fokusring; musklikk gir ingen ring.
