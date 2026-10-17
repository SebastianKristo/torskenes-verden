# Start-prompt til Claude Code

Lim inn dette i Claude Code, i roten av repoet, med mappen `design_handoff_homelab/` kopiert inn:

---

Du skal bygge videre på Homelab OS, FinansHub og mobilappene. All spesifikasjon ligger i `design_handoff_homelab/`.

1. Les `design_handoff_homelab/PROMPT-CLAUDE-CODE.md` fra start til slutt. Begynn med delen **«Prompt 10 · gjør dette først»**, som har de nyeste endringene. Les deretter `CHANGES-prompt-06.md`, `FINANSHUB-MOBIL.md` og `FINANSHUB-MODULER.md`.
2. Designet ligger som HTML-prototyper i `design/` og er fasiten for utseende og oppførsel. De viktigste for denne runden:
   - `Finn Mobil.dc.html` og `Finn Handler Varianter.dc.html` (#2a er valgt)
   - `FinansHub v2 Moduler.dc.html` (Boliger, kategorier, Finn på PC)
   - `FinansHub v2.dc.html` (Innstillinger → Boliger)
   - `FinansHub Mobil v2.dc.html`
   - `Matplan.dc.html`
   - `App-ikon.dc.html`
3. App-ikonet med alle varianter og oppsettet for Xcode og Android ligger i `app-icon/` (se `app-icon/README.md`).
4. Brukerens ordrette ønsker står i `prompts/prompt-01.md` til `prompt-10.md`. Er noe uklart, gjelder det brukeren skrev.
5. Lag en plan med oppgaver før du skriver kode. Gjør én del om gangen og kjør tester og lint etter hver del. Ikke slett data eller migrasjoner som finnes. Legg til nye migrasjoner.
6. Når du er ferdig: oppdater `CHANGELOG.md`, bygg release-artefaktene (APK og IPA via CI i `ci/`) og oppsummer hva som er gjort og hva som gjenstår.

---

## Utdrag: Prompt 10


Dette er de nyeste endringene. De gjelder foran eldre punkter der de sier noe annet.


- Brukerens ordrette ønsker står i `prompts/prompt-10.md`.
- **Matplan skal ligge i Homelab, ikke i Finans.** I den bygde appen står «Matplan» i sidemenyen i FinansHub, mellom Finn-handler og Innstillinger. Fjern den derfra, og fjern `/finans/matplan`-ruten.
  - Matplan er en Homelab-fane (`/matplan`) med eget API (`/api/matplan`), ikke `/finans/api/…`.
  - Det eneste som kobler Matplan til økonomi: ukekostnaden kan trekkes fra kategorien «Mat og dagligvarer». Det skjer på serveren, ikke via FinansHub-grensesnittet.
  - I mobilappen åpnes Matplan fra profilmenyen → Andre OS, og Finans-fanelinjen skjules der.
- **Faste retter per ukedag:** når en rett er åpnet i Matplan, finnes «Alltid på» med Ma–Sø. En rett kan være fast på flere dager (f.eks. taco hver fredag, fiskesuppe mandag og torsdag), og hver dag kan ha én fast rett. Faste dager legges på i denne og kommende uker, og AI eller «Lag ny for uka» endrer dem ikke. Lagres i `matplan_fixed(weekday, dish_id, cook_id)`.
- **«Ny bolig» er flyttet til Innstillinger → Boliger** i FinansHub. Der ligger skjemaet (navn, adresse, type, del med, Opprett) og en liste over boligene, med «Slett» for eiere (to trykk: Slett, så Bekreft sletting). På Boliger-siden er skjemaet byttet ut med knappen «+ Ny bolig i Innstillinger». Deling og tilgang endres fortsatt inne på hver bolig.
- **Deling av boliger er også flyttet til Innstillinger → Boliger.** Hver bolig har knappen «Deling · N». Den åpner panelet med medlemmer, roller (Eier / Kan redigere / Kan se), fjern eller forlat, og del med en ny bruker.
- **Oppsett av boligsiden ligger i Innstillinger → Boliger** («Oppsett av boligsiden»). Der er en liste over kortene (Nøkkeltall, Utgifter per måned, Kategorier, Prosjekter, Faste regninger, Legg til utgift, Utgifter) med ↑, ↓ og en vis/skjul-bryter, pluss Nullstill. Boligsiden har **ingen** «Rediger»- eller «Del»-knapp i toppen; deling skjer også bare i innstillingene. Oppsettet lagres per bruker: `user_prefs.boliger_layout = {order:[], hid:[]}`.
- **Boliger: last opp til valgt bolig, og AI-kategorier med underkategorier (PC og mobil):**
  - «Legg i bolig» (select på PC, chips på mobil) bestemmer hvilken bolig en utgift, kvittering eller transaksjon havner i. Standard er boligen du står i. Bare boliger der du kan redigere vises.
  - Kategorier har underkategorier. Standard: Strøm · Vann og avløp · Hage og uteområde (Blomster, Jord og gjødsel, Plen) · Håndverker (Snekker, Elektriker, Rørlegger) · Basseng (Pumpe og filter, Kjemikalier) · Møbler og interiør (Hagemøbler) · Reparasjon · Vaktmester (Snømåking) · Kommunale avgifter · Vedlikehold (Maling og bygg) · Forsikring.
  - Etter skanning, opplastning eller henting av transaksjon velger AI kategori og underkategori. Passer ingen, **lager AI en ny kategori** (f.eks. «Sikkerhet › Alarm» for Verisure, «Oppvarming › Ved og pellets») **eller en ny underkategori** (f.eks. «Møbler og interiør › Sofa»). Det AI har laget merkes ✦, og brukeren får en melding.
  - Innstillinger → Boliger → «Kategorier for boliger»: legg til eller fjern kategorier, legg til underkategorier (Enter) eller fjern dem, slå «✦ La AI lage nye kategorier» av og på, og Nullstill. Er bryteren av, velger AI bare blant eksisterende kategorier.
  - Datamodell: `bolig_category(id, name, color, parent_id NULL, created_by_ai bool)`. Utgiften peker på underkategorien hvis den har en. AI-kallet returnerer `{category, subcategory, is_new}` som strukturert JSON, med listen over eksisterende kategorier i prompten.
  - Kategorikortet på boligsiden viser fordelingen på underkategorier, og utgiftslisten viser «Kategori › Underkategori».
- **Finn-handler: detaljside per handel.** Klikk på en handel for å åpne fire kort:
  - **Annonsen:** lim inn finn.no-lenken. Med «✦ Hent annonsen» henter serveren siden og lagrer tittel, pris, sted, beskrivelse og *alle bildene* lokalt (`finn_ad` + filer under `/data/finn/<finnkode>/`). Kopien beholdes selv om annonsen slettes. Mangler lenken, brukes Finn-koden fra e-postene. Annonsen kan også lastes opp som PDF eller skjermbilde. Henting skjer på serveren (ikke CORS i nettleseren), med rate-limit og respekt for robots.txt; AI trekker ut feltene til strukturert JSON.
  - **Original kvittering:** legg ved PDF, bilde eller .eml (flere filer), og fjern dem.
  - **E-poster i handelen:** alle e-poster i Proton Mail (via Bridge, IMAP) som inneholder Finn-koden eller varenavnet og kommer fra FINN, Posten/Bring, Tillit eller motparten, kobles automatisk til handelen og vises kronologisk med en utvidbar tekst. Manuelle .eml-filer kan legges til.
  - **Bilder:** last opp flere bilder (ved mottak eller før sending), med miniatyrer og fjern.
  - Listen viser et sammendrag per handel: «5 e-poster · kvittering ✓ · annonse lagret · 3 bilder».
- **Finn i mobilappens fanelinje (Finans), design 2a (valgt):** standard faner er Oversikt · Liste · **Finn** · Søk · Mer. Finn tar plassen til Budsjett, som er skjult som fane og ligger øverst under Mer. Budsjett kan slås på igjen i navbar-redigeringen. Se `design/Finn Mobil.dc.html` (komponent) og `design/Finn Handler Varianter.dc.html` (#2a).
  - **Liste:** netto i år med månedsstolper og linjer for kjøpt og solgt, «N på vei» som kort du blar sidelengs i (bilde, beløp, 4 sporingspunkter, «Neste: …»), filteret Alle/Kjøpt/Solgt/Fullført og et rutenett med 2 kolonner (bilde, statuspille, beløp). Søk i toppen.
  - **Handel:** stort bilde (egne bilder eller bildene fra annonsen; trykk for neste bilde), rolle og Finn-kode, tittel og beløp, oransje statuskort med sporingspunkter, tre fliser: Kvittering (last opp) · Annonse (✦ hent fra Finn) · Bilder (last opp), kvittering i papirstil (varepris, frakt, gebyr, total) og en tidslinje med steg og e-poster (trykk for å åpne; «+ Legg ved e-post»).
  - Stegene er Betalt → Sendt → Mottatt → Godkjent ved kjøp, og Solgt → Sendt → Levert → Utbetalt ved salg.
- **Nytt app-ikon (Homelab):** et tak over tre stigende søyler, på oransje gradient. Alle filer og oppsett ligger i `app-icon/` (se `app-icon/README.md` og `design/App-ikon.dc.html`).
  - iOS: Icon Composer-ikon med Standard, Mørk, Tonet og Klar (Liquid Glass), så ikonet støtter Tilpass på hjem-skjermen.
  - Android: adaptivt ikon (bakgrunn + forgrunn + **monochrome**), så «Tematiske ikoner» i Material You virker. PWA-manifestet får `maskable` og `monochrome`.
- **Sidemenyen i FinansHub skal være:** Oversikt, Transaksjoner, AI-søk, Kvitteringer, Budsjett, Faste utgifter, Kontoer, Aksjer, Rapporter, Subscription OS, Boliger, Finn-handler, **Import**, Innstillinger. Import manglet i den bygde appen.

