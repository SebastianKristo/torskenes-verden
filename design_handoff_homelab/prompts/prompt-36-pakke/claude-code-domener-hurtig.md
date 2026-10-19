# Domener (web): statistikk med en gang

Ønske 2026-10-19: «i domener, nå så tar det et sekund før statistikk-delen av domener kommer opp, ha at de kommer med en gang man åpner domener på web.»

## Årsak
Domener-modulen (og dataene) lastes først når man trykker på Domener. Lasting av koden, Cloudflare-kall og Search Console gir ca. 1 s med tom flate.

## Fiks
1. **Forhåndslast modulen.** Domener-siden lastes ved oppstart av web (lazy chunk `prefetch`, eller holdes montert og skjult med `display:none`). I designet (`Homelab Papir Web.dc.html`) er Domener nå alltid montert og bare skjult.
2. **Stale-while-revalidate for data.**
   - Siste statistikk per domene og periode caches (IndexedDB/localStorage + server-cache 5 min).
   - Ved åpning vises cachen **umiddelbart**. Ferske tall hentes i bakgrunnen og byttes uten flimring (tall animeres, ingen skjelett).
3. **Forhåndshent i bakgrunnen.** Når web er lastet og ledig (`requestIdleCallback`), hentes `/api/domains/stats?per=24t` for alle domener. Ved hover på «Domener» i sidemenyen hentes det igjen hvis cachen er > 60 s.
4. **Server:** én samlet endpoint `/api/domains/overview` (KPI-er, grafer, land, sider, oppetid) i stedet for mange små kall. Cloudflare GraphQL hentes parallelt og caches i Redis/minne 5 min. Search Console caches 6 t.
5. **Ingen blokkering på AI.** Glimt-oppsummeringen lastes separat og skal aldri holde igjen KPI-er og grafer. Den viser cachet oppsummering fra i dag med en gang.
6. **Kart (land):** script/GeoJSON forhåndslastes sammen med modulen.

## Akseptkriterier
- [ ] Første klikk på Domener etter innlasting: KPI-er og grafer synlige < 100 ms (fra cache).
- [ ] Bytte domene eller periode: < 100 ms med cache, ellers diskret oppdatering uten tom side.
- [ ] Ingen skjelett/tomt felt ved normal bruk.
