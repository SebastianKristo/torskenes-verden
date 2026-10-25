# Finans: velg utseende på saldokortet (hold inne)

Ønske 2026-10-24: «legg til 2a, 2b og 2d som designs den kan ha, la meg velge mellom de ved å holde inne på kortet.»
Fasit: `Saldo Kort Varianter.dc.html` (2a, 2b, 2d) og `Homelab.dc.html` → Finans → saldokortet (`finSal.isStd/isGlass/isKvitt/isFarge`, `salSheet`, nøkkel `papir_salsty`).

## Utseender (samme innhold i alle: SALDO · ALLE KONTOER, saldo, ring + «Brukt i oktober · dag X av Y»)
- **Standard** (`std`, som i dag).
- **Glass** (2a): mørkt glass `rgba(27,26,23,.5)` + blur 22 / metning 1.6, hvit tekst, lys toppkant `inset 0 1px 0 rgba(255,255,255,.4)`, radius 28. Etikett `#ffd2c8`, ring `#f08a76` på 25 % hvit. iOS: `.ultraThinMaterial` + mørk tint. Android: RenderEffect blur.
- **Kvittering** (2b): kortfarge, radius 18, 2 pt stiplet skillelinje i linjefarge mellom saldo og ring, med halvsirkel-hakk (Ø 20) i bakgrunnsfarge på hver side. Pil uten sirkel.
- **Fargebunn** (2d): radius 32. Øvre del i kortfarge (radius 32/32/28/28), nederste del i merkefargen (`--lab`) med tekst og ring i `--onLab`. Skygge i merkefargen.
Alle følger tema (lys/mørk) og fargeprofil.

## Valg
- **Hold inne 0,5 s** på saldokortet → haptikk + bunnark «Utseende på saldokortet» med 2×2 forhåndsvisninger (Standard, Glass, Kvittering, Fargebunn). Valgt har rød kant og ✓. Trykk velger straks (kortet bak byttes), «Ferdig» eller trykk utenfor lukker.
- Kort trykk åpner Kontoer som før. Et langt trykk skal **ikke** også åpne Kontoer.
- Holdet på dette kortet starter ikke wiggle-modus; flytting/skjuling av kortet gjøres fra Rediger-knappen.
- Lagres per bruker (`papir_salsty`) og synkes med de andre layoutvalgene.
