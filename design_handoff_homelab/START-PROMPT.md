# Start-prompt til Claude Code

Lim inn dette i Claude Code, i roten av repoet, med mappen `design_handoff_homelab/` kopiert inn:

---

Du skal bygge videre på Homelab OS, FinansHub og mobilappene. All spesifikasjon ligger i `design_handoff_homelab/`.

1. Les `design_handoff_homelab/PROMPT-CLAUDE-CODE.md` fra start til slutt. Begynn med delen **«Prompt 11 · gjør dette først»**, så «Prompt 10», som har de nyeste endringene. Les deretter `CHANGES-prompt-06.md`, `FINANSHUB-MOBIL.md` og `FINANSHUB-MODULER.md`.
2. Designet ligger som HTML-prototyper i `design/` og er fasiten for utseende og oppførsel. De viktigste for denne runden:
   - `Finn Mobil.dc.html` og `Finn Handler Varianter.dc.html` (#2a er valgt)
   - `FinansHub v2 Moduler.dc.html` (Boliger, kategorier, Finn på PC)
   - `FinansHub v2.dc.html` (Innstillinger → Boliger)
   - `FinansHub Mobil v2.dc.html`
   - `Matplan.dc.html`
   - `Sporing.dc.html` (ny fane og widget)
   - `Subscription OS.dc.html` (web og mobil), `Aksjer Mobil.dc.html`, `Homelab v2.dc.html` (Værmelding og Pakker i karusell)
   - `App-ikon.dc.html`
3. App-ikonet med alle varianter og oppsettet for Xcode og Android ligger i `app-icon/` (se `app-icon/README.md`).
4. Brukerens ordrette ønsker står i `prompts/prompt-01.md` til `prompt-11.md`. Er noe uklart, gjelder det brukeren skrev.
5. Lag en plan med oppgaver før du skriver kode. Gjør én del om gangen og kjør tester og lint etter hver del. Ikke slett data eller migrasjoner som finnes. Legg til nye migrasjoner.
6. Når du er ferdig: oppdater `CHANGELOG.md`, bygg release-artefaktene (APK og IPA via CI i `ci/`) og oppsummer hva som er gjort og hva som gjenstår.

---

## Utdrag: Prompt 11 (nyest)

- Brukerens ordrette ønsker står i `prompts/prompt-11.md`. Design: `design/Sporing.dc.html` (variant `page` og `widget`).
- **Ny fane «Sporing» i Homelab**, både på web (mellom Matplan og Domener) og i mobilappen (Homelab-fanelinjen og en widget på Homelab-hjem, «Pakker på vei»).
  - **Værmelding er kompakt og like stor som Pakker-kortet:** ikon og temperatur, tilstand, «føles som», høy/lav, en kort linje (vind, nedbør, fukt), 6 timer, nowcast, de neste 3 dagene (ikon, høy/lav, nedbør) og chips for soloppgang, solnedgang, UV og lufttrykk. Resten ligger i nedtrekket «Mer vær ▾».
- **I nedtrekket «Mer vær» på web-Dashboard** (yr/MET Locationforecast + Nowcast + Sunrise): ikon og temperatur, tilstand, «føles som» og dagens høy/lav, en nowcast-linje («Regnet gir seg rundt 01:00 …»), 8 nøkkeltall (vind med retning og kast, nedbør nå og 24 t, fuktighet med duggpunkt, UV, lufttrykk med trend, sikt, soloppgang med daglengde, solnedgang), 8 timer med ikon, temperatur og nedbørsstolpe i mm, og 6 dager med ikon, min–maks-stolpe og nedbør.
- **Web-Dashboard:** «Pakker» ligger i en **karusell med Værmelding** nederst til høyre (samme kortstil, sveip/scroll-snap og prikker under som også kan klikkes). Ingen egen pakke-widget øverst til venstre.
- **Widget** på Dashboard (web) og Homelab-hjem (mobil): opptil 3 aktive pakker med transportørmerke, navn, status, ETA og en fremdriftslinje i 5 steg. Pakker som er klare for henting kommer først. «Åpne sporing ›» går til fanen. På mobil ligger «Pakker» i en **karusell sammen med klokke og vær** øverst på Homelab-hjem: sveip sideveis mellom de to kortene, med prikker under (scroll-snap; native: `TabView(.page)` / `HorizontalPager`). Pakke-kortet viser de 2 viktigste pakkene og åpner Sporing-fanen. Karusellen flyttes og skjules sammen med «Klokke og vær».
  - **Fanen:**
    - Feltet «Lim inn sporingsnummer» og et valgfritt navn. Transportøren gjettes ut fra formatet og kan overstyres med chips.
    - Kilder som kan slås av og på: **Finn** og **E-post (Proton Mail)**, med «Sist sjekket» og «Sjekk nå».
    - Filteret Aktive / Klar for henting / Utgående / Levert, og kort med steg (Registrert → Hentet → I transport → Klar for henting / Ute for levering → Levert; ved utgående: Registrert → Levert inn → I transport → Ute for levering → Levert).
    - Trykk på et kort for å se tidslinjen, «Åpne hos transportør ↗», Arkiver og Slett (to trykk).
    - Nederst en liste over transportørene og om nøkkelen er på plass.
  - **Transportører:** Posten og Bring (Tracking API), PostNord (Tracking API), DHL (Shipment Tracking – Unified), UPS (OAuth Tracking API), og som reserve **17TRACK** eller AfterShip for FedEx, GLS, DB Schenker, Helthjem, Budbee, Instabox og andre. Nøklene legges inn i Innstillinger → Integrasjoner under en ny gruppe «Sporing», med testknapp som de andre integrasjonene.
  - **Gjenkjenning av format** (start; må verifiseres): Posten `^[A-Z]{2}\d{9}NO$`, Bring `^70\d{15}$`, PostNord `^00370\d{15}$` / `^[A-Z]{2}\d{9}(SE|DK|FI)$`, DHL `^JJD\d{10,}$` / 10 siffer, UPS `^1Z[0-9A-Z]{16}$`, FedEx 12 eller 15 siffer, GLS 11 siffer. Ellers sendes nummeret til reservetjenesten, som finner transportøren.
  - **Automatisk innhenting:**
    - En jobb hvert 15. minutt leser nye e-poster via Proton Mail Bridge (IMAP). Den finner sporingsnumre i ordre- og fraktbekreftelser med regex, pluss AI som reserve, og lagrer butikk og varenavn.
    - Finn-handler med Fiks ferdig får sporingsnummeret fra Finn-e-posten og kobles til handelen; status vises også i Finn-tidslinjen.
    - Duplikater slås sammen på sporingsnummer.
    - Statusen hentes fra transportøren, oftere når en pakke er ute for levering.
  - **Varsler (push):** «Klar for henting hos …» og «Levert».
  - **Datamodell:** `shipment(id, tracking_no unique, carrier, name, source enum(finn,email,manual), source_ref, direction enum(in,out), status, eta, pickup_point, archived, created_at)` + `shipment_event(shipment_id, ts, status, location, raw)`.
- **Brytere for sporingsvarsler:** i Sporing-fanen («Varsler og haptikk») og i mobilappen under Innstillinger → Varsler → Sporing: Nytt sporingsnummer funnet · Ute for levering · Klar for henting · Levert · Forsinket. Standard er alle på, unntatt Forsinket.
- **Haptisk tilbakemelding i appene:** Innstillinger → App → Haptikk. Hovedbryter, styrke (Lett/Middels/Kraftig), og egne brytere for trykk på knapper og faner, fullført handling, feil og advarsler, og pakke-varsler, pluss en testknapp.
  - iOS: `UIImpactFeedbackGenerator(.light/.medium/.heavy)` for trykk, `UINotificationFeedbackGenerator` (`.success`/`.error`) for fullført og feil, `UISelectionFeedbackGenerator` for faner og chips. Respekter Systemhaptikk.
  - Android: `view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK / CONFIRM / REJECT)`. Respekter «Vibrasjon og haptikk».
  - Capacitor/PWA: `@capacitor/haptics` (`impact`, `notification`, `selectionChanged`), med `navigator.vibrate` som reserve på Android-web.
- **Søk: vanlig søk før AI ved enkle ord (web og mobil).** Er søket 1–2 ord uten spørsmålsord eller «?» (f.eks. «ica», «proton»), kjøres vanlig søk først. Gir det treff, vises de med «Fant N treff med vanlig søk, så AI ble ikke brukt», og AI kalles ikke. «✦ Spør AI likevel» tvinger AI. Gir vanlig søk ingen treff, går spørsmålet til AI som før. Dette sparer kall og tid.
- **iOS: sveip fra venstre kant for å gå tilbake**, overalt der det finnes en tilbakepil (til Homelab fra Finans, Domener og andre moduler, fra undersider, Finn-detalj osv.). Etter 90 pt gir det et haptisk tikk, og når du slipper går appen tilbake. Native: `UINavigationController.interactivePopGestureRecognizer` (UIKit) eller `NavigationStack` (SwiftUI). Har du en egen tilbakeknapp, behold gesten med `interactivePopGestureRecognizer.delegate = nil`. Capacitor: `@capacitor/app` + egen kantgest, eller `swipeBackEnabled` i Ionic.
- **Trading 212 er flyttet til Innstillinger → «Aksjer · Trading 212»** i FinansHub (web): status, Live/Demo, «Synk nå», API-nøkkel og secret ligger der. Aksjer-siden har bare en liten statuslinje («● Trading 212 · Synkronisert · 22:19 · Innstillinger ›») og ingen knapper.
- **Aksjer (Trading 212) i mobilappene, nytt design:** se `design/Aksjer Mobil.dc.html`. **Følger alltid appens tema:** iOS mørk med Liquid Glass-kort, hvite pilleknapper og dempede pasteller; Android/brettbar med Material You-tokens (følger fargetema, lys/mørk og «Følg systemet»). Den lyse varianten finnes bare som referanse.
  - **Portefølje:** verdi i dag med endringschip, områdegraf, periodevalg 1D/1U/1M/3M/1Å/Alt og filteret Alle/Aksjer/ETF/Kontanter. «Største posisjoner» er pastellkort du blar sidelengs i, med Kjøp/Selg. «Alle posisjoner» har sparkline og endring. Kontanter og «Transaksjoner ›».
  - **Aksjedetaljer:** logo, kurs, endring, graf med markør og tooltip, periodevalg, Min posisjon (antall, verdi, snittkurs, avkastning), handler i aksjen og en fast nederste rad med Selg/Kjøp.
  - **Transaksjoner:** søk, filteret Alle/Kjøp/Salg/Utbytte, gruppert per dag, med status Utført/Venter/Avvist.
  - Data: Trading 212 Public API (`/equity/portfolio`, `/equity/account/cash`, `/equity/history/orders`, `/history/dividends`); grafdata fra en kursleverandør. Kjøp/Selg åpner Trading 212 (deep link) med mindre ordre-API er slått på for kontoen. Oppsettet ligger i Innstillinger.
- **Subscription OS, nytt design (web og mobil):** se `design/Subscription OS.dc.html` (`variant="web"` og `variant="mobile"`) og `design/Subscription Varianter.dc.html`.
  - **Web**, med fanene Oversikt og Kalender:
    - **Oversikt:** kort med AI-sparing («Spar X kr i måneden»), totalbeløp per måned med trend og årsbeløp, Aktive/Dyreste/Billigste, et banner om kommende trekk og en årsgraf per kategori (stablet, med tooltip for valgt måned). Til høyre «Trekk denne måneden».
    - **Tabell** med sortering på alle kolonner, status Aktiv / ⚠ Lite brukt / ▲ Pris økt, og «Si opp». «⊕ Nytt abonnement» åpner en rad med tjeneste, plan, beløp, syklus (månedlig, årlig, hvert 2. år) og trekkdag.
    - Abonnementshelse 0–100 med gauge, og ✦ Forslag.
    - **Kalender:** måneden med logoer på trekkdagene. Trykk på en dag for å se trekkene, med fordeling per kategori ved siden av.
  - **Mobil** (følger appens tema: iOS-glass / Material You), med fanene Hjem · Innsikt · Historikk øverst:
    - **Hjem:** AI-sparing, neste 7 dager med stolper, abonnementssjekk og kommende trekk.
    - **Innsikt:** per måned (6 mnd), helse-gauge og stripete kategorilinjer.
    - **Historikk:** Smart sparing-agent med fremdrift og oppgaver du krysser av, og trekk denne måneden.
  - **«+ Legg til abonnement»:** på web en oransje knapp med meny, på mobil en +-knapp ved tittelen som åpner et panel. Tre valg: **Skriv inn selv** (tjeneste, beløp, syklus, trekkdag) · **Fra kvittering** (✦ AI leser bilde/PDF/e-post og fyller inn) · **Fra transaksjoner** (✦ faste trekk som er sett minst 3 ganger og ikke er registrert, hver med «+ Legg til»). Tilsvarende valg finnes i appens +-meny.
  - Status «Lite brukt» kommer fra bruksdata (Plex/Jellyfin/kontoinnlogging eller manuelt). «Pris økt» kommer fra sammenligning med forrige trekk.
- Lenkene til transportørene i prototypen (sporing.posten.no, tracking.bring.com, postnord.no/sporing, dhl.com, ups.com, fedex.com, gls-group.com, dbschenker.com, helthjem.no, budbee, instabox, 17track) må sjekkes før de brukes.
