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

## Oppsett i Innstillinger → Domener (2026-10-20)
Ønske: «for google search console først må jeg kunne legge de til å sette de opp i domener i innstillinger. vis gode instrukser for det bak et ?»
- Fasit: `Innstillinger Web.dc.html` → Domener → ny seksjon **GOOGLE SEARCH CONSOLE** (over «Legg til domene») med **?**-knapp.
  - Ikke koblet: «Klikk, visninger og søkeord fra Google» + **Koble til med Google** (OAuth, `webmasters.readonly`).
  - Koblet: konto + «3 eiendommer · kun lesetilgang» + **Koble fra**. Én rad per eiendom: **Bruk** (domenet finnes) / **✓ I bruk** (grønn) / **+ Legg til** (legger domenet til med kilde Google Search Console).
  - «Statistikk fra» i Legg til domene får valget **Google Search Console** (ingen token, bruker Google-tilkoblingen).
- **?** åpner samme sideark som Cloudflare-guiden, men med GSC-innhold (`GSTEPS`):
  1. Åpne Search Console og logg inn
  2. Legg til eiendom → «Domene»
  3. Bekreft med DNS (TXT-post i Cloudflare, eller «Legg inn for meg» hvis tokenet har DNS:Edit)
  4. Trykk «Bekreft» (minutter til 24 t, TXT må bli liggende)
  5. Koble til Homelab (godta «Se Search Console-data»)
  6. Velg domenene (16 mnd hentes)

  Gul merknad om lesetilgang og myaccount.google.com/permissions.
- «Legg inn for meg»: `POST /api/domains/:d/gsc/verify` → hent token fra Site Verification API (`siteVerification` scope), lag TXT via Cloudflare API, kall `webResource.insert`, poll til bekreftet.
- Søk i Innstillinger: «search», «google», «gsc» leder hit.

## Hent domener fra Search Console (2026-10-20)
ønske: «få lagt til i domener at jeg kan hente inn domener og statistikk fra google search console ved siden cloudflare»
- **Alle domener** → ny seksjon **HENT DOMENER · Fra Cloudflare og Google Search Console** med fanene *Search Console* / *Cloudflare*.
  - Search Console: lister alle eiendommer (`GET /webmasters/v3/sites`), én rad per domene med tilgangsnivå (eier / full / begrenset). `sc-domain:x` og `https://x/` slås sammen til ett domene.
  - Cloudflare: lister sonene (`GET /zones`) med plan og status.
  - Hver rad: **+ Legg til** eller **✓ Lagt til**, og nederst **Legg til alle N**. Ikke koblet: kort med «Koble til med Google» / «Legg til token».
- Domene lagt til fra GSC får kilde **Google Search Console**: Publikum viser GSC-seksjonen. Oppetid, SSL og WHOIS kommer fra Overvåking automatisk. Trafikk, DNS og sikkerhet viser «Krever Cloudflare» med knapp for å koble til.
- Finnes domenet i begge: én rad, begge kilder brukes (Cloudflare for trafikk, GSC for søk).
- «Legg til domene»-skjemaet får kilden «Google Search Console» med hjelpetekst (fasit `SRC_HELP`).
- Synk hver natt kl. 06:00: nye eiendommer/soner vises som «Nytt i kontoen» (ikke lagt til automatisk).
- Fasit: `Homelab Domener Papir.dc.html` → `impVals()`.

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
