# Prompt 42 – pakke til Claude Code

**Start med `prompt-42.md`.** Den har alle ønskene i rekkefølge (ordrett, med dato) og sier hvilken `claude-code-*.md` som hører til hvert punkt.

## Slik bruker du pakken
1. Les `prompt-42.md` fra toppen.
2. For hvert punkt: les tilhørende `claude-code-*.md`. Den har fasit, oppførsel og test.
3. Designfilene i `design/` er fasit for utseende og tekst. De åpnes direkte i nettleseren (`support.js` ligger ved siden av).

## Viktigste nye ting i denne runden
- **Fanelinja:** valgfri Hjem-knapp (Standard / 1a / 1b / 1c / 1d) med forhåndsvisning. Tilbake-knappen øverst følger valget. → `claude-code-navbar-hjem-knapp.md`, `design/Mobil Papir App.dc.html`, `design/Navbar Hjem-knapp Forslag.dc.html`
- **FinansHub:** egen Filter-side (butikk, kategori, bolig, beløp, måneder/uker/datoer + Glimt), avanserte Glimt-oppgaver og forbruksrapport som PDF, import fra bank rett til bolig, ny logo og fargede menyikoner, gamle design slettet. → `claude-code-finanshub-filter.md`, `claude-code-glimt-avanserte-oppgaver.md`, `claude-code-import-til-boliger.md`, `claude-code-finanshub-ny-logo.md`, `claude-code-slett-gamle-design.md`, `design/FinansHub v3 Temaer.dc.html`, `design/Forbruksrapport.dc.html`
- **Glimt-søk:** rask søkedatabase før Ollama, og «Glimt tenker … 1,4 s» med tankesteg. → `claude-code-glimt-sokedatabase.md`
- **Boliger (web):** årsbokser over fanene, Glimt-søk i boligen, kvitteringspanel med «Analyser på nytt med Glimt», alle kategorier som kort. → `claude-code-boliger-web-kontobok.md`, `claude-code-boliger-sok-scope.md`, `design/Boliger Web.dc.html`
- **Familie:** Hjemlys heter nå **Vel fremme**, Soner uten kart, ikonsøk (Lucide + Tabler via Iconify), helsekilder i Innstillinger og helsedata fra Home Assistant. → `claude-code-vel-fremme.md`, `claude-code-familie-soner-uten-kart.md`, `claude-code-familie-helsekilder-innstillinger.md`, `claude-code-helse-fra-home-assistant.md`, `claude-code-familie-fjern-hjemlys-kort.md`, `design/Familie.dc.html`
- **Feil i appen:** scroll over bibelverset, PostNord-logoen. → `claude-code-bibelvers-scroll-fiks.md`, `claude-code-postnord-logo-fiks.md`
