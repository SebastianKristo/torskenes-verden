# B – Web/PWA (`public/`, `public/finans/`, `sw.js`)

Kartlagt 2026-11-14. Ingen endringer i repoet. Målingene er gjort med Playwright 1.x + Chrome for Testing 153 mot mock-serveren (`test/e2e51/server.mjs`, port 4921, `DATA_DIR=$S/audit-B`, `MOCK_DATA=1`). Alle utgående kall ble blokkert i nettleseren. Skriptene ligger i `audit/B-web-skript/`, skjermbilder i `audit/B-web-bilder/` og rålistene i `audit/B-web-vedlegg.md`.

Temaene heter i koden: `data-hl="cur"` («Nåværende», mørkt glass), `data-hl="2c"` («Vindu og papir» = Papir) og `data-mode="light|dark"` (Papir lys/mørk). I tillegg har FinansHub `data-theme="lys|mork|glod"` og Kalender `data-kal-theme`. Det betyr **fem parallelle temasystemer**.

## 0. Sammendrag

| Tema | Tall (målt) | Brukerens anslag |
|---|---|---|
| CSS-filer i `public` | 65 (58 i `css/` + 7 i `finans/css/`), 1,99 MB ukomprimert; 41 har nummersuffiks | 58 ✔ (65 med finans) |
| `!important` | 1 218 (raw). **914 av dem (75 %) ligger i én fil: `finans/css/mobile.css`.** Webskallet (`css/`) har 304. | ~190 ✘ (6× flere) |
| Unike fargeverdier i CSS | 942 unike hex. 928 ugjennomsiktige farger og 470 med alfa. Med ΔE<5 blir de 354 klynger. | ~600 ✘ (flere) |
| JS-filer | 300 (208 i `js/` + 92 i `finans/js/`), 7,3 MB. 189 har nummersuffiks. | – |
| Lastet per app-rute (desktop) | 42 CSS + 179–191 JS = 1,6 MB gzip / 4,2 MB dekomprimert, 286–329 forespørsler, 61–78 API-kall | – |
| CSS faktisk brukt | 21 % av 1,9 MB (dekning over 21 ruter × 4 temaer + mobil + FinansHub) | – |
| Parallelle variabelsett | ca. 190 prefikser; minst 12 «fulle» palettsett (`--p*`, `--pp-*`, `--mp-*`, `--f-*`, `--c40-*`, `--c44-*`, `--s65-*`, `--k*`, `--t52*`, `--x*`, `--h40-*`, root-settet i `app.css`/`paper.css`/`finans.css`) | – |

**De viktigste funnene:**
1. **Lag-på-lag er mest scoping, ikke direkte overstyring.** Bare 405 av 98 789 (selektor, egenskap)-par er definert i mer enn én fil. Overstyringen skjer i stedet via (a) **variabler som redefineres** i opptil 8 filer (`--card`, `--line`, `--ink`, `--acc` …) og (b) høyere spesifisitet, f.eks. `html[data-hl="2c"] …` (1 445 selektorer) og `html[data-mode="dark"] …` (600). Samme klasse styles fra mange filer: `.on` i 42 filer, `.ok`/`.red` i 23 og `.card` i 6. 47 klasser er mål i ≥5 filer.
2. **`finans/css/mobile.css` er 752 KB (38 % av all CSS), har 7 535 regler og 914 `!important`.** Bare 8 % av den ble brukt i målingene. Den lastes også på FinansHub desktop.
3. **Hele webappen lastes ved første visning.** `app.js` har 45 statiske importer som drar inn 179 moduler (3,3 MB dekomprimert) på alle ruter. Bare Skjold lastes dynamisk. `media.js` henter `/media/now`, `/recent` og `/history` på toppnivå ved hver oppstart.
4. **Mobil-FinansHub (390 px, 4× CPU):** 24 lange oppgaver (1,9 s), LCP 3,5 s og **132 tvungne layouter (1,0 s)**. Hovedkilden er `bigOn()`/`foldOn()` (`innerWidth` lest midt i rendringen) i `mobile-p43.js:241` og `mobile-p41.js:108`.
5. **Fargefeil:** FinansHub desktop ignorerer Papir mørk (helt lys side, se bilde). I `cur`-temaet vises Familie som lyst papir og Kalender som lyst papir. I Papir lys er tre til fire faner i toppmenyen skjult uten synlig rullefelt. I Papir mørk brukes aksentrødt `#b23a2a` på mørk bunn (3,1:1).

---

## 1. Lagvise filer – web

### 1.1 Lasterekkefølge

**`public/app.html`** (`/`, alle `#/…`-ruter) lenker 34 stilark statisk i denne rekkefølgen (linje 17–50):
`app → tracking → family → tasks → paper → weather → birthdays → kalender → chat → chat70 → backup → web30 → web31 → web32 → web34 → glimt-figs → web35 → web36 → web37 → web38 → kal39 → web39 → web40 → web41 → web42 → web43 → web44 → web44-dark → web45 → web46 → web52 → web65 → web66-sys → web88-dark`.
Deretter kommer skriptene `crash51.js`, `hl-boot.js` (synkron tema-oppstart), modulene `app.js`, `qa51.js`, `webx51.js`, `dal53.js`, `people55.js`, `voice54.js` og nederst `boot52.js` og `chat70-boot.js`.
JS injiserer flere stilark ved behov: `media.css`, `media43/50/70.css`, `media-nrk.css`, `media-musikk.css`, `mat.css`, `family50.css`, `news.css`, `news73.css`, `space.css`, `smb-wizard.css`, `ai-control.css?v=65`, `claude-import43.css`, `web73-brief.css`, `skjold76/77/78/79/82.css`, `receipts48/51.css`, `leaflet.css`, `finans/css/finn.css` og `finans.css`.

**`public/finans/index.html`** har 6 stilark (`finans → mobile → fin42 → plan51 → fin52 → logo73`) og ca. 25 linjer inline `<style>` for lasteskjermen. `loader.js` setter tema. `main.js` laster **enten** `desktop.js` **eller** `mobile.js` dynamisk (prompt 85). Stilarkene skilles derimot ikke: `mobile.css` lastes alltid.

**`login.html`** laster `login.css` og `login.js`. `cv.html` og `join51.html` har egne filer. Det finnes ingen `public/index.html`: `/` serveres av `app.html`.

**Reachability:** Skriptet `graph.mjs` følger HTML → statiske/dynamiske importer → strenger med `/assets/…css|js`. Det finner at 366 av 367 filer er referert. **Eneste helt døde fil: `js/family.js` (56 KB)**, erstattet av `family50-web.js` (jf. kommentar i `app.js:18`). Følgefeil: `css/family.css` (24 KB) lastes fortsatt statisk, og bare 9 % av den brukes.

### 1.2 Familier

| Familie | Filer | Størrelse | I bruk? (målt dekning) | Merknad |
|---|---|---|---|---|
| `web30…web88-dark.css` | 22 (web30–32, 34–46, 44-dark, 52, 65, 66-sys, 73-brief, 88-dark) | 466 KB | Alle unntatt 73-brief lastes alltid. Bruk: web37 **0 %**, web34 **0 %**, web38 11 %, web41 11 %, web45 11 %, web43 12 %, web42 12 %, web44 19 % … web65 61 % | Overstyringspar med flest treff: web30→web32 (84), web36→web38 (65), web30→web31 (45), web38→kal39 (18), web44-dark→web88-dark (18). web30 har 129 deklarasjoner som overstyres senere. |
| `paper.css` + `web40.css` + `web44-dark.css` + `web88-dark.css` | 4 | 159 KB | 27–58 % | Papir-paletten defineres i paper.css og web40, overstyres for mørkt i web44-dark (179 variabeldefinisjoner, 672 hex) og igjen i web88-dark. |
| `media*.css` / `media*.js` | 6 CSS + 8 JS (`media`, `media43/44/45/50/70`, `-nrk`, `-musikk`) + `medctl51`, `medfam51`, `playback44` | 81 KB CSS, 248 KB JS | media43.css 6 %, media50.css 3 %, media70.css 42 %, nrk og musikk 0 % (fanene ikke åpnet) | `media43.js` er ruteren og importerer 44/50/70 statisk og 45 dynamisk. `media.js` er dashbord-widgeten. 89 av 277 regler i media43.css (32 %) har klasser som ikke finnes i noen JS. |
| `skjold76–82` | 5 CSS + 12 JS | 49 KB + 256 KB | 76: 37 %, 77: 2 %, 78: 5 %, 79: 9 %, 82: 0 % (bare forsiden målt) | Lastes dynamisk. Det er ryddigst av familiene. |
| `settings*.js` | 28 filer (`settings.js`, `settings44/45/46/62/64/65`, `settings-*`) | 528 KB | Statisk importert via app.js | `settings-track37/46/70` og `settings-integ/integ43` er tre og to lag av samme side. |
| `kal*` | `kalender.css`, `kal39.css` + 9 JS (`kal38/39/42/44`, `kal-google39`, `kal-manage35`, `kal-quick`, `kal-theme40`, `cal70`) | 244 KB JS | kalender.css 13 %, kal39 51 % | Eget temasystem (`data-kal-theme`). |
| `chat*` | `chat.css`, `chat70.css` + 7 JS | 160 KB | 35 %/67 % | |
| `family*` | `family.css`, `family50.css` + 4 JS | 148 KB | 9 %/27 % | `family.js` er død, og `family.css` er nesten død. |
| `receipts48/51.css` | 2 | 10 KB | 0 % | Bare Innstillinger → AI → Kvitteringer. |
| FinansHub CSS | 7 | 924 KB | mobile 8 %, **finn 0 %**, fin42 5 %, fin52 1 %, logo73 0 %, finans 29 %, plan51 38 % | |
| FinansHub `mobile-*.js` | 67 filer, hvorav 42 `mobile-p16…p52` (+ `p30b`, `p34ai`, `p40h`, `p41b`, `p43m`, `p44a/l/s`, `p45h`, `p46k`, `p50f`) | 2,6 MB (p*: 1,76 MB) | Lastes alle på mobil (88 JS-forespørsler) | Hver prompt er ett lag. `mobile-paper`, `mobile-paper2` og `mobile-paper3` er tre generasjoner av samme forside. |

Rålister: vedlegg V1 (per fil), V3 (dekning per fil) og V4 (overstyringer).

### 1.3 Død CSS/JS

* **Statisk døde regler.** 1 120 av 20 095 regler (5,6 %) har minst én klasse som ikke forekommer noe sted i `public/` eller `server/`. Topp: paper.css 19 % (107 regler), media43.css 32 % (89), web42 16 %, kalender 14 %, web31 14 %, tracking 13 %, app.css 11 % (109). Vedlegg V6.
* **Ikke truffet ved kjøring.** 79 % av CSS-bytene ble aldri brukt i dekningskjøringen: 21 ruter + 12 innstillingssider, temaene cur/2c × lys/mørk, 390 og 1440 px, og FinansHub desktop/mobil. Dette er en **øvre grense** for død CSS, siden ark, menyer og feiltilstander ikke ble åpnet. Rene 0 %-filer som lastes på hver side: `web34.css` (søkemarkering i Innstillinger) og `web37.css` (brief-panel). De bør flyttes til modulene som bruker dem.
* **Død JS.** `js/family.js` (56 KB). V8-dekningen per fil var upålitelig for ES-moduler (rapporterte 0 % på moduler som åpenbart kjørte), så tallet for død JS er **ikke** målt. I stedet: 20 filer (232 KB) ble aldri lastet i noen av kjøringene. Det er login/cv/join-sidene (forventet) og i tillegg `kal-manage35`, `kal-google39`, `settings-mail`, `claude-import43`, `news.js`/`news73` og `mobile-p44a/l/s`. De er dynamiske og bak handlinger, altså ikke døde.
* **Unpkg-reserve for Leaflet er død kode.** `finans/js/mobile-p16.js:349`, `mobile-p22.js:135` og `mobile-p46k.js:156` laster `https://unpkg.com/leaflet…` uten SRI. CSP-en `script-src 'self'` blokkerer den uansett.

### 1.4 Hva overstyrer hva

* Overstyring av **eksakt samme selektor** er sjelden (405 par). De dypeste kjedene: `.mono{font-family}` i 4 filer (app > family > birthdays > web44) og `#settings{padding}` i 3 (app > web30 > web31). Det finnes 12 `!important`-kjeder over filer, f.eks. `.set-done{position}` web30! → web31! og `.k2-sheet` reduced-motion web38! → web52!.
* Det reelle lagproblemet er **variabler**. `--card` defineres 18 ganger i 8 filer, `--line` 20 ganger i 8, `--acc*` 34 ganger i 8, `--ink` 14 ganger i 6 og `--muted` 12 ganger i 5. Kortbakgrunnen på dashbordet avgjøres av `web40.css: .dg40 .dg36-it > .dg36-wig{background:var(--c40-card)}`, og verdien av `--c40-card` settes i web40 og igjen i web44-dark. Mat bruker `--mp-*` (mat.css, web44-dark, finans/mobile.css) og Familie `--f-*`. CDP-sporing (`casc.mjs`) viste 1–3 regler fra 1–3 filer per kort, men verdien kommer fra variabelkjeden.
* **86 variabler brukes med `var()` uten å være definert i CSS.** Noen settes fra JS, men flere ser ut til å være rester: `--mat-bg`, `--mat-card`, `--mat-t` (mat.css bruker `--mp-*`), `--p-d`, `--p-dw`, `--m3-7BE3A0`. 250 variabler defineres, men brukes aldri.

---

## 2. Designinkonsistens – web

### 2.1 Tall

| Egenskap | Unike verdier | Merknad |
|---|---|---|
| Farger (hex) | 942 | 354 klynger ved ΔE<5. Papir-blekk `#1b1a17` har **43 nyanser**, Papir-bunn `#f3efe6` **46**, linje `#d8d1c2` **22**, mørk kortbunn `#3a352c` **20**, mørk bunn `#0c1119` **27**. Vedlegg V7. |
| Alfafarger | 470 | `rgba(255,255,255,.04…​.2)` brukt hundrevis av ganger (glass-temaet) |
| font-family | 64 deklarasjonsvarianter, 22 familienavn | Manrope, Newsreader, IBM Plex Mono (Papir); Outfit, JetBrains Mono, Geist (cur); FinansHub laster i tillegg Instrument Serif, Bricolage Grotesque, DM Mono, Roboto Flex, Inter. `app.html` henter 4 familier og `finans/index.html` **10 familier** fra Google Fonts. |
| font-size | 75 | 13px×699, 12px×659, 14px×594, **12.5px×566**, 15, **13.5**, 11, 16, **14.5**, **10.5**, **11.5** … Halvpikselsteg i hele skalaen. |
| font-weight | 16 | inkl. 650 og `var(--dw)` |
| border-radius | 127 (40 rene px-verdier) | 999, 12, 14, 18, 16, 20, 50 %, 10 … |
| box-shadow | 438 | Nesten alle er unike |
| z-index | 105 | fra −2 til 2147483000. 18 verdier over 1000 (9990, 9998, 9999, 10000, 10001, 2147480000 …) |
| transition-varighet | ~40 | .2s, .15s, .3s, .25s, .4s, .18s, .32s, .22s, .28s … |
| gap / padding | 93 / 793 | gap: 8, 10, 6, 12, 2, 14, 4, 3 … |
| `@keyframes` | 294 | |

### 2.2 Eksisterende tokens

Det finnes ingen felles kilde, men mange halve. Root-settet (`--bg`, `--card`, `--line`, `--text`, `--muted`, `--acc`, `--green`, `--red` …) defineres i app.css (cur), paper.css (2c), web40/web44-dark (2c mørk) og finans.css (FinansHub, 247 egne variabler). Ved siden av kommer domenesett: `--pp-*` (Papir-pille), `--c40-*`/`--wc`/`--wic` (dashbordkort), `--c44-*`, `--s65-*` (Innstillinger), `--t52*` (15 navn, 1 fil), `--mp-*` (Mat, 47 navn), `--f-*` (Familie), `--k*` (Kalender, 12 filer), `--p*`/`--p88-*` (Media 70/web88), `--x*`/`--a*`/`--h40-*`/`--m3-*` (FinansHub mobil), `--s*` (Skjold). Brukeren nevner `--hl-*`: det er bare 3 navn i 2 filer. Full liste i vedlegg V2 (ca. 190 prefikser).

### 2.3 Forslag til felles semantiske tokens (web, speilbart til iOS/Android)

Verdiene er hentet fra klyngene som brukes mest i dag, slik at migreringen blir mest mulig visuelt nøytral.

| Token | Papir lys | Papir mørk | Mørkt glass (cur) |
|---|---|---|---|
| `surface` | `#f3efe6` | `#16140f` | `#07080b` (+ bilde) |
| `surfaceRaised` (kort) | `#fffdf8` | `#211e18` | `rgba(40,44,52,.55)` + blur |
| `surfaceSunken` (felt) | `#ebe5d8` | `#1b1a17` | `rgba(255,255,255,.06)` |
| `line` | `#d8d1c2` | `#3a352c` | `rgba(255,255,255,.12)` |
| `textPrimary` | `#1b1a17` | `#f3efe6` | `#eef0f4` |
| `textSecondary` | `#5c5850` (≥4.5:1) | `#a39d90` | `#8a93a6` |
| `textTertiary` (bare ≥18px) | `#8f897c` | `#8a8478` | `#6e6e78` |
| `accent` | `#b23a2a` | `#ec7a64` (**ikke** `#b23a2a`) | `#ff7a3d` |
| `onAccent` | `#ffffff` | `#1b1a17` (hvit på `#ec7a64` gir 2,8:1) | `#1b1a17` |
| `success` / `warning` / `danger` | `#2f7a4f` / `#a8661a` / `#b23a2a` | `#6fbf8f` / `#e0a24a` / `#f59a8f` | samme som mørk |
| `categoryX` (dashbordkort `--wc`) | ett sett på ca. 8 farger med kontrastgaranti mot `onCategory` | | |
| Skala | font 11/12/13/14/16/18/22/28/44, radius 8/12/16/20/999, space 4/8/12/16/24/32, z: base/raised/sticky/nav/sheet/toast/max, motion 150/250/400 ms | | |

FinansHub `lys/mork/glod` og Kalender `lys/mork` bør bli ett felles «modus» (lys/mørk/system) pluss «stil» (Papir/glass).

### 2.4 Konkrete fargefeil (målt)

Kontrastrevisjon (`contrast.mjs`): 23 407 synlige tekstelementer på 19 ruter + FinansHub, cur / 2c-lys / 2c-mørk, 1440 og 390 px. Tekst på bilde eller blur er hoppet over. 339 elementer ligger under WCAG AA. Treff med forhold ≈1 skyldes elementer som er usynlige (opacity 0) og er sortert bort.

| # | Hvor | Feil | Målt | Bilde |
|---|---|---|---|---|
| F1 | **FinansHub desktop i Papir mørk** | Siden er helt lys. `desktop.js:163` leser bare `fh_design` (lys/mork/glod) og bryr seg ikke om `papir_web_mode`. Brukeren må velge mørkt to steder. | `data-theme=lys`, body `rgb(244,241,234)` | `B-web-bilder/bug-finans-papirmork.png` |
| F2 | **Familie i «cur» (mørkt glass)** | Hele Familie-flaten er lyst papir (`#f3efe6`/`#fff`) midt i et mørkt tema. Kalender og Media gjør det samme (Kalender bruker sitt eget temasystem). | – | `th-d-cur-light-___familie.png`, `sh-d-cur-light.png` |
| F3 | Dashbordet i «cur» | Kortene `.dg36-wig` får Papir-mørk-farge `rgb(33,31,27)` (`--c40-card` fra web40) i stedet for glass, så det blir to stiler på samme side. | CDP-sporing | `th-d-cur-light-___dash.png` |
| F4 | Mat i Papir mørk | Dagens kort (`.mp-day.today`, `--mp-today`) er lyst `#efe9de` på mørk side. Knappene «Kamera» og «Ny ukeplan med AI» har hvit tekst på `#ec7a64`. | 2,8:1 | `th-d-2c-dark-___matplan.png` |
| F5 | Papir mørk, etiketter | Aksentrødt `#b23a2a` brukt som tekst på `#16140f` (Chat «AUTO · GLIMT…», Bursdager «NESTE 30 DAGER»). Lys-paletten er ikke byttet ut. | 3,1:1 | |
| F6 | FinansHub desktop (alle temaer) | `small`/`.muted`/`.sub` («kr», «Total saldo», «mot oktober») har lav kontrast, og grønne trendtall `#2f7a4f` på `#faf8f3` med opasitet er svake. Avataren «S» er `#f4f1ea` på `#ffcfa8`. | 2,4–3,3:1 / 2,84 / **1,26** | |
| F7 | Hjem (cur og Papir mørk) | Undertekst `.s` («Eiendomsverdi · 2026-10») | 3,1–3,5:1 | |
| F8 | Skjold Lab | Initialmerker (`b` «AR», «EL») | 2,6 (lys) / 3,4 (mørk) | |
| F9 | Innstillinger → Utseende (Papir lys) | Seksjonstitler `.set-sec-t` `#8f897c` på `#f3efe6` | 3,03:1 | |
| F10 | Mediakveld (Papir lys) | Knappen «I kveld» `.mf51-b` har mørk tekst på blått, og metadata `.mf51-m` ligger på 4,29 | 2,72 / 4,29 | |
| F11 | Mat (Papir lys) | «Fast» `.mp-fast` `#8a8478` på `#fffdf8` | 3,65:1 | |

---

## 3. Ytelse – web

Kald last i ny kontekst, gzip på `/assets` (prompt 85), uten nettverksstruping (lokalt). Mobilprofilen er 390×844, DPR 3 og 4× CPU-struping. Tallene er fra `measure.mjs` (vedlegg V8). «Nytt i versjon»-arket var åpent i denne kjøringen; det påvirker LCP noe, men ikke mengden ressurser.

| Rute / profil | CSS (n / gzip / ukompr.) | JS (n / gzip / ukompr.) | Forespørsler / API | FCP / LCP ms | CLS | Lange oppg. (n / sum / maks ms) | Layout + Recalc ms (last) | Tvungne layouter (n / ms) |
|---|---|---|---|---|---|---|---|---|
| Dashbord desktop | 42 / 245 KB / 833 KB | 179 / 1,31 MB / 3,23 MB | 329 / 78 | 228 / 1668 | **0,43** | 1 / 102 / 102 | 115 + 81 | 65 / 94 |
| Dashbord mobil | samme | samme | 313 / 78 | 436 / 2556 | 0,15 | 4 / 625 / 315 | 257 + 170 | 28 / 217 |
| Media desktop | 42 | 181 / 1,31 MB | 304 / 77 | 252 / 1204 | 0,36 | 0 | 82 + 58 | 73 / 92 |
| Media mobil | 42 | 181 | 303 / 77 | 404 / 2452 | 0,08 | 4 / 412 / 179 | 208 + 141 | 66 / 231 |
| FinansHub desktop | 9 / 192 KB / 935 KB | 39 / 335 KB / 852 KB | 65 / 10 | 220 / 364 | 0 | 0 | 58 + 32 | 26 / 33 |
| **FinansHub mobil** | 9 / 192 KB / 935 KB | **88 / 1,05 MB / 2,78 MB** | 238 / **133** | 232 / **3468** | 0 | **24 / 1886 / 229** | **526 + 939** | **132 / 1017** |
| Skjold Lab desktop | 47 / 263 KB | 191 / 1,40 MB / 3,46 MB | 305 / 63 | 200 / 1296 | **0,61** | 0 | 130 + 32 | 14 / 40 |
| Skjold Lab mobil | 47 | 191 | 306 / 64 | 384 / 2168 | 0,43 | 5 / 458 / 164 | 163 + 134 | 16 / 103 |
| Kalender desktop | 42 | 179 | 286 / 61 | 176 / 1320 | 0,32 | 0 | 69 + 40 | 39 / 64 |
| Kalender mobil | 42 | 179 | 287 / 62 | 756 / 3420 | 0,11 | 7 / 749 / 205 | 148 + 168 | 35 / 203 |

**«Lighthouse-lignende» vurdering (estimat ut fra LCP, CLS og TBT, mobil):** dashbordet, Media, Skjold og Kalender havner i «Trenger forbedring» (LCP 2,2–3,4 s). FinansHub mobil havner i «Dårlig» (LCP 3,5 s, TBT ≈1,4 s). Ekte Lighthouse ble ikke kjørt (ikke installert).

**Funn:**
* **P1. Alt lastes alltid.** `app.js` har 45 statiske importer, og hver app-rute laster derfor 179 moduler. Av 34 statiske stilark er flere nesten ubrukte på en gitt rute (web34/web37 0 %). Bare 21 % av CSS-en brukes totalt.
* **P2. Oppstarten gjør 60–78 API-kall.** `app.js:240-249` poller `ruter` (30 s), `trading`, `energy` og `health` (60 s), `news` og `finans` (5 min) **på alle ruter**, ikke bare på dashbordet. `media.js:100-105` henter tre media-endepunkter på toppnivå. `setInterval` finnes 84 ganger i 68 filer.
* **P3. Tvungne layouter (les-etter-skriv), målt i Chrome-trace:**
  * `finans/js/mobile-p43.js:241` `bigOn()` og `mobile-p41.js:108` `foldOn()` leser `innerWidth` mange ganger under rendringen: 40 + 39 + 25 tvungne, **860 ms** med 4× CPU.
  * `js/scrollmem.js:44-52` setter `scrollTop` hvert 60. ms i 1,5 s etter hver navigasjon: 15–25 tvungne layouter per ruteskifte, 95 ms enkeltlayout på mobil.
  * `js/media43.js:535` `paintMain` og `:541` `centerTab87`: 15 + 8 per lasting.
  * `js/dash-edit36.js:179` `measure()`: `getComputedStyle` + `getBoundingClientRect` i løkke per widget, 19 recalc (61 ms desktop).
  * `js/kal39.js:378` `startScroll`: 28–52 ms. `js/kalender.js:821` `paint`.
* **P4. CLS 0,3–0,6 på desktop.** Hovedbidraget (0,273) kommer fra `MAIN#view` og `HEADER.top` ved ca. 650 ms. Uten `hl_theme` i localStorage (ny enhet, privat fane, tømt lager) tegner `hl-boot.js` «cur»-layout, og `hltheme.js loadHlTheme()` bytter til Papir når `/api/me/layout` svarer. I tillegg flytter `.pillnav` og `#wx-pill` seg (0,043) når været lastes.
* **P5. `innerHTML`** brukes 359 steder (+18 `insertAdjacentHTML`). Ved polling: Ruter-widgeten skriver `setHtml('trips', …)` hvert 30. s, og `dash.tick()` skriver tekst hvert sekund. Det gir 21 layouter per 20 s i ro på dashbordet, som er moderat. Media, Skjold og FinansHub var stille i ro.
* **P6. Ingen virtualisering.** Bare `login-scene89.js` og `mobile-p37b.js` bruker `IntersectionObserver`, og ingen bruker `content-visibility`. Lange lister (Media-bibliotek, kvitteringer, transaksjoner, Skjold-deler) rendres i sin helhet.
* **P7. Bilder.** På dashbordet har 6 av 7 `<img>` ingen width/height. `loading="lazy"` finnes 66 steder mot 145 `<img`-maler. Uten nett prøver bakgrunnstjenesten (`bgsvc.js`) minst 10 Wikimedia-bilder etter hverandre i to størrelser hver (20 mislykkede forespørsler).
* **P8. Fonter.** FinansHub laster 10 Google-fontfamilier og appen 4. Uten nett faller begge tilbake til systemfont, med layoutskifte når fontene kommer.
* **P9. Service worker** (`public/sw.js`, `os-v40`). Navigasjon går nettverk først med cache som reserve. `/assets?v=` går cache først, `/assets` uten `v` nettverk først. Utvalgte lese-API-er går nettverk først med reserve (`api51-les`), og plakatene cache først (maks 800). Strategien er grei. To ting: (a) `/finans/` hoppes over helt og har egen `finans/sw.js` (19 KB), så det finnes to service workere med to strategier. (b) Ingen forhåndscaching av skallet utover ett ikon, så første besøk uten nett virker ikke.

---

## 4. Avvik i komponenter (klassenavn i CSS)

| Komponent | Ulike klassefamilier | Filer | Eksempler |
|---|---|---|---|
| Kort / bokser | **143** | 49 | `card`, `tile`, `modal-box`, `set-box`, `cfg-card`, `wxc-card`, `bd-card`, `ch70-box`, `fam-card`, `f50-card`, `pos-card`, `mp-card`, `nrk-card`, `m43-card`, `m70-card`, `nw-card`, `dg36-wig` … |
| Knapper / piller / chips | **186** | 58 | `btn`, `btn-primary`, `pill`, `chip`, `hp-btn`, `dm-btn`, `sg-btn`, `wxc-btn`, `bd-btn`, `ch-btn`, `ci43-btn`, `fam-btn`, `f50-pill` … |
| Ark / modaler / skuffer | **45** | 29 | `modal`, `popup`, `upd-sheet`, `bk-sheet`, `drawer`, `ch-sheet`, `fam-sheet`, `f50-sheet`, `k2-sheet`, `m43-modal`, `nw-sheet`, `sk76-drawer`, `sk79-sheet`, `smbw-sheet`, `tk-sheet`, `wx41-sheet`, `pp-sheet`, `p16-sheet` … |
| Tomtilstander | **64** | 37 | `empty`, `blank`, `dm-empty`, `bd-empty`, `fam-empty`, `f50-empty`, `k39-none`, `mu-tom`, `nrk-tom`, `m43-empty`, `m70-empty`, `dg36-empty` … |
| Lastetilstander | **19** | 18 | `skeleton`, `skel`, `m43-skel`, `m70-skel`, `gb38-skel`, `pb44-skel`, `p51-skel`, `spin`, `upd-spin`, `ch70-spin`, `m50-spin` … |
| Toast / banner | **28** | 21 | `toast`, `ac-toast`, `bd-toast`, `ch-toast`, `fam-toast`, `k2-toast`, `m43-toast`, `upd-banner`, `p31-toast` … |
| Feilmeldinger | **47** | 36 | `err`, `error`, `err-msg`, `upd-err`, `bk-err`, `ch70-err`, `k2-err`, `gate-err`, `mp-err`, `sk79-err` … |

Det finnes også tre «Nytt i versjon»-implementasjoner: `qa51.js showWhatsNew51` (app), `finans/js/whatsnew52.js` (FinansHub) og `web52`. Laste- og tomtilstander har ingen felles komponent. Grovt anslag (estimat): 8–10 basiskomponenter (Card, Button, Chip, Sheet, Toast, EmptyState, Skeleton, ErrorState, Tabs, Field) dekker over 90 % av variantene.

---

## 5. Bugs – web

| # | Alvor | Plattform | Bug | Reproduksjon |
|---|---|---|---|---|
| B1 | **Høy** | Web desktop, Papir | **Toppmenyen skjuler faner.** I Papir har `.pillnav` `overflow-x:auto` og `scrollbar-width:none`, og maksbredden er ca. 1110 px. Ved 1440 og 1920 px er «Bursdager», «Kalender» og «Skjold Lab» usynlige; ved 1280 px også «Gjøremål». Det finnes ingen rullepil eller noe hint. | Papir lys, 1440×900, `#/dash`: menyen slutter ved «Bursdager». `nav.mjs`: `scrollWidth 1293 > clientWidth 1112`. Bilde: `th-d-2c-light-___dash.png` |
| B2 | Middels | Web desktop, cur | I «cur» brekker toppmenyen over to linjer ved 1440 og 1280 px («Skjold Lab» alene på linje 2), så headeren blir høy og ujevn. | cur, 1440×900, `#/dash`. Bilde: `th-d-cur-light-___dash.png` |
| B3 | Middels | Web | FinansHub følger ikke Papir mørk (F1). | Velg Papir · mørk i Innstillinger → Utseende og åpne Økonomi. Siden er lys. |
| B4 | Middels | Web | **Temaet blinker eller hopper ved første besøk.** `hl-boot.js` faller tilbake til «cur» uten `localStorage.hl_theme`, så serverens Papir-valg gir CLS 0,27 og et synlig bytte ca. 650 ms etter at siden er lastet. | Privat fane, logg inn, åpne `/#/dash` eller `/#/skjold`. CLS 0,36–0,61 målt. |
| B5 | Middels | Web mobil | FinansHub mobil bruker ca. 1 s CPU (4×) på tvungne layouter fra `bigOn()`/`foldOn()` (`innerWidth` i rendringsløkka). Det gir hakking ved oppstart og ved hver omtegning. | 390 px, 4× CPU, `/finans/`, Performance-trace: Layout med stack `mobile-p43.js:241`. |
| B6 | Lav | Web | `scrollmem.js` tvinger `scrollTop` hvert 60. ms i 1,5 s etter navigasjon (`step`). Brukeren som begynner å rulle med tastatur eller scrollbar kan bli dratt tilbake, fordi `userMoved` bare settes av visse hendelser (ikke verifisert manuelt). | Bytt rute og rull med en gang. |
| B7 | Lav | Web | Polling for `trading`, `energy`, `health`, `finans/summary` og `news` går hele tiden på alle ruter (`app.js:240-249`), selv når dashbordet ikke vises. Det gir unødvendig nett- og serverlast. | Åpne `#/kalender` og se Nettverk: `/api/trading` hvert minutt. |
| B8 | Lav | Web | `js/family.js` og `css/family.css` er døde eller nesten døde, men `family.css` lastes statisk på alle sider (24 KB, 48 `!important` i parsing). | `app.html:19` |
| B9 | Lav | Web | Leaflet-reserve via unpkg (`mobile-p16.js:349` m.fl.) uten SRI. CSP-en blokkerer den, så den feiler alltid stille. | – |
| B10 | Lav | Web | Uten nett feiler 20 forespørsler mot `commons.wikimedia.org` (bakgrunnsbilder) ved hver oppstart. Det blir mye konsollstøy og forsinker «load». | Blokker utgående nett og last `/`. |
| B11 | Info | Web mobil | Ved første åpning av `/finans/` på mobil stopper hver rute på onboardingen «Velkommen, Sebastian · Steg 1 av 3» til den er fullført, også dype lenker som `#/kv`. Det kan være meningen. | Ny kontekst, 390 px, `/finans/#/kv`. Bilde: `B-web-bilder/sh-finm.png`. |

Ingen JS-feil (`pageerror`) ble registrert på noen av rutene i noen av temaene.

**Sikkerhet i forbifarten:** Det ble ikke funnet tokens eller hemmeligheter i `localStorage` i web-koden. Sesjonen er en cookie. Strenge CSP-er er satt (`script-src 'self'`). Inline `<style>` i `finans/index.html` krever `style-src 'unsafe-inline'` (er satt). Unpkg-reserve: se B9.

---

## Spørsmål til brukeren

1. Skal «cur» (mørkt glass) leve videre som eget tema, eller er Papir lys/mørk målbildet? Det avgjør om tokensettet trenger tre eller to varianter.
2. Er det meningen at Familie, Kalender og Media alltid skal være Papir/lyst i «cur» (F2)?
3. Skal FinansHubs egne temaer `glod` og `mork` bevares, eller skal FinansHub følge Homelab-modusen?
4. Er onboardingen i mobil-FinansHub (B11) tenkt å blokkere dype lenker?
