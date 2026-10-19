# AI-søk (FinansHub): ta med abonnementer og forstå hva de inneholder

Vedlegg: AI-søk «har jeg et abonement for musikk» → «Nei, det er ikke oppført noen abonnement for musikk i grunnlaget [n].» Brukeren har **YouTube Premium** i Subscription OS (inkluderer YouTube Music). Treffene under var tilfeldige transaksjoner (Thomann, Seb DNB, Sp Dbrand, Notion Student).

## Feil
1. AI-søket henter bare transaksjoner, kvitteringer og varelinjer. **Subscription OS er ikke med i grunnlaget.**
2. Ingen kunnskap om hva tjenester inneholder (YouTube Premium = reklamefritt + YouTube Music).
3. Svaret viser rå kildemarkør «[n]».
4. Treff under 70 % likhet vises som om de var relevante.

## Fiks
### Kilder i grunnlaget (RAG)
- Legg til **abonnementer** fra Subscription OS som egen kilde: `{type:'abonnement', navn, pris, intervall, neste trekk, kategori, status (aktiv/prøve/pauset/avsluttet), inkluderer[]}`. Aktive abonnementer og prøveperioder hentes **alltid** inn når spørsmålet nevner abonnement, tjeneste, betaler for, strømming, musikk, film/TV, lydbok, trening, sky/lagring eller programvare.
- Rangering: abonnementer > transaksjoner med samme selger > øvrige. Kutt treff under 0,70 likhet (vis «Ingen flere sikre treff»).

### Kunnskap om tjenester (lokal tabell, oppdateres i appen)
```
YouTube Premium → video uten reklame, YouTube Music (musikk)
Spotify, Tidal, Apple Music, Deezer → musikk
Apple One → musikk, TV+, iCloud+, Arcade
Amazon Prime → video, Prime Music (begrenset), frakt
Netflix, HBO Max/Max, Disney+, Viaplay, TV 2 Play, NRK (gratis) → film/TV
Storytel, BookBeat, Audible → lydbøker
iCloud+, Google One, Dropbox → lagring
ChatGPT Plus, Claude Pro → AI
```
- Spørsmål om en **kategori** («musikk», «strømming») matcher abonnementer via `inkluderer[]` og ikke bare navnet.
- Transaksjoner fra kjente selgere (f.eks. «GOOGLE *YouTubePremium», «Spotify P…») kobles til abonnementet.

### Svar
- Eksempel: «**Ja.** Du har **YouTube Premium** (139 kr/mnd, neste trekk 3. nov), som inkluderer YouTube Music.» Under: kort med abonnementet (logo, pris, neste trekk, «Åpne i Abonnement ›»).
- Har brukeren flere, list alle. Har brukeren ingen: «Nei, jeg finner ingen musikkabonnement i Abonnement eller i transaksjonene de siste 12 månedene.»
- Fjern kildemarkører som «[n]» og «[1]» fra teksten. Kilder vises som rader under svaret.
- Prompt til modellen: «Bruk bare grunnlaget. Abonnementer med inkluderer[] teller som treff på kategorien. Svar Ja/Nei først.»

### Test
- «har jeg et abonnement for musikk» → Ja, YouTube Premium (YouTube Music).
- «hva betaler jeg for strømming» → liste over film/TV- og musikkabonnementer med sum per måned.
- «betaler jeg for lagring» → iCloud+/Google One hvis de finnes.
