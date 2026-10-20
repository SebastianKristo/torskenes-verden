# Web: Kalender i lys og mørk modus

Fasit: `Kalender.dc.html` (variant `web`), brukt i `Homelab Papir Web.dc.html` → Kalender.

## Valg
- Ny knapp i verktøylinja, rett før søk: én ikonknapp som går i ring **Auto → Mørk → Lys → Auto**.
  - Auto: halvsirkel-ikon, følger `prefers-color-scheme` og bytter live når systemet bytter.
  - Lys: sol. Mørk: måne. `title`/`aria-label`: «Tema: følger systemet» / «Tema: lys» / «Tema: mørk».
- Lagres i `localStorage['kal_theme']` (`auto` | `lys` | `mork`). Standard `auto`.
- Gjelder kun web. Mobilvarianten bruker temaet til appen den ligger i.

## Farger (CSS-variabler på kalenderens rot)
| Token | Lys | Mørk |
|---|---|---|
| `--k-bg` | `#f3efe6` | `#161513` |
| `--k-card` | `#ffffff` | `#211f1b` |
| `--k-ink` | `#1b1a17` | `#efe9de` |
| `--k-mut` | `#7a7468` | `#a49d91` |
| `--k-line` | `#d8d1c2` | `#3b3731` |
| `--k-lab` (aksent, i dag-sirkel, «+ Ny hendelse») | `#b23a2a` | `#cf5540` |

- Sett `color-scheme: dark` i mørk modus så dato-/tidsfelt og scrollbarer følger.
- Samme mørke palett som Kalender-appen (iOS/Android/Mac) så det føles likt.

## Regler
- Ingen hardkodede lyse farger i kalenderen: alle knapper som var `#1b1a17`/`#f3efe6` (Spør-knappen i søk, «Fyll ut» i Glimt-feltet) bruker `--k-ink`/`--k-bg`.
- Hendelser med tonet bakgrunn blander kalenderfargen med `--k-card` (22 %), så de blir mørke i mørk modus automatisk. Tekst = `--k-ink`.
- Månedsbrikker: tekstfarge blander kalenderfarge med `--k-ink`: 78 % farge i lys, 40 % i mørk (ellers for lav kontrast).
- Heldekkende brikker (prøve, frist, hele dagen) beholder hvit tekst i begge modi.
- Nå-linja (`#e0342a`) og slett-knappen er uendret.
- Fullskjerm i Papir web: luften øverst (8 px) ligger inne i kalenderen (`topPad`), ikke i wrapperen, så det ikke blir en lys stripe i mørk modus.
- Overgang ved bytte: ingen animasjon nødvendig, men ingen flash ved last: les `kal_theme` før første render.
