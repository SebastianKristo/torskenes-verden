# Web: Gjøremål i fullskjerm

Ønske 2026-10-20: «Gjøremål skal ha full skjerm i web»
Fasit: `Homelab Papir Web.dc.html` → `isHuske` (fullskjerm-wrapper) + `huskeClose`.

- Gjøremål åpnes **alltid i fullskjerm** på web, som Chat, Økonomi og Kalender i fullskjerm: `position:fixed; inset:0`. Ingen Homelab-toppmeny, ingen skybilde-hero, ingen nyhetslinje.
- **Egen topplinje** (14 px luft, 1 px linje under): «‹ Hjem» (pille, hvit, 1 px kant) til venstre, så kicker «To-do for hele familien» (kursiv serif 13 px) over «Gjøremål» (Newsreader 26 px). Helt til høyre **✕** (40 × 40, svart, lys ✕).
- «‹ Hjem», ✕ og **Esc** går tilbake til Dashboard. Esc skal ikke lukke hvis et felt eller detaljarket er åpent (da lukker Esc det først).
- Under topplinja: hele Gjøremål-visningen (lister til venstre, liste/tavle i midten, detaljer + Glimt til høyre) med egen scroll. Bredden følger vinduet (ingen maks 1440 px), side-padding `clamp(16px, 3vw, 44px)`.
- Den store «Gjøremål / Hjem, handel og hytta»-tittelen i venstre kolonne fjernes, siden tittelen nå står i topplinja.
- Lenker til Gjøremål (meny, Hjem-widget, Glimt, ⌘K) åpner fullskjermen direkte. URL: `/gjoremal` (direktelenke virker).
