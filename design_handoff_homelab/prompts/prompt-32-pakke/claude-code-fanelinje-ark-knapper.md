# «Rediger fanelinjen»: bruk appens egne Papir-knapper, ikke iOS-stil

Vedlegg: Finans → Rediger fanelinjen i den ekte iPhone-appen. Toppen har iOS-lignende tekstpiller «Avbryt» og «Ferdig» i **rød tekst** med lys bakgrunn og skygge, og tittelen i midten (SF-stil). Det er feil.

Fasit: `Mobil Papir App.dc.html` → arket `ne` (samme for Hjem, Finans, Domener, Abonnement og Familie). Felles regler: `claude-code-felles-knapper-ark.md` (`SheetButton`).

## Riktig topp
- Til venstre, under hentelinjen (40×5 px, `line`):
  - Liten etikett i Plex Mono, 10,5 px, `lab`, sperret: «FINANS · FANELINJE» (eller «HJEM · …», «DOMENER · …»).
  - Tittel under: **Rediger fanelinjen** i Newsreader 500 26 px, `ink`, venstrejustert.
- Til høyre, nederst på linje med tittelen: **Ferdig** = `SheetButton primary`: 36 px høy, radius 18, padding 0 16, bakgrunn `ink`, tekst `bg`, Manrope 700 14. Ingen kant, ingen skygge, ikke rød tekst.
- **Ingen «Avbryt»-knapp.** Endringer lagres med en gang. Ferdig lukker arket, og det gjør også et trykk utenfor eller å dra arket ned. (Trengs angre: vis toast «Endret · Angre».)
- Under: «4 av 5 faner · Mer ligger alltid sist» (12,5 px, `mut`). Ingen egen «I FANELINJA»-overskrift.

## Radene
- Ett kort (`card`, radius 20). Hver rad: ikonknapp (40 px, rund 12, `bg` + kant `line`, trykk = velg ikon) · tekstfelt for navn (`bg`, radius 14) · **↑** (rund 40 px, kant `line`, dempet på første rad) · **−** i `lab` uten bakgrunn.
- Ikke svarte ikonruter, ikke ▲/▼-par og ikke grå sirkler.
- «Mer» vises ikke som rad.

## Resten
STIL · FORHÅNDSVISNING og LEGG TIL (chips «+ Domener», «+ Media» …) som i fasiten.
- Gjelder alle ark i appen: aldri iOS-systemknapper (`.toolbar { Button("Avbryt") }`) med rød/aksentfarget tekst. Bruk `SheetButton`.
