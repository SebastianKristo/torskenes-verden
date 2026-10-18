# Prompt 25

Startet 2026-10-18.

## Ønsker
- 2026-10-18: «feil med navbar med navn på fold. gi også same farge på navbaren som på andre mobile appene» (vedlegg: Galaxy Fold utbrettet. Sidelinjen viser «cre», «for», «squ», «mag», «ell» i stedet for ikoner, «Domener/», og ugjennomsiktig grå bakgrunn)
  - `Mobil Papir App.dc.html`: sidelinjen i bred modus bruker nå samme farge som fanelinjen på telefon (`--nav` med blur), ikke fast mørk grå.
  - Feilen med ikonnavnene er i appen. Skrevet `prompts/claude-code-fold-navbar.md`: årsaken (ligatur-font eller NavigationRail-fallback), ingen ligatur-ikoner, samme SVG-ikoner som på telefon, eksakte mål for sidelinjen (84 dp, radius 28), `nav`-token med blur, ikon på alle faner, etikett på én linje, brytepunkt ≥ 600 dp, iPad, og test.
- 2026-10-18: «på fold vis alltid en rød hjem knapp over hjem i navbar, hvis bare når man ikke er i hjem»
  - `Mobil Papir App.dc.html` (bred modus, Fold og nettbrett): rund rød Hjem-knapp (60 px, husikon) øverst i sidelinjen over fanene. Den vises bare når du ikke er på Hjem, og et trykk går rett til Hjem.
  - `claude-code-fold-navbar.md`: nytt punkt 3 med mål, farge, oppførsel og overgang.
- 2026-10-18: «kom opp med et design for vær popup for fold som tar bruk av størrelsen av fold»
  - `Vaer.dc.html`: ny bred layout som slås på automatisk når skjermen er minst 700 px bred, eller med tweaken `fold`.
    - To kolonner. Til venstre: sted og temperatur, time for time og 10 dager. Til høyre: værkartet direkte på siden (med lagvelger og fullskjerm), Yr mot Pent, vind og måne, og flisene i 3 kolonner.
    - Detaljark åpnes som sidepanel til høyre i stedet for over hele skjermen.
  - `claude-code-fold-navbar.md`: nytt avsnitt om værsiden på Fold og nettbrett.
- 2026-10-18: «i fold hvis rød hjem vises, da trenger ikke pil tilbake til hjem å vises»
  - `Mobil Papir App.dc.html` (bred modus): «‹ Hjem» øverst til venstre er skjult når den røde Hjem-knappen vises i sidelinjen. Det gjelder Finans- og Domener-fanene, Mer og sider som åpnes fra Hjem. Tilbake vises fortsatt når den går et annet sted («‹ Mer», «‹ Oversikt»). Lagt til i `claude-code-fold-navbar.md`.
- Værsiden på Fold: tweaken `fold` er nå `auto` / `on` / `off` (standard `auto` = slås på når bredden er minst 700 px), og 20 px mellomrom mellom kolonnene.
- 2026-10-18: «la meg velge alternativ design på navbar som viser bare ikoner, designet nå og et design som viser ikoner og når side aktiv på navbar med ikong og navn»
  - `Mobil Papir App.dc.html` → Innstillinger → HOMELAB: ny rad **Fanelinje-stil** (trykk bytter mellom tre valg, lagres i `papir_navlbl`):
    - **Tekst** (som nå): navn på alle faner, ikon bare på valgt.
    - **Bare ikoner:** ikoner (20 px) på alle faner med like brede felt. Valgt fane får lys pille, og det er ingen navn.
    - **Ikoner + navn på valgt:** ikoner på alle. Valgt fane viser ikon og navn i pillen.
  - Gjelder alle fanelinjer (Hjem, Finans, Domener, Familie). I bred modus (Fold) vises navnet under ikonet, utenom i «Bare ikoner».
  - For Claude Code: `user_settings.nav_style_labels` = `text` | `icons` | `icons_active_label`. Bruk samme ikonmål som i `claude-code-familie-design.md` (16 pt ved siden av tekst, 20 pt alene). Bare ikoner krever `contentDescription` / `accessibilityLabel` med fanens navn.
- 2026-10-18: «legg de valgene i tilpasss menyen her» (vedlegg: arket «Rediger fanelinjen»)
  - `Mobil Papir App.dc.html` → «Rediger fanelinjen» (hold inne på fanelinjen): ny seksjon **STIL** over «Legg til» med tre kort: Tekst, Bare ikoner og Ikoner + navn på valgt. Hvert kort har en liten forhåndsvisning av fanelinjen, og valgt kort har mørk kant. Valget brukes med en gang og er det samme som raden «Fanelinje-stil» i Innstillinger.
- 2026-10-18: «med preview av designet»
  - «Rediger fanelinjen» → **STIL · FORHÅNDSVISNING**: en stor forhåndsvisning i full størrelse av din egen fanelinje (dine faner, Mer og skann-knappen) på en bakgrunn. Den endres med en gang du trykker på en stil. De tre stil-kortene viser også dine egne faner.
- 2026-10-18: «og onboarding på pc viser fortsatt gammel theme ikke nye papir theme»
  - `Homelab Papir Web.dc.html`: ny innlogging og onboarding i Papir-stil (tweak `gate`: av / login / onboarding). Venstre halvdel har toppbilde med «Homelab» og stor Newsreader-tittel. Høyre halvdel har skjema på papirbakgrunn med rød etikett, hvite felt og svart pilleknapp. På smale skjermer ligger de to delene under hverandre.
    - **Logg inn:** server, brukernavn og passord, deretter tofaktorkode (6 siffer).
    - **Onboarding i 4 steg** med fremdriftslinje: 1) navn på admin og server, 2) brukernavn, passord og gjenta (sjekkes), 3) velg bakgrunn (Oslo / Vær / Planeter / Ingen), 4) oppsummering og «Start Homelab». «← Tilbake» mellom stegene.
  - For Claude Code: PC- og web-onboardingen skal bruke dette designet, ikke det gamle fra `Homelab v2.dc.html`. Samme API som mobil (`POST /api/setup`, `/api/auth/login`, `/api/auth/2fa`). Standardtemaet etter oppsett er Papir · lys.
- 2026-10-18: «jeg vil ha ikoner vedsidna» (vedlegg: Mer-menyen uten ikoner)
  - `Mobil Papir App.dc.html` → Mer: hver rad har ikon til venstre (40 px boks med strekikon i fargene fra ikonpaletten, som i Innstillinger): Domener globus, Sporing pakke, Bursdager gave, Huskeliste avkrysning, Familie og kart pin, Media play, Finans kort, Nyhetsleser RSS, Innstillinger tannhjul, Hjem hus. `claude-code-mer-lik.md` er oppdatert.
- 2026-10-18: «for ai søk i innstlinger, når den har funnet ut av det vis knapp ta meg dit og kansje highlight innstlingen som ble søket etter.»
  - `Mobil Papir App.dc.html` → Innstillinger → ✦ AI-søk: svaret har knappen **«Ta meg dit →»**. Den lukker søket, åpner riktig underside (f.eks. Integrasjoner), scroller til innstillingen og fremhever raden i omtrent 3 sekunder (lys rød bakgrunn og rød strek til venstre som toner ut).
  - For Claude Code: dyplenke `settings/<side>#<rad-id>`. iOS `ScrollViewReader.scrollTo(id, anchor: .center)` + animert bakgrunn. Android `LazyListState.animateScrollToItem` + `animateColorAsState`. Samme fremheving når man trykker på et vanlig søketreff.
- 2026-10-18: «ai søk i finans, får stopp brukte for lang tid etter kansje 30 sekunder men ollama sekunder tid er satt til 60 sekdunder.»
  - Feilen er i appen eller backend. Et lag har en fast grense på 30 s (mest sannsynlig Gunicorn `--timeout 30`, eller klientens fetch/OkHttp). Skrevet `prompts/claude-code-ai-timeout.md`: sjekkliste for alle lag (klient, Gunicorn/Uvicorn, Nginx/Cloudflare, httpx mot Ollama med strømming og keep_alive, felles wrapper), bakgrunnsjobb med SSE og «Ollama tenker … 34 s av 60 s» med Avbryt, tydelig feilmelding, logging og test.

## Tilhørende filer
- `claude-code-prompt-25-START.md` (= `00-START-HER.md` i pakken)
- `claude-code-familie-design.md` (fanelinje-ikoner, fra prompt 24)
- `claude-code-ai-timeout.md`
- `claude-code-mer-lik.md` (oppdatert)
- `claude-code-fold-navbar.md`
