# FinansHub: import fra bank rett inn i en bolig

Ønske 2026-10-20: «la meg også importere fra bank rett inn i boliger en spesifikk bolig, legg den muligheten i import-innstillinger i innstillinger i finans hub.»
Fasit: `FinansHub v3 Temaer.dc.html` → Innstillinger → **Import** (`imp`).

## Import rett til Boliger (importregler)
- Liste med regler: «Hyttekonto · Sparebank 1 → Strømstad», under: «Alle transaksjoner fra kontoen · til gjennomgang i boligen». Hver regel har av/på-bryter og Slett.
- **+ Ny importregel til bolig:** Fra bankkonto (PSD2-koblede kontoer og kort), Til bolig (boligene brukeren har tilgang til), Hvilke transaksjoner (Alle fra kontoen / Bare bestemte butikker, med kommaliste og forslag fra logobiblioteket), Når de kommer inn (Til gjennomgang der Glimt foreslår kategori / Legg rett inn).
- Når en ny banktransaksjon matcher en regel: opprett utgift i boligen (`home_id`, beløp, dato, butikk, logo, foreslått kategori). Ved «til gjennomgang» havner den i boligens «Glimt har lest …»-kort. Transaksjonen beholdes i Finans, merket «Strømstad» (lenke begge veier, ingen dobbelttelling i rapporter).
- Flere regler kan matche: den mest spesifikke vinner (butikk-regel før konto-regel).
- Tidligere transaksjoner: etter lagring tilbys «Importer også de siste 90 dagene?».

## Importer fil til en bolig
- Velg bolig + **Velg fil …** (CSV/XLSX/PDF-kontoutskrift). Samme parser som vanlig import. Alle linjer går til valgt bolig til gjennomgang.
- Også fra Boliger: «+ Legg til utgift» → «Importer fra bank/fil».

## Backend
- `import_rules(id, user_id, account_id, home_id, match_type, merchants[], mode, enabled)`.
- Kjør i PSD2-synk og fil-import. Logg i AI Kontroll / Import-historikk: «3 transaksjoner sendt til Strømstad».
