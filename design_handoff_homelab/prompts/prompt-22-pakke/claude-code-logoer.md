# Til Claude Code: Logoer for abonnementer, butikker og fraktselskap

Problem: Tabellen Abonnementer viser bare bokstaven for Tv2, squarespace og «Claue». YouTube og Google har logo, fordi de er hardkodet. Sporing på mobil mangler også logo for fraktselskap og butikk.

## Løsning: én felles logo-tjeneste
Lag `logo_for(navn: str) -> url | None` i backend, og `<Logo name=… size=…>` i frontend. Bruk den for abonnementer, butikker, kvitteringer og fraktselskap.

1. **Normaliser** navnet: små bokstaver, fjern «premium», «pro», «abonnement», «as», «.no» og «.com», og trim.
2. **Alias-tabell**, utvidbar i Innstillinger → Kategorier:
```
tv2 → tv2.no · tv 2 play → tv2.no · squarespace → squarespace.com
claude, claue, anthropic → claude.ai · chatgpt, openai → openai.com
youtube → youtube.com · google one → one.google.com · netflix → netflix.com
spotify → spotify.com · viaplay → viaplay.no · max, hbo → max.com
disney → disneyplus.com · icloud, apple → apple.com · microsoft 365 → microsoft.com
adobe → adobe.com · dropbox → dropbox.com · github → github.com · cloudflare → cloudflare.com
posten → posten.no · bring → bring.com · postnord → postnord.com · dhl → dhl.com · helthjem → helthjem.no
komplett → komplett.no · elkjøp → elkjop.no · power → power.no · xxl → xxl.no · ikea → ikea.com
zalando → zalando.no · clas ohlson → clasohlson.com · jula → jula.no · biltema → biltema.no
kiwi → kiwi.no · rema → rema.no · meny → meny.no · coop/extra/obs → coop.no · finn → finn.no
```
3. **Uklart treff** når det ikke er eksakt: Levenshtein ≤ 2 mot alias-nøklene, så «Claue» blir claude.ai.
4. **Domene fra data**, hvis tilgjengelig: avsenderdomenet i e-posten, nettsiden på kvitteringen eller org.nr → Brønnøysund-hjemmeside.
5. **Gjett** `<navn>.no` og så `<navn>.com`. Godta treffet bare hvis faviconet finnes og er større enn 16 px.
6. **Hent** via `https://www.google.com/s2/favicons?sz=128&domain=<domene>`. Mellomlagre bildet lokalt i `/data/logos/<domene>.png` i 30 dager, så appen virker offline og ikke lekker oppslag.
7. **Reserve:** bokstav i sirkel med farge fra navnet, som i dag.

## Visning
- Logoen står i en hvit sirkel eller firkant med 1px `--line`. Bildet er `object-fit: contain` med padding på cirka 18 %.
- Bruk `<img onerror>`, så bokstaven vises hvis bildet feiler. Unngå tom hvit boks.
- Samme størrelse overalt: 36 px i tabeller, 42 px i lister, 52 px på kort.
- La brukeren overstyre: trykk på logoen → «Velg domene» eller «Last opp logo».

## Test
Tv2, squarespace, Claue, YouTube Premium, Google One, Posten, Bring, Komplett · skjerm og en ukjent «Kiosk Hansen» (skal få bokstav).
