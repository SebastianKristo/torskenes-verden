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
