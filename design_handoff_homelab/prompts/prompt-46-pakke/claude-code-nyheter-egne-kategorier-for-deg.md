# Nyheter: egne kategorier + personlig fane «For deg»

Fasit: `Nyhetsleser.dc.html` → Kilder og AI → ny seksjon **KATEGORIER** (`cc`), fanelinjen (`CATS` = standard + For deg + egne), filteret `fl`.

## For deg (personlig)
- Fast fane rett etter «Siste», med ✦-ikon.
- Interesser som chips (f.eks. Oslo, Bodø/Glimt, Elbil, KI), med × for å fjerne og et felt for å legge til.
- Utvalg: saker der tittel/ingress matcher en interesse, rangert av Glimt (lokal Ollama) etter interesser og lesehistorikk (åpnede saker, lesetid, kilder man åpner mest). Maks 30 saker.
- Glimt kan foreslå nye interesser ut fra hva man leser.
- Sammendrag per kategori gjelder også For deg.

## Egne kategorier
- «+ Ny kategori»: navn (påkrevd, unikt) og valgfrie nøkkelord (kommaseparert).
- Blir egen fane (ikon `lucide:tag`, kan byttes i «Ikoner på fanene») og eget valg i kildenes kategorimeny.
- En sak havner i kategorien hvis kilden står på kategorien eller tittelen inneholder et nøkkelord. Med AI-kategorisering på kan Glimt også plassere saker fra Auto-kilder i egne kategorier.
- Slett med ×: kilder som sto på kategorien settes til Auto.
- Lagres per bruker og synkes: `news_categories {id, name, keywords[], icon, order}`, `news_interests {word}`.

Gjelder mobil, iPad/Fold, web og Mac.
