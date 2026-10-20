# Huskeliste på web: 1a (sidemeny + detaljer) med 1b (tavle) som visning

Ønske 2026-10-20: «velg 1a og 1b som en tilleggs view» (bakgrunn: web-versjonen var mobil-oppsettet i én smal kolonne, `vedlegg/huskeliste-web-na.png`)

Fasit: `Huskeliste Web Design.dc.html` → **2a** (1a og 1b finnes der som referanse). **Bygget inn:** `Huskeliste.dc.html` med `mode="web"` (brukt av `Homelab Papir Web.dc.html` → Huskeliste, uten `max-width: 760px`). Mobil bruker fortsatt `mode="page"`.

## Oppsett (≥ 1000 px)
- **Sidemeny 240 px** (fast i begge visninger): tittel «Huskeliste» (Newsreader 34) med «Hjem, handel og hytta», lister med fargeprikk og antall (Alle · Mine · Jobb · Hjem · Handel · Hytta · Arkiv), PERSONER med initial og antall, «+ Ny liste» nederst.
- **Visningsbryter** øverst til høyre: **≡ Liste** (standard) · **▥ Tavle**. Valget huskes (`huske_web_view`).

### Liste (1a)
- **Midten:**
  - Glimt-felt (⌘K)
  - tittel på valgt liste + personfilter (Alle · Meg · Ingrid · Pål)
  - grupper: I DAG OG FORFALT (rød), I MORGEN, SENERE DENNE UKA, UTEN DATO
  - Rad: avkrysning i listefarge · navn · frist/klokkeslett/deler · liste-merke · person.
  - «+ Ny oppgave i {liste}» nederst.
- **Høyre 340 px:**
  - VALGT: oppgaven du har trykket på, med liste, hvem, frist, deloppgaver og knappene ✓ Ferdig · I morgen · Påminn.
  - Under: ✦ GLIMT-forslag (like gjøremål, forfalte osv., med reglene i `claude-code-gjoremal-glimt-forslag.md`).

### Tavle (1b)
- Midten og høyre slås sammen.
- Øverst: Glimt-felt + bryter, og en linje med Glimt-forslag.
- **Alle:** én kolonne per liste. **Én liste valgt:** én kolonne per person.
- **Kort:** avkrysning, navn, frist (rød hvis forfalt), deler «0/3», person. Dra kort mellom kolonner: da endres liste (eller person), med haptikk/skygge som Hjem-wiggle (`claude-code-hjem-wiggle-scroll-ark.md`). «+ Legg til» nederst i hver kolonne.

## Mindre skjermer
- 760–1000 px: sidemenyen blir ikon-skinne (56 px), og høyrepanelet åpnes som ark når en oppgave trykkes.
- < 760 px: mobil-oppsettet som i dag.

## Tastatur
`⌘K` Glimt · `N` ny oppgave · `L`/`T` bytt visning · `↑↓` flytt valg · `Mellomrom` kryss av · `E` rediger · `Delete` arkiver.
