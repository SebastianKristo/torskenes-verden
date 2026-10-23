# Subscription OS: logg over prøveperioder og alle tidligere fakturaer

Fasit: `Subscription OS.dc.html` → Historikk, ny seksjon **Logg** under «Denne måneden» (`hist.log`).

## Visning
- Overskrift «Logg» + «Eksporter CSV». Under: «N fakturaer · N prøveperioder · X kr betalt siste 12 mnd».
- Filter-chips: **Alle / Fakturaer / Prøveperioder**.
- Gruppert per måned (nyeste først) med månedssum. Viser 3 måneder, «Vis eldre (N måneder)» henter 3 til.
- Rad: logo, navn, (PRØVE-merke for prøveperioder), beskrivelse og beløp:
  - Faktura: «Faktura · 3. okt · Kredittkort» (+ «gammel pris» hvis prisen var lavere da), «−149 kr».
  - Prøveperiode startet: «gratis i N dager», «0 kr».
  - Prøveperiode avsluttet: «sagt opp i tide», «Spart 149 kr» (grønn).
  - Prøveperiode gikk over til betalt: «149 kr/mnd», «−149 kr».

## Lagring (backend)
- Ny tabell `subscription_events` (`id, user_id, subscription_id|null, service, type: charge|trial_start|trial_end|trial_converted|trial_cancelled|price_change|cancelled, amount, currency, date, account, source: bank|email|manual|glimt, raw_ref`).
- **Fakturaer:** hver bekreftet belastning fra bankimport/e-post/kvittering lagres som `charge` og knyttes til abonnementet. Ingenting slettes når et abonnement sies opp; historikken blir stående.
- **Prøveperioder:** når en prøveperiode legges til (manuelt, Glimt eller e-post) lagres `trial_start`. Ved sluttdato: `trial_converted` hvis første belastning kommer, ellers `trial_cancelled`. Fjernes prøveperioden fra Hjem-listen, beholdes loggen.
- Prisendringer lagres som `price_change` (gammel → ny pris).
- Importer eksisterende transaksjoner bakover (minst 24 mnd) ved første kjøring.

## Glimt
- Glimt kan bruke loggen: «hva betalte jeg for Adobe i fjor?», «hvilke prøveperioder har jeg hatt?», «hvor mye har jeg spart på å si opp prøveperioder?».

## Eksport
- CSV (semikolon, UTF-8): Dato, Tjeneste, Type, Beløp. Gjelder valgt filter.
