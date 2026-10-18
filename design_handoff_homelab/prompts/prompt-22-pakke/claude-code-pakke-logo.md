# Til Claude Code: Pakkekortet på Hjem mangler logo (viser «Bring» som tekst)

## Symptom
Kortet øverst på Hjem («REGISTRERT · Bring · 0750 · 13 til ›») viser en grønn firkant med ordet «Bring» i stedet for logoen. Tittelen er også fraktselskap + del av sporingsnummer, ikke hva pakken er.

## Fasit (`Mobil Papir App.dc.html` → Hjem → «Hent i dag»-kortet, og Sporing)
- **Logo** 52×52, `border-radius: 14px`, hvit bakgrunn, `1px solid var(--line)`, bildet `object-fit: contain` med cirka 14 % padding.
- **Rekkefølge for logo:** 1) **butikken** pakken kommer fra (Komplett, Elkjøp, Zalando …), 2) **fraktselskapet** hvis butikken er ukjent, 3) bokstav-reserve med selskapets farge.
- Fraktselskapets logo vises i tillegg som liten merkelapp (18×18, rund, hvit kant) nede til høyre på logoen når butikken vises.
- **Tittel:** varenavn eller butikk (`Komplett · skjerm`). Bare hvis begge mangler: `Pakke fra Bring`. Ikke vis sporingsnummer i tittelen. Det vises i detaljene.
- **Høyre side:** «13 til ›» betyr 13 pakker til. Skriv `+12 pakker ›` (antall minus denne), eller `13 pakker ›` hvis kortet er en samleoppføring.

## Fiks
1. Bruk felles `<Logo name=… domain=… size=52>` fra `claude-code-logoer.md` / `claude-code-logobibliotek.md`. Ikke tegn egne tekstfirkanter for fraktselskap.
2. Fraktselskap → domene: `Bring → bring.no`, `Posten → posten.no`, `PostNord → postnord.no`, `DHL → dhl.com`, `Helthjem → helthjem.no`, `Instabox → instabox.io`, `Budbee → budbee.com`, `UPS → ups.com`, `FedEx → fedex.com`, `GLS → gls-group.com`, `DB Schenker → dbschenker.com`, `Porterbuddy → porterbuddy.com`.
3. Butikk fra e-post (avsenderdomene), Finn-handel eller ParcelsApp `shop`-felt. Lagre som `package.shop_domain`.
4. Logo-filene ligger i det interne biblioteket (`backend/logos/files/`), så de vises offline.
5. Samme komponent brukes på Hjem, i Sporing-listen, i pakkedetaljer og i widgeten.

## Test
Pakke fra Bring uten butikk → Bring-logo, tittel «Pakke fra Bring». Komplett-pakke via PostNord → Komplett-logo med liten PostNord-merkelapp, tittel «Komplett · skjerm». Ukjent fraktselskap → bokstav-reserve, ingen tom boks.
