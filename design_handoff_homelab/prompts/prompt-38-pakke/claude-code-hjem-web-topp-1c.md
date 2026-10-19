# Hjem på web: «Glimt i helten» (valgt alternativ 1c)

Ønske 2026-10-20: «lag nytt oppsett for dette, vis et par alternativer» → brukeren valgte **1c**.
Skisser: `Hjem Web Topp Alternativer.dc.html` (#1c). Fasit: `Homelab Papir Web.dc.html` (dashboard-helten) + `Glimt Brief.dc.html` (`mode="glass"`).

## Oppsett
- **Helten** har **automatisk høyde** på Dashboard (ikke fast): avstand fra menyen til datoen er `clamp(56px, 6vw, 90px)`, 64 px luft i bunnen. Da blir det ikke et stort tomrom mellom menyen og hilsenen på brede skjermer.
- Venstre kolonne (flex 1, min 560 px): dato (kursiv), «God natt, Sebastian», og **Glimt-briefen som glasspanel** rett under (maks 780 px).
  - Glass: `rgba(15,30,50,.38)` + blur 18, inset-kant `rgba(255,255,255,.16)`, radius 22.
  - Innhold: Glimt-figur 44 px til venstre, «KVELDSBRIEF · GLIMT» + «Åpne ›», oppsummering (Newsreader 18/1.42, maks 3 linjer) og chips.
  - Trykk åpner hele briefen (som før).
- Høyre kolonne: temperaturen (uendret).
- **Søkefeltet** ligger over kanten av bildet (−28 px) og går over **hele innholdsbredden**. Det er ikke lenger høyrejustert til 900 px.
- Det gamle blå brief-kortet under søket er **fjernet**.
- **Siste nytt**-linjen ligger rett under søket (8 px luft).
- Smal skjerm (< 900 px): temperaturen brytes under, og glasspanelet tar full bredde.

## Siste nytt: rulletekst (som før)
- Nyhetslinjen **ruller** kontinuerlig fra høyre mot venstre (lista dupliseres, `translateX(0 → −50 %)`, lineær, sømløs loop).
- Varighet ≈ 7 s per sak (min. 30 s) delt på farten.
- Kantene fades ut med en mask (24 px venstre og 40 px høyre).
- **Pause ved hover** og ved fokus. `prefers-reduced-motion` stopper rullingen.
- Fartknapp (⏱) til høyre etter en skillestrek: 1 → 2 → 0,5 → 0 (stopp) → 1. Lagres i `hl_tick_sp`.
- Trykk på en sak åpner artikkelen. Trykk på «SISTE NYTT ›» åpner RSS-panelet.
