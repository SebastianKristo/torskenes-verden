# Domener: statistikk fra Google Search Console

Fasit: `Homelab Domener Papir.dc.html` → seksjonen «Google Søk» (`gscVals()`), under Publikum (web) og i fanen Publikum (mobil). Bare for ett valgt domene, ikke «Alle domener».

## Ikke koblet til
- Kort: «Koble til Google Search Console», forklaring og tre steg (logg inn → velg eiendom `sc-domain:{domene}` → 16 måneder hentes inn).
- Knapp med Google-logo: **Koble til med Google**. Under: «Kun lesetilgang · webmasters.readonly».

## Koblet til
- Periode: 7 dager · 28 dager (standard) · 3 mnd. Egen velger, fordi GSC har dagsdata med 2–3 dagers forsinkelse (1t/24t gir ikke mening).
- KPI-kort (farget topplinje): **Klikk** (blå) · **Visninger** (lilla) · **CTR** (grønn) · **Snittposisjon** (oransje, «Lavere er bedre»). Endring mot forrige periode i grønt/oransje.
- Graf: klikk (blå) og visninger (lilla) per dag, hver skalert for seg.
- **Søkeord** (topp 8): søk · klikk · visninger · posisjon (≤ 3 grønn, ≤ 10 svart, ellers oransje).
- **Sider i søk** (topp 6): sti · klikk · CTR.
- Bunn: «Koblet til som {konto} · sc-domain:{domene} · sist hentet i dag 06:00 · data til {dato}» + **Koble fra**.

## Backend
- OAuth 2.0 (Google Cloud-prosjekt, skop `https://www.googleapis.com/auth/webmasters.readonly`, `access_type=offline`, `prompt=consent`). Refresh-token krypteres og lagres per bruker.
- Eiendommer: `GET https://www.googleapis.com/webmasters/v3/sites` → match `sc-domain:{domene}` eller `https://{domene}/`. Flere treff → la brukeren velge.
- Data: `POST https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query`
  - Per dag: `{startDate, endDate, dimensions:["date"]}`
  - Søkeord: `dimensions:["query"], rowLimit: 25`
  - Sider: `dimensions:["page"], rowLimit: 25` (vis stien, ikke hele URL-en)
  - Forrige periode for endring: samme spørring for perioden før.
- Cron kl. 06:00: hent de siste 3 dagene på nytt (GSC reviderer tall) og lagre i `gsc_daily(domain, date, clicks, impressions, ctr, position)`, `gsc_query(domain, date, query, …)` og `gsc_page(…)`. Første kobling: hent 16 måneder bakover.
- Glimt-oppsummeringen (`claude-code-domener-ai-oppsummering.md`) får også GSC-tall når de finnes, f.eks. «Klikk fra Google økte 12 %. "kristo priser" er nytt på side 1.»
- Ugyldig/utløpt token: vis kortet «Koble til på nytt» med feilmeldingen.
