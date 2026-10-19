# Hjem: søkefelt med valgfri søkemotor + System-AI

Fasit: `Mobil Papir App.dc.html` → Hjem → søkefeltet øverst (var «Søk på Google»).

## Søkemotor
- Trykk på ikonet til venstre (med ▾) → meny «SØK MED»:
  - **System-AI** (standard): svarer i Chat og legger til timer. Ikon: ✦ i `lab`-sirkel.
  - **Google**: åpner google.com/search.
  - **DuckDuckGo**: åpner duckduckgo.com.
- Valget lagres per bruker (`search_engine`). Plassholder følger valget («Spør AI eller skriv «time hos …»» / «Søk på Google» / «Søk med DuckDuckGo»).

## Feltet er et ekte tekstfelt
- Skriv direkte i feltet. ↵ / «Gå» på tastaturet sender.
- **Timer gjenkjennes uansett søkemotor:** teksten tolkes med samme logikk som Kalender → rask time (`claude-code-kalender-rask-time.md`). Gir den dato + intensjon («time», «avtale», «legg til», «book», «bestill» eller type som frisør/lege/tannlege …):
  - Under feltet vises et mørkt forslag: kalender-ikon · «Nina frisør» · «fre 25. sep · 14:30» · knapp **Legg i kalender**.
  - ↵ eller knappen legger den til i **bakgrunnen** (Privat, varsel 1 t før). Hint: «✦ Legger til i kalenderen …» → «✓ Nina frisør · fre 25. sep · 14:30 lagt i kalenderen».
- Ellers: System-AI → ny samtale i Chat med teksten sendt. Google/DuckDuckGo → åpner søket i nettleseren.
- **✦ AI**-knappen til høyre åpner alltid Chat-siden.
- ✕ tømmer feltet. Trykk utenfor lukker tastaturet.

## Native
- iOS: `TextField` + `.submitLabel(.go)`, meny med `Menu { … }`. Android: `OutlinedTextField` i pille + `DropdownMenu`.

## Menyen må ligge over kortene
- Søkemotor-menyen skal tegnes **over** alle kort på Hjem. Legg den i et eget overlay-lag (iOS: `.overlay`/`Menu`, Android: `DropdownMenu`/`Popup`, web: portal eller `z-index` på kortet som eier menyen). Kortene må ikke lage egne stabler med `scale`/`transform` når de ikke er i redigeringsmodus.
