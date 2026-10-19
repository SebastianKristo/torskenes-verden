# Mobil: logoer på Integrasjoner

Fasit: `Mobil Papir App.dc.html` → `ILOGO` / `ilg()` (Innstillinger → Integrasjoner, både listen og detaljsiden).

- Hver integrasjon viser tjenestens **ekte logo** i stedet for bokstavmerket: hvit rute 34×34, radius 10, tynn innerkant `rgba(27,26,23,.08)`, logo 22 px sentrert.
- Kilde: favicon via `https://www.google.com/s2/favicons?sz=128&domain=…` (i produksjon: last ned én gang og cache på Homelab, samme som andre logoer).
- Domener: Home Assistant `home-assistant.io` · Kalendere `calendar.google.com` · Entur `entur.no` · Mybring `bring.no` · PostNord `postnord.no` · ParcelsApp `parcelsapp.com` · Trading 212 `trading212.com` · Kvitteringer på e-post `proton.me` · Finn `finn.no` · Gemini `gemini.google.com` · Cloudflare `cloudflare.com` · Kartverket `kartverket.no` · Ikoner `iconify.design`.
- MET / Yr: bruk den opplastede `yr-logo.png`, som fyller hele ruten (34 px).
- Bankimport har ingen enkelt-logo og beholder merket «BK».
- Fallback: lastes ikke logoen (eller gir favicon-tjenesten bare standardgloben), vis det fargede bokstavmerket som før. I native: bruk bokstavmerket som placeholder mens bildet lastes.

## Sjekkliste (fortsatt feil i appen 19.10 kl. 17:39)
- [ ] Listen **Innstillinger → Integrasjoner** (alle grupper: Smarthjem, Transport og pakker, Økonomi, AI, Informasjon, Annet) viser logo, ikke bokstavmerke.
- [ ] Detaljsiden for hver integrasjon viser samme logo øverst.
- [ ] Logoene hentes én gang og caches på serveren (`/api/logo?domain=…`), så de vises uten nett.
- [ ] Bokstavmerket vises bare til logoen er lastet, eller hvis den feiler.
- [ ] Samme siden skjuler bunnmeny og skann-knapp (se `claude-code-innstillinger-uten-navbar.md`).
