# Google Search Console gir ingen statistikk

Feilsøk og rett:
1. OAuth: sjekk at scope `https://www.googleapis.com/auth/webmasters.readonly` er gitt og at refresh-token fornyes.
2. Property-format: domeneegenskaper må sendes som `sc-domain:eksempel.no`, URL-egenskaper som `https://eksempel.no/` (med skråstrek). Feil format gir tomt svar.
3. Search Analytics har ~2–3 dagers forsinkelse: bruk `endDate` = i dag − 3 dager. Bruk `dataState: "all"`.
4. Hent `sites.list` og vis hvilke egenskaper kontoen har tilgang til; la brukeren koble domene → egenskap.
5. Vis faktisk feilmelding i UI (ikke bare tomt kort): «Ingen tilgang til egenskapen», «Token utløpt – logg inn på nytt» osv.
6. Logg API-svar (uten tokens) i Docker-loggen.
