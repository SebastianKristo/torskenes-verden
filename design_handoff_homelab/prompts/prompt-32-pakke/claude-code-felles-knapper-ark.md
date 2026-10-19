# Felles Ferdig/Lukk-knapp + ark helt ned til bunnen

Fasit: `Mobil Papir App.dc.html`, `Abonnement Legg til ark.dc.html`, `Subscription OS.dc.html`, `Vaer.dc.html`, `Nyhetsleser.dc.html`.
Vedlegg fra bruker: «Skjermbilde»-arket i Subscription OS (tekstknapper «‹ Tilbake» / «Lukk» i rødt, arket svever med marg nederst).

## 1. Ark (bottom sheets) skal gå helt ned
- Arket ligger **kant i kant med bunnen**: `left:0; right:0; bottom:0`. Ingen marg, ingen avrunding nederst, kun `border-radius: 28px 28px 0 0`.
- Bakgrunnen fortsetter under hjem-indikatoren. Innholdet får `padding-bottom: 16px + safe-area-inset-bottom`.
- Maks høyde 92 % av skjermen. Lengre innhold scroller inni arket.
- Gjelder alle ark i appen (Legg til abonnement, Skjermbilde, Kvittering, Rediger widget, Steder osv.).
- iOS: `.presentationDetents` + `.presentationCornerRadius(28)`. Ikke legg egen `padding` rundt arket.

## 2. Én felles knapp: pille
Alle «Ferdig», «Lukk», «Avbryt» og «Tilbake» i **toppen** av ark og fullskjermvisninger bruker samme komponent `SheetButton`:

| Variant | Bruk | Stil |
|---|---|---|
| **primary** | Ferdig | høyde 36, padding 0 16, radius 18, bakgrunn `ink`, tekst `bg`, 700 14 px |
| **secondary** | Lukk · Avbryt | samme form, bakgrunn `ink` 8–10 % (lys: `rgba(27,26,23,.08)`, mørk: `rgba(255,255,255,.1)`), tekst `ink` |
| **back** | ‹ Tilbake | som secondary, chevron 16 px, padding 0 16 0 10 |

- Aldri ren tekstlenke (rød eller grå) for disse.
- Plassering: Tilbake til venstre, Ferdig/Lukk til høyre, vertikalt sentrert med tittelen.
- Treffflate minst 44×44 (usynlig utvidelse rundt pillen på 36 px).
- Mørke flater (Vær, Subscription OS): primary = hvit bakgrunn med mørk tekst.
- Store handlingsknapper nederst (48 px, full bredde) er uendret.
- Fullskjerm Yr mot Storm i Vær: ✕ er byttet til «Ferdig»-pillen.
- Lett haptikk ved lukking (se `claude-code-vaer-haptikk.md`).
