# «Rediger fanelinjen» på alle sider med egen fanelinje

Fasit: `Mobil Papir App.dc.html` → `SECN`, `secNav()`, `ne` (arket «Rediger fanelinjen»), `navDown`.

## Hvor
Samme ark som på Hjem og Finans (liste med ikon · navn · ↑ · −, STIL · FORHÅNDSVISNING, Tekst / Bare ikoner / Ikoner + navn på valgt, LEGG TIL) brukes nå også for:
- **Domener**: Oversikt · Publikum · Ytelse · Infra
- **Abonnement**: Hjem · Innsikt · Historikk
- **Familie**: Kart · Soner · Helse

## Åpne
- **Hold inne på fanelinjen** (550 ms, lett haptikk) på siden. Det åpner arket for den sidens fanelinje.
- Innstillinger → Utseende og fanelinje → ny gruppe **FANELINJE · ANDRE SIDER** med «Rediger ›» for hver.

## Regler
- Overskrift: «DOMENER · FANELINJE» / «ABONNEMENT · FANELINJE» / «FAMILIE · FANELINJE».
- Telling: «3 av 4 faner». Ingen «Mer»-fane på disse sidene, og forhåndsvisningen viser heller ingen ⋯.
- Minst 1 fane. Maks = antall faner siden har. Fjernede faner ligger under LEGG TIL.
- Nytt navn og ikon per fane (samme ikonvelger). Stil (tekst/ikoner) er felles for hele appen.
- Lagres per side: `papir_nav_dom`, `papir_nav_abo`, `papir_nav_kart` = `[{k, n?, ic?}]`. «Tilbakestill» sletter nøkkelen.
- Synkroniseres mellom enheter via brukerprofilen (samme som Hjem/Finans).
