# Now Brief: velg hvilke kort som er med (Innstillinger)

Fasit: `Glimt Brief.dc.html` (mode `settings`, vist i `Innstillinger Web.dc.html` → Glimt, og i ⚙-arket i briefen). Seksjon **INNHOLD I BRIEFEN**, under «Briefer gjennom dagen».

## Funksjon
- Liste over alle kort briefen kan vise: Vær, Kalender, Dagens fokus, Huskeliste · 3 viktigste, Min reise, Regninger denne uka, Nytt i kveld, Nyheter, Pakker, Homelab-status, Domener og SSL. Nye korttyper legges automatisk til nederst (av som standard).
- Hver rad: pil opp/ned (flytt), tittel + kilde, bryter på/av. Hele raden slår av/på. Skjulte kort vises dempet (45 %).
- Teller øverst til høyre: «8 av 11 på».
- «Tilbakestill» setter standard utvalg og rekkefølge.
- Mobil: i tillegg dra-for-å-flytte (langt trykk på raden), haptikk ved flytt og bryter.
- Standard på: Vær, Kalender, Dagens fokus, Huskeliste, Min reise, Regninger, Nytt i kveld, Nyheter. Av: Pakker, Homelab-status, Domener og SSL.

## Lagring og bruk
- Lagres per bruker på serveren (`brief_cards: [{key, on}]` i rekkefølge), synkes mellom mobil, web og widgets. Lokal cache for rask visning.
- Briefen bygges fra denne lista: bare kort med `on`, i lagret rekkefølge. Gjelder morgen-, dags- og kveldsbrief, Hjem-kortet og widgets.
- Glimts oppsummering og opplesning tar bare med skrudde-på kort.
- Kort brukeren ikke har tilgang til (Homelab/Domener/Aksjer styres per bruker i Brukere og familie) vises ikke i lista.
- Henger sammen med `claude-code-brief-kort-lastes-straks.md`: lista avgjør hvilke kort som får plass fra første bilde.

## Test
- Skru av Regninger, flytt Min reise øverst → briefen på mobil og web viser endringen uten omstart.
- Tilbakestill → standard.
- Barn-bruker ser ikke Homelab/Domener i lista.
