# Boliger (web): toast var en tom svart boks

Vedlegg: Boliger → Tilgang på web. Etter en endring dukket det opp en svart boks nederst uten synlig tekst.

## Årsak
Toasten brukte `background: ink` og `color: bg`. Når Boliger ligger inni FinansHub på web, er temaets `bg` gjennomsiktig (bakgrunnen kommer fra `root`), så teksten ble usynlig.

## Fiks
Fasit: `Boliger.dc.html` → toast.
- Tekstfarge `card` (lys i lyst tema, mørk i mørkt tema) på `ink`-bakgrunn. Aldri `bg`, siden den kan være gjennomsiktig.
- Teksten skal alltid si hva som skjedde: «Rolle endret · Cybele er nå Eier», «Tilgang fjernet · Rune», «Invitasjon sendt til …», «Lagret».
- Gjelder alle toaster i appen: bruk én felles `Toast`-komponent med faste farger (`ink` / `card`), 11 × 18 px innrykk, radius 20, maks bredde 90 vw, og forsvinner etter 2,2 s.
