# FEIL: Google Search Console er lagt til, men Domener viser ingen statistikk

Ønske 2026-10-21: «google search console er lagt til men viser ingen statistikk i domener»
Fasit: `Homelab Domener Papir.dc.html` → «Google Søk» (`gscVals()`) og `claude-code-domener-search-console.md` (oppsett, kort, perioder).

## 1. Sjekk i denne rekkefølgen (logg hvert steg i backend)
1. **Riktig eiendom.** Domenet må kobles til nøyaktig samme eiendom som i GSC: `sc-domain:kristo.no` (domene-eiendom) eller `https://kristo.no/` (URL-prefiks). Feil format gir tom respons, ikke feil.
   → Ved tilkobling: hent `GET https://www.googleapis.com/webmasters/v3/sites`, lagre `siteUrl` akkurat slik Google returnerer den, og bruk den i alle kall (URL-kodet: `sc-domain%3Akristo.no`).
2. **Tilgang.** `permissionLevel` må være `siteOwner`, `siteFullUser` eller `siteRestrictedUser`. `siteUnverifiedUser` gir ingen data → vis «Eiendommen er ikke bekreftet i Search Console».
3. **Scope.** Token må ha `https://www.googleapis.com/auth/webmasters.readonly`. Mangler den (bare `openid email`), gir `searchAnalytics.query` 403 → be om ny tilkobling.
4. **Token fornyes.** Lagre `refresh_token` (krever `access_type=offline` og `prompt=consent` første gang). Uten den virker det i én time, og etterpå blir alt tomt.
5. **Datoene.** GSC har 2–3 dagers forsinkelse. Spørring med `endDate = i dag` og bare 1t/24t gir 0 rader.
   → `endDate = i dag − 3 dager`, `startDate = endDate − 27` for «28 dager». Domener-siden må bruke GSC-periodene (7 d · 28 d · 3 mnd), ikke 1t/24t.
6. **Riktig kall:**
```
POST https://searchconsole.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
{ "startDate":"2026-09-21","endDate":"2026-10-18","dimensions":["date"],"type":"web","dataState":"all","rowLimit":25000 }
```
   Søkeord: `dimensions:["query"]`, sider: `["page"]`, totaler: uten `dimensions`.
7. **Lite trafikk.** Nye eller små domener kan ha 0 visninger. Vis da «Ingen søkevisninger de siste 28 dagene» med lenke til GSC, ikke tomme kort.
8. **Kobling i appen.** Domenet må ha kilde GSC lagret (`domains.stats_source` inneholder `gsc` og `gsc_site`). At kontoen er koblet i Innstillinger er ikke nok. Hvert domene må få «Bruk».
9. **Hentejobb.** Nattlig jobb (06:00) + «Hent nå». Sjekk at jobben kjører og skriver til `gsc_daily`, og at frontenden leser derfra og ikke fra Cloudflare-tabellen.

## 2. Hva Domener skal vise
- Koblet og data finnes: KPI-er (Klikk, Visninger, CTR, Snittposisjon), graf, søkeord, sider, «sist hentet …, data til 18. okt.».
- Koblet, men tomt: forklaring med årsak fra sjekken over (ikke bekreftet / ingen visninger / mangler tilgang / venter på første henting), og knappene **Hent nå** og **Åpne i Search Console**.
- Feil fra Google: vis meldingen kort («403 · mangler lesetilgang») og **Koble til på nytt**.

## 3. Diagnose-knapp
I Innstillinger → Domener → Google Search Console: **Test** per eiendom → viser siteUrl, tilgangsnivå, scope, siste henting, antall rader for siste 28 dager.

## Test
- kristo.no (domene-eiendom) → tall innen ett minutt etter «Hent nå».
- Bytt periode 7 d / 28 d / 3 mnd → tallene endres. 1t/24t skjuler GSC-delen med teksten «Search Console har bare dagsdata».
- Vent over en time → data er der fortsatt (refresh-token virker).
