# Endringer – prompt 04 (17.10.2026): FinansHub

Ordrette ønsker: `prompts/prompt-04.md`. Opprinnelig FinansHub-spesifikasjon (datamodell, API, AI-pipeline, faser): `finanshub/README.md` + `finanshub/DESIGN.md`. **Visuelt erstattes DESIGN.md av `design/FinansHub v2.dc.html`.**

## 1. Integrasjon i homelab-siden
- Økonomi-fanen åpner FinansHub i fullskjerm (`position:fixed; inset:0`), **uten homelab-header**. Kun en rund × (44 px) øverst til høyre i FinansHub-headeren → tilbake til Hjem.
- Rute-forslag: `/finans/*` (egen app/mikrofrontend), backend `/finans/api/*`. Gammel Økonomi-fane i Homelab v2 (`ecoOld`) slettes.

## 2. Visuelt system (FinansHub v2)
- Bakgrunn `#0A0A0C`, sidebar `#0F0F12`, kort `#141418` m/ 1px `#24242A`, radius 20. Indre flater `#1B1B20`, skillelinjer `#1E1E23`.
- Tekst `#F2F2F4` / sekundær `#B9B9C2` / dempet `#8C8C96`.
- Aksent oransje `#FF7A3D` (knapper, aktiv nav-ikon, varsel), lys `#FFB08A`, mørk tekst på aksent `#1A0C04`. Positiv `#9FE3C6`, advarsel `#F2C14E`.
- Kategorifarger i `CATS0` i filen (redigerbare i Innstillinger → Kategorier).
- Fonter: **Geist** (UI) + **Geist Mono** (alle beløp, tabulære tall). Norsk tallformat `1 234,56`, minus som `−`.

## 3. Sider (alle ferdige i prototypen)
| Side | Innhold |
|---|---|
| Oversikt | 4 KPI-kort m/ sparkline/bars/gauge · Inn/ut-kurve (hover-tooltip) · kontokort-stabel · siste transaksjoner · handlinger · budsjett-stack · gjennomgangskø · kommende trekk |
| Transaksjoner | søk, filter konto/type/kategori-chips, tabell, detaljpanel (endre kategori, notat, «Lag regel», slett), «Ny transaksjon»-modal, CSV-eksport |
| Kvitteringer | opplasting/kamera (`capture="environment"`), kø m/ status, bekreft-panel (felt, kategori-chips, bankmatch, «Les på nytt med Gemini/Ollama», avvis, bokfør), bokført-liste |
| Budsjett | ring + nøkkeltall, kort per kategori m/ redigerbart beløp, farger 80 %/over |
| Faste utgifter | liste m/ av/på, sum mnd/år, trekkdagkalender |
| Kontoer | kontokort, sparemål |
| Rapporter | måned/år, donut per kategori, topp-butikker, månedstabell, CSV + PDF |
| Innstillinger | Generelt · AI-motor (Ollama/Gemini, URL, modell, nøkkel, min. sikkerhet, test) · Kategorier · Regler (`MØNSTER*` → kategori) · Bank og import (CSV-profiler DNB/Nordea/SB1/Sbanken/Bank Norwegian, PSD2 fase 3) · Varsler · Data (eksport, backup, reset) |

Prototype-state ligger i `localStorage.fh_v2`; i produksjon alt i Postgres via API (se finanshub/README).

## 4. Mobilapper – se `FINANSHUB-MOBIL.md`
- **Kun FinansHub** – ingen data fra resten av homelab.
- `design/FinansHub Mobil.dc.html`: 1a iOS 26 Liquid Glass (glassflater `backdrop-filter: blur(30px) saturate(180%)`, flytende tab bar + egen skann-knapp) · 1b Android M3 Expressive (tonal palett fra seed `#FF7A3D`, Roboto Flex, formvariasjon, Extended FAB, navigation bar m/ pill-indikator) · 1c foldable (navigation rail + list-detail, ≥600 dp).
- Native anbefaling: iOS SwiftUI (`.glassEffect()`), Android Jetpack Compose Material3 Expressive + `ListDetailPaneScaffold`. Alternativt én PWA med to temaer.

## 5. Nye hemmeligheter
`GEMINI_API_KEY`, `OLLAMA_URL`, (senere) `ENABLE_BANKING_*`. Mobil-token med finans-scope.
