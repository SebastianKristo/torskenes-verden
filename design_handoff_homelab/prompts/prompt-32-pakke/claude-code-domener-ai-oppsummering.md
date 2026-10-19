# Domener: AI-oppsummering fra Glimt (mobil + web)

Fasit: `Homelab Domener Papir.dc.html` (brukes både av `Mobil Papir App.dc.html` og `Homelab Papir Web.dc.html`). Metoder: `sumFacts()`, `sumRun()`, `sumLocal()`, `sumVals()`.

## Plassering
- Kort øverst i Domener, under domene- og periodevalget, før statistikken. Vises i Oversikt (mobil: fanen «Oversikt»).
- Gjelder valgt domene, eller **Alle domener** samlet.

## Kortet
- Topp: Glimt-merket (30 px, ringen spinner sakte, og raskt mens den jobber) · «GLIMT · OPPSUMMERING» (Plex Mono, rød) · metalinje · knappen **↻ Lag ny** (pille, 36 px).
- Metalinje: «Daglig · i dag kl. 07:00 · kristo.no» eller «Laget nå kl. 14:32 · Alle domener». Mens den jobber: «Glimt leser statistikken …» og skimmer-linjer.
- Overskrift (18 px, 600): det viktigste. Varsler først (sertifikat < 30 dager, fornyelse < 45 dager), ellers «Rolig døgn …» / «Mer trafikk enn vanlig …».
- 3–4 punkter med farget prikk: grønn = positivt, oransje = nedgang, rød = sikkerhet/varsel, teal = info, grå = nøytral.
  Eksempel: trafikk + endring fra døgnet før · cache + median svartid · blokkerte trusler · neste sertifikat/frist.

## Når den lages
- **Daglig kl. 07:00** (server-cron) for hvert domene + «Alle». Lagres og vises hele dagen. Valgfritt push: «Glimt · Domener: Sertifikatet for x går ut om 12 dager» bare hvis det er noe å gjøre.
- **Manuelt:** «Lag ny» lager en ny oppsummering med en gang (siste 24 t) og erstatter dagens.
- Bytter man domene og det ikke finnes oppsummering for i dag, lages den automatisk.

## AI
- Input til modellen: tall per domene siste 24 t (forespørsler, besøkende, endring %, trusler, cache %, median ms, sertifikat-dager, fornyelse-dager), fra Cloudflare GraphQL Analytics + WHOIS/TLS-sjekk.
- Prompt: «Du er Glimt … Svar KUN med JSON {head, pts:[{t, tone: pos|neg|info|warn}]} med 3–4 punkter.»
- Fallback uten AI eller ved feil: regelbasert tekst (`sumLocal`), samme format.
- Cache: `domain_summary(domain|*, date, created_at, manual, head, points jsonb, model)`.
