# Web: egen Vær-side

Fasit: `Homelab Papir Web.dc.html` → fanen **Vær** (`page: 'vaer'`), som laster `Vaer.dc.html` med `fold="on"` og `hide-status`.

- Ny fane **Vær** i toppmenyen, rett etter Dashboard.
- Åpner i **fullskjerm** (`position: fixed; inset: 0`), uten toppmeny og hero, som Kalender, Chat og Finans. **✕** oppe til høyre lukker og går til Dashboard.
- Bruker den brede visningen av Vær (samme som brettet/sammenleggbar): to kolonner, maks 1280 px.
  - Venstre: by, temperatur, «Forhold» (☁/💧/🌬 med egne timer- og dagsvisninger) og 7-dagersliste.
  - Høyre: værkart (radar/temperatur/vind, fullskjerm-knapp), Yr mot Storm og flisene (UV, vind, nedbør, føles som, fuktighet, sikt, trykk, sol, måne …).
- Den falske iPhone-statuslinjen (09:41 ●●● ▮) vises **ikke** på web (`hideStatus`).
- Samme animerte himmel/vær-effekter og samme data (MET → Open-Meteo-fallback) som i appen. Ett komponent, ingen egen web-kopi.
- Byvalg, søk etter steder og favoritter fungerer som i appen. Valgt by synkes med appen via profilen.

## PC-oppsett (desktop) – erstatter mobiloppsettet på web
Fasit: `Vaer.dc.html` med `desktop=true` (`dk`-verdiene).
- **Sidepanel til venstre** (280 px, glass `rgba(10,20,35,.26)` + blur 24, radius 24, 16 px fra kantene): «Vær» + «+» (legg til sted), søkefelt «Søk etter by eller sted» (åpner stedssøket), og **Mine steder** som kort. Valgt sted er lysere og viser temperatur, beskrivelse og H/L. Trykk på et annet sted bytter by. Nederst står kilden (MET Norway · yr.no · tid).
- **Innhold** til høyre for panelet (venstre padding 328 px, maks 1500 px), to kolonner 5:7:
  - Venstre: toppen **venstrejustert** (MIN POSISJON, by, 96 px temperatur, beskrivelse, H/L), så Forhold (☁/💧/🌬) og 7-dagerslisten.
  - Høyre: værkart (Windy, lag Nedbør/Temperatur/Vind/Skyer, Fullskjerm), Yr og Storm, vind, måne og fliser i 3 kolonner.
- Ingen mobilknapper nederst (kart og liste), ingen falsk statuslinje. **✕** oppe til høyre lukker.
- Ark (Forhold-detaljer, flisdetaljer, steder) åpnes som panel til høyre (maks 520 px), ikke som bunnark.

## iOS-app: kart- og byknappen står for høyt
Vedlegg: `uploads/Screenshot 2026-10-19 at 21.29.16.png` viser **riktig** plassering: de runde knappene (🗺 Værkart til venstre, ☰ Steder til høyre) står helt nede i hjørnene, på høyde med hjemstreken og innenfor skjermens runding.
Fasit: `Vaer.dc.html` → bunnraden: `position:absolute; left:0; right:0; bottom:0; padding: 0 18px max(10px, calc(env(safe-area-inset-bottom) − 22px))`.
- I appen legges safe-area **to ganger** (WebView-inset + vår `env(safe-area-inset-bottom)`, eller navbarens plass), så knappene havner ca. 40–60 px for høyt. Fjern ekstra `padding-bottom`/`margin` fra foreldre-containeren i Vær, og bruk bare formelen over (≈ 12 px over bunnen på iPhone med hjemstrek, 10 px uten).
- Knappene er 52 × 52 med 18 px sidemarg, så de følger hjørnerundingen. Hjemstreken ligger midt mellom dem og skal ikke dekkes.
- Capacitor: `ios.contentInset: 'never'` og ingen `viewport-fit`-dobling. Navbaren er skjult i Vær, så den skal ikke reservere plass.


---
## Ny PC-layout (2026-10-19): inspirert av Vær på Mac
Vedlegg: `uploads/Screenshot 2026-10-19 at 21.49.00.png`, `…21.49.13.png`, `…21.49.19.png`. Erstatter «PC-oppsett» over.
Fasit: `Vaer.dc.html` med `desktop=true` (blokken `dk.on`). Forhåndsvisning: `Vaer Web.dc.html`.

**Sidepanel (venstre, 320 px, fast fra topp til bunn)**
- Glass `rgba(8,16,30,.34)`, blur 28 og en tynn kant til høyre.
- Øverst søkefeltet «Søk etter by eller sted» (42 px, pille) og en rund **+**.
- **Stedskort** (min. 112 px, radius 16):
  - Navn 20 px fet, merkelapp under («Min posisjon»), temperatur 40 px tynn til høyre.
  - Nederst: beskrivelse til venstre og H/L til høyre.
  - Valgt sted har **samme himmel som hovedvisningen** (`--vsky`) og en lys ramme på 2 px. De andre har en svak glassgradient.
  - Hvert kort bør på sikt vise sin egen himmel, lokal tid og «X % sjanse for regn på tirsdag», med data per sted.

**Hoveddel (høyre for panelet, maks 1240 px, sentrert)**
- **Topp sentrert:** ➤ MIN POSISJON, by 44 px, temperatur 124 px (vekt 200), beskrivelse, H/L.
- **Ved scroll** (> 170 px) tones toppen ut, og en **kompakt sticky tittel** tones inn: «MIN POSISJON / Oslo / 5° | Delvis skyet». Toppen ruller under.
- **Rutenett, 5 kolonner, gap 16:**
  1. **Forhold** (☁/💧/🌬 + timer), full bredde.
  2. **10-dagers** (2 kol × 2 rader) | **Værkart** (2 kol) | **Sol** (1)
  3. (10-dagers) | **Måne** (2) | **UV** (1)
  4. **Yr og Storm** (2) | **Føles som** | **Mot i går** | **Nedbør**
  5. **Sikt** | **Luftfuktighet** | **Lufttrykk** | **Vind** (2, kompass)
- Kortene i samme rad har lik høyde (`grid` stretch).
- **Bunntekst** sentrert: «Vær for Oslo», kilde (MET Norway / Open-Meteo · tid), «Se også yr.no ↗».

**Annet**
- ✕ oppe til høyre lukker.
- Ark og detaljer åpnes som panel til høyre (som før).
- Ingen mobilknapper, ingen falsk statuslinje.
- Under ca. 1100 px bredde: 3 kolonner (10-dagers og kart full bredde). Under 800 px: mobiloppsettet.


### Rettelser (2026-10-19, vedlegg `uploads/Screenshot 2026-10-19 at 21.52.35.png` og `21.53.10.png`)
- **Siden var bredere enn vinduet.** Forhold-kortet med 24+ timer presset rutenettet ut. Fiks: hver rutenett-celle har `min-width:0` + `grid-template-columns:minmax(0,1fr)`, og timeraden scroller horisontalt **inni** kortet. Ingen horisontal scroll på siden.
- **Været for alle steder i sidepanelet.**
  - `loadAll()` henter for hvert sted (Open-Meteo, `current=temperature_2m,weather_code,is_day` + `daily max/min/precipitation_probability_max`, `timezone=auto`). Oppdateres hvert 10. min og når steder legges til eller fjernes. Native/server: MET, og bulk-kall til egen backend (`/api/weather/places`), cache 10 min.
  - Hvert kort viser **temperatur**, **H/L**, **beskrivelse** eller «85 % sjanse for regn på torsdag» (høyeste regnsjanse neste 4 dager hvis ≥ 60 %), og **lokal tid** i stedet for region når tidssonen er en annen (New York 15:49).
  - **Kortbakgrunnen er stedets egen himmel** (samme gradient som hovedvisningen etter værkode og dag/natt).


## Kortene: mer uskarp bakgrunn og farge fra himmelen (mobil + web)
Vedlegg: `uploads/Screenshot 2026-10-19 at 21.57.15 2.png` (fasit: dype indigo-kort med sterk blur) og `21.58.16.png` (vår gamle versjon: lyse, flate, grå-hvite kort).
Fasit: `Vaer.dc.html` → `--vcard` / `cardBg`.
- Alle værkort: `background: var(--vcard)`, `backdrop-filter: blur(34px) saturate(1.5)`, nesten usynlig kant `rgba(255,255,255,.07)`, myk skygge `0 10px 30px -18px rgba(0,0,0,.45)`. Ikke lenger `rgba(255,255,255,.16)`.
- Kortfargen tones etter himmelen:
  - **natt** `rgba(34,38,78,.58)` (indigo)
  - **klart/lettskyet** `rgba(24,82,168,.34)`
  - **overskyet** `rgba(62,84,110,.42)`
  - **regn/torden** `rgba(34,42,56,.5)`
  - **snø** `rgba(84,98,118,.4)`
  - **tåke** `rgba(52,64,80,.45)`
- Skyer og stjerner skal skimtes uskarpt gjennom kortene. Native: `UIVisualEffectView(.systemThinMaterialDark)` + tint-lag med fargen over / Android `RenderEffect.createBlurEffect(34)`.
