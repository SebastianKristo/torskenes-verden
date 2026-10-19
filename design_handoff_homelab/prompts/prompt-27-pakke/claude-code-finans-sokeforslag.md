# Finans: søkeforslag mens du skriver (Google-stil)

Fasit: `Mobil Papir App.dc.html` → Finans → Søk.

## Backend
`GET /api/finans/forslag?q=bloms&limit=6` → `[{type:'butikk'|'kategori'|'vare', navn, antall, sum, ikon, farge}]`
- Kilde: alle transaksjoner (merchant-navn), kategorier og varelinjer fra kvitteringer.
- Normaliser (små bokstaver, fjern diakritiske tegn, men behold æøå).
- Score: starter med q = 4, et ord starter med q = 3, inneholder q = 2, Levenshtein ≤ 1 mot ordets start (q ≥ 4 tegn) = 1. Ved lik score: butikk før kategori/vare, så flest kjøp.
- Bruk gjerne Postgres `pg_trgm` eller SQLite FTS5 med prefix; svar under 50 ms. Cache merchant-listen i minnet.

## Klient
- Debounce 120 ms. Avbryt forrige forespørsel ved nytt tastetrykk.
- Vis ikke forslag når ✦ AI er på, når feltet er tomt eller etter at et forslag er valgt / Enter er trykket.
- Rad: ikon (merkefarge + initialer), navn der skrevet del er normal vekt og resten fet, undertekst «Butikk · 2 kjøp · −618 kr», ↖-knapp til høyre som fyller inn uten å søke. Rad min. 52 px høy, ↖ 44 px.
- Trykk på rad: søk på navnet, vis treffliste under.
- Det vanlige søket (treffliste) bruker samme uklare matching, så «blosm» også finner Blomsterlandet.
