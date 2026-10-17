# FinansHub – designspesifikasjon (handoff)

Denne filen beskriver designet slik at det kan bygges inn i en eksisterende nettside/Docker-app. Kildene til skjermene ligger i `design-source/` (`.dc.html`-filer fra Claude Design). De bruker en egen mal-syntaks (`{{hull}}`, `<sc-for>`, `<sc-if>`) og en runtime (`support.js`) som ikke følger med, så de skal **oversettes** til vanlig HTML/React – ikke kopieres rett inn. Selve markupen, stilene og eksempeldataene i `renderVals()` er fasiten.

## Skjermer

| Fil | Skjerm | Størrelse |
|---|---|---|
| `design-source/Main.dc.html` | Desktop · Oversikt (dashboard) | Flytende, maks innholdsbredde 1180 px |
| `design-source/Mobil-Hjem.dc.html` | Mobil · Hjem | 390 × 844 |
| `design-source/Mobil-Skann.dc.html` | Mobil · Bekreft kvittering | 390 × 844 |

Desktop og mobil er samme app: på smal skjerm (< 768 px) byttes sidemenyen ut med bunnmenyen fra `Mobil-Hjem`.

## Designtokens

```css
:root {
  /* flater */
  --bg:          #0D0F12;   /* side-bakgrunn */
  --bg-side:     #111418;   /* sidemeny, bunnmeny */
  --surface:     #15181D;   /* kort */
  --surface-2:   #1A1D22;   /* elementer inni kort */
  --chip:        #1E2228;   /* kategori-merkelapp, aktiv menypunkt */
  --track:       #23272E;   /* bakgrunn i fremdriftsstolper */
  --border:      #22262D;
  --border-input:#2A2F37;

  /* tekst */
  --text:        #EDEFF2;
  --text-2:      #C4C9D1;
  --muted:       #A0A7B2;

  /* signal */
  --accent:      #7AA7FF;   /* inn, primærknapper, budsjett innenfor */
  --accent-ink:  #0D0F12;   /* tekst på accent */
  --out:         #F2A65A;   /* ut, over budsjett, varsel-badge */
  --out-soft:    #F7C08A;   /* tekst for varsler */
  --warn-bg:     #241C12;   /* bakgrunn «til gjennomgang» */
  --warn-border: #3A3022;
  --ok:          #5FD3A8;   /* statusprikk AI-motor */
  --ok-soft:     #9FE3C6;   /* «høy sikkerhet», «matchet» */
  --ok-bg:       #13201B;
  --ok-border:   #1F3A2F;

  /* form */
  --radius-card: 14px;      /* mobil: 16–18px */
  --radius-ctl:  10px;      /* knapper, input (mobil 11–13px) */
  --radius-chip: 6px;
  --gap:         16px;
  --pad-card:    22px;      /* nøkkeltall: 20px */
}
```

Alternative aksentfarger (tweak i designet): `#5FD3A8`, `#B79CFF`, `#E9C46A`.

## Typografi

- **Geist** (400/500/600/700) for all tekst. **Geist Mono** (400/500/600) med `font-variant-numeric: tabular-nums; letter-spacing: -0.02em` for alle beløp og datoer.
- Google Fonts: `https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap`

| Rolle | Størrelse / vekt |
|---|---|
| Sidetittel (h1) | 32 px / 700, letter-spacing −0.03em |
| Korttittel (h2) | 16 px / 600 |
| Nøkkeltall | 28 px / 600 mono, «kr» 15 px muted |
| Stort tall mobil | 38 px / 600 mono |
| Brødtekst | 14 px / 400, line-height 1.45 |
| Hjelpetekst | 12–13 px, `--muted` |
| Tabellhode | 12 px, uppercase, letter-spacing 0.06em, `--muted` |

## Komponenter

**Sidemeny (desktop)** – 232 px, `--bg-side`, høyre kant `--border`. Logo (32 px rute i accent med graf-ikon + «Finans**Hub**»). Menypunkter 40 px høye, radius 9 px; aktivt punkt `--chip` bakgrunn og `--text`, øvrige `--muted`. Badge for antall kvitteringer: oransje pille. Nederst kort med «AI-motor», grønn statusprikk, modellnavn og reserve.

Menypunkter: Oversikt, Transaksjoner, Kvitteringer, Budsjett, Faste utgifter, Kontoer, Rapporter, Innstillinger.

**Toppfelt** – «Oversikt» (muted) over h1 «Oktober 2026». Til høyre: månedsvelger (‹ Okt ›), søkefelt 220 px, sekundærknapp «Ny transaksjon», primærknapp «Skann kvittering» med skanne-ikon. Alle 44 px høye.

**Nøkkeltall** – grid `repeat(auto-fit, minmax(220px, 1fr))`: etikett, tall + «kr», kort notat (grønt `--ok-soft` når positivt avvik).

**Graf «Inn og ut»** – grupperte søyler per måned, inn = accent, ut = `--out`, maks 18 px brede, radius 4 px oppe, inneværende måned full opasitet, andre 0.85. Legende øverst til høyre.

**Budsjett** – per kategori: navn, «brukt / budsjett» i mono, 8 px stolpe. Over budsjett: oransje stolpe (fylt 100 %) og linjen «Over budsjett med X kr».

**Siste transaksjoner** – tabell (min-bredde 560 px, horisontal scroll i boks): dato (mono, muted), beskrivelse + konto under, kategori-chip, kvitteringsstatus, beløp høyrejustert mono. Inntekter med «+» og accent-farge, utgifter med «−» og vanlig tekstfarge.

**Trenger gjennomgang** – kort med varm kant `--warn-border`, badge «2 nye». Hver rad: kvitterings-miniatyr, butikk + beløp, «dato · kategori · motor», statuslinje (grønn «Alle felt lest sikkert» / oransje «Sjekk beløp – uklart bilde»). Hele raden er en lenke til bekreft-skjermen.

**Kommende faste utgifter** – liste: navn, «Trekkes 20. okt», beløp.

**Mobil · Hjem** – hilsen + måned, varsel-knapp 44 px. Stort kort «Igjen å bruke i oktober» med 10 px stolpe. Banner for kvitteringer til gjennomgang (varm bakgrunn). Liste «Siste» med initial-ikon. Bunnmeny 92 px: Hjem, Liste, [Skann – 64 px rund accent-knapp løftet 30 px], Budsjett, Meg.

**Mobil · Bekreft kvittering** – tilbake-knapp, tittel, «1 av 2». Bildeforhåndsvisning 196 px med markerte felt (accent-omriss) og «Ta nytt bilde». Statuslinje «Lest av Gemini · 2,1 s» + «Høy sikkerhet». Skjema: Butikk, Dato + Total (Total med accent-kant), mva-linje. Kategori-chips (valgt = accent fyll, `aria-pressed`). «7 varelinjer ›». Grønt match-kort «Matchet mot kortkjøp 16.10 · −386,50 kr · Brukskonto». Fast bunnfelt: «Avvis» (1/3) og «Bokfør» (2/3), 52 px.

## Ikoner

Strek-ikoner, 2 px, `stroke-linecap/linejoin: round`, 18–22 px. Lucide-ikoner matcher direkte: `chart-line`, `scan-line`, `camera`, `bell`, `home`, `list`, `pie-chart`/`clock`, `user`, `sparkles`, `link`, `chevron-left/right`.

## Tilgjengelighet

- Ekte `<button>`, `<a href>`, `<input>` + `<label>` overalt; ikon-knapper har `aria-label`.
- Trykkflater ≥ 44 px.
- Kontrast: sekundærtekst `#A0A7B2` på `#15181D` holder 4.5:1. Mørkere grå enn dette brukes ikke til tekst.
- Inn/ut skilles både på farge (blå/oransje), fortegn (+/−) og lyshet – ikke bare farge.

## Responsivitet

- Rotlayout: `display: flex; flex-wrap: wrap`. Sidemeny `flex: 1 1 232px`, innhold `flex: 999 1 560px; min-width: 0` – menyen legger seg over innholdet på smal skjerm (i appen: bytt til bunnmeny).
- Kortrader: `flex-wrap: wrap`, graf/transaksjoner `flex: 2 1 520px`, sidekolonne `flex: 1 1 320px`.
- Toppfeltets knapper wrapper.

## Innbygging i eksisterende Docker-nettside – forslag

1. Bygg frontend som React + Vite (eller rene HTML-sider hvis nettsiden er statisk) etter denne spesifikasjonen.
2. Legg tokens over i en egen `finanshub.css` og prefiks klasser (f.eks. `.fh-`) så de ikke kolliderer med resten av siden.
3. Server appen under en egen sti (`/finans/`) eller subdomene via eksisterende reverse proxy, og backend (FastAPI) som egen container – se `README.md` for compose-oppsett.
4. Bruk eksempeldataene fra `renderVals()` i hver `.dc.html` som mock til API-et er på plass.
