# Handoff: FinansHub – redesign med tre temaer

## Overview
Redesign av FinansHub (personlig økonomi-app, norsk UI). Dekker 11 sider: Oversikt, Transaksjoner, AI-søk, Kvitteringer, Aksjer, Boliger, Finn-handler, Import, Subscription OS, Kontoer, Innstillinger. Brukeren kan velge mellom tre temaer under **Innstillinger → Utseende**, og sidemenyen kan kollapses til bare ikoner.

## About the Design Files
Filene i denne mappen er **designreferanser laget i HTML** – en prototype som viser tiltenkt utseende og oppførsel, ikke produksjonskode. Oppgaven er å **gjenskape designet i den eksisterende FinansHub-kodebasen** med dens etablerte rammeverk, komponenter og mønstre. Finnes det ingen kodebase, velg et passende rammeverk (f.eks. React + CSS-variabler).

Åpne `FinansHub app.dc.html` direkte i en nettleser (krever `support.js` i samme mappe). Markup ligger i `<x-dc>`-blokken, all data/logikk i `class Component` nederst (temaer, ikoner, transaksjoner, sideliste).

## Fidelity
**High-fidelity.** Farger, typografi, avstander, radier og interaksjoner er endelige. Gjenskap pikselnært. All tekst/copy er endelig (norsk) og skal brukes ordrett.

## Tema-arkitektur (viktigst)
Alle komponenter refererer til semantiske tokens – aldri faste farger. Implementer som CSS-variabler på rot (`[data-theme="lys|mork|glod"]`) eller tilsvarende theme-provider. Valgt tema lagres per bruker (prototypen bruker localStorage-nøkkel `finanshub-app-v1` med `{page, theme, col}`).

### Tokens per tema

| Token | Lys hovedbok (`lys`) | Mørk hovedbok (`mork`) | Glød (`glod`) | Bruk |
|---|---|---|---|---|
| bg | #f4f1ea | #121210 | #16110e | Sidebakgrunn |
| side | #ece7dc | #0d0d0c | #120e0b | Sidemeny |
| surf | #faf8f3 | #1a1a17 | #221a15 | Kort |
| surf2 | #ece7dc | #24231f | #2c221c | Sekundær flate, chips, hover |
| line | #e2ddd2 | #2a2925 | #2c221c | Kortkanter, skillelinjer |
| line2 | #d9d3c6 | #34322d | #3a2d25 | Input-/knappekanter |
| ink | #1c1b19 | #ece8df | #f3ebe3 | Primærtekst |
| muted | #5c5850 | #a8a294 | #b3a597 | Sekundærtekst |
| faint | #8a8478 | #8a8478 | #9c8f84 | Labels, datoer |
| acc | #1f4d3a | #6fbf8e | #ffb547 | Aksent, primærknapp |
| accInk | #f4f1ea | #121210 | #16110e | Tekst på aksent |
| pos | #2f7a4f | #6fbf8e | #7ee2a8 | Positive tall |
| posSoft | #dfe9e1 | #17271e | #16271d | Positiv bakgrunn/pill |
| neg | #c8553d | #e07a5f | #ff8f73 | Negative tall |
| warn | #c8553d | #e07a5f | #ff7a59 | Badge, varsler |
| warnSoft | #f3e3d9 | #2a1c15 | #3a2418 | Varsel-bakgrunn |
| note | #b4462f | #e8957d | #ffb547 | AI-notater «✦ …» |
| blue / blueSoft | #2f5d8a / #dde6f0 | #8fb3dc / #16202b | #8fb6ff / #1c2634 | |
| purple / purpleSoft | #5b4a8a / #e6e0ef | #b3a3e0 / #1f1a2a | #c3a8ff / #271d33 | |
| navAct | #f8f5ee | #1f1e1b | #2c221c | Aktivt menypunkt |
| badgeInk | #fff | #121210 | #16110e | Tekst på badge |
| card2 / card2Ink / card2Mute | #1c1b19 / #f4f1ea / #a39d90 | #ece8df / #121210 / #5c5850 | #ff7a59 / #16110e / #4a2618 | Bankkort (DNB) |
| revBg / revMute / revWarn | rgba(255,255,255,.08) / #b9cdbf / #f2b8a6 | rgba(0,0,0,.08) / #24402f / #7a2814 | rgba(22,17,14,.08) / #4a3510 / #8a2a10 | «Trenger gjennomgang»-kort (på acc) |
| display font | Instrument Serif 400 | Instrument Serif 400 | Bricolage Grotesque 600 | Titler, store tall |
| ui font | Geist | Geist | Bricolage Grotesque | Brødtekst |
| mono font | Geist Mono | Geist Mono | DM Mono | Beløp, datoer, labels |
| radius r / r2 | 18px / 12px | 18px / 12px | 24px / 16px | Kort / knapper, input |

Kategorifarger (felles): Mat og dagligvarer #e8833a · Restaurant og kafé #e0b33a · Transport og lading #4a8fe0 · Bolig #9a7be0 · Hjem #3fa7d6 · Fritid og hobby #3fbf8a · Abonnementer #e05a7a · Skole #b5c73a · Annet/Sparing/Overføring #8a8a8a · Inntekt #3fbf6a.

Fonter (Google Fonts): Instrument Serif, Geist 400/500/600, Geist Mono 400/500, Bricolage Grotesque 400–800, DM Mono 400/500.

## App-skall
- **Sidemeny**: 264px bred (kollapset 72px, transition width .2s), `side`-bakgrunn, høyre kant `line`, sticky full høyde, `overflow-y:auto`. Padding 22px 14px 18px.
  - Logo: 38×38 kvadrat, radius r2, bakgrunn acc, linjediagram-ikon i accInk; tekst «Finans» 600 19px + «Hub» 400 i faint.
  - Label «GENERELT»: mono 11px, letter-spacing .12em, faint.
  - Menypunkt: 15px/500, padding 11px 12px, radius r2, ikon 20px (stroke 1.7). Aktiv: bg navAct, tekst ink, ikon acc. Inaktiv: muted / ikon faint. Kollapset: sentrert, padding 11px 0, kun ikon med `title`.
  - Kvitteringer-badge «2»: 22px sirkel, warn/badgeInk. Kollapset: 9px prikk øverst til høyre for ikonet.
  - AI-MOTOR-kort nederst: «Gemini · sky» med grønn prikk (#3fbf7a), «gemini-2.5-flash» i mono. Kollapset: 44px boks med bare prikken.
- **Header**: padding 18px clamp(20px,3vw,40px), bunnlinje line. Inneholder: kollaps-knapp (36px, line2-kant), brødsmule «FinansHub › {side}», søkefelt (pill, maks 280px, krymper, «✦ AI» i note), bjelle med warn-prikk, avatar «S» (#ffcfa8) + «Sebastian Kristo Jemtland» / «Privat».
- **Innhold**: maks 1360px bred, padding 32px clamp(20px,3vw,40px) 56px, vertikal gap 24px. Sidetittel i display-font, clamp(30px,3.5vw,44px) (Oversikt: clamp(32px,4vw,52px) med dato «LØRDAG 18. OKTOBER» over). Undertittel 14px muted der det finnes.
- **Kort**: bg surf, 1px line, radius r, padding 22–30px. Korttitler i display-font 20–26px.

## Screens / Views
Se prototypen for eksakt innhold. Kortfattet per side:

1. **Oversikt** – venstre (flex 520px+): saldo-kort (Total saldo −37 489,63 kr i display clamp(44px,6vw,76px), pill «↗ 1 % mot september» pos/posSoft, tre KPI-er Inn/Brukt/Igjen av budsjett i mono 26px), «Inn og ut»-søylediagram (12 mnd, inn=acc, ut=warn, siste mnd=acc), «Siste transaksjoner» (5 rader, logo 40px r11). Høyre (flex 320px+): «Trenger gjennomgang» (bg acc, 2 kvitteringer, klikk → Kvitteringer), «Handlinger» 2×2 fliser (warnSoft/blueSoft/posSoft/purpleSoft), Kontoer (DNB-kort card2), Budsjett, Kommende trekk.
2. **Transaksjoner** – verktøyrad (søk, Alle kontoer, Inn og ut, Eksporter CSV, + Ny transaksjon), kategori-chips (filtrerer; aktiv chip = ink-bakgrunn), tabell (DATO / BESKRIVELSE / KATEGORI / KVITTERING / BELØP), header «49 transaksjoner» + «Netto −37 489,63 kr». Rad-hover surf2. Horisontal scroll under 720px.
3. **AI-søk** – maks 980px. Kort med «✦ AI-SØK · Gemini», input (1.5px acc-kant, 52px) + «Spør AI», hjelpetekst, forslag-chips. Kort «Tidligere spørsmål» med «Tøm». Enter/Spør AI legger spørsmålet øverst i historikken; forslag/historikk fyller input.
4. **Kvitteringer** – venstre: opplastingssone (stiplet), «Kø» (2, valgt = acc-kant, «Gjennomgå»-pill), «Bokført»-liste. Høyre: «Bekreft kvittering» med «● Må fylles ut», feilmelding i warn, bilde + skjema (Butikk, Dato, Total (kr) med fokus-kant acc, kategori-chips enkeltvalg, Konto, «Ingen bankmatch ennå»), knapper Les på nytt med Ollama / Avvis / Bokfør.
5. **Aksjer** – synk-linje, 4 KPI-er, porteføljegraf (pos-linje + 12 % fyll, tidsvelger 1M/3M/1 år/Alt), Fordeling (66/34-stolpe), posisjonstabell, Utbytte, Siste ordre.
6. **Boliger** – venstre liste (4 boliger, valgt = acc-kant), høyre detalj: 4 KPI-er, Utgifter per måned (tom), Kategorier, Prosjekter-skjema, Faste regninger-skjema, «Legg til utgift eller kvittering» (faner, felt, AI-hint), Alle utgifter.
7. **Finn-handler** – 3 KPI-er, handelsrad med statussteg Solgt → Sendt → Levert → Utbetalt, «Legg til fra e-post» (textarea + Les e-posten), kildenote.
8. **Import** – Velg filer, kontovalg, hint, mono-textarea, deaktivert «Importer 0 poster».
9. **Subscription OS** – faner Oversikt/Kalender, «+ Legg til abonnement». Oversikt: AI-sparing-kort (warnSoft), 233 kr/mnd + mini-kort, varsellinje, månedsstolper (valgt = acc med tooltip), Trekk denne måneden, abonnementstabell, Abonnementshelse 100/100, Forslag. Kalender: oktober-månedsrutenett med trekk markert (25 Tv2, 28 Youtube), i dag (18.) med acc-kant.
10. **Kontoer** – samlet saldo, + Ny konto, DNB-kort (card2), Sparemål.
11. **Innstillinger** – venstre seksjonsliste (13 punkter, ny: «Utseende – Tema og sidemeny»), høyre innhold. **Utseende**: tre temakort med miniforhåndsvisning bygget av temaets egne tokens; valgt = 2px acc-kant + ✓. Bryter «Kompakt sidemeny» (46×26). **Generelt**: Visningsnavn, Valuta, Måneden starter, Sparemål. Øvrige seksjoner er ikke designet (vis eksisterende innhold med nye tokens).

## Interactions & Behavior
- Tema byttes umiddelbart; bakgrunn har `transition: background .25s`.
- Sidemeny-kollaps: header-knapp og bryter i Utseende styrer samme state.
- Responsivt: kolonner bruker `flex-wrap`/`auto-fit minmax(...)` og stables under ca. 900px; brede tabeller scroller horisontalt.
- Lenker: «Se alle →» → Transaksjoner/Kontoer; «Alle →» → Subscription OS; «Innstillinger ›» og «+ Ny bolig i Innstillinger» → Innstillinger; «Se kalender →» → Kalender-fanen.

## State Management
`page`, `theme` (lys|mork|glod), `sidebarCollapsed` (lagres), samt lokal UI-state: valgt kategori-filter, AI-spørring + historikk, valgt kvittering, valgt kategori i kvitteringsskjema, aksje-tidsperiode, valgt bolig, legg-til-fane, abonnement-fane, valgt måned, valgt innstillingsseksjon.

## Assets
Ingen bildefiler. Ikoner er enkle 24×24 stroke-SVG-er (path-data i `ICONS` i logikken) – bytt gjerne til kodebasens ikonbibliotek (Lucide-ekvivalenter: layout-grid, arrow-left-right, sparkles, receipt, trending-up, home, tag, download, repeat, wallet, sliders-horizontal). Butikklogoer er plassholdere (bokstaver på merkefarge) – bruk ekte logoer fra eksisterende app. Kvitteringsbildet er en plassholder.

## Files
- `FinansHub app.dc.html` – hele prototypen (alle sider og temaer).
- `support.js` – runtime som trengs for å åpne prototypen i nettleser.
